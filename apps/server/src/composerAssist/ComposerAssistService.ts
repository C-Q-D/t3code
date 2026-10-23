/** 占位实现，真实逻辑见规格 §6。 */
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type {
  ComposerSuggestInput,
  ComposerSuggestResult,
  ComposerOptimizeInput,
  ComposerOptimizeResult,
  ComposerAssistError,
} from "@t3tools/contracts";

/** Composer queries are independent of orchestration events and never send user drafts. */
export class ComposerAssistService extends Context.Service<
  ComposerAssistService,
  {
    readonly suggestNext: (
      input: ComposerSuggestInput,
    ) => Effect.Effect<ComposerSuggestResult, ComposerAssistError>;
    readonly optimizePrompt: (
      input: ComposerOptimizeInput,
    ) => Effect.Effect<ComposerOptimizeResult, ComposerAssistError>;
  }
>()("t3/composerAssist/ComposerAssistService") {}

const make = Effect.gen(function* () {
  const crypto = yield* Crypto.Crypto;
  return ComposerAssistService.of({
    suggestNext: Effect.fn("ComposerAssistService.suggestNext")(function* (
      _input: ComposerSuggestInput,
    ): Effect.fn.Return<ComposerSuggestResult> {
      return {
        _tag: "Suppressed",
        requestId: yield* crypto.randomUUIDv4().pipe(Effect.orDie),
        reason: "provider_unsupported",
      };
    }),
    optimizePrompt: Effect.fn("ComposerAssistService.optimizePrompt")(function* (
      _input: ComposerOptimizeInput,
    ): Effect.fn.Return<ComposerOptimizeResult> {
      return {
        _tag: "Suppressed",
        requestId: yield* crypto.randomUUIDv4().pipe(Effect.orDie),
        reason: "provider_unsupported",
      };
    }),
  });
});

export const layer = Layer.effect(ComposerAssistService, make);
