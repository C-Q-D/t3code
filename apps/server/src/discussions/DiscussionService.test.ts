/** Behavioral acceptance through real orchestration, private disk SQLite and controllable external providers. */
import { assert, it } from "@effect/vitest";
import {
  CommandId,
  DiscussionId,
  DiscussionError,
  ProjectId,
  DiscussionPromptId,
  EventId,
  MessageId,
  ProviderInstanceId,
  type Discussion,
  type OrchestrationV2ProviderFailure,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import * as Layer from "effect/Layer";
import * as Fiber from "effect/Fiber";
import * as Deferred from "effect/Deferred";
import * as Exit from "effect/Exit";
import * as Cause from "effect/Cause";
import * as SqlClient from "effect/sql/SqlClient";
import * as Outbox from "../orchestration-v2/EffectOutbox.ts";
import * as Option from "effect/Option";
import * as Worker from "../orchestration-v2/EffectWorker.ts";
import * as Threads from "../orchestration-v2/ThreadManagementService.ts";
import * as Launch from "../orchestration-v2/ThreadLaunchService.ts";
import * as Projections from "../orchestration-v2/ProjectionStore.ts";
import * as EventSink from "../orchestration-v2/EventSink.ts";
import * as Config from "../config.ts";
import { attachmentRelativePath } from "../attachmentStore.ts";
import * as Discussions from "./DiscussionService.ts";
import * as Store from "./DiscussionStore.ts";
import * as CaptureRecovery from "./DiscussionCheckpointRecovery.ts";
import {
  withDiscussionHarness,
  model,
  projectId,
  awaitDiscussion,
  awaitRun,
  awaitProviderTurn,
  finish,
  type DiscussionHarness,
} from "./DiscussionService.testkit.ts";

const input = {
  projectId,
  topic: "  原始议题标题  \n议题全文第二行",
  seats: [
    {
      personaPromptId: DiscussionPromptId.make("builtin:persona:architect"),
      modelSelection: model,
    },
    {
      personaPromptId: DiscussionPromptId.make("builtin:persona:implementer"),
      modelSelection: model,
    },
  ],
};

/**
 * Creates a discussion in the supplied harness; seats default to the two input seats and topic to
 * input.topic. Returns the create response's discussion snapshot and the first provider turn input
 * after draining the worker, persisting the run's running state and recording its provider attempt.
 */
const create = (harness: DiscussionHarness, seats = input.seats, topic = input.topic) =>
  Effect.gen(function* () {
    const service = yield* Discussions.DiscussionService;
    const { discussion } = yield* service.create({ ...input, seats, topic });
    yield* Worker.OrchestrationEffectWorkerV2.use((worker) => worker.drain());
    const turn = yield* Queue.take(harness.starts);
    yield* awaitRun(turn.threadId, turn.runId, "running");
    yield* awaitProviderTurn(turn);
    return { discussion, turn };
  });

/**
 * Uses the supplied discussion's identity to await exactly dispatchNo, not any later dispatch.
 * Returns the next provider turn input from the harness after the cursor's dispatch and runId are
 * durable, the worker is drained, that run is running and its provider attempt has been recorded.
 */
const next = (h: DiscussionHarness, discussion: Discussion, dispatchNo: number) =>
  Effect.gen(function* () {
    yield* Worker.OrchestrationEffectWorkerV2.use((worker) => worker.drain());
    yield* awaitDiscussion(
      discussion,
      (value) => value.cursor.dispatchNo === dispatchNo && value.cursor.runId !== null,
    );
    yield* Worker.OrchestrationEffectWorkerV2.use((worker) => worker.drain());
    const turn = yield* Queue.take(h.starts);
    yield* awaitRun(turn.threadId, turn.runId, "running");
    yield* awaitProviderTurn(turn);
    return turn;
  });

/**
 * Checks the public cursor and durable dispatch against an independently specified phase.
 * @param discussion Identity whose latest stored cursor is checked.
 * @param turn Provider input, or null when End must publish before any dispatch.
 * @param phase Assignment required by this test's lifecycle step.
 * @returns Assertion effect; no production phase helper computes the expectation.
 */
const expectPhase = (
  discussion: Discussion,
  turn: DiscussionHarness["started"][number] | null,
  phase: "regular" | "final_round" | "summarizing",
) =>
  Effect.gen(function* () {
    const snapshot = yield* Store.DiscussionStore.use((store) =>
      store.getDiscussion(discussion.id),
    );
    assert.equal(
      snapshot?.cursor.phase,
      phase,
      `published phase for dispatch ${snapshot?.cursor.dispatchNo}`,
    );
    if (turn)
      assert.isTrue(
        turn.message.text.endsWith(
          {
            regular: "本次阶段：普通讨论发言。",
            final_round: "本次阶段：最后陈述。",
            summarizing: "本次阶段：梳理。",
          }[phase],
        ),
        `dispatch suffix must match ${phase}`,
      );
  });

/**
 * Reads complete ordered attribution, including missing properties rather than false placeholders.
 * @param discussion Transcript identity; the store owns ordering by seq.
 * @returns Tuples of seq, kind, finalStatement and status for full literal comparisons.
 */
const attribution = (discussion: Discussion) =>
  Store.DiscussionStore.use((store) => store.listEntries(discussion.id)).pipe(
    Effect.map((entries) =>
      entries.map((entry) => [entry.seq, entry.kind, entry.finalStatement, entry.status]),
    ),
  );

/**
 * Reads dispatch-time positions and key presence from the complete durable transcript.
 * @param discussion Identity whose store-ordered entries are checked.
 * @returns Seq, kind, position and presence tuples for literal expectations independent of the cursor.
 */
const dispatchPositions = (discussion: Discussion) =>
  Store.DiscussionStore.use((store) => store.listEntries(discussion.id)).pipe(
    Effect.map((entries) =>
      entries.map((entry) => [
        entry.seq,
        entry.kind,
        entry.dispatchedEntrySeq,
        Object.hasOwn(entry, "dispatchedEntrySeq"),
      ]),
    ),
  );

it.effect("the first persisted and published creation snapshot already assigns regular", () =>
  withDiscussionHarness(() =>
    Effect.gen(function* () {
      const store = yield* Store.DiscussionStore;
      const observed: Discussion[] = [];
      const recording = Layer.succeed(Store.DiscussionStore, {
        ...store,
        createDiscussion: (discussion) => {
          observed.push(discussion);
          return store.createDiscussion(discussion);
        },
      });
      yield* Discussions.DiscussionService.use((service) => service.create(input)).pipe(
        Effect.provide(Discussions.layer.pipe(Layer.provide(recording), Layer.fresh)),
      );
      assert.equal(observed.length, 1);
      assert.equal(observed[0]!.cursor.phase, "regular");
    }),
  ),
);

it.effect("every subscribed closing snapshot matches its current or next dispatch assignment", () =>
  withDiscussionHarness((h) =>
    Effect.gen(function* () {
      const { discussion, turn } = yield* create(h);
      const service = yield* Discussions.DiscussionService;
      const ready = yield* Deferred.make<void>();
      const ended = yield* Deferred.make<void>();
      const snapshots: Discussion[] = [];
      yield* service.subscribe({ discussionId: discussion.id }).pipe(
        Stream.runForEach((event) =>
          Effect.gen(function* () {
            if (event.type === "snapshot" || event.type === "discussion.updated") {
              snapshots.push(event.discussion);
              if (event.type === "snapshot") yield* Deferred.succeed(ready, undefined);
              if (event.discussion.status === "ended") yield* Deferred.succeed(ended, undefined);
            }
          }),
        ),
        Effect.forkScoped,
      );
      yield* Deferred.await(ready);
      yield* service.end({
        discussionId: discussion.id,
        summarizerSeatId: discussion.seats[0]!.id,
      });
      yield* finish(h, turn);
      const finalB = yield* next(h, discussion, 2);
      yield* finish(h, finalB);
      const finalA = yield* next(h, discussion, 3);
      yield* finish(h, finalA);
      const summary = yield* next(h, discussion, 4);
      yield* finish(h, summary);
      yield* Deferred.await(ended);
      assert.isAbove(
        snapshots.length,
        10,
        "include preparation, acknowledgement and transition increments",
      );
      for (const [index, snapshot] of snapshots.entries()) {
        const { cursor } = snapshot;
        assert.isDefined(cursor.phase);
        if (snapshot.closing?.phase === "summarizing") assert.equal(cursor.phase, "summarizing");
        const assignedRun =
          cursor.runId ??
          snapshots
            .slice(index)
            .find(
              (later) => later.cursor.runId !== null && later.cursor.seatIndex === cursor.seatIndex,
            )?.cursor.runId;
        const assigned = h.started.find((dispatch) => dispatch.runId === assignedRun);
        assert.isDefined(
          assigned,
          `dispatch assignment for ${cursor.dispatchNo}/${cursor.seatIndex}`,
        );
        assert.equal(assigned!.threadId, snapshot.seats[cursor.seatIndex]!.threadId);
        const suffix = {
          regular: "本次阶段：普通讨论发言。",
          final_round: "本次阶段：最后陈述。",
          summarizing: "本次阶段：梳理。",
        }[cursor.phase!];
        assert.isTrue(
          assigned!.message.text.endsWith(suffix),
          `phase at dispatch ${cursor.dispatchNo}, run ${cursor.runId}`,
        );
      }
    }),
  ),
);

it.effect(
  "interjections are recorded immediately without steering, delivered once per seat and marked on first read",
  () =>
    withDiscussionHarness((h) =>
      Effect.gen(function* () {
        const { discussion, turn } = yield* create(h);
        const service = yield* Discussions.DiscussionService;
        const store = yield* Store.DiscussionStore;
        const { entry } = yield* service.interject({
          discussionId: discussion.id,
          text: "用户原文：保留\n全部细节",
        });
        assert.equal(entry.kind, "user");
        assert.isUndefined(entry.readBySeatId);
        assert.equal(h.started.length, 1);
        assert.equal((yield* store.getDiscussion(discussion.id))?.cursor.runId, turn.runId);
        assert.deepEqual(h.interrupted, []);
        yield* finish(h, turn);
        const b = yield* next(h, discussion, 2);
        assert.include(b.message.text, "用户原文：保留\n全部细节");
        assert.equal(
          (yield* store.listEntries(discussion.id))[0]?.readBySeatId,
          discussion.seats[1]!.id,
        );
        yield* finish(h, b);
        const a = yield* next(h, discussion, 3);
        assert.include(a.message.text, "用户原文：保留\n全部细节");
        yield* finish(h, a);
        const bAgain = yield* next(h, discussion, 4);
        assert.notInclude(bAgain.message.text, "用户原文：保留");
        assert.notInclude(bAgain.message.text, "议题全文第二行");
        assert.equal(
          (yield* store.listEntries(discussion.id))[0]?.readBySeatId,
          discussion.seats[1]!.id,
        );
      }),
    ),
);

it.effect("stop holds preexisting queued user runs without starting them", () =>
  withDiscussionHarness((h) =>
    Effect.gen(function* () {
      const { discussion, turn } = yield* create(h);
      const threads = yield* Threads.ThreadManagementService;
      const service = yield* Discussions.DiscussionService;
      const queued = yield* threads.sendToThread({
        projectId,
        commandId: CommandId.make("t4:queued"),
        threadId: turn.threadId,
        messageId: MessageId.make("t4:queued"),
        text: "用户排队消息",
        attachments: [],
        mode: "queue",
        createdBy: "user",
        creationSource: "web",
      });
      yield* service.stop({ discussionId: discussion.id });
      yield* Worker.OrchestrationEffectWorkerV2.use((worker) => worker.drain());
      yield* awaitRun(turn.threadId, turn.runId, "interrupted");
      assert.equal(
        (yield* threads.getThreadProjection(turn.threadId)).runs.find(
          (run) => run.id === queued.run.id,
        )?.queueHeld,
        true,
      );
      assert.equal(h.started.length, 1);
    }),
  ),
);

it.effect("stop and continue retry the same seat with new material after capture", () =>
  withDiscussionHarness((h) =>
    Effect.gen(function* () {
      const { discussion, turn } = yield* create(h);
      const service = yield* Discussions.DiscussionService;
      const store = yield* Store.DiscussionStore;
      const stopped = yield* service.stop({ discussionId: discussion.id });
      assert.equal(stopped.discussion.status, "paused");
      assert.equal(stopped.discussion.pause?.reason, "stopped");
      assert.equal(stopped.discussion.cursor.seatIndex, 0);
      yield* service.interject({ discussionId: discussion.id, text: "停下后新增要求" });
      const continued = yield* service.continue({ discussionId: discussion.id });
      assert.equal(continued.discussion.status, "speaking");
      assert.equal(continued.discussion.cursor.dispatchNo, 1);
      yield* Worker.OrchestrationEffectWorkerV2.use((worker) => worker.drain());
      yield* awaitRun(turn.threadId, turn.runId, "interrupted");
      const retried = yield* next(h, discussion, 2);
      assert.equal(retried.threadId, turn.threadId);
      assert.notEqual(retried.runId, turn.runId);
      assert.include(retried.message.text, "停下后新增要求");
      assert.include(retried.message.text, "你上次发言被中止");
      const statement = (yield* store.listEntries(discussion.id)).find(
        (entry) => entry.runId === turn.runId,
      )!;
      assert.equal(statement.status, "interrupted");
      assert.isNotNull(statement.checkpointRef);
      assert.equal(h.interrupted.length, 1);
    }),
  ),
);

it.effect.each(["unknown", "usage_limit"] as const)(
  "failure %s pauses with raw details and manual continue starts the same seat",
  (kind) =>
    withDiscussionHarness((h) =>
      Effect.gen(function* () {
        const { discussion, turn } = yield* create(h);
        const service = yield* Discussions.DiscussionService;
        const store = yield* Store.DiscussionStore;
        const failure: OrchestrationV2ProviderFailure = {
          class: kind,
          message: "原始 provider 失败信息",
          code: null,
          retryable: false,
          ...(kind === "usage_limit" ? { resetAt: "2026-10-13T00:00:00.000Z" } : {}),
        };
        yield* finish(h, turn, ["失败前部分发言"], "failed", failure);
        yield* awaitDiscussion(discussion, (value) => value.status === "paused");
        const paused = (yield* store.getDiscussion(discussion.id))!;
        assert.deepEqual(paused.pause, {
          reason: "seat_failed",
          seatId: discussion.seats[0]!.id,
          failureKind: kind === "usage_limit" ? "usage_limit" : "error",
          message: "原始 provider 失败信息",
          ...(kind === "usage_limit" ? { resetAt: "2026-10-13T00:00:00.000Z" } : {}),
        });
        const entry = (yield* store.listEntries(discussion.id))[0]!;
        assert.equal(entry.status, "failed");
        assert.equal(entry.text, "失败前部分发言");
        assert.isNull(entry.checkpointRef);
        yield* service.continue({ discussionId: discussion.id });
        const retry = yield* next(h, discussion, 2);
        assert.equal(retry.threadId, turn.threadId);
        assert.notEqual(retry.message.messageId, turn.message.messageId);
      }),
    ),
);

it.effect(
  "end waits for the ordinary run, rotates a full final round and uses a frozen summary template",
  () =>
    withDiscussionHarness((h) =>
      Effect.gen(function* () {
        const { discussion, turn } = yield* create(h);
        const service = yield* Discussions.DiscussionService;
        const store = yield* Store.DiscussionStore;
        const prompt = (yield* store.getPrompt(
          DiscussionPromptId.make("builtin:summary:default"),
        ))!;
        yield* expectPhase(discussion, turn, "regular");
        const ending = yield* service.end({
          discussionId: discussion.id,
          summarizerSeatId: discussion.seats[0]!.id,
        });
        assert.deepEqual(ending.discussion.closing?.remainingFinalSeatIds, [
          discussion.seats[1]!.id,
          discussion.seats[0]!.id,
        ]);
        assert.equal(ending.discussion.cursor.phase, "regular");
        yield* store.upsertPrompt({ ...prompt, prompt: "改后的模板不得进入此次梳理" });
        assert.equal(
          (yield* service
            .interject({ discussionId: discussion.id, text: "收尾插话" })
            .pipe(Effect.flip)).reason,
          "invalid_state",
        );
        yield* finish(h, turn, ["普通发言"]);
        const b = yield* next(h, discussion, 2);
        yield* expectPhase(discussion, b, "final_round");
        assert.equal(b.threadId, discussion.seats[1]!.threadId);
        assert.include(b.message.text, "讨论到此");
        assert.include(b.message.text, "这是你本次讨论的最后一次发言");
        yield* finish(h, b, ["B 最后陈述"]);
        const a = yield* next(h, discussion, 3);
        yield* expectPhase(discussion, a, "final_round");
        assert.equal(a.threadId, discussion.seats[0]!.threadId);
        assert.include(a.message.text, "这是你本次讨论的最后一次发言");
        yield* finish(h, a, ["A 最后陈述"]);
        const summary = yield* next(h, discussion, 4);
        yield* expectPhase(discussion, summary, "summarizing");
        assert.equal(summary.threadId, discussion.seats[0]!.threadId);
        assert.include(summary.message.text, prompt.prompt);
        assert.notInclude(summary.message.text, "改后的模板不得");
        yield* finish(h, summary, ["整场梳理"]);
        yield* awaitDiscussion(discussion, (value) => value.status === "ended");
        const ended = (yield* store.getDiscussion(discussion.id))!;
        assert.isNotNull(ended.endedAt);
        assert.equal(ended.cursor.phase, "summarizing");
        assert.deepEqual(yield* dispatchPositions(discussion), [
          [1, "system", undefined, false],
          [2, "statement", 0, true],
          [3, "statement", 2, true],
          [4, "statement", 3, true],
          [5, "summary", 4, true],
        ]);
        assert.deepEqual(yield* attribution(discussion), [
          [1, "system", undefined, "completed"],
          [2, "statement", undefined, "completed"],
          [3, "statement", true, "completed"],
          [4, "statement", true, "completed"],
          [5, "summary", undefined, "completed"],
        ]);
        assert.deepEqual(
          (yield* store.listEntries(discussion.id)).map((entry) => [entry.kind, entry.text]),
          [
            ["system", "讨论到此"],
            ["statement", "普通发言"],
            ["statement", "B 最后陈述"],
            ["statement", "A 最后陈述"],
            ["summary", "整场梳理"],
          ],
        );
      }),
    ),
);

it.effect(
  "End after completion before reactor bookkeeping starts final statements at the next seat",
  () =>
    withDiscussionHarness(
      (h) =>
        Effect.gen(function* () {
          const sink = yield* EventSink.EventSinkV2;
          const parked = yield* Deferred.make<void>();
          const release = yield* Deferred.make<void>();
          let held = false;
          // Gate only delivery to the discussion reactor; the run and checkpoint commit through real orchestration.
          const delayed = Layer.succeed(EventSink.EventSinkV2, {
            ...sink,
            stream: (options) =>
              sink.stream(options).pipe(
                Stream.mapEffect((item) =>
                  Effect.gen(function* () {
                    if (
                      !held &&
                      item.event.type === "run.updated" &&
                      item.event.payload.status === "completed"
                    ) {
                      held = true;
                      yield* Deferred.succeed(parked, undefined);
                      yield* Deferred.await(release);
                    }
                    return item;
                  }),
                ),
              ),
          });
          yield* Effect.gen(function* () {
            const service = yield* Discussions.DiscussionService;
            yield* service.start();
            const { discussion, turn } = yield* create(h);
            yield* finish(h, turn, ["尚未由 reactor 记账的普通发言"]);
            yield* Deferred.await(parked);
            assert.deepEqual(yield* attribution(discussion), []);
            const { discussion: closing } = yield* service.end({
              discussionId: discussion.id,
              summarizerSeatId: discussion.seats[0]!.id,
            });
            assert.equal(closing.cursor.seatIndex, 1);
            assert.equal(closing.cursor.phase, "final_round");
            assert.deepEqual(yield* dispatchPositions(discussion), [
              [1, "statement", 0, true],
              [2, "system", undefined, false],
            ]);
            assert.deepEqual(yield* attribution(discussion), [
              [1, "statement", undefined, "completed"],
              [2, "system", undefined, "completed"],
            ]);
            assert.deepEqual(
              (yield* Store.DiscussionStore.use((store) => store.listEntries(discussion.id))).map(
                (entry) => [entry.kind, entry.text],
              ),
              [
                ["statement", "尚未由 reactor 记账的普通发言"],
                ["system", "讨论到此"],
              ],
            );
            yield* Deferred.succeed(release, undefined);
            const final = yield* next(h, discussion, 2);
            assert.deepEqual(yield* dispatchPositions(discussion), [
              [1, "statement", 0, true],
              [2, "system", undefined, false],
            ]);
            assert.include(final.message.text, "这是你本次讨论的最后一次发言");
            yield* expectPhase(discussion, final, "final_round");
            assert.equal(final.threadId, discussion.seats[1]!.threadId);
            yield* finish(h, final);
            const last = yield* next(h, discussion, 3);
            yield* expectPhase(discussion, last, "final_round");
            yield* finish(h, last);
            const summary = yield* next(h, discussion, 4);
            yield* expectPhase(discussion, summary, "summarizing");
            yield* finish(h, summary);
            yield* awaitDiscussion(discussion, (value) => value.status === "ended");
            assert.deepEqual(yield* attribution(discussion), [
              [1, "statement", undefined, "completed"],
              [2, "system", undefined, "completed"],
              [3, "statement", true, "completed"],
              [4, "statement", true, "completed"],
              [5, "summary", undefined, "completed"],
            ]);
          }).pipe(Effect.provide(Discussions.layer.pipe(Layer.provide(delayed), Layer.fresh)));
        }),
      { startReactor: false },
    ),
);

it.effect.each([
  { status: "failed" as const, capturePending: false },
  { status: "interrupted" as const, capturePending: false },
  { status: "cancelled" as const, capturePending: false },
  { status: "failed" as const, capturePending: true },
  { status: "interrupted" as const, capturePending: true },
  { status: "cancelled" as const, capturePending: true },
])(
  "End publishes finals for terminal $status before reactor, capture pending=$capturePending",
  ({ status, capturePending }) =>
    withDiscussionHarness(
      (h) =>
        Effect.gen(function* () {
          const sink = yield* EventSink.EventSinkV2;
          const parked = yield* Deferred.make<void>();
          const release = yield* Deferred.make<void>();
          let held = false;
          const delayed = Layer.succeed(EventSink.EventSinkV2, {
            ...sink,
            stream: (options) =>
              sink.stream(options).pipe(
                Stream.mapEffect((item) =>
                  Effect.gen(function* () {
                    if (
                      !held &&
                      item.event.type === "run.updated" &&
                      item.event.payload.status === "interrupted"
                    ) {
                      held = true;
                      yield* Deferred.succeed(parked, undefined);
                      yield* Deferred.await(release);
                    }
                    return item;
                  }),
                ),
              ),
          });
          yield* Effect.gen(function* () {
            const service = yield* Discussions.DiscussionService;
            yield* service.start();
            const { discussion, turn } = yield* create(h);
            const projection = yield* Projections.ProjectionStoreV2;
            const worker = yield* Worker.OrchestrationEffectWorkerV2;
            if (capturePending) yield* h.holdCaptures;
            yield* h.finish(turn, "interrupted", ["终态已落库的普通发言"]);
            yield* awaitRun(turn.threadId, turn.runId, "interrupted");
            yield* Deferred.await(parked);
            const draining = yield* worker.drain().pipe(Effect.forkScoped);
            if (capturePending) yield* Queue.take(h.captureStarted);
            else yield* Fiber.join(draining);
            const terminal = (yield* sink
              .stream({ threadId: turn.threadId, eventType: "run.updated", bounded: true })
              .pipe(
                Stream.filter(
                  ({ event }) =>
                    event.type === "run.updated" && event.payload.status === "interrupted",
                ),
                Stream.take(1),
                Stream.runCollect,
              ))[0]!.event;
            if (terminal.type !== "run.updated")
              return yield* Effect.die("Missing terminal fixture event");
            const records = yield* projection.getThreadRecords(turn.threadId, ["runs"]);
            const run = records.runs.find((candidate) => candidate.id === turn.runId)!;
            // Restore the terminal projection through its real event sink, independently of discussion bookkeeping.
            // Captures remain real worker effects, including a previously queued capture for a failed terminal fixture.
            yield* sink.write({
              events: [
                {
                  ...terminal,
                  id: EventId.make(`${terminal.id}:terminal:${status}`),
                  payload: { ...run, status },
                },
              ],
            });
            yield* awaitRun(turn.threadId, turn.runId, status);
            const store = yield* Store.DiscussionStore;
            assert.equal((yield* store.getDiscussion(discussion.id))?.status, "speaking");
            const subscribed = yield* Deferred.make<void>();
            const updates = yield* service.subscribe({ discussionId: discussion.id }).pipe(
              Stream.tap((event) =>
                event.type === "snapshot" ? Deferred.succeed(subscribed, undefined) : Effect.void,
              ),
              Stream.filter((event) => event.type === "discussion.updated"),
              Stream.takeUntil(
                (event) =>
                  event.type === "discussion.updated" &&
                  event.discussion.cursor.dispatchNo === 2 &&
                  event.discussion.cursor.runId !== null,
              ),
              Stream.runCollect,
              Effect.forkScoped,
            );
            yield* Deferred.await(subscribed);
            const ending = yield* service.end({
              discussionId: discussion.id,
              summarizerSeatId: discussion.seats[0]!.id,
            });
            assert.equal(
              ending.discussion.cursor.phase,
              "final_round",
              "End response before capture release",
            );
            assert.equal(ending.discussion.cursor.seatIndex, 0);
            assert.equal(ending.discussion.cursor.round, 1);
            yield* h.releaseCaptures;
            yield* Fiber.join(draining);
            yield* Deferred.succeed(release, undefined);
            const final = yield* next(h, discussion, 2);
            yield* expectPhase(discussion, final, "final_round");
            assert.deepEqual(yield* dispatchPositions(discussion), [
              [1, "statement", 0, true],
              [2, "system", undefined, false],
            ]);
            const events = yield* Fiber.join(updates);
            assert.isAtLeast(events.length, 2, "include End transition and dispatch binding");
            for (const [index, event] of events.entries()) {
              if (event.type !== "discussion.updated")
                return yield* Effect.die("Unexpected subscription fixture event");
              assert.equal(
                event.discussion.cursor.phase,
                "final_round",
                `subscribed update ${index}, ${status}/${capturePending}`,
              );
            }
          }).pipe(Effect.provide(Discussions.layer.pipe(Layer.provide(delayed), Layer.fresh)));
        }),
      { startReactor: false },
    ),
);

it.effect.each([1, 2])(
  "ending while paused starts at the stopped seat with %i final seats",
  (seatCount) =>
    withDiscussionHarness((h) =>
      Effect.gen(function* () {
        const { discussion, turn } = yield* create(h, input.seats.slice(0, seatCount));
        const service = yield* Discussions.DiscussionService;
        yield* service.stop({ discussionId: discussion.id });
        const ending = yield* service.end({
          discussionId: discussion.id,
          summarizerSeatId: discussion.seats[0]!.id,
        });
        assert.equal(ending.discussion.cursor.phase, "final_round");
        const final = yield* next(h, discussion, 2);
        yield* expectPhase(discussion, final, "final_round");
        assert.equal(final.threadId, turn.threadId);
        assert.include(final.message.text, "这是你本次讨论的最后一次发言");
        yield* finish(h, final, ["唯一座位最后陈述"]);
        if (seatCount === 2) {
          const last = yield* next(h, discussion, 3);
          yield* expectPhase(discussion, last, "final_round");
          assert.equal(last.threadId, discussion.seats[1]!.threadId);
          assert.include(last.message.text, "这是你本次讨论的最后一次发言");
          yield* finish(h, last, ["第二位最后陈述"]);
        }
        const summary = yield* next(h, discussion, seatCount + 2);
        yield* expectPhase(discussion, summary, "summarizing");
        assert.include(summary.message.text, "梳理模板");
        yield* finish(h, summary, ["总结"]);
        yield* awaitDiscussion(discussion, (value) => value.status === "ended");
        assert.deepEqual(
          yield* attribution(discussion),
          seatCount === 1
            ? [
                [1, "system", undefined, "completed"],
                [2, "statement", undefined, "interrupted"],
                [3, "statement", true, "completed"],
                [4, "summary", undefined, "completed"],
              ]
            : [
                [1, "system", undefined, "completed"],
                [2, "statement", undefined, "interrupted"],
                [3, "statement", true, "completed"],
                [4, "statement", true, "completed"],
                [5, "summary", undefined, "completed"],
              ],
        );
      }),
    ),
);

it.effect.each([1, 2])(
  "stopping the ordinary run after End preserves its phase before %i final seats",
  (seatCount) =>
    withDiscussionHarness((h) =>
      Effect.gen(function* () {
        const { discussion, turn } = yield* create(h, input.seats.slice(0, seatCount));
        const service = yield* Discussions.DiscussionService;
        yield* service.end({
          discussionId: discussion.id,
          summarizerSeatId: discussion.seats[0]!.id,
        });
        yield* service.stop({ discussionId: discussion.id });
        yield* expectPhase(discussion, null, "regular");
        yield* service.continue({ discussionId: discussion.id });
        yield* Worker.OrchestrationEffectWorkerV2.use((worker) => worker.drain());
        yield* awaitRun(turn.threadId, turn.runId, "interrupted");
        const resumed = yield* next(h, discussion, 2);
        yield* expectPhase(discussion, resumed, "regular");
        assert.equal(resumed.threadId, turn.threadId);
        assert.notInclude(resumed.message.text, "这是你本次讨论的最后一次发言");
        yield* finish(h, resumed, ["普通发言重说完成"]);
        for (let offset = 0; offset < seatCount; offset++) {
          const final = yield* next(h, discussion, offset + 3);
          yield* expectPhase(discussion, final, "final_round");
          assert.equal(final.threadId, discussion.seats[(1 + offset) % seatCount]!.threadId);
          assert.include(final.message.text, "这是你本次讨论的最后一次发言");
          yield* finish(h, final, ["最后陈述"]);
        }
        const summary = yield* next(h, discussion, seatCount + 3);
        yield* expectPhase(discussion, summary, "summarizing");
        yield* finish(h, summary, ["梳理"]);
        yield* awaitDiscussion(discussion, (value) => value.status === "ended");
        assert.deepEqual(
          yield* attribution(discussion),
          seatCount === 1
            ? [
                [1, "system", undefined, "completed"],
                [2, "statement", undefined, "interrupted"],
                [3, "statement", undefined, "completed"],
                [4, "statement", true, "completed"],
                [5, "summary", undefined, "completed"],
              ]
            : [
                [1, "system", undefined, "completed"],
                [2, "statement", undefined, "interrupted"],
                [3, "statement", undefined, "completed"],
                [4, "statement", true, "completed"],
                [5, "statement", true, "completed"],
                [6, "summary", undefined, "completed"],
              ],
        );
      }),
    ),
);

it.effect(
  "oversized material is sent whole as a Markdown attachment and the discussion keeps speaking",
  () =>
    withDiscussionHarness((h) =>
      Effect.gen(function* () {
        const topic = "长议题\n" + "完整中文内容🌿".repeat(15_000);
        const { discussion, turn } = yield* create(h, [input.seats[0]!], topic);
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const config = yield* Config.ServerConfig;
        assert.equal(discussion.cursor.briefSentAsFile, true);
        assert.isAbove(discussion.cursor.briefChars, 120_000);
        assert.isBelow(turn.message.text.length, 120_000);
        assert.include(turn.message.text, "完整读完附件的全部内容");
        assert.equal(turn.message.attachments.length, 1);
        const attachment = turn.message.attachments[0]!;
        const contents = yield* fs.readFileString(
          path.join(config.attachmentsDir, attachmentRelativePath(attachment)!),
        );
        assert.include(contents, topic);
        assert.equal(contents.length, discussion.cursor.briefChars);
        assert.equal(new TextEncoder().encode(contents).length, attachment.sizeBytes);
        yield* finish(h, turn);
        const second = yield* next(h, discussion, 2);
        assert.equal(second.threadId, turn.threadId);
      }),
    ),
);

it.effect(
  "single-seat End leaves the active ordinary assignment regular until final dispatch",
  () =>
    withDiscussionHarness((h) =>
      Effect.gen(function* () {
        const { discussion, turn } = yield* create(h, [input.seats[0]!]);
        const service = yield* Discussions.DiscussionService;
        yield* service.interject({ discussionId: discussion.id, text: "结束前的插话" });
        const ending = yield* service.end({
          discussionId: discussion.id,
          summarizerSeatId: discussion.seats[0]!.id,
        });
        assert.equal(ending.discussion.cursor.phase, "regular");
        yield* expectPhase(discussion, turn, "regular");
        yield* finish(h, turn);
        const final = yield* next(h, discussion, 2);
        yield* expectPhase(discussion, final, "final_round");
        yield* finish(h, final);
        const summary = yield* next(h, discussion, 3);
        yield* expectPhase(discussion, summary, "summarizing");
        yield* finish(h, summary);
        yield* awaitDiscussion(discussion, (value) => value.status === "ended");
        yield* expectPhase(discussion, null, "summarizing");
        assert.deepEqual(yield* attribution(discussion), [
          [1, "user", undefined, "completed"],
          [2, "system", undefined, "completed"],
          [3, "statement", undefined, "completed"],
          [4, "statement", true, "completed"],
          [5, "summary", undefined, "completed"],
        ]);
      }),
    ),
);

it.effect(
  "a stopped ordinary terminal arriving after End keeps dispatch-time ordinary attribution",
  () =>
    withDiscussionHarness((h) =>
      Effect.gen(function* () {
        const { discussion, turn } = yield* create(h);
        const service = yield* Discussions.DiscussionService;
        const projection = yield* Projections.ProjectionStoreV2;
        yield* h.holdInterrupts;
        yield* service.stop({ discussionId: discussion.id });
        const ending = yield* service.end({
          discussionId: discussion.id,
          summarizerSeatId: discussion.seats[0]!.id,
        });
        assert.equal(
          (yield* projection.getThreadRecords(turn.threadId, ["runs"])).runs.find(
            (run) => run.id === turn.runId,
          )?.status,
          "running",
          "ordinary run has no terminal event at End",
        );
        assert.equal(ending.discussion.cursor.phase, "final_round");
        assert.deepEqual(yield* attribution(discussion), [[1, "system", undefined, "completed"]]);
        yield* h.releaseInterrupts;
        const final = yield* next(h, discussion, 2);
        yield* expectPhase(discussion, final, "final_round");
        yield* finish(h, final);
        const last = yield* next(h, discussion, 3);
        yield* expectPhase(discussion, last, "final_round");
        yield* finish(h, last);
        const summary = yield* next(h, discussion, 4);
        yield* expectPhase(discussion, summary, "summarizing");
        yield* finish(h, summary);
        yield* awaitDiscussion(discussion, (value) => value.status === "ended");
        assert.deepEqual(yield* attribution(discussion), [
          [1, "system", undefined, "completed"],
          [2, "statement", undefined, "interrupted"],
          [3, "statement", true, "completed"],
          [4, "statement", true, "completed"],
          [5, "summary", undefined, "completed"],
        ]);
      }),
    ),
);

it.effect.each(["interrupted", "failed"] as const)(
  "a %s final statement and its retry retain final attribution",
  (outcome) =>
    withDiscussionHarness((h) =>
      Effect.gen(function* () {
        const { discussion, turn } = yield* create(h, [input.seats[0]!]);
        const service = yield* Discussions.DiscussionService;
        yield* service.end({
          discussionId: discussion.id,
          summarizerSeatId: discussion.seats[0]!.id,
        });
        yield* finish(h, turn);
        const final = yield* next(h, discussion, 2);
        yield* expectPhase(discussion, final, "final_round");
        if (outcome === "interrupted") {
          yield* service.stop({ discussionId: discussion.id });
          yield* Worker.OrchestrationEffectWorkerV2.use((worker) => worker.drain());
          yield* awaitRun(final.threadId, final.runId, "interrupted");
        } else {
          yield* finish(h, final, ["失败的最后陈述"], "failed", {
            class: "unknown",
            message: "最后陈述失败",
            code: null,
            retryable: false,
          });
          yield* awaitDiscussion(discussion, (value) => value.status === "paused");
        }
        yield* expectPhase(discussion, null, "final_round");
        yield* service.continue({ discussionId: discussion.id });
        const retry = yield* next(h, discussion, 3);
        yield* expectPhase(discussion, retry, "final_round");
        yield* finish(h, retry);
        const summary = yield* next(h, discussion, 4);
        yield* expectPhase(discussion, summary, "summarizing");
        yield* finish(h, summary);
        yield* awaitDiscussion(discussion, (value) => value.status === "ended");
        assert.deepEqual(yield* attribution(discussion), [
          [1, "system", undefined, "completed"],
          [2, "statement", undefined, "completed"],
          [3, "statement", true, outcome],
          [4, "statement", true, "completed"],
          [5, "summary", undefined, "completed"],
        ]);
      }),
    ),
);

it.effect(
  "real Git snapshots attribute new a.ts to A and only b.ts to B across independent seat threads",
  () =>
    withDiscussionHarness((h) =>
      Effect.gen(function* () {
        const { discussion, turn } = yield* create(h);
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const store = yield* Store.DiscussionStore;
        const service = yield* Discussions.DiscussionService;
        yield* fs.writeFileString(
          path.join(h.cwd, "a.ts"),
          "export const a = 1;\nexport const aa = 2;\n",
        );
        yield* finish(h, turn, ["A 新建 a.ts"]);
        const b = yield* next(h, discussion, 2);
        assert.include(b.message.text, "a.ts：+2 / -0 行");
        yield* fs.writeFileString(path.join(h.cwd, "b.ts"), "export const b = 1;\n");
        yield* finish(h, b, ["B 新建 b.ts"]);
        yield* awaitDiscussion(
          discussion,
          (value) => value.cursor.dispatchNo === 3 && value.cursor.runId !== null,
        );
        const entries = yield* store.listEntries(discussion.id);
        assert.deepEqual(
          entries.map((entry) => entry.files),
          [
            [{ path: "a.ts", additions: 2, deletions: 0 }],
            [{ path: "b.ts", additions: 1, deletions: 0 }],
          ],
        );
        const aDiff = yield* service.getEntryDiff({
          discussionId: discussion.id,
          entryId: entries[0]!.id,
        });
        assert.include(aDiff.diff, "diff --git a/a.ts b/a.ts");
        assert.include(aDiff.diff, "+export const aa = 2;");
        const bDiff = yield* service.getEntryDiff({
          discussionId: discussion.id,
          entryId: entries[1]!.id,
        });
        assert.include(bDiff.diff, "diff --git a/b.ts b/b.ts");
        assert.notInclude(bDiff.diff, "a.ts");
      }),
    ),
);

it.effect("interrupted A owns its changes before retry and B receives only later changes", () =>
  withDiscussionHarness((h) =>
    Effect.gen(function* () {
      const { discussion, turn } = yield* create(h);
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const service = yield* Discussions.DiscussionService;
      const store = yield* Store.DiscussionStore;
      yield* fs.writeFileString(path.join(h.cwd, "a.ts"), "export const a = 1;\n");
      yield* service.stop({ discussionId: discussion.id });
      yield* Worker.OrchestrationEffectWorkerV2.use((worker) => worker.drain());
      yield* awaitRun(turn.threadId, turn.runId, "interrupted");
      yield* Worker.OrchestrationEffectWorkerV2.use((worker) => worker.drain());
      yield* service.continue({ discussionId: discussion.id });
      const retry = yield* next(h, discussion, 2);
      yield* finish(h, retry, ["重说完成"]);
      const b = yield* next(h, discussion, 3);
      yield* fs.writeFileString(path.join(h.cwd, "b.ts"), "export const b = 1;\n");
      yield* finish(h, b);
      yield* awaitDiscussion(
        discussion,
        (value) => value.cursor.dispatchNo === 4 && value.cursor.runId !== null,
      );
      assert.deepEqual(
        (yield* store.listEntries(discussion.id)).map((entry) => [entry.status, entry.files]),
        [
          ["interrupted", [{ path: "a.ts", additions: 1, deletions: 0 }]],
          ["completed", []],
          ["completed", [{ path: "b.ts", additions: 1, deletions: 0 }]],
        ],
      );
    }),
  ),
);

it.effect("non-Git interrupted captures settle as missing and do not block continue", () =>
  withDiscussionHarness(
    (h) =>
      Effect.gen(function* () {
        const { discussion, turn } = yield* create(h);
        const service = yield* Discussions.DiscussionService;
        yield* service.stop({ discussionId: discussion.id });
        yield* service.continue({ discussionId: discussion.id });
        yield* Worker.OrchestrationEffectWorkerV2.use((worker) => worker.drain());
        yield* awaitRun(turn.threadId, turn.runId, "interrupted");
        const retry = yield* next(h, discussion, 2);
        assert.equal(retry.threadId, turn.threadId);
        const entry = (yield* Store.DiscussionStore.use((store) =>
          store.listEntries(discussion.id),
        ))[0]!;
        assert.equal(entry.status, "interrupted");
        assert.isNull(entry.files);
        assert.isNull(entry.checkpointRef);
      }),
    { git: false },
  ),
);

it.effect(
  "stop before provider acceptance has no capture task and continue starts without a checkpointId",
  () =>
    withDiscussionHarness((h) =>
      Effect.gen(function* () {
        const service = yield* Discussions.DiscussionService;
        const { discussion } = yield* service.create(input);
        yield* service.stop({ discussionId: discussion.id });
        const resumed = yield* service.continue({ discussionId: discussion.id });
        assert.equal(resumed.discussion.cursor.dispatchNo, 2);
        const retry = yield* next(h, discussion, 2);
        assert.equal(retry.threadId, discussion.seats[0]!.threadId);
        assert.equal(h.started.length, 1);
        const entry = (yield* Store.DiscussionStore.use((store) =>
          store.listEntries(discussion.id),
        ))[0]!;
        assert.equal(entry.status, "interrupted");
        assert.isNull(entry.checkpointRef);
      }),
    ),
);

it.effect.each([
  { closing: false, name: "continue" },
  { closing: true, name: "end" },
])(
  "$name accepts a pending stopped capture, updates the same entry, and dispatches only after its file snapshot",
  ({ closing }) =>
    withDiscussionHarness((h) =>
      Effect.gen(function* () {
        const { discussion, turn } = yield* create(h);
        const service = yield* Discussions.DiscussionService;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        yield* fs.writeFileString(path.join(h.cwd, "a.ts"), "export const interrupted = true;\n");
        yield* h.holdCaptures;
        yield* service.stop({ discussionId: discussion.id });
        const worker = yield* Worker.OrchestrationEffectWorkerV2;
        const draining = yield* worker.drain().pipe(Effect.forkScoped);
        yield* Queue.take(h.captureStarted);
        const store = yield* Store.DiscussionStore;
        const resumed = closing
          ? yield* service.end({
              discussionId: discussion.id,
              summarizerSeatId: discussion.seats[0]!.id,
            })
          : yield* service.continue({ discussionId: discussion.id });
        assert.equal(resumed.discussion.status, closing ? "closing" : "speaking");
        assert.equal(resumed.discussion.cursor.dispatchNo, 1);
        assert.equal(resumed.discussion.cursor.phase, closing ? "final_round" : "regular");
        const pendingEntry = (yield* store.listEntries(discussion.id))[0]!;
        assert.equal(pendingEntry.status, "interrupted");
        assert.isNull(pendingEntry.checkpointRef);
        assert.isNull(pendingEntry.files);
        assert.isUndefined(pendingEntry.finalStatement);
        assert.equal(pendingEntry.dispatchedEntrySeq, 0);
        assert.equal(h.started.length, 1);
        const eventsReady = yield* Deferred.make<void>();
        const updates = yield* service.subscribe({ discussionId: discussion.id }).pipe(
          Stream.tap((event) =>
            event.type === "snapshot" ? Deferred.succeed(eventsReady, undefined) : Effect.void,
          ),
          Stream.filter((event) => event.type === "entry.updated"),
          Stream.take(1),
          Stream.runCollect,
          Effect.forkScoped,
        );
        yield* Deferred.await(eventsReady);
        yield* h.releaseCaptures;
        yield* Fiber.join(draining);
        const retry = yield* next(h, discussion, 2);
        const events = yield* Fiber.join(updates);
        const update = events[0]!;
        assert.equal(update.type === "entry.updated" ? update.entry.id : "", pendingEntry.id);
        assert.equal(
          update.type === "entry.updated" ? update.entry.dispatchedEntrySeq : undefined,
          0,
        );
        assert.deepEqual(update.type === "entry.updated" ? update.entry.files : [], [
          { path: "a.ts", additions: 1, deletions: 0 },
        ]);
        assert.equal(retry.threadId, turn.threadId);
        yield* expectPhase(discussion, retry, closing ? "final_round" : "regular");
        assert.include(retry.message.text, "a.ts：+1 / -0 行");
        if (closing) assert.include(retry.message.text, "这是你本次讨论的最后一次发言");
        assert.equal((yield* store.listEntries(discussion.id)).length, closing ? 2 : 1);
        assert.deepEqual(
          yield* attribution(discussion),
          closing
            ? [
                [1, "statement", undefined, "interrupted"],
                [2, "system", undefined, "completed"],
              ]
            : [[1, "statement", undefined, "interrupted"]],
        );
      }),
    ),
);

it.effect(
  "an exhausted stopped capture wakes an already accepted continue and leaves changes unknown",
  () =>
    withDiscussionHarness((h) =>
      Effect.gen(function* () {
        const { discussion, turn } = yield* create(h);
        const service = yield* Discussions.DiscussionService;
        const worker = yield* Worker.OrchestrationEffectWorkerV2;
        const outbox = yield* Outbox.EffectOutboxV2;
        const sql = yield* SqlClient.SqlClient;
        yield* service.stop({ discussionId: discussion.id });
        yield* worker.runOnce;
        yield* awaitRun(turn.threadId, turn.runId, "interrupted");
        const effectId = `effect:checkpoint.capture:${turn.runId}`;
        const pending = yield* outbox.get(effectId);
        assert.isTrue(Option.isSome(pending));
        // This is a restored final-attempt fixture: four previous captures failed before this process ran.
        yield* sql`UPDATE orchestration_v2_effect_outbox SET attempt_count = 4 WHERE effect_id = ${effectId}`;
        yield* h.failCaptures;
        const resumed = yield* service.continue({ discussionId: discussion.id });
        assert.equal(resumed.discussion.cursor.dispatchNo, 1);
        yield* worker.drain();
        const retry = yield* next(h, discussion, 2);
        assert.equal(retry.threadId, turn.threadId);
        const settled = yield* outbox.get(effectId);
        assert.equal(Option.isSome(settled) ? settled.value.status : "", "failed");
        const entry = (yield* Store.DiscussionStore.use((store) =>
          store.listEntries(discussion.id),
        ))[0]!;
        assert.equal(entry.status, "interrupted");
        assert.isNull(entry.files);
        assert.isNull(entry.checkpointRef);
      }),
    ),
);

it.effect(
  "a stale interrupted event uses the settled durable snapshot before dispatching an accepted continue",
  () =>
    withDiscussionHarness(
      (h) =>
        Effect.gen(function* () {
          const sink = yield* EventSink.EventSinkV2;
          const oldEventParked = yield* Deferred.make<void>();
          const releaseOldEvent = yield* Deferred.make<void>();
          const delayed = Layer.succeed(EventSink.EventSinkV2, {
            ...sink,
            stream: (options) =>
              sink.stream(options).pipe(
                Stream.mapEffect((item) =>
                  Effect.gen(function* () {
                    if (
                      item.event.type === "run.updated" &&
                      item.event.payload.status === "interrupted" &&
                      item.event.payload.checkpointId === null
                    ) {
                      yield* Deferred.succeed(oldEventParked, undefined);
                      yield* Deferred.await(releaseOldEvent);
                    }
                    return item;
                  }),
                ),
              ),
          });
          yield* Effect.gen(function* () {
            const service = yield* Discussions.DiscussionService;
            yield* service.start();
            const { discussion, turn } = yield* create(h);
            const fs = yield* FileSystem.FileSystem;
            const path = yield* Path.Path;
            const store = yield* Store.DiscussionStore;
            const worker = yield* Worker.OrchestrationEffectWorkerV2;
            yield* fs.writeFileString(path.join(h.cwd, "a.ts"), "export const a = 1;\n");
            yield* h.holdCaptures;
            yield* service.stop({ discussionId: discussion.id });
            const draining = yield* worker.drain().pipe(Effect.forkScoped);
            yield* Deferred.await(oldEventParked);
            yield* Queue.take(h.captureStarted);
            const resumed = yield* service.continue({ discussionId: discussion.id });
            assert.equal(resumed.discussion.cursor.dispatchNo, 1);
            const pendingEntry = (yield* store.listEntries(discussion.id))[0]!;
            assert.isNull(pendingEntry.checkpointRef);
            yield* h.releaseCaptures;
            yield* Fiber.join(draining);
            const records = yield* Projections.ProjectionStoreV2.use((projection) =>
              projection.getThreadRecords(turn.threadId, ["runs", "checkpoints"]),
            );
            const persistedRun = records.runs.find((run) => run.id === turn.runId)!;
            const checkpoint = records.checkpoints.find(
              (item) => item.id === persistedRun.checkpointId,
            )!;
            assert.equal(checkpoint.status, "ready");
            const capture = yield* Outbox.EffectOutboxV2.use((outbox) =>
              outbox.get(`effect:checkpoint.capture:${turn.runId}`),
            );
            assert.equal(Option.isSome(capture) ? capture.value.status : "", "succeeded");
            assert.equal((yield* store.getDiscussion(discussion.id))?.cursor.dispatchNo, 1);
            assert.equal(h.started.length, 1);
            const subscribed = yield* Deferred.make<void>();
            const increments = yield* service.subscribe({ discussionId: discussion.id }).pipe(
              Stream.tap((event) =>
                event.type === "snapshot" ? Deferred.succeed(subscribed, undefined) : Effect.void,
              ),
              Stream.filter((event) => event.type !== "snapshot"),
              Stream.takeUntil(
                (event) =>
                  event.type === "discussion.updated" &&
                  event.discussion.cursor.dispatchNo === 2 &&
                  event.discussion.cursor.runId !== null,
              ),
              Stream.runCollect,
              Effect.forkScoped,
            );
            yield* Deferred.await(subscribed);
            yield* Deferred.succeed(releaseOldEvent, undefined);
            const retry = yield* next(h, discussion, 2);
            const events = yield* Fiber.join(increments);
            const entry = (yield* store.listEntries(discussion.id))[0]!;
            assert.equal(
              entry.checkpointRef,
              checkpoint.ref,
              "stale event must retain the durable checkpoint",
            );
            assert.deepEqual(entry.files, [{ path: "a.ts", additions: 1, deletions: 0 }]);
            assert.equal(
              events[0]?.type,
              "entry.updated",
              "attribution must publish before the next dispatch",
            );
            assert.include(retry.message.text, "a.ts：+1 / -0 行");
            assert.equal(retry.threadId, turn.threadId);
          }).pipe(Effect.provide(Discussions.layer.pipe(Layer.provide(delayed), Layer.fresh)));
        }),
      { startReactor: false },
    ),
);

it.effect(
  "capture exhaustion received while paused allows continue before outbox failure settlement",
  () =>
    withDiscussionHarness(
      (h) =>
        Effect.gen(function* () {
          const { discussion, turn } = yield* create(h);
          const original = yield* Discussions.DiscussionService;
          const worker = yield* Worker.OrchestrationEffectWorkerV2;
          const recovery = yield* CaptureRecovery.DiscussionCheckpointRecovery;
          const outbox = yield* Outbox.EffectOutboxV2;
          const sql = yield* SqlClient.SqlClient;
          yield* original.stop({ discussionId: discussion.id });
          yield* worker.runOnce;
          yield* awaitRun(turn.threadId, turn.runId, "interrupted");
          // Stop also enqueues delegated-tasks.stop; settle it with the real executor so the
          // separately controlled worker below claims only this run's checkpoint capture.
          yield* worker.runOnce;
          const effectId = `effect:checkpoint.capture:${turn.runId}`;
          const pendingCapture = yield* outbox.get(effectId);
          assert.equal(Option.isSome(pendingCapture) ? pendingCapture.value.status : "", "pending");
          // Restored final-attempt fixture; the worker still determines retries and settles the actual row.
          yield* sql`UPDATE orchestration_v2_effect_outbox SET attempt_count = 4 WHERE effect_id = ${effectId}`;
          const allowSettlement = yield* Deferred.make<void>();
          const heldRecovery = Layer.succeed(CaptureRecovery.DiscussionCheckpointRecovery, {
            ...recovery,
            exhausted: (capture) =>
              recovery.exhausted(capture).pipe(Effect.andThen(Deferred.await(allowSettlement))),
          });
          const failedCapture = Layer.succeed(Worker.OrchestrationEffectExecutorV2, {
            execute: (effect) =>
              Effect.fail(
                new Worker.OrchestrationEffectExecutionError({
                  effectId: effect.id,
                  effectType: effect.request.type,
                  cause: "t4:final-capture-failure-before-settlement",
                }),
              ),
          });
          const heldWorker = Worker.layer.pipe(
            Layer.provide(
              CaptureRecovery.layerExecutor.pipe(
                Layer.provide(failedCapture),
                Layer.provide(heldRecovery),
              ),
            ),
            Layer.fresh,
          );
          yield* Effect.gen(function* () {
            const service = yield* Discussions.DiscussionService;
            // Start after Stop: the durable boundary excludes the old interrupted event, so only
            // the exhaustion notification can append this statement while the discussion is paused.
            yield* service.start();
            const subscribed = yield* Deferred.make<void>();
            const recorded = yield* service.subscribe({ discussionId: discussion.id }).pipe(
              Stream.tap((event) =>
                event.type === "snapshot" ? Deferred.succeed(subscribed, undefined) : Effect.void,
              ),
              Stream.filter(
                (event) => event.type === "entry.appended" && event.entry.runId === turn.runId,
              ),
              Stream.take(1),
              Stream.runCollect,
              Effect.forkScoped,
            );
            yield* Deferred.await(subscribed);
            const executing = yield* Worker.OrchestrationEffectWorkerV2.use(
              (held) => held.runOnce,
            ).pipe(Effect.provide(heldWorker), Effect.forkScoped);
            yield* Effect.gen(function* () {
              const notification = (yield* Fiber.join(recorded))[0]!;
              assert.equal(
                notification.type === "entry.appended" ? notification.entry.status : "",
                "interrupted",
              );
              const row = yield* outbox.get(effectId);
              assert.equal(Option.isSome(row) ? row.value.status : "", "running");
              assert.equal(
                (yield* Store.DiscussionStore.use((store) => store.getDiscussion(discussion.id)))
                  ?.status,
                "paused",
              );
              const resumed = yield* service.continue({ discussionId: discussion.id });
              assert.equal(
                resumed.discussion.cursor.dispatchNo,
                2,
                "received exhaustion must unblock continue before settlement",
              );
              assert.notEqual(resumed.discussion.cursor.runId, turn.runId);
            }).pipe(Effect.ensuring(Deferred.succeed(allowSettlement, undefined)));
            yield* Fiber.join(executing);
            const settled = yield* outbox.get(effectId);
            assert.equal(Option.isSome(settled) ? settled.value.status : "", "failed");
            assert.equal(Option.isSome(settled) ? settled.value.attemptCount : 0, 5);
            const retry = yield* next(h, discussion, 2);
            assert.equal(retry.threadId, turn.threadId);
            const entry = (yield* Store.DiscussionStore.use((store) =>
              store.listEntries(discussion.id),
            ))[0]!;
            assert.isNull(entry.files);
            assert.isNull(entry.checkpointRef);
          });
        }),
      { startReactor: false },
    ),
);

it.effect(
  "a write attempted while snapshot reading is blocked appears exactly once after that snapshot",
  () =>
    withDiscussionHarness((h) =>
      Effect.gen(function* () {
        const { discussion } = yield* create(h);
        const store = yield* Store.DiscussionStore;
        const readStarted = yield* Deferred.make<void>();
        const allowRead = yield* Deferred.make<void>();
        let intercept = true;
        const delayed = Layer.succeed(Store.DiscussionStore, {
          ...store,
          // Only validation uses the already persisted, unchanged discussion; transcript reads
          // and writes still use real SQLite. The eager writer can reach the permit before yielding.
          getDiscussion: (...args) =>
            Effect.suspend(() =>
              intercept ? store.getDiscussion(...args) : Effect.succeed(discussion),
            ),
          listEntries: (...args) =>
            Effect.gen(function* () {
              if (intercept) {
                intercept = false;
                yield* Deferred.succeed(readStarted, undefined);
                yield* Deferred.await(allowRead);
              }
              return yield* store.listEntries(...args);
            }),
        });
        yield* Effect.gen(function* () {
          const service = yield* Discussions.DiscussionService;
          const reader = yield* service
            .subscribe({ discussionId: discussion.id })
            .pipe(Stream.take(3), Stream.runCollect, Effect.forkScoped);
          yield* Deferred.await(readStarted);
          const writer = yield* service
            .interject({ discussionId: discussion.id, text: "快照读取期间请求插话" })
            .pipe(Effect.forkScoped({ startImmediately: true }));
          yield* Effect.gen(function* () {
            // The eager writer has reached either the publication permit or the SQLite transaction.
            // This separate read waits behind an entered transaction before we release the snapshot.
            assert.deepEqual(
              yield* store.listEntries(discussion.id),
              [],
              "an interjection must not commit while its subscriber is reading the snapshot",
            );
          }).pipe(Effect.ensuring(Deferred.succeed(allowRead, undefined)));
          yield* Fiber.join(writer);
          const events = yield* Fiber.join(reader);
          assert.deepEqual(
            events.map((event) => event.type),
            ["snapshot", "entry.appended", "discussion.updated"],
          );
          assert.deepEqual(events[0]?.type === "snapshot" ? events[0].entries : [], []);
          assert.equal(
            events[1]?.type === "entry.appended" ? events[1].entry.text : "",
            "快照读取期间请求插话",
          );
        }).pipe(Effect.provide(Discussions.layer.pipe(Layer.provide(delayed), Layer.fresh)));
      }),
    ),
);

it.effect(
  "a terminal run committed before sendToThread returns is recorded and advances exactly once",
  () =>
    withDiscussionHarness(
      (h) =>
        Effect.gen(function* () {
          const underlying = yield* Threads.ThreadManagementService;
          const events = yield* EventSink.EventSinkV2;
          const projections = yield* Projections.ProjectionStoreV2;
          const store = yield* Store.DiscussionStore;
          const eventBeforeBinding = yield* Deferred.make<Discussion["cursor"]>();
          const observedEvents = Layer.succeed(EventSink.EventSinkV2, {
            ...events,
            stream: (options) =>
              events.stream(options).pipe(
                Stream.tap(({ event }) =>
                  Effect.gen(function* () {
                    if (event.type !== "run.updated") return;
                    const shell = yield* projections.getThreadShell(event.threadId);
                    if (!shell?.discussion) return;
                    const discussion = yield* store.getDiscussion(shell.discussion.discussionId);
                    if (!discussion) return yield* Effect.die("Dispatched seat has no discussion");
                    yield* Deferred.succeed(eventBeforeBinding, discussion.cursor);
                  }).pipe(Effect.orDie),
                ),
              ),
          });
          const testContext = yield* Effect.context<
            | EventSink.EventSinkV2
            | Worker.OrchestrationEffectWorkerV2
            | Projections.ProjectionStoreV2
          >();
          let first = true;
          const immediate = Layer.succeed(Threads.ThreadManagementService, {
            ...underlying,
            sendToThread: (input) =>
              Effect.gen(function* () {
                const sent = yield* underlying.sendToThread(input);
                if (first) {
                  first = false;
                  yield* Worker.OrchestrationEffectWorkerV2.use((worker) => worker.drain());
                  const turn = yield* Queue.take(h.starts);
                  yield* awaitProviderTurn(turn);
                  yield* finish(h, turn, ["返回派发结果前已经完成的原文"]);
                  // An earlier run update may already be waiting on the discussion lock, buffering
                  // completion behind it. Observe that stream before returning and binding the cursor.
                  yield* Deferred.await(eventBeforeBinding);
                }
                return sent;
              }).pipe(Effect.orDie, Effect.provide(testContext)),
          });
          yield* Effect.gen(function* () {
            const service = yield* Discussions.DiscussionService;
            yield* service.start();
            const { discussion } = yield* service.create(input);
            const beforeBinding = yield* Deferred.await(eventBeforeBinding);
            assert.equal(beforeBinding.dispatchNo, 1);
            assert.isNull(beforeBinding.runId);
            yield* service.subscribe({ discussionId: discussion.id }).pipe(
              Stream.filter(
                (event) =>
                  (event.type === "snapshot" || event.type === "discussion.updated") &&
                  event.discussion.cursor.dispatchNo === 2 &&
                  event.discussion.cursor.runId !== null,
              ),
              Stream.take(1),
              Stream.runDrain,
            );
            const entries = yield* Store.DiscussionStore.use((store) =>
              store.listEntries(discussion.id),
            );
            assert.equal(entries.length, 1);
            assert.equal(entries[0]?.text, "返回派发结果前已经完成的原文");
            const stored = yield* Store.DiscussionStore.use((store) =>
              store.getDiscussion(discussion.id),
            );
            assert.equal(stored?.cursor.seatIndex, 1);
            assert.equal(stored?.cursor.dispatchNo, 2);
          }).pipe(
            Effect.provide(
              Discussions.layer.pipe(
                Layer.provide(immediate),
                Layer.provide(observedEvents),
                Layer.fresh,
              ),
            ),
          );
        }),
      { startReactor: false },
    ),
);

it.effect.each([
  {
    priorSnapshot: true,
    name: "real Git attribution skips a failed seat and starts at the nearest earlier statement snapshot",
  },
  {
    priorSnapshot: false,
    name: "real Git attribution after a first failed seat starts at the first run baseline",
  },
])("$name", ({ priorSnapshot }) =>
  withDiscussionHarness((h) =>
    Effect.gen(function* () {
      const { discussion, turn } = yield* create(h);
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const store = yield* Store.DiscussionStore;
      const threads = yield* Threads.ThreadManagementService;
      const service = yield* Discussions.DiscussionService;
      yield* fs.writeFileString(path.join(h.cwd, "a.ts"), "export const a = 1;\n");
      let failed = turn;
      if (priorSnapshot) {
        yield* finish(h, turn);
        failed = yield* next(h, discussion, 2);
        yield* fs.writeFileString(path.join(h.cwd, "b.ts"), "export const b = 1;\n");
      }
      yield* finish(h, failed, ["失败的发言"], "failed", {
        class: "provider_error",
        message: "无法完成",
        code: null,
        retryable: false,
      });
      yield* awaitDiscussion(discussion, (value) => value.status === "paused");
      const paused = (yield* store.getDiscussion(discussion.id))!;
      const seatIndex = priorSnapshot ? 0 : 1;
      const seat = discussion.seats[seatIndex]!;
      // Reconstructed durable handoff fixture isolates attribution from the normal failure pause/retry policy.
      const sent = yield* threads.sendToThread({
        projectId,
        commandId: CommandId.make("t4:restored-handoff"),
        threadId: seat.threadId,
        messageId: MessageId.make("t4:restored-handoff"),
        text: "恢复的下一位发言",
        attachments: [],
        mode: "queue",
        createdBy: "user",
        creationSource: "server",
      });
      yield* store.updateDiscussion({
        ...paused,
        status: "speaking",
        pause: null,
        cursor: {
          ...paused.cursor,
          seatIndex,
          runId: sent.run.id,
          dispatchNo: paused.cursor.dispatchNo + 1,
        },
      });
      yield* Worker.OrchestrationEffectWorkerV2.use((worker) => worker.drain());
      const success = yield* Queue.take(h.starts);
      yield* awaitProviderTurn(success);
      yield* fs.writeFileString(
        path.join(h.cwd, priorSnapshot ? "c.ts" : "b.ts"),
        "export const later = 1;\n",
      );
      yield* finish(h, success);
      yield* awaitDiscussion(
        discussion,
        (value) =>
          value.cursor.dispatchNo === paused.cursor.dispatchNo + 2 && value.cursor.runId !== null,
      );
      const entries = yield* store.listEntries(discussion.id);
      assert.isNull(entries.find((entry) => entry.runId === failed.runId)!.checkpointRef);
      const entry = entries.find((entry) => entry.runId === success.runId)!;
      assert.deepEqual(
        entry.files?.map((file) => file.path),
        priorSnapshot ? ["b.ts", "c.ts"] : ["a.ts", "b.ts"],
      );
      const diff = yield* service.getEntryDiff({
        discussionId: discussion.id,
        entryId: entry.id,
      });
      assert.include(diff.diff, "diff --git a/b.ts b/b.ts");
      if (priorSnapshot) assert.notInclude(diff.diff, "a.ts");
      else assert.include(diff.diff, "diff --git a/a.ts b/a.ts");
    }),
  ),
);

it.effect.each(["running", "speaking", "closing", "interrupted", "failed", "unbound"] as const)(
  "a freshly rebuilt service repairs persisted %s state and pauses without advancing",
  (state) =>
    withDiscussionHarness(
      (h) =>
        Effect.gen(function* () {
          const { discussion, turn } = yield* create(h);
          const service = yield* Discussions.DiscussionService;
          const store = yield* Store.DiscussionStore;
          if (state === "closing")
            yield* service.end({
              discussionId: discussion.id,
              summarizerSeatId: discussion.seats[0]!.id,
            });
          if (state === "interrupted") yield* service.stop({ discussionId: discussion.id });
          if (state === "interrupted") {
            yield* Worker.OrchestrationEffectWorkerV2.use((worker) => worker.drain());
            yield* awaitRun(turn.threadId, turn.runId, "interrupted");
            yield* store.updateDiscussion({
              ...(yield* store.getDiscussion(discussion.id))!,
              status: "speaking",
              pause: null,
            });
          } else if (state !== "running")
            yield* finish(
              h,
              turn,
              ["重启前尚未记账的原文"],
              state === "failed" ? "failed" : "completed",
              state === "failed"
                ? { class: "provider_error", message: "失败原文", code: null, retryable: false }
                : undefined,
            );
          if (state === "unbound") {
            yield* store.updateDiscussion({
              ...(yield* store.getDiscussion(discussion.id))!,
              cursor: { ...discussion.cursor, runId: null },
            });
            const sql = yield* SqlClient.SqlClient;
            yield* sql`DELETE FROM discussion_seat_delivery WHERE discussion_id = ${discussion.id}`;
          }
          const beforeRepair = yield* store.listEntries(discussion.id);
          assert.equal(beforeRepair.length, state === "closing" ? 1 : 0);
          if (state === "closing") assert.equal(beforeRepair[0]?.text, "讨论到此");
          yield* Effect.gen(function* () {
            const rebuilt = yield* Discussions.DiscussionService;
            yield* rebuilt.start();
            const repaired = (yield* store.getDiscussion(discussion.id))!;
            assert.equal(repaired.status, "paused");
            assert.equal(repaired.pause?.reason, "server_restarted");
            assert.equal(repaired.cursor.dispatchNo, 1);
            assert.equal(repaired.cursor.seatIndex, 0);
            const entry = (yield* store.listEntries(discussion.id)).find(
              (item) => item.runId === turn.runId,
            );
            if (state === "running") assert.isUndefined(entry);
            else {
              assert.equal(
                entry?.status,
                state === "failed"
                  ? "failed"
                  : state === "interrupted"
                    ? "interrupted"
                    : "completed",
              );
              if (state !== "interrupted") assert.equal(entry?.text, "重启前尚未记账的原文");
            }
            assert.equal(h.started.length, 1);
            if (state === "unbound") {
              assert.equal(yield* store.getSeatDelivery(discussion.id, discussion.seats[0]!.id), 0);
              yield* rebuilt.continue({ discussionId: discussion.id });
              const retry = yield* next(h, discussion, 2);
              assert.notInclude(retry.message.text, "议题全文第二行");
            }
          }).pipe(Effect.provide(Discussions.layer.pipe(Layer.fresh)));
        }),
      { startReactor: false },
    ),
);

it.effect("replayed completed run events append once and dispatch the next seat once", () =>
  withDiscussionHarness((h) =>
    Effect.gen(function* () {
      const { discussion, turn } = yield* create(h);
      const sink = yield* EventSink.EventSinkV2;
      yield* finish(h, turn, ["幂等原文"]);
      const event = (yield* sink
        .stream({ threadId: turn.threadId, eventType: "run.updated", bounded: false })
        .pipe(
          Stream.filter(
            ({ event }) => event.type === "run.updated" && event.payload.status === "completed",
          ),
          Stream.take(1),
          Stream.runCollect,
        ))[0]!.event;
      yield* sink.write({
        events: [
          { ...event, id: EventId.make(`${event.id}:replay1`) },
          { ...event, id: EventId.make(`${event.id}:replay2`) },
        ],
      });
      const b = yield* next(h, discussion, 2);
      const store = yield* Store.DiscussionStore;
      assert.equal(b.threadId, discussion.seats[1]!.threadId);
      assert.equal(
        (yield* store.listEntries(discussion.id)).filter((entry) => entry.runId === turn.runId)
          .length,
        1,
      );
      assert.equal((yield* store.getDiscussion(discussion.id))?.cursor.dispatchNo, 2);
      assert.equal(h.started.length, 2);
    }),
  ),
);

it.effect(
  "slow subscribers receive snapshot then every increment; deleting archives seats and closes with deleted",
  () =>
    withDiscussionHarness((h) =>
      Effect.gen(function* () {
        const { discussion, turn } = yield* create(h);
        const service = yield* Discussions.DiscussionService;
        const store = yield* Store.DiscussionStore;
        assert.equal(
          (yield* service.delete({ discussionId: discussion.id }).pipe(Effect.flip)).reason,
          "invalid_state",
        );
        yield* service.interject({ discussionId: discussion.id, text: "订阅前原文" });
        const snapshotReady = yield* Deferred.make<void>();
        const resumeReader = yield* Deferred.make<void>();
        const received: import("@t3tools/contracts").DiscussionSubscriptionEvent[] = [];
        const subscription = yield* service.subscribe({ discussionId: discussion.id }).pipe(
          Stream.runForEach((event) =>
            Effect.gen(function* () {
              received.push(event);
              if (event.type === "snapshot") {
                yield* Deferred.succeed(snapshotReady, undefined);
                yield* Deferred.await(resumeReader);
              }
            }),
          ),
          Effect.forkScoped,
        );
        yield* Deferred.await(snapshotReady);
        for (let index = 0; index < 20; index++)
          yield* service.interject({ discussionId: discussion.id, text: `订阅期间原文 ${index}` });
        yield* service.stop({ discussionId: discussion.id });
        assert.equal(
          (yield* service.delete({ discussionId: discussion.id }).pipe(Effect.flip)).reason,
          "invalid_state",
        );
        yield* Worker.OrchestrationEffectWorkerV2.use((worker) => worker.drain());
        yield* awaitRun(turn.threadId, turn.runId, "interrupted");
        const threads = yield* Threads.ThreadManagementService;
        yield* threads.dispatch({
          type: "thread.archive",
          commandId: CommandId.make("t4:already-archived"),
          threadId: discussion.seats[0]!.threadId,
        });
        yield* service.delete({ discussionId: discussion.id });
        yield* Deferred.succeed(resumeReader, undefined);
        yield* Fiber.join(subscription);
        assert.equal(received[0]?.type, "snapshot");
        const snapshot = received[0]!;
        assert.equal(snapshot.type === "snapshot" ? snapshot.entries[0]?.text : "", "订阅前原文");
        assert.deepEqual(
          received
            .filter((event) => event.type === "entry.appended" && event.entry.kind === "user")
            .map((event) => (event.type === "entry.appended" ? event.entry.text : "")),
          Array.from({ length: 20 }, (_, index) => `订阅期间原文 ${index}`),
        );
        assert.deepEqual(received.at(-1), {
          type: "discussion.deleted",
          discussionId: discussion.id,
        });
        for (const seat of discussion.seats)
          assert.isNotNull((yield* threads.getThreadShell(seat.threadId))?.archivedAt);
        assert.isNull(yield* store.getDiscussion(discussion.id));
        assert.deepEqual(yield* store.listEntries(discussion.id), []);
        assert.deepEqual((yield* service.list()).discussions, []);
      }),
    ),
);

it.effect(
  "list subscriptions publish compact full lists for all projects sorted by latest update",
  () =>
    withDiscussionHarness((h) =>
      Effect.gen(function* () {
        const service = yield* Discussions.DiscussionService;
        const initial = yield* service.subscribeList().pipe(Stream.take(1), Stream.runCollect);
        assert.deepEqual(initial, [{ discussions: [] }]);
        const { discussion } = yield* create(h);
        const store = yield* Store.DiscussionStore;
        const otherId = DiscussionId.make("discussion:t4-other-project");
        yield* store.createDiscussion({
          ...discussion,
          id: otherId,
          projectId: ProjectId.make("project:t4-other"),
          title: "另一项目的讨论",
          updatedAt: "1969-12-31T00:00:00.000Z",
        });
        const list = yield* service.subscribeList().pipe(Stream.take(1), Stream.runCollect);
        assert.deepEqual(
          list[0]?.discussions.map((item) => item.id),
          [discussion.id, otherId],
        );
        assert.equal(list[0]?.discussions[1]?.projectId, "project:t4-other");
        const item = list[0]!.discussions[0]!;
        assert.deepEqual(item.cursor, { seatIndex: 0, round: 1 });
        assert.notProperty(item, "topic");
        assert.notProperty(item.seats[0]!, "personaPrompt");
        const ready = yield* Deferred.make<void>();
        const snapshots = yield* service.subscribeList().pipe(
          Stream.tap(() => Deferred.succeed(ready, undefined)),
          Stream.take(2),
          Stream.runCollect,
          Effect.forkScoped,
        );
        yield* Deferred.await(ready);
        yield* service.interject({ discussionId: discussion.id, text: "列表变更" });
        const values = yield* Fiber.join(snapshots);
        assert.equal(values[1]?.discussions[0]?.id, discussion.id);
        assert.deepEqual(
          values[1]?.discussions.map((item) => item.id),
          [discussion.id, otherId],
        );
      }),
    ),
);

it.effect(
  "a second seat launch failure archives the first seat and preserves the launch error",
  () =>
    withDiscussionHarness((h) =>
      Effect.gen(function* () {
        const launch = yield* Launch.ThreadLaunchService;
        const threads = yield* Threads.ThreadManagementService;
        const store = yield* Store.DiscussionStore;
        const failure = new Launch.ThreadLaunchError({
          commandId: CommandId.make("t4:second-seat-launch-failed"),
          projectId,
          operation: "create-thread",
          cause: new Error("second seat launch failed"),
        });
        let calls = 0;
        const failSecond = Layer.succeed(Launch.ThreadLaunchService, {
          ...launch,
          launch: (request) => (++calls === 2 ? Effect.fail(failure) : launch.launch(request)),
        });
        yield* Effect.gen(function* () {
          const service = yield* Discussions.DiscussionService;
          const error = yield* service.create(input).pipe(Effect.flip);
          assert.equal(error.reason, "orchestration_error");
          assert.strictEqual(
            error.cause,
            failure,
            "cleanup must preserve the original launch failure",
          );
          const seat = h.launched[0]!;
          assert.deepEqual((yield* service.list()).discussions, []);
          assert.isNull(yield* store.getDiscussion(seat.discussion!.discussionId));
          const shell = yield* threads.getThreadShell(seat.threadId!);
          assert.isNotNull(shell);
          assert.isNotNull(
            shell!.archivedAt,
            "the first committed seat must be archived after failure",
          );
        }).pipe(Effect.provide(Discussions.layer.pipe(Layer.provide(failSecond), Layer.fresh)));
      }),
    ),
);

it.effect(
  "interruption during the second seat launch archives the first seat before returning",
  () =>
    withDiscussionHarness((h) =>
      Effect.gen(function* () {
        const launch = yield* Launch.ThreadLaunchService;
        const threads = yield* Threads.ThreadManagementService;
        const store = yield* Store.DiscussionStore;
        const secondStarted = yield* Deferred.make<void>();
        let calls = 0;
        const holdSecond = Layer.succeed(Launch.ThreadLaunchService, {
          ...launch,
          launch: (request) =>
            ++calls === 2
              ? Deferred.succeed(secondStarted, undefined).pipe(Effect.andThen(Effect.never))
              : launch.launch(request),
        });
        yield* Effect.gen(function* () {
          const service = yield* Discussions.DiscussionService;
          const creating = yield* service.create(input).pipe(Effect.forkScoped);
          yield* Deferred.await(secondStarted);
          yield* Fiber.interrupt(creating);
          const exit = yield* Fiber.await(creating);
          assert.isTrue(Exit.isFailure(exit));
          assert.isTrue(
            Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause),
            "cleanup must retain interruption rather than turn it into a domain failure",
          );
          const seat = h.launched[0]!;
          assert.deepEqual((yield* service.list()).discussions, []);
          assert.isNull(yield* store.getDiscussion(seat.discussion!.discussionId));
          const shell = yield* threads.getThreadShell(seat.threadId!);
          assert.isNotNull(shell);
          assert.isNotNull(
            shell!.archivedAt,
            "the first committed seat must be archived before exit",
          );
        }).pipe(Effect.provide(Discussions.layer.pipe(Layer.provide(holdSecond), Layer.fresh)));
      }),
    ),
);

it.effect(
  "a cleanup archive failure preserves the launch failure and still archives remaining seats",
  () =>
    withDiscussionHarness((h) =>
      Effect.gen(function* () {
        const launch = yield* Launch.ThreadLaunchService;
        const threads = yield* Threads.ThreadManagementService;
        const store = yield* Store.DiscussionStore;
        const failure = new Launch.ThreadLaunchError({
          commandId: CommandId.make("t4:third-seat-launch-failed-after-commit"),
          projectId,
          operation: "create-thread",
          cause: new Error("third seat failed after committing its thread"),
        });
        let calls = 0;
        const failThird = Layer.succeed(Launch.ThreadLaunchService, {
          ...launch,
          launch: (request) =>
            Effect.gen(function* () {
              const result = yield* launch.launch(request);
              if (++calls === 3) return yield* failure;
              return result;
            }),
        });
        const failFirstArchive = Layer.succeed(Threads.ThreadManagementService, {
          ...threads,
          dispatch: (command) =>
            command.type === "thread.archive" && command.threadId === h.launched[0]?.threadId
              ? Effect.die(new Error("first seat archive failed"))
              : threads.dispatch(command),
        });
        yield* Effect.gen(function* () {
          const service = yield* Discussions.DiscussionService;
          const exit = yield* service
            .create({ ...input, seats: [...input.seats, input.seats[0]!] })
            .pipe(Effect.exit);
          const error = Exit.findErrorOption(exit);
          assert.isTrue(Option.isSome(error));
          assert.strictEqual(Option.isSome(error) ? error.value.cause : undefined, failure);
          assert.equal(
            Exit.isFailure(exit) ? exit.cause.reasons.length : 0,
            1,
            "cleanup failures must not be merged into the original failure",
          );
          assert.deepEqual((yield* service.list()).discussions, []);
          assert.isNull(yield* store.getDiscussion(h.launched[0]!.discussion!.discussionId));
          assert.isNull((yield* threads.getThreadShell(h.launched[0]!.threadId!))?.archivedAt);
          assert.isNotNull((yield* threads.getThreadShell(h.launched[1]!.threadId!))?.archivedAt);
          assert.isNotNull((yield* threads.getThreadShell(h.launched[2]!.threadId!))?.archivedAt);
        }).pipe(
          Effect.provide(
            Discussions.layer.pipe(
              Layer.provide(failThird),
              Layer.provide(failFirstArchive),
              Layer.fresh,
            ),
          ),
        );
      }),
    ),
);

it.effect(
  "a first discussion save failure archives every launched seat and preserves the original error",
  () =>
    withDiscussionHarness((h) =>
      Effect.gen(function* () {
        const store = yield* Store.DiscussionStore;
        const threads = yield* Threads.ThreadManagementService;
        const failure = new DiscussionError({
          reason: "orchestration_error",
          message: "t4:first-discussion-save-failed",
        });
        const failSave = Layer.succeed(Store.DiscussionStore, {
          ...store,
          createDiscussion: () => Effect.fail(failure),
        });
        yield* Effect.gen(function* () {
          const service = yield* Discussions.DiscussionService;
          const error = yield* service.create(input).pipe(Effect.flip);
          assert.strictEqual(error, failure, "cleanup must preserve the original save failure");
          assert.equal(h.launched.length, 2, "both seats must launch before the save fails");
          const id = h.launched[0]!.discussion!.discussionId;
          assert.deepEqual((yield* service.list()).discussions, []);
          assert.isNull(yield* store.getDiscussion(id));
          const firstShell = yield* threads.getThreadShell(h.launched[0]!.threadId!);
          const secondShell = yield* threads.getThreadShell(h.launched[1]!.threadId!);
          assert.isNotNull(firstShell);
          assert.isNotNull(secondShell);
          assert.isNotNull(
            firstShell!.archivedAt,
            "the first seat must be archived after the initial save fails",
          );
          assert.isNotNull(
            secondShell!.archivedAt,
            "the second seat must be archived after the initial save fails",
          );
        }).pipe(Effect.provide(Discussions.layer.pipe(Layer.provide(failSave), Layer.fresh)));
      }),
    ),
);

it.effect(
  "interruption before the first discussion save completes archives every launched seat before exit",
  () =>
    withDiscussionHarness((h) =>
      Effect.gen(function* () {
        const store = yield* Store.DiscussionStore;
        const threads = yield* Threads.ThreadManagementService;
        const saveEntered = yield* Deferred.make<void>();
        const holdSave = Layer.succeed(Store.DiscussionStore, {
          ...store,
          createDiscussion: () =>
            Deferred.succeed(saveEntered, undefined).pipe(Effect.andThen(Effect.never)),
        });
        yield* Effect.gen(function* () {
          const service = yield* Discussions.DiscussionService;
          const creating = yield* service.create(input).pipe(Effect.forkScoped);
          yield* Deferred.await(saveEntered);
          assert.equal(h.launched.length, 2, "both seats must launch before the save blocks");
          yield* Fiber.interrupt(creating);
          const exit = yield* Fiber.await(creating);
          assert.isTrue(
            Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause),
            "initial-save cleanup must retain interruption",
          );
          const id = h.launched[0]!.discussion!.discussionId;
          assert.deepEqual((yield* service.list()).discussions, []);
          assert.isNull(yield* store.getDiscussion(id));
          const firstShell = yield* threads.getThreadShell(h.launched[0]!.threadId!);
          const secondShell = yield* threads.getThreadShell(h.launched[1]!.threadId!);
          assert.isNotNull(firstShell);
          assert.isNotNull(secondShell);
          assert.isNotNull(
            firstShell!.archivedAt,
            "the first seat must be archived before the interrupted create exits",
          );
          assert.isNotNull(
            secondShell!.archivedAt,
            "the second seat must be archived before the interrupted create exits",
          );
        }).pipe(Effect.provide(Discussions.layer.pipe(Layer.provide(holdSave), Layer.fresh)));
      }),
    ),
);

it.effect(
  "a publication failure after the first discussion commit preserves its seats and original error",
  () =>
    withDiscussionHarness((h) =>
      Effect.gen(function* () {
        const store = yield* Store.DiscussionStore;
        const threads = yield* Threads.ThreadManagementService;
        const failure = new DiscussionError({
          reason: "orchestration_error",
          message: "t4:initial-list-publication-failed",
        });
        let firstList = true;
        const failPublication = Layer.succeed(Store.DiscussionStore, {
          ...store,
          // mutate reads the list after its real SQL transaction commits. Failing this read
          // exercises committed ownership without pretending that a store write itself commits.
          listDiscussions: () =>
            Effect.suspend(() => {
              if (!firstList) return store.listDiscussions();
              firstList = false;
              return Effect.fail(failure);
            }),
        });
        yield* Effect.gen(function* () {
          const service = yield* Discussions.DiscussionService;
          const error = yield* service.create(input).pipe(Effect.flip);
          assert.strictEqual(error, failure);
          assert.equal(h.launched.length, 2);
          const id = h.launched[0]!.discussion!.discussionId;
          const persisted = yield* store.getDiscussion(id);
          assert.isNotNull(persisted, "the real initial transaction must have committed");
          assert.equal(persisted!.cursor.dispatchNo, 0, "failure occurs before initial dispatch");
          assert.deepEqual(
            (yield* service.list()).discussions.map((item) => item.id),
            [id],
          );
          assert.isNull(
            (yield* threads.getThreadShell(h.launched[0]!.threadId!))?.archivedAt,
            "a committed discussion owns the first seat even when publication fails",
          );
          assert.isNull(
            (yield* threads.getThreadShell(h.launched[1]!.threadId!))?.archivedAt,
            "a committed discussion owns the second seat even when publication fails",
          );
        }).pipe(
          Effect.provide(Discussions.layer.pipe(Layer.provide(failPublication), Layer.fresh)),
        );
      }),
    ),
);

it.effect("rejects one unsupported seat before creating any thread", () =>
  withDiscussionHarness((h) =>
    Effect.gen(function* () {
      const service = yield* Discussions.DiscussionService;
      const result = yield* service
        .create({
          ...input,
          seats: [
            input.seats[0]!,
            {
              ...input.seats[1]!,
              modelSelection: { ...model, instanceId: ProviderInstanceId.make("unsupported") },
            },
          ],
        })
        .pipe(Effect.flip);
      assert.equal(result.reason, "provider_unsupported");
      assert.deepEqual(h.launched, []);
      assert.deepEqual((yield* service.list()).discussions, []);
      assert.deepEqual((yield* service.providerSupport()).instances, [
        { instanceId: model.instanceId, supported: true },
        { instanceId: ProviderInstanceId.make("unsupported"), supported: false },
      ]);
    }),
  ),
);

it.effect(
  "creates independent marked seat threads and sends the first complete material with trusted identity",
  () =>
    withDiscussionHarness((h) =>
      Effect.gen(function* () {
        const { discussion, turn } = yield* create(h);
        const threads = yield* Threads.ThreadManagementService;
        assert.equal(discussion.title, "原始议题标题");
        assert.equal(discussion.status, "speaking");
        assert.equal(discussion.cursor.round, 1);
        assert.equal(discussion.cursor.dispatchNo, 1);
        assert.equal(h.launched.length, 2);
        assert.notEqual(discussion.seats[0]!.threadId, discussion.seats[1]!.threadId);
        assert.deepEqual(
          (yield* threads.getThreadShell(discussion.seats[0]!.threadId))?.discussion,
          { discussionId: discussion.id, seatId: discussion.seats[0]!.id },
        );
        assert.deepEqual(
          (yield* threads.getThreadShell(discussion.seats[1]!.threadId))?.discussion,
          { discussionId: discussion.id, seatId: discussion.seats[1]!.id },
        );
        assert.include(turn.message.text, "议题全文第二行");
        assert.include(turn.message.text, "你是「架构师」（座位 1/2）");
        assert.deepEqual(turn.developerContext, [
          {
            key: "t3_discussion_persona",
            text: `你正处于多方讨论。只以自己的身份发言，不代替别人说话。可以修改共享工作区的文件，但必须在发言里写明改了什么。不要复述材料原文。\n\n${discussion.seats[0]!.personaPrompt}`,
          },
        ]);
      }),
    ),
);

it.effect(
  "concatenates all assistant messages, delivers full previous speech, and loops into round two",
  () =>
    withDiscussionHarness((h) =>
      Effect.gen(function* () {
        const { discussion, turn } = yield* create(h);
        yield* finish(h, turn, ["第一段原文\n保留换行", "第二段原文"]);
        yield* awaitDiscussion(
          discussion,
          (value) => value.cursor.dispatchNo === 2 && value.cursor.runId !== null,
        );
        yield* Worker.OrchestrationEffectWorkerV2.use((worker) => worker.drain());
        const second = yield* Queue.take(h.starts);
        const store = yield* Store.DiscussionStore;
        assert.equal(
          (yield* store.listEntries(discussion.id))[0]?.text,
          "第一段原文\n保留换行\n\n第二段原文",
        );
        assert.include(second.message.text, "第一段原文\n保留换行\n\n第二段原文");
        assert.equal(second.threadId, discussion.seats[1]!.threadId);
        yield* awaitRun(second.threadId, second.runId, "running");
        yield* finish(h, second, ["第二位发言原文"]);
        yield* awaitDiscussion(
          discussion,
          (value) => value.cursor.dispatchNo === 3 && value.cursor.runId !== null,
        );
        const updated = yield* store.getDiscussion(discussion.id);
        assert.equal(updated?.cursor.seatIndex, 0);
        assert.equal(updated?.cursor.round, 2);
        assert.equal(updated?.status, "speaking");
        assert.deepEqual(
          (yield* store.listEntries(discussion.id)).map((entry) => entry.round),
          [1, 1],
        );
      }),
    ),
);

it.effect(
  "each interrupted and retried opening freezes its own position around intervening interjections",
  () =>
    withDiscussionHarness((h) =>
      Effect.gen(function* () {
        const { discussion, turn } = yield* create(h);
        const service = yield* Discussions.DiscussionService;
        const store = yield* Store.DiscussionStore;
        const first = yield* service.interject({
          discussionId: discussion.id,
          text: "首次开口之后",
        });
        yield* service.stop({ discussionId: discussion.id });
        yield* Worker.OrchestrationEffectWorkerV2.use((worker) => worker.drain());
        yield* awaitRun(turn.threadId, turn.runId, "interrupted");
        const between = yield* service.interject({
          discussionId: discussion.id,
          text: "两次开口之间",
        });
        yield* service.continue({ discussionId: discussion.id });
        const retry = yield* next(h, discussion, 2);
        const during = yield* service.interject({
          discussionId: discussion.id,
          text: "重新开口之后",
        });
        yield* finish(h, retry, ["重说的普通发言"]);
        yield* next(h, discussion, 3);
        assert.equal(retry.threadId, turn.threadId);
        assert.deepEqual(yield* dispatchPositions(discussion), [
          [1, "user", undefined, false],
          [2, "statement", 0, true],
          [3, "user", undefined, false],
          [4, "user", undefined, false],
          [5, "statement", 3, true],
        ]);
        const old = (yield* store.getEntryByRunId(turn.runId))!;
        const retried = (yield* store.getEntryByRunId(retry.runId))!;
        assert.equal(old.status, "interrupted");
        assert.equal(retried.status, "completed");
        assert.isAbove(first.entry.seq, old.dispatchedEntrySeq!);
        assert.isAbove(between.entry.seq, old.dispatchedEntrySeq!);
        assert.isAtMost(between.entry.seq, retried.dispatchedEntrySeq!);
        assert.isAbove(during.entry.seq, retried.dispatchedEntrySeq!);
      }),
    ),
);

it.effect(
  "a failed ordinary statement retains the position of its dispatch before a later interjection",
  () =>
    withDiscussionHarness((h) =>
      Effect.gen(function* () {
        const { discussion, turn } = yield* create(h);
        const service = yield* Discussions.DiscussionService;
        yield* service.interject({ discussionId: discussion.id, text: "失败前插话" });
        yield* finish(h, turn, ["失败发言正文"], "failed", {
          class: "unknown",
          message: "目标失败",
          code: null,
          retryable: false,
        });
        yield* awaitDiscussion(discussion, (value) => value.status === "paused");
        assert.deepEqual(yield* dispatchPositions(discussion), [
          [1, "user", undefined, false],
          [2, "statement", 0, true],
        ]);
        const entry = yield* Store.DiscussionStore.use((store) =>
          store.getEntryByRunId(turn.runId),
        );
        assert.equal(entry?.status, "failed");
      }),
    ),
);

/**
 * Collects every closing snapshot through the retry's durable run binding, without sleeps.
 * @param discussion Identity whose subscription is mounted before End or Continue.
 * @returns Recorded snapshots and a barrier reached after the final dispatch has a run ID.
 */
const observeClosingRetry = (discussion: Discussion) =>
  Effect.gen(function* () {
    const service = yield* Discussions.DiscussionService;
    const ready = yield* Deferred.make<void>();
    const bound = yield* Deferred.make<void>();
    const snapshots: Discussion[] = [];
    yield* service.subscribe({ discussionId: discussion.id }).pipe(
      Stream.runForEach((event) =>
        Effect.gen(function* () {
          if (event.type !== "snapshot" && event.type !== "discussion.updated") return;
          if (event.type === "snapshot") yield* Deferred.succeed(ready, undefined);
          if (!event.discussion.closing) return;
          snapshots.push(event.discussion);
          if (event.discussion.status === "closing" && event.discussion.cursor.runId !== null)
            yield* Deferred.succeed(bound, undefined);
        }),
      ),
      Effect.forkScoped,
    );
    yield* Deferred.await(ready);
    return { snapshots, bound: Deferred.await(bound) };
  });

it.effect("C4b End retries a final assignment after attachment preparation fails with no run", () =>
  withDiscussionHarness((h) =>
    Effect.gen(function* () {
      const service = yield* Discussions.DiscussionService;
      const store = yield* Store.DiscussionStore;
      yield* h.failAttachmentWrites;
      assert.isTrue(
        Exit.isFailure(
          yield* Effect.exit(service.create({ ...input, topic: "超长材料".repeat(40_000) })),
        ),
      );
      const discussion = (yield* store.listDiscussions(projectId))[0]!;
      assert.equal(discussion.status, "paused");
      assert.equal(discussion.cursor.runId, null);
      assert.equal(discussion.cursor.dispatchNo, 0);
      const observed = yield* observeClosingRetry(discussion);
      assert.isTrue(
        Exit.isFailure(
          yield* Effect.exit(
            service.end({ discussionId: discussion.id, summarizerSeatId: discussion.seats[0]!.id }),
          ),
        ),
      );
      const failed = (yield* store.getDiscussion(discussion.id))!;
      assert.equal(failed.status, "paused");
      assert.equal(failed.cursor.phase, "final_round");
      assert.equal(failed.cursor.runId, null);
      assert.equal(failed.cursor.dispatchedEntrySeq, 0);
      assert.equal(failed.cursor.dispatchNo, 0, "failure preceded prepared cursor persistence");
      yield* h.restoreAttachmentWrites;
      yield* service.continue({ discussionId: discussion.id });
      const final = yield* next(h, discussion, 1);
      yield* observed.bound;
      assert.equal(final.threadId, discussion.seats[0]!.threadId);
      assert.isTrue(final.message.text.endsWith("本次阶段：最后陈述。"));
      assert.deepEqual(
        observed.snapshots.map((s) => s.cursor.phase),
        observed.snapshots.map(() => "final_round" as const),
      );
      yield* finish(h, final, ["当前座位最后陈述"]);
      yield* next(h, discussion, 2);
      assert.deepEqual(
        (yield* store.listEntries(discussion.id)).map((e) => [e.kind, e.text, e.finalStatement]),
        [
          ["system", "讨论到此", undefined],
          ["statement", "当前座位最后陈述", true],
        ],
      );
    }),
  ),
);

it.effect(
  "C4b completed ordinary End retries the next seat's final assignment after attachment failure",
  () =>
    withDiscussionHarness(
      (h) =>
        Effect.gen(function* () {
          const service = yield* Discussions.DiscussionService;
          const store = yield* Store.DiscussionStore;
          const { discussion, turn } = yield* create(h, input.seats, "超长材料".repeat(40_000));
          yield* finish(h, turn, ["已完成普通发言"]);
          const observed = yield* observeClosingRetry(discussion);
          yield* h.failAttachmentWrites;
          assert.isTrue(
            Exit.isFailure(
              yield* Effect.exit(
                service.end({
                  discussionId: discussion.id,
                  summarizerSeatId: discussion.seats[0]!.id,
                }),
              ),
            ),
          );
          const failed = (yield* store.getDiscussion(discussion.id))!;
          assert.equal(failed.status, "paused");
          assert.equal(failed.cursor.phase, "final_round");
          assert.equal(failed.cursor.seatIndex, 1);
          assert.equal(failed.cursor.runId, null);
          assert.equal(
            failed.cursor.dispatchNo,
            1,
            "failure preceded next prepared cursor persistence",
          );
          assert.equal(failed.cursor.dispatchedEntrySeq, 0);
          yield* h.restoreAttachmentWrites;
          yield* service.continue({ discussionId: discussion.id });
          const final = yield* next(h, discussion, 2);
          yield* observed.bound;
          assert.equal(final.threadId, discussion.seats[1]!.threadId);
          assert.isTrue(final.message.text.endsWith("本次阶段：最后陈述。"));
          assert.deepEqual(
            observed.snapshots.map((s) => s.cursor.phase),
            observed.snapshots.map(() => "final_round" as const),
          );
          assert.equal(
            h.started.length,
            2,
            "one ordinary dispatch, then the successor final dispatch",
          );
          assert.deepEqual(
            (yield* store.listEntries(discussion.id)).map((e) => [
              e.kind,
              e.text,
              e.finalStatement,
            ]),
            [
              ["statement", "已完成普通发言", undefined],
              ["system", "讨论到此", undefined],
            ],
          );
        }),
      { startReactor: false },
    ),
);

it.effect("C4b legacy cursor without phase resumes ordinary speech from its dispatch marker", () =>
  withDiscussionHarness(
    (h) =>
      Effect.gen(function* () {
        const { discussion, turn } = yield* create(h);
        const service = yield* Discussions.DiscussionService;
        const store = yield* Store.DiscussionStore;
        yield* finish(h, turn, [], "completed");
        const snapshot = (yield* store.getDiscussion(discussion.id))!;
        const cursor = { ...snapshot.cursor };
        delete cursor.phase;
        yield* store.updateDiscussion({ ...snapshot, status: "paused", cursor });
        yield* service.continue({ discussionId: discussion.id });
        const resumed = yield* next(h, discussion, 2);
        assert.isTrue(resumed.message.text.endsWith("本次阶段：普通讨论发言。"));
      }),
    { startReactor: false },
  ),
);

it.effect(
  "C4b legacy cursor without phase resumes a final statement from its dispatch marker",
  () =>
    withDiscussionHarness((h) =>
      Effect.gen(function* () {
        const { discussion, turn } = yield* create(h);
        const service = yield* Discussions.DiscussionService;
        const store = yield* Store.DiscussionStore;
        yield* service.end({
          discussionId: discussion.id,
          summarizerSeatId: discussion.seats[0]!.id,
        });
        yield* finish(h, turn);
        const final = yield* next(h, discussion, 2);
        yield* service.stop({ discussionId: discussion.id });
        yield* Worker.OrchestrationEffectWorkerV2.use((w) => w.drain());
        yield* awaitRun(final.threadId, final.runId, "interrupted");
        const snapshot = (yield* store.getDiscussion(discussion.id))!;
        const cursor = { ...snapshot.cursor };
        delete cursor.phase;
        yield* store.updateDiscussion({ ...snapshot, cursor });
        yield* service.continue({ discussionId: discussion.id });
        const resumed = yield* next(h, discussion, 3);
        assert.isTrue(resumed.message.text.endsWith("本次阶段：最后陈述。"));
        assert.equal(resumed.threadId, discussion.seats[1]!.threadId);
      }),
    ),
);

it.effect.each([1, 2])(
  "C4c %i seats keep the stopped ordinary speaker's final statement when completion beats interrupt",
  (seatCount) =>
    withDiscussionHarness((h) =>
      Effect.gen(function* () {
        const { discussion, turn } = yield* create(h, input.seats.slice(0, seatCount));
        const service = yield* Discussions.DiscussionService;
        const store = yield* Store.DiscussionStore;
        yield* h.holdInterruptEvents;
        yield* service.stop({ discussionId: discussion.id });
        const ending = yield* service.end({
          discussionId: discussion.id,
          summarizerSeatId: discussion.seats[0]!.id,
        });
        assert.equal(ending.discussion.cursor.phase, "final_round");
        assert.equal(ending.discussion.cursor.runId, turn.runId);
        yield* finish(h, turn, ["中断生效之前自然完成的普通发言"]);
        const final = yield* next(h, discussion, 2);
        const snapshot = (yield* store.getDiscussion(discussion.id))!;
        const ordinary = (yield* store.listEntries(discussion.id)).find(
          (e) => e.runId === turn.runId,
        )!;
        assert.deepEqual(
          [ordinary.kind, ordinary.text, Object.hasOwn(ordinary, "finalStatement")],
          ["statement", "中断生效之前自然完成的普通发言", false],
        );
        assert.equal(
          final.threadId,
          discussion.seats[0]!.threadId,
          "current seat still owes its final statement",
        );
        assert.isTrue(final.message.text.endsWith("本次阶段：最后陈述。"));
        assert.equal(
          snapshot.closing?.phase,
          "final_round",
          "summary must wait for the final statement",
        );
        assert.deepEqual(
          snapshot.closing?.remainingFinalSeatIds,
          discussion.seats.map((s) => s.id),
        );
        assert.equal(
          snapshot.cursor.round,
          ordinary.round,
          "same-seat final retry must not increment the round",
        );
        assert.equal(snapshot.cursor.round, discussion.cursor.round);
        assert.equal(
          h.interrupted.length,
          1,
          "interrupt reached the provider boundary before its held terminal event",
        );
        yield* h.releaseInterruptEvents;
        yield* Worker.OrchestrationEffectWorkerV2.use((w) => w.drain());
        assert.equal(
          (yield* store.getDiscussion(discussion.id))!.cursor.dispatchNo,
          2,
          "late interrupt cannot dispatch twice",
        );
      }),
    ),
);
