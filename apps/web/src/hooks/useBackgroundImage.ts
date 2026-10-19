/** One renderer-local selection shared by the background painter and appearance controls. */
import { useStore } from "zustand";
import { createBackgroundImageStore } from "../backgroundImage";

const bridge = typeof window === "undefined" ? undefined : window.desktopBridge;
const backgroundImageStore = createBackgroundImageStore(bridge);

/** Returns the shared image and serialized native actions; callers report rejected IPC operations. */
export function useBackgroundImage() {
  const state = useStore(backgroundImageStore);
  return {
    ...state,
    canPick: typeof bridge?.pickBackgroundImage === "function",
    canClear: typeof bridge?.clearBackgroundImage === "function",
  };
}
