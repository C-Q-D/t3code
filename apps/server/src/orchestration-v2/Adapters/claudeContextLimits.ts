/**
 * Reads effective context limits from one Claude CLI process. Model catalog
 * fallback and token accounting remain the adapter's responsibility.
 */
import type { SDKControlGetContextUsageResponse } from "@anthropic-ai/claude-agent-sdk";
import * as Effect from "effect/Effect";

import type { ClaudeAgentSdkQuerySession } from "./ClaudeAdapterV2.ts";

/** Validated CLI window size and optional automatic compaction point, in tokens. */
export interface ClaudeContextLimits {
  readonly maxTokens: number;
  readonly autoCompactThreshold?: number;
}

/**
 * Validates CLI limits without estimating usage or changing CLI settings.
 * @param response CLI window and compaction state; token counts must be positive integers.
 * @returns Null for an invalid window. The threshold is omitted unless compaction
 * is enabled and its positive integer threshold is below the window size.
 */
export function claudeContextLimitsFromUsage(
  response: Pick<
    SDKControlGetContextUsageResponse,
    "maxTokens" | "autoCompactThreshold" | "isAutoCompactEnabled"
  >,
): ClaudeContextLimits | null {
  const { maxTokens, autoCompactThreshold, isAutoCompactEnabled } = response;
  if (!Number.isInteger(maxTokens) || maxTokens <= 0) return null;

  const hasThreshold =
    isAutoCompactEnabled === true &&
    autoCompactThreshold !== undefined &&
    Number.isInteger(autoCompactThreshold) &&
    autoCompactThreshold > 0 &&
    autoCompactThreshold < maxTokens;
  return {
    maxTokens,
    ...(hasThreshold ? { autoCompactThreshold } : {}),
  };
}

/**
 * Reads limits once using local summary usage, without calling the token-count API.
 * @param query The owning CLI session; older runners may omit the control method.
 * @returns An effect with no error channel. Missing methods, invalid responses,
 * request failures and the three-second deadline return null and log at debug level.
 * No retries are made; the caller runs this effect in the session's background scope.
 */
export function readClaudeContextLimits(query: {
  readonly getContextUsage?: ClaudeAgentSdkQuerySession["getContextUsage"];
}): Effect.Effect<ClaudeContextLimits | null> {
  return Effect.suspend(() => {
    if (query.getContextUsage === undefined) {
      return Effect.logDebug("orchestration-v2.claude-context-limits-unavailable", {
        reason: "unsupported",
      }).pipe(Effect.as(null));
    }
    return query.getContextUsage({ detail: "summary" }).pipe(
      Effect.map(claudeContextLimitsFromUsage),
      Effect.tap((limits) =>
        limits === null
          ? Effect.logDebug("orchestration-v2.claude-context-limits-unavailable", {
              reason: "invalid-response",
            })
          : Effect.void,
      ),
      Effect.timeoutOrElse({
        duration: "3 seconds",
        orElse: () =>
          Effect.logDebug("orchestration-v2.claude-context-limits-unavailable", {
            reason: "timeout",
          }).pipe(Effect.as(null)),
      }),
    );
  }).pipe(
    Effect.catchCause(() =>
      Effect.logDebug("orchestration-v2.claude-context-limits-unavailable", {
        reason: "request-failed",
      }).pipe(Effect.as(null)),
    ),
  );
}
