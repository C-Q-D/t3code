/**
 * Reads only Codex compaction settings, caches them per session/cwd, and keeps
 * config responses out of protocol logs. Token notifications only read this cache.
 */
import type * as CodexClient from "effect-codex-app-server/client";
import type { CodexAppServerProtocolLogEvent } from "effect-codex-app-server/protocol";
import * as Effect from "effect/Effect";
import * as Predicate from "effect/Predicate";
import * as Schema from "effect/Schema";
import type * as Scope from "effect/Scope";

/** The version-independent subset of config/read; unrelated configuration keys are stripped. */
export const CodexCompactionLimits = Schema.Struct({
  model_auto_compact_token_limit: Schema.optional(Schema.NullOr(Schema.Number)),
  model_auto_compact_token_limit_scope: Schema.optional(
    Schema.NullOr(Schema.Literals(["total", "body_after_prefix"])),
  ),
  model_context_window: Schema.optional(Schema.NullOr(Schema.Number)),
});

/** Decoded optional compaction settings. Numeric values are token counts, validated before use. */
export type CodexCompactionLimits = typeof CodexCompactionLimits.Type;

const ConfigReadCompactionLimits = Schema.Struct({ config: CodexCompactionLimits });
const decodeConfigReadCompactionLimits = Schema.decodeUnknownEffect(ConfigReadCompactionLimits);

/**
 * Starts one background config/read per cwd without waiting for its result.
 * @param client Session client; raw requests avoid decoding the full version-specific config.
 * @param cache Session-owned settings keyed directly by cwd; null marks pending or failed reads.
 * @param cwd Turn working directory, or null for Codex's default configuration scope.
 * @param scope Session scope that owns and cancels the background read.
 * @returns A non-failing effect that reserves the key before forking. Requests time out after
 * three seconds and never retry; failures, decode errors and defects only produce debug logs.
 * Call from the turn-start path: inline notification handlers would deadlock awaiting a response.
 */
export const prefetchCodexCompactionLimits = Effect.fnUntraced(
  function* (
    client: { readonly raw: Pick<CodexClient.CodexAppServerClient["Service"]["raw"], "request"> },
    cache: Map<string | null, CodexCompactionLimits | null>,
    cwd: string | null,
    scope: Scope.Scope,
  ) {
    if (cache.has(cwd)) return;
    cache.set(cwd, null);
    yield* Effect.gen(function* () {
      const response = yield* client.raw.request("config/read", cwd === null ? {} : { cwd });
      const { config } = yield* decodeConfigReadCompactionLimits(response);
      cache.set(cwd, config);
    }).pipe(
      Effect.timeout("3 seconds"),
      Effect.catchCause(() =>
        Effect.logDebug("Codex compaction settings read failed; threshold unavailable."),
      ),
      Effect.forkIn(scope, { startImmediately: true }),
    );
  },
  Effect.catchCause(() =>
    Effect.logDebug("Codex compaction settings prefetch failed; threshold unavailable."),
  ),
);

/**
 * Computes an automatic compaction point comparable to reported context usage.
 * @param limits Cached configuration, or null/undefined while unavailable.
 * @param usableWindow Codex's reported usable token window, or null/undefined if unknown.
 * @returns A positive integer token threshold within usableWindow, or undefined for invalid,
 * missing or incomparable settings. Does no I/O and does not mutate the cache.
 */
export function codexAutoCompactThreshold(
  limits: CodexCompactionLimits | null | undefined,
  usableWindow: number | null | undefined,
): number | undefined {
  const limit = limits?.model_auto_compact_token_limit;
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit <= 0) return undefined;
  if (limits?.model_auto_compact_token_limit_scope === "body_after_prefix") return undefined;
  if (typeof usableWindow !== "number" || !Number.isInteger(usableWindow) || usableWindow <= 0)
    return undefined;
  const configuredWindow = limits?.model_context_window;
  // Codex reports 95% of the model window and caps automatic compaction at 90% of it.
  const window =
    typeof configuredWindow === "number" &&
    Number.isInteger(configuredWindow) &&
    configuredWindow > 0
      ? configuredWindow
      : Math.floor(usableWindow / 0.95);
  const threshold = Math.min(limit, Math.floor(window * 0.9));
  return Number.isInteger(threshold) && threshold > 0 && threshold <= usableWindow
    ? threshold
    : undefined;
}

/**
 * Creates a session-local redactor that tracks decoded config/read request ids.
 * @returns A synchronous event transform: matching incoming results are replaced with
 * { redacted: true } and their ids consumed; all other events retain their object identity.
 * Invoke only after the persistence filter, before payload bounding/general redaction.
 */
export function makeCodexConfigReadLogRedactor(): (
  event: CodexAppServerProtocolLogEvent,
) => CodexAppServerProtocolLogEvent {
  const pending = new Set<string>();
  return (event) => {
    if (event.stage !== "decoded" || !Predicate.isObject(event.payload)) return event;
    const payload = event.payload;
    if (typeof payload.id !== "number" && typeof payload.id !== "string") return event;
    const id = String(payload.id);
    if (event.direction === "outgoing" && payload.method === "config/read") pending.add(id);
    if (event.direction === "incoming" && pending.delete(id)) {
      return { ...event, payload: { ...payload, result: { redacted: true } } };
    }
    return event;
  };
}
