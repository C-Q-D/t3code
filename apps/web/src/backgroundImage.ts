/** Shares the local desktop background selection; browsers always use the bundled image. */
import { createStore } from "zustand/vanilla";
import defaultBackgroundUrl from "./assets/dusk-ridges.svg";

/** Optional C1 bridge methods, kept local until the desktop contract is integrated. */
export interface BackgroundImageBridge {
  getBackgroundImage?: () => Promise<string | null>;
  pickBackgroundImage?: () => Promise<string | null>;
  clearBackgroundImage?: () => Promise<void>;
}

export { defaultBackgroundUrl };

/**
 * Creates the shared selection state for a desktop bridge, or the browser fallback when absent.
 * IPC failures propagate to the caller; failed writes retain the last displayed image.
 * Native dialogs have no timeout or retry: the user controls when they close.
 */
export function createBackgroundImageStore(bridge?: BackgroundImageBridge) {
  let initialLoad: Promise<void> | undefined;
  return createStore<{
    url: string;
    isCustom: boolean;
    busy: boolean;
    load: () => Promise<void>;
    pick: () => Promise<void>;
    clear: () => Promise<void>;
  }>((set, get) => ({
    url: defaultBackgroundUrl,
    isCustom: false,
    busy: false,
    load: () => {
      // Share startup work across root remounts; writes wait so a stale read cannot replace them.
      initialLoad ??= (async () => {
        set({ busy: true });
        try {
          const url = await bridge?.getBackgroundImage?.();
          set({ url: url ?? defaultBackgroundUrl, isCustom: url != null });
        } finally {
          set({ busy: false });
        }
      })();
      return initialLoad;
    },
    pick: async () => {
      await get().load();
      if (!bridge?.pickBackgroundImage || get().busy) return;
      set({ busy: true });
      try {
        const url = await bridge.pickBackgroundImage();
        if (url !== null) set({ url, isCustom: true });
      } finally {
        set({ busy: false });
      }
    },
    clear: async () => {
      await get().load();
      if (!bridge?.clearBackgroundImage || get().busy) return;
      set({ busy: true });
      try {
        await bridge.clearBackgroundImage();
        set({ url: defaultBackgroundUrl, isCustom: false });
      } finally {
        set({ busy: false });
      }
    },
  }));
}
