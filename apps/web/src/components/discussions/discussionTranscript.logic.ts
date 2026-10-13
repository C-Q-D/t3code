/** Projects persisted discussion entries into record order, heading fields and file summaries. */
import type { Discussion, DiscussionEntry, DiscussionSeat } from "@t3tools/contracts";
import type { discussions } from "~/i18n/locales/en/discussions";
import { discussionSeatStrip } from "./discussionPage.logic";

/** Round separators preserve the original entry references for memoized rendering. */
export type DiscussionTranscriptItem =
  | { kind: "round"; round: number }
  | { kind: "entry"; entry: DiscussionEntry }
  | { kind: "closing"; id: DiscussionEntry["id"]; label: string }
  | { kind: "footer"; label: string }
  | { kind: "next"; seatIndex: number; label: string | null; round: number | null };
/** Primitive heading fields remain stable when unrelated entries or the cursor change. */
export type DiscussionStatementHeading = {
  personaName: string;
  modelLabel: string;
  roundLabel: string | null;
  turnBadge: string | null;
  avatarState: "idle" | "done";
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
 * @param discussion Current closing plan and shared next-seat assignment.
 * @param copy Localized boundaries and placeholder text.
 * @returns Ordered records, closing boundaries and a final next-seat or ended footer item.
 */
export function discussionTranscriptItems(
  entries: readonly DiscussionEntry[],
  discussion: Discussion,
  copy: typeof discussions,
): DiscussionTranscriptItem[] {
  const items: DiscussionTranscriptItem[] = [{ kind: "round", round: 1 }];
  let previousStatementRound: number | undefined;
  let closingStarted = false;
  for (const entry of entries) {
    if (entry.kind === "system") {
      if (entry.text === "讨论到此") {
        closingStarted = true;
        const summarizer = discussion.seats.find(
          (seat) => seat.id === discussion.closing?.summarizerSeatId,
        );
        items.push({
          kind: "closing",
          id: entry.id,
          label: summarizer
            ? copy.page.closingBoundary(summarizer.personaName)
            : copy.page.closingBoundaryPlain,
        });
      }
      continue;
    }
    if (
      entry.kind === "statement" &&
      entry.round !== undefined &&
      !closingStarted &&
      !entry.finalStatement
    ) {
      // User interruptions belong to the round in which they arrived, above the next AI boundary.
      if (previousStatementRound !== undefined && entry.round > previousStatementRound)
        items.push({ kind: "round", round: entry.round });
      previousStatementRound = entry.round;
    }
    items.push({ kind: "entry", entry });
  }
  if (discussion.status === "ended") {
    items.push({ kind: "footer", label: copy.page.endedFooter });
    return items;
  }
  const strip = discussionSeatStrip(discussion);
  const nextPosition = strip.findIndex(
    (item) => item.kind === "seat" && item.tags.includes("next"),
  );
  const next = strip[nextPosition];
  if (next?.kind === "seat") {
    let round: number | null = null;
    const preceding = strip[nextPosition - 1];
    if (
      !discussion.closing &&
      !closingStarted &&
      preceding?.kind === "segment" &&
      preceding.label === "round" &&
      preceding.round !== undefined &&
      preceding.round > discussion.cursor.round
    ) {
      round = preceding.round;
      if (previousStatementRound !== round) items.push({ kind: "round", round });
    }
    let userCount = 0;
    const unread = entries.filter(
      (entry) => entry.kind === "user" && ++userCount > 1 && !entry.readBySeatId,
    ).length;
    items.push({
      kind: "next",
      seatIndex: next.index,
      round,
      label:
        unread === 0
          ? null
          : discussion.status === "paused"
            ? copy.page.nextUnreadPaused(unread)
            : copy.page.nextUnread(unread),
    });
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
    roundLabel:
      entry.kind === "summary" || entry.finalStatement || entry.round === undefined
        ? null
        : copy.round(entry.round),
    turnBadge:
      entry.kind === "summary" ? copy.page.summary : entry.finalStatement ? copy.page.final : null,
    avatarState: entry.kind === "summary" ? "done" : "idle",
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

/** User receipt fields are primitives so cursor changes leave unrelated AI rows memoized. */
export type DiscussionUserView = {
  label: string | null;
  seatIndex: number | null;
  avatarState: "idle" | "next";
  read: boolean;
};

/**
 * Resolves a topic or interjection receipt against the shared seat strip.
 * @param entry User record being presented.
 * @param isTopic Whether this is the first user record.
 * @param discussion Current cursor, status and frozen seats.
 * @param copy Localized receipt text.
 * @returns Bubble/connector state and receipt avatar assignment.
 */
export function discussionUserView(
  entry: DiscussionEntry,
  isTopic: boolean,
  discussion: Discussion,
  copy: typeof discussions,
): DiscussionUserView {
  if (isTopic) return { label: null, seatIndex: null, avatarState: "idle", read: true };
  if (entry.readBySeatId) {
    const seatIndex = discussion.seats.findIndex((seat) => seat.id === entry.readBySeatId);
    return {
      label:
        seatIndex < 0
          ? copy.page.interjection
          : copy.page.interjectionRead(discussion.seats[seatIndex]!.personaName),
      seatIndex: seatIndex < 0 ? null : seatIndex,
      avatarState: "idle",
      read: true,
    };
  }
  const next =
    discussion.status === "ended"
      ? undefined
      : discussionSeatStrip(discussion).find(
          (item) => item.kind === "seat" && item.tags.includes("next"),
        );
  const seatIndex = next?.kind === "seat" ? next.index : null;
  return {
    label:
      seatIndex === null
        ? copy.page.interjection
        : discussion.status === "paused"
          ? copy.page.interjectionPaused(discussion.seats[seatIndex]!.personaName)
          : copy.page.interjectionUnread(discussion.seats[seatIndex]!.personaName),
    seatIndex,
    avatarState: seatIndex === null ? "idle" : "next",
    read: false,
  };
}

/**
 * Applies the summary card's statistics visibility rule.
 * @param entry Statement or summary record with persisted statistics.
 * @param copy Localized file count and availability labels.
 * @returns Statistics presentation, or null when a summary has no file changes.
 */
export function discussionEntryFiles(
  entry: DiscussionEntry,
  copy: typeof discussions,
): DiscussionFilesSummary | null {
  if (entry.kind === "summary" && !entry.files?.length) return null;
  return discussionFilesSummary(entry.files, copy);
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
