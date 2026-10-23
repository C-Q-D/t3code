/** Local side-query diagnostics; neither user drafts nor generated text belong in this sink. */
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Path from "effect/Path";
import { makeAsyncRotatingFileSink } from "@t3tools/shared/logging";
import * as ServerConfig from "../config.ts";

/** One RPC outcome, including requests rejected before provider work starts. */
export interface ComposerAssistLogRecord {
  readonly ts: string;
  readonly feature: "suggestion" | "optimization";
  readonly requestId: string;
  readonly threadId: string;
  readonly runId: string | null;
  readonly driver: string | null;
  readonly instanceId: string | null;
  readonly requestedModel: string | null;
  readonly actualModel: string | null;
  readonly outcome: "suggested" | "optimized" | "empty" | "filtered" | "suppressed" | "failed";
  readonly reason: string | null;
  readonly error?: { readonly category: string; readonly message: string };
  readonly promptVersion: "s1" | "o1";
  readonly usage: {
    readonly inputTokens: number;
    readonly cachedInputTokens: number;
    readonly cacheCreationTokens?: number;
    readonly outputTokens: number;
  } | null;
  readonly uncachedInputTokens: number | null;
  readonly cacheColdSuspected: boolean;
  readonly cacheMaybeExpired: boolean;
  readonly toolAttempted: boolean;
  /** Tool names or item types only, limited to eight entries of 64 characters each. */
  readonly attemptedTools: ReadonlyArray<string>;
  readonly stop: string | null;
  readonly latencyMs: number;
  readonly chars: number;
}

/** Best-effort local logging never changes a composer result. */
export class ComposerAssistLog extends Context.Service<
  ComposerAssistLog,
  {
    /** Appends metadata once, without retry; write failures produce a warning. */
    readonly write: (record: ComposerAssistLogRecord) => Effect.Effect<void>;
  }
>()("t3/composerAssist/ComposerAssistLog") {}

const encodeRecord = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));

const make = Effect.gen(function* () {
  const config = yield* ServerConfig.ServerConfig;
  const path = yield* Path.Path;
  const sink = yield* makeAsyncRotatingFileSink({
    filePath: path.join(config.stateDir, "logs", "composer-assist.ndjson"),
    maxBytes: 10 * 1024 * 1024,
    maxFiles: 10,
  }).pipe(Effect.result);
  return ComposerAssistLog.of({
    write: Effect.fn("ComposerAssistLog.write")(function* (record: ComposerAssistLogRecord) {
      if (sink._tag === "Failure") {
        yield* Effect.logWarning("Composer diagnostic sink is unavailable.", {
          cause: sink.failure,
        });
        return;
      }
      const line = yield* encodeRecord(record).pipe(Effect.orDie);
      yield* sink.success
        .write(`${line}\n`)
        .pipe(
          Effect.catch((cause) =>
            Effect.logWarning("Failed to write composer diagnostics.", { cause }),
          ),
        );
    }),
  });
});

export const layer = Layer.effect(ComposerAssistLog, make);
