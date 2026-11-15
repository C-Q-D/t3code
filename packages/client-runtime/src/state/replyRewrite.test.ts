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
  type ReplyRewriteSubscribeInput,
  type ReplyRewriteChange,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Exit from "effect/Exit";
import * as Queue from "effect/Queue";
import * as TestClock from "effect/testing/TestClock";
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
  const started = yield* Deferred.make<void>();
  const release = yield* Deferred.make<void>();
  let hold = false;
  const supervisor = {
    target: { environmentId: env, label: "destination" },
    state: yield* SubscriptionRef.make({ ...AVAILABLE_CONNECTION_STATE, phase: "connected" }),
    session: yield* SubscriptionRef.make(
      Option.some({
        client: {
          [REPLY_REWRITE_WS_METHODS.getDetail]: () => Effect.sync(() => record),
          [REPLY_REWRITE_WS_METHODS.subscribe]: () => Stream.never,
          [REPLY_REWRITE_WS_METHODS.request]: (input: ReplyRewriteRequestInput) =>
            Effect.suspend(() => {
              calls.push(input.requestId);
              if (hold && input.requestId === "A")
                return Effect.gen(function* () {
                  yield* Deferred.succeed(started, undefined);
                  yield* Deferred.await(release);
                  return completed(input.requestId, input.messageId);
                });
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
    started,
    release,
    hold: () => {
      hold = true;
    },
    setOperate: (enabled: boolean) => {
      const state = registry.get(sessions(env));
      if (state._tag !== "Success") throw new Error("Missing test session");
      const scopes = enabled
        ? [AuthOrchestrationReadScope, AuthOrchestrationOperateScope]
        : [AuthOrchestrationReadScope];
      registry.set(
        sessions(env),
        AsyncResult.success({ ...state.value, scopes, permissions: scopes }),
      );
    },
    setRecord: (next: ReplyRewriteRecord | null) => {
      record = next;
    },
    acknowledge: () => {
      acknowledged = true;
    },
  };
});

const notificationHarness = Effect.fn("ReplyRewriteTest.notifications")(function* () {
  const registry = yield* Effect.acquireRelease(Effect.sync(AtomRegistry.make), (registry) =>
    Effect.sync(() => registry.dispose()),
  );
  const opened = yield* Queue.unbounded<{
    environmentId: EnvironmentId;
    input: ReplyRewriteSubscribeInput;
  }>();
  const closed = yield* Queue.unbounded<{ environmentId: EnvironmentId; threadId: ThreadId }>();
  const subscriptions: { environmentId: EnvironmentId; input: ReplyRewriteSubscribeInput }[] = [];
  const reads: { environmentId: EnvironmentId; input: typeof target }[] = [];
  const environments = new Map<
    EnvironmentId,
    {
      supervisor: EnvironmentSupervisor["Service"];
      connect: Effect.Effect<void>;
      disconnect: Effect.Effect<void>;
      records: Map<MessageId, ReplyRewriteRecord>;
      history: ReplyRewriteChange[];
      listeners: Set<{ threadId: ThreadId; events: Queue.Queue<ReplyRewriteChange> }>;
    }
  >();
  for (const environmentId of [env, EnvironmentId.make("other")]) {
    const scopes = [AuthOrchestrationReadScope, AuthOrchestrationOperateScope];
    registry.set(
      sessions(environmentId),
      AsyncResult.success({
        authenticated: true,
        auth: {
          policy: "remote-reachable",
          bootstrapMethods: [],
          sessionMethods: [],
          sessionCookieName: "test",
        },
        scopes,
        permissions: scopes,
      }),
    );
    const records = new Map<MessageId, ReplyRewriteRecord>();
    const history: ReplyRewriteChange[] = [];
    const listeners = new Set<{ threadId: ThreadId; events: Queue.Queue<ReplyRewriteChange> }>();
    const client = {
      [REPLY_REWRITE_WS_METHODS.getDetail]: (input: typeof target) =>
        Effect.sync(() => {
          reads.push({ environmentId, input });
          return records.get(input.messageId) ?? null;
        }),
      [REPLY_REWRITE_WS_METHODS.subscribe]: (input: ReplyRewriteSubscribeInput) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const events = yield* Queue.unbounded<ReplyRewriteChange>();
            const listener = { threadId: input.threadId, events };
            listeners.add(listener);
            yield* Effect.addFinalizer(() =>
              Effect.gen(function* () {
                listeners.delete(listener);
                yield* Queue.offer(closed, { environmentId, threadId: input.threadId });
              }),
            );
            const call = { environmentId, input };
            subscriptions.push(call);
            yield* Queue.offer(opened, call);
            return Stream.fromIterable(
              history.filter(
                (event) =>
                  event.threadId === input.threadId && event.revision > input.afterRevision,
              ),
            ).pipe(Stream.concat(Stream.fromQueue(events)));
          }),
        ),
    };
    const state = yield* SubscriptionRef.make({
      ...AVAILABLE_CONNECTION_STATE,
      desired: true,
      phase: "connected" as const,
    });
    const makeSession = () => ({ client }) as unknown as RpcSession;
    const session = yield* SubscriptionRef.make(Option.some(makeSession()));
    const supervisor = {
      target: { environmentId, label: environmentId },
      state,
      session,
    } as unknown as EnvironmentSupervisor["Service"];
    environments.set(environmentId, {
      supervisor,
      records,
      history,
      listeners,
      disconnect: SubscriptionRef.set(session, Option.none()),
      connect: Effect.suspend(() => SubscriptionRef.set(session, Option.some(makeSession()))),
    });
  }
  const forEnvironment = (environmentId: EnvironmentId) => {
    const found = environments.get(environmentId);
    if (!found) throw new Error("Missing fixture environment");
    return found;
  };
  const runtime = Atom.runtime(
    Layer.succeed(EnvironmentRegistry, {
      run: (environmentId: EnvironmentId, effect: Effect.Effect<unknown>) =>
        Effect.provideService(
          effect,
          EnvironmentSupervisor,
          forEnvironment(environmentId).supervisor,
        ),
      followStream: (environmentId: EnvironmentId, stream: Stream.Stream<unknown>) =>
        Stream.provideService(
          stream,
          EnvironmentSupervisor,
          forEnvironment(environmentId).supervisor,
        ),
    } as unknown as EnvironmentRegistry["Service"]),
  );
  const atoms = createReplyRewriteEnvironmentAtoms(runtime);
  const detail = (messageId = target.messageId, environmentId = env, threadId = target.threadId) =>
    atoms.detail({
      environmentId,
      input: { target: { ...target, messageId, threadId }, sourceText: "Original text" },
    });
  const publish = Effect.fn("ReplyRewriteTest.publish")(function* (
    revision: number,
    record: ReplyRewriteRecord,
    environmentId = env,
  ) {
    const server = forEnvironment(environmentId);
    const event = {
      revision,
      threadId: record.target.threadId,
      runId: record.target.runId,
      messageId: record.target.messageId,
    };
    server.records.set(event.messageId, record);
    server.history.push(event);
    for (const listener of server.listeners) {
      if (listener.threadId === event.threadId) yield* Queue.offer(listener.events, event);
    }
  });
  const setRead = (allowed: boolean, environmentId = env) => {
    const state = registry.get(sessions(environmentId));
    if (state._tag !== "Success") throw new Error("Missing fixture grant");
    const scopes = allowed
      ? [AuthOrchestrationReadScope, AuthOrchestrationOperateScope]
      : [AuthOrchestrationOperateScope];
    registry.set(
      sessions(environmentId),
      AsyncResult.success({ ...state.value, scopes, permissions: scopes }),
    );
  };
  return {
    registry,
    atoms,
    detail,
    opened,
    closed,
    reads,
    subscriptions,
    publish,
    setRead,
    forEnvironment,
  };
});

function queued(
  requestId: string,
  lastSuccess: ReplyRewriteRecord["lastSuccess"] = null,
): ReplyRewriteRecord {
  const success = completed(requestId).lastSuccess!;
  return {
    target: success.target,
    lastSuccess,
    currentAttempt: {
      ...success,
      status: "queued",
      requestedAt: success.completedAt,
      startedAt: null,
      finishedAt: null,
      error: null,
    },
  };
}

const watchReply = Effect.fn("ReplyRewriteTest.watch")(function* <A, E>(
  registry: AtomRegistry.AtomRegistry,
  atom: Atom.Atom<AsyncResult.AsyncResult<A, E>>,
  predicate: (value: A) => boolean,
) {
  const observed = yield* Deferred.make<A>();
  let finished = false;
  let unsubscribe = () => {};
  unsubscribe = registry.subscribe(
    atom,
    (result) => {
      if (result._tag === "Success" && !result.waiting && predicate(result.value)) {
        finished = true;
        unsubscribe();
        Deferred.doneUnsafe(observed, Exit.succeed(result.value));
      }
    },
    { immediate: true },
  );
  if (finished) unsubscribe();
  yield* Effect.addFinalizer(() => Effect.sync(unsubscribe));
  return observed;
});

it.effect(
  "discovers jobs after null, completes after the old polling window, and follows another client's regeneration",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const h = yield* notificationHarness();
        const detail = h.detail();
        h.registry.mount(detail);
        expect(
          yield* AtomRegistry.getResult(h.registry, detail, { suspendOnWaiting: true }),
        ).toBeNull();
        expect(h.subscriptions).toHaveLength(1);
        expect((yield* Queue.take(h.opened)).input).toEqual({
          threadId: target.threadId,
          afterRevision: 0,
        });
        const accepted = yield* watchReply(
          h.registry,
          detail,
          (value) => value?.currentAttempt?.requestId === "external-A",
        );
        yield* h.publish(7, queued("external-A"));
        yield* Deferred.await(accepted);
        yield* TestClock.adjust("3 minutes");
        expect(h.reads).toHaveLength(2);
        const finished = yield* watchReply(
          h.registry,
          detail,
          (value) => value?.lastSuccess?.requestId === "external-A",
        );
        yield* h.publish(13, completed("external-A"));
        yield* Deferred.await(finished);
        const regenerated = yield* watchReply(
          h.registry,
          detail,
          (value) => value?.currentAttempt?.requestId === "external-B",
        );
        yield* h.publish(21, queued("external-B", completed("external-A").lastSuccess));
        const pending = yield* Deferred.await(regenerated);
        expect(pending?.lastSuccess?.requestId).toBe("external-A");
        const replaced = yield* watchReply(
          h.registry,
          detail,
          (value) => value?.lastSuccess?.requestId === "external-B",
        );
        yield* h.publish(29, completed("external-B"));
        yield* Deferred.await(replaced);
        expect(h.subscriptions).toHaveLength(1);
        expect(h.reads).toHaveLength(5);
        expect(h.reads[0]?.input).toEqual(target);
      }),
    ),
);

it.effect(
  "shares a thread feed, refreshes only its target, isolates environments and releases the final consumer",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const h = yield* notificationHarness();
        const otherMessage = MessageId.make("message-B");
        const otherEnvironment = EnvironmentId.make("other");
        const first = h.detail();
        const second = h.detail(otherMessage);
        const remote = h.detail(target.messageId, otherEnvironment);
        const otherThread = ThreadId.make("other-thread");
        const separate = h.detail(MessageId.make("separate-thread-message"), env, otherThread);
        const stopFirst = h.registry.mount(first);
        yield* AtomRegistry.getResult(h.registry, first, { suspendOnWaiting: true });
        expect(h.subscriptions).toHaveLength(1);
        yield* Queue.take(h.opened);
        const stopSecond = h.registry.mount(second);
        yield* AtomRegistry.getResult(h.registry, second, { suspendOnWaiting: true });
        expect(h.subscriptions).toHaveLength(1);
        const stopRemote = h.registry.mount(remote);
        yield* AtomRegistry.getResult(h.registry, remote, { suspendOnWaiting: true });
        expect(h.subscriptions).toHaveLength(2);
        yield* Queue.take(h.opened);
        const stopSeparate = h.registry.mount(separate);
        yield* AtomRegistry.getResult(h.registry, separate, { suspendOnWaiting: true });
        yield* Queue.take(h.opened);
        expect(h.subscriptions).toHaveLength(3);
        const changed = yield* watchReply(
          h.registry,
          first,
          (value) => value?.lastSuccess?.requestId === "only-local-A",
        );
        yield* h.publish(4, completed("only-local-A"));
        yield* Deferred.await(changed);
        expect(h.reads.filter((read) => read.environmentId === otherEnvironment)).toHaveLength(1);
        expect(h.reads.filter((read) => read.input.messageId === otherMessage)).toHaveLength(1);
        expect(h.reads.filter((read) => read.input.threadId === otherThread)).toHaveLength(1);
        stopFirst();
        const remaining = yield* watchReply(
          h.registry,
          second,
          (value) => value?.lastSuccess?.requestId === "local-B",
        );
        yield* h.publish(9, completed("local-B", otherMessage));
        yield* Deferred.await(remaining);
        expect(h.subscriptions).toHaveLength(3);
        stopSecond();
        expect(yield* Queue.take(h.closed)).toEqual({
          environmentId: env,
          threadId: target.threadId,
        });
        expect([...h.forEnvironment(env).listeners].map((listener) => listener.threadId)).toEqual([
          otherThread,
        ]);
        expect(h.forEnvironment(otherEnvironment).listeners.size).toBe(1);
        stopRemote();
        expect(yield* Queue.take(h.closed)).toEqual({
          environmentId: otherEnvironment,
          threadId: target.threadId,
        });
        stopSeparate();
        expect(yield* Queue.take(h.closed)).toEqual({ environmentId: env, threadId: otherThread });
      }),
    ),
);

it.effect(
  "reconnects from the processed maximum revision and reads changes made while disconnected",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const h = yield* notificationHarness();
        const detail = h.detail();
        h.registry.mount(detail);
        yield* AtomRegistry.getResult(h.registry, detail, { suspendOnWaiting: true });
        expect(h.subscriptions).toHaveLength(1);
        yield* Queue.take(h.opened);
        const first = yield* watchReply(
          h.registry,
          detail,
          (value) => value?.lastSuccess?.requestId === "before-offline",
        );
        yield* h.publish(8, completed("before-offline"));
        yield* Deferred.await(first);
        yield* h.forEnvironment(env).disconnect;
        yield* Queue.take(h.closed);
        yield* h.publish(19, completed("while-offline"));
        const caughtUp = yield* watchReply(
          h.registry,
          detail,
          (value) => value?.lastSuccess?.requestId === "while-offline",
        );
        yield* h.forEnvironment(env).connect;
        expect((yield* Queue.take(h.opened)).input).toEqual({
          threadId: target.threadId,
          afterRevision: 8,
        });
        yield* Deferred.await(caughtUp);
        const latest = yield* watchReply(
          h.registry,
          detail,
          (value) => value?.lastSuccess?.requestId === "after-reconnect",
        );
        yield* h.publish(33, completed("after-reconnect"));
        yield* Deferred.await(latest);
        yield* h.forEnvironment(env).disconnect;
        yield* Queue.take(h.closed);
        yield* h.forEnvironment(env).connect;
        expect((yield* Queue.take(h.opened)).input.afterRevision).toBe(33);
      }),
    ),
);

it.effect("stops notifications on read revocation and resumes through the destination grant", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const h = yield* notificationHarness();
      const detail = h.detail();
      h.setRead(false);
      h.registry.mount(detail);
      expect(
        yield* AtomRegistry.getResult(h.registry, detail, { suspendOnWaiting: true }).pipe(
          Effect.flip,
        ),
      ).toMatchObject({ _tag: "EnvironmentAuthorizationError" });
      expect(h.subscriptions).toHaveLength(0);
      expect(h.reads).toHaveLength(0);
      h.setRead(true);
      yield* AtomRegistry.getResult(h.registry, detail, { suspendOnWaiting: true });
      yield* Queue.take(h.opened);
      expect(h.subscriptions).toHaveLength(1);
      const granted = yield* watchReply(
        h.registry,
        detail,
        (value) => value?.lastSuccess?.requestId === "while-granted",
      );
      yield* h.publish(5, completed("while-granted"));
      yield* Deferred.await(granted);
      h.setRead(false);
      expect(yield* Queue.take(h.closed)).toEqual({
        environmentId: env,
        threadId: target.threadId,
      });
      const denied = yield* AtomRegistry.getResult(h.registry, detail, {
        suspendOnWaiting: true,
      }).pipe(Effect.flip);
      expect(denied).toMatchObject({ _tag: "EnvironmentAuthorizationError" });
      yield* h.publish(11, completed("while-denied"));
      expect(h.reads).toHaveLength(2);
      expect(h.subscriptions).toHaveLength(1);
      const resumed = yield* watchReply(
        h.registry,
        detail,
        (value) => value?.lastSuccess?.requestId === "while-denied",
      );
      h.setRead(true);
      expect((yield* Queue.take(h.opened)).input.afterRevision).toBe(5);
      yield* Deferred.await(resumed);
    }),
  ),
);

it.effect("retains an unknown ID when its retransmission is denied", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const h = yield* harness();
      const send = (requestId: string) =>
        Effect.promise(() =>
          h.atoms.request.run(h.registry, {
            environmentId: env,
            input: { ...target, requestId, sourceText: "Original text" },
          }),
        );
      expect((yield* send("A"))._tag).toBe("Failure");
      h.setOperate(false);
      expect((yield* send("B"))._tag).toBe("Failure");
      h.setOperate(true);
      yield* send("C");
      expect(h.calls).toEqual(["A", "A"]);
    }),
  ),
);

it.effect("sends a new generation after detail confirms an in-flight request", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const h = yield* harness();
      h.hold();
      h.acknowledge();
      const send = (requestId: string) =>
        h.atoms.request.run(h.registry, {
          environmentId: env,
          input: { ...target, requestId, sourceText: "Original text" },
        });
      const first = send("A");
      yield* Deferred.await(h.started);
      h.setRecord(completed("A"));
      h.registry.mount(h.detail);
      yield* AtomRegistry.getResult(h.registry, h.detail, { suspendOnWaiting: true });
      const second = send("B");
      yield* Deferred.succeed(h.release, undefined);
      const result = yield* Effect.promise(() => second);
      yield* Effect.promise(() => first);
      expect(h.calls).toEqual(["A", "B"]);
      expect(result._tag).toBe("Success");
      if (result._tag === "Success") expect(result.value.lastSuccess?.requestId).toBe("B");
    }),
  ),
);

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
