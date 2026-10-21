/** Displays a rendered HTML asset and its panel action. */
import { t } from "~/i18n";
import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import {
  HTML_RENDER_COLUMN_WIDTH,
  htmlRenderFileName,
  htmlRenderFrameHeight,
  type HtmlRenderReference,
} from "@t3tools/shared/htmlRender";
import { CodeXmlIcon, Maximize2Icon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { useAssetUrlRefresh, useAssetUrlState } from "~/assets/assetUrls";

import { HtmlRenderDocument } from "../files/BrowserDocumentFrame";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { HtmlRenderDialog } from "./HtmlRenderDialog";
import { observeResize } from "~/lib/observeResize";

const MIN_URL_LIFE_MS = 5 * 60_000;

/**
 * Frames an agent's HTML page in the timeline at the server's measured height
 * for the content width until the page reports its own. Loading and failure
 * reserve the same content box. The surrounding chrome never changes the
 * document's parent or frozen URL on updates.
 */
export function HtmlRenderFrame(props: {
  readonly environmentId: EnvironmentId;
  readonly htmlRender: HtmlRenderReference;
  readonly threadRef: ScopedThreadRef | undefined;
  readonly onFullscreenChange?: (fullscreen: boolean) => void;
}) {
  const { attachmentId, title } = props.htmlRender;
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(HTML_RENDER_COLUMN_WIDTH);
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    setWidth(box.clientWidth);
    return observeResize(box, ([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
  }, []);
  // Client fonts can wrap a page taller than the server measured it; a frame
  // left short would scroll inside the thread and take the reader's scroll.
  const [contentHeight, setContentHeight] = useState<number>();
  const height = htmlRenderFrameHeight(props.htmlRender, width, contentHeight);
  const fileName = htmlRenderFileName(title);
  const resource = {
    _tag: "attachment" as const,
    attachmentId,
    fileName,
    mimeType: "text/html",
    disposition: "inline" as const,
  };
  // A cached URL with life left is reused, so the browser's cache serves the
  // page again; one near expiry is minted afresh, since a frame cannot report a
  // failed load.
  const [src, setSrc] = useState<string | null>(null);
  const srcExpiresAt = useRef(0);
  const [expandedSrc, setExpandedSrc] = useState<string | null>(null);
  const { onFullscreenChange } = props;
  useEffect(() => {
    if (expandedSrc === null) return;
    onFullscreenChange?.(true);
    return () => onFullscreenChange?.(false);
  }, [expandedSrc, onFullscreenChange]);
  const [failed, setFailed] = useState(false);
  const assetUrl = useAssetUrlState(src === null ? props.environmentId : null, resource);
  const cachedUrl = assetUrl._tag === "Success" ? assetUrl.url : null;
  const cachedExpiresAt = assetUrl._tag === "Success" ? assetUrl.expiresAt : 0;
  const cacheFailed = assetUrl._tag === "Failure";
  const refresh = useAssetUrlRefresh(props.environmentId, resource);
  // At most one mint per mount: expiry is server time and the check uses the
  // client clock, so a skewed clock must not mint again on every update.
  const minting = useRef(false);
  useEffect(() => {
    if (src !== null || minting.current) return;
    if (cacheFailed) {
      // oxlint-disable-next-line react/set-state-in-effect -- Mirrors the cached URL's failure.
      setFailed(true);
      return;
    }
    if (cachedUrl === null) return;
    if (cachedExpiresAt - Date.now() > MIN_URL_LIFE_MS) {
      srcExpiresAt.current = cachedExpiresAt;
      setSrc(cachedUrl);
      return;
    }
    minting.current = true;
    void refresh().then(
      (url) => (url === null ? setFailed(true) : setSrc(url)),
      () => setFailed(true),
    );
  }, [cacheFailed, cachedExpiresAt, cachedUrl, refresh, src]);

  return (
    <div className="overflow-hidden rounded-card-row bg-timeline-embed pb-2 shadow-well-pressed">
      <div className="flex h-8.5 items-center gap-2 px-3 text-secondary-copy text-secondary-label">
        <CodeXmlIcon aria-hidden="true" className="size-3.25 shrink-0" strokeWidth={1.75} />
        <span className="truncate">{t.chat.markdown.htmlPageFrameTitle}</span>
      </div>
      {/* Measure the real content width; the 8px shell gutters must not enter the page's size context. */}
      <div
        ref={boxRef}
        className="group/html-render relative mx-2 overflow-hidden rounded-tag bg-timeline-embed-content text-shadow-none"
        style={{ height }}
      >
        {src !== null ? (
          <>
            <HtmlRenderDocument
              src={src}
              title={title}
              threadRef={props.threadRef}
              className="block size-full"
              onContentHeight={setContentHeight}
              onFullscreenChange={onFullscreenChange}
            />
            <div className="absolute end-2 top-2 flex gap-1 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover/html-render:opacity-100 pointer-coarse:opacity-100">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      aria-label={t.chat.markdown.openFullScreen}
                      size="icon-xs"
                      variant="glass"
                      onClick={async () => {
                        const url =
                          srcExpiresAt.current - Date.now() > MIN_URL_LIFE_MS
                            ? src
                            : await refresh().catch(() => null);
                        if (url !== null) setExpandedSrc(url);
                        else
                          toastManager.add({
                            type: "error",
                            title: t.chat.markdown.pageUnavailable,
                            description: t.chat.markdown.reconnectToRetryPage,
                          });
                      }}
                    />
                  }
                >
                  <Maximize2Icon className="size-3.5" />
                </TooltipTrigger>
                <TooltipPopup side="left">{t.chat.markdown.openFullScreen}</TooltipPopup>
              </Tooltip>
            </div>
            {expandedSrc !== null ? (
              <HtmlRenderDialog
                src={expandedSrc}
                title={title}
                threadRef={props.threadRef}
                onClose={() => setExpandedSrc(null)}
              />
            ) : null}
          </>
        ) : failed ? (
          <p
            role="alert"
            className="m-0 flex size-full items-center justify-center p-3 text-secondary-copy text-error"
          >
            {t.chat.markdown.unableToLoad(title)}
          </p>
        ) : (
          <p
            role="status"
            className="m-0 flex size-full items-center justify-center p-3 text-secondary-copy text-muted-foreground"
          >
            {t.chat.markdown.loadingPage}
          </p>
        )}
      </div>
    </div>
  );
}
