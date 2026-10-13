/** Isolated disk SQLite and real orchestration with a controllable provider; never opens a live T3 home. */
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  CommandId,
  EventId,
  MessageId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  ProviderThreadId,
  ProviderTurnId,
  type Discussion,
  type OrchestrationV2DomainEvent,
  type OrchestrationV2ProviderFailure,
  type OrchestrationV2Run,
  type RunId,
  type ThreadId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Queue from "effect/Queue";
import * as Deferred from "effect/Deferred";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/sql/SqlClient";
import type * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";
import type { ProviderInstance } from "@t3tools/provider-core/server/driver";
import * as McpProviderSessions from "@t3tools/provider-core/server/McpProviderSessions";
import * as CheckpointStore from "../checkpointing/CheckpointStore.ts";
import * as Config from "../config.ts";
import * as Sqlite from "../persistence/Sqlite.ts";
import * as Projects from "../project/ProjectService.ts";
import * as Enrichment from "../project/ProjectEnrichmentService.ts";
import * as WorkspacePaths from "../workspace/WorkspacePaths.ts";
import * as Instances from "../provider/ProviderInstanceRegistry.ts";
import * as SourceControl from "../sourceControl/SourceControlProviderRegistry.ts";
import * as Settings from "../serverSettings.ts";
import * as VcsRegistry from "../vcs/VcsDriverRegistry.ts";
import * as VcsProcess from "../vcs/VcsProcess.ts";
import * as GitWorkflow from "../git/GitWorkflowService.ts";
import * as TextGeneration from "../textGeneration/TextGeneration.ts";
import * as McpSessionTestkit from "../mcp/McpSessionRegistry.testkit.ts";
import { CodexProviderCapabilitiesV2 } from "../orchestration-v2/Adapters/CodexAdapterV2.ts";
import * as Runtime from "../orchestration-v2/runtimeLayer.ts";
import * as Adapters from "../orchestration-v2/ProviderAdapterRegistry.ts";
import * as Orchestrator from "../orchestration-v2/Orchestrator.ts";
import * as EventSink from "../orchestration-v2/EventSink.ts";
import * as Worker from "../orchestration-v2/EffectWorker.ts";
import * as Projection from "../orchestration-v2/ProjectionStore.ts";
import * as Threads from "../orchestration-v2/ThreadManagementService.ts";
import * as Launch from "../orchestration-v2/ThreadLaunchService.ts";
import * as CaptureRecovery from "./DiscussionCheckpointRecovery.ts";
import * as Outbox from "../orchestration-v2/EffectOutbox.ts";
import * as DiscussionStore from "./DiscussionStore.ts";
import * as Discussions from "./DiscussionService.ts";

export const model = { instanceId: ProviderInstanceId.make("codex"), model: "t4-model" };
export const projectId = ProjectId.make("project:t4-discussion");
const driver = ProviderDriverKind.make("codex");

/** The fake owns only provider events; orchestration decides every durable run and checkpoint. */
export interface DiscussionHarness {
  readonly cwd: string;
  readonly starts: Queue.Queue<ProviderAdapter.ProviderAdapterV2TurnInput>;
  readonly started: ProviderAdapter.ProviderAdapterV2TurnInput[];
  readonly interrupted: ProviderAdapter.ProviderAdapterV2InterruptInput[];
  readonly launched: Launch.ThreadLaunchInput[];
  readonly captureStarted: Queue.Queue<void>;
  readonly holdCaptures: Effect.Effect<void>;
  readonly releaseCaptures: Effect.Effect<void>;
  readonly failCaptures: Effect.Effect<void>;
  readonly finish: (
    turn: ProviderAdapter.ProviderAdapterV2TurnInput,
    status: "completed" | "failed" | "interrupted",
    texts?: ReadonlyArray<string>,
    failure?: OrchestrationV2ProviderFailure,
  ) => Effect.Effect<void>;
}

/** Runs Git directly with argv and a bounded timeout; tests never concatenate paths into shell commands. */
export const git = (cwd: string, args: ReadonlyArray<string>) =>
  VcsProcess.VcsProcess.use((process) =>
    process.run({ operation: "t4.test.git", command: "git", args, cwd, timeoutMs: 10_000 }),
  );

/**
 * Builds one private temp tree, disk database and real runtime per test, and removes them on scope close.
 * @param test Body with the domain service and real persistence/orchestration available.
 * @param options.git Initialize a temp Git repo; false tests missing checkpoints in a non-Git directory.
 * @param options.startReactor False leaves a dispatch unprocessed for durable restart repair tests.
 * @returns Body result; platform and domain failures propagate rather than skipping the test.
 */
export function withDiscussionHarness<A, E, R>(
  test: (harness: DiscussionHarness) => Effect.Effect<A, E, R>,
  options: { readonly git?: boolean; readonly startReactor?: boolean } = {},
) {
  return Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "t4-discussion-" });
      const cwd = path.join(root, "workspace");
      yield* fs.makeDirectory(cwd);
      const config = Config.layerTest(cwd, path.join(root, "home"));
      const database = Sqlite.layerFromPath(path.join(root, "statev2.sqlite"));
      const vcs = VcsRegistry.layer.pipe(Layer.provide(VcsProcess.layer), Layer.provide(config));
      const rawCheckpointStore = CheckpointStore.layer.pipe(Layer.provide(vcs));
      const captureStarted = yield* Queue.unbounded<void>();
      const captureGate = yield* Deferred.make<void>();
      let holdCaptures = false;
      let failCaptures = false;
      const checkpointStore = Layer.effect(
        CheckpointStore.CheckpointStore,
        Effect.gen(function* () {
          const underlying = yield* CheckpointStore.CheckpointStore;
          return {
            ...underlying,
            captureCheckpoint: (input: CheckpointStore.CaptureCheckpointInput) =>
              Effect.gen(function* () {
                if (holdCaptures) {
                  yield* Queue.offer(captureStarted, undefined);
                  yield* Deferred.await(captureGate);
                }
                if (failCaptures) return yield* Effect.die("t4:exhausted-external-capture");
                yield* underlying.captureCheckpoint(input);
              }),
          };
        }),
      ).pipe(Layer.provide(rawCheckpointStore));
      const starts = yield* Queue.unbounded<ProviderAdapter.ProviderAdapterV2TurnInput>();
      const started: ProviderAdapter.ProviderAdapterV2TurnInput[] = [];
      const interrupted: ProviderAdapter.ProviderAdapterV2InterruptInput[] = [];
      const launched: Launch.ThreadLaunchInput[] = [];
      const queues = new Map<string, Queue.Queue<ProviderAdapter.ProviderAdapterV2Event>>();
      const timestamp = DateTime.makeUnsafe("2026-10-12T08:00:00.000Z");
      const terminalEvent = (
        turn: ProviderAdapter.ProviderAdapterV2TurnInput,
        status: "completed" | "failed" | "interrupted",
        failure: OrchestrationV2ProviderFailure | null,
      ): ProviderAdapter.ProviderAdapterV2Event => {
        const common = {
          type: "turn.terminal" as const,
          driver,
          providerThreadId: turn.providerThread.id,
          providerTurnId: ProviderTurnId.make(`turn:${turn.attemptId}`),
          runOrdinal: turn.runOrdinal,
          threadDisposition: "reusable" as const,
        };
        return status === "failed"
          ? { ...common, status, failureItemOrdinal: 1, failure: failure! }
          : { ...common, status, failure: null };
      };
      const harness: DiscussionHarness = {
        cwd,
        starts,
        started,
        interrupted,
        launched,
        captureStarted,
        holdCaptures: Effect.sync(() => {
          holdCaptures = true;
        }),
        releaseCaptures: Deferred.succeed(captureGate, undefined).pipe(Effect.asVoid),
        failCaptures: Effect.sync(() => {
          failCaptures = true;
        }),
        finish: (turn, status, texts = [], failure) =>
          Effect.gen(function* () {
            const queue = queues.get(turn.threadId)!;
            for (const [index, text] of texts.entries())
              yield* Queue.offer(queue, {
                type: "message.updated",
                driver,
                message: {
                  id: MessageId.make(`assistant:${turn.runId}:${index}`),
                  threadId: turn.threadId,
                  runId: turn.runId,
                  nodeId: turn.rootNodeId,
                  role: "assistant",
                  text,
                  attachments: [],
                  streaming: false,
                  createdBy: "agent",
                  creationSource: "provider",
                  createdAt: DateTime.add(timestamp, { milliseconds: index }),
                  updatedAt: timestamp,
                },
              });
            yield* Queue.offer(queue, terminalEvent(turn, status, failure ?? null));
          }),
      };
      const adapter: ProviderAdapter.ProviderAdapterV2["Service"] = {
        instanceId: model.instanceId,
        driver,
        getCapabilities: () => Effect.succeed(CodexProviderCapabilitiesV2),
        planSelectionTransition: () => Effect.succeed({ type: "apply_on_next_turn" }),
        openSession: (input) =>
          Effect.gen(function* () {
            const queue = yield* Queue.unbounded<ProviderAdapter.ProviderAdapterV2Event>();
            return {
              instanceId: model.instanceId,
              driver,
              providerSessionId: input.providerSessionId,
              providerSession: {
                id: input.providerSessionId,
                driver,
                providerInstanceId: model.instanceId,
                status: "ready",
                cwd,
                model: model.model,
                capabilities: CodexProviderCapabilitiesV2,
                createdAt: timestamp,
                updatedAt: timestamp,
                lastError: null,
              },
              events: Stream.fromQueue(queue),
              ensureThread: ({ threadId }) =>
                Effect.sync(() => {
                  queues.set(threadId, queue);
                  return {
                    id: ProviderThreadId.make(`provider:${threadId}`),
                    driver,
                    providerInstanceId: model.instanceId,
                    providerSessionId: input.providerSessionId,
                    appThreadId: threadId,
                    ownerNodeId: null,
                    nativeThreadRef: {
                      driver,
                      nativeId: `native:${threadId}`,
                      strength: "strong" as const,
                    },
                    nativeConversationHeadRef: null,
                    status: "idle" as const,
                    firstRunOrdinal: null,
                    lastRunOrdinal: null,
                    handoffIds: [],
                    forkedFrom: null,
                    createdAt: timestamp,
                    updatedAt: timestamp,
                  };
                }),
              resumeThread: ({ providerThread }) =>
                Effect.sync(() => {
                  if (providerThread.appThreadId !== null)
                    queues.set(providerThread.appThreadId, queue);
                  return providerThread;
                }),
              startTurn: (turn) =>
                Effect.gen(function* () {
                  started.push(turn);
                  yield* Queue.offer(queue, {
                    type: "provider_turn.updated",
                    driver,
                    providerTurn: {
                      id: ProviderTurnId.make(`turn:${turn.attemptId}`),
                      providerThreadId: turn.providerThread.id,
                      nodeId: turn.rootNodeId,
                      runAttemptId: turn.attemptId,
                      nativeTurnRef: null,
                      ordinal: turn.providerTurnOrdinal,
                      status: "running",
                      startedAt: timestamp,
                      completedAt: null,
                    },
                  });
                  yield* Queue.offer(starts, turn);
                }),
              interruptTurn: (input) =>
                Effect.gen(function* () {
                  interrupted.push(input);
                  const turn = started.findLast(
                    (turn) => turn.providerThread.id === input.providerThread.id,
                  )!;
                  yield* Queue.offer(queue, terminalEvent(turn, "interrupted", null));
                }),
              steerTurn: () => Effect.die("Discussion must not steer a provider turn"),
              respondToRuntimeRequest: () => Effect.die("unused runtime response"),
              readThreadSnapshot: () => Effect.die("unused native transcript"),
              rollbackThread: () => Effect.die("unused rollback"),
              forkThread: () => Effect.die("unused fork"),
            };
          }),
      };
      const unsupported = {
        ...adapter,
        instanceId: ProviderInstanceId.make("unsupported"),
        getCapabilities: () =>
          Effect.succeed({
            ...CodexProviderCapabilitiesV2,
            context: { ...CodexProviderCapabilitiesV2.context, acceptsDeveloperContext: false },
          }),
      };
      const instance = (
        adapter: ProviderAdapter.ProviderAdapterV2["Service"],
      ): ProviderInstance => ({
        instanceId: adapter.instanceId,
        driverKind: driver,
        continuationIdentity: { driverKind: driver, continuationKey: "t4-test" },
        displayName: "T4 test",
        enabled: true,
        orchestrationAdapter: adapter,
        snapshot: {
          getSnapshot: Effect.succeed({ supportedRuntimeModes: ["full-access", "default"] }),
        } as unknown as ProviderInstance["snapshot"],
        textGeneration: {} as ProviderInstance["textGeneration"],
      });
      const instances = [instance(adapter), instance(unsupported)];
      const registry = Layer.succeed(Instances.ProviderInstanceRegistry, {
        getInstance: (id) => Effect.succeed(instances.find((item) => item.instanceId === id)),
        listInstances: Effect.succeed(instances),
        listUnavailable: Effect.succeed([]),
        streamChanges: Stream.empty,
        subscribeChanges: Effect.never,
      });
      const runtime = Layer.mergeAll(Runtime.layer, Runtime.layerEventSink).pipe(
        Layer.provideMerge(Runtime.layerProjectService),
      );
      const launch = Layer.effect(
        Launch.ThreadLaunchService,
        Effect.gen(function* () {
          const threads = yield* Threads.ThreadManagementService;
          return Launch.ThreadLaunchService.of({
            launch: (input) =>
              Effect.gen(function* () {
                launched.push(input);
                const threadId = input.threadId!;
                yield* threads
                  .dispatch({
                    type: "thread.create",
                    commandId: input.commandId,
                    threadId,
                    projectId: input.projectId,
                    title: input.title,
                    discussion: input.discussion,
                    modelSelection: input.modelSelection,
                    runtimeMode: input.runtimeMode,
                    interactionMode: input.interactionMode,
                    worktreePath: null,
                    branch: null,
                    createdBy: input.createdBy,
                    creationSource: input.creationSource,
                  })
                  .pipe(Effect.orDie);
                return {
                  threadId,
                  projection: yield* threads.getThreadProjection(threadId).pipe(Effect.orDie),
                  resumed: false,
                };
              }),
            checkWorktreeBase: () => Effect.void,
            retryPreparation: () => Effect.die("unused preparation retry"),
          });
        }),
      );
      const dependencies = Layer.mergeAll(
        launch,
        DiscussionStore.layer,
        Projection.layer,
        CaptureRecovery.layer,
        Outbox.layer,
      ).pipe(Layer.provideMerge(runtime));
      const layer = Discussions.layer.pipe(
        Layer.provideMerge(dependencies),
        Layer.provideMerge(Adapters.layerFromProviderInstanceRegistry),
        Layer.provideMerge(database),
        Layer.provideMerge(config),
        Layer.provideMerge(checkpointStore),
        Layer.provideMerge(Settings.layerTest()),
        Layer.provideMerge(registry),
        Layer.provide(McpSessionTestkit.layer),
        Layer.provide(McpProviderSessions.layer),
        Layer.provide(Layer.mock(TextGeneration.TextGeneration)({})),
        Layer.provide(
          Layer.mock(GitWorkflow.GitWorkflowService)({ pruneWorktrees: () => Effect.void }),
        ),
        Layer.provide(
          Layer.mock(SourceControl.SourceControlProviderRegistry)({
            resolveLink: () => Effect.die("unused source control link"),
          }),
        ),
        Layer.provide(
          Layer.succeed(Enrichment.ProjectEnrichmentService, {
            peek: () =>
              Effect.succeed({
                repositoryIdentity: null,
                faviconPath: null,
                repositoryIdentityResolved: false,
              }),
            request: () => Effect.void,
            getAvailable: () =>
              Effect.succeed({
                repositoryIdentity: null,
                faviconPath: null,
                repositoryIdentityResolved: false,
              }),
            invalidate: () => Effect.void,
            subscribeChanges: Effect.never,
          }),
        ),
        Layer.provide(
          Layer.mock(WorkspacePaths.WorkspacePaths)({
            normalizeWorkspaceRoot: (root) => Effect.succeed(root),
          }),
        ),
      );
      return yield* Effect.gen(function* () {
        if (options.git !== false) {
          yield* git(cwd, ["init"]).pipe(Effect.provide(VcsProcess.layer));
          yield* fs.writeFileString(path.join(cwd, "README.md"), "# T4 test\n");
          yield* git(cwd, ["add", "README.md"]).pipe(Effect.provide(VcsProcess.layer));
          yield* git(cwd, [
            "-c",
            "user.name=T4 test",
            "-c",
            "user.email=t4@example.invalid",
            "commit",
            "-m",
            "initial",
          ]).pipe(Effect.provide(VcsProcess.layer));
        }
        const projects = yield* Projects.ProjectService;
        yield* projects.create({
          commandId: CommandId.make("t4:create-project"),
          projectId,
          title: "T4 项目",
          workspaceRoot: cwd,
        });
        const service = yield* Discussions.DiscussionService;
        if (options.startReactor !== false) yield* service.start();
        return yield* test(harness);
      }).pipe(Effect.provide(layer));
    }),
  ).pipe(Effect.provide(NodeServices.layer));
}

/** Waits for one persisted run status; log replay closes the read/subscribe race without polling. */
export const awaitRun = (threadId: ThreadId, runId: RunId, status: OrchestrationV2Run["status"]) =>
  Effect.gen(function* () {
    const sink = yield* EventSink.EventSinkV2;
    const projection = yield* Projection.ProjectionStoreV2;
    const afterSequence = yield* sink.latestSequence({ threadId });
    const current = yield* projection.getThreadRecords(threadId, ["runs"]);
    if (current.runs.some((run) => run.id === runId && run.status === status)) return;
    yield* sink.stream({ threadId, afterSequence, eventType: "run.updated", bounded: false }).pipe(
      Stream.filter(
        ({ event }) =>
          event.type === "run.updated" &&
          event.payload.id === runId &&
          event.payload.status === status,
      ),
      Stream.take(1),
      Stream.runDrain,
    );
  });

/** The running run precedes provider acceptance; capture tests await the native turn's durable record too. */
export const awaitProviderTurn = (turn: ProviderAdapter.ProviderAdapterV2TurnInput) =>
  Effect.gen(function* () {
    const sink = yield* EventSink.EventSinkV2;
    const projection = yield* Projection.ProjectionStoreV2;
    const afterSequence = yield* sink.latestSequence({ threadId: turn.threadId });
    if (
      (yield* projection.getThreadRecords(turn.threadId, ["providerTurns"])).providerTurns.some(
        (item) => item.runAttemptId === turn.attemptId,
      )
    )
      return;
    yield* sink
      .stream({
        threadId: turn.threadId,
        afterSequence,
        eventType: "provider-turn.updated",
        bounded: false,
      })
      .pipe(
        Stream.filter(
          ({ event }) =>
            event.type === "provider-turn.updated" && event.payload.runAttemptId === turn.attemptId,
        ),
        Stream.take(1),
        Stream.runDrain,
      );
  });

/** Waits for a lifecycle milestone using snapshot plus increments from the real discussion subscription. */
export const awaitDiscussion = (
  discussion: Discussion,
  predicate: (snapshot: Discussion) => boolean,
) =>
  Discussions.DiscussionService.use((service) =>
    service.subscribe({ discussionId: discussion.id }).pipe(
      Stream.filter(
        (event) =>
          (event.type === "snapshot" || event.type === "discussion.updated") &&
          predicate(event.discussion),
      ),
      Stream.take(1),
      Stream.runDrain,
    ),
  );

/** Completes through the provider boundary, then drains actual checkpoint effects after the persisted waiting milestone. */
export const finish = (
  harness: DiscussionHarness,
  turn: ProviderAdapter.ProviderAdapterV2TurnInput,
  texts: ReadonlyArray<string> = ["完整发言"],
  status: "completed" | "failed" | "interrupted" = "completed",
  failure?: OrchestrationV2ProviderFailure,
) =>
  Effect.gen(function* () {
    yield* harness.finish(turn, status, texts, failure);
    yield* awaitRun(turn.threadId, turn.runId, status === "completed" ? "waiting" : status);
    yield* Worker.OrchestrationEffectWorkerV2.use((worker) => worker.drain());
    if (status === "completed") yield* awaitRun(turn.threadId, turn.runId, "completed");
  });
