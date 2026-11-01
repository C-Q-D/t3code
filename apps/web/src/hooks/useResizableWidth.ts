/** Persists bounded panel widths while painting transient pointer and spring positions locally. */
import * as Schema from "effect/Schema";
import { type PointerEvent as ReactPointerEvent, useLayoutEffect, useRef, useState } from "react";

import { getLocalStorageItem, setLocalStorageItem } from "./useLocalStorage";
import { createResizePhysics, useResizeDrag } from "./useResizeDrag";

const WidthSchema = Schema.Finite;

/** The host must size itself from this custom property. */
export const RESIZABLE_WIDTH_PROPERTY = "--resizable-width";

/** Width persistence, bounds in CSS pixels, handle orientation and optional host collapse action. */
export interface UseResizableWidthOptions {
  readonly storageKey: string;
  readonly defaultWidth: number;
  readonly minWidth: number;
  readonly maxWidth: number;
  readonly edge: "left" | "right";
  /** Collapse without replacing the last committed width. */
  readonly onCollapse?: (() => void) | undefined;
}

/** Pointer lifecycle handlers installed on the panel resize edge. */
export interface ResizableWidthHandlers {
  readonly ref: (node: HTMLElement | null) => (() => void) | undefined;
  readonly onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onLostPointerCapture: (event: ReactPointerEvent<HTMLElement>) => void;
}

/**
 * Width state for a side-anchored panel resized via a drag handle on the
 * specified edge. Width is read on mount or storage-key changes and persisted on
 * drag-end (not on every rAF tick — would otherwise be ~60 writes/sec).
 *
 * During a drag the hook writes `RESIZABLE_WIDTH_PROPERTY` on the handle's
 * parent, so the panel follows the cursor in the same frame without
 * re-rendering the owner. `width` state and localStorage commit once when the
 * bounded gesture ends (after any physical rebound); abandoned physical gestures do not persist.
 */
export function useResizableWidth(options: UseResizableWidthOptions): {
  readonly width: number;
  readonly setWidth: (width: number) => void;
  readonly handlers: ResizableWidthHandlers;
} {
  const { storageKey, defaultWidth, minWidth, maxWidth, edge } = options;

  const clamp = (value: number): number => {
    if (!Number.isFinite(value)) return defaultWidth;
    return Math.max(minWidth, Math.min(maxWidth, value));
  };

  const readWidth = () => {
    if (typeof window === "undefined") return defaultWidth;
    try {
      const stored = getLocalStorageItem(storageKey, WidthSchema);
      return clamp(stored ?? defaultWidth);
    } catch (error) {
      console.error("Could not read persisted panel width.", error);
      return defaultWidth;
    }
  };
  const [widthState, setWidthState] = useState(() => ({ storageKey, width: readWidth() }));
  if (widthState.storageKey !== storageKey) {
    setWidthState({ storageKey, width: readWidth() });
  }

  const clampedWidth = clamp(widthState.width);
  const latestOptions = useRef({ clamp, storageKey, width: clampedWidth, minWidth, maxWidth });
  useLayoutEffect(() => {
    latestOptions.current = { clamp, storageKey, width: clampedWidth, minWidth, maxWidth };
  }, [clamp, clampedWidth, storageKey, minWidth, maxWidth]);

  const commitWidth = (nextStorageKey: string, nextWidth: number) => {
    // Resizing remains usable for this session when browser storage is unavailable.
    setWidthState({ storageKey: nextStorageKey, width: nextWidth });
    try {
      setLocalStorageItem(nextStorageKey, nextWidth, WidthSchema);
    } catch (error) {
      console.error("Could not persist panel width.", error);
    }
  };

  const drag = useResizeDrag<HTMLElement>((event) => {
    const host = event.currentTarget.parentElement;
    // Disable drag transitions through transition-property; the host renders transition-duration.
    host?.style.setProperty("transition-property", "none");
    // The drag commits to the key and width it started from, even if the panel
    // switches keys before the pointer is released.
    const startStorageKey = storageKey;
    const startWidth = clampedWidth;
    return {
      width: startWidth,
      edge,
      bounds: createResizePhysics(
        () => latestOptions.current.minWidth,
        () => latestOptions.current.maxWidth,
      ),
      physics: createResizePhysics(
        () => latestOptions.current.minWidth,
        () => latestOptions.current.maxWidth,
        options.onCollapse,
      ),
      paint(value) {
        host?.style.setProperty(RESIZABLE_WIDTH_PROPERTY, `${value}px`);
      },
      resize(value) {
        const nextWidth = latestOptions.current.clamp(value);
        host?.style.setProperty(RESIZABLE_WIDTH_PROPERTY, `${nextWidth}px`);
        return nextWidth;
      },
      finish(finalWidth) {
        commitWidth(startStorageKey, finalWidth);
      },
      cleanup(committed) {
        host?.style.removeProperty("transition-property");
        if (!committed)
          host?.style.setProperty(RESIZABLE_WIDTH_PROPERTY, `${latestOptions.current.width}px`);
      },
    };
  }, storageKey);

  // Bounds can change mid-drag (sidebar opens, window narrows), and the render
  // that carries them rewrites the committed width, so re-apply the live pointer position.
  const { refresh } = drag;
  useLayoutEffect(() => refresh({ min: minWidth, max: maxWidth }), [refresh, minWidth, maxWidth]);

  return {
    width: clampedWidth,
    setWidth: (value) => commitWidth(storageKey, clamp(value)),
    handlers: {
      ref: drag.ref,
      onPointerDown: drag.onPointerDown,
      onPointerMove: drag.onPointerMove,
      onPointerUp: drag.onPointerUp,
      onPointerCancel: drag.onPointerCancel,
      onLostPointerCapture: drag.onLostPointerCapture,
    },
  };
}
