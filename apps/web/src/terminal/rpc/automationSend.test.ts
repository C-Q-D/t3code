import { it, expect } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Option from "effect/Option";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { EnvironmentId, ThreadId, WS_METHODS } from "@t3tools/contracts";
import {
  PrimaryConnectionTarget,
  AVAILABLE_CONNECTION_STATE,
  type PreparedConnection,
  EnvironmentSupervisor,
} from "@t3tools/client-runtime/connection";
import {
  terminalAutomationCommand,
  RpcPermissionGuard,
  EnvironmentRpcRequestObserver,
  type WsRpcProtocolClient,
  type RpcSession,
} from "@t3tools/client-runtime/rpc";
import {
  TerminalAutomationController,
  type TerminalAutomationTransport,
} from "../automationController";

function milestone() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it.effect.each(["resume", "reply"] as const)(
  "new human input stops queued %s at the real send boundary",
  (action) =>
    Effect.gen(function* () {
      const target = { terminalId: "terminal", terminalInstanceId: "instance", viewId: "view" };
      const binding = { bindingId: "binding", inputEpoch: 1, alias: "terminal", target };
      const state = yield* SubscriptionRef.make(AVAILABLE_CONNECTION_STATE);
      let sends = 0;
      const entered = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      const client = {
        [WS_METHODS.terminalAutomationResume]: () =>
          Effect.sync(() => {
            sends += 1;
            return {
              version: 1,
              candidateVersion: 0,
              candidates: [],
              state: { status: "bound", binding },
            };
          }),
        [WS_METHODS.terminalAutomationReplyBridge]: () =>
          Effect.sync(() => {
            sends += 1;
          }),
      } as unknown as WsRpcProtocolClient;
      const session: RpcSession = {
        client,
        ready: Effect.void,
        initialConfig: Effect.never,
        subscribeServerConfig: (input) => client.subscribeServerConfig(input),
        probe: Effect.void,
        closed: Effect.never,
        inboundFrames: Effect.succeed(0),
      };
      const activeSession = yield* SubscriptionRef.make(Option.some(session));
      const prepared = yield* SubscriptionRef.make(Option.none<PreparedConnection>());
      const supervisor = EnvironmentSupervisor.EnvironmentSupervisor.of({
        target: new PrimaryConnectionTarget({
          environmentId: EnvironmentId.make("env"),
          label: "test",
          httpBaseUrl: "https://example.test",
          wsBaseUrl: "wss://example.test",
        }),
        state,
        session: activeSession,
        prepared,
        connect: Effect.void,
        disconnect: Effect.void,
        retryNow: Effect.void,
      });
      const runPromise = Effect.runPromiseWith(yield* Effect.context<never>());
      const run = <A, E>(
        effect: Effect.Effect<A, E, EnvironmentSupervisor.EnvironmentSupervisor>,
      ) =>
        runPromise(
          effect.pipe(
            Effect.provideService(EnvironmentSupervisor.EnvironmentSupervisor, supervisor),
            Effect.provideService(RpcPermissionGuard, { authorize: () => Effect.void }),
            Effect.provideService(EnvironmentRpcRequestObserver, {
              observe: () =>
                Deferred.succeed(entered, undefined).pipe(
                  Effect.andThen(Deferred.await(release)),
                  Effect.as(Effect.void),
                ),
            }),
          ),
        );
      let receive!: Parameters<TerminalAutomationTransport["subscribe"]>[2];
      let paused = action === "resume";
      const threadId = ThreadId.make("thread");
      const transport: TerminalAutomationTransport = {
        subscribe: (start, _end, event) => {
          receive = event;
          start();
          return () => {};
        },
        registerViews: async () => {},
        replySelection: async () => {},
        reportEvent: async () => {
          paused = true;
        },
        getConnectionState: async () => ({
          version: 1,
          bindings: paused
            ? [{ status: "paused", binding, reason: "human_intervened" }]
            : [{ status: "bound", binding }],
        }),
        resume: (bindingId, inputEpoch, isCurrent) =>
          run(
            terminalAutomationCommand(WS_METHODS.terminalAutomationResume)({
              threadId,
              bindingId,
              inputEpoch,
              isCurrent: isCurrent ?? (() => true),
            }),
          ),
        replyBridge: (reply, isCurrent) =>
          run(
            terminalAutomationCommand(WS_METHODS.terminalAutomationReplyBridge)({
              threadId,
              reply,
              isCurrent: isCurrent ?? (() => true),
            }),
          ),
      };
      const controller = new TerminalAutomationController(transport);
      controller.start();
      controller.setView({
        candidate: {
          candidateId: "view",
          target,
          title: "Terminal",
          clientKind: "web",
          visible: true,
          readiness: "ready",
          capabilities: { read: true, input: true, show: true },
        },
        canOperate: () => true,
        invalidate: () => {},
        perform: async () => ({ operation: "show", status: "visible" }),
      });
      const synchronized = milestone();
      const unsubscribe = controller.subscribe(() => {
        if (controller.getSnapshot().bindings.length > 0) synchronized.resolve();
      });
      receive({ type: "ready" });
      yield* Effect.promise(() => synchronized.promise);
      unsubscribe();
      const replied = milestone();
      const originalReply = transport.replyBridge;
      transport.replyBridge = async (...args) => {
        try {
          await originalReply(...args);
        } finally {
          replied.resolve();
        }
      };
      const work: Promise<unknown> =
        action === "resume"
          ? controller.resume("binding").then(
              () => "success",
              () => "rejected",
            )
          : replied.promise;
      if (action === "reply")
        receive({ version: 1, operation: "show", bridgeRequestId: "show", binding });
      yield* Deferred.await(entered);
      yield* Effect.promise(() => controller.humanInput(target)!);
      yield* Deferred.succeed(release, undefined);
      yield* Effect.promise(() => work);
      expect(sends).toBe(0);
      controller.dispose();
    }),
);
