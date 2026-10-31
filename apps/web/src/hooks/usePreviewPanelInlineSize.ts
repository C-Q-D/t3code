/** Keeps inline panel widths within their host while reserving usable sibling space. */
import { useState } from "react";

import { type ResizableWidthHandlers, useResizableWidth } from "./useResizableWidth";
import { observeResize } from "../lib/observeResize";

/** Current clamped width in CSS pixels and the panel's drag handlers. */
export interface PreviewPanelInlineSize {
  readonly width: number;
  readonly handlers: ResizableWidthHandlers;
  /** Ref-callback body for the panel host: measures the row the panel shares. */
  readonly observeRow: (host: HTMLElement) => () => void;
}

const PREVIEW_PANEL_WIDTH_STORAGE_KEY = "t3code:preview-panel-width";
const PREVIEW_PANEL_MIN_WIDTH = 360;
const PREVIEW_PANEL_MAX_WIDTH_FRACTION = 0.7;
/** Below this, the sibling chat column's composer overflows. */
const SIBLING_COLUMN_MIN_WIDTH = 360;
const PREVIEW_PANEL_DEFAULT_WIDTH = 540;

/**
 * Sizes an inline panel from its host ref or explicit container, with optional storage defaults.
 * Standalone slabs reserve the inherited CSS gap; other hosts reserve no extra space.
 * Returns a clamped pixel width and handlers that persist completed resizes.
 */
export function usePreviewPanelInlineSize(
  options: {
    readonly enabled?: boolean | undefined;
    /** Collapse using the host action while keeping its last saved width. */
    readonly onCollapse?: (() => void) | undefined;
    readonly widthStorageKey?: string | undefined;
    readonly defaultWidth?: number | undefined;
    readonly container?: HTMLElement | null | undefined;
    /** Reserve --frame-slab-gap for a separate slab; defaults to false. */
    readonly standalone?: boolean | undefined;
  } = {},
): PreviewPanelInlineSize {
  const enabled = options.enabled ?? true;
  const container = options.container;
  const [maxWidth, setMaxWidth] = useState(() =>
    getPreviewPanelMaxWidth(typeof window === "undefined" ? 1280 : window.innerWidth),
  );
  const { width, handlers } = useResizableWidth({
    storageKey: options.widthStorageKey ?? PREVIEW_PANEL_WIDTH_STORAGE_KEY,
    defaultWidth: options.defaultWidth ?? PREVIEW_PANEL_DEFAULT_WIDTH,
    minWidth: PREVIEW_PANEL_MIN_WIDTH,
    maxWidth,
    edge: "left",
    onCollapse: options.onCollapse,
  });
  const observeRow = (host: HTMLElement) => {
    const row = container ?? (enabled ? host.parentElement : null) ?? null;
    // Ref callbacks run before paint, so the width is clamped without an over-wide
    // flash on mount. Only the derived cap is stored: the row resizes every frame
    // of a sidebar drag, but an unchanged cap skips re-rendering the owner.
    const measure = () => {
      // Read the same inherited pixel token as the shell's margin, rather than
      // duplicating the theme's spacing value in the resize calculation.
      const gapSource = host;
      const gap =
        options.standalone && gapSource
          ? Number.parseFloat(getComputedStyle(gapSource).getPropertyValue("--frame-slab-gap")) || 0
          : 0;
      setMaxWidth(getPreviewPanelMaxWidth(window.innerWidth, row?.clientWidth, gap));
    };
    measure();
    let frame = 0;
    const onResize = () => {
      if (frame !== 0) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };
    window.addEventListener("resize", onResize);
    const stopObserving = row ? observeResize(row, measure) : undefined;
    return () => {
      window.removeEventListener("resize", onResize);
      if (frame !== 0) window.cancelAnimationFrame(frame);
      stopObserving?.();
    };
  };
  return { width, handlers, observeRow };
}
/**
 * Returns the panel cap in CSS pixels from viewport, optional row width, and sibling gap (default 0).
 * Preserves the panel's minimum when the row cannot accommodate both columns' minimums.
 */
export function getPreviewPanelMaxWidth(
  viewportWidth: number,
  containerWidth?: number,
  gap = 0,
): number {
  const fractionCap = Math.floor(viewportWidth * PREVIEW_PANEL_MAX_WIDTH_FRACTION);
  const containerCap =
    containerWidth === undefined
      ? Infinity
      : Math.floor(containerWidth - gap) - SIBLING_COLUMN_MIN_WIDTH;
  // Never below the panel's own minimum: when the row cannot fit both
  // columns' minimums the sibling yields, and useResizableWidth's clamp must
  // not see max < min (it would resolve the inversion to min and, via
  // drag-end persistence, overwrite the user's stored width).
  return Math.max(PREVIEW_PANEL_MIN_WIDTH, Math.min(fractionCap, containerCap));
}
