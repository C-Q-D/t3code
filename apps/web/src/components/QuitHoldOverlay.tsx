/** Presents desktop quit-shortcut hints without changing the shortcut protocol or timing. */
import { t } from "~/i18n";
import { useSyncExternalStore } from "react";

import { isMacPlatform } from "../lib/utils";

const HOLD_HINT_LINGER_MS = 1200;

type QuitHintMode = "hold" | "double-click";

let visibleMode: QuitHintMode | null = null;
let pressedMode: QuitHintMode = "hold";
let hideTimer: number | undefined;
const listeners = new Set<() => void>();
let stopBridge: (() => void) | null = null;

/** Notifies React only when the native quit hint changes. */
function setVisibleMode(next: QuitHintMode | null) {
  if (next === visibleMode) return;
  visibleMode = next;
  for (const listener of listeners) listener();
}

/** Shares one bridge listener and releases its timer when the last overlay unmounts. */
function subscribeQuitHint(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    stopBridge =
      window.desktopBridge?.onQuitShortcut((hint) => {
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
      }) ?? null;
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    window.clearTimeout(hideTimer);
    stopBridge?.();
    stopBridge = null;
    visibleMode = null;
  };
}

/** Provides a stable snapshot reader for the external quit-hint store. */
const readQuitHint = () => visibleMode;

/** Shows the native quit gesture hint without intercepting pointer input. */
export function QuitHoldOverlay() {
  const visibleMode = useSyncExternalStore(subscribeQuitHint, readQuitHint, readQuitHint);

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
