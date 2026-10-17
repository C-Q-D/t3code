/** Keeps the draft-only template presentation separate from settings without changing the editor API. */
import type { DiscussionDraftSeat } from "./discussionSeats.logic";

/** An explicit seat snapshot identifies the creation flow, including an empty snapshot; saved templates win. */
export function isDiscussionDraftTemplate(
  templateId: string | undefined,
  initialSeats: readonly DiscussionDraftSeat[] | undefined,
): boolean {
  return templateId === undefined && initialSeats !== undefined;
}
