/** One renderer-local selection shared by the background painter and appearance controls. */
import { useStore } from "zustand";
import { createBackgroundImageStore, type BackgroundImageBridge } from "../backgroundImage";

// L1 adds these optional methods to DesktopBridge; this intersection is local to the web line.
const bridge =
  typeof window === "undefined"
    ? undefined
    : (window.desktopBridge as
        | (NonNullable<Window["desktopBridge"]> & BackgroundImageBridge)
        | undefined);
const backgroundImageStore = createBackgroundImageStore(bridge);

/** Returns the shared image and serialized native actions; callers report rejected IPC operations. */
export function useBackgroundImage() {
  return useStore(backgroundImageStore);
}
