/** Transfers sortable transforms from dnd-kit to release springs, then back on the next drag. */
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import {
  createContext,
  useCallback,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  type RefObject,
} from "react";
import { clearOffset, flip } from "~/lib/motion/elementOffset";
import { isPhysicsEnabled, onPhysicsChange } from "~/lib/motion/preference";
import { tokenFor, type Point } from "~/lib/motion/project";
import { TOKENS } from "~/lib/motion/tokens";
import { VelocityTracker } from "~/lib/motion/velocity";

/** True only for pointer sorting owned by physics; keyboard sorting retains dnd-kit animation. */
export const SortableFlingContext = createContext(false);

/**
 * Capture release geometry before committing order, then animate in the following layout effect.
 * @param options.containerRef Container whose sortable nodes carry data-sortable-fling-id.
 * @param options.overlayRef Optional visible drag overlay, measured instead of the active placeholder.
 * @returns DndContext handlers and the context value for disabling dnd-kit's layout animation.
 * Call onDragEnd before updating order. Cancellation and unmount release all owned motion.
 */
export function useSortableFling({
  containerRef,
  overlayRef,
}: {
  containerRef: RefObject<HTMLElement | null>;
  overlayRef?: RefObject<HTMLElement | null>;
}) {
  const [physicsSorting, setPhysicsSorting] = useState(false);
  const [, renderRelease] = useReducer((value: number) => value + 1, 0);
  const tracker = useRef(new VelocityTracker());
  const releaseTime = useRef<number | undefined>(undefined);
  const listening = useRef<(() => void) | null>(null);
  const owned = useRef(new Set<HTMLElement>());
  const pending = useRef<{
    activeId: string;
    velocity: Point;
    rects: Map<string, DOMRect>;
  } | null>(null);

  const stopListening = useCallback(() => {
    listening.current?.();
    listening.current = null;
  }, []);
  const clearMotion = useCallback(() => {
    for (const element of owned.current) clearOffset(element);
    owned.current.clear();
    pending.current = null;
  }, []);
  const onDragCancel = useCallback(() => {
    stopListening();
    clearMotion();
  }, [clearMotion, stopListening]);

  const onDragStart = useCallback(
    (event: DragStartEvent) => {
      onDragCancel();
      // A new sensor starts from clean layout coordinates, not the previous spring offset.
      const pointer = event.activatorEvent.type === "pointerdown";
      const enabled = pointer && isPhysicsEnabled();
      setPhysicsSorting(enabled);
      if (!enabled || !containerRef.current) return;
      const document = containerRef.current.ownerDocument;
      // Only the activating pointer owns this gesture's momentum and release clock.
      const pointerId = (event.activatorEvent as PointerEvent).pointerId;
      const sample = (event: PointerEvent) => {
        if (event.pointerId !== pointerId) return;
        tracker.current.addPointerEvent(event);
      };
      tracker.current.reset();
      releaseTime.current = undefined;
      if ("clientX" in event.activatorEvent && "clientY" in event.activatorEvent) {
        tracker.current.addPointerEvent(event.activatorEvent as PointerEvent);
      }
      // dnd-kit omits the release event; window capture samples it before the sensor ends the drag.
      const release = (event: PointerEvent) => {
        if (event.pointerId !== pointerId) return;
        sample(event);
        releaseTime.current = event.timeStamp;
      };
      document.addEventListener("pointermove", sample);
      document.defaultView?.addEventListener("pointerup", release, true);
      const unsubscribe = onPhysicsChange((enabled) => {
        if (!enabled) onDragCancel();
      });
      listening.current = () => {
        document.removeEventListener("pointermove", sample);
        document.defaultView?.removeEventListener("pointerup", release, true);
        unsubscribe();
      };
    },
    [containerRef, onDragCancel],
  );

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!listening.current || !isPhysicsEnabled()) return;
      const velocity = tracker.current.velocity(releaseTime.current);
      stopListening();
      const rects = new Map<string, DOMRect>();
      for (const element of containerRef.current?.querySelectorAll<HTMLElement>(
        "[data-sortable-fling-id]",
      ) ?? []) {
        const id = element.dataset.sortableFlingId!;
        const source = id === String(event.active.id) ? (overlayRef?.current ?? element) : element;
        rects.set(id, source.getBoundingClientRect());
      }
      pending.current = { activeId: String(event.active.id), velocity, rects };
      renderRelease();
    },
    [containerRef, overlayRef, stopListening],
  );

  useLayoutEffect(() => {
    const release = pending.current;
    pending.current = null;
    if (!release || !isPhysicsEnabled()) return;
    for (const element of containerRef.current?.querySelectorAll<HTMLElement>(
      "[data-sortable-fling-id]",
    ) ?? []) {
      const id = element.dataset.sortableFlingId!;
      const from = release.rects.get(id);
      if (!from) continue;
      const active = id === release.activeId;
      flip(
        element,
        from,
        active ? tokenFor(Math.hypot(release.velocity.x, release.velocity.y)) : TOKENS.settle,
        active ? release.velocity : undefined,
      );
      owned.current.add(element);
    }
  });
  useLayoutEffect(() => onDragCancel, [onDragCancel]);

  return { physicsSorting, onDragStart, onDragEnd, onDragCancel };
}
