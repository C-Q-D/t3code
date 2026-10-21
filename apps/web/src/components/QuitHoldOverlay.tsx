/** Presents desktop quit-shortcut hints without changing the shortcut protocol or timing. */
import { t } from "~/i18n";
import { useEffect, useState } from "react";

import { isMacPlatform } from "../lib/utils";

const HOLD_HINT_LINGER_MS = 1200;

export function QuitHoldOverlay() {
  const [visibleMode, setVisibleMode] = useState<"hold" | "double-click" | null>(null);

  useEffect(() => {
    const subscribe = window.desktopBridge?.onQuitShortcut;
    if (!subscribe) return;
    let hideTimer: number | undefined;
    let pressedMode: "hold" | "double-click" = "hold";
    const unsubscribe = subscribe((hint) => {
      window.clearTimeout(hideTimer);
      if (hint.state === "down") {
        pressedMode = hint.mode;
        setVisibleMode(hint.mode);
        return;
      }
      if (pressedMode === "double-click") {
        setVisibleMode(null);
        return;
      }
      hideTimer = window.setTimeout(() => setVisibleMode(null), HOLD_HINT_LINGER_MS);
    });
    return () => {
      window.clearTimeout(hideTimer);
      unsubscribe();
    };
  }, []);

  if (!visibleMode) return null;
  const shortcut = isMacPlatform(navigator.platform) ? "⌘Q" : "Ctrl+Q";
  const message =
    visibleMode === "hold"
      ? t.app.quitHoldOverlay.holdOrPressTwice(shortcut)
      : t.app.quitHoldOverlay.pressAgain(shortcut);
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 top-[22%] z-100 flex justify-center"
    >
      <div className="flex h-9 items-center rounded-full bg-primary px-4 text-secondary-copy-large font-semibold text-primary-foreground text-shadow-none shadow-primary-toast">
        {message}
      </div>
    </div>
  );
}
