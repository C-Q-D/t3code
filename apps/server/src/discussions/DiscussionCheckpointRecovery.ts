/** Bridges exhausted checkpoint effects to discussion recovery without changing orchestration core retries. */
import type { RunId, ThreadId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Stream from "effect/Stream";
import * as EffectWorker from "../orchestration-v2/EffectWorker.ts";

/** One exhausted capture; failed filesystem captures normally become error checkpoints instead. */
export interface ExhaustedDiscussionCapture {
  readonly threadId: ThreadId;
  readonly runId: RunId;
}

/** A shared application queue avoids a dependency cycle between run execution and DiscussionService. */
export class DiscussionCheckpointRecovery extends Context.Service<
  DiscussionCheckpointRecovery,
  {
    /** Publishes a final capture failure; ordinary retries and cancellations do not publish. */
    readonly exhausted: (capture: ExhaustedDiscussionCapture) => Effect.Effect<void>;
    /** Lossless scoped subscription; the discussion reactor handles only its tracked run. */
    readonly subscribe: Effect.Effect<
      Stream.Stream<ExhaustedDiscussionCapture>,
      never,
      import("effect/Scope").Scope
    >;
  }
>()("t3/discussions/DiscussionCheckpointRecovery") {}

/** Queue lifetime belongs to the application layer, shared by the executor and discussion reactor. */
export const layer = Layer.effect(
  DiscussionCheckpointRecovery,
  Effect.gen(function* () {
    const queue = yield* PubSub.unbounded<ExhaustedDiscussionCapture>();
    yield* Effect.addFinalizer(() => PubSub.shutdown(queue));
    return DiscussionCheckpointRecovery.of({
      exhausted: (capture) => PubSub.publish(queue, capture).pipe(Effect.asVoid),
      subscribe: PubSub.subscribe(queue).pipe(Effect.map(Stream.fromSubscription)),
    });
  }),
);

/**
 * Decorates the existing executor at runtime assembly. The worker supplies willRetry before execution;
 * on its last failed capture, the reactor retains the notice even while the discussion is paused,
 * because Continue can precede the worker's final outbox settlement. The worker still owns the
 * error and settlement. Cancellation does not imply capture exhaustion.
 */
export const layerExecutor = Layer.effect(
  EffectWorker.OrchestrationEffectExecutorV2,
  Effect.gen(function* () {
    const executor = yield* EffectWorker.OrchestrationEffectExecutorV2;
    const recovery = yield* DiscussionCheckpointRecovery;
    return EffectWorker.OrchestrationEffectExecutorV2.of({
      execute: (effect, options) =>
        executor
          .execute(effect, options)
          .pipe(
            Effect.onError((cause) =>
              effect.request.type === "checkpoint.capture" &&
              options?.willRetry === false &&
              !Cause.hasInterruptsOnly(cause)
                ? recovery.exhausted({ threadId: effect.threadId, runId: effect.request.runId })
                : Effect.void,
            ),
          ),
    });
  }),
);
