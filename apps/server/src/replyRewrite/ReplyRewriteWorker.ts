import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as EffectOutbox from "../orchestration-v2/EffectOutbox.ts";
import * as Service from "./ReplyRewriteService.ts";

/** One dedicated slot; a rewrite never holds a main orchestration worker. */
export class ReplyRewriteWorker extends Context.Service<
  ReplyRewriteWorker,
  {
    readonly runOnce: Effect.Effect<boolean>;
    readonly drain: Effect.Effect<number>;
    readonly runDaemon: Effect.Effect<never>;
  }
>()("t3/replyRewrite/ReplyRewriteWorker") {}

export const layer = Layer.effect(
  ReplyRewriteWorker,
  Effect.gen(function* () {
    const service = yield* Service.ReplyRewriteService;
    const outbox = yield* EffectOutbox.EffectOutboxV2;
    const workerId = `reply-rewrite:${process.pid}`;
    const runOnce = Effect.gen(function* () {
      const claimed = yield* outbox.claimNext({ workerId, workerGroup: "reply-rewrite" });
      if (Option.isNone(claimed)) return false;
      const effect = claimed.value;
      yield* Effect.raceFirst(service.execute(effect), outbox.awaitCancellation(effect.id)).pipe(
        Effect.ensuring(outbox.clearCancellation(effect.id)),
      );
      yield* outbox.succeed({ effectId: effect.id, workerId });
      return true;
    }).pipe(
      Effect.onError(() =>
        service.recover.pipe(
          Effect.catchCause((cause) => Effect.logError("Reply rewrite recovery failed", cause)),
        ),
      ),
      Effect.catchCause((cause) =>
        Effect.logError(
          "Reply rewrite worker failed; recovery will use its durable call marker",
          cause,
        ).pipe(Effect.as(false)),
      ),
    );
    const drain = Effect.gen(function* () {
      let count = 0;
      while (yield* runOnce) count += 1;
      return count;
    });
    const runDaemon = Effect.gen(function* () {
      yield* service.recover.pipe(Effect.orDie);
      while (true) {
        const worked = yield* runOnce;
        if (!worked)
          yield* outbox.awaitRewriteAvailable.pipe(
            Effect.timeoutOrElse({ duration: "30 seconds", orElse: () => Effect.void }),
          );
      }
    });
    return ReplyRewriteWorker.of({ runOnce, drain, runDaemon });
  }),
);
