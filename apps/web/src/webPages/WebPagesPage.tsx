/** Presents the selected saved page; L2 owns the persistent guest that covers the surface slot. */
import { BrowserSurfaceSlot } from "../browser/BrowserSurfaceSlot";
import { previewBridge } from "../components/preview/previewBridge";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "../components/ui/empty";
import { isElectron } from "../env";
import { t } from "../i18n";
import { useWebPages } from "./useWebPages";
import { useWebPageRuntimeStore, webPageRuntimeTabId } from "./webPageRuntimeStore";
import { resolveWebPagesPageState } from "./webPagesPageState";
import { WebPageToolbar } from "./WebPageToolbar";

/** Subscribes only to the selected entry's runtime values; pause removes its slot but preserves selection. */
export function WebPagesPage() {
  const { entries, hydrated } = useWebPages();
  const activeId = useWebPageRuntimeStore((state) => state.activeId);
  const opened = useWebPageRuntimeStore(
    (state) => activeId !== null && state.opened[activeId] === true,
  );
  const nav = useWebPageRuntimeStore((state) =>
    activeId === null ? undefined : state.navById[activeId],
  );
  const entry = entries.find((candidate) => candidate.id === activeId);
  const state = resolveWebPagesPageState({ desktop: isElectron, entry, opened, nav });

  if (state === "desktop-only") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <Empty>
          <EmptyTitle>{t.webPages.desktopOnly}</EmptyTitle>
        </Empty>
      </div>
    );
  }
  if (!hydrated) return <div className="flex h-full min-h-0 flex-col" />;
  if (state === "empty" || !entry) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <Empty>
          <EmptyTitle>{t.webPages.selectPage}</EmptyTitle>
        </Empty>
      </div>
    );
  }
  if (state === "paused") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t.webPages.paused}</EmptyTitle>
            <EmptyDescription>{t.webPages.pausedDescription}</EmptyDescription>
          </EmptyHeader>
          <Button onClick={() => useWebPageRuntimeStore.getState().open(entry.id)}>
            {t.webPages.load}
          </Button>
        </Empty>
      </div>
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <WebPageToolbar entry={entry} nav={nav} />
      {state === "failed" && nav?.failure ? (
        <div className="shrink-0 p-2">
          <Alert variant="error">
            <AlertDescription>
              <div className="flex items-center justify-between gap-3">
                <span>{t.webPages.failure(nav.failure.description)}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void previewBridge
                      ?.refresh(webPageRuntimeTabId(entry.id))
                      .catch((error) => console.error("Could not retry the web page.", error));
                  }}
                >
                  {t.webPages.retry}
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      ) : null}
      {/* The separate guest layer escapes card clipping and supports only a uniform radius;
          inset it so its rounded panel cannot cover the outer card corners. */}
      <div className="flex min-h-0 flex-1 p-2">
        <BrowserSurfaceSlot
          tabId={webPageRuntimeTabId(entry.id)}
          visible={true}
          cornerRadius={14}
          className="min-h-0 flex-1"
        />
      </div>
    </div>
  );
}
