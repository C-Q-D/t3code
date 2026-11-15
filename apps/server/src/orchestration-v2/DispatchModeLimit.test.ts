import { assert, it } from "@effect/vitest";
import {
  CommandId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  MessageId,
  ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlitePersistence from "../persistence/Sqlite.ts";
import * as ServerSettings from "../serverSettings.ts";
import { CodexProviderCapabilitiesV2 } from "./Adapters/CodexAdapterV2.ts";
import { DispatchModeLimit } from "./DispatchModeLimit.ts";
import * as Orchestrator from "./Orchestrator.ts";
import * as ProjectionStore from "./ProjectionStore.ts";
import * as ProviderAdapterRegistry from "./ProviderAdapterRegistry.ts";
import * as ProviderReplayHarness from "./testkit/ProviderReplayHarness.ts";
import type * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";

const instanceId = ProviderInstanceId.make("codex");
const adapter = {
  instanceId,
  driver: ProviderDriverKind.make("codex"),
  getCapabilities: () => Effect.succeed(CodexProviderCapabilitiesV2),
  planSelectionTransition: () => Effect.succeed({ type: "apply_on_next_turn" as const }),
  openSession: () => Effect.die("No provider process needed for metadata commands"),
} as ProviderAdapter.ProviderAdapterV2["Service"];
const layerDatabase = SqlitePersistence.layerMemory;
const layerSettings = ServerSettings.layerTest().pipe(Layer.orDie);
const layerTest = Layer.mergeAll(
  layerSettings,
  layerDatabase,
  ProjectionStore.layer.pipe(Layer.provide(layerDatabase)),
  ProviderReplayHarness.layerWithRegistry(
    { name: "dispatch-mode-limit" },
    ProviderAdapterRegistry.layerFromAdapters([adapter]),
    { databaseLayer: layerDatabase, runEffectWorker: false, serverSettingsLayer: layerSettings },
  ),
);

const supervised = { runtimeMode: "approval-required", interactionMode: "default" } as const;

const createThread = (threadId: ThreadId) =>
  Effect.gen(function* () {
    const orchestrator = yield* Orchestrator.OrchestratorV2;
    yield* orchestrator.dispatch({
      type: "thread.create",
      commandId: CommandId.make(`create:${threadId}`),
      threadId,
      projectId: ProjectId.make("project:dispatch-mode-limit"),
      title: "Before",
      modelSelection: { instanceId, model: "gpt-5" },
      ...supervised,
      branch: null,
      worktreePath: null,
      createdBy: "user",
      creationSource: "web",
    });
  });

it.layer(layerTest)("DispatchModeLimit", (it) => {
  it.effect.each([
    { auto: false, override: true, expected: true },
    { auto: true, override: false, expected: false },
    { auto: true, override: true, expected: true },
    { auto: false, override: false, expected: false },
    { auto: true, override: undefined, expected: true },
    { auto: false, override: undefined, expected: false },
  ])("snapshots rewrite at run acceptance: %j", ({ auto, override, expected }) =>
    Effect.gen(function* () {
      const orchestrator = yield* Orchestrator.OrchestratorV2;
      const projections = yield* ProjectionStore.ProjectionStoreV2;
      const settings = yield* ServerSettings.ServerSettingsService;
      const threadId = ThreadId.make(`thread:rewrite:${auto}:${override}`);
      yield* settings.updateSettings({ replyRewrite: { auto } });
      yield* createThread(threadId);
      const command = {
        type: "message.dispatch" as const,
        commandId: CommandId.make(`send:${threadId}`),
        threadId,
        messageId: MessageId.make(`message:${threadId}`),
        createdBy: "user" as const,
        creationSource: "web" as const,
        text: "Explain it.",
        attachments: [],
        dispatchMode: { type: "defer_start" as const },
        ...(override === undefined ? {} : { replyRewrite: override }),
      };
      yield* orchestrator.dispatch(command);
      assert.equal(
        (yield* projections.getThreadProjection(threadId)).runs[0]?.replyRewrite,
        expected,
      );
      yield* settings.updateSettings({ replyRewrite: { auto: !auto } });
      assert.isTrue((yield* orchestrator.dispatch(command)).replayed);
      const queued = {
        ...command,
        commandId: CommandId.make(`queue:${threadId}`),
        messageId: MessageId.make(`queued:${threadId}`),
        dispatchMode: { type: "queue_after_active" as const },
      };
      yield* orchestrator.dispatch(queued);
      const projection = yield* projections.getThreadProjection(threadId);
      assert.equal(projection.runs[0]?.replyRewrite, expected);
      assert.equal(projection.runs[1]?.replyRewrite, override ?? !auto);
      assert.equal(projection.runs[1]?.status, "queued");
      assert.deepEqual(
        projection.messages.map((message) => message.text),
        ["Explain it.", "Explain it."],
      );
    }),
  );

  it.effect("refuses a limited command on a thread its user raised, and records nothing", () =>
    Effect.gen(function* () {
      const orchestrator = yield* Orchestrator.OrchestratorV2;
      const projections = yield* ProjectionStore.ProjectionStoreV2;
      const threadId = ThreadId.make("thread:limit-raised");
      yield* createThread(threadId);
      yield* orchestrator.dispatch({
        type: "thread.runtime-mode.set",
        commandId: CommandId.make("raise"),
        threadId,
        runtimeMode: "full-access",
      });
      const rename = {
        type: "thread.metadata.update",
        commandId: CommandId.make("rename"),
        threadId,
        title: "After",
      } as const;
      const refused = yield* orchestrator
        .dispatch(rename)
        .pipe(Effect.provideService(DispatchModeLimit, supervised), Effect.flip);
      assert.equal(refused._tag, "OrchestratorThreadAboveModeLimitError");
      assert.equal((yield* projections.getThreadShell(threadId))?.title, "Before");

      yield* orchestrator.dispatch({
        type: "thread.runtime-mode.set",
        commandId: CommandId.make("lower"),
        threadId,
        runtimeMode: "approval-required",
      });
      yield* orchestrator
        .dispatch(rename)
        .pipe(Effect.provideService(DispatchModeLimit, supervised));
      assert.equal((yield* projections.getThreadShell(threadId))?.title, "After");
    }),
  );

  it.effect("refuses to fork a source thread its user raised", () =>
    Effect.gen(function* () {
      const orchestrator = yield* Orchestrator.OrchestratorV2;
      const projections = yield* ProjectionStore.ProjectionStoreV2;
      const sourceThreadId = ThreadId.make("thread:limit-fork-source");
      const targetThreadId = ThreadId.make("thread:limit-fork-target");
      yield* createThread(sourceThreadId);
      yield* orchestrator.dispatch({
        type: "thread.runtime-mode.set",
        commandId: CommandId.make("raise-source"),
        threadId: sourceThreadId,
        runtimeMode: "full-access",
      });
      const fork = {
        type: "thread.fork",
        commandId: CommandId.make("fork"),
        sourceThreadId,
        targetThreadId,
        sourcePoint: { type: "latest_stable" },
        createdBy: "agent",
        creationSource: "mcp",
      } as const;
      const refused = yield* orchestrator
        .dispatch(fork)
        .pipe(Effect.provideService(DispatchModeLimit, supervised), Effect.flip);
      assert.ok(refused._tag === "OrchestratorThreadAboveModeLimitError");
      assert.equal(refused.threadId, sourceThreadId);
      assert.isNull(yield* projections.getThreadShell(targetThreadId));

      yield* orchestrator.dispatch({
        type: "thread.runtime-mode.set",
        commandId: CommandId.make("lower-source"),
        threadId: sourceThreadId,
        runtimeMode: "approval-required",
      });
      const retried = yield* orchestrator
        .dispatch(fork)
        .pipe(Effect.provideService(DispatchModeLimit, supervised), Effect.flip);
      assert.equal(retried._tag, "OrchestratorDispatchError");
    }),
  );
});
