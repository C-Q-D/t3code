/** Runs composer side queries without writing orchestration events or conversation history. */
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Clock from "effect/Clock";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Semaphore from "effect/Semaphore";
import * as Fiber from "effect/Fiber";
import {
  ComposerAssistError,
  COMPOSER_SUGGESTION_MAX_AGE_MS,
  composerCacheExpiresAt,
  composerCacheMaybeExpired,
} from "@t3tools/contracts";
import { checkCandidate, stripWrapping } from "@t3tools/shared/composerAssist/filters";
import {
  SUGGESTION_PROMPT,
  SUGGESTION_PROMPT_VERSION,
} from "@t3tools/shared/composerAssist/prompts";
import type * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";
import * as ProjectionStore from "../orchestration-v2/ProjectionStore.ts";
import * as ProviderSessions from "../orchestration-v2/ProviderSessionManager.ts";
import * as RuntimePolicy from "../orchestration-v2/RuntimePolicy.ts";
import * as McpContext from "../mcpApps/McpAppModelContext.ts";
import * as DeveloperContext from "../orchestration-v2/ThreadDeveloperContext.ts";
import { readTurnContext } from "../orchestration-v2/RunExecutionService.ts";
import * as ComposerAssistLog from "./ComposerAssistLog.ts";
import type {
  ComposerSuggestInput,
  ComposerSuggestResult,
  ComposerOptimizeInput,
  ComposerOptimizeResult,
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
  const projections = yield* ProjectionStore.ProjectionStoreV2;
  const sessions = yield* ProviderSessions.ProviderSessionManagerV2;
  const policy = yield* RuntimePolicy.RuntimePolicyV2;
  const appContext = yield* McpContext.McpAppModelContext;
  const developerContext = yield* DeveloperContext.ThreadDeveloperContext;
  const log = yield* ComposerAssistLog.ComposerAssistLog;
  const scope = yield* Effect.scope;
  const ownership = yield* Semaphore.make(1);
  const flights = new Map<
    string,
    { runId: string; done: Deferred.Deferred<QueryOutcome, ComposerAssistError> }
  >();
  const memo = new Map<string, { expiresAt: number; outcome: QueryOutcome }>();

  /** Captures immutable projection inputs before claiming a side query; reads do not retry. */
  const read = Effect.fn("ComposerAssistService.read")(
    function* (threadId: ComposerSuggestInput["threadId"]) {
      const shell = yield* projections.getThreadShell(threadId);
      if (shell === null)
        return yield* new ComposerAssistError({
          reason: "thread_not_found",
          message: "Thread not found.",
        });
      const records = yield* projections.getThreadRecords(threadId, [
        "providerThreads",
        "providerTurns",
        "providerSessions",
      ]);
      const providerThread = records.providerThreads.find(
        (candidate) => candidate.id === records.thread.activeProviderThreadId,
      );
      const turn = records.providerTurns
        .filter(
          (candidate) =>
            candidate.providerThreadId === providerThread?.id && candidate.completedAt !== null,
        )
        .reduce<(typeof records.providerTurns)[number] | undefined>(
          (latest, candidate) =>
            latest === undefined ||
            DateTime.toEpochMillis(candidate.completedAt!) >
              DateTime.toEpochMillis(latest.completedAt!)
              ? candidate
              : latest,
          undefined,
        );
      const expiresAt = composerCacheExpiresAt({
        driver: providerThread?.driver ?? "",
        lastTurnCompletedAt: turn?.completedAt ? DateTime.formatIso(turn.completedAt) : null,
        promptCacheExpiresAt: turn?.tokenUsage?.promptCacheExpiresAt,
      });
      return { shell, records, providerThread, expiresAt };
    },
    Effect.mapError((cause) =>
      cause._tag === "ComposerAssistError"
        ? cause
        : new ComposerAssistError({ reason: "internal", message: "Could not read thread state." }),
    ),
  );

  /** Applies the adapter deadline without retry, then filters any text, including tool-interrupted output. */
  const query = Effect.fn("ComposerAssistService.query")(function* (
    input: ComposerSuggestInput,
    requestId: string,
    state: Effect.Success<ReturnType<typeof read>>,
    runSideQuery: NonNullable<ProviderAdapter.ProviderAdapterV2SessionRuntime["runSideQuery"]>,
  ): Effect.fn.Return<QueryOutcome, ComposerAssistError> {
    const runtimePolicy = yield* policy
      .resolve({
        thread: state.records.thread,
        modelSelection: state.records.thread.modelSelection,
      })
      .pipe(
        Effect.mapError(
          () =>
            new ComposerAssistError({
              reason: "internal",
              message: "Could not resolve runtime policy.",
            }),
        ),
      );
    const contexts = yield* readTurnContext(input.threadId, appContext, developerContext);
    const side = yield* runSideQuery({
      appThread: state.records.thread,
      threadId: input.threadId,
      providerThread: state.providerThread!,
      modelSelection: state.records.thread.modelSelection,
      runtimePolicy,
      ...contexts,
      prompt: SUGGESTION_PROMPT,
      purpose: "suggestion",
    }).pipe(Effect.timeout(SIDE_QUERY_DEADLINE_MS), Effect.result);
    if (side._tag === "Failure")
      return {
        result: {
          _tag: "Failed",
          requestId,
          reason: side.failure._tag === "TimeoutError" ? "timeout" : "provider_error",
        },
        side: null,
      };
    const response = side.success;
    if (response.failure !== null)
      return {
        result: { _tag: "Failed", requestId, reason: response.failure.class },
        side: response,
      };
    const reason = checkCandidate(response.text);
    return {
      result:
        reason === null
          ? { _tag: "Suggested", requestId, runId: input.runId, text: stripWrapping(response.text) }
          : { _tag: "Filtered", requestId, reason },
      side: response,
    };
  });

  /** Runs independently of the requesting RPC; every request, including joins, writes its own metadata. */
  const suggest = Effect.fn("ComposerAssistService.suggest")(function* (
    input: ComposerSuggestInput,
  ): Effect.fn.Return<ComposerSuggestResult, ComposerAssistError> {
    const requestId = yield* crypto.randomUUIDv4().pipe(Effect.orDie);
    const startedAt = yield* Clock.currentTimeMillis;
    const state = yield* read(input.threadId);
    const suppressed = (
      reason: Extract<ComposerSuggestResult, { _tag: "Suppressed" }>["reason"],
    ): QueryOutcome => ({ result: { _tag: "Suppressed", requestId, reason }, side: null });
    const maybeExpired = composerCacheMaybeExpired(state.expiresAt, startedAt);
    const outcome = yield* Effect.gen(function* () {
      const providerThread = state.providerThread;
      if (
        providerThread?.providerSessionId == null ||
        !(yield* sessions.isLive(providerThread.providerSessionId))
      )
        return suppressed("session_not_live");
      const sessionOption = yield* sessions.get(providerThread.providerSessionId).pipe(
        Effect.mapError(
          () =>
            new ComposerAssistError({
              reason: "internal",
              message: "Could not read provider session.",
            }),
        ),
      );
      if (Option.isNone(sessionOption)) return suppressed("session_not_live");
      const session = sessionOption.value;
      if (!session.runSideQuery) return suppressed("provider_unsupported");
      if (state.shell.activeRunId !== null || state.shell.status !== "idle")
        return suppressed("generating");
      if (input.runId !== state.shell.latestRunId) return suppressed("stale_turn");
      if (maybeExpired) return suppressed("cache_stale");
      if (
        state.shell.latestRunCompletedAt == null ||
        startedAt - DateTime.toEpochMillis(state.shell.latestRunCompletedAt) >
          COMPOSER_SUGGESTION_MAX_AGE_MS
      )
        return suppressed("stale_turn");
      const runSideQuery = session.runSideQuery;
      const claim = yield* ownership.withPermits(1)(
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis;
          for (const [key, entry] of memo) if (entry.expiresAt <= now) memo.delete(key);
          const key = `${input.threadId.length}:${input.threadId}${input.runId}`;
          const cached = memo.get(key);
          if (cached) return Effect.succeed(cached.outcome);
          const active = flights.get(input.threadId);
          if (active)
            return active.runId === input.runId
              ? Deferred.await(active.done)
              : Effect.succeed(suppressed("inflight"));
          const done = yield* Deferred.make<QueryOutcome, ComposerAssistError>();
          flights.set(input.threadId, { runId: input.runId, done });
          yield* query(input, requestId, state, runSideQuery).pipe(
            Effect.tap((value) =>
              Effect.gen(function* () {
                memo.set(key, {
                  expiresAt: (yield* Clock.currentTimeMillis) + SUGGESTION_MEMO_TTL_MS,
                  outcome: value,
                });
              }),
            ),
            Effect.exit,
            Effect.flatMap((exit) => Deferred.done(done, exit)),
            Effect.ensuring(
              Effect.sync(() => {
                flights.delete(input.threadId);
              }),
            ),
            Effect.forkIn(scope),
          );
          return Deferred.await(done);
        }),
      );
      return yield* claim;
    });
    const result = { ...outcome.result, requestId };
    const usage = outcome.side?.usage ?? null;
    const uncached = usage === null ? null : usage.inputTokens - usage.cachedInputTokens;
    yield* log.write({
      ts: DateTime.formatIso(DateTime.makeUnsafe(startedAt)),
      feature: "suggestion",
      requestId,
      threadId: input.threadId,
      runId: input.runId,
      driver: state.providerThread?.driver ?? null,
      instanceId: state.records.thread.modelSelection.instanceId,
      requestedModel: state.records.thread.modelSelection.model ?? null,
      actualModel: outcome.side?.model ?? null,
      outcome:
        result._tag === "Suggested"
          ? "suggested"
          : result._tag === "Filtered"
            ? result.reason === "empty"
              ? "empty"
              : "filtered"
            : result._tag === "Failed"
              ? "failed"
              : "suppressed",
      reason: "reason" in result ? result.reason : null,
      promptVersion: SUGGESTION_PROMPT_VERSION,
      usage,
      uncachedInputTokens: uncached,
      cacheColdSuspected: uncached !== null && uncached > CACHE_COLD_SUSPECT_UNCACHED_TOKENS,
      cacheMaybeExpired: maybeExpired,
      toolAttempted: (outcome.side?.attemptedTools.length ?? 0) > 0,
      stop: outcome.side?.stop ?? null,
      latencyMs: (yield* Clock.currentTimeMillis) - startedAt,
      chars: outcome.side?.text.length ?? 0,
    });
    return result;
  });
  return ComposerAssistService.of({
    suggestNext: Effect.fn("ComposerAssistService.suggestNext")(function* (
      input: ComposerSuggestInput,
    ): Effect.fn.Return<ComposerSuggestResult, ComposerAssistError> {
      return yield* Fiber.join(yield* suggest(input).pipe(Effect.forkIn(scope)));
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

const SIDE_QUERY_DEADLINE_MS = 45_000;
const SUGGESTION_MEMO_TTL_MS = 10 * 60_000;
const CACHE_COLD_SUSPECT_UNCACHED_TOKENS = 8000;

/** Memoized provider metadata is shared, while request IDs and log entries remain per RPC. */
interface QueryOutcome {
  readonly result: ComposerSuggestResult;
  readonly side: ProviderAdapter.ProviderAdapterV2SideQueryResult | null;
}
