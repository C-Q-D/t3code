import {
  ReplyRewriteError,
  type ReplyRewriteRequestedServiceTier,
  type ReplyRewriteUsage,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

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
