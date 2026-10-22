/** Controls the selected desktop guest; its address is read-only and host events own navigation state. */
import type { WebPageEntry } from "@t3tools/contracts";
import { ArrowLeftIcon, ArrowRightIcon, ExternalLinkIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../components/ui/tooltip";
import { previewBridge } from "../components/preview/previewBridge";
import { t } from "../i18n";
import { readLocalApi } from "../localApi";
import { webPageRuntimeTabId, type WebPageNav } from "./webPageRuntimeStore";

/** Uses the latest host URL, falling back to the saved launch URL until the first host event. */
export function WebPageToolbar({
  entry,
  nav,
}: {
  entry: WebPageEntry;
  nav: WebPageNav | undefined;
}) {
  const tabId = webPageRuntimeTabId(entry.id);
  const url = nav?.url || entry.url;
  return (
    <div className="flex shrink-0 items-center gap-1.5 border-b border-border p-2">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost-muted"
              size="icon-sm"
              disabled={!nav?.canGoBack}
              aria-label={t.webPages.back}
              onClick={() => {
                void previewBridge
                  ?.goBack(tabId)
                  .catch((error) => console.error("Could not go back in the web page.", error));
              }}
            />
          }
        >
          <ArrowLeftIcon />
        </TooltipTrigger>
        <TooltipPopup>{t.webPages.back}</TooltipPopup>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost-muted"
              size="icon-sm"
              disabled={!nav?.canGoForward}
              aria-label={t.webPages.forward}
              onClick={() => {
                void previewBridge
                  ?.goForward(tabId)
                  .catch((error) => console.error("Could not go forward in the web page.", error));
              }}
            />
          }
        >
          <ArrowRightIcon />
        </TooltipTrigger>
        <TooltipPopup>{t.webPages.forward}</TooltipPopup>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost-muted"
              size="icon-sm"
              aria-label={t.webPages.refresh}
              onClick={() => {
                void previewBridge
                  ?.refresh(tabId)
                  .catch((error) => console.error("Could not refresh the web page.", error));
              }}
            />
          }
        >
          <RefreshCwIcon />
        </TooltipTrigger>
        <TooltipPopup>{t.webPages.refresh}</TooltipPopup>
      </Tooltip>
      <div className="min-w-0 flex-1">
        <Input size="sm" readOnly aria-label={t.webPages.currentAddress} value={url} />
      </div>
      {nav?.loading ? (
        <span role="status" className="shrink-0 text-secondary-copy text-secondary-label">
          {t.webPages.loading}
        </span>
      ) : null}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost-muted"
              size="icon-sm"
              aria-label={t.webPages.openExternal}
              onClick={() => {
                void readLocalApi()
                  ?.shell.openExternal(url)
                  .catch((error) =>
                    console.error("Could not open the web page in the system browser.", error),
                  );
              }}
            />
          }
        >
          <ExternalLinkIcon />
        </TooltipTrigger>
        <TooltipPopup>{t.webPages.openExternal}</TooltipPopup>
      </Tooltip>
    </div>
  );
}
