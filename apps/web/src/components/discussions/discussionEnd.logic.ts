/** Derives end-dialog choices and lifecycle gates without executing provider commands. */
import type { Discussion, DiscussionPrompt, DiscussionEndInput } from "@t3tools/contracts";
import type { discussions } from "~/i18n/locales/en/discussions";
export const DEFAULT_SUMMARY_PROMPT = "builtin:summary:default";
/** Returns ordered seats and the first default; an empty discussion has no summarizer. */
export function discussionSummarizers(discussion: Discussion) {
  return { options: discussion.seats, selected: discussion.seats[0]?.id ?? null };
}
/** Resolves stored summary choices, including loading/error and deleted-selection fallbacks. */
export function discussionSummaryChoices(
  prompts: readonly DiscussionPrompt[] | null,
  failed: boolean,
  selected: string,
  copy: typeof discussions,
) {
  const options = (prompts ?? [])
    .filter((p) => p.kind === "summary")
    .map((p) => ({ id: p.id, label: copy.page.summaryOption(p.name, p.description) }));
  const available = !failed && prompts !== null;
  const resolved =
    options.find((p) => p.id === selected) ?? options.find((p) => p.id === DEFAULT_SUMMARY_PROMPT);
  return {
    options,
    selected: available ? (resolved?.id ?? null) : null,
    disabled: !available,
    message: failed ? copy.page.summaryFailed : prompts === null ? copy.page.summaryLoading : null,
  };
}
/** Returns the speaking-seat notice; paused discussions do not wait for a current statement. */
export function discussionEndNotice(
  discussion: Discussion,
  copy: typeof discussions,
): string | null {
  const seat = discussion.seats[discussion.cursor.seatIndex];
  return discussion.status === "speaking" && seat ? copy.page.endNotice(seat.personaName) : null;
}
/** Builds the validated end input, or null while unavailable, unauthorized or already submitted. */
export function discussionEndInput(
  discussion: Discussion,
  seatId: string | null,
  promptId: DiscussionPrompt["id"] | null,
  pending: boolean,
  permitted: boolean,
): DiscussionEndInput | null {
  const seat = discussion.seats.find((s) => s.id === seatId);
  if (pending || !permitted || !seat || discussionEndShouldClose(discussion, false)) return null;
  return {
    discussionId: discussion.id,
    summarizerSeatId: seat.id,
    ...(promptId ? { summaryPromptId: promptId } : {}),
  };
}
/**
 * Closes an obsolete selection dialog unless this page is still awaiting its own end response.
 * Persisted closing also closes after dispatch failure: ending already took effect, so another end submission cannot help.
 */
export function discussionEndShouldClose(discussion: Discussion, ending: boolean): boolean {
  return (
    !ending &&
    (discussion.closing !== null ||
      (discussion.status !== "speaking" && discussion.status !== "paused"))
  );
}
