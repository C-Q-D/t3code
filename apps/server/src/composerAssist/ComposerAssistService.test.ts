/** Exercises side-query behavior through the service with controlled provider boundaries. */
import { assert, it } from "@effect/vitest";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import {
  ThreadId,
  RunId,
  ProviderThreadId,
  ProjectId,
  ProviderSessionId,
  ProviderInstanceId,
  ProviderDriverKind,
  type OrchestrationV2ThreadShell,
  type OrchestrationV2ThreadProjection,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";
import * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";
import * as ProjectionStore from "../orchestration-v2/ProjectionStore.ts";
import * as ProviderSessions from "../orchestration-v2/ProviderSessionManager.ts";
import * as RuntimePolicy from "../orchestration-v2/RuntimePolicy.ts";
import * as McpContext from "../mcpApps/McpAppModelContext.ts";
import * as DeveloperContext from "../orchestration-v2/ThreadDeveloperContext.ts";
import * as Log from "./ComposerAssistLog.ts";
import * as Service from "./ComposerAssistService.ts";

const threadId = ThreadId.make("thread-1");
const runId = RunId.make("run-1");
const providerThreadId = ProviderThreadId.make("provider-thread-1");
const providerSessionId = ProviderSessionId.make("session-1");
const instanceId = ProviderInstanceId.make("codex-1");

const optimizationInput = { threadId, draft: "fix it", style: "default" as const };

it.effect.each(["suggestion", "optimization"] as const)(
  "logs thread-not-found once for %s",
  (feature) =>
    Effect.gen(function* () {
      const f = yield* fixture({ missingThread: true });
      const result = yield* feature === "suggestion"
        ? f.service.suggestNext({ threadId, runId }).pipe(Effect.result)
        : f.service.optimizePrompt(optimizationInput).pipe(Effect.result);
      assert.strictEqual(result._tag, "Failure");
      if (result._tag === "Failure") assert.strictEqual(result.failure.reason, "thread_not_found");
      assert.strictEqual(f.logs.length, 1);
      assert.propertyVal(f.logs[0], "reason", "thread_not_found");
      assert.propertyVal(f.logs[0], "driver", null);
      assert.propertyVal(f.logs[0], "instanceId", null);
    }).pipe(Effect.scoped),
);

it.effect.each(["suggestion", "optimization"] as const)(
  "logs policy failure once for %s",
  (feature) =>
    Effect.gen(function* () {
      const f = yield* fixture({ policyFailure: true });
      const result = yield* feature === "suggestion"
        ? f.service.suggestNext({ threadId, runId }).pipe(Effect.result)
        : f.service.optimizePrompt(optimizationInput).pipe(Effect.result);
      assert.strictEqual(result._tag, "Failure");
      assert.strictEqual(f.logs.length, 1);
      if (result._tag === "Failure") {
        assert.strictEqual(result.failure.reason, "internal");
        assert.include(result.failure.message, "RuntimePolicyResolveError");
        assert.include(result.failure.message, "policy unavailable");
      }
      assert.include(JSON.stringify(f.logs), "policy unavailable");
      assert.propertyVal(f.logs[0], "instanceId", instanceId);
      assert.isFalse(JSON.stringify(f.logs).includes("fix it"));
    }).pipe(Effect.scoped),
);

it.effect("same-key suggestion joins across cache expiry", () =>
  Effect.gen(function* () {
    const finish = yield* Deferred.make<void>();
    const f = yield* fixture({
      driver: "claudeAgent",
      cacheExpiresAt: "1970-01-01T00:00:00.001Z",
      query: () =>
        Deferred.await(finish).pipe(
          Effect.as({
            text: "run tests",
            model: null,
            usage: null,
            attemptedTools: [],
            stop: "completed" as const,
            failure: null,
          }),
        ),
    });
    const first = yield* f.service.suggestNext({ threadId, runId }).pipe(Effect.forkChild);
    yield* Deferred.await(f.entered);
    yield* TestClock.adjust("2 millis");
    const second = yield* f.service.suggestNext({ threadId, runId }).pipe(Effect.forkChild);
    yield* Deferred.succeed(finish, undefined);
    assert.propertyVal(yield* Fiber.join(first), "_tag", "Suggested");
    assert.propertyVal(yield* Fiber.join(second), "_tag", "Suggested");
    assert.strictEqual(f.calls.length, 1);
  }).pipe(Effect.scoped),
);

it.effect("unsupported provider precedes optimization inflight", () =>
  Effect.gen(function* () {
    const finish = yield* Deferred.make<void>();
    const f = yield* fixture({
      query: () =>
        Deferred.await(finish).pipe(
          Effect.as({
            text: "run tests",
            model: null,
            usage: null,
            attemptedTools: [],
            stop: "completed" as const,
            failure: null,
          }),
        ),
    });
    const optimization = yield* f.service.optimizePrompt(optimizationInput).pipe(Effect.forkChild);
    yield* Deferred.await(f.entered);
    f.setDriver("unsupported");
    assert.propertyVal(
      yield* f.service.suggestNext({ threadId, runId }),
      "reason",
      "provider_unsupported",
    );
    yield* Deferred.succeed(finish, undefined);
    yield* Fiber.join(optimization);
  }).pipe(Effect.scoped),
);

it.effect.each(["open", "resume", "budget"] as const)(
  "total deadline covers %s and releases ownership",
  (stage) =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      const completed = yield* Deferred.make<void>();
      const wait = Deferred.succeed(started, undefined).pipe(
        Effect.andThen(Deferred.await(release)),
        Effect.uninterruptible,
      );
      const f = yield* fixture({
        gate: "session_not_live",
        ...(stage === "resume" ? { resumeWait: wait } : { openWait: wait }),
        ...(stage === "budget" ? { query: () => Effect.never } : {}),
      });
      yield* Effect.gen(function* () {
        const request = yield* f.service.optimizePrompt(optimizationInput).pipe(
          Effect.tap(() => Deferred.succeed(completed, undefined)),
          Effect.forkChild,
        );
        yield* Deferred.await(started);
        if (stage === "budget") {
          yield* TestClock.adjust("30 seconds");
          yield* Deferred.succeed(release, undefined);
          yield* Deferred.await(f.entered);
          yield* TestClock.adjust("15 seconds");
        } else yield* TestClock.adjust("45 seconds");
        assert.isTrue(yield* Deferred.isDone(completed));
        assert.propertyVal(yield* Fiber.join(request), "reason", "timeout");
        assert.notPropertyVal(
          yield* f.service.suggestNext({ threadId, runId }),
          "reason",
          "inflight",
        );
      }).pipe(Effect.ensuring(Deferred.succeed(release, undefined)));
    }).pipe(Effect.scoped),
);

it.effect("session-not-live precedes optimization restoring a session", () =>
  Effect.gen(function* () {
    const opening = yield* Deferred.make<void>();
    const finish = yield* Deferred.make<void>();
    const f = yield* fixture({
      gate: "session_not_live",
      openWait: Deferred.succeed(opening, undefined).pipe(Effect.andThen(Deferred.await(finish))),
    });
    const optimization = yield* f.service.optimizePrompt(optimizationInput).pipe(Effect.forkChild);
    yield* Deferred.await(opening);
    assert.propertyVal(
      yield* f.service.suggestNext({ threadId, runId }),
      "reason",
      "session_not_live",
    );
    assert.strictEqual(f.calls.length, 0);
    yield* Deferred.succeed(finish, undefined);
    yield* Fiber.join(optimization);
  }).pipe(Effect.scoped),
);

it.effect("optimization waits for suggestion interruption before starting its query", () =>
  Effect.gen(function* () {
    const events: string[] = [];
    const f = yield* fixture({
      query: (input) => {
        events.push(input.purpose);
        return input.purpose === "suggestion"
          ? Effect.never.pipe(
              Effect.onInterrupt(() =>
                Effect.sync(() => {
                  events.push("suggestion-ended");
                }),
              ),
            )
          : Effect.succeed({
              text: "fix it and test it",
              model: null,
              usage: null,
              attemptedTools: [],
              stop: "completed",
              failure: null,
            });
      },
    });
    const suggestion = yield* f.service.suggestNext({ threadId, runId }).pipe(Effect.forkChild);
    yield* Deferred.await(f.entered);
    const optimization = yield* f.service.optimizePrompt(optimizationInput).pipe(Effect.forkChild);
    yield* TestClock.adjust("45 seconds");
    assert.propertyVal(yield* Fiber.join(suggestion), "reason", "timeout");
    assert.propertyVal(yield* Fiber.join(optimization), "text", "fix it and test it");
    assert.deepStrictEqual(events, ["suggestion", "suggestion-ended", "optimization"]);
    assert.strictEqual(f.logs.length, 2);
  }).pipe(Effect.scoped),
);

it.effect("optimization in flight suppresses suggestions even when a suggestion is memoized", () =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>();
    const finish = yield* Deferred.make<void>();
    const f = yield* fixture({
      query: (input) =>
        Effect.gen(function* () {
          if (input.purpose === "optimization") {
            yield* Deferred.succeed(started, undefined);
            yield* Deferred.await(finish);
          }
          return {
            text: "run tests",
            model: null,
            usage: null,
            attemptedTools: [],
            stop: "completed" as const,
            failure: null,
          };
        }),
    });
    yield* f.service.suggestNext({ threadId, runId });
    const optimization = yield* f.service.optimizePrompt(optimizationInput).pipe(Effect.forkChild);
    yield* Deferred.await(started);
    const result = yield* f.service.suggestNext({ threadId, runId });
    assert.propertyVal(result, "reason", "inflight");
    assert.deepStrictEqual(f.lifecycle, ["suggestion", "optimization"]);
    yield* Deferred.succeed(finish, undefined);
    yield* Fiber.join(optimization);
  }).pipe(Effect.scoped),
);

it.effect("optimization deadline interrupts the adapter and releases the thread", () =>
  Effect.gen(function* () {
    const interrupted = yield* Deferred.make<void>();
    let calls = 0;
    const f = yield* fixture({
      query: () =>
        ++calls === 1
          ? Effect.never.pipe(Effect.onInterrupt(() => Deferred.succeed(interrupted, undefined)))
          : Effect.succeed({
              text: "fix it and test it",
              model: null,
              usage: null,
              attemptedTools: [],
              stop: "completed",
              failure: null,
            }),
    });
    const request = yield* f.service.optimizePrompt(optimizationInput).pipe(Effect.forkChild);
    yield* Deferred.await(f.entered);
    yield* TestClock.adjust("45 seconds");
    assert.propertyVal(yield* Fiber.join(request), "reason", "timeout");
    yield* Deferred.await(interrupted);
    assert.propertyVal(yield* f.service.optimizePrompt(optimizationInput), "_tag", "Optimized");
    assert.strictEqual(f.logs.length, 2);
  }).pipe(Effect.scoped),
);

it.effect("optimization maps startup query errors without exposing provider detail", () =>
  Effect.gen(function* () {
    const f = yield* fixture({
      query: () =>
        Effect.fail(
          new ProviderAdapter.ProviderAdapterOpenSessionError({
            driver: ProviderDriverKind.make("codex"),
            providerSessionId,
            cause: "private detail",
          }),
        ),
    });
    assert.propertyVal(
      yield* f.service.optimizePrompt(optimizationInput),
      "reason",
      "provider_error",
    );
    assert.propertyVal(f.logs[0], "outcome", "failed");
    assert.isFalse(JSON.stringify(f.logs).includes("private detail"));
  }).pipe(Effect.scoped),
);

it.effect("optimization rejects a rewrite that drops a draft reference", () =>
  Effect.gen(function* () {
    const f = yield* fixture();
    const result = yield* f.service.optimizePrompt({ ...optimizationInput, draft: "fix @file.ts" });
    assert.propertyVal(result, "reason", "references_dropped");
    assert.propertyVal(f.logs[0], "outcome", "filtered");
  }).pipe(Effect.scoped),
);

it.effect("optimization reopens, resumes and queries with the resumed thread only in memory", () =>
  Effect.gen(function* () {
    const f = yield* fixture({ gate: "session_not_live" });
    const result = yield* f.service.optimizePrompt(optimizationInput);
    assert.propertyVal(result, "_tag", "Optimized");
    assert.deepStrictEqual(f.lifecycle, ["open", "resume", "optimization"]);
    assert.deepStrictEqual(f.opens[0], {
      threadId,
      providerSessionId,
      modelSelection: { instanceId, model: "requested-model" },
      runtimePolicy: { runtimeMode: "full-access", interactionMode: "default", cwd: null },
      resumeFromSession: f.projection.providerSessions[0]!,
      initialNativeThreadId: "native-1",
      initialProviderItemIdentityVersion: 2,
    });
    assert.propertyVal(f.calls[0]?.providerThread.nativeThreadRef, "nativeId", "resumed-native");
    assert.propertyVal(f.projection.providerThreads[0]?.nativeThreadRef, "nativeId", "native-1");
    assert.strictEqual(f.logs.length, 1);
    assert.propertyVal(f.logs[0], "requestId", result.requestId);
    assert.propertyVal(f.logs[0], "promptVersion", "o1");
    assert.propertyVal(f.logs[0], "feature", "optimization");
  }).pipe(Effect.scoped),
);

it.effect.each(["open", "resume"] as const)(
  "optimization reports session_resume_failed when %s fails",
  (resumeFailure) =>
    Effect.gen(function* () {
      const f = yield* fixture({ resumeFailure });
      assert.propertyVal(
        yield* f.service.optimizePrompt(optimizationInput),
        "reason",
        "session_resume_failed",
      );
      assert.strictEqual(f.calls.length, 0);
      assert.deepStrictEqual(f.lifecycle, resumeFailure === "open" ? ["open"] : ["open", "resume"]);
      assert.propertyVal(f.logs[0], "outcome", "failed");
    }).pipe(Effect.scoped),
);

it.effect.each([
  ["codex", undefined, "cache_stale", true],
  ["codex", undefined, undefined, false],
  ["claudeAgent", "1969-12-31T23:59:59.999Z", undefined, true],
  ["claudeAgent", "1970-01-01T00:00:00.000Z", undefined, false],
] as const)(
  "optimization computes cache hint for %s / %s / %s",
  ([driver, cacheExpiresAt, gate, expired]) =>
    Effect.gen(function* () {
      const f = yield* fixture({
        driver,
        ...(cacheExpiresAt === undefined ? {} : { cacheExpiresAt }),
        ...(gate === undefined ? {} : { gate }),
      });
      assert.propertyVal(
        yield* f.service.optimizePrompt(optimizationInput),
        "cacheMaybeExpired",
        expired,
      );
      assert.strictEqual(f.calls.length, 1);
      assert.propertyVal(f.logs[0], "cacheMaybeExpired", expired);
    }).pipe(Effect.scoped),
);

it.effect.each(["provider_unsupported", "generating"] as const)(
  "optimization suppresses %s and logs without a query",
  (gate) =>
    Effect.gen(function* () {
      const f = yield* fixture({ gate });
      assert.propertyVal(yield* f.service.optimizePrompt(optimizationInput), "reason", gate);
      assert.strictEqual(f.calls.length, 0);
      assert.strictEqual(f.logs.length, 1);
    }).pipe(Effect.scoped),
);

it.effect.each([
  ["", "empty"],
  ["fix it", "unchanged"],
  ["x".repeat(2001), "too_long"],
] as const)("optimization filters response %j as %s", ([text, reason]) =>
  Effect.gen(function* () {
    const f = yield* fixture({
      query: () =>
        Effect.succeed({
          text,
          model: null,
          usage: null,
          attemptedTools: [],
          stop: "completed",
          failure: null,
        }),
    });
    const result = yield* f.service.optimizePrompt(optimizationInput);
    assert.propertyVal(result, "_tag", "Filtered");
    assert.propertyVal(result, "reason", reason);
  }).pipe(Effect.scoped),
);

it.effect(
  "optimization keeps literal drafts in its prompt and filters text after a tool interruption",
  () =>
    Effect.gen(function* () {
      const f = yield* fixture({
        query: () =>
          Effect.succeed({
            text: "<prompt>fix @file.ts and test it</prompt>",
            model: "actual",
            usage: null,
            attemptedTools: ["Read"],
            stop: "interrupted_on_tool",
            failure: null,
          }),
      });
      const result = yield* f.service.optimizePrompt({
        ...optimizationInput,
        draft: "  fix @file.ts $&\n",
      });
      assert.propertyVal(result, "text", "fix @file.ts and test it");
      assert.include(f.calls[0]!.prompt, "<draft>\n  fix @file.ts $&\n\n</draft>");
      assert.deepStrictEqual(f.calls[0]?.appContext, [
        { key: "mcp_app_item__1", text: "app context" },
      ]);
      assert.deepStrictEqual(f.calls[0]?.developerContext, [
        { key: "persona", text: "developer context" },
      ]);
      assert.propertyVal(f.logs[0], "toolAttempted", true);
      assert.isFalse(JSON.stringify(f.logs).includes("fix @file.ts"));
    }).pipe(Effect.scoped),
);

it.effect.each(["usage_limit", "provider_error", "transport_error"] as const)(
  "optimization maps adapter failure %s",
  (reason) =>
    Effect.gen(function* () {
      const f = yield* fixture({
        query: () =>
          Effect.succeed({
            text: "",
            model: null,
            usage: null,
            attemptedTools: [],
            stop: "error",
            failure: { class: reason, detail: "detail" },
          }),
      });
      assert.propertyVal(yield* f.service.optimizePrompt(optimizationInput), "reason", reason);
    }).pipe(Effect.scoped),
);

it.effect("keeps provider generation alive after the requesting RPC is interrupted", () =>
  Effect.gen(function* () {
    const finish = yield* Deferred.make<ProviderAdapter.ProviderAdapterV2SideQueryResult>();
    const providerInterrupted = yield* Deferred.make<void>();
    const f = yield* fixture({
      query: () =>
        Deferred.await(finish).pipe(
          Effect.onInterrupt(() => Deferred.succeed(providerInterrupted, undefined)),
        ),
    });
    const request = yield* f.service.suggestNext({ threadId, runId }).pipe(Effect.forkChild);
    yield* Deferred.await(f.entered);
    yield* Fiber.interrupt(request);
    assert.isFalse(yield* Deferred.isDone(providerInterrupted));
    yield* Deferred.succeed(finish, {
      text: "run tests",
      model: null,
      usage: null,
      attemptedTools: [],
      stop: "completed",
      failure: null,
    });
    assert.propertyVal(yield* f.service.suggestNext({ threadId, runId }), "text", "run tests");
    assert.strictEqual(f.calls.length, 1);
  }).pipe(Effect.scoped),
);

it.effect("maps an adapter error channel failure to provider_error", () =>
  Effect.gen(function* () {
    const f = yield* fixture({
      query: () =>
        Effect.fail(
          new ProviderAdapter.ProviderAdapterOpenSessionError({
            driver: ProviderDriverKind.make("codex"),
            providerSessionId,
          }),
        ),
    });
    assert.propertyVal(
      yield* f.service.suggestNext({ threadId, runId }),
      "reason",
      "provider_error",
    );
  }).pipe(Effect.scoped),
);

it.effect("suppresses a different current run while an older side query is in flight", () =>
  Effect.gen(function* () {
    const finish = yield* Deferred.make<ProviderAdapter.ProviderAdapterV2SideQueryResult>();
    const f = yield* fixture({ query: () => Deferred.await(finish) });
    const first = yield* f.service.suggestNext({ threadId, runId }).pipe(Effect.forkChild);
    yield* Deferred.await(f.entered);
    const next = RunId.make("run-2");
    f.advanceRun(next);
    assert.propertyVal(
      yield* f.service.suggestNext({ threadId, runId: next }),
      "reason",
      "inflight",
    );
    assert.strictEqual(f.calls.length, 1);
    yield* Deferred.succeed(finish, {
      text: "run tests",
      model: null,
      usage: null,
      attemptedTools: [],
      stop: "completed",
      failure: null,
    });
    yield* Fiber.join(first);
  }).pipe(Effect.scoped),
);

/** Provides only read projection methods; any accidental write or event dependency fails. */
const fixture = Effect.fn("ComposerAssistTest.fixture")(function* (
  options: {
    readonly gate?: string;
    readonly missingThread?: boolean;
    readonly policyFailure?: boolean;
    readonly query?: ProviderAdapter.ProviderAdapterV2SessionRuntime["runSideQuery"];
    readonly resumeFailure?: "open" | "resume";
    readonly driver?: string;
    readonly cacheExpiresAt?: string;
    readonly openWait?: Effect.Effect<void>;
    readonly resumeWait?: Effect.Effect<void>;
  } = {},
) {
  const entered = yield* Deferred.make<void>();
  const lifecycle: string[] = [];
  const opens: Parameters<ProviderSessions.ProviderSessionManagerV2["Service"]["open"]>[0][] = [];
  const calls: ProviderAdapter.ProviderAdapterV2SideQueryInput[] = [];
  const logs: Log.ComposerAssistLogRecord[] = [];
  const completedAt = DateTime.makeUnsafe(0);
  let shell = {
    id: threadId,
    latestRunId: runId,
    latestRunCompletedAt:
      options.gate === "stale_turn" ? DateTime.makeUnsafe(-600001) : completedAt,
    activeRunId: options.gate === "generating" ? runId : null,
    status: "idle",
  } as OrchestrationV2ThreadShell;
  let projection = {
    thread: {
      id: threadId,
      activeProviderThreadId: providerThreadId,
      modelSelection: { instanceId, model: "requested-model" },
      runtimeMode: "full-access",
      interactionMode: "default",
      worktreePath: null,
    },
    providerThreads: [
      {
        id: providerThreadId,
        driver: ProviderDriverKind.make(options.driver ?? "codex"),
        providerSessionId,
        providerInstanceId: instanceId,
        appThreadId: threadId,
        nativeThreadRef: { nativeId: "native-1" },
        nativeMetadata: { itemIdentityVersion: 2 },
      },
    ],
    providerTurns: [
      {
        providerThreadId,
        completedAt: options.gate === "cache_stale" ? DateTime.makeUnsafe(-600001) : completedAt,
        tokenUsage: { promptCacheExpiresAt: options.cacheExpiresAt },
      },
    ],
    providerSessions: [{ id: providerSessionId }],
  } as unknown as OrchestrationV2ThreadProjection;
  const unexpectedMainOperation = () =>
    Effect.die("Composer assistance must not invoke main-thread operations.");
  const runtime: ProviderAdapter.ProviderAdapterV2SessionRuntime = {
    driver: ProviderDriverKind.make("codex"),
    instanceId,
    providerSessionId,
    providerSession: projection.providerSessions[0]!,
    events: Stream.never,
    ensureThread: unexpectedMainOperation,
    startTurn: unexpectedMainOperation,
    steerTurn: unexpectedMainOperation,
    interruptTurn: unexpectedMainOperation,
    respondToRuntimeRequest: unexpectedMainOperation,
    readThreadSnapshot: unexpectedMainOperation,
    rollbackThread: unexpectedMainOperation,
    forkThread: unexpectedMainOperation,
    resumeThread: Effect.fn("Fake.resumeThread")(function* () {
      lifecycle.push("resume");
      if (options.resumeWait) yield* options.resumeWait;
      if (options.resumeFailure === "resume")
        return yield* new ProviderAdapter.ProviderAdapterResumeThreadError({
          driver: ProviderDriverKind.make("codex"),
          providerSessionId,
          providerThreadId,
        });
      return {
        ...projection.providerThreads[0]!,
        nativeThreadRef: {
          ...projection.providerThreads[0]!.nativeThreadRef!,
          nativeId: "resumed-native",
        },
      };
    }),
    ...(options.gate === "provider_unsupported"
      ? {}
      : {
          runSideQuery: Effect.fn("Fake.sideQuery")(function* (
            input: ProviderAdapter.ProviderAdapterV2SideQueryInput,
          ) {
            calls.push(input);
            lifecycle.push(input.purpose);
            yield* Deferred.succeed(entered, undefined);
            return yield* (
              options.query?.(input) ??
                Effect.succeed({
                  text: "run tests",
                  model: "actual-model",
                  usage: { inputTokens: 12000, cachedInputTokens: 11000, outputTokens: 3 },
                  attemptedTools: [],
                  stop: "completed",
                  failure: null,
                } satisfies ProviderAdapter.ProviderAdapterV2SideQueryResult)
            );
          }),
        }),
  };

  const dependencies = Layer.mergeAll(
    NodeCrypto.layer,
    Layer.mock(ProjectionStore.ProjectionStoreV2)({
      getThreadShell: () => Effect.sync(() => (options.missingThread ? null : shell)),
      getThreadRecords: () => Effect.sync(() => projection),
    }),
    Layer.mock(ProviderSessions.ProviderSessionManagerV2)({
      isLive: () => Effect.succeed(options.gate !== "session_not_live"),
      get: () =>
        Effect.succeed(
          options.gate === "session_not_live" || options.resumeFailure
            ? Option.none()
            : Option.some(runtime),
        ),
      open: Effect.fn("Fake.open")(function* (input) {
        lifecycle.push("open");
        opens.push(input);
        if (options.openWait) yield* options.openWait;
        if (options.resumeFailure === "open")
          return yield* new ProviderSessions.ProviderSessionOpenError({
            instanceId,
            providerSessionId,
          });
        return runtime;
      }),
    }),
    options.policyFailure
      ? Layer.succeed(RuntimePolicy.RuntimePolicyV2, {
          resolve: () =>
            Effect.fail(
              new RuntimePolicy.RuntimePolicyResolveError({
                projectId: ProjectId.make("project-1"),
                providerInstanceId: instanceId,
                cause: new Error("policy unavailable"),
              }),
            ),
        })
      : RuntimePolicy.layer,
    Layer.mock(McpContext.McpAppModelContext)({
      forThread: () =>
        Effect.succeed([
          { itemId: "item:/1", server: "server", tool: "tool", text: "app context" },
        ]),
    }),
    Layer.succeed(DeveloperContext.ThreadDeveloperContext, {
      forThread: () => Effect.succeed([{ key: "persona", text: "developer context" }]),
    }),
    Layer.succeed(Log.ComposerAssistLog, {
      write: (record) =>
        Effect.sync(() => {
          logs.push(record);
        }),
    }),
  );
  const service = Context.get(
    yield* Layer.build(Service.layer.pipe(Layer.provide(dependencies))),
    Service.ComposerAssistService,
  );
  return {
    service,
    calls,
    logs,
    entered,
    lifecycle,
    opens,
    projection,
    setDriver: (driver: string) => {
      projection = {
        ...projection,
        providerThreads: [
          { ...projection.providerThreads[0]!, driver: ProviderDriverKind.make(driver) },
        ],
      };
    },
    advanceRun: (id: typeof runId) => {
      shell = { ...shell, latestRunId: id };
    },
  };
});

it.effect.each([
  "provider_unsupported",
  "session_not_live",
  "generating",
  "cache_stale",
  "stale_turn",
] as const)("suppresses %s without provider work and logs once", (gate) =>
  Effect.gen(function* () {
    const f = yield* fixture({ gate });
    const result = yield* f.service.suggestNext({ threadId, runId });
    assert.deepStrictEqual(result, {
      _tag: "Suppressed",
      reason: gate,
      requestId: result.requestId,
    });
    assert.strictEqual(f.calls.length, 0);
    assert.strictEqual(f.logs.length, 1);
    assert.strictEqual(f.logs[0]?.requestId, result.requestId);
    assert.strictEqual(f.logs[0]?.reason, gate);
  }).pipe(Effect.scoped),
);

it.effect("rejects a run other than the latest without querying", () =>
  Effect.gen(function* () {
    const f = yield* fixture();
    assert.propertyVal(
      yield* f.service.suggestNext({ threadId, runId: RunId.make("old-run") }),
      "reason",
      "stale_turn",
    );
    assert.strictEqual(f.calls.length, 0);
  }).pipe(Effect.scoped),
);

it.effect("joins concurrent suggestions and memoizes the result with per-request logs", () =>
  Effect.gen(function* () {
    const finish = yield* Deferred.make<ProviderAdapter.ProviderAdapterV2SideQueryResult>();
    const f = yield* fixture({ query: () => Deferred.await(finish) });
    const first = yield* f.service.suggestNext({ threadId, runId }).pipe(Effect.forkChild);
    yield* Deferred.await(f.entered);
    const second = yield* f.service.suggestNext({ threadId, runId }).pipe(Effect.forkChild);
    yield* Deferred.succeed(finish, {
      text: "run tests",
      model: "model",
      usage: null,
      attemptedTools: [],
      stop: "completed",
      failure: null,
    });
    const a = yield* Fiber.join(first);
    const b = yield* Fiber.join(second);
    const c = yield* f.service.suggestNext({ threadId, runId });
    assert.deepStrictEqual({ ...b, requestId: a.requestId }, a);
    assert.deepStrictEqual({ ...c, requestId: a.requestId }, a);
    assert.propertyVal(a, "text", "run tests");
    assert.strictEqual(f.calls.length, 1);
    assert.strictEqual(f.logs.length, 3);
  }).pipe(Effect.scoped),
);

it.effect("interrupts an overdue provider query at 45 seconds", () =>
  Effect.gen(function* () {
    const interrupted = yield* Deferred.make<void>();
    const f = yield* fixture({
      query: () =>
        Effect.never.pipe(Effect.onInterrupt(() => Deferred.succeed(interrupted, undefined))),
    });
    const request = yield* f.service.suggestNext({ threadId, runId }).pipe(Effect.forkChild);
    yield* Deferred.await(f.entered);
    yield* TestClock.adjust("45 seconds");
    assert.propertyVal(yield* Fiber.join(request), "reason", "timeout");
    yield* Deferred.await(interrupted);
  }).pipe(Effect.scoped),
);

it.effect.each(["usage_limit", "provider_error", "transport_error"] as const)(
  "maps adapter failure %s",
  (reason) =>
    Effect.gen(function* () {
      const f = yield* fixture({
        query: () =>
          Effect.succeed({
            text: "",
            model: null,
            usage: null,
            attemptedTools: [],
            stop: "error",
            failure: { class: reason, detail: "private provider detail" },
          }),
      });
      const result = yield* f.service.suggestNext({ threadId, runId });
      assert.propertyVal(result, "_tag", "Failed");
      assert.propertyVal(result, "reason", reason);
      assert.isFalse(JSON.stringify(f.logs).includes("private provider detail"));
    }).pipe(Effect.scoped),
);

it.effect("passes matching contexts and accepts text returned after a tool interruption", () =>
  Effect.gen(function* () {
    const f = yield* fixture({
      query: () =>
        Effect.succeed({
          text: "run tests",
          model: "actual",
          usage: null,
          attemptedTools: ["tool"],
          stop: "interrupted_on_tool",
          failure: null,
        }),
    });
    assert.propertyVal(yield* f.service.suggestNext({ threadId, runId }), "text", "run tests");
    assert.deepStrictEqual(f.calls[0]?.appContext, [
      { key: "mcp_app_item__1", text: "app context" },
    ]);
    assert.deepStrictEqual(f.calls[0]?.developerContext, [
      { key: "persona", text: "developer context" },
    ]);
    assert.propertyVal(f.logs[0], "toolAttempted", true);
  }).pipe(Effect.scoped),
);
