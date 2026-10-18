/** Shared right-panel placement and temporary sidebar lifecycle; contains no UI or storage. */
import { FRAME_NARROW_MAX_WIDTH, FRAME_NARROW_MEDIA_QUERY } from "./frameBreakpoints";

export const RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY = FRAME_NARROW_MEDIA_QUERY;
export const DISCUSSION_PANEL_OVERLAY_MEDIA_QUERY = FRAME_NARROW_MEDIA_QUERY;
// DC1's table breakpoint is independent of the H2 panel breakpoint.
export const DISCUSSION_WIDE_LAYOUT_MEDIA_QUERY = "(min-width: 1200px)";

/** Selects H2 through 1024 CSS pixels; H1 begins above that width. */
export function shouldUseDiscussionPanelSheet(viewportWidth: number): boolean {
  return viewportWidth <= FRAME_NARROW_MAX_WIDTH;
}

export type ThreadPanelPresentation = "inline" | "popover";

/** Selects the overlay through the inclusive narrow-window width, in CSS pixels. */
export function shouldUseRightPanelSheet(viewportWidth: number): boolean {
  return viewportWidth <= FRAME_NARROW_MAX_WIDTH;
}

/**
 * Captures once on the first wide opening and restores only when the panel closes.
 * Manual sidebar changes, thread/tab changes, and narrowing keep the original snapshot.
 * An overlay that has never been wide does not change sidebar visibility.
 */
export function resolveRightPanelSidebarAction(input: {
  snapshotActive: boolean;
  panelOpen: boolean;
  sheet: boolean;
}): "capture-and-collapse" | "restore" | "none" {
  if (input.snapshotActive) return input.panelOpen ? "none" : "restore";
  return input.panelOpen && !input.sheet ? "capture-and-collapse" : "none";
}
