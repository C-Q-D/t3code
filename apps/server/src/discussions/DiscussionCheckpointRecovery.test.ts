/** Exhaustion notifications preserve worker failure settlement and exclude retries and cancellation. */
import { assert, it } from "@effect/vitest";
import { CheckpointScopeId, CommandId, RunId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as Option from "effect/Option";
import * as Worker from "../orchestration-v2/EffectWorker.ts";
import * as Outbox from "../orchestration-v2/EffectOutbox.ts";
import * as Sqlite from "../persistence/Sqlite.ts";
import * as Recovery from "./DiscussionCheckpointRecovery.ts";

const threadId = ThreadId.make("thread:t4-exhaustion");
const runId = RunId.make("run:t4-exhaustion");
const request = {
  type: "checkpoint.capture" as const,
  runId,
  scopeId: CheckpointScopeId.make("scope:t4-exhaustion"),
};
const failingExecutor = Layer.succeed(Worker.OrchestrationEffectExecutorV2, {
  execute: (effect) =>
    effect.id === "t4:cancelled"
      ? Effect.interrupt
      : Effect.fail(
          new Worker.OrchestrationEffectExecutionError({
            effectId: effect.id,
            effectType: effect.request.type,
            cause: "t4:external-capture-failure",
          }),
        ),
});
const decorated = Recovery.layerExecutor.pipe(Layer.provide(failingExecutor));

it.effect(
  "the last failed real worker attempt emits recovery and leaves the durable capture failed",
  () => {
    const notifications: Recovery.ExhaustedDiscussionCapture[] = [];
    const recordingRecovery = Layer.succeed(Recovery.DiscussionCheckpointRecovery, {
      exhausted: (capture) =>
        Effect.sync(() => {
          notifications.push(capture);
        }),
      subscribe: Effect.succeed(Stream.empty),
    });
    return Effect.scoped(
      Effect.gen(function* () {
        const outbox = yield* Outbox.EffectOutboxV2;
        const worker = yield* Worker.OrchestrationEffectWorkerV2;
        yield* outbox.enqueue([
          { id: "t4:capture", commandId: CommandId.make("command:t4-capture"), threadId, request },
        ]);
        yield* worker.drain();
        assert.deepEqual(notifications, [{ threadId, runId }]);
        const row = yield* outbox.get("t4:capture");
        assert.isTrue(Option.isSome(row));
        if (Option.isSome(row)) {
          assert.equal(row.value.status, "failed");
          assert.equal(row.value.attemptCount, 1);
          assert.include(row.value.lastError!, "t4:external-capture-failure");
        }
      }),
    ).pipe(
      Effect.provide(
        Worker.layerWithOptions({ maxAttempts: 1 }).pipe(
          Layer.provide(decorated),
          Layer.provideMerge(recordingRecovery),
          Layer.provideMerge(Outbox.layer),
          Layer.provide(Sqlite.layerMemory),
        ),
      ),
    );
  },
);

it.effect(
  "retryable attempts, non-capture failures and cancellation emit nothing before the final capture failure",
  () => {
    const notifications: Recovery.ExhaustedDiscussionCapture[] = [];
    const recordingRecovery = Layer.succeed(Recovery.DiscussionCheckpointRecovery, {
      exhausted: (capture) =>
        Effect.sync(() => {
          notifications.push(capture);
        }),
      subscribe: Effect.succeed(Stream.empty),
    });
    return Effect.scoped(
      Effect.gen(function* () {
        const executor = yield* Worker.OrchestrationEffectExecutorV2;
        const effect: Outbox.OrchestrationEffectV2 = {
          id: "t4:retry",
          commandId: CommandId.make("t4:test"),
          threadId,
          request: { ...request, runId: RunId.make("run:t4-retry") },
          status: "running",
          attemptCount: 1,
          availableAt: "2026-10-12T00:00:00.000Z",
          leaseOwner: "t4",
          leaseExpiresAt: null,
          createdAt: "2026-10-12T00:00:00.000Z",
          updatedAt: "2026-10-12T00:00:00.000Z",
          completedAt: null,
          lastError: null,
        };
        yield* executor.execute(effect, { willRetry: true }).pipe(Effect.exit);
        yield* executor
          .execute({ ...effect, request: { type: "terminal.cleanup" } }, { willRetry: false })
          .pipe(Effect.exit);
        yield* executor
          .execute({ ...effect, id: "t4:cancelled" }, { willRetry: false })
          .pipe(Effect.exit);
        yield* executor
          .execute({ ...effect, id: "t4:final", request }, { willRetry: false })
          .pipe(Effect.exit);
        assert.deepEqual(notifications, [{ threadId, runId }]);
      }),
    ).pipe(Effect.provide(decorated.pipe(Layer.provideMerge(recordingRecovery))));
  },
);
