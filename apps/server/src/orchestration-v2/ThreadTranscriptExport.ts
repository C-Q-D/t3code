/** Exports complete activity timelines to atomic Markdown files; owns IO and child traversal only. */
import { type ThreadId, type OrchestrationV2ProjectedTurnItem } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as Schema from "effect/Schema";
import * as ServerConfig from "../config.ts";
import * as ServerSettings from "../serverSettings.ts";
import { expandHomePath } from "../os-jank.ts";
import * as ThreadManagement from "./ThreadManagementService.ts";
import { renderTranscriptItems, transcriptFileName } from "./transcriptMarkdown.ts";

/** Export failure with a bounded reason and the original failure for diagnostics. */
export class ThreadTranscriptExportError extends Schema.TaggedError<ThreadTranscriptExportError>()(
  "ThreadTranscriptExportError",
  {
    threadId: Schema.String,
    stage: Schema.Literals(["settings", "directory", "timeline", "render", "write"]),
    reason: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  /** Human-readable summary naming the failed stage; the original cause stays on `cause`. */
  override get message() {
    return `Conversation export failed (${this.stage}): ${this.reason}`;
  }
}

/** Service that writes transcripts on the destination server, never on the requesting client. */
export class ThreadTranscriptExport extends Context.Service<
  ThreadTranscriptExport,
  {
    /**
     * Writes or replaces one complete transcript, including owned descendants after their parent timeline.
     * @param threadId Existing, non-deleted root thread. Its cleaned identifier determines the filename.
     * @returns Absolute server path, UTF-8 byte count and total rendered item count, including descendants.
     * Fails on root lookup, settings, directory, paging, encoding or IO errors; a child whose metadata cannot be
     * read or is deleted is recorded in the file and skipped.
     * Pages contain 200 activity rows with no total cap or retries. Each writer fills its own temporary file in a
     * private subdirectory of the export directory, then renames it onto the target; the last completed rename
     * wins. Cancelling the scope removes the temporary subdirectory.
     */
    readonly exportTranscript: (
      threadId: ThreadId,
    ) => Effect.Effect<
      { readonly path: string; readonly bytes: number; readonly itemCount: number },
      ThreadTranscriptExportError
    >;
  }
>()("t3/orchestration-v2/ThreadTranscriptExport") {}

/**
 * Normalizes read/OS failures without exposing arbitrary defect text.
 * @param cause Failure from settings, projection or filesystem operations; unknown values are allowed.
 * @returns A stable category, or not found for a missing thread, including through projection wrappers.
 */
function failureReason(cause: unknown): string {
  if (PlatformError.isPlatformError(cause)) return cause.reason._tag;
  if (cause !== null && typeof cause === "object" && "_tag" in cause) {
    if (cause._tag === "ProjectionStoreThreadNotFoundError") return "not found";
    if ("cause" in cause && cause.cause !== undefined) return failureReason(cause.cause);
    if (typeof cause._tag === "string") return cause._tag;
  }
  return "unexpected failure";
}

const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const config = yield* ServerConfig.ServerConfig;
  const settings = yield* ServerSettings.ServerSettingsService;
  const threads = yield* ThreadManagement.ThreadManagementService;

  const exportTranscript = Effect.fn("ThreadTranscriptExport.exportTranscript")(function* (
    threadId: ThreadId,
  ) {
    const current = yield* settings.getSettings.pipe(
      Effect.mapError(
        (cause) =>
          new ThreadTranscriptExportError({
            threadId,
            stage: "settings",
            reason: failureReason(cause),
            cause,
          }),
      ),
    );
    const configured = current.threadExportDirectory.trim();
    const directory =
      configured === ""
        ? path.join(config.stateDir, "exports")
        : yield* expandHomePath(configured).pipe(Effect.provideService(Path.Path, path));
    if (!path.isAbsolute(directory))
      return yield* new ThreadTranscriptExportError({
        threadId,
        stage: "directory",
        reason: "Export directory must be an absolute path.",
      });

    const visited = new Set<ThreadId>();
    const sections: Array<string> = [];
    let itemCount = 0;
    /**
     * Appends a timeline followed by its owned children, skipping already visited threads.
     * @param id Thread whose metadata and visible activity are read; inherited subagents are not followed.
     * @param isRoot Whether an unavailable thread fails export instead of appending an explanation.
     * @returns No value; appends sections and increments the combined item count in this export only.
     * Root metadata failures and any thread's paging or encoding failures abort the export; a descendant whose
     * metadata cannot be read or is deleted is recorded and traversal continues.
     */
    const visit = Effect.fnUntraced(function* (
      id: ThreadId,
      isRoot: boolean,
    ): Effect.fn.Return<void, ThreadTranscriptExportError> {
      if (visited.has(id)) return;
      visited.add(id);
      const records = yield* threads.getThreadRecords(id, []).pipe(Effect.result);
      if (records._tag === "Failure" || records.success.thread.deletedAt !== null) {
        const reason = records._tag === "Failure" ? failureReason(records.failure) : "deleted";
        if (isRoot)
          return yield* new ThreadTranscriptExportError({
            threadId: id,
            stage: "timeline",
            reason,
            ...(records._tag === "Failure" ? { cause: records.failure } : {}),
          });
        sections.push(`子线程 ${id} 不可用（${reason}）`);
        return;
      }
      const rows: Array<OrchestrationV2ProjectedTurnItem> = [];
      let afterPosition: number | undefined;
      while (true) {
        const page = yield* threads
          .getTimelinePage(id, {
            limit: 200,
            view: "activity",
            ...(afterPosition === undefined ? {} : { afterPosition }),
          })
          .pipe(
            Effect.mapError(
              (cause) =>
                new ThreadTranscriptExportError({
                  threadId: id,
                  stage: "timeline",
                  reason: failureReason(cause),
                  cause,
                }),
            ),
          );
        rows.push(...page.items);
        if (!page.hasMore) break;
        const nextPosition = page.items.at(-1)?.position;
        // Refuse a regressed cursor instead of repeatedly rebuilding the same timeline index.
        if (nextPosition === undefined || nextPosition <= (afterPosition ?? -1))
          return yield* new ThreadTranscriptExportError({
            threadId: id,
            stage: "timeline",
            reason: "Timeline page did not advance.",
          });
        afterPosition = nextPosition;
      }
      const markdown = yield* Effect.try({
        try: () => renderTranscriptItems(id, rows),
        catch: (cause) =>
          new ThreadTranscriptExportError({
            threadId: id,
            stage: "render",
            reason: "Timeline item could not be encoded.",
            cause,
          }),
      });
      if (isRoot) {
        const now = yield* DateTime.now;
        sections.push(
          `# ${records.success.thread.title}\n\nThread ID: ${id}\nExported at: ${DateTime.formatIso(now)}`,
        );
      } else sections.push(`# 子线程 ${id}`);
      sections.push(markdown);
      itemCount += rows.length;
      for (const row of rows) {
        if (row.sourceThreadId !== id || row.item.type !== "subagent") continue;
        if (row.item.childThreadId === null) sections.push("无子线程记录");
        else yield* visit(row.item.childThreadId, false);
      }
    });
    yield* visit(threadId, true);
    const contents = `${sections.join("\n\n")}\n`;
    const filePath = path.join(directory, transcriptFileName(threadId));
    yield* Effect.scoped(
      Effect.gen(function* () {
        yield* fs.makeDirectory(directory, { recursive: true });
        const temporaryPath = yield* fs.makeTempFileScoped({
          directory,
          prefix: `${path.basename(filePath)}.`,
          suffix: ".tmp",
        });
        yield* fs.writeFileString(temporaryPath, contents);
        yield* fs.rename(temporaryPath, filePath);
      }),
    ).pipe(
      Effect.mapError(
        (cause) =>
          new ThreadTranscriptExportError({
            threadId,
            stage: "write",
            reason: failureReason(cause),
            cause,
          }),
      ),
    );
    return { path: filePath, bytes: new TextEncoder().encode(contents).byteLength, itemCount };
  });
  return ThreadTranscriptExport.of({ exportTranscript });
});

/** Assembles export from server configuration, settings, timeline and platform services. */
export const layer = Layer.effect(ThreadTranscriptExport, make);
