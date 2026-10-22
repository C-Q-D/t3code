/** Owns one personal page guest; routing and entry management stay outside its lifetime. */
import type { WebPageEntry } from "@t3tools/contracts";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useBrowserSurfaceStore } from "~/browser/browserSurfaceStore";
import { acquireDesktopTab, type AcquiredDesktopTab } from "~/browser/desktopTabLifetime";
import { resolveHostedBrowserWebviewWrapperStyle } from "~/browser/hostedBrowserWebviewStyle";
import { usePreviewWebviewConfig } from "~/browser/previewWebviewConfigState";
import {
  INITIAL_WEBVIEW_CRASH_RECOVERY_STATE,
  planWebviewCrashRecovery,
} from "~/browser/webviewCrashRecovery";
import { previewBridge } from "~/components/preview/previewBridge";
import { useClientSettingsHydrated } from "~/hooks/useSettings";
import { isMacPlatform } from "~/lib/utils";
import { WEB_PAGES_ENVIRONMENT_ID, WEB_PAGES_PROFILE_ID } from "./webPagePartition";
import { useWebPageRuntimeStore, webPageRuntimeTabId } from "./webPageRuntimeStore";
import { resolveWebPageStartUrl } from "./webPageSession";

/** Keeps the mount-time URL until pause/reopen; surface changes only reposition the guest. */
export function HostedWebPage({ entry }: { readonly entry: WebPageEntry }) {
  const hydrated = useClientSettingsHydrated();
  const config = usePreviewWebviewConfig(WEB_PAGES_ENVIRONMENT_ID, WEB_PAGES_PROFILE_ID);
  const runtimeTabId = webPageRuntimeTabId(entry.id);
  const [initialSrc] = useState(() => resolveWebPageStartUrl(entry));
  const [recoverySrc, setRecoverySrc] = useState(initialSrc);
  const [generation, setGeneration] = useState(0);
  const webviewRef = useRef<HTMLElementTagNameMap["webview"] | null>(null);
  const leaseRef = useRef<AcquiredDesktopTab | null>(null);
  const recoveryRef = useRef(INITIAL_WEBVIEW_CRASH_RECOVERY_STATE);
  const presentation = useBrowserSurfaceStore((state) => state.byTabId[runtimeTabId]);

  useEffect(() => {
    if (!hydrated) return;
    // Omitting serverTab keeps this personal guest out of the agent browser host.
    const lease = acquireDesktopTab(runtimeTabId);
    leaseRef.current = lease;
    return () => {
      leaseRef.current = null;
      lease.release();
    };
  }, [hydrated, runtimeTabId]);

  const remount = useEffectEvent(() => {
    setRecoverySrc(useWebPageRuntimeStore.getState().navById[entry.id]?.url ?? initialSrc);
    setGeneration((value) => value + 1);
  });

  useEffect(() => {
    const webview = webviewRef.current;
    const bridge = previewBridge;
    if (!hydrated || !config || !webview || !bridge) return;
    let disposed = false;
    let recoveryTimer: ReturnType<typeof setTimeout> | null = null;
    const register = () => {
      const lease = leaseRef.current;
      if (!lease) return;
      void (async () => {
        try {
          // Attachment may precede asynchronous tab creation in the main process.
          await lease.ready;
          if (disposed || webviewRef.current !== webview) return;
          const webContentsId = webview.getWebContentsId();
          if (Number.isInteger(webContentsId) && webContentsId > 0) {
            await bridge.registerWebview(runtimeTabId, webContentsId);
          }
        } catch (error) {
          if (!disposed) console.warn("Failed to register personal page webview", error);
        }
      })();
    };
    const recover = () => {
      if (disposed || recoveryTimer !== null) return;
      const plan = planWebviewCrashRecovery(recoveryRef.current, Date.now());
      if (!plan) return;
      recoveryRef.current = plan.state;
      recoveryTimer = setTimeout(() => {
        recoveryTimer = null;
        if (!disposed) remount();
      }, plan.delayMs);
    };
    // Guest clicks do not bubble into the host document to dismiss its menus.
    const dismissHostPopups = () => {
      webview.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" }),
      );
    };
    webview.addEventListener("did-attach", register);
    webview.addEventListener("dom-ready", register);
    webview.addEventListener("render-process-gone", recover);
    webview.addEventListener("focus", dismissHostPopups);
    return () => {
      disposed = true;
      if (recoveryTimer !== null) clearTimeout(recoveryTimer);
      webview.removeEventListener("did-attach", register);
      webview.removeEventListener("dom-ready", register);
      webview.removeEventListener("render-process-gone", recover);
      webview.removeEventListener("focus", dismissHostPopups);
    };
  }, [
    hydrated,
    config,
    runtimeTabId,
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- A recovered guest needs fresh listeners on its replacement DOM element.
    generation,
  ]);

  if (!hydrated || !config) return null;
  const rect = presentation?.rect ?? null;
  const active = (presentation?.visible ?? false) && rect !== null;
  const style = resolveHostedBrowserWebviewWrapperStyle({
    active,
    renderingActive: false,
    keepPaintableWhenInactive: isMacPlatform(navigator.platform),
    cornerRadius: presentation?.cornerRadius ?? 0,
    zIndex: presentation?.zIndex ?? 30,
    rect,
    hiddenSize: { width: rect?.width ?? 1280, height: rect?.height ?? 800 },
  });
  return (
    <div className="fixed overflow-hidden" style={style}>
      <webview
        key={generation}
        ref={(node) => {
          webviewRef.current = node as HTMLElementTagNameMap["webview"] | null;
        }}
        // Electron reads this attribute at attachment; React drops unrecognized boolean attributes.
        {...({ allowpopups: "true" } as unknown as { readonly allowpopups?: boolean })}
        src={generation === 0 ? initialSrc : recoverySrc}
        partition={config.partition}
        webpreferences={config.webPreferences}
        {...(config.preloadUrl ? { preload: config.preloadUrl } : {})}
        data-web-page-tab={runtimeTabId}
        aria-hidden={active ? undefined : true}
        className="flex size-full"
      />
    </div>
  );
}
