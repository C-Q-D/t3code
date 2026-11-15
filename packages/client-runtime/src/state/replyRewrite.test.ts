import { expect, it } from "@effect/vitest";
import { vi } from "vite-plus/test";
import {
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  DEFAULT_REPLY_REWRITE_SETTINGS,
  EnvironmentId,
  MessageId,
  REPLY_REWRITE_WS_METHODS,
  RunId,
  ThreadId,
  type AuthSessionState,
  type ReplyRewriteRecord,
  type ReplyRewriteRequestInput,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { AsyncResult, Atom, AtomRegistry } from "effect/reactivity";
import { EnvironmentRegistry } from "../connection/registry.ts";
import { EnvironmentSupervisor } from "../connection/supervisor.ts";
import { AVAILABLE_CONNECTION_STATE } from "../connection/model.ts";
import { EnvironmentRpcUnavailableError } from "../rpc/client.ts";
import type { RpcSession } from "../rpc/session.ts";
import { createReplyRewriteEnvironmentAtoms } from "./replyRewrite.ts";

vi.mock("./session.ts", () => ({
  createEnvironmentSessionAtoms: () => ({ sessionStateAtom: sessions }),
}));
const sessions = Atom.family((_environmentId: EnvironmentId) =>
  Atom.make<AsyncResult.AsyncResult<AuthSessionState, never>>(AsyncResult.initial()),
);
const env = EnvironmentId.make("destination");
const target = {
  threadId: ThreadId.make("thread"),
  runId: RunId.make("run"),
  messageId: MessageId.make("message"),
};
function completed(requestId: string, messageId = target.messageId): ReplyRewriteRecord {
  const source = { ...target, messageId, sourceHash: "a".repeat(64) };
  return {
    target: source,
    currentAttempt: null,
    lastSuccess: {
      target: source,
      requestId,
      generation: 1,
      configHash: "b".repeat(64),
      configSnapshot: DEFAULT_REPLY_REWRITE_SETTINGS,
      text: "Readable text",
      model: "gpt-6.1-terra",
      requestedServiceTier: "priority",
      actualServiceTier: "default",
      usage: null,
      completedAt: "2026-11-15T00:00:00.000Z",
    },
  };
}
const harness = Effect.fn("ReplyRewriteTest.harness")(function* () {
  const registry = yield* Effect.acquireRelease(Effect.sync(AtomRegistry.make), (registry) =>
    Effect.sync(() => registry.dispose()),
  );
  registry.set(
    sessions(env),
    AsyncResult.success({
      authenticated: true,
      auth: {
        policy: "remote-reachable",
        bootstrapMethods: [],
        sessionMethods: [],
        sessionCookieName: "test",
      },
      scopes: [AuthOrchestrationReadScope, AuthOrchestrationOperateScope],
      permissions: [AuthOrchestrationReadScope, AuthOrchestrationOperateScope],
    }),
  );
  const calls: string[] = [];
  let record: ReplyRewriteRecord | null = null;
  let acknowledged = false;
  const supervisor = {
    target: { environmentId: env, label: "destination" },
    state: yield* SubscriptionRef.make({ ...AVAILABLE_CONNECTION_STATE, phase: "connected" }),
    session: yield* SubscriptionRef.make(
      Option.some({
        client: {
          [REPLY_REWRITE_WS_METHODS.getDetail]: () => Effect.sync(() => record),
          [REPLY_REWRITE_WS_METHODS.request]: (input: ReplyRewriteRequestInput) =>
            Effect.suspend(() => {
              calls.push(input.requestId);
              return acknowledged
                ? Effect.succeed(completed(input.requestId, input.messageId))
                : Effect.fail(
                    new EnvironmentRpcUnavailableError({
                      environmentId: env,
                      message: "Reply lost after server accepted the request",
                    }),
                  );
            }),
        },
      } as unknown as RpcSession),
    ),
  } as unknown as EnvironmentSupervisor["Service"];
  const runtime = Atom.runtime(
    Layer.succeed(EnvironmentRegistry, {
      run: (_environmentId: EnvironmentId, effect: Effect.Effect<unknown>) =>
        Effect.provideService(effect, EnvironmentSupervisor, supervisor),
      followStream: (_environmentId: EnvironmentId, stream: Stream.Stream<unknown>) =>
        Stream.provideService(stream, EnvironmentSupervisor, supervisor),
    } as unknown as EnvironmentRegistry["Service"]),
  );
  const atoms = createReplyRewriteEnvironmentAtoms(runtime);
  const detail = atoms.detail({
    environmentId: env,
    input: { target, sourceText: "Original text" },
  });
  return {
    registry,
    atoms,
    calls,
    runtime,
    detail,
    setRecord: (next: ReplyRewriteRecord | null) => {
      record = next;
    },
    acknowledge: () => {
      acknowledged = true;
    },
  };
});

it.effect(
  "reuses an unconfirmed ID across remounts, then regenerates with a new ID after detail confirms it",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const h = yield* harness();
        const send = (atoms: typeof h.atoms, requestId: string) =>
          Effect.promise(() =>
            atoms.request.run(h.registry, {
              environmentId: env,
              input: { ...target, requestId, sourceText: "Original text" },
            }),
          );
        expect((yield* send(h.atoms, "first"))._tag).toBe("Failure");
        const unmount = h.registry.mount(h.detail);
        yield* AtomRegistry.getResult(h.registry, h.detail, { suspendOnWaiting: true });
        unmount();
        const remounted = createReplyRewriteEnvironmentAtoms(h.runtime);
        const detail = remounted.detail({
          environmentId: env,
          input: { target, sourceText: "Original text" },
        });
        h.registry.mount(detail);
        yield* AtomRegistry.getResult(h.registry, detail, { suspendOnWaiting: true });
        expect((yield* send(remounted, "remounted-candidate"))._tag).toBe("Failure");
        expect(h.calls).toEqual(["first", "first"]);
        h.setRecord(completed("someone-else"));
        h.registry.refresh(detail);
        yield* AtomRegistry.getResult(h.registry, detail, { suspendOnWaiting: true });
        yield* send(remounted, "another-candidate");
        expect(h.calls).toEqual(["first", "first", "first"]);
        h.setRecord(completed("first"));
        h.registry.refresh(detail);
        yield* AtomRegistry.getResult(h.registry, detail, { suspendOnWaiting: true });
        h.acknowledge();
        const result = yield* send(remounted, "regenerate");
        expect(result._tag).toBe("Success");
        expect(h.calls).toEqual(["first", "first", "first", "regenerate"]);
      }),
    ),
);

it.effect("blocks new submissions at capacity without evicting an unknown charged request", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const h = yield* harness();
      for (let index = 0; index < 128; index++) {
        yield* Effect.promise(() =>
          h.atoms.request.run(h.registry, {
            environmentId: env,
            input: {
              ...target,
              messageId: MessageId.make(`message-${index}`),
              requestId: `request-${index}`,
              sourceText: "Original text",
            },
          }),
        );
      }
      const blocked = yield* Effect.promise(() =>
        h.atoms.request.run(h.registry, {
          environmentId: env,
          input: { ...target, requestId: "overflow", sourceText: "Original text" },
        }),
      );
      expect(blocked._tag).toBe("Failure");
      expect(h.calls).toHaveLength(128);
      yield* Effect.promise(() =>
        h.atoms.request.run(h.registry, {
          environmentId: env,
          input: {
            ...target,
            messageId: MessageId.make("message-0"),
            requestId: "replacement",
            sourceText: "Original text",
          },
        }),
      );
      expect(h.calls.at(-1)).toBe("request-0");
      const reconciledTarget = { ...target, messageId: MessageId.make("message-0") };
      h.setRecord(completed("request-0", reconciledTarget.messageId));
      const detail = h.atoms.detail({
        environmentId: env,
        input: { target: reconciledTarget, sourceText: "Original text" },
      });
      h.registry.mount(detail);
      yield* AtomRegistry.getResult(h.registry, detail, { suspendOnWaiting: true });
      h.acknowledge();
      const accepted = yield* Effect.promise(() =>
        h.atoms.request.run(h.registry, {
          environmentId: env,
          input: { ...target, requestId: "overflow", sourceText: "Original text" },
        }),
      );
      expect(accepted._tag).toBe("Success");
      expect(h.calls.slice(-2)).toEqual(["request-0", "overflow"]);
    }),
  ),
);
