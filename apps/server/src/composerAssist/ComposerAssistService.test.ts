/** Exercises side-query behavior through the service with controlled provider boundaries. */
import { assert, it } from "@effect/vitest";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import {
  ThreadId,
  RunId,
  ProviderThreadId,
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
    readonly query?: ProviderAdapter.ProviderAdapterV2SessionRuntime["runSideQuery"];
  } = {},
) {
  const entered = yield* Deferred.make<void>();
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
  const projection = {
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
        driver: ProviderDriverKind.make("codex"),
        providerSessionId,
        providerInstanceId: instanceId,
        appThreadId: threadId,
        nativeThreadRef: { nativeId: "native-1" },
      },
    ],
    providerTurns: [
      {
        providerThreadId,
        completedAt: options.gate === "cache_stale" ? DateTime.makeUnsafe(-600001) : completedAt,
      },
    ],
    providerSessions: [],
  } as unknown as OrchestrationV2ThreadProjection;
  const runtime = {
    driver: ProviderDriverKind.make("codex"),
    instanceId,
    providerSessionId,
    ...(options.gate === "provider_unsupported"
      ? {}
      : {
          runSideQuery: Effect.fn("Fake.sideQuery")(function* (
            input: ProviderAdapter.ProviderAdapterV2SideQueryInput,
          ) {
            calls.push(input);
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
  } as ProviderAdapter.ProviderAdapterV2SessionRuntime;

  const dependencies = Layer.mergeAll(
    NodeCrypto.layer,
    Layer.mock(ProjectionStore.ProjectionStoreV2)({
      getThreadShell: () => Effect.succeed(shell),
      getThreadRecords: () => Effect.succeed(projection),
    }),
    Layer.mock(ProviderSessions.ProviderSessionManagerV2)({
      isLive: () => Effect.succeed(options.gate !== "session_not_live"),
      get: () => Effect.succeed(Option.some(runtime)),
    }),
    RuntimePolicy.layer,
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
