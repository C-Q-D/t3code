/** Keeps native window state and caption actions alive outside route error boundaries. */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
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
  return (
    <WindowStateContext value={{ maximized, fullscreen }}>
      {children}
      {isElectron && isWindowsPlatform(navigator.platform) && (
        <WindowsWindowControls maximized={maximized} fullscreen={fullscreen} />
      )}
    </WindowStateContext>
  );
}
