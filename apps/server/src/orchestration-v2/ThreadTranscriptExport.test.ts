/** Exercises export IO with real isolated files and controlled timeline/settings services. */
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  OrchestrationV2AppThread,
  type OrchestrationV2ThreadProjection,
  OrchestrationV2TurnItemJson,
  ThreadId,
  type OrchestrationV2ProjectedTurnItem,
} from "@t3tools/contracts";
import { it, expect } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as Schema from "effect/Schema";
import * as ServerConfig from "../config.ts";
import * as ServerSettings from "../serverSettings.ts";
import * as ThreadManagement from "./ThreadManagementService.ts";
import * as ProjectionStore from "./ProjectionStore.ts";
import * as Orchestrator from "./Orchestrator.ts";
import * as Export from "./ThreadTranscriptExport.ts";

const mainId = ThreadId.make("123e4567-e89b-12d3-a456-426614174000");
const childId = ThreadId.make("child-export");
const time = DateTime.makeUnsafe("2026-01-02T03:04:05.000Z");
const decodeThread = Schema.decodeUnknownSync(OrchestrationV2AppThread);
const decodeItem = Schema.decodeUnknownSync(OrchestrationV2TurnItemJson);

/**
 * Builds valid metadata for id; deleted defaults to false and controls soft deletion only.
 * Returns schema-decoded metadata with fixed timestamps, throwing if the fixture is invalid.
 */
function thread(id: ThreadId, deleted = false) {
  return decodeThread({
    id,
    projectId: "project-export",
    title: `Title ${id}`,
    providerInstanceId: "codex",
    modelSelection: { instanceId: "codex", model: "export-model" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    activeProviderThreadId: null,
    lineage: { parentThreadId: null, relationshipToParent: null, rootThreadId: id },
    forkedFrom: null,
    createdAt: time,
    updatedAt: time,
    archivedAt: null,
    deletedAt: deleted ? time : null,
    createdBy: "user",
    creationSource: "web",
  });
}

/**
 * Builds a row owned by id at the nonnegative timeline position.
 * Omitted child creates reasoning; null creates a subagent without a thread; an ID links a child.
 * Returns a schema-decoded item and local provenance, throwing for invalid fixture fields.
 */
function row(
  id: ThreadId,
  position: number,
  child?: ThreadId | null,
): OrchestrationV2ProjectedTurnItem {
  const item = decodeItem({
    id: `item-${position}`,
    threadId: id,
    runId: null,
    nodeId: null,
    providerThreadId: null,
    providerTurnId: null,
    nativeItemRef: null,
    parentItemId: null,
    ordinal: position,
    status: "completed",
    title: null,
    startedAt: null,
    completedAt: null,
    updatedAt: "2026-01-02T03:04:05.000Z",
    ...(child === undefined
      ? { type: "reasoning", text: `Reasoning ${position}`, streaming: false }
      : {
          type: "subagent",
          subagentId: "subagent-export",
          origin: "app_owned",
          driver: "codex",
          providerInstanceId: "codex",
          childThreadId: child,
          prompt: "Child prompt",
          result: "Child result",
        }),
  });
  return { position, sourceThreadId: id, sourceItemId: item.id, visibility: "local", item };
}

/**
 * Supplies timelines in stored order and the deleted thread IDs, empty by default.
 * Returns a mock read-service Layer; unknown IDs fail lookup and activity calls enforce 200-row pages.
 * Export rendering and writes remain real, so the fixture cannot manufacture a successful export.
 */
function fixture(
  timelines: ReadonlyMap<ThreadId, ReadonlyArray<OrchestrationV2ProjectedTurnItem>>,
  deleted: ReadonlySet<ThreadId> = new Set(),
) {
  return Layer.mock(ThreadManagement.ThreadManagementService)({
    getThreadRecords: (id) => {
      if (timelines.has(id)) {
        const records: OrchestrationV2ThreadProjection = {
          thread: thread(id, deleted.has(id)),
          runs: [],
          attempts: [],
          nodes: [],
          subagents: [],
          providerSessions: [],
          providerThreads: [],
          providerTurns: [],
          runtimeRequests: [],
          messages: [],
          plans: [],
          turnItems: [],
          checkpointScopes: [],
          checkpoints: [],
          contextHandoffs: [],
          contextTransfers: [],
          visibleTurnItems: [],
          updatedAt: time,
        };
        return Effect.succeed(records);
      }
      return Effect.fail(
        new Orchestrator.OrchestratorProjectionError({
          threadId: id,
          cause: new ProjectionStore.ProjectionStoreThreadNotFoundError({ threadId: id }),
        }),
      );
    },
    getTimelinePage: (id, options) =>
      Effect.sync(() => {
        expect(options.limit).toBe(200);
        expect(options.view).toBe("activity");
        const all = timelines.get(id) ?? [];
        const remaining = all.filter((item) => item.position > (options.afterPosition ?? -1));
        return {
          items: remaining.slice(0, options.limit),
          totalItems: all.length,
          hasMore: remaining.length > options.limit,
        };
      }),
  });
}

/**
 * Runs effect with real platform services and the supplied timelines in a scoped workspace directory.
 * directory defaults to the server export default; deleted defaults to an empty set.
 * Returns the effect result or original failure; scope closure removes only this test's isolated state.
 */
function withExport<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  timelines: ReadonlyMap<ThreadId, ReadonlyArray<OrchestrationV2ProjectedTurnItem>>,
  directory = "",
  deleted: ReadonlySet<ThreadId> = new Set(),
) {
  const configLayer = Layer.unwrap(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const home = yield* fs.makeTempDirectoryScoped({
        directory: process.cwd(),
        prefix: ".t3-export-test-",
      });
      return ServerConfig.layerTest(process.cwd(), home);
    }),
  );
  const dependencies = Layer.mergeAll(
    fixture(timelines, deleted),
    ServerSettings.layerTest({ threadExportDirectory: directory }),
    configLayer,
  ).pipe(Layer.provideMerge(NodeServices.layer));
  const services = Export.layer.pipe(Layer.provideMerge(dependencies));
  return effect.pipe(Effect.provide(services), Effect.scoped);
}

it.effect(
  "pages all activity, creates the default directory and atomically overwrites one file",
  () => {
    const timelines = new Map([
      [mainId, Array.from({ length: 201 }, (_, index) => row(mainId, index))],
    ]);
    return withExport(
      Effect.gen(function* () {
        const service = yield* Export.ThreadTranscriptExport;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const config = yield* ServerConfig.ServerConfig;
        const first = yield* service.exportTranscript(mainId);
        expect(first.path).toBe(path.join(config.stateDir, "exports", `${mainId}.md`));
        expect(first.itemCount).toBe(201);
        const text = yield* fs.readFileString(first.path);
        expect(text).toContain(`# Title ${mainId}\n`);
        expect(text).toContain(`Thread ID: ${mainId}`);
        expect(text).toMatch(/Exported at: \d{4}-\d{2}-\d{2}T/);
        expect(text).toContain("## 201 · reasoning");
        expect(first.bytes).toBe(new TextEncoder().encode(text).byteLength);
        yield* fs.writeFileString(first.path, "obsolete contents");
        const results = yield* Effect.all(
          [service.exportTranscript(mainId), service.exportTranscript(mainId)],
          { concurrency: "unbounded" },
        );
        expect(results.map((result) => result.path)).toEqual([first.path, first.path]);
        expect(yield* fs.readFileString(first.path)).toBe(text);
        expect(yield* fs.readDirectory(path.dirname(first.path))).toEqual([`${mainId}.md`]);
      }),
      timelines,
    );
  },
);

it.effect("uses a changed setting and recursively creates the configured directory", () =>
  withExport(
    Effect.gen(function* () {
      const config = yield* ServerConfig.ServerConfig;
      const settings = yield* ServerSettings.ServerSettingsService;
      const path = yield* Path.Path;
      const directory = path.join(config.stateDir, "custom", "nested");
      yield* settings.updateSettings({ threadExportDirectory: directory });
      const service = yield* Export.ThreadTranscriptExport;
      expect((yield* service.exportTranscript(mainId)).path).toBe(
        path.join(directory, `${mainId}.md`),
      );
    }),
    new Map([[mainId, []]]),
  ),
);

it.effect("rejects relative paths with a reason", () =>
  withExport(
    Effect.gen(function* () {
      const service = yield* Export.ThreadTranscriptExport;
      const error = yield* Effect.flip(service.exportTranscript(mainId));
      expect(error.message).toContain("absolute path");
    }),
    new Map([[mainId, []]]),
    "relative/exports",
  ),
);

it.effect("reports an unwritable directory and removes its temporary file", () =>
  withExport(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const config = yield* ServerConfig.ServerConfig;
      const path = yield* Path.Path;
      const failingFs = {
        ...fs,
        writeFileString: () =>
          Effect.fail(
            PlatformError.systemError({
              _tag: "PermissionDenied",
              module: "FileSystem",
              method: "writeFileString",
            }),
          ),
      };
      const error = yield* Effect.flip(
        Effect.gen(function* () {
          const failingService = yield* Export.ThreadTranscriptExport;
          return yield* failingService.exportTranscript(mainId);
        }).pipe(
          Effect.provide(Layer.fresh(Export.layer)),
          Effect.provideService(FileSystem.FileSystem, failingFs),
        ),
      );
      expect(error.message).toContain("PermissionDenied");
      expect(yield* fs.readDirectory(path.join(config.stateDir, "exports"))).toEqual([]);
    }),
    new Map([[mainId, []]]),
  ),
);

it.effect("fails when the main thread is absent", () =>
  withExport(
    Effect.gen(function* () {
      const service = yield* Export.ThreadTranscriptExport;
      expect((yield* Effect.flip(service.exportTranscript(mainId))).message).toContain("not found");
    }),
    new Map(),
  ),
);

it.effect("recurses through children and terminates cycles", () =>
  withExport(
    Effect.gen(function* () {
      const service = yield* Export.ThreadTranscriptExport;
      const fs = yield* FileSystem.FileSystem;
      const result = yield* service.exportTranscript(mainId);
      const text = yield* fs.readFileString(result.path);
      expect(result.itemCount).toBe(3);
      expect(text.match(/# 子线程 child-export/g)).toHaveLength(1);
      expect(text).toContain("Reasoning 1");
      expect(text.indexOf("# 子线程 child-export")).toBeGreaterThan(
        text.indexOf("## 1 · subagent"),
      );
    }),
    new Map([
      [mainId, [row(mainId, 0, childId)]],
      [childId, [row(childId, 0, mainId), row(childId, 1)]],
    ]),
  ),
);

it.effect("records a missing child and continues", () =>
  withExport(
    Effect.gen(function* () {
      const service = yield* Export.ThreadTranscriptExport;
      const fs = yield* FileSystem.FileSystem;
      expect(yield* fs.readFileString((yield* service.exportTranscript(mainId)).path)).toContain(
        "子线程 child-export 不可用（not found）",
      );
    }),
    new Map([[mainId, [row(mainId, 0, childId)]]]),
  ),
);

it.effect("records a soft-deleted child without exporting its contents", () =>
  withExport(
    Effect.gen(function* () {
      const service = yield* Export.ThreadTranscriptExport;
      const fs = yield* FileSystem.FileSystem;
      const text = yield* fs.readFileString((yield* service.exportTranscript(mainId)).path);
      expect(text).toContain("子线程 child-export 不可用（deleted）");
      expect(text).not.toContain("Reasoning 9");
    }),
    new Map([
      [mainId, [row(mainId, 0, childId)]],
      [childId, [row(childId, 9)]],
    ]),
    "",
    new Set([childId]),
  ),
);

it.effect("records an agent with no child thread", () =>
  withExport(
    Effect.gen(function* () {
      const service = yield* Export.ThreadTranscriptExport;
      const fs = yield* FileSystem.FileSystem;
      expect(yield* fs.readFileString((yield* service.exportTranscript(mainId)).path)).toContain(
        "无子线程记录",
      );
    }),
    new Map([[mainId, [row(mainId, 0, null)]]]),
  ),
);

it.effect("does not recurse into inherited subagents", () =>
  withExport(
    Effect.gen(function* () {
      const service = yield* Export.ThreadTranscriptExport;
      const fs = yield* FileSystem.FileSystem;
      const result = yield* service.exportTranscript(mainId);
      const text = yield* fs.readFileString(result.path);
      expect(result.itemCount).toBe(1);
      expect(text).toContain("· from=ancestor-export");
      expect(text).not.toContain("# 子线程");
    }),
    new Map([
      [mainId, [row(ThreadId.make("ancestor-export"), 0, childId)]],
      [childId, [row(childId, 9)]],
    ]),
  ),
);
