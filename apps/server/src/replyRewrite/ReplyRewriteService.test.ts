import { assert, it } from "@effect/vitest";
import {
  CommandId,
  EventId,
  MessageId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  ProviderThreadId,
  RunId,
  ThreadId,
  ReplyRewriteError,
  type ReplyRewriteChange,
  type ReplyRewriteRecord,
  type OrchestrationV2AppThread,
  type OrchestrationV2ConversationMessage,
  type OrchestrationV2DomainEvent,
  type OrchestrationV2ProviderThread,
  type OrchestrationV2Run,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";
import * as SqlClient from "effect/sql/SqlClient";
import * as Schema from "effect/Schema";
import { OperationScopes } from "../auth/OperationScopes.ts";
import * as Persistence from "../persistence/Sqlite.ts";
import * as Settings from "../serverSettings.ts";
import * as Outbox from "../orchestration-v2/EffectOutbox.ts";
import * as EventSink from "../orchestration-v2/EventSink.ts";
import * as EventStore from "../orchestration-v2/EventStore.ts";
import * as ProjectionStore from "../orchestration-v2/ProjectionStore.ts";
import * as Runner from "./ReplyRewriteRunner.ts";
import * as Service from "./ReplyRewriteService.ts";
import * as Worker from "./ReplyRewriteWorker.ts";

type Output = Effect.Success<ReturnType<Runner.ReplyRewriteRunner["Service"]["run"]>>;
const isReplyRewriteError = Schema.is(ReplyRewriteError);
const output = (text = "Clear reply."): Output => ({
  text,
  model: "gpt-6.1-terra",
  requestedServiceTier: "priority",
  actualServiceTier: "default",
  usage: { totalTokens: 21 },
});

const makeControlledRunner = Effect.gen(function* () {
  const calls = yield* Queue.unbounded<{
    input: Parameters<Runner.ReplyRewriteRunner["Service"]["run"]>[0];
    result: Deferred.Deferred<Output, ReplyRewriteError>;
  }>();
  const runner = Runner.ReplyRewriteRunner.of({
    run: (input) =>
      Effect.gen(function* () {
        const result = yield* Deferred.make<Output, ReplyRewriteError>();
        yield* Queue.offer(calls, { input, result });
        return yield* Deferred.await(result);
      }),
  });
  return { calls, runner };
});

function testLayer(runner?: Runner.ReplyRewriteRunner["Service"]) {
  const shared = Layer.mergeAll(
    Outbox.layer,
    ProjectionStore.layer,
    EventStore.layer,
    Settings.layerTest(),
  ).pipe(Layer.provideMerge(Persistence.layerMemory));
  const earlySink = EventSink.layer.pipe(Layer.provide(shared));
  const serviceBase = Service.layer.pipe(Layer.provide(Layer.merge(earlySink, shared)));
  const service =
    runner === undefined
      ? serviceBase
      : serviceBase.pipe(Layer.provide(Layer.succeed(Runner.ReplyRewriteRunner, runner)));
  return Layer.mergeAll(
    shared,
    service,
    Worker.layer.pipe(Layer.provide(Layer.merge(service, shared))),
    earlySink,
  );
}

const seed = Effect.fn("ReplyRewriteTest.seed")(function* (
  options: {
    status?: OrchestrationV2Run["status"];
    classification?: OrchestrationV2ConversationMessage["replyClassification"];
    child?: boolean;
    sideChat?: boolean;
  } = {},
) {
  const now = yield* DateTime.now;
  const threadId = ThreadId.make("thread:rewrite");
  const runId = RunId.make("run:rewrite");
  const providerThreadId = ProviderThreadId.make("provider-thread:rewrite");
  const instanceId = ProviderInstanceId.make("codex");
  const modelSelection = { instanceId, model: "gpt-6.1-sol" };
  const thread: OrchestrationV2AppThread = {
    id: threadId,
    projectId: ProjectId.make("project:rewrite"),
    createdBy: "user",
    creationSource: "web",
    title: "Rewrite test",
    providerInstanceId: instanceId,
    modelSelection,
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    activeProviderThreadId: providerThreadId,
    lineage: {
      parentThreadId: null,
      relationshipToParent: options.child ? "subagent" : null,
      rootThreadId: threadId,
      ...(options.sideChat ? { sideChat: true } : {}),
    },
    forkedFrom: null,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    lastVisitedAt: null,
    deletedAt: null,
  };
  const run: OrchestrationV2Run = {
    id: runId,
    threadId,
    ordinal: 1,
    providerInstanceId: instanceId,
    modelSelection,
    providerThreadId,
    userMessageId: MessageId.make("message:user"),
    rootNodeId: null,
    activeAttemptId: null,
    status: options.status ?? "completed",
    requestedAt: now,
    startedAt: now,
    completedAt: now,
    checkpointId: null,
    contextHandoffId: null,
  };
  const providerThread: OrchestrationV2ProviderThread = {
    id: providerThreadId,
    appThreadId: threadId,
    driver: ProviderDriverKind.make("codex"),
    providerInstanceId: instanceId,
    providerSessionId: null,
    ownerNodeId: null,
    nativeThreadRef: null,
    nativeConversationHeadRef: null,
    handoffIds: [],
    forkedFrom: null,
    status: "idle",
    firstRunOrdinal: 1,
    lastRunOrdinal: 1,
    createdAt: now,
    updatedAt: now,
  };
  const message: OrchestrationV2ConversationMessage = {
    id: MessageId.make("message:final"),
    threadId,
    runId,
    nodeId: null,
    role: "assistant",
    createdBy: "agent",
    creationSource: "provider",
    text: "Source reply.\r\nSecond line.",
    attachments: [],
    streaming: false,
    createdAt: now,
    updatedAt: now,
    ...(options.classification === undefined
      ? {}
      : { replyClassification: options.classification }),
  };
  let eventIndex = 0;
  const event = (
    value: Omit<OrchestrationV2DomainEvent, "id" | "threadId" | "occurredAt">,
  ): OrchestrationV2DomainEvent =>
    ({
      ...value,
      id: EventId.make(`event:rewrite:${eventIndex++}`),
      threadId,
      occurredAt: now,
    }) as OrchestrationV2DomainEvent;
  const sink = yield* EventSink.EventSinkV2;
  yield* sink.write({
    events: [
      event({ type: "thread.created", payload: thread }),
      event({ type: "provider-thread.updated", payload: providerThread }),
      event({ type: "run.created", payload: run }),
      event({
        type: "message.updated",
        payload: {
          ...message,
          id: run.userMessageId,
          role: "user",
          createdBy: "user",
          creationSource: "web",
          text: "Explain it.",
        },
      }),
      event({ type: "message.updated", payload: message }),
    ],
  });
  return { thread, run, message, sink, event, target: { threadId, runId, messageId: message.id } };
});

it.effect(
  "deduplicates request IDs and active jobs, snapshots settings, and keeps source text unchanged",
  () =>
    Effect.gen(function* () {
      const controlled = yield* makeControlledRunner;
      yield* Effect.gen(function* () {
        const fixture = yield* seed();
        const service = yield* Service.ReplyRewriteService;
        const worker = yield* Worker.ReplyRewriteWorker;
        const settings = yield* Settings.ServerSettingsService;
        const request = { ...fixture.target, requestId: "manual:first" };
        const [accepted, repeated] = yield* Effect.all(
          [service.request(request), service.request(request)],
          { concurrency: "unbounded" },
        );
        assert.equal(repeated.currentAttempt?.requestId, accepted.currentAttempt?.requestId);
        assert.equal(accepted.currentAttempt?.generation, 1);
        assert.equal(
          accepted.target.sourceHash,
          "5268c3242ac3a538865cd44cad43d6ed8720a8a2ac880c9cb37d4263c65f6f3f",
        );
        const duplicate = yield* service.request({ ...request, requestId: "manual:alias" });
        assert.equal(duplicate.currentAttempt?.requestId, "manual:first");
        assert.isTrue(
          Option.isNone(
            yield* (yield* Outbox.EffectOutboxV2).claimNext({
              workerId: "main-must-not-claim-rewrite",
            }),
          ),
        );
        yield* settings.updateSettings({ replyRewrite: { customPrompt: "Future style" } });
        const job = yield* worker.runOnce.pipe(Effect.forkScoped);
        const call = yield* Queue.take(controlled.calls);
        assert.equal(call.input.sourceText, "Source reply.\r\nSecond line.");
        assert.isFalse(call.input.systemPrompt.includes("Future style"));
        assert.equal(call.input.requestedServiceTier, "priority");
        yield* Deferred.succeed(call.result, output());
        yield* Fiber.join(job);
        const saved = yield* service.request(request);
        assert.equal(saved.currentAttempt?.generation, 1);
        assert.equal(saved.lastSuccess?.actualServiceTier, "default");
        assert.equal(saved.lastSuccess?.text, "Clear reply.");
        assert.equal(yield* worker.drain, 0);
        const projections = yield* ProjectionStore.ProjectionStoreV2;
        assert.equal(
          (yield* projections.getThreadProjection(fixture.target.threadId)).messages.find(
            (m) => m.id === fixture.message.id,
          )?.text,
          "Source reply.\r\nSecond line.",
        );
        const page = yield* service.list({ threadId: fixture.target.threadId, limit: 1 });
        assert.isFalse(Object.hasOwn(page.records[0]!.lastSuccess!, "text"));
      }).pipe(Effect.provide(testLayer(controlled.runner)));
    }),
);

it.effect("keeps the old success during regeneration and after failure", () =>
  Effect.gen(function* () {
    const controlled = yield* makeControlledRunner;
    yield* Effect.gen(function* () {
      const { target } = yield* seed();
      const service = yield* Service.ReplyRewriteService;
      const worker = yield* Worker.ReplyRewriteWorker;
      yield* service.request({ ...target, requestId: "first" });
      const firstJob = yield* worker.runOnce.pipe(Effect.forkScoped);
      const first = yield* Queue.take(controlled.calls);
      yield* Deferred.succeed(first.result, output("Old success."));
      yield* Fiber.join(firstJob);
      const next = yield* service.request({ ...target, requestId: "second" });
      assert.equal(next.lastSuccess?.text, "Old success.");
      const secondJob = yield* worker.runOnce.pipe(Effect.forkScoped);
      const second = yield* Queue.take(controlled.calls);
      yield* Deferred.fail(
        second.result,
        new ReplyRewriteError({ code: "provider", message: "Provider failed." }),
      );
      yield* Fiber.join(secondJob);
      const failed = yield* service.getDetail(target);
      assert.equal(failed?.currentAttempt?.status, "failed");
      assert.equal(failed?.lastSuccess?.text, "Old success.");
      assert.equal(yield* worker.drain, 0);
    }).pipe(Effect.provide(testLayer(controlled.runner)));
  }),
);

it.effect("rejects A after B and lets the main outbox claim work while A waits", () =>
  Effect.gen(function* () {
    const controlled = yield* makeControlledRunner;
    yield* Effect.gen(function* () {
      const { target } = yield* seed();
      const service = yield* Service.ReplyRewriteService;
      const outbox = yield* Outbox.EffectOutboxV2;
      yield* service.request({ ...target, requestId: "A" });
      const claimedA = yield* outbox.claimNext({
        workerId: "rewrite-test-A",
        workerGroup: "reply-rewrite",
      });
      assert(Option.isSome(claimedA));
      const a = yield* service.execute(claimedA.value).pipe(Effect.forkScoped);
      const callA = yield* Queue.take(controlled.calls);
      yield* outbox.enqueue([
        {
          id: "main",
          commandId: CommandId.make("main"),
          threadId: target.threadId,
          request: { type: "provider-turn.start", runId: target.runId },
        },
      ]);
      const main = yield* outbox.claimNext({ workerId: "main-test" });
      assert.equal(Option.getOrUndefined(main)?.request.type, "provider-turn.start");
      yield* service.cancel({ ...target, requestId: "A" });
      yield* service.request({ ...target, requestId: "B" });
      const claimedB = yield* outbox.claimNext({
        workerId: "rewrite-test-B",
        workerGroup: "reply-rewrite",
      });
      assert(Option.isSome(claimedB));
      const b = yield* service.execute(claimedB.value).pipe(Effect.forkScoped);
      const callB = yield* Queue.take(controlled.calls);
      yield* Deferred.succeed(callB.result, output("B wins."));
      yield* Fiber.join(b);
      yield* Deferred.succeed(callA.result, output("A is late."));
      yield* Fiber.join(a);
      assert.equal((yield* service.getDetail(target))?.lastSuccess?.text, "B wins.");
    }).pipe(Effect.provide(testLayer(controlled.runner)));
  }),
);

it.effect.each(["rolled_back", "deleted", "changed"] as const)(
  "does not resurrect a rewrite after its source is %s",
  (change) =>
    Effect.gen(function* () {
      const controlled = yield* makeControlledRunner;
      yield* Effect.gen(function* () {
        const fixture = yield* seed();
        const service = yield* Service.ReplyRewriteService;
        const outbox = yield* Outbox.EffectOutboxV2;
        yield* service.request({ ...fixture.target, requestId: "invalidated" });
        const claimed = yield* outbox.claimNext({ workerId: "late", workerGroup: "reply-rewrite" });
        assert(Option.isSome(claimed));
        const executing = yield* service.execute(claimed.value).pipe(Effect.forkScoped);
        const call = yield* Queue.take(controlled.calls);
        const event =
          change === "deleted"
            ? fixture.event({
                type: "thread.deleted",
                payload: { ...fixture.thread, deletedAt: yield* DateTime.now },
              })
            : change === "rolled_back"
              ? fixture.event({
                  type: "run.updated",
                  payload: { ...fixture.run, status: "rolled_back" },
                })
              : fixture.event({
                  type: "message.updated",
                  payload: { ...fixture.message, text: "Changed source." },
                });
        yield* fixture.sink.write({ events: [event] });
        yield* Deferred.succeed(call.result, output("Late reply."));
        yield* Fiber.join(executing);
        assert.isNull(yield* service.getDetail(fixture.target));
        const sql = yield* SqlClient.SqlClient;
        const rows = yield* sql<{
          success_json: string | null;
        }>`SELECT success_json FROM reply_rewrites`;
        if (change === "deleted") {
          assert.equal(rows.length, 0);
          assert.equal(
            (yield* sql<{ count: number }>`SELECT count(*) AS count FROM reply_rewrite_requests`)[0]
              ?.count,
            0,
          );
        } else assert.isNull(rows[0]!.success_json);
      }).pipe(Effect.provide(testLayer(controlled.runner)));
    }),
);

it.effect(
  "recovers a pending claim, interrupts an unknown call, and settles a saved success without another call",
  () =>
    Effect.gen(function* () {
      const controlled = yield* makeControlledRunner;
      yield* Effect.gen(function* () {
        const { target } = yield* seed();
        const service = yield* Service.ReplyRewriteService;
        const outbox = yield* Outbox.EffectOutboxV2;
        yield* service.request({ ...target, requestId: "pending" });
        yield* outbox.claimNext({ workerId: "lost-before-call", workerGroup: "reply-rewrite" });
        yield* service.recover;
        const pending = yield* outbox.claimNext({
          workerId: "after-restart",
          workerGroup: "reply-rewrite",
        });
        assert(Option.isSome(pending));
        const callFiber = yield* service.execute(pending.value).pipe(Effect.forkScoped);
        yield* Queue.take(controlled.calls);
        yield* Fiber.interrupt(callFiber);
        yield* service.recover;
        assert.equal((yield* service.getDetail(target))?.currentAttempt?.status, "interrupted");
        yield* service.request({ ...target, requestId: "saved" });
        const savedClaim = yield* outbox.claimNext({
          workerId: "lost-after-save",
          workerGroup: "reply-rewrite",
        });
        assert(Option.isSome(savedClaim));
        const savedFiber = yield* service.execute(savedClaim.value).pipe(Effect.forkScoped);
        const savedCall = yield* Queue.take(controlled.calls);
        yield* Deferred.succeed(savedCall.result, output("Saved before restart."));
        yield* Fiber.join(savedFiber);
        yield* service.recover;
        assert.equal(
          (yield* outbox.get(savedClaim.value.id)).pipe(
            Option.map((e) => e.status),
            Option.getOrNull,
          ),
          "succeeded",
        );
        assert.equal(yield* (yield* Worker.ReplyRewriteWorker).drain, 0);
      }).pipe(Effect.provide(testLayer(controlled.runner)));
    }),
);

it.effect(
  "returns configuration errors without a production runner and checks destination scopes",
  () =>
    Effect.gen(function* () {
      const { target } = yield* seed();
      const service = yield* Service.ReplyRewriteService;
      assert.deepEqual(
        yield* service.request({ ...target, requestId: "unconfigured" }).pipe(
          Effect.flip,
          Effect.map((e) => (isReplyRewriteError(e) ? e.code : e._tag)),
        ),
        "configuration",
      );
      const denied = yield* service
        .getDetail(target)
        .pipe(Effect.provideService(OperationScopes, []), Effect.flip);
      assert.equal(denied._tag, "EnvironmentAuthorizationError");
    }).pipe(Effect.provide(testLayer())),
);

it.effect(
  "enqueues all confirmed finals only after the user run succeeds, excluding progress and legacy unknown",
  () =>
    Effect.gen(function* () {
      const controlled = yield* makeControlledRunner;
      yield* Effect.gen(function* () {
        const fixture = yield* seed({
          status: "running",
          classification: { kind: "final", source: "codex_phase" },
        });
        const settings = yield* Settings.ServerSettingsService;
        yield* settings.updateSettings({ replyRewrite: { auto: true } });
        yield* fixture.sink.write({
          events: [
            fixture.event({
              type: "message.updated",
              payload: {
                ...fixture.message,
                id: MessageId.make("message:second"),
                text: "Second final.",
              },
            }),
            fixture.event({
              type: "message.updated",
              payload: {
                ...fixture.message,
                id: MessageId.make("message:progress"),
                replyClassification: { kind: "commentary", source: "codex_phase" },
              },
            }),
            fixture.event({
              type: "message.updated",
              payload: {
                ...fixture.message,
                id: MessageId.make("message:unknown"),
                replyClassification: { kind: "unknown", source: "unknown" },
              },
            }),
          ],
        });
        const worker = yield* Worker.ReplyRewriteWorker;
        assert.equal(yield* worker.drain, 0);
        const service = yield* Service.ReplyRewriteService;
        const visible = yield* Queue.unbounded<ReplyRewriteRecord | null>();
        const observer = yield* fixture.sink
          .stream({
            threadId: fixture.target.threadId,
            afterSequence: yield* fixture.sink.latestSequence(),
            eventType: "run.updated",
            bounded: true,
          })
          .pipe(
            Stream.take(2),
            Stream.mapEffect(() => service.getDetail(fixture.target)),
            Stream.runForEach((record) => Queue.offer(visible, record)),
            Effect.forkScoped,
          );
        yield* fixture.sink.write({
          events: [fixture.event({ type: "run.updated", payload: fixture.run })],
        });
        assert.isNull(yield* Queue.take(visible));
        yield* fixture.sink.write({
          events: [
            fixture.event({
              type: "run.updated",
              payload: { ...fixture.run, status: "completed" },
            }),
          ],
        });
        assert.equal((yield* Queue.take(visible))?.currentAttempt?.status, "queued");
        yield* Fiber.join(observer);
        const draining = yield* worker.drain.pipe(Effect.forkScoped);
        const first = yield* Queue.take(controlled.calls);
        yield* Deferred.succeed(first.result, output());
        const second = yield* Queue.take(controlled.calls);
        yield* Deferred.succeed(second.result, output());
        assert.equal(yield* Fiber.join(draining), 2);
        assert.deepEqual([first.input.sourceText, second.input.sourceText].sort(), [
          "Second final.",
          "Source reply.\r\nSecond line.",
        ]);
        const sql = yield* SqlClient.SqlClient;
        assert.equal(
          (yield* sql<{ count: number }>`SELECT count(*) AS count FROM reply_rewrites`)[0]?.count,
          2,
        );
      }).pipe(Effect.provide(testLayer(controlled.runner)));
    }),
);

it.effect.each([
  { child: true, sideChat: false, status: "completed" as const },
  { child: false, sideChat: true, status: "completed" as const },
  { child: false, sideChat: false, status: "failed" as const },
])("excludes non-user-success sources: %j", (options) =>
  Effect.gen(function* () {
    const controlled = yield* makeControlledRunner;
    yield* Effect.gen(function* () {
      const fixture = yield* seed({
        ...options,
        classification: { kind: "final", source: "codex_phase" },
      });
      const settings = yield* Settings.ServerSettingsService;
      yield* settings.updateSettings({ replyRewrite: { auto: true } });
      yield* fixture.sink.write({
        events: [fixture.event({ type: "run.updated", payload: fixture.run })],
      });
      const service = yield* Service.ReplyRewriteService;
      const error = yield* service
        .request({ ...fixture.target, requestId: "excluded" })
        .pipe(Effect.flip);
      assert.isTrue(isReplyRewriteError(error));
      assert.equal(isReplyRewriteError(error) ? error.code : "unexpected", "not_eligible");
      assert.equal(yield* (yield* Worker.ReplyRewriteWorker).drain, 0);
    }).pipe(Effect.provide(testLayer(controlled.runner)));
  }),
);

it.effect(
  "replays durable invalidations after a snapshot and sends no rewritten body in them",
  () =>
    Effect.gen(function* () {
      const controlled = yield* makeControlledRunner;
      yield* Effect.gen(function* () {
        const { target } = yield* seed();
        const service = yield* Service.ReplyRewriteService;
        const snapshot = yield* service.list({ threadId: target.threadId });
        yield* service.request({ ...target, requestId: "stream" });
        const changes = yield* service
          .subscribe({ threadId: target.threadId, afterRevision: snapshot.revision })
          .pipe(Stream.take(1), Stream.runCollect);
        assert.equal(changes.length, 1);
        assert.equal(changes[0]?.messageId, "message:final");
        assert.isFalse(Object.hasOwn(changes[0]!, "text"));
        assert.isAbove(changes[0]!.revision, snapshot.revision);
      }).pipe(Effect.provide(testLayer(controlled.runner)));
    }),
);

it.effect(
  "notifies a client that first read null, including another client's completion beyond its polling window",
  () =>
    Effect.gen(function* () {
      const controlled = yield* makeControlledRunner;
      yield* Effect.gen(function* () {
        const { target } = yield* seed();
        const service = yield* Service.ReplyRewriteService;
        assert.isNull(yield* service.getDetail(target));
        const snapshot = yield* service.list({ threadId: target.threadId });
        const updates = yield* Queue.unbounded<ReplyRewriteChange>();
        const observer = yield* service
          .subscribe({ threadId: target.threadId, afterRevision: snapshot.revision })
          .pipe(
            Stream.take(3),
            Stream.runForEach((change) => Queue.offer(updates, change)),
            Effect.provideService(OperationScopes, ["orchestration:read"]),
            Effect.forkScoped,
          );
        yield* service
          .request({ ...target, requestId: "other-client" })
          .pipe(Effect.provideService(OperationScopes, ["orchestration:operate"]));
        const queued = yield* Queue.take(updates);
        assert.equal((yield* service.getDetail(target))?.currentAttempt?.status, "queued");
        yield* TestClock.adjust("3 minutes");
        const executing = yield* (yield* Worker.ReplyRewriteWorker).runOnce.pipe(Effect.forkScoped);
        const call = yield* Queue.take(controlled.calls);
        const running = yield* Queue.take(updates);
        yield* Deferred.succeed(call.result, output("Later result from another client."));
        yield* Fiber.join(executing);
        const completed = yield* Queue.take(updates);
        assert.isAbove(running.revision, queued.revision);
        assert.isAbove(completed.revision, running.revision);
        assert.equal(completed.messageId, target.messageId);
        assert.isFalse(Object.hasOwn(completed, "text"));
        assert.equal(
          (yield* service.getDetail(target))?.lastSuccess?.text,
          "Later result from another client.",
        );
        yield* Fiber.join(observer);
      }).pipe(Effect.provide(testLayer(controlled.runner)));
    }),
);

it.effect(
  "accepts a final persisted after completion and cancels it before the external call when its source changes",
  () =>
    Effect.gen(function* () {
      const controlled = yield* makeControlledRunner;
      yield* Effect.gen(function* () {
        const fixture = yield* seed();
        yield* (yield* Settings.ServerSettingsService).updateSettings({
          replyRewrite: { auto: true },
        });
        const final = {
          ...fixture.message,
          replyClassification: { kind: "final" as const, source: "codex_phase" as const },
        };
        yield* fixture.sink.write({
          events: [fixture.event({ type: "message.updated", payload: final })],
        });
        const service = yield* Service.ReplyRewriteService;
        assert.equal((yield* service.getDetail(fixture.target))?.currentAttempt?.status, "queued");
        yield* fixture.sink.write({
          events: [
            fixture.event({
              type: "message.updated",
              payload: { ...final, text: "Updated before call." },
            }),
          ],
        });
        const current = yield* service.getDetail(fixture.target);
        assert.equal(current?.currentAttempt?.status, "queued");
        const outbox = yield* Outbox.EffectOutboxV2;
        const claimed = yield* outbox.claimNext({
          workerId: "before-call",
          workerGroup: "reply-rewrite",
        });
        assert(Option.isSome(claimed));
        yield* fixture.sink.write({
          events: [
            fixture.event({
              type: "run.updated",
              payload: { ...fixture.run, status: "rolled_back" },
            }),
          ],
        });
        yield* service.execute(claimed.value);
        assert.equal(yield* Queue.size(controlled.calls), 0);
        assert.isNull(yield* service.getDetail(fixture.target));
      }).pipe(Effect.provide(testLayer(controlled.runner)));
    }),
);
