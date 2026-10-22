/** Keeps personal page guests outside route lifetimes and bridges desktop events to local state. */
import type { DesktopPreviewOpenLinkEvent, DesktopPreviewTabState } from "@t3tools/contracts";
import { useEffect, useEffectEvent } from "react";
import { previewBridge } from "~/components/preview/previewBridge";
import { isElectron } from "~/env";
import { readLocalApi } from "~/localApi";
import { HostedWebPage } from "./HostedWebPage";
import { useWebPages } from "./useWebPages";
import {
  projectWebPageFavicon,
  projectWebPageNav,
  shouldRememberWebPageUrl,
} from "./webPageNavProjection";
import { parseWebPageRuntimeTabId, useWebPageRuntimeStore } from "./webPageRuntimeStore";
import {
  rememberWebPageFavicon,
  rememberWebPageUrl,
  resolveWebPageStartUrl,
} from "./webPageSession";

/** Desktop-only lifetime boundary; browser clients must not allocate personal page guests. */
export function WebPagesHost() {
  return isElectron ? <DesktopWebPagesHost /> : null;
}

/** Subscribes once while reading current entries; navigation updates do not rerender the host. */
function DesktopWebPagesHost() {
  const { entries, hydrated } = useWebPages();
  const opened = useWebPageRuntimeStore((state) => state.opened);
  const onStateChange = useEffectEvent((tabId: string, state: DesktopPreviewTabState) => {
    const id = parseWebPageRuntimeTabId(tabId);
    const runtime = useWebPageRuntimeStore.getState();
    if (id === null || !Object.hasOwn(runtime.opened, id)) return;
    const entry = entries.find((candidate) => candidate.id === id);
    if (!entry) return;
    const nav = projectWebPageNav(state);
    if (nav) runtime.applyNav(id, nav);
    const favicon = projectWebPageFavicon(state);
    if (favicon !== null) {
      runtime.applyFavicon(id, favicon);
      rememberWebPageFavicon(entry, favicon);
    }
    if (nav && shouldRememberWebPageUrl(state, resolveWebPageStartUrl(entry))) {
      rememberWebPageUrl(entry, nav.url);
    }
  });
  const onOpenLink = useEffectEvent((event: DesktopPreviewOpenLinkEvent) => {
    const id = parseWebPageRuntimeTabId(event.tabId);
    if (id === null || !entries.some((entry) => entry.id === id)) return;
    void readLocalApi()
      ?.shell.openExternal(event.url)
      .catch((error) => {
        console.warn("Failed to open personal page link externally", error);
      });
  });
  useEffect(() => {
    if (!previewBridge) return;
    const unsubscribeState = previewBridge.onStateChange(onStateChange);
    const unsubscribeLinks = previewBridge.onOpenLink(onOpenLink);
    return () => {
      unsubscribeState();
      unsubscribeLinks();
    };
  }, []);
  if (!hydrated) return null;
  // Moving a webview destroys its Electron guest, so settings order cannot determine DOM order.
  const pages = entries
    .filter((entry) => Object.hasOwn(opened, entry.id))
    .toSorted((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return (
    <div data-web-pages-host>
      {pages.map((entry) => (
        <HostedWebPage key={entry.id} entry={entry} />
      ))}
    </div>
  );
}
