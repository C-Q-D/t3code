/** Pure sidebar tab projections and storage codecs; rendering, search and I/O belong to callers. */
import type { SidebarSection } from "../Sidebar.logic";
import { SNOOZE_UI_ENABLED } from "../../snoozeUi";

/** Persisted tab identifiers, independent of translated labels. */
export type SidebarTab = "active" | "later" | "settled";

export const SIDEBAR_TAB_STORAGE_KEY = "t3code:sidebar-tab";
export const SIDEBAR_SETTLED_INITIAL_COUNT = 10;
export const SIDEBAR_SETTLED_PAGE_COUNT = 25;

/** Keep the project header and available lifecycle destinations aligned with the fork switch. */
export function visibleSidebarTabs(): readonly SidebarTab[] {
  return SNOOZE_UI_ENABLED ? ["active", "later", "settled"] : ["active", "settled"];
}

/** Already sorted, disjoint shelves from Sidebar's capability-aware classification.
 * Working is empty when its beta is disabled; ordinary rows then remain in activeThreads. */
export interface SidebarTabShelves<T> {
  readonly pinnedThreads: readonly T[];
  readonly activeThreads: readonly T[];
  readonly workingThreads: readonly T[];
  readonly snoozedThreads: readonly T[];
  readonly settledThreads: readonly T[];
}

/** Visible rows per tab plus full shelf counts, including settled rows behind Show more. */
export interface SidebarTabs<T> {
  readonly rowsByTab: Readonly<Record<SidebarTab, readonly T[]>>;
  readonly counts: Readonly<Record<SidebarTab, number>>;
  readonly hiddenSettledCount: number;
}

/** A search replaces tab navigation without changing the remembered tab. */
export type SidebarTabView<T> =
  | { readonly mode: "tab"; readonly tab: SidebarTab; readonly rows: readonly T[] }
  | { readonly mode: "search"; readonly rows: readonly T[]; readonly matchCount: number };

/** Intent only; callers apply capability guards and open the existing duration menu. */
export type SidebarTabDropIntent = "settle" | "open-snooze-menu" | "unsnooze" | "unsettle" | null;

/** Decode a raw localStorage value; absent or invalid values select Active. No I/O. */
export function readSidebarTab(storedValue: string | null | undefined): SidebarTab {
  return (SNOOZE_UI_ENABLED && storedValue === "later") || storedValue === "settled"
    ? storedValue
    : "active";
}

/** Produce the exact localStorage write entry for a tab. The caller owns I/O and errors. */
export function writeSidebarTab(tab: SidebarTab): { readonly key: string; readonly value: string } {
  return { key: SIDEBAR_TAB_STORAGE_KEY, value: tab };
}

/** Reveal a selected search result in its existing shelf after clearing search.
 * Keys and shelf sets must be environment-scoped and include paginated history;
 * all other results (including pinned/working rows) belong to Active. No lifecycle mutation. */
export function resolveSidebarSearchResultTab(input: {
  readonly threadKey: string;
  readonly snoozedThreadKeys: ReadonlySet<string>;
  readonly settledThreadKeys: ReadonlySet<string>;
}): SidebarTab {
  if (SNOOZE_UI_ENABLED && input.snoozedThreadKeys.has(input.threadKey)) return "later";
  if (input.settledThreadKeys.has(input.threadKey)) return "settled";
  return "active";
}

/** Project preclassified shelves without re-sorting. getThreadKey must return an environment-scoped
 * key; routeThreadKey retains an open settled row beyond the positive settledVisibleCount (default 10).
 * Memoize this separately from search input so keystrokes do not rebuild every shelf. */
export function buildSidebarTabs<T>(
  shelves: SidebarTabShelves<T>,
  options: {
    readonly getThreadKey: (thread: T) => string;
    readonly settledVisibleCount?: number;
    readonly routeThreadKey?: string | null;
  },
): SidebarTabs<T> {
  const settledVisibleCount = options.settledVisibleCount ?? SIDEBAR_SETTLED_INITIAL_COUNT;
  let visibleSettledThreads = shelves.settledThreads;
  if (shelves.settledThreads.length > settledVisibleCount) {
    const visible = shelves.settledThreads.slice(0, settledVisibleCount);
    // Keep a deep-linked settled thread reachable without expanding every older row.
    if (options.routeThreadKey != null) {
      const routeThread = shelves.settledThreads
        .slice(settledVisibleCount)
        .find((thread) => options.getThreadKey(thread) === options.routeThreadKey);
      if (routeThread !== undefined) visible.push(routeThread);
    }
    visibleSettledThreads = visible;
  }
  const active = [...shelves.pinnedThreads, ...shelves.activeThreads, ...shelves.workingThreads];
  return {
    rowsByTab: {
      active,
      later: shelves.snoozedThreads,
      settled: visibleSettledThreads,
    },
    counts: {
      active: active.length,
      later: shelves.snoozedThreads.length,
      settled: shelves.settledThreads.length,
    },
    hiddenSettledCount: shelves.settledThreads.length - visibleSettledThreads.length,
  };
}

/** Advance the current positive settled page budget by the existing 25-row page size. */
export function nextSidebarSettledVisibleCount(currentCount: number): number {
  return currentCount + SIDEBAR_SETTLED_PAGE_COUNT;
}

/** Select a tab or the caller's existing flat search results. Whitespace is not a search;
 * searchResults must contain all matches, including rows beyond the settled page budget. */
export function resolveSidebarTabView<T>(input: {
  readonly tabs: SidebarTabs<T>;
  readonly currentTab: SidebarTab;
  readonly searchQuery: string;
  readonly searchResults: readonly T[];
}): SidebarTabView<T> {
  if (input.searchQuery.trim().length > 0) {
    return { mode: "search", rows: input.searchResults, matchCount: input.searchResults.length };
  }
  return { mode: "tab", tab: input.currentTab, rows: input.tabs.rowsByTab[input.currentTab] };
}

/** Number only the first nine rows of the selected view, using scoped keys from getThreadKey.
 * Search views number their flat results; keyboard handlers and hints must share this mapping. */
export function sidebarTabJumpNumbers<T>(
  view: SidebarTabView<T>,
  getThreadKey: (thread: T) => string,
): ReadonlyMap<string, number> {
  return new Map(view.rows.slice(0, 9).map((thread, index) => [getThreadKey(thread), index + 1]));
}

/** Resolve a tab drop from the thread's current shelf. Active does not unpin or stop work;
 * dropping on Settled is idempotent, while Later always requests a duration selection. */
export function resolveSidebarTabDropIntent(
  sourceSection: SidebarSection,
  targetTab: SidebarTab,
): SidebarTabDropIntent {
  if (targetTab === "later") return SNOOZE_UI_ENABLED ? "open-snooze-menu" : null;
  if (targetTab === "settled") return sourceSection === "settled" ? null : "settle";
  if (sourceSection === "snoozed") return "unsnooze";
  if (sourceSection === "settled") return "unsettle";
  return null;
}
