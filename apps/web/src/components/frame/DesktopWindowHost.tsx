/** Keeps native window state and caption actions alive outside route error boundaries. */
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
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

/** Hosts routed children and persistent captions; native events remain authoritative. */
export function DesktopWindowHost({ children }: { children: ReactNode }) {
  const [maximized, setMaximized] = useState(() =>
    isElectron ? (window.desktopBridge?.getWindowMaximizedState?.() ?? false) : false,
  );
  const [fullscreen, setFullscreen] = useState(() =>
    isElectron ? (window.desktopBridge?.getWindowFullscreenState?.() ?? false) : false,
  );
  useEffect(() => {
    if (!isElectron) return;
    const bridge = window.desktopBridge;
    const unsubscribeMaximized = bridge?.onWindowMaximizedStateChange?.(setMaximized);
    const unsubscribeFullscreen = bridge?.onWindowFullscreenStateChange?.(setFullscreen);
    // Subscribe before reading to close the mount-time event gap.
    setMaximized(bridge?.getWindowMaximizedState?.() ?? false);
    setFullscreen(bridge?.getWindowFullscreenState?.() ?? false);
    return () => {
      unsubscribeMaximized?.();
      unsubscribeFullscreen?.();
    };
  }, []);
  const state = useMemo(() => ({ maximized, fullscreen }), [maximized, fullscreen]);
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
