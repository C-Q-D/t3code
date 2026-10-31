/** Reveals thread search matches while preserving virtual-history positioning and overlay clearance. */
import type { LegendListRef } from "@legendapp/list/react";
import { useEffect, useEffectEvent, useRef, type RefObject } from "react";
import type { ThreadFindMatch } from "./threadFind";
import { useThreadFindHighlights } from "./threadFindHighlights";
import { resolveThreadFindRevealBounds } from "./useThreadFindNavigation.logic";

const FIND_MATCH_VIEW_MARGIN = 96;

type FindEntries = readonly { readonly id: string }[];

interface RevealInputs {
  readonly matchKey: string | null;
  readonly rowIndex: number;
  readonly entries: FindEntries;
  readonly listReady: boolean;
  readonly historyLoading: boolean;
  readonly historyError: string | null;
  readonly contentInsetEndAdjustment: number;
  readonly container: HTMLElement | null;
}

/** Positioning bookkeeping that outlives a render: pending jumps and the pinned match during paging. */
interface RevealState {
  positioning: { key: string; rowIndex: number; entries: FindEntries } | null;
  settledMatch: string | null;
  activeRange: Range | null;
  pagingPosition: { key: string; entries: FindEntries; top: number } | null;
  revealedMatch: string | null;
  positionedEntries: FindEntries | null;
}

/**
 * Brings the active match into view. Async continuations re-enter with the
 * inputs current by then, and stop once the match changes or the list unmounts.
 */
function revealThreadFindMatch(
  range: Range | null,
  inputs: RevealInputs,
  context: {
    readonly state: RevealState;
    readonly listRef: RefObject<LegendListRef | null>;
    readonly readInputs: () => RevealInputs;
  },
): void {
  const { state, listRef, readInputs } = context;
  const {
    matchKey,
    rowIndex,
    entries,
    listReady,
    historyLoading,
    historyError,
    contentInsetEndAdjustment,
    container,
  } = inputs;
  state.activeRange = range;
  if (!matchKey) {
    state.positioning = null;
    state.settledMatch = null;
    state.revealedMatch = null;
    state.pagingPosition = null;
    return;
  }
  const list = listRef.current;
  const stillCurrent = () =>
    container?.isConnected === true &&
    list !== null &&
    listRef.current === list &&
    readInputs().matchKey === matchKey;
  const revealAgain = () => revealThreadFindMatch(state.activeRange, readInputs(), context);
  const pagingPosition = state.pagingPosition;
  if (pagingPosition && pagingPosition.key !== matchKey) state.pagingPosition = null;
  if (
    range?.startContainer.isConnected &&
    pagingPosition?.key === matchKey &&
    pagingPosition.entries !== entries
  ) {
    const restore = () => {
      const pinned = state.pagingPosition;
      const currentRange = state.activeRange;
      if (!stillCurrent() || !pinned || !currentRange?.startContainer.isConnected) return;
      const delta = currentRange.getBoundingClientRect().top - pinned.top;
      const scroll = listRef.current?.getState?.().scroll;
      if (Math.abs(delta) >= 1 && typeof scroll === "number")
        listRef.current?.scrollToOffset({ offset: scroll + delta, animated: false });
    };
    pagingPosition.entries = entries;
    restore();
    // The list measures newly inserted activity after the first layout pass.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        restore();
        if (!readInputs().historyLoading && state.pagingPosition === pagingPosition)
          state.pagingPosition = null;
      }),
    );
  }
  if (historyError) state.pagingPosition = null;
  if (state.revealedMatch === matchKey) return;
  if (!listReady || rowIndex < 0) return;
  const viewport = container?.getBoundingClientRect();
  const bannerBounds = container
    ?.closest("[data-chat-canvas]")
    ?.querySelector<HTMLElement>("[data-timeline-status-banners]")
    ?.getBoundingClientRect();
  const bannerBottom = bannerBounds && bannerBounds.height > 0 ? bannerBounds.bottom : null;
  const materialize = () => {
    const previous = state.positioning;
    if (
      !list ||
      (previous?.key === matchKey && previous.rowIndex === rowIndex && previous.entries === entries)
    )
      return;
    // Activity can insert rows during LegendList layout; retarget pending jumps.
    const request = { key: matchKey, rowIndex, entries };
    state.positioning = request;

    void list
      .scrollToIndex({
        index: rowIndex,
        animated: false,
        viewOffset:
          resolveThreadFindRevealBounds({
            viewportTop: viewport?.top ?? 0,
            viewportBottom: viewport?.bottom ?? 0,
            contentInsetEndAdjustment,
            matchHeight: range?.getBoundingClientRect().height ?? 0,
            maxMargin: FIND_MATCH_VIEW_MARGIN,
            bannerBottom,
          }).top - (viewport?.top ?? 0),
      })
      .then(() => {
        if (state.positioning !== request || !stillCurrent()) return;

        state.positionedEntries = entries;
        state.settledMatch = matchKey;
        revealAgain();
      });
  };
  if (!range) {
    if (container) materialize();
    return;
  }

  const codeScroller = range.startContainer.parentElement?.closest("pre");
  if (codeScroller) {
    const rect = range.getBoundingClientRect();
    const viewport = codeScroller.getBoundingClientRect();
    if (rect.left < viewport.left) codeScroller.scrollLeft += rect.left - viewport.left - 16;
    else if (rect.right > viewport.right)
      codeScroller.scrollLeft += rect.right - viewport.right + 16;
  }
  const rect = range.getBoundingClientRect();
  if (!viewport || rect.height === 0) return;
  const { top, bottom, alignTop } = resolveThreadFindRevealBounds({
    viewportTop: viewport.top,
    viewportBottom: viewport.bottom,
    contentInsetEndAdjustment,
    matchHeight: rect.height,
    maxMargin: FIND_MATCH_VIEW_MARGIN,
    bannerBottom,
  });
  const delta =
    alignTop || rect.top < top ? rect.top - top : rect.bottom > bottom ? rect.bottom - bottom : 0;
  // DOM text can precede settled row sizes; wait before measuring offscreen matches.
  if (
    Math.abs(delta) >= 1 &&
    state.positionedEntries !== entries &&
    state.settledMatch !== matchKey
  ) {
    materialize();
    return;
  }
  const scroll = list?.getState?.().scroll;
  state.positionedEntries = entries;

  state.revealedMatch = matchKey;
  if (historyLoading) state.pagingPosition = { key: matchKey, entries, top: rect.top - delta };
  if (Math.abs(delta) >= 1 && typeof scroll === "number") {
    list?.scrollToOffset({ offset: scroll + delta, animated: false });
    requestAnimationFrame(() => {
      if (!stillCurrent()) return;
      if (
        listRef.current?.getState?.().scroll === scroll &&
        range.getBoundingClientRect().top === rect.top
      )
        return;
      state.revealedMatch = null;
      revealAgain();
    });
  }
}

/** Reveals matches without losing the user's position when virtualized history materializes.
 * @param container Timeline scroll viewport, or null before mount.
 * @param query Current search text.
 * @param match Selected occurrence, or null to clear positioning.
 * @param navigationId Distinguishes repeated navigation to the same occurrence.
 * @param rowIndex Target virtual row index.
 * @param entries Ordered row identities used to detect history changes.
 * @param listRef Virtualizer receiving scroll requests; may be unmounted.
 * @param contentInsetEndAdjustment Bottom overlay clearance in CSS pixels.
 * @param listReady Defers row positioning until virtual layout is usable.
 * @param historyControls Optional paging state and load callback for older matches.
 * @returns Nothing; synchronizes highlights and scroll position, and releases DOM listeners on cleanup. */
export function useThreadFindNavigation({
  container,
  query,
  match,
  navigationId,
  rowIndex,
  entries,
  listRef,
  contentInsetEndAdjustment,
  listReady,
  historyControls,
}: {
  container: HTMLElement | null;
  query: string;
  match: ThreadFindMatch | null;
  navigationId: number;
  rowIndex: number;
  entries: FindEntries;
  listRef: RefObject<LegendListRef | null>;
  contentInsetEndAdjustment: number;
  listReady: boolean;
  historyControls?:
    | {
        readonly hasMoreHistory: boolean;
        readonly loading: boolean;
        readonly error: string | null;
        readonly onLoadEarlier: (throughEntryId?: string) => void;
      }
    | undefined;
}) {
  const matchKey = match ? `${navigationId}:${query}:${match.entryId}:${match.occurrence}` : null;
  const historyLoading = historyControls?.loading ?? false;
  const historyError = historyControls?.error ?? null;
  const stateRef = useRef<RevealState>({
    positioning: null,
    settledMatch: null,
    activeRange: null,
    pagingPosition: null,
    revealedMatch: null,
    positionedEntries: null,
  });
  const readInputs = useEffectEvent((): RevealInputs => ({
    matchKey,
    rowIndex,
    entries,
    listReady,
    historyLoading,
    historyError,
    contentInsetEndAdjustment,
    container,
  }));
  // H/Z: stays an effect. The listener compares against the entries rendered at
  // scroll time; the viewport ref callback in MessagesTimeline cannot read
  // them without a latest-ref mirror, and capturing them would re-attach the
  // viewport (observers, citation dismissal) on every streamed entry.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- attaches a scroll listener to the timeline container to track the active match position
  useEffect(() => {
    if (!container) return;
    const onScroll = () => {
      const state = stateRef.current;
      const position = state.pagingPosition;
      const range = state.activeRange;
      if (
        !position ||
        position.entries !== readInputs().entries ||
        !range?.startContainer.isConnected
      )
        return;
      const rect = range.getBoundingClientRect();
      const viewport = container.getBoundingClientRect();
      if (rect.bottom < viewport.top || rect.top > viewport.bottom) state.pagingPosition = null;
      else position.top = rect.top;
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [container]);
  const requestedPagesRef = useRef<{ key: string | null; pages: Set<string> }>({
    key: null,
    pages: new Set(),
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- requests earlier history pages until the active match's entry is loaded
  useEffect(() => {
    if (requestedPagesRef.current.key !== matchKey)
      requestedPagesRef.current = { key: matchKey, pages: new Set() };
    if (
      !match ||
      !listReady ||
      rowIndex >= 0 ||
      entries.some((entry) => entry.id === match.entryId)
    )
      return;
    if (!historyControls?.hasMoreHistory || historyControls.loading || historyControls.error)
      return;
    const cursor = entries[0]?.id ?? "first";
    if (requestedPagesRef.current.pages.has(cursor)) return;
    requestedPagesRef.current.pages.add(cursor);

    historyControls.onLoadEarlier(match.entryId);
  }, [entries, historyControls, listReady, match, matchKey, rowIndex]);
  const reveal = useEffectEvent((range: Range | null, inputs: RevealInputs) =>
    revealThreadFindMatch(range, inputs, { state: stateRef.current, listRef, readInputs }),
  );

  useThreadFindHighlights({
    container,
    query,
    activeRowId: match?.entryId ?? null,
    activeOccurrence: match?.occurrence ?? 0,
    onActiveRange: (range) => reveal(range, readInputs()),
  });
  // Positioning also depends on the list: a loaded page or a shifted row must
  // retry the jump for the same selection. Declared after the highlight
  // effects so it reuses the range they just resolved.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- scrolls the list to the active match after commit when rows or the loaded page change
  useEffect(() => {
    reveal(stateRef.current.activeRange, {
      matchKey,
      rowIndex,
      entries,
      listReady,
      historyLoading,
      historyError,
      contentInsetEndAdjustment,
      container,
    });
  }, [
    container,
    matchKey,
    rowIndex,
    entries,
    listReady,
    historyLoading,
    historyError,
    contentInsetEndAdjustment,
  ]);
}
