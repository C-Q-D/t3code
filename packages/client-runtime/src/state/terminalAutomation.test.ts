import { expect, it } from "@effect/vitest";
import { EnvironmentId, ThreadId, WS_METHODS, type AuthSessionState } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { Atom, AtomRegistry } from "effect/reactivity";
import {
  AVAILABLE_CONNECTION_STATE,
  PrimaryConnectionTarget,
  type PreparedConnection,
} from "../connection/model.ts";
import * as EnvironmentRegistry from "../connection/registry.ts";
import * as EnvironmentSupervisor from "../connection/supervisor.ts";
import type { WsRpcProtocolClient } from "../rpc/protocol.ts";
import type { RpcSession } from "../rpc/session.ts";
import * as RpcHttp from "../rpc/http.ts";
import { createTerminalEnvironmentAtoms } from "./terminal.ts";
import { runAtomCommand } from "./runtime.ts";
import { createEnvironmentSessionAtoms } from "./session.ts";

const makeHarness = Effect.fn("TerminalAutomationTest.harness")(function* (allowed = true) {
  const access = { allowed };
  const target = new PrimaryConnectionTarget({
    environmentId: EnvironmentId.make("terminal-test"),
    label: "Terminal test",
    httpBaseUrl: "https://terminal.example.test",
    wsBaseUrl: "wss://terminal.example.test",
  });
  let opens = 0;
  let closes = 0;
  const registrations: unknown[] = [];
  const client = {
    [WS_METHODS.terminalAutomationRegisterViews]: (input: unknown) =>
      Effect.sync(() => {
        registrations.push(input);
      }),
    [WS_METHODS.terminalAutomationSubscribe]: () => {
      opens += 1;
      return Stream.succeed({ type: "ready" as const }).pipe(
        Stream.concat(Stream.never),
        Stream.ensuring(
          Effect.sync(() => {
            closes += 1;
          }),
        ),
      );
    },
  } as unknown as WsRpcProtocolClient;
  const newSession = (): RpcSession => ({
    client,
    closed: Effect.never,
    initialConfig: Effect.never,
    subscribeServerConfig: (input) => client.subscribeServerConfig(input),
    ready: Effect.void,
    probe: Effect.void,
    inboundFrames: Effect.succeed(0),
  });
  const transport = yield* SubscriptionRef.make(Option.some(newSession()));
  const supervisor = EnvironmentSupervisor.EnvironmentSupervisor.of({
    target,
    state: yield* SubscriptionRef.make(AVAILABLE_CONNECTION_STATE),
    session: transport,
    prepared: yield* SubscriptionRef.make<Option.Option<PreparedConnection>>(
      Option.some({
        environmentId: target.environmentId,
        label: target.label,
        httpBaseUrl: target.httpBaseUrl,
        socketUrl: `${target.wsBaseUrl}/ws`,
        httpAuthorization: { _tag: "Bearer" as const, token: "test-only" },
        target,
      }),
    ),
    connect: Effect.void,
    disconnect: Effect.void,
    retryNow: Effect.void,
  });
  const followStream: EnvironmentRegistry.EnvironmentRegistry["Service"]["followStream"] = (
    _id,
    stream,
  ) => Stream.provideService(stream, EnvironmentSupervisor.EnvironmentSupervisor, supervisor);
  const runtime = Atom.runtime(
    Layer.mergeAll(
      Layer.succeed(EnvironmentRegistry.EnvironmentRegistry, {
        followStream,
        run: (_id, effect) =>
          Effect.provideService(effect, EnvironmentSupervisor.EnvironmentSupervisor, supervisor),
      } as EnvironmentRegistry.EnvironmentRegistry["Service"]),
      RpcHttp.layerRemoteHttpClient(async () =>
        Response.json({
          authenticated: true,
          auth: {
            policy: "remote-reachable",
            bootstrapMethods: [],
            sessionMethods: [],
            sessionCookieName: "test",
          },
          scopes: access.allowed ? ["terminal:read", "terminal:operate"] : [],
        } satisfies AuthSessionState),
      ),
    ),
  );
  const registry = yield* Effect.acquireRelease(Effect.sync(AtomRegistry.make), (registry) =>
    Effect.sync(() => registry.dispose()),
  );
  const events: unknown[] = [];
  const deliveries = yield* Queue.unbounded<unknown>();
  const automation = createTerminalEnvironmentAtoms(runtime).automation;
  const driver = automation.driver(
    target.environmentId,
    ThreadId.make("thread"),
    () => {},
    () => {
      Queue.offerUnsafe(deliveries, "ended");
    },
    (event) => {
      events.push(event);
      Queue.offerUnsafe(deliveries, event);
    },
  );
  registry.mount(driver);
  const failures = yield* Queue.unbounded<unknown>();
  registry.subscribe(driver, (result) => {
    if (result._tag === "Failure") Queue.offerUnsafe(failures, result);
  });
  const register = (
    views: Parameters<typeof automation.registerViews.run>[1]["input"]["registration"]["views"],
  ) =>
    Effect.promise(() =>
      runAtomCommand(registry, automation.registerViews, {
        environmentId: target.environmentId,
        input: {
          threadId: ThreadId.make("thread"),
          registration: { version: 1, views },
          isCurrent: () => true,
        },
      }),
    );
  return {
    registry,
    driver,
    events,
    deliveries,
    registrations,
    register,
    counts: () => ({ opens, closes }),
    transport,
    newSession,
    access,
    failures,
    sessionState: createEnvironmentSessionAtoms(runtime).sessionStateAtom(target.environmentId),
  };
});

it.effect(
  "publishes ready through the mounted automation driver with real session permissions",
  () =>
    Effect.gen(function* () {
      const h = yield* makeHarness();
      expect(yield* AtomRegistry.getResult(h.registry, h.driver)).toEqual({ type: "ready" });
      expect(h.events).toEqual([{ type: "ready" }]);
      expect(h.counts()).toEqual({ opens: 1, closes: 0 });
      const candidate = {
        candidateId: "candidate",
        target: { terminalId: "terminal", terminalInstanceId: "instance", viewId: "view" },
        title: "Shell",
        visible: true,
        readiness: "ready" as const,
        clientKind: "web" as const,
        capabilities: { read: true, input: true, show: true },
      };
      expect((yield* h.register([candidate]))._tag).toBe("Success");
      expect(h.registrations).toEqual([
        { threadId: "thread", registration: { version: 1, views: [candidate] } },
      ]);
      expect(yield* Queue.take(h.deliveries)).toEqual({ type: "ready" });
      yield* SubscriptionRef.set(h.transport, Option.some(h.newSession()));
      expect(yield* Queue.take(h.deliveries)).toBe("ended");
      expect(yield* Queue.take(h.deliveries)).toEqual({ type: "ready" });
      expect(h.counts()).toEqual({ opens: 2, closes: 1 });
      h.registry.dispose();
      expect(yield* Queue.take(h.deliveries)).toBe("ended");
      expect(h.counts()).toEqual({ opens: 2, closes: 2 });
    }),
);

it.effect("closes the old subscription and rejects reconnect after permission revocation", () =>
  Effect.gen(function* () {
    const h = yield* makeHarness();
    expect(yield* Queue.take(h.deliveries)).toEqual({ type: "ready" });
    h.access.allowed = false;
    h.registry.refresh(h.sessionState);
    expect(
      yield* AtomRegistry.getResult(h.registry, h.sessionState, { suspendOnWaiting: true }),
    ).toMatchObject({ scopes: [] });
    yield* SubscriptionRef.set(h.transport, Option.some(h.newSession()));
    expect(yield* Queue.take(h.deliveries)).toBe("ended");
    expect(yield* Queue.take(h.failures)).toMatchObject({ _tag: "Failure" });
    expect(h.events).toEqual([{ type: "ready" }]);
    expect(h.counts()).toEqual({ opens: 1, closes: 1 });
    expect((yield* h.register([]))._tag).toBe("Failure");
    expect(h.registrations).toEqual([]);
  }),
);

it.effect("rejects automation subscription without terminal permissions before opening RPC", () =>
  Effect.gen(function* () {
    const h = yield* makeHarness(false);
    expect(yield* Effect.flip(AtomRegistry.getResult(h.registry, h.driver))).toMatchObject({
      _tag: "EnvironmentAuthorizationError",
    });
    expect(h.events).toEqual([]);
    expect(h.counts()).toEqual({ opens: 0, closes: 0 });
    expect((yield* h.register([]))._tag).toBe("Failure");
    expect(h.registrations).toEqual([]);
  }),
);
