/** Windows caption buttons; native IPC owns window state and normal close handling. */
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DesktopWindowAction } from "@t3tools/contracts";
import { t } from "~/i18n";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { toastManager } from "../ui/toast";

/** Sends one caption action without retries; IPC failures remain visible to the user. */
export async function runWindowAction(action: DesktopWindowAction): Promise<void> {
  try {
    const bridge = window.desktopBridge;
    if (!bridge) throw new Error("Desktop bridge unavailable");
    await bridge.controlWindow(action);
  } catch {
    toastManager.add({ type: "error", title: t.common.windowControls.failed });
  }
}

/** Renders native-sized hit targets; maximized is the native state, never optimistic state. */
export function WindowsWindowControls({ maximized }: { maximized: boolean }) {
  const [pending, setPending] = useState(false);
  const controlsRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const controls = controlsRef.current;
    if (!controls?.showPopover) return;
    // A page z-index cannot outrank MCP's top-layer popover. Keep the same
    // caption host in that layer and raise it after an app enters the layer.
    const onToggle = (event: Event) => {
      if (
        event.target instanceof HTMLElement &&
        event.target.matches("[data-mcp-app-fullscreen]") &&
        "newState" in event &&
        event.newState === "open"
      ) {
        controls.hidePopover();
        controls.showPopover();
      }
    };
    controls.showPopover();
    document.addEventListener("toggle", onToggle, true);
    return () => {
      document.removeEventListener("toggle", onToggle, true);
      if (controls.matches(":popover-open")) controls.hidePopover();
    };
  }, []);
  /** Serializes a user's caption actions until the native request settles. */
  const run = async (action: DesktopWindowAction) => {
    setPending(true);
    try {
      await runWindowAction(action);
    } finally {
      setPending(false);
    }
  };
  // Native captions remain usable over modal dialogs. A body portal keeps their
  // replacement outside the shell's isolation and dialog scroll-lock padding.
  return createPortal(
    <div ref={controlsRef} popover="manual" className="windows-window-controls no-drag">
      <Tooltip>
        <TooltipTrigger
          render={<button type="button" />}
          disabled={pending}
          aria-label={t.common.windowControls.minimize}
          onClick={() => void run("minimize")}
        >
          <svg aria-hidden="true" viewBox="0 0 12 12">
            <path d="M1 6h10" />
          </svg>
        </TooltipTrigger>
        <TooltipPopup>{t.common.windowControls.minimize}</TooltipPopup>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={<button type="button" />}
          disabled={pending}
          aria-label={
            maximized ? t.common.windowControls.restore : t.common.windowControls.maximize
          }
          onClick={() => void run("toggle-maximize")}
        >
          <svg aria-hidden="true" viewBox="0 0 12 12">
            {maximized ? (
              <path d="M3.5 3.5v-2h7v7h-2m-7-5h7v7h-7z" />
            ) : (
              <rect x="1.5" y="1.5" width="9" height="9" />
            )}
          </svg>
        </TooltipTrigger>
        <TooltipPopup>
          {maximized ? t.common.windowControls.restore : t.common.windowControls.maximize}
        </TooltipPopup>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={<button type="button" />}
          disabled={pending}
          data-window-close=""
          aria-label={t.common.windowControls.close}
          onClick={() => void run("close")}
        >
          <svg aria-hidden="true" viewBox="0 0 12 12">
            <path d="m1.5 1.5 9 9m0-9-9 9" />
          </svg>
        </TooltipTrigger>
        <TooltipPopup>{t.common.windowControls.close}</TooltipPopup>
      </Tooltip>
    </div>,
    document.body,
  );
}
