/** Runs isolated composer queries; restoring the main session remains owned by its manager. */
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
  isComposerAssistSupportedDriver,
} from "@t3tools/contracts";
import { checkCandidate, stripWrapping } from "@t3tools/shared/composerAssist/filters";
import {
  SUGGESTION_PROMPT,
  SUGGESTION_PROMPT_VERSION,
  OPTIMIZE_PROMPT_VERSION,
  optimizePrompt,
} from "@t3tools/shared/composerAssist/prompts";
import {
  checkOptimizedPrompt,
  stripOptimizeWrapping,
} from "@t3tools/shared/composerAssist/optimizeFilters";
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

/** Returns composer text without sending it as a conversation message. */
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
  const optimizations = new Map<string, Deferred.Deferred<void>>();
  const memo = new Map<string, { expiresAt: number; outcome: QueryOutcome }>();

  /** Adapter failures are values; the caller owns the total deadline and never retries. */
  const runAdapter = Effect.fn("ComposerAssistService.runAdapter")(
    (
      runSideQuery: NonNullable<ProviderAdapter.ProviderAdapterV2SessionRuntime["runSideQuery"]>,
      input: ProviderAdapter.ProviderAdapterV2SideQueryInput,
    ) => runSideQuery(input).pipe(Effect.result),
  );

  /** Session-manager work may resist interruption; stop waiting without losing its scope ownership. */
  const awaitSessionOperation = Effect.fn("ComposerAssistService.awaitSessionOperation")(function* <
    A,
    E,
  >(operation: Effect.Effect<A, E>) {
    const fiber = yield* operation.pipe(Effect.forkIn(scope));
    return yield* Fiber.join(fiber).pipe(
      Effect.onInterrupt(() => Fiber.interrupt(fiber).pipe(Effect.forkIn(scope), Effect.asVoid)),
    );
  });

  /** Waits on completion signals, then atomically claims the thread; failed suggestions also release it. */
  const reserveOptimization = Effect.fn("ComposerAssistService.reserveOptimization")(function* (
    threadId: string,
  ): Effect.fn.Return<Deferred.Deferred<void>> {
    const claim = yield* ownership.withPermits(1)(
      Effect.gen(function* () {
        const optimization = optimizations.get(threadId);
        if (optimization) return { wait: Deferred.await(optimization) };
        const suggestion = flights.get(threadId);
        if (suggestion)
          return { wait: Deferred.await(suggestion.done).pipe(Effect.exit, Effect.asVoid) };
        const done = yield* Deferred.make<void>();
        optimizations.set(threadId, done);
        return { done };
      }),
    );
    if (claim.wait !== undefined) {
      yield* claim.wait;
      return yield* reserveOptimization(threadId);
    }
    return claim.done;
  });

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
    const side = yield* runAdapter(runSideQuery, {
      appThread: state.records.thread,
      threadId: input.threadId,
      providerThread: state.providerThread!,
      modelSelection: state.records.thread.modelSelection,
      runtimePolicy,
      ...contexts,
      prompt: SUGGESTION_PROMPT,
      purpose: "suggestion",
    });
    if (side._tag === "Failure")
      return {
        result: {
          _tag: "Failed",
          requestId,
          reason: "provider_error",
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

  /** Writes one metadata record per caller; joined requests share usage but retain their own IDs. */
  const writeOutcome = Effect.fn("ComposerAssistService.writeOutcome")(function* (
    input: {
      threadId: ComposerSuggestInput["threadId"];
      runId: string | null;
      feature: "suggestion" | "optimization";
    },
    requestId: string,
    startedAt: number,
    state: Effect.Success<ReturnType<typeof read>> | null,
    outcome: QueryOutcome<ComposerSuggestResult | ComposerOptimizeResult>,
    maybeExpired: boolean,
  ) {
    const result = outcome.result;
    const usage = outcome.side?.usage ?? null;
    const uncached = usage === null ? null : usage.inputTokens - usage.cachedInputTokens;
    yield* log.write({
      ts: DateTime.formatIso(DateTime.makeUnsafe(startedAt)),
      feature: input.feature,
      requestId,
      threadId: input.threadId,
      runId: input.runId,
      driver: state?.providerThread?.driver ?? null,
      instanceId: state?.records.thread.modelSelection.instanceId ?? null,
      requestedModel: state?.records.thread.modelSelection.model ?? null,
      actualModel: outcome.side?.model ?? null,
      outcome:
        result._tag === "Optimized"
          ? "optimized"
          : result._tag === "Suggested"
            ? "suggested"
            : result._tag === "Filtered"
              ? result.reason === "empty"
                ? "empty"
                : "filtered"
              : result._tag === "Failed"
                ? "failed"
                : "suppressed",
      reason: "reason" in result ? result.reason : null,
      promptVersion:
        input.feature === "suggestion" ? SUGGESTION_PROMPT_VERSION : OPTIMIZE_PROMPT_VERSION,
      usage,
      uncachedInputTokens: uncached,
      cacheColdSuspected: uncached !== null && uncached > CACHE_COLD_SUSPECT_UNCACHED_TOKENS,
      cacheMaybeExpired: maybeExpired,
      toolAttempted: (outcome.side?.attemptedTools.length ?? 0) > 0,
      stop: outcome.side?.stop ?? null,
      latencyMs: (yield* Clock.currentTimeMillis) - startedAt,
      chars: outcome.side?.text.length ?? 0,
    });
  });

  /** Runs independently of the requesting RPC; every request, including joins, writes its own metadata. */
  const suggest = Effect.fn("ComposerAssistService.suggest")(function* (
    input: ComposerSuggestInput,
    requestId: string,
    startedAt: number,
  ): Effect.fn.Return<ComposerSuggestResult, ComposerAssistError> {
    const state = yield* read(input.threadId);
    const suppressed = (
      reason: Extract<ComposerSuggestResult, { _tag: "Suppressed" }>["reason"],
    ): QueryOutcome => ({ result: { _tag: "Suppressed", requestId, reason }, side: null });
    const maybeExpired = composerCacheMaybeExpired(state.expiresAt, startedAt);
    const outcome = yield* Effect.gen(function* () {
      const providerThread = state.providerThread;
      if (!providerThread || !isComposerAssistSupportedDriver(providerThread.driver))
        return suppressed("provider_unsupported");
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
      const runSideQuery = session.runSideQuery;
      const claim = yield* ownership.withPermits(1)(
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis;
          for (const [key, entry] of memo) if (entry.expiresAt <= now) memo.delete(key);
          const key = `${input.threadId.length}:${input.threadId}${input.runId}`;
          if (optimizations.has(input.threadId)) return Effect.succeed(suppressed("inflight"));
          const cached = memo.get(key);
          if (cached) return Effect.succeed(cached.outcome);
          const active = flights.get(input.threadId);
          if (active)
            return active.runId === input.runId
              ? Deferred.await(active.done)
              : Effect.succeed(suppressed("inflight"));
          if (maybeExpired) return Effect.succeed(suppressed("cache_stale"));
          if (
            input.runId !== state.shell.latestRunId ||
            state.shell.latestRunCompletedAt == null ||
            startedAt - DateTime.toEpochMillis(state.shell.latestRunCompletedAt) >
              COMPOSER_SUGGESTION_MAX_AGE_MS
          )
            return Effect.succeed(suppressed("stale_turn"));
          const done = yield* Deferred.make<QueryOutcome, ComposerAssistError>();
          flights.set(input.threadId, { runId: input.runId, done });
          yield* query(input, requestId, state, runSideQuery).pipe(
            Effect.timeout(Math.max(0, SIDE_QUERY_DEADLINE_MS - (now - startedAt))),
            Effect.catchTags({
              TimeoutError: () =>
                Effect.succeed<QueryOutcome>({
                  result: { _tag: "Failed", requestId, reason: "timeout" },
                  side: null,
                }),
            }),
            Effect.tap((value) =>
              Effect.gen(function* () {
                memo.set(key, {
                  expiresAt: (yield* Clock.currentTimeMillis) + SUGGESTION_MEMO_TTL_MS,
                  outcome: value,
                });
              }),
            ),
            Effect.onExit((exit) =>
              Effect.sync(() => {
                flights.delete(input.threadId);
              }).pipe(Effect.andThen(Deferred.done(done, exit))),
            ),
            Effect.forkIn(scope),
          );
          return Deferred.await(done);
        }),
      );
      return yield* claim;
    });
    const result = { ...outcome.result, requestId };
    yield* writeOutcome(
      { ...input, feature: "suggestion" },
      requestId,
      startedAt,
      state,
      outcome,
      maybeExpired,
    );
    return result;
  });
  /** Restores idle sessions when needed and returns a rewrite; projection reads are repeated after waiting. */
  const optimize = Effect.fn("ComposerAssistService.optimize")(function* (
    input: ComposerOptimizeInput,
    requestId: string,
    startedAt: number,
  ): Effect.fn.Return<ComposerOptimizeResult, ComposerAssistError> {
    const done = yield* reserveOptimization(input.threadId);
    return yield* Effect.gen(function* () {
      const state = yield* read(input.threadId);
      const maybeExpired = composerCacheMaybeExpired(
        state.expiresAt,
        yield* Clock.currentTimeMillis,
      );
      const outcome = yield* Effect.gen(function* (): Effect.fn.Return<
        QueryOutcome<ComposerOptimizeResult>,
        ComposerAssistError
      > {
        const suppressed = (
          reason: "provider_unsupported" | "generating",
        ): QueryOutcome<ComposerOptimizeResult> => ({
          result: { _tag: "Suppressed", requestId, reason },
          side: null,
        });
        const failed = (
          reason: "session_resume_failed" | "provider_error" | "timeout",
        ): QueryOutcome<ComposerOptimizeResult> => ({
          result: { _tag: "Failed", requestId, reason },
          side: null,
        });
        const providerThread = state.providerThread;
        if (!providerThread || !isComposerAssistSupportedDriver(providerThread.driver))
          return suppressed("provider_unsupported");
        if (state.shell.activeRunId !== null || state.shell.status !== "idle")
          return suppressed("generating");
        if (providerThread.providerSessionId === null) return failed("session_resume_failed");
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
        const sessionResult = yield* Effect.gen(function* () {
          const live = yield* sessions.get(providerThread.providerSessionId!);
          if (Option.isSome(live)) return { session: live.value, providerThread };
          const previous = state.records.providerSessions.find(
            (candidate) => candidate.id === providerThread.providerSessionId,
          );
          // Restoring the main session may emit lifecycle events; the side query must emit no run, attempt, turn, item, message or checkpoint events and must not finalize a run.
          const session = yield* awaitSessionOperation(
            sessions.open({
              threadId: input.threadId,
              providerSessionId: providerThread.providerSessionId!,
              modelSelection: state.records.thread.modelSelection,
              runtimePolicy,
              ...(previous === undefined ? {} : { resumeFromSession: previous }),
              ...(providerThread.nativeThreadRef?.nativeId == null
                ? {}
                : { initialNativeThreadId: providerThread.nativeThreadRef.nativeId }),
              ...(providerThread.nativeMetadata?.itemIdentityVersion === undefined
                ? {}
                : {
                    initialProviderItemIdentityVersion:
                      providerThread.nativeMetadata.itemIdentityVersion,
                  }),
            }),
          );
          const resumed = yield* awaitSessionOperation(
            session.resumeThread({
              providerThread,
              threadId: input.threadId,
              modelSelection: state.records.thread.modelSelection,
              runtimePolicy,
            }),
          );
          return { session, providerThread: resumed };
        }).pipe(Effect.result);
        if (sessionResult._tag === "Failure") return failed("session_resume_failed");
        const { session, providerThread: resumedThread } = sessionResult.success;
        if (!session.runSideQuery) return suppressed("provider_unsupported");
        const contexts = yield* readTurnContext(input.threadId, appContext, developerContext);
        const side = yield* runAdapter(session.runSideQuery, {
          appThread: state.records.thread,
          threadId: input.threadId,
          providerThread: resumedThread,
          modelSelection: state.records.thread.modelSelection,
          runtimePolicy,
          ...contexts,
          prompt: optimizePrompt(input.draft),
          purpose: "optimization",
        });
        if (side._tag === "Failure") return failed("provider_error");
        const response = side.success;
        if (response.failure !== null)
          return {
            result: { _tag: "Failed", requestId, reason: response.failure.class },
            side: response,
          };
        const reason = checkOptimizedPrompt(response.text, input.draft);
        return {
          result:
            reason === null
              ? {
                  _tag: "Optimized",
                  requestId,
                  text: stripOptimizeWrapping(response.text),
                  cacheMaybeExpired: maybeExpired,
                }
              : { _tag: "Filtered", requestId, reason },
          side: response,
        };
      });
      yield* writeOutcome(
        { threadId: input.threadId, runId: state.shell.latestRunId, feature: "optimization" },
        requestId,
        startedAt,
        state,
        outcome,
        maybeExpired,
      );
      return outcome.result;
    }).pipe(
      Effect.ensuring(
        Effect.gen(function* () {
          optimizations.delete(input.threadId);
          yield* Deferred.succeed(done, undefined);
        }),
      ),
    );
  });

  /** One deadline starts at RPC entry, including waiting, projection/context reads and session recovery. */
  const request = Effect.fn("ComposerAssistService.request")(function* <
    R extends ComposerSuggestResult | ComposerOptimizeResult,
  >(
    input: ComposerSuggestInput | ComposerOptimizeInput,
    feature: "suggestion" | "optimization",
    work: (requestId: string, startedAt: number) => Effect.Effect<R, ComposerAssistError>,
  ) {
    const requestId = yield* crypto.randomUUIDv4().pipe(Effect.orDie);
    const startedAt = yield* Clock.currentTimeMillis;
    return yield* work(requestId, startedAt).pipe(
      Effect.timeout(SIDE_QUERY_DEADLINE_MS),
      Effect.catchTags({
        TimeoutError: () =>
          Effect.gen(function* () {
            const result = { _tag: "Failed", requestId, reason: "timeout" } as const;
            yield* writeOutcome(
              { threadId: input.threadId, runId: "runId" in input ? input.runId : null, feature },
              requestId,
              startedAt,
              null,
              { result, side: null },
              false,
            );
            return result;
          }),
      }),
    );
  });

  return ComposerAssistService.of({
    suggestNext: Effect.fn("ComposerAssistService.suggestNext")(function* (
      input: ComposerSuggestInput,
    ): Effect.fn.Return<ComposerSuggestResult, ComposerAssistError> {
      return yield* Fiber.join(
        yield* request(input, "suggestion", (id, start) => suggest(input, id, start)).pipe(
          Effect.forkIn(scope),
        ),
      );
    }),
    optimizePrompt: Effect.fn("ComposerAssistService.optimizePrompt")(function* (
      input: ComposerOptimizeInput,
    ): Effect.fn.Return<ComposerOptimizeResult, ComposerAssistError> {
      return yield* Fiber.join(
        yield* request(input, "optimization", (id, start) => optimize(input, id, start)).pipe(
          Effect.forkIn(scope),
        ),
      );
    }),
  });
});

export const layer = Layer.effect(ComposerAssistService, make);

const SIDE_QUERY_DEADLINE_MS = 45_000;
const SUGGESTION_MEMO_TTL_MS = 10 * 60_000;
const CACHE_COLD_SUSPECT_UNCACHED_TOKENS = 8000;

/** Memoized provider metadata is shared, while request IDs and log entries remain per RPC. */
interface QueryOutcome<R = ComposerSuggestResult> {
  readonly result: R;
  readonly side: ProviderAdapter.ProviderAdapterV2SideQueryResult | null;
}
