/** Thread drag preview and drop delivery; physics reserves a composer until its token lands. */
import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { type RefObject, useEffect, useEffectEvent, useSyncExternalStore } from "react";
import { isPhysicsEnabled } from "../../lib/motion/preference";
import {
  findComposerThrowTarget,
  launchComposerThrow,
  reserveComposerThrowTarget,
} from "./ComposerThrowToken";

/**
 * Dragging a sidebar thread past the list edge turns the sort gesture into a context drop.
 * The composer form marks itself as the target; the sidebar hit-tests the pointer against it
 * and hands over the dragged thread refs through a DOM event, so neither side imports the
 * other. Ghost position lives here rather than in Sidebar state so pointer moves only
 * re-render the ghost.
 */

export const THREAD_CONTEXT_DROP_EVENT = "t3-thread-context-drop";

export function useThreadContextDrop(
  targetRef: RefObject<EventTarget | null>,
  environmentId: EnvironmentId,
  targetKey: string,
  onDrop: (refs: ReadonlyArray<ScopedThreadRef>, isActive: () => boolean) => void,
) {
  const handleDrop = useEffectEvent(onDrop);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- subscribes the target element to thread-context drop events and marks old drops inactive
  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;
    let active = true;
    const listener = (event: Event) =>
      handleDrop((event as CustomEvent<ReadonlyArray<ScopedThreadRef>>).detail, () => active);
    target.addEventListener(THREAD_CONTEXT_DROP_EVENT, listener);
    return () => {
      active = false;
      target.removeEventListener(THREAD_CONTEXT_DROP_EVENT, listener);
    };
  }, [
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- A new environment or target ends the previous listener, so isActive reports false to drops still in flight for it.
    environmentId,
    targetKey,
    targetRef,
  ]);
}

const DROP_TARGET_ATTRIBUTE = "data-thread-context-drop";

/** Pointer-local preview in viewport CSS pixels; count includes the named thread. */
export interface ThreadContextDragGhost {
  readonly x: number;
  readonly y: number;
  readonly title: string;
  readonly count: number;
}

let ghost: ThreadContextDragGhost | null = null;
const listeners = new Set<() => void>();

/** Publish a changed preview, or null at gesture end, without rerendering the sidebar list. */
function setGhost(next: ThreadContextDragGhost | null) {
  if (ghost === next) return;
  ghost = next;
  for (const listener of listeners) listener();
}

/** Subscribe to the active pointer preview; flights have their own lifetime after this becomes null. */
export function useThreadContextDragGhost(): ThreadContextDragGhost | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => ghost,
    () => null,
  );
}

let overTarget: HTMLElement | null = null;
let releaseHover: (() => void) | null = null;
let origin: { x: number; y: number } | null = null;

/** Direct viewport hit test for pointer hover and legacy drops; absent composers return null. */
function findDropTarget(point: { x: number; y: number }): HTMLElement | null {
  return (
    document
      .elementFromPoint(point.x, point.y)
      ?.closest<HTMLElement>(`[${DROP_TARGET_ATTRIBUTE}]`) ?? null
  );
}

export function moveThreadContextDrag(
  point: { x: number; y: number },
  label: { title: string; count: number },
) {
  origin ??= point;
  const target = findDropTarget(point);
  if (target !== overTarget) {
    releaseHover?.();
    releaseHover = target ? reserveComposerThrowTarget(target) : null;
    overTarget = target;
  }
  setGhost({ x: point.x, y: point.y, ...label });
}

/** Clear the pointer preview and its hover lease; independent flying tokens keep their reservations. */
export function endThreadContextDrag() {
  releaseHover?.();
  releaseHover = null;
  overTarget = null;
  origin = null;
  setGhost(null);
}

export function dropThreadContext(
  point: { x: number; y: number },
  threads: ReadonlyArray<ScopedThreadRef>,
): boolean {
  const target = findDropTarget(point);
  if (!target || threads.length === 0) return false;
  target.dispatchEvent(new CustomEvent(THREAD_CONTEXT_DROP_EVENT, { detail: threads }));
  return true;
}

/** Release thread refs at viewport point with px/s velocity; reserve a projected target until landing.
 * pickup defaults to the first ghost position. False means the token returns without inserting.
 * Physics off preserves the synchronous direct-hit event and does not create a token.
 */
export function throwThreadContext(
  point: { x: number; y: number },
  velocity: { x: number; y: number },
  threads: ReadonlyArray<ScopedThreadRef>,
  pickup = origin ?? point,
): boolean {
  if (!isPhysicsEnabled()) return dropThreadContext(point, threads);
  if (threads.length === 0) return false;
  const target = findComposerThrowTarget(point, velocity);
  const label = ghost?.title ?? "";
  const references = [...threads];
  endThreadContextDrag();
  launchComposerThrow({
    channel: "thread",
    point,
    velocity,
    origin: pickup,
    label,
    target,
    onLand: (form) =>
      form.dispatchEvent(new CustomEvent(THREAD_CONTEXT_DROP_EVENT, { detail: references })),
  });
  return target !== null;
}

/** Mark the receiving composer form for both direct hit testing and projected throws. */
export function threadContextDropTargetProps() {
  return { [DROP_TARGET_ATTRIBUTE]: "true" } as const;
}
