/** Owns image zoom and scrolling; transient physics never change the saved image or zoom limits. */
import { t } from "~/i18n";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type Ref,
} from "react";
import { flushSync } from "react-dom";
import { isPhysicsEnabled } from "~/lib/motion/preference";
import { project, rubber } from "~/lib/motion/project";
import { useMotionJob } from "~/lib/motion/react";
import { Spring } from "~/lib/motion/spring";
import { DECEL } from "~/lib/motion/tokens";
import { VelocityTracker } from "~/lib/motion/velocity";

const MAX_ZOOM = 8;

/** Keyboard panning shared with the gallery; false lets gallery navigation handle the key. */
export interface ZoomableImageHandle {
  pan: (key: string) => boolean;
}

/** Zooms around the pointer and keeps the whole image accessible by dragging or scrolling. */
export function ZoomableImage({
  src,
  name,
  onError,
  ref,
}: {
  src: string;
  name: string;
  onError: () => void;
  ref?: Ref<ZoomableImageHandle>;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const { start: startPan, stop: stopPan } = useMotionJob();
  const { start: startZoom, stop: stopZoom } = useMotionJob();
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visualScale = useRef(1);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [windowSize, setWindowSize] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const anchorRef = useRef<{
    x: number;
    y: number;
    clientX: number;
    clientY: number;
    from: DOMRect | null;
    overshoot: number;
  } | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    left: number;
    top: number;
    tracker: VelocityTracker;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const maxHeight = Math.max(1, Math.min(windowSize.height * 0.86, windowSize.height - 160));
  const fit = Math.min(
    1,
    (windowSize.width * 0.92 - (windowSize.width >= 640 ? 96 : 0)) / (naturalSize.width || 1),
    maxHeight / (naturalSize.height || 1),
  );
  const width = naturalSize.width * fit * zoom;
  const height = naturalSize.height * fit * zoom;

  /** Cancel transient zoom work before a new gesture; DOM cleanup is owned by the next writer. */
  const cancelZoom = useCallback(() => {
    stopZoom();
    if (wheelTimer.current !== null) clearTimeout(wheelTimer.current);
    wheelTimer.current = null;
  }, [stopZoom]);

  /** Return a dimensionless scale and CSS-pixel offsets to layout without changing the final scroll anchor. */
  const settleZoom = useCallback(
    (scale: number, x = 0, y = 0) => {
      const image = imageRef.current;
      if (!image) return;
      if (!isPhysicsEnabled()) {
        image.style.transform = "";
        image.style.transformOrigin = "";
        visualScale.current = 1;
        return;
      }
      const spring = new Spring({ value: 0, target: 1, precision: 0.001 });
      visualScale.current = scale;
      image.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
      startZoom((dt) => {
        const moving = isPhysicsEnabled() && spring.step(dt);
        const remaining = moving ? 1 - spring.value : 0;
        visualScale.current = 1 + (scale - 1) * remaining;
        image.style.transform = moving
          ? `translate(${x * remaining}px, ${y * remaining}px) scale(${visualScale.current})`
          : "";
        if (!moving) image.style.transformOrigin = "";
        return moving;
      });
    },
    [startZoom],
  );

  /** Compress relative zoom overflow around image-local CSS-pixel coordinates; settle after 150 ms of wheel rest. */
  const showZoomOverflow = useCallback(
    (overshoot: number, x: number, y: number) => {
      const image = imageRef.current;
      if (!image) return;
      cancelZoom();
      const scale = 1 + rubber(overshoot, 0.5);
      visualScale.current = scale;
      image.style.transformOrigin = `${x}px ${y}px`;
      image.style.transform = `scale(${scale})`;
      wheelTimer.current = setTimeout(() => {
        wheelTimer.current = null;
        settleZoom(scale);
      }, 150);
    },
    [cancelZoom, settleZoom],
  );

  useEffect(() => () => cancelZoom(), [cancelZoom]);

  useImperativeHandle(
    ref,
    () => ({
      pan(key) {
        const viewport = viewportRef.current;
        if (!viewport || zoomRef.current <= 1) return false;
        stopPan();
        // A vertical scrollbar alone must not swallow gallery navigation.
        if (
          (key === "ArrowLeft" || key === "ArrowRight") &&
          viewport.scrollWidth <= viewport.offsetWidth
        )
          return false;
        switch (key) {
          case "ArrowLeft":
            viewport.scrollLeft -= 40;
            break;
          case "ArrowRight":
            viewport.scrollLeft += 40;
            break;
          case "ArrowUp":
            viewport.scrollTop -= 40;
            break;
          case "ArrowDown":
            viewport.scrollTop += 40;
            break;
          default:
            return false;
        }
        return true;
      },
    }),
    [stopPan],
  );

  /** Update bounded layout zoom around a client point (viewport center by default); wheel input skips FLIP. */
  const changeZoom = useCallback(
    (next: number, point?: { x: number; y: number }, animate = true) => {
      const viewport = viewportRef.current;
      const image = imageRef.current;
      const previous = zoomRef.current;
      const clamped = Math.min(MAX_ZOOM, Math.max(1, next));
      if (!viewport || !image) return;
      const bounds = viewport.getBoundingClientRect();
      const x = point ? point.x - bounds.left : viewport.clientWidth / 2;
      const y = point ? point.y - bounds.top : viewport.clientHeight / 2;
      const physics = isPhysicsEnabled();
      const overshoot = physics && !animate ? (next - clamped) / clamped : 0;
      const visualBounds = physics ? image.getBoundingClientRect() : null;
      const from = animate ? visualBounds : null;
      stopPan();
      cancelZoom();
      image.style.transform = "";
      image.style.transformOrigin = "";
      visualScale.current = 1;
      if (previous === clamped) {
        if (overshoot) showZoomOverflow(overshoot, viewport.scrollLeft + x, viewport.scrollTop + y);
        return;
      }
      anchorRef.current = {
        x:
          visualBounds && visualBounds.width > 0
            ? ((bounds.left + x - visualBounds.left) / visualBounds.width) *
              ((Number.parseFloat(image.style.width) || image.offsetWidth) / previous)
            : (viewport.scrollLeft + x) / previous,
        y:
          visualBounds && visualBounds.height > 0
            ? ((bounds.top + y - visualBounds.top) / visualBounds.height) *
              ((Number.parseFloat(image.style.height) || image.offsetHeight) / previous)
            : (viewport.scrollTop + y) / previous,
        clientX: bounds.left + x,
        clientY: bounds.top + y,
        from,
        overshoot,
      };
      zoomRef.current = clamped;
      setZoom(clamped);
    },
    [cancelZoom, showZoomOverflow, stopPan],
  );

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const anchor = anchorRef.current;
    if (!viewport || !anchor) return;
    const bounds = viewport.getBoundingClientRect();
    viewport.scrollLeft = anchor.x * zoom - (anchor.clientX - bounds.left);
    viewport.scrollTop = anchor.y * zoom - (anchor.clientY - bounds.top);
    anchorRef.current = null;
    const image = imageRef.current;
    if (!image || !isPhysicsEnabled()) return;
    const to = image.getBoundingClientRect();
    const x = anchor.clientX - to.left;
    const y = anchor.clientY - to.top;
    if (anchor.overshoot) {
      showZoomOverflow(anchor.overshoot, x, y);
    } else if (anchor.from && to.width > 0) {
      const scale = anchor.from.width / to.width;
      image.style.transformOrigin = `${x}px ${y}px`;
      // Scroll clamping can move the anchor at a boundary; FLIP also compensates that translation.
      settleZoom(
        scale,
        anchor.from.left - to.left - x * (1 - scale),
        anchor.from.top - to.top - y * (1 - scale),
      );
    }
  }, [zoom, settleZoom, showZoomOverflow]);

  useEffect(() => {
    const resize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
      changeZoom(1);
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [changeZoom]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const wheel = (event: WheelEvent) => {
      if (event.deltaY === 0) return;
      event.preventDefault();
      const delta =
        event.deltaY *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1);
      changeZoom(
        zoomRef.current * Math.exp(-delta * (event.ctrlKey ? 0.01 : 0.002)),
        {
          x: event.clientX,
          y: event.clientY,
        },
        false,
      );
    };
    viewport.addEventListener("wheel", wheel, { passive: false });
    return () => viewport.removeEventListener("wheel", wheel);
  }, [changeZoom]);

  return (
    <div className="min-w-0">
      <div
        ref={viewportRef}
        role="region"
        aria-label={t.chat.media.zoomable(name)}
        aria-description={t.chat.media.clickToZoomInOrReturnTo}
        tabIndex={0}
        className="max-w-[var(--media-width)] overflow-auto overscroll-contain rounded-lg bg-background shadow-2xl ring-1 ring-border/70 outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring"
        style={{
          width: width || undefined,
          height: height || undefined,
          maxHeight,
          cursor: zoom > 1 ? (dragging ? "grabbing" : "grab") : "zoom-in",
        }}
        onClick={(event) => {
          // Pointer capture also produces a click after dragging; leave the image zoomed.
          if (suppressClickRef.current || event.detail > 1) return;
          changeZoom(zoomRef.current > 1 ? 1 : 2, { x: event.clientX, y: event.clientY });
        }}
        onKeyDown={(event) => {
          if (event.ctrlKey || event.metaKey || event.altKey) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (!event.repeat) changeZoom(zoomRef.current > 1 ? 1 : 2);
          } else if (event.key === "+" || event.key === "=") {
            event.preventDefault();
            changeZoom(zoomRef.current * 1.5);
          } else if (event.key === "-") {
            event.preventDefault();
            changeZoom(zoomRef.current / 1.5);
          } else if (event.key === "0") {
            event.preventDefault();
            changeZoom(1);
          }
        }}
        onPointerDown={(event) => {
          if (dragRef.current) return;
          stopPan();
          if (visualScale.current !== 1) {
            // Commit the visible zoom before capturing scroll, so the first drag delta cannot jump.
            flushSync(() =>
              changeZoom(
                Math.min(MAX_ZOOM, Math.max(1, zoomRef.current * visualScale.current)),
                { x: event.clientX, y: event.clientY },
                false,
              ),
            );
          }
          suppressClickRef.current = false;
          if (event.pointerType !== "mouse" || event.button !== 0 || zoomRef.current <= 1) return;
          const viewport = event.currentTarget;
          const bounds = viewport.getBoundingClientRect();
          if (
            event.clientX - bounds.left >= viewport.clientWidth ||
            event.clientY - bounds.top >= viewport.clientHeight
          )
            return;
          const tracker = new VelocityTracker();
          tracker.addPointerEvent(event);
          dragRef.current = {
            tracker,
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            left: viewport.scrollLeft,
            top: viewport.scrollTop,
          };
          viewport.setPointerCapture(event.pointerId);
          setDragging(true);
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          drag.tracker.addPointerEvent(event);
          if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 4) {
            suppressClickRef.current = true;
          }
          event.currentTarget.scrollLeft = drag.left - (event.clientX - drag.x);
          event.currentTarget.scrollTop = drag.top - (event.clientY - drag.y);
        }}
        onPointerUp={(event) => {
          const drag = dragRef.current;
          if (drag?.pointerId !== event.pointerId) return;
          const viewport = event.currentTarget;
          drag.tracker.addPointerEvent(event);
          const velocity = drag.tracker.velocity(event.timeStamp);
          dragRef.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          setDragging(false);
          if (
            !isPhysicsEnabled() ||
            !suppressClickRef.current ||
            Math.hypot(velocity.x, velocity.y) <= 50
          )
            return;
          let vx = -velocity.x;
          let vy = -velocity.y;
          startPan((dt) => {
            if (!isPhysicsEnabled()) return false;
            const decay = DECEL.normal ** (dt * 1000);
            const maxX = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
            const maxY = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
            const x = viewport.scrollLeft + project(vx) * (1 - decay);
            const y = viewport.scrollTop + project(vy) * (1 - decay);
            viewport.scrollLeft = Math.min(maxX, Math.max(0, x));
            viewport.scrollTop = Math.min(maxY, Math.max(0, y));
            // A wall consumes momentum on its axis; the other axis may continue sliding.
            vx = x <= 0 || x >= maxX ? 0 : vx * decay;
            vy = y <= 0 || y >= maxY ? 0 : vy * decay;
            return Math.hypot(vx, vy) > 5;
          });
        }}
        onLostPointerCapture={(event) => {
          if (dragRef.current?.pointerId !== event.pointerId) return;
          dragRef.current = null;
          setDragging(false);
        }}
      >
        <img
          ref={imageRef}
          src={src}
          alt={name}
          draggable={false}
          className="block max-w-none select-none"
          style={
            naturalSize.width ? { width, height } : { maxWidth: "var(--media-width)", maxHeight }
          }
          onLoad={(event) => {
            setNaturalSize({
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight,
            });
          }}
          onError={onError}
        />
      </div>
      <span className="sr-only" aria-live="polite">
        {t.chat.media.zoomPercent(Math.round(zoom * 100))}
      </span>
    </div>
  );
}
