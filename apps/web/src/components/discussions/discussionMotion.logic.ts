/** Resolves speaking appearance from the existing strip/live plan. */
import type { Discussion } from "@t3tools/contracts";
import type { DiscussionStripItem } from "./discussionPage.logic";
import type { DiscussionLiveAssignment } from "./discussionLive.logic";
/**
 * Uses the strip's current occurrence rather than attributing motion by seat identity.
 * @param item A seat occurrence, including duplicated final/summary occurrences.
 * @param status Paused and ended snapshots cannot animate.
 * @returns Avatar state and whether this occurrence owns a wave.
 */
export function discussionSeatMotion(
  item: Extract<DiscussionStripItem, { kind: "seat" }>,
  status: Discussion["status"],
): { avatarState: "idle" | "speaking" | "next" | "done"; wave: boolean } {
  const wave = item.state === "current" && (status === "speaking" || status === "closing");
  return {
    avatarState: item.state === "current" ? (wave ? "speaking" : "idle") : item.state,
    wave,
  };
}
/**
 * Uses the transcript's existing live assignment to decide heading motion.
 * @param assignment Current unrecorded dispatch, or null when no live block exists.
 * @returns Whether the live heading shows a wave.
 */
export function discussionLiveWave(assignment: DiscussionLiveAssignment | null): boolean {
  return assignment !== null;
}
