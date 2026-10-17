/** Resolves sidebar widths from the frame's CSS token values without reading the DOM. */
import {
  resolveInitialThreadSidebarWidth,
  resolveThreadSidebarMaximumWidth,
} from "../threadSidebarWidth";

/** Frame dimensions in CSS pixels; horizontalSpace excludes the sidebar and main area. */
export type FrameGeometry = { sidebarWidth: number; horizontalSpace: number };

/**
 * Converts measured frame tokens in CSS pixels into resize geometry.
 * @param tokens Default sidebar width, project rail width, and per-side padding/gap.
 * @returns The default sidebar width and the horizontal space reserved by two gutters.
 */
export function resolveFrameGeometry(tokens: {
  sidebarWidth: number;
  projectbarWidth: number;
  paddingInline: number;
  slabGap: number;
}): FrameGeometry {
  return {
    sidebarWidth: tokens.sidebarWidth,
    horizontalSpace: tokens.projectbarWidth + tokens.paddingInline * 2 + tokens.slabGap * 2,
  };
}

/**
 * Reserves the frame gutters and the existing main-content minimum before resizing.
 * @param viewportWidth Full shell width in CSS pixels.
 * @param minimumWidth Sidebar minimum in CSS pixels, including any titlebar constraint.
 * @param frame Geometry resolved from the CSS tokens.
 * @returns A maximum width that never falls below minimumWidth in a narrow window.
 */
export function resolveFrameSidebarMaximumWidth(
  viewportWidth: number,
  minimumWidth: number,
  frame: FrameGeometry,
): number {
  return resolveThreadSidebarMaximumWidth(viewportWidth - frame.horizontalSpace, minimumWidth);
}

/**
 * Restores a persisted drag width or the token default, retaining existing width clamps.
 * @param storedWidth Persisted CSS-pixel width; null means reset to the frame token.
 * @param viewportWidth Full shell width in CSS pixels.
 * @param frame Geometry resolved from the CSS tokens.
 * @returns The preferred width clamped by the existing sidebar and main-area minimums.
 */
export function resolveFrameInitialSidebarWidth(
  storedWidth: number | null,
  viewportWidth: number,
  frame: FrameGeometry,
): number {
  return resolveInitialThreadSidebarWidth(
    storedWidth ?? frame.sidebarWidth,
    viewportWidth - frame.horizontalSpace,
  );
}
