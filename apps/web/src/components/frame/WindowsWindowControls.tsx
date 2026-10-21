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
    let fullscreenApp: HTMLElement | null = null;
    // A removed MCP frame does not deliver its closing toggle to document.
    // Observe only while fullscreen, and inspect the tracked frame rather than
    // querying the streaming conversation for every mutation.
    const observer = new MutationObserver(() => {
      if (
        fullscreenApp &&
        (!fullscreenApp.isConnected || !fullscreenApp.hasAttribute("data-mcp-app-fullscreen"))
      ) {
        restorePageLayer();
      }
    });
    /** Releases the top layer so Electron can collect the titlebar's drag region again. */
    const restorePageLayer = () => {
      observer.disconnect();
      fullscreenApp = null;
      if (controls.matches(":popover-open")) controls.hidePopover();
      controls.removeAttribute("popover");
    };
    /** Raises captions above the one fullscreen MCP frame without remounting its buttons. */
    const raiseAboveApp = (app: HTMLElement) => {
      fullscreenApp = app;
      controls.setAttribute("popover", "manual");
      if (controls.matches(":popover-open")) controls.hidePopover();
      controls.showPopover();
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["data-mcp-app-fullscreen"],
      });
    };
    const onToggle = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || target === controls) return;
      if (target.hasAttribute("data-mcp-app-fullscreen") && target.matches(":popover-open")) {
        raiseAboveApp(target);
      } else if (target === fullscreenApp) {
        restorePageLayer();
      }
    };
    document.addEventListener("toggle", onToggle, true);
    const existingApp = document.querySelector<HTMLElement>(
      "[data-mcp-app-fullscreen]:popover-open",
    );
    if (existingApp) raiseAboveApp(existingApp);
    return () => {
      document.removeEventListener("toggle", onToggle, true);
      restorePageLayer();
    };
  }, []);
  /** Serializes a user's caption actions until the native request settles. */
  const run = async (action: DesktopWindowAction) => {
    setPending(true);
    return await (async () => {
      await runWindowAction(action);
    })().finally(() => {
      setPending(false);
    });
  };
  // Native captions remain usable over modal dialogs. A body portal keeps their
  // replacement outside the shell's isolation and dialog scroll-lock padding.
  return createPortal(
    <div ref={controlsRef} className="windows-window-controls no-drag">
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
