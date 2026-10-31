/** Computes card geometry without storing placement or changing canvas obstacles. */
import type { ThreadDetailsCardPlacement } from "../../threadDetailsCardPlacementStore";
import type { PreviewMiniPlayerFrame } from "../preview/previewMiniPlayerLayout";
import { DETAILS_CARD_CLEARANCE } from "./chatCanvasLayout";

export const THREAD_DETAILS_CARD_GAP = 12;
// Keep in sync with --thread-details-panel-width.
const THREAD_DETAILS_CARD_WIDTH = 280;

/**
 * Resolves an edge anchor without letting window resizing push the card off canvas.
 * @param placement - Saved edge and offsets in CSS pixels; default placement is handled by the caller.
 * @param container - Canvas dimensions in CSS pixels.
 * @param card - Measured card dimensions in CSS pixels.
 * @returns Canvas-relative left/top, clamped to a 12px gap; undersized axes use 12px.
 */
export function resolveThreadDetailsCardPosition(
  placement: ThreadDetailsCardPlacement,
  container: { width: number; height: number },
  card: { width: number; height: number },
) {
  const gap = THREAD_DETAILS_CARD_GAP;
  const left =
    placement.side === "left" ? placement.inset : container.width - card.width - placement.inset;
  return {
    left: Math.max(gap, Math.min(left, container.width - card.width - gap)),
    top: Math.max(gap, Math.min(placement.top, container.height - card.height - gap)),
  };
}

/**
 * Keeps released cards near their chosen edge when the canvas width changes.
 * @param position - Released canvas-relative left/top in CSS pixels; top is preserved.
 * @param cardWidth - Measured card width in CSS pixels.
 * @param containerWidth - Canvas width in CSS pixels.
 * @returns Edge-relative placement; a center exactly at the canvas midpoint anchors right.
 */
export function createThreadDetailsCardPlacement(
  position: { left: number; top: number },
  cardWidth: number,
  containerWidth: number,
): ThreadDetailsCardPlacement {
  const side = position.left + cardWidth / 2 < containerWidth / 2 ? "left" : "right";
  return {
    side,
    inset: side === "left" ? position.left : containerWidth - position.left - cardWidth,
    top: position.top,
  };
}

export function resolveThreadDetailsCardDensity(
  height: number,
  content: { full: number; compact: number },
) {
  if (content.full === 0 || content.full <= height) return "full";
  if (content.compact === 0 || content.compact <= height) return "compact";
  return "essential";
}

export function resolveThreadDetailsCardLayout({
  container,
  lane,
  frame,
  overlapsDetailsCard = false,
  topInset = 0,
}: {
  container: { width: number; height: number };
  lane: { padding: number; minChatWidth: number };
  frame: PreviewMiniPlayerFrame | null;
  overlapsDetailsCard?: boolean;
  topInset?: number;
}) {
  const gap = THREAD_DETAILS_CARD_GAP;
  const width = THREAD_DETAILS_CARD_WIDTH;
  const x = container.width - width - gap;
  if (x - DETAILS_CARD_CLEARANCE - lane.padding < lane.minChatWidth) return null;
  const y = gap + topInset;
  const height =
    overlapsDetailsCard && frame && frame.x + frame.width > x - gap && frame.x < x + width + gap
      ? Math.min(container.height - y - gap, frame.y - y - gap)
      : container.height - y - gap;
  if (height < 160) return null;
  return {
    x,
    right: gap,
    width,
    y,
    height,
  } as const;
}

/**
 * A5 keeps the full card inside the canvas, with room for an open find bar.
 * @param container - Available canvas width and height in CSS pixels.
 * @param topInset - Pixels reserved above the card; defaults to zero.
 * @returns Card width capped at 280px, nonnegative scroll height, and the 14px edge gap.
 */
export function resolveThreadDetailsPopoverLayout(
  container: { width: number; height: number },
  topInset = 0,
) {
  const gap = 14;
  return {
    width: Math.max(0, Math.min(THREAD_DETAILS_CARD_WIDTH, container.width - gap * 2)),
    height: Math.max(0, container.height - gap * 2 - topInset),
    gap,
  };
}
