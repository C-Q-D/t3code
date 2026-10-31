/** Measures chat obstacles and shares one layout policy with floating preview gestures. */
import { useLayoutEffect, useRef, useState, type ComponentProps, type CSSProperties } from "react";
import { useStore } from "zustand";
import { ChatCanvasContext } from "./ChatCanvasContext";
import type { ChatCanvasPreview } from "./chatCanvasLayout";
import { resolveChatCanvasModel, type ChatCanvasStore } from "./canvasStore";
import { selectThreadPanelOpen, useRightPanelStore } from "../../rightPanelStore";
import { observeResize } from "../../lib/observeResize";
import type { ScopedThreadRef } from "@t3tools/contracts";

/** Shares measured obstacles with preview gestures so dragging and resting layout use one constraint model.
 * @param composerOverlayElement Input overlay to measure, or null before mounting.
 * @param detailsCardTopInset Top clearance in CSS pixels; zero by default.
 * @param children Timeline and floating surfaces that consume the canvas context.
 * @param props Remaining div attributes; canvas owns its ref, style and class.
 * @returns Measured container and layout context; resize observers are removed on unmount. */
export function ChatCanvas({
  store,
  threadRef,
  preview,
  composerOverlayElement,
  detailsCardTopInset = 0,
  children,
  ...props
}: Omit<ComponentProps<"div">, "className" | "style" | "ref"> & {
  store: ChatCanvasStore;
  /** The thread whose details card sits on the canvas; other threads' measurements are stale. */
  threadRef: ScopedThreadRef | null;
  /** The thread's mini player while it renders on this canvas. */
  preview: ChatCanvasPreview | null;
  composerOverlayElement: HTMLElement | null;
  detailsCardTopInset?: number;
}) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const widthProbeRef = useRef<HTMLDivElement | null>(null);
  const [timelineElement, registerTimeline] = useState<HTMLElement | null>(null);
  const measurements = useStore(store, (state) => state.measurements);
  const detailsCardMeasurement = useStore(store, (state) => state.detailsCardMeasurement);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- observes canvas, find bar and timeline resizes and writes the measurements to the canvas store
  useLayoutEffect(() => {
    const element = elementRef.current;
    const probe = widthProbeRef.current;
    if (!element || !probe) return;
    const findBar =
      detailsCardTopInset > 0 ? element.querySelector<HTMLElement>("[data-thread-find-bar]") : null;
    const measure = () => {
      const canvasBounds = element.getBoundingClientRect();
      const findBarBounds = findBar?.getBoundingClientRect();
      const styles = getComputedStyle(probe);
      store.getState().setMeasurements({
        findBar:
          detailsCardTopInset > 0
            ? {
                left: findBarBounds ? findBarBounds.left - canvasBounds.left : 0,
                right: findBarBounds ? findBarBounds.right - canvasBounds.left : 0,
                bottom: findBarBounds ? findBarBounds.bottom - canvasBounds.top : 0,
              }
            : null,
        width: element.clientWidth,
        height: element.clientHeight,
        padding: Number.parseFloat(styles.paddingLeft),
        maxChatWidth: Number.parseFloat(styles.width),
        minChatWidth: Number.parseFloat(styles.minWidth),
        composerHeight: composerOverlayElement?.getBoundingClientRect().height ?? 0,
        timelineGutter: timelineElement
          ? (timelineElement.offsetWidth - timelineElement.clientWidth) / 2
          : 0,
      });
    };
    measure();
    const observed: Element[] = [element, probe];
    if (findBar) observed.push(findBar);
    if (composerOverlayElement) observed.push(composerOverlayElement);
    if (timelineElement) observed.push(timelineElement);
    return observeResize(observed, measure);
  }, [store, composerOverlayElement, timelineElement, detailsCardTopInset]);
  const detailsCardInlineOpen = useRightPanelStore((state) =>
    threadRef === null
      ? false
      : selectThreadPanelOpen(state.threadPanelVisibilityByThreadKey, threadRef, "inline"),
  );
  const [reportedPreview, reportPreview] = useState<ChatCanvasPreview | null>(null);
  const model = resolveChatCanvasModel({
    measurements,
    detailsCardMeasurement,
    threadRef,
    preview: preview ?? reportedPreview,
    detailsCardInlineOpen,
  });
  const context = {
    resolvePreviewFrame: (candidate: ChatCanvasPreview) =>
      resolveChatCanvasModel({
        measurements,
        detailsCardMeasurement,
        threadRef,
        preview: candidate,
        detailsCardInlineOpen,
      }).layout.frame,
    reportPreview,
    clearPreview: (key: string) =>
      reportPreview((current) => (current?.key === key ? null : current)),
    container: model.container,
    lane: model.lane,
    layout: model.layout,
    previewKey: preview?.key ?? null,
    registerTimeline,
    measureDetailsCard: store.getState().measureDetailsCard,
    detailsCardTopInset: model.detailsCardTopInset,
    preferredDetailsCard: model.preferredDetailsCard,
    detailsCardPlacement: model.detailsCardPlacement,
  };
  const { layout } = context;
  return (
    <ChatCanvasContext value={context}>
      <div
        {...props}
        ref={elementRef}
        data-chat-canvas
        data-preview-overlaps-chat={layout.overlapsChat || undefined}
        className="relative flex min-h-0 min-w-0 flex-1 flex-col"
        style={
          {
            "--chat-timeline-gutter": `${measurements.timelineGutter}px`,
            "--chat-lane-inset-start": `${layout.chat.insetStart}px`,
            "--chat-lane-inset-end": `${layout.chat.insetEnd}px`,
          } as CSSProperties
        }
      >
        <div
          ref={widthProbeRef}
          aria-hidden
          className="pointer-events-none invisible absolute h-0 w-(--chat-content-max-width) min-w-[40rem] box-content ps-3 sm:ps-12"
        />
        {children}
      </div>
    </ChatCanvasContext>
  );
}
