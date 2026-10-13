/** Projects persisted discussion entries into record order, heading fields and file summaries. */
import type { DiscussionEntry, DiscussionSeat } from "@t3tools/contracts";
import type { discussions } from "~/i18n/locales/en/discussions";

/** Round separators preserve the original entry references for memoized rendering. */
export type DiscussionTranscriptItem =
  | { kind: "round"; round: number }
  | { kind: "entry"; entry: DiscussionEntry };
/** Primitive heading fields remain stable when unrelated entries or the cursor change. */
export type DiscussionStatementHeading = {
  personaName: string;
  modelLabel: string;
  roundLabel: string | null;
  threadId: DiscussionEntry["threadId"] | null;
  statusLabel: string | null;
  badgeVariant: "warning" | "error" | null;
};
/** Missing statistics differ from a confirmed empty checkpoint. */
export type DiscussionFilesSummary =
  | { kind: "pending" | "empty"; label: string }
  | { kind: "files"; label: string; count: number; additions: number; deletions: number };

/**
 * Inserts round boundaries after any intervening user entries.
 * @param entries Subscription entries in ascending seq order; input objects are retained.
 * @returns Initial round one then user/statement entries and increasing AI round separators.
 */
export function discussionTranscriptItems(
  entries: readonly DiscussionEntry[],
): DiscussionTranscriptItem[] {
  const items: DiscussionTranscriptItem[] = [{ kind: "round", round: 1 }];
  let previousStatementRound: number | undefined;
  for (const entry of entries) {
    if (entry.kind !== "user" && entry.kind !== "statement") continue;
    if (entry.kind === "statement" && entry.round !== undefined) {
      // User interruptions belong to the round in which they arrived, above the next AI boundary.
      if (previousStatementRound !== undefined && entry.round > previousStatementRound)
        items.push({ kind: "round", round: entry.round });
      previousStatementRound = entry.round;
    }
    items.push({ kind: "entry", entry });
  }
  return items;
}

/**
 * Resolves persisted statement attribution independently of the discussion's current cursor.
 * @param entry Persisted statement, with optional round and entry-specific thread identity.
 * @param seat Matching frozen seat, undefined when its identity cannot be resolved.
 * @param modelLabel Shared catalog-aware model presentation for this seat.
 * @param copy Localized round, interruption and failure text.
 * @param missingPersonaName Existing deleted-persona text when no frozen seat matches.
 * @returns Primitive heading fields; a missing thread yields no process link.
 */
export function discussionStatementHeading(
  entry: DiscussionEntry,
  seat: DiscussionSeat | undefined,
  modelLabel: string,
  copy: typeof discussions,
  missingPersonaName: string,
): DiscussionStatementHeading {
  return {
    personaName: seat?.personaName ?? missingPersonaName,
    modelLabel,
    roundLabel: entry.round === undefined ? null : copy.round(entry.round),
    threadId: entry.threadId ?? seat?.threadId ?? null,
    statusLabel:
      entry.status === "interrupted"
        ? copy.page.interrupted
        : entry.status === "failed"
          ? copy.page.failed
          : null,
    badgeVariant:
      entry.status === "interrupted" ? "warning" : entry.status === "failed" ? "error" : null,
  };
}

/**
 * Distinguishes pending statistics from zero changes and totals real file counts.
 * @param files Persisted checkpoint statistics; null means not available yet.
 * @param copy Localized file-count and availability labels.
 * @returns Explicit state and, for nonempty statistics, count and additions/deletions totals.
 */
export function discussionFilesSummary(
  files: DiscussionEntry["files"],
  copy: typeof discussions,
): DiscussionFilesSummary {
  if (files === null) return { kind: "pending", label: copy.page.filesPending };
  if (files.length === 0) return { kind: "empty", label: copy.page.noFiles };
  return {
    kind: "files",
    label: copy.page.changedFiles(files.length),
    count: files.length,
    additions: files.reduce((sum, file) => sum + file.additions, 0),
    deletions: files.reduce((sum, file) => sum + file.deletions, 0),
  };
}
