/** Keeps native window state and caption actions alive outside route error boundaries. */
import {
  createContext,
  useContext,
  useLayoutEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { isElectron } from "../../env";
import { isWindowsPlatform } from "../../lib/utils";
import { WindowsWindowControls } from "./WindowsWindowControls";

const WindowStateContext = createContext({ maximized: false, fullscreen: false });

/** Reads the single renderer-wide subscription; layout consumers never own native listeners. */
export function useDesktopWindowState() {
  return useContext(WindowStateContext);
}

let maximizedSnapshot: boolean | undefined;
let fullscreenSnapshot: boolean | undefined;
const windowStateListeners = new Set<() => void>();
let unsubscribeNativeWindowState: (() => void) | undefined;

/** Reads the cached maximized flag, using synchronous IPC only for its first snapshot. */
function readMaximized() {
  return (maximizedSnapshot ??= isElectron
    ? (window.desktopBridge?.getWindowMaximizedState?.() ?? false)
    : false);
}

/** Reads the cached fullscreen flag, using synchronous IPC only for its first snapshot. */
function readFullscreen() {
  return (fullscreenSnapshot ??= isElectron
    ? (window.desktopBridge?.getWindowFullscreenState?.() ?? false)
    : false);
}

/** Supplies the non-native snapshot for server rendering. */
function readServerState() {
  return false;
}

/** Publishes the native event's maximized value before notifying snapshot readers. */
function publishMaximized(value: boolean) {
  if (maximizedSnapshot === value) return;
  maximizedSnapshot = value;
  windowStateListeners.forEach((listener) => listener());
}

/** Publishes the native event's fullscreen value before notifying snapshot readers. */
function publishFullscreen(value: boolean) {
  if (fullscreenSnapshot === value) return;
  fullscreenSnapshot = value;
  windowStateListeners.forEach((listener) => listener());
}

/**
 * Notifies onChange after a native event or the post-subscription read changes either cached flag.
 * The first subscriber attaches both native listeners, then reads once to close the mount gap.
 * Returns a cancellation that releases native listeners and cached snapshots after the last reader leaves.
 */
function subscribeWindowState(onChange: () => void) {
  windowStateListeners.add(onChange);
  if (windowStateListeners.size === 1) {
    const bridge = isElectron ? window.desktopBridge : undefined;
    const stopMaximized = bridge?.onWindowMaximizedStateChange?.(publishMaximized);
    const stopFullscreen = bridge?.onWindowFullscreenStateChange?.(publishFullscreen);
    unsubscribeNativeWindowState = () => {
      stopMaximized?.();
      stopFullscreen?.();
    };
    publishMaximized(bridge?.getWindowMaximizedState?.() ?? false);
    publishFullscreen(bridge?.getWindowFullscreenState?.() ?? false);
  }
  return () => {
    windowStateListeners.delete(onChange);
    if (windowStateListeners.size !== 0) return;
    unsubscribeNativeWindowState?.();
    unsubscribeNativeWindowState = undefined;
    maximizedSnapshot = undefined;
    fullscreenSnapshot = undefined;
  };
}

/** Hosts routed children and persistent captions; native events remain authoritative. */
export function DesktopWindowHost({ children }: { children: ReactNode }) {
  const maximized = useSyncExternalStore(subscribeWindowState, readMaximized, readServerState);
  const fullscreen = useSyncExternalStore(subscribeWindowState, readFullscreen, readServerState);
  const state = { maximized, fullscreen };
  useLayoutEffect(() => {
    if (!isElectron || !isWindowsPlatform(navigator.platform)) return;
    // Body portals must inherit the same frame geometry before the next paint.
    const html = document.documentElement;
    html.dataset.windowMaximized = String(maximized);
    html.dataset.windowFullscreen = String(fullscreen);
    return () => {
      delete html.dataset.windowMaximized;
      delete html.dataset.windowFullscreen;
    };
  }, [maximized, fullscreen]);
  return (
    <WindowStateContext value={state}>
      {children}
      {isElectron && isWindowsPlatform(navigator.platform) && (
        <WindowsWindowControls maximized={maximized} />
      )}
    </WindowStateContext>
  );
}
