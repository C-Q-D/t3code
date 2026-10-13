/** Selects discussion diff presentation without transport or viewer effects. */
import type { DiscussionEntry, DiscussionEntryDiffResult } from "@t3tools/contracts";
import {
  resolveFileDiffPath,
  resolveFileDiffPreviousPath,
  getRenderablePatch,
} from "~/lib/diffRendering";
import type { discussions } from "~/i18n/locales/en/discussions";

/** Identifies a persisted statement and the file to reveal within its whole patch. */
export type DiscussionDiffSelection = { entryId: DiscussionEntry["id"]; filePath: string };

/**
 * Keys the mounted query by its entire destination, isolating previous query successes.
 * @param environmentId Environment owning the discussion.
 * @param discussionId Discussion containing the persisted entry.
 * @param entryId Statement whose whole patch is requested.
 * @returns Unambiguous mount identity; file clicks within an entry keep the query mounted.
 */
export function discussionDiffKey(
  environmentId: string,
  discussionId: string,
  entryId: string,
): string {
  return JSON.stringify([environmentId, discussionId, entryId]);
}

/**
 * Requires a persisted entry and available file statistics; live rows pass no entry ID.
 * @param entryId Persisted record identity, null for a live block.
 * @param files Checkpoint file statistics, null while unavailable.
 * @returns Whether whole-row diff activation is available.
 */
export function discussionFilesCanOpen(
  entryId: string | null,
  files: DiscussionEntry["files"],
): boolean {
  return entryId !== null && Boolean(files?.length);
}

/**
 * Builds a compact title from frozen persona identity and persisted turn attribution.
 * @param entry Recorded kind, round and final-statement attribution.
 * @param persona Frozen seat name or the existing deleted-persona fallback.
 * @param copy Current discussion dictionary; its existing turn labels are reused.
 * @returns Persona with a localized turn suffix, or persona alone without a round.
 */
export function discussionDiffTitle(
  entry: Pick<DiscussionEntry, "kind" | "round" | "finalStatement">,
  persona: string,
  copy: typeof discussions,
): string {
  const suffix =
    entry.kind === "summary"
      ? copy.page.summary
      : entry.finalStatement
        ? copy.page.final
        : entry.round === undefined
          ? null
          : copy.round(entry.round);
  return suffix ? `${persona} · ${suffix}` : persona;
}

/**
 * Separates loading, failed requests, empty patches and raw/structured patch outcomes.
 * @param discussionId Expected discussion identity, used to reject stale query data.
 * @param entryId Expected persisted statement identity.
 * @param query Query success/failure view; a failure can retain an earlier successful value.
 * @param parsed Patch parsed once by the caller and memoized by its text.
 * @param filePath Current or previous filename to reveal; missing paths retain all files.
 * @param copy Current discussion dictionary for loading/error/empty/missing copy.
 * @returns Exclusive content state; a failed request never becomes an empty patch.
 */
export function discussionDiffContent(
  discussionId: string,
  entryId: string,
  query: { data: DiscussionEntryDiffResult | null; isSuccess: boolean; error: string | null },
  parsed: ReturnType<typeof getRenderablePatch>,
  filePath: string,
  copy: typeof discussions,
) {
  // Failures may retain previousSuccess; they must never masquerade as empty or fresh content.
  if (query.error !== null)
    return {
      kind: "error" as const,
      label: copy.diff.failed(query.error.trim().replace(/[。.]+$/, "")),
    };
  if (
    !query.isSuccess ||
    query.data?.discussionId !== discussionId ||
    query.data.entryId !== entryId
  )
    return { kind: "loading" as const, label: copy.diff.loading };
  if (!parsed) return { kind: "empty" as const, label: copy.diff.empty };
  if (parsed.kind === "raw") return parsed;
  const selectedIndex = parsed.files.findIndex(
    (file) =>
      resolveFileDiffPath(file) === filePath || resolveFileDiffPreviousPath(file) === filePath,
  );
  return {
    kind: "files" as const,
    files: parsed.files,
    selectedIndex,
    notice: selectedIndex < 0 ? copy.diff.missing(filePath) : null,
  };
}
