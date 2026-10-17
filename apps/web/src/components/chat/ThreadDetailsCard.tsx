/** Places and sizes the thread details card within the chat canvas. */
import { t } from "~/i18n";
import { useLayoutEffect, useState, type ReactNode, type RefObject } from "react";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import { ScrollArea } from "../ui/scroll-area";
import { cn } from "../../lib/utils";
import { Popover, PopoverPopup, PopoverCreateHandle } from "../ui/popover";
import {
  selectThreadPanelOpen,
  selectThreadPanelVisibility,
  useRightPanelStore,
} from "../../rightPanelStore";
import type { ThreadPanelPresentation } from "../../rightPanelLayout";
import { useChatCanvas } from "./ChatCanvasContext";
import {
  resolveThreadDetailsCardDensity,
  resolveThreadDetailsCardLayout,
  resolveThreadDetailsPopoverLayout,
} from "./threadDetailsCardLayout";
import { observeResize } from "../../lib/observeResize";

// Collapse ownership outlives card mounts; each caller must release its own request.
const collapsedThreads = new Map<
  string,
  {
    count: number;
    previous: ReturnType<typeof selectThreadPanelVisibility>;
  }
>();

/**
 * Temporarily hide both card presentations for this thread, e.g. while a terminal drawer is open.
 * The first owner captures visibility; only the final release restores it, in either release order.
 * Component unmount does not release requests: callers such as PN4 must invoke cleanup themselves.
 * @param threadRef - The environment and thread whose card should be hidden.
 * @returns An idempotent cleanup that releases this request and restores the original visibility
 * once no collapse owners remain. Keep and call it when the caller closes or unmounts.
 */
export function collapseThreadDetailsCard(threadRef: ScopedThreadRef): () => void {
  const key = scopedThreadKey(threadRef);
  const store = useRightPanelStore.getState();
  let ownership = collapsedThreads.get(key);
  if (!ownership) {
    ownership = {
      count: 0,
      previous: selectThreadPanelVisibility(store.threadPanelVisibilityByThreadKey, threadRef),
    };
    collapsedThreads.set(key, ownership);
  }
  ownership.count += 1;
  store.setThreadPanelOpen(threadRef, "inline", false);
  store.setThreadPanelOpen(threadRef, "popover", false);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    ownership.count -= 1;
    if (ownership.count !== 0) return;
    collapsedThreads.delete(key);
    const current = useRightPanelStore.getState();
    current.setThreadPanelOpen(threadRef, "inline", ownership.previous.inlineOpen);
    current.setThreadPanelOpen(threadRef, "popover", ownership.previous.popoverOpen);
  };
}

/** Owns card placement; overlays scroll full content while inline cards fold only to fit. */
export function ThreadDetailsCard({
  threadRef,
  anchor,
  handle,
  onPresentationChange,
  children,
}: {
  threadRef: ScopedThreadRef;
  anchor: RefObject<Element | null>;
  handle: ReturnType<typeof PopoverCreateHandle>;
  onPresentationChange: (presentation: ThreadPanelPresentation) => void;
  children: (density: "full" | "compact" | "essential") => ReactNode;
}) {
  const canvas = useChatCanvas();
  const preferredPlacement = canvas
    ? resolveThreadDetailsCardLayout({
        container: canvas.container,
        lane: canvas.lane,
        frame: null,
        topInset: canvas.detailsCardTopInset,
      })
    : null;
  const placement = canvas
    ? resolveThreadDetailsCardLayout({
        container: canvas.container,
        lane: canvas.lane,
        frame: canvas.layout.frame,
        overlapsDetailsCard: canvas.layout.overlapsDetailsCard,
        topInset: canvas.detailsCardTopInset,
      })
    : null;
  const mode = placement ? "inline" : "popover";
  const topInset = canvas?.detailsCardTopInset ?? 0;
  const overlay = resolveThreadDetailsPopoverLayout(
    canvas?.container ?? { width: 0, height: 0 },
    topInset,
  );
  const inlineOpen = useRightPanelStore((state) =>
    selectThreadPanelOpen(state.threadPanelVisibilityByThreadKey, threadRef, "inline"),
  );
  const popoverOpen = useRightPanelStore((state) =>
    selectThreadPanelOpen(state.threadPanelVisibilityByThreadKey, threadRef, "popover"),
  );
  const [contentElement, setContentElement] = useState<HTMLDivElement | null>(null);
  const measurementKey = `${threadRef.environmentId}:${threadRef.threadId}:${preferredPlacement?.width ?? "popup"}`;
  const [measurements, setMeasurements] = useState({
    key: measurementKey,
    heights: { full: 0, compact: 0 },
    fullContentHeight: 0,
  });
  const contentHeights =
    measurements.key === measurementKey ? measurements.heights : { full: 0, compact: 0 };
  const height = placement?.height ?? overlay.height;
  const density =
    mode === "popover" ? "full" : resolveThreadDetailsCardDensity(height, contentHeights);
  const reportDetailsCard = canvas?.reportDetailsCard;
  const cardLeft = preferredPlacement?.x;
  const cardRight = preferredPlacement
    ? preferredPlacement.x + preferredPlacement.width
    : undefined;
  const cardBottom =
    preferredPlacement && measurements.key === measurementKey && measurements.fullContentHeight > 0
      ? preferredPlacement.y + Math.min(measurements.fullContentHeight, preferredPlacement.height)
      : undefined;
  useLayoutEffect(() => {
    reportDetailsCard?.(
      inlineOpen && cardLeft !== undefined && cardRight !== undefined && cardBottom !== undefined
        ? { left: cardLeft, right: cardRight, bottom: cardBottom }
        : null,
    );
  }, [reportDetailsCard, inlineOpen, cardLeft, cardRight, cardBottom]);
  useLayoutEffect(() => () => reportDetailsCard?.(null), [reportDetailsCard]);
  useLayoutEffect(() => {
    onPresentationChange(mode);
    if (mode === "inline" && popoverOpen)
      useRightPanelStore.getState().setThreadPanelOpen(threadRef, "popover", false);
  }, [mode, onPresentationChange, threadRef, popoverOpen]);
  useLayoutEffect(() => {
    const element = contentElement;
    if (!element || density === "essential") return;
    // Measure the single content tree before the scroll viewport clips it. Retain each
    // observed height so increasing available space restores the detail it can hold.
    const measure = () => {
      const frame = element.closest<HTMLElement>("[data-thread-details-card]");
      const next = element.offsetHeight + (frame ? frame.offsetHeight - frame.clientHeight : 0);
      // Lineage scrolls as it expands. Counting it toward density would hide
      // the section and workspace controls when the user asks to see more rows.
      const lineage = element.querySelector<HTMLElement>("[data-thread-relationships-panel]");
      const fittingHeight = next - (lineage?.offsetHeight ?? 0);
      setMeasurements((current) => {
        const heights = current.key === measurementKey ? current.heights : { full: 0, compact: 0 };
        const fullContentHeight =
          density === "full"
            ? next
            : current.key === measurementKey
              ? current.fullContentHeight
              : 0;
        return current.key === measurementKey &&
          heights[density] === fittingHeight &&
          current.fullContentHeight === fullContentHeight
          ? current
          : {
              key: measurementKey,
              heights: { ...heights, [density]: fittingHeight },
              fullContentHeight,
            };
      });
    };
    measure();
    return observeResize(element, measure);
  }, [contentElement, density, measurementKey]);
  const card = (
    <div
      className="surface-glass isolate grid max-h-full grid-rows-1 overflow-hidden rounded-slab shadow-raise-detail"
      style={{
        maxHeight: canvas ? height : undefined,
        width: mode === "popover" && canvas ? overlay.width : undefined,
      }}
      data-thread-details-card
    >
      <ScrollArea scrollFade className="min-h-0">
        <div ref={setContentElement} className="flex flex-col gap-3 p-4">
          {children(density)}
        </div>
      </ScrollArea>
    </div>
  );
  return (
    <Popover
      handle={handle}
      open={mode === "popover" && popoverOpen}
      onOpenChange={(open, details) => {
        // The find bar sits beside the card, so clicking or focusing it does not
        // dismiss the card. Escape still does.
        const target =
          details.reason === "focus-out"
            ? (details.event as FocusEvent).relatedTarget
            : details.reason === "outside-press"
              ? details.event.target
              : null;
        if (!open && target instanceof Element && target.closest("[data-thread-find-bar]")) {
          details.cancel();
          return;
        }
        useRightPanelStore.getState().setThreadPanelOpen(threadRef, "popover", open);
      }}
    >
      {mode === "popover" && popoverOpen && canvas ? (
        <div
          className="absolute inset-0 z-20 rounded-slab bg-thread-details-scrim"
          aria-hidden="true"
          data-thread-details-scrim
        />
      ) : null}
      {placement ? (
        inlineOpen ? (
          <aside
            aria-label={t.chat.details.threadDetails}
            // Slides down to make room for the find bar, but returns in the same frame
            // the bar closes: a floating preview below moves up at once and would
            // otherwise overlap the card mid-slide.
            className={cn(
              "absolute z-20",
              topInset > 0 &&
                "transition-[top] duration-150 ease-out motion-reduce:transition-none",
            )}
            style={{
              // Anchored to the right edge like the find bar, so both follow a resizing
              // canvas in the same frame instead of waiting for its next measurement.
              right: placement.right,
              top: placement.y,
              width: placement.width,
              maxHeight: height,
            }}
            data-density={density}
            data-thread-details-panel="inline"
          >
            {card}
          </aside>
        ) : null
      ) : (
        <PopoverPopup
          anchor={anchor}
          align="end"
          // The shared panel viewport adds eight pixels around the A5 card.
          alignOffset={overlay.gap - 8}
          collisionAvoidance={{ side: "shift", align: "shift", fallbackAxisSide: "none" }}
          side="bottom"
          sideOffset={topInset + overlay.gap - 8}
          variant="panel"
          padding="none"
        >
          <div
            aria-label={t.chat.details.threadDetails}
            data-density={density}
            data-thread-details-panel="popover"
          >
            {card}
          </div>
        </PopoverPopup>
      )}
    </Popover>
  );
}
