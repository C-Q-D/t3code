/** Holds the fixed search/filter/count strip above the scrolling PR rows. */
import { useRef, useEffect, type ReactNode, type RefObject } from "react";
import { t } from "~/i18n";
import { workspaceAreaProps } from "../../lib/workspaceFocus";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { RefreshIcon } from "../ui/refresh-icon";

/**
 * Keeps search, independent filter chips and counts above the scrolling list.
 * @param props Existing controls and body; the 400px preferred list width yields to the persisted detail-panel splitter.
 * @returns The list column; Ctrl/Command+F focuses and selects the persistent search field.
 */
export function PullRequestsColumn({
  searchInput,
  sortMenu,
  filtersMenu,
  shownCount,
  rightPanelOpen,
  maximizedAway,
  listBody,
  scrollRef,
}: {
  searchInput: ReactNode;
  sortMenu: ReactNode;
  filtersMenu: ReactNode;
  shownCount: number;
  rightPanelOpen: boolean;
  maximizedAway: boolean;
  listBody: ReactNode;
  scrollRef: RefObject<HTMLDivElement | null>;
}) {
  const contentArea = workspaceAreaProps("pull-requests", 1, t.git.reviewAdditions.pullRequests);
  const searchRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.shiftKey) return;
      if (event.key.toLowerCase() !== "f" || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      const input = searchRef.current?.querySelector("input");
      input?.focus();
      input?.select();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div
      {...contentArea}
      inert={maximizedAway}
      className={cn(
        "@container/pr-list flex h-full min-h-0 min-w-0 flex-col gap-2.5 overflow-hidden",
        maximizedAway ? "w-0 flex-none" : rightPanelOpen ? "basis-pr-list flex-1" : "flex-1",
      )}
    >
      <div className="flex shrink-0 flex-col gap-2.5 pl-4 pr-3 pt-4">
        <div ref={searchRef}>{searchInput}</div>
        {filtersMenu}
        <div className="flex min-w-0 items-center justify-between gap-2 px-1">
          <span className="text-secondary-copy text-muted-foreground" role="status">
            {t.git.pullRequest.listCount(shownCount)}
          </span>
          {sortMenu}
        </div>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pl-4">
        {listBody}
      </div>
    </div>
  );
}

/**
 * Refreshes host data from the shared titlebar; disabled while that refresh is running.
 * @param props Refresh progress and the existing cache-bypassing refresh callback.
 * @returns A 30px titlebar action with an accessible label.
 */
export function PullRequestRefreshControl({
  refreshing,
  onRefresh,
}: {
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <Button
      size="icon-md"
      variant="ghost"
      aria-label={t.git.pullRequest.refreshPullRequests}
      onClick={onRefresh}
      disabled={refreshing}
    >
      <RefreshIcon size="md" refreshing={refreshing} />
    </Button>
  );
}
