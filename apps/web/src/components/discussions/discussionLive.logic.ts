/** Selects the current run and projects its visible output without subscribing or mutating entries. */
import type {
  Discussion,
  DiscussionEntry,
  OrchestrationV2ProjectedTurnItem,
  RunId,
} from "@t3tools/contracts";
import type { discussions } from "~/i18n/locales/en/discussions";
/** Stable dispatch fields place a live run at the same opening position as its persisted entry. */
export type DiscussionLiveAssignment = {
  runId: RunId;
  seatIndex: number;
  round: number;
  phase: "regular" | "final_round" | "summarizing";
  dispatchedEntrySeq: number;
};
/** Current output only; files aggregate provider change items, not checkpoint results. */
export type DiscussionLiveContent = {
  text: string;
  isStreaming: boolean;
  files: { path: string; additions: number; deletions: number }[];
  command: string | null;
};
/** Returns entries in opening order, retaining objects and never mutating the subscription array. */
export function orderDiscussionEntries(
  entries: readonly DiscussionEntry[],
): readonly DiscussionEntry[] {
  return entries.toSorted(
    (left, right) =>
      discussionOpeningSeq(left) - discussionOpeningSeq(right) ||
      Number(
        left.dispatchedEntrySeq !== undefined &&
          (left.kind === "statement" || left.kind === "summary"),
      ) -
        Number(
          right.dispatchedEntrySeq !== undefined &&
            (right.kind === "statement" || right.kind === "summary"),
        ) ||
      left.seq - right.seq,
  );
}
/** Returns a live assignment only while a run is active and has not yet entered the transcript. */
export function discussionLiveAssignment(
  discussion: Discussion,
  entries: readonly DiscussionEntry[],
): DiscussionLiveAssignment | null {
  if (
    (discussion.status !== "speaking" && discussion.status !== "closing") ||
    discussion.cursor.runId === null ||
    entries.some((entry) => entry.runId === discussion.cursor.runId)
  )
    return null;
  return {
    runId: discussion.cursor.runId,
    seatIndex: discussion.cursor.seatIndex,
    round: discussion.cursor.round,
    phase: discussion.cursor.phase ?? "regular",
    dispatchedEntrySeq: discussion.cursor.dispatchedEntrySeq,
  };
}
/** Projects only this run's assistant text, file totals and last running command in ordinal order. */
export function discussionLiveContent(
  items: readonly OrchestrationV2ProjectedTurnItem[],
  runId: RunId,
): DiscussionLiveContent {
  const current = items
    .map((projected) => projected.item)
    .filter((item) => item.runId === runId)
    .toSorted((left, right) => left.ordinal - right.ordinal);
  const messages = current.filter((item) => item.type === "assistant_message");
  const files = new Map<string, { path: string; additions: number; deletions: number }>();
  let command: string | null = null;
  for (const item of current) {
    if (item.type === "file_change") {
      const file = files.get(item.fileName) ?? { path: item.fileName, additions: 0, deletions: 0 };
      file.additions += item.additions ?? 0;
      file.deletions += item.deletions ?? 0;
      files.set(item.fileName, file);
    }
    if (item.type === "command_execution" && item.status === "running") command = item.input;
  }
  return {
    text: messages.map((message) => message.text).join("\n\n"),
    isStreaming: messages.some((message) => message.streaming),
    files: [...files.values()],
    command,
  };
}
/** Resolves the frozen dispatch stage; older live cursors fall back to their ordinary round. */
export function discussionLiveStage(
  phase: Discussion["cursor"]["phase"],
  round: number,
  copy: typeof discussions,
): { roundLabel: string | null; turnBadge: string | null } {
  return {
    roundLabel: phase === "final_round" || phase === "summarizing" ? null : copy.round(round),
    turnBadge:
      phase === "final_round"
        ? copy.page.final
        : phase === "summarizing"
          ? copy.page.summary
          : null,
  };
}

/** Returns the opening anchor of AI entries, or the own seq of legacy/non-AI records. */
export function discussionOpeningSeq(entry: DiscussionEntry): number {
  return entry.kind === "statement" || entry.kind === "summary"
    ? (entry.dispatchedEntrySeq ?? entry.seq)
    : entry.seq;
}
