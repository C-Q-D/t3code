/** Persists one workspace-card placement across threads; null keeps the default layout. */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "./lib/storage";

/** Canvas-relative CSS pixel offsets, anchored to one horizontal edge. */
export type ThreadDetailsCardPlacement = {
  side: "left" | "right";
  inset: number;
  top: number;
};

/** Global placement and the user actions that persist or clear it. */
interface ThreadDetailsCardPlacementState {
  placement: ThreadDetailsCardPlacement | null;
  /** Saves a released drag position in CSS pixels for all threads. */
  place: (placement: ThreadDetailsCardPlacement) => void;
  /** Restores the default layout and persists that choice. */
  reset: () => void;
}

/**
 * Treats local storage as untrusted so stale or malformed values cannot break layout.
 * @param value - Unknown placement read from persisted state.
 * @returns Only valid edge offsets, or null to restore the default layout.
 */
function parsePlacement(value: unknown): ThreadDetailsCardPlacement | null {
  if (
    typeof value !== "object" ||
    value === null ||
    !("side" in value) ||
    (value.side !== "left" && value.side !== "right") ||
    !("inset" in value) ||
    typeof value.inset !== "number" ||
    !Number.isFinite(value.inset) ||
    !("top" in value) ||
    typeof value.top !== "number" ||
    !Number.isFinite(value.top)
  ) {
    return null;
  }
  return { side: value.side, inset: value.inset, top: value.top };
}

export const useThreadDetailsCardPlacementStore = create<ThreadDetailsCardPlacementState>()(
  persist(
    (set) => ({
      placement: null,
      place: (placement) => set({ placement }),
      reset: () => set({ placement: null }),
    }),
    {
      name: "t3code:thread-details-card-placement:v1",
      version: 1,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({ placement: state.placement }),
      merge: (persisted, current) => ({
        ...current,
        placement: parsePlacement(
          typeof persisted === "object" && persisted !== null && "placement" in persisted
            ? persisted.placement
            : undefined,
        ),
      }),
    },
  ),
);
