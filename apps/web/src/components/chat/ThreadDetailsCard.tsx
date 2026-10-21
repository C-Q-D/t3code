/** Places and sizes the thread details card; inline drags persist only after release. */
import { t } from "~/i18n";
import {
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { flushSync } from "react-dom";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import { ScrollArea } from "../ui/scroll-area";
import { cn } from "../../lib/utils";
import { isPhysicsEnabled } from "~/lib/motion/preference";
import { project, rubber } from "~/lib/motion/project";
import { useMotionJob } from "~/lib/motion/react";
import { Spring } from "~/lib/motion/spring";
import { DECEL } from "~/lib/motion/tokens";
import { VelocityTracker } from "~/lib/motion/velocity";
import { restoreFloatingOverflow } from "./floatingDragMotion";
import { Popover, PopoverPopup, PopoverCreateHandle } from "../ui/popover";
import {
  selectThreadPanelOpen,
  selectThreadPanelVisibility,
  useRightPanelStore,
} from "../../rightPanelStore";
import type { ThreadPanelPresentation } from "../../rightPanelLayout";
import { useChatCanvas } from "./ChatCanvasContext";
import {
  createThreadDetailsCardPlacement,
  resolveThreadDetailsCardPosition,
  THREAD_DETAILS_CARD_GAP,
  resolveThreadDetailsCardDensity,
  resolveThreadDetailsCardLayout,
  resolveThreadDetailsPopoverLayout,
} from "./threadDetailsCardLayout";
import { observeResize } from "../../lib/observeResize";
import {
  useThreadDetailsCardPlacementStore,
  type ThreadDetailsCardPlacement,
} from "../../threadDetailsCardPlacementStore";

// Keep in sync with the control cursor reset in chat-header.css; these targets cannot start a card drag.
const CARD_CONTROLS =
  'button, a, input, textarea, select, option, label, summary, [role="button"], [role="link"], [role="textbox"], [role="combobox"], [role="checkbox"], [role="radio"], [role="switch"], [role="slider"], [role="spinbutton"], [role="tab"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="option"], [role="treeitem"], [role="scrollbar"], [contenteditable]:not([contenteditable="false"]), [data-slot="scroll-area-scrollbar"]';

/** Local pointer frame; only a completed drag is published to the persisted store. */
interface CardDrag {
  dragOrigin: { left: number; top: number };
  offset: { x: number; y: number };
  tracker: VelocityTracker;
  gliding: boolean;
  threadKey: string;
  containerWidth: number;
  containerHeight: number;
  cardWidth: number;
  cardHeight: number;
  topInset: number;
  placement: ThreadDetailsCardPlacement | null;
  pointerId: number;
  pointerX: number;
  pointerY: number;
  origin: { left: number; top: number };
  latest: { left: number; top: number };
  moved: boolean;
  element: HTMLElement;
  userSelect: string;
  transition: string;
}

/** Restores transient DOM styles and capture on completion, cancellation, or unmount. */
function clearCardDrag(drag: CardDrag) {
  drag.element.style.transform = "";
  drag.element.style.userSelect = drag.userSelect;
  drag.element.style.transition = drag.transition;
  delete drag.element.dataset.dragging;
  if (drag.element.hasPointerCapture(drag.pointerId)) {
    drag.element.releasePointerCapture(drag.pointerId);
  }
}

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
  const threadKey = scopedThreadKey(threadRef);
  const savedPlacement = useThreadDetailsCardPlacementStore((state) => state.placement);
  const dragRef = useRef<CardDrag | null>(null);
  const { start, stop } = useMotionJob();
  const [cardElement, setCardElement] = useState<HTMLElement | null>(null);
  const [cardSize, setCardSize] = useState({ width: 280, height: 0 });
  const preferredPlacement = canvas
    ? resolveThreadDetailsCardLayout({
        container: canvas.container,
        lane: canvas.lane,
        frame: null,
        topInset: savedPlacement ? 0 : canvas.detailsCardTopInset,
      })
    : null;
  const placement = canvas
    ? resolveThreadDetailsCardLayout({
        container: canvas.container,
        lane: canvas.lane,
        frame: savedPlacement ? null : canvas.layout.frame,
        overlapsDetailsCard: !savedPlacement && canvas.layout.overlapsDetailsCard,
        topInset: savedPlacement ? 0 : canvas.detailsCardTopInset,
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
  const floatingPosition =
    savedPlacement && canvas
      ? resolveThreadDetailsCardPosition(savedPlacement, canvas.container, cardSize)
      : null;
  const height =
    floatingPosition && canvas && mode === "inline"
      ? Math.max(0, canvas.container.height - floatingPosition.top - THREAD_DETAILS_CARD_GAP)
      : (placement?.height ?? overlay.height);
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
      !savedPlacement &&
        inlineOpen &&
        cardLeft !== undefined &&
        cardRight !== undefined &&
        cardBottom !== undefined
        ? { left: cardLeft, right: cardRight, bottom: cardBottom }
        : null,
    );
  }, [reportDetailsCard, inlineOpen, cardLeft, cardRight, cardBottom, savedPlacement]);
  useLayoutEffect(() => {
    if (!cardElement) return;
    const measure = () => {
      const { width, height } = cardElement.getBoundingClientRect();
      setCardSize((current) =>
        current.width === width && current.height === height ? current : { width, height },
      );
    };
    measure();
    return observeResize(cardElement, measure);
  }, [cardElement]);
  // A transform is relative to the layout at pointerdown. Cancel before paint when
  // that basis changes, rather than applying the old delta to a newly fitted card.
  useLayoutEffect(() => {
    const drag = dragRef.current;
    if (!drag) return;
    if (
      mode === "inline" &&
      drag.containerWidth === canvas?.container.width &&
      drag.containerHeight === canvas?.container.height &&
      drag.cardWidth === cardSize.width &&
      drag.cardHeight === cardSize.height &&
      drag.topInset === topInset &&
      drag.placement === savedPlacement &&
      drag.origin.left === (floatingPosition?.left ?? placement?.x) &&
      drag.origin.top === (floatingPosition?.top ?? placement?.y)
    )
      return;
    dragRef.current = null;
    stop();
    if (drag.gliding && canvas) {
      const position = resolveThreadDetailsCardPosition(
        { side: "left", inset: drag.latest.left, top: drag.latest.top },
        canvas.container,
        cardSize,
      );
      useThreadDetailsCardPlacementStore
        .getState()
        .place(createThreadDetailsCardPlacement(position, cardSize.width, canvas.container.width));
    }
    clearCardDrag(drag);
  });
  useLayoutEffect(
    () => () => {
      const drag = dragRef.current;
      if (!drag || drag.element !== cardElement || drag.threadKey !== threadKey) return;
      dragRef.current = null;
      stop();
      clearCardDrag(drag);
    },
    [cardElement, threadKey, stop],
  );
  useLayoutEffect(() => () => reportDetailsCard?.(null), [reportDetailsCard]);
  useLayoutEffect(() => {
    onPresentationChange(mode);
    if (mode === "inline" && popoverOpen)
      useRightPanelStore.getState().setThreadPanelOpen(threadRef, "popover", false);
  }, [mode, onPresentationChange, threadRef, popoverOpen]);
  useLayoutEffect(() => {
    const element = contentElement;
    if (!element || density === "essential") return;
    const measure = () => {
      const frame = element.closest<HTMLElement>("[data-thread-details-card]");
      const next = element.offsetHeight + (frame ? frame.offsetHeight - frame.clientHeight : 0);
      // PR lists and lineage scroll as they expand. Counting them toward density would hide
      // the section and workspace controls when the user asks to see more rows.
      const lists = element.querySelectorAll<HTMLElement>(
        "[data-thread-relationships-panel], [data-thread-details-pr-list]",
      );
      const fittingHeight =
        next - Array.from(lists).reduce((sum, list) => sum + list.offsetHeight, 0);
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
  /** Starts capture only on blank inline content; controls retain their native gestures. */
  const beginDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (
      event.button !== 0 ||
      event.pointerType !== "mouse" ||
      !event.isPrimary ||
      (dragRef.current && !dragRef.current.gliding) ||
      !placement ||
      !canvas
    )
      return;
    if (event.target instanceof Element && event.target.closest(CARD_CONTROLS)) return;
    stop();
    const interrupted = dragRef.current;
    if (interrupted) {
      dragRef.current = null;
      flushSync(() =>
        useThreadDetailsCardPlacementStore
          .getState()
          .place(
            createThreadDetailsCardPlacement(
              interrupted.latest,
              cardSize.width,
              canvas.container.width,
            ),
          ),
      );
      clearCardDrag(interrupted);
    }
    const element = event.currentTarget;
    const origin = interrupted?.latest ??
      floatingPosition ?? { left: placement.x, top: placement.y };
    const offset = interrupted?.offset ?? { x: 0, y: 0 };
    const tracker = new VelocityTracker();
    tracker.addPointerEvent(event);
    dragRef.current = {
      offset,
      dragOrigin: {
        left: origin.left + restoreFloatingOverflow(offset.x, canvas.container.width),
        top: origin.top + restoreFloatingOverflow(offset.y, canvas.container.height),
      },
      tracker,
      gliding: false,
      threadKey,
      containerWidth: canvas.container.width,
      containerHeight: canvas.container.height,
      cardWidth: cardSize.width,
      cardHeight: cardSize.height,
      topInset,
      placement: useThreadDetailsCardPlacementStore.getState().placement,
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      origin,
      latest: origin,
      moved: interrupted !== null,
      element,
      userSelect: element.style.userSelect,
      transition: element.style.transition,
    };
    element.setPointerCapture(event.pointerId);
    element.style.userSelect = "none";
    element.style.transition = "none";
    if (interrupted) element.style.transform = `translate(${offset.x}px, ${offset.y}px)`;
    event.preventDefault();
  };
  /** Updates only the DOM transform; bounded placement and visual elastic overflow stay separate. */
  const moveDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !canvas) return;
    if (drag.gliding) return;
    drag.tracker.addPointerEvent(event);
    const dx = event.clientX - drag.pointerX;
    const dy = event.clientY - drag.pointerY;
    if (!drag.moved && Math.hypot(dx, dy) <= 3) return;
    drag.moved = true;
    const raw = { left: drag.dragOrigin.left + dx, top: drag.dragOrigin.top + dy };
    drag.latest = resolveThreadDetailsCardPosition(
      { side: "left", inset: raw.left, top: raw.top },
      canvas.container,
      drag.element.getBoundingClientRect(),
    );
    drag.offset = isPhysicsEnabled()
      ? {
          x: rubber(raw.left - drag.latest.left, canvas.container.width),
          y: rubber(raw.top - drag.latest.top, canvas.container.height),
        }
      : { x: 0, y: 0 };
    drag.element.dataset.dragging = "true";
    drag.element.style.transform = `translate(${drag.latest.left - drag.origin.left + drag.offset.x}px, ${drag.latest.top - drag.origin.top + drag.offset.y}px)`;
    event.preventDefault();
  };
  /** Commits before removing the transform so the release cannot paint the old position. */
  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.gliding) return;
    if (event.type === "pointerup") moveDrag(event);
    const velocity = drag.tracker.velocity(event.timeStamp);
    if (
      event.type === "pointerup" &&
      drag.moved &&
      canvas &&
      isPhysicsEnabled() &&
      (Math.hypot(velocity.x, velocity.y) > 50 || Math.hypot(drag.offset.x, drag.offset.y) > 0)
    ) {
      drag.gliding = true;
      if (drag.element.hasPointerCapture(drag.pointerId))
        drag.element.releasePointerCapture(drag.pointerId);
      const origin = {
        left: drag.latest.left + restoreFloatingOverflow(drag.offset.x, canvas.container.width),
        top: drag.latest.top + restoreFloatingOverflow(drag.offset.y, canvas.container.height),
      };
      let elapsed = 0;
      let rebound: { x: Spring; y: Spring } | null =
        Math.hypot(velocity.x, velocity.y) > 50
          ? null
          : {
              x: new Spring({ value: drag.offset.x, target: 0 }),
              y: new Spring({ value: drag.offset.y, target: 0 }),
            };
      // Layout stays fixed until settling; only the bounded position is persisted.
      const finish = () => {
        dragRef.current = null;
        flushSync(() =>
          useThreadDetailsCardPlacementStore
            .getState()
            .place(
              createThreadDetailsCardPlacement(drag.latest, drag.cardWidth, drag.containerWidth),
            ),
        );
        clearCardDrag(drag);
        return false;
      };
      start((dt) => {
        if (!isPhysicsEnabled()) return finish();
        if (rebound) {
          const movingX = rebound.x.step(dt);
          const movingY = rebound.y.step(dt);
          drag.offset = { x: rebound.x.value, y: rebound.y.value };
          drag.element.style.transform = `translate(${drag.latest.left - drag.origin.left + rebound.x.value}px, ${drag.latest.top - drag.origin.top + rebound.y.value}px)`;
          return movingX || movingY || finish();
        }
        elapsed = Math.min(0.3, elapsed + dt);
        const fraction = (1 - DECEL.fast ** (elapsed * 1000)) / (1 - DECEL.fast ** 300);
        const requested = {
          left: origin.left + project(velocity.x, DECEL.fast) * fraction,
          top: origin.top + project(velocity.y, DECEL.fast) * fraction,
        };
        drag.latest = resolveThreadDetailsCardPosition(
          { side: "left", inset: requested.left, top: requested.top },
          canvas.container,
          { width: drag.cardWidth, height: drag.cardHeight },
        );
        const x = rubber(requested.left - drag.latest.left, drag.containerWidth);
        const y = rubber(requested.top - drag.latest.top, drag.containerHeight);
        drag.offset = { x, y };
        drag.element.style.transform = `translate(${drag.latest.left - drag.origin.left + x}px, ${drag.latest.top - drag.origin.top + y}px)`;
        if (elapsed >= 0.3)
          rebound = {
            x: new Spring({ value: x, target: 0 }),
            y: new Spring({ value: y, target: 0 }),
          };
        return true;
      });
      return;
    }
    dragRef.current = null;
    if (event.type === "pointerup" && drag.moved && canvas) {
      const next = createThreadDetailsCardPlacement(
        drag.latest,
        drag.element.getBoundingClientRect().width,
        canvas.container.width,
      );
      flushSync(() => useThreadDetailsCardPlacementStore.getState().place(next));
    }
    clearCardDrag(drag);
  };
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
            ref={setCardElement}
            onPointerDown={beginDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onLostPointerCapture={endDrag}
            onDoubleClick={(event) => {
              if (event.target instanceof Element && event.target.closest(CARD_CONTROLS)) return;
              stop();
              const drag = dragRef.current;
              dragRef.current = null;
              if (drag) clearCardDrag(drag);
              useThreadDetailsCardPlacementStore.getState().reset();
            }}
            aria-label={t.chat.details.threadDetails}
            // Slides down to make room for the find bar, but returns in the same frame
            // the bar closes: a floating preview below moves up at once and would
            // otherwise overlap the card mid-slide.
            className={cn(
              "absolute z-20",
              !savedPlacement &&
                topInset > 0 &&
                "transition-[top] duration-150 ease-out motion-reduce:transition-none",
            )}
            style={{
              // The default follows the find bar's right anchor during resize;
              // a saved drag instead uses the clamped canvas-relative position.
              left: floatingPosition?.left,
              right: floatingPosition ? undefined : placement.right,
              top: floatingPosition?.top ?? placement.y,
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
          layer="thread-details"
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
