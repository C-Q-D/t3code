/** Sidebar search, discussion entry, creation and shelf tabs; list projections and persistence belong to Sidebar. */
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { useDroppable } from "@dnd-kit/core";
import { useLocation } from "@tanstack/react-router";
import { MessagesSquareIcon, PlusIcon, SearchIcon, XIcon } from "lucide-react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";

import { t } from "~/i18n";
import { cn } from "~/lib/utils";
import { discussionNavigationState } from "../discussions/discussionNavigation.logic";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import type { SidebarTab } from "./sidebarTabs.logic";
import { sidebarTabDropId } from "./SidebarThreadDndContext";

/** Register a real header target; eligible pointer hits use the same appearance as hover. */
function SidebarDropTab({ tab, count }: { tab: SidebarTab; count: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: sidebarTabDropId(tab) });
  return (
    <Toggle
      ref={setNodeRef}
      value={tab}
      className={cn(
        "flex h-7.5 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-full text-secondary-label hover:bg-secondary hover:text-foreground data-pressed:bg-sidebar-tab-selected data-pressed:font-bold data-pressed:text-foreground data-pressed:shadow-raise-xs-control focus-visible:inset-shadow-focus focus-visible:outline-none",
        isOver && "bg-secondary text-foreground",
      )}
    >
      {t.sidebar.tabs[tab]}
      <span className="font-mono text-meta">{count}</span>
    </Toggle>
  );
}

/** Controlled header inputs; counts include every row in each shelf, including paginated history. */
export interface SidebarThreadHeaderProps {
  /** Discussion navigation is unavailable until at least one project exists. */
  hasProjects: boolean;
  currentTab: SidebarTab;
  tabCounts: Readonly<Record<SidebarTab, number>>;
  onTabChange: (tab: SidebarTab) => void;
  onOpenDiscussions: () => void;
  /** Receives the click so Shift+click can skip the project picker. */
  onNewThread: (event: ReactMouseEvent) => void;
  newThreadDisabled: boolean;
  newThreadShortcutLabel: string | null | undefined;
  /** Copy derived from the ordinary-click destination; absent uses the unscoped label. */
  newThreadTooltipLabel?: string;
  newThreadInProjectShortcutLabel: string | null | undefined;
  /** Shift+click only matters once there is more than one project to pick. */
  showNewThreadInProjectHint: boolean;
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onSearchKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  isSearching: boolean;
  searchResultCount: number;
  activeSearchResultIndex: number;
  onClearSearch: () => void;
}

/** Render controlled search and shelf selection; route subscription stays here to avoid rerendering the list. */
export function SidebarThreadHeader({
  hasProjects,
  currentTab,
  tabCounts,
  onTabChange,
  onOpenDiscussions,
  onNewThread,
  newThreadDisabled,
  newThreadShortcutLabel,
  newThreadTooltipLabel,
  newThreadInProjectShortcutLabel,
  showNewThreadInProjectHint,
  searchInputRef,
  searchQuery,
  onSearchQueryChange,
  onSearchKeyDown,
  isSearching,
  searchResultCount,
  activeSearchResultIndex,
  onClearSearch,
}: SidebarThreadHeaderProps) {
  const pathname = useLocation({ select: (location) => location.pathname });
  const resultsVisible = isSearching && searchResultCount > 0;
  const discussions = discussionNavigationState(hasProjects, pathname);
  // Narrowing the query can remove the active option before its index resets.
  const activeResultExists = resultsVisible && activeSearchResultIndex < searchResultCount;
  const newThreadLabel =
    newThreadTooltipLabel ??
    (newThreadShortcutLabel
      ? t.sidebar.header.newThreadWithShortcut(newThreadShortcutLabel)
      : t.sidebar.header.newThread);

  return (
    <div className="relative z-1 min-w-0 px-3 pt-3">
      <div className="flex items-center gap-1.5 pb-2.5">
        <div
          className={cn(
            "flex h-9.5 min-w-0 flex-1 items-center gap-2 rounded-full bg-sidebar-control-surface pl-3.5 text-control text-muted-foreground shadow-well-control focus-within:inset-shadow-sidebar-search-focus",
            isSearching ? "pr-1" : "pr-1.5",
          )}
        >
          <SearchIcon aria-hidden className="size-3.75 shrink-0" strokeWidth={1.75} />
          <input
            ref={searchInputRef}
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.currentTarget.value)}
            onKeyDown={onSearchKeyDown}
            placeholder={t.sidebar.header.searchPlaceholder}
            aria-label={t.sidebar.header.searchAriaLabel}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={resultsVisible}
            aria-controls={resultsVisible ? "sidebar-thread-search-results" : undefined}
            aria-activedescendant={
              activeResultExists
                ? `sidebar-thread-search-result-${activeSearchResultIndex}`
                : undefined
            }
            className="sidebar-header-search h-full min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
          />
          {isSearching ? (
            <button
              type="button"
              className="flex size-7.5 shrink-0 cursor-pointer items-center justify-center rounded-full bg-secondary text-code-foreground focus-visible:inset-shadow-focus focus-visible:outline-none"
              aria-label={t.sidebar.header.clearSearchAriaLabel}
              onClick={() => {
                onClearSearch();
                searchInputRef.current?.focus();
              }}
            >
              <XIcon aria-hidden className="size-3.5" />
            </button>
          ) : (
            <kbd className="flex h-5.5 shrink-0 items-center rounded-full bg-sidebar-shortcut px-2 font-mono text-meta text-secondary-label shadow-raise-xs-control">
              Ctrl K
            </kbd>
          )}
        </div>
        {!isSearching ? (
          <>
            {discussions.visible ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      aria-label={t.sidebar.header.discussions}
                      aria-pressed={discussions.isActive}
                      onClick={onOpenDiscussions}
                      className={cn(
                        "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-secondary-label hover:bg-secondary hover:text-foreground focus-visible:inset-shadow-focus focus-visible:outline-none",
                        discussions.isActive && "text-foreground inset-shadow-selected",
                      )}
                    />
                  }
                >
                  <MessagesSquareIcon aria-hidden className="size-3.75" strokeWidth={1.75} />
                </TooltipTrigger>
                <TooltipPopup side="top">{t.sidebar.header.discussions}</TooltipPopup>
              </Tooltip>
            ) : null}
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label={t.sidebar.header.newThread}
                    disabled={newThreadDisabled}
                    onClick={onNewThread}
                    className="flex h-9.5 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-sidebar-new-thread pl-2.5 pr-3.5 text-control font-extrabold text-foreground shadow-raise-new-thread hover:bg-sidebar-tab-selected focus-visible:inset-shadow-focus focus-visible:outline-none disabled:cursor-default disabled:text-fg-control-disabled disabled:shadow-none"
                  />
                }
              >
                <PlusIcon aria-hidden className="size-4.25" strokeWidth={2.5} />
                {t.sidebar.header.newThreadLabel}
              </TooltipTrigger>
              <TooltipPopup side="top">
                {showNewThreadInProjectHint ? (
                  <span className="flex flex-col gap-0.5">
                    <span>{newThreadLabel}</span>
                    <span className="text-muted-foreground">
                      {t.sidebar.header.newThreadInProjectTooltip(newThreadInProjectShortcutLabel)}
                    </span>
                  </span>
                ) : (
                  newThreadLabel
                )}
              </TooltipPopup>
            </Tooltip>
          </>
        ) : null}
      </div>
      {isSearching ? (
        <div
          className="mb-1.5 flex h-9 items-center px-3 text-secondary-copy-medium text-muted-foreground"
          role="status"
        >
          {t.sidebar.search.matches(searchResultCount)}
        </div>
      ) : (
        // Base UI supplies roving keyboard focus; this feature owns B1's 36px track and 30px items.
        <ToggleGroup<SidebarTab>
          aria-label={t.sidebar.tabs.ariaLabel}
          value={[currentTab]}
          onValueChange={(values) => {
            const tab = values[0];
            // Clicking the current segment must not leave the list without a selected shelf.
            if (tab) onTabChange(tab);
          }}
          className="mb-1.5 flex h-9 rounded-full bg-sidebar-control-surface p-0.75 text-secondary-copy-medium shadow-well-control"
        >
          {(["active", "later", "settled"] as const).map((tab) => (
            <SidebarDropTab key={tab} tab={tab} count={tabCounts[tab]} />
          ))}
        </ToggleGroup>
      )}
    </div>
  );
}
