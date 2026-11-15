import {
  ReplyRewriteError,
  type ReplyRewriteRequestedServiceTier,
  type ReplyRewriteUsage,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { makePiReplyRewriteRunner } from "@t3tools/provider-pi/server/replyRewrite";

/** The Pi adapter supplies this port. The server never substitutes a conversation provider. */
export class ReplyRewriteRunner extends Context.Service<
  ReplyRewriteRunner,
  {
    readonly run: (input: {
      readonly requestId: string;
      readonly sourceText: string;
      readonly systemPrompt: string;
      readonly binaryPath: string;
      readonly provider: string;
      readonly modelId: string;
      readonly thinkingLevel: string;
      readonly requestedServiceTier: ReplyRewriteRequestedServiceTier;
      readonly timeoutMs: number;
    }) => Effect.Effect<
      {
        readonly text: string;
        readonly model: string;
        readonly requestedServiceTier: ReplyRewriteRequestedServiceTier;
        readonly actualServiceTier: string | null;
        readonly usage: ReplyRewriteUsage | null;
      },
      ReplyRewriteError
    >;
  }
>()("t3/replyRewrite/ReplyRewriteRunner") {}

const makePi = Effect.gen(function* () {
  const runner = yield* makePiReplyRewriteRunner();
  return ReplyRewriteRunner.of({
    run: Effect.fn("ReplyRewriteRunner.run")((input) =>
      runner.run(input).pipe(
        Effect.mapError(
          (error) =>
            new ReplyRewriteError({
              code: error.code,
              message: error.message,
            }),
        ),
      ),
    ),
  });
});

export const layerPi = Layer.effect(ReplyRewriteRunner, makePi);
