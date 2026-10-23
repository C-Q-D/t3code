/** Wire contracts for composer assistance; cache estimates never authorize provider work. */
import * as Schema from "effect/Schema";

import { RunId, ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";

const COMPOSER_ASSIST_SUPPORTED_DRIVERS = ["claudeAgent", "codex"] as const;
export const COMPOSER_SUGGESTION_MIN_COMPLETED_RUNS = 2;
export const COMPOSER_SUGGESTION_MAX_AGE_MS = 10 * 60_000;
const COMPOSER_CLAUDE_CACHE_TTL_FALLBACK_MS = 60 * 60_000;
const COMPOSER_CODEX_CACHE_IDLE_MS = 10 * 60_000;
export const COMPOSER_OPTIMIZE_DRAFT_MAX_CHARS = 20_000;

/** Returns whether the driver identifier supports session-forked composer assistance. */
export function isComposerAssistSupportedDriver(driver: string): boolean {
  return COMPOSER_ASSIST_SUPPORTED_DRIVERS.some((supported) => supported === driver);
}

export const ComposerAssistSuppressReason = Schema.Literals([
  "disabled",
  "provider_unsupported",
  "plan_mode",
  "pending_request",
  "early_conversation",
  "last_response_error",
  "usage_limit",
  "composer_not_empty",
  "generating",
  "already_requested",
  "inflight",
  "cache_stale",
  "stale_turn",
  "session_not_live",
]);
export const ComposerSuggestionFilterReason = Schema.Literals([
  "empty",
  "done",
  "meta_text",
  "meta_wrapped",
  "error_message",
  "prefixed_label",
  "too_few_words",
  "too_many_words",
  "too_long",
  "multiple_sentences",
  "has_formatting",
  "evaluative",
  "assistant_voice",
]);
export const ComposerOptimizeFilterReason = Schema.Literals([
  "empty",
  "unchanged",
  "too_long",
  "references_dropped",
]);
export const ComposerAssistFailureReason = Schema.Literals([
  "usage_limit",
  "provider_error",
  "transport_error",
  "timeout",
  "interrupted",
  "session_resume_failed",
]);

export const ComposerSuggestInput = Schema.Struct({ threadId: ThreadId, runId: RunId });
/** Identifies the completed run whose next user message is being predicted. */
export type ComposerSuggestInput = typeof ComposerSuggestInput.Type;
export const ComposerSuggestResult = Schema.Union([
  Schema.TaggedStruct("Suggested", {
    requestId: TrimmedNonEmptyString,
    runId: RunId,
    text: TrimmedNonEmptyString,
  }),
  Schema.TaggedStruct("Suppressed", {
    requestId: TrimmedNonEmptyString,
    reason: ComposerAssistSuppressReason,
  }),
  Schema.TaggedStruct("Filtered", {
    requestId: TrimmedNonEmptyString,
    reason: ComposerSuggestionFilterReason,
  }),
  Schema.TaggedStruct("Failed", {
    requestId: TrimmedNonEmptyString,
    reason: ComposerAssistFailureReason,
  }),
]);
/** Generation and gate outcomes stay in the result channel, separate from invalid requests. */
export type ComposerSuggestResult = typeof ComposerSuggestResult.Type;

export const ComposerOptimizeInput = Schema.Struct({
  threadId: ThreadId,
  // Preserve the exact draft for replacement and undo; whitespace-only drafts are invalid.
  draft: Schema.String.check(
    Schema.makeFilter(
      (value) => value.trim().length > 0 && value.length <= COMPOSER_OPTIMIZE_DRAFT_MAX_CHARS,
    ),
  ),
  style: Schema.Literal("default"),
});
/** The original draft remains untrimmed across the wire. */
export type ComposerOptimizeInput = typeof ComposerOptimizeInput.Type;
export const ComposerOptimizeResult = Schema.Union([
  Schema.TaggedStruct("Optimized", {
    requestId: TrimmedNonEmptyString,
    text: TrimmedNonEmptyString,
    cacheMaybeExpired: Schema.Boolean,
  }),
  Schema.TaggedStruct("Suppressed", {
    requestId: TrimmedNonEmptyString,
    reason: ComposerAssistSuppressReason,
  }),
  Schema.TaggedStruct("Filtered", {
    requestId: TrimmedNonEmptyString,
    reason: ComposerOptimizeFilterReason,
  }),
  Schema.TaggedStruct("Failed", {
    requestId: TrimmedNonEmptyString,
    reason: ComposerAssistFailureReason,
  }),
]);
/** An optimized draft is returned for local replacement, never sent as a conversation turn. */
export type ComposerOptimizeResult = typeof ComposerOptimizeResult.Type;

/** Request failures only; provider failures and filtered output use result variants. */
export class ComposerAssistError extends Schema.TaggedError<ComposerAssistError>()(
  "ComposerAssistError",
  {
    reason: Schema.Literals(["thread_not_found", "internal"]),
    message: Schema.String,
  },
) {}

/**
 * Estimates expiry in epoch milliseconds from provider ISO timestamps.
 * Claude's explicit expiry takes precedence; Codex uses only the completed turn.
 * Missing or unparseable required timestamps and unsupported drivers return null.
 */
export function composerCacheExpiresAt(input: {
  readonly driver: string;
  readonly lastTurnCompletedAt: string | null;
  readonly promptCacheExpiresAt: string | null | undefined;
}): number | null {
  if (!isComposerAssistSupportedDriver(input.driver)) return null;
  if (input.driver === "claudeAgent" && input.promptCacheExpiresAt != null) {
    const explicitExpiry = Date.parse(input.promptCacheExpiresAt);
    if (Number.isFinite(explicitExpiry)) return explicitExpiry;
  }
  if (input.lastTurnCompletedAt === null) return null;
  const completedAt = Date.parse(input.lastTurnCompletedAt);
  if (!Number.isFinite(completedAt)) return null;
  return (
    completedAt +
    (input.driver === "claudeAgent"
      ? COMPOSER_CLAUDE_CACHE_TTL_FALLBACK_MS
      : COMPOSER_CODEX_CACHE_IDLE_MS)
  );
}

/** Compares epoch milliseconds; unknown expiry and exact equality are not expired. */
export function composerCacheMaybeExpired(expiresAt: number | null, now: number): boolean {
  return expiresAt !== null && now > expiresAt;
}
