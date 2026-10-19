/** Body portal for thread and file throw previews; insertion belongs to the sender. */
import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { COMPOSER_IMPACT_EVENT, composerFieldTarget } from "../../lib/motion/composerThrow";
import { run } from "../../lib/motion/loop";
import { isPhysicsEnabled, onPhysicsChange } from "../../lib/motion/preference";
import { throwTarget, type Point } from "../../lib/motion/project";
import { Spring } from "../../lib/motion/spring";
import { TOKENS } from "../../lib/motion/tokens";
import { VelocityTracker } from "../../lib/motion/velocity";

/** Each surface owns its channel's portals and cancels them on unmount. */
export type ThrowChannel = "thread" | "mention" | `mention:${string}`;
/** Viewport CSS pixel geometry and a landing callback which must not insert before arrival. */
interface ThrowInput {
  channel: ThrowChannel;
  point: Point;
  velocity: Point;
  origin: Point;
  label: string;
  target: HTMLElement | null;
  onLand: (form: HTMLElement) => void;
}
/** A token owns its springs and pointer listeners; frames write DOM without React updates. */
interface ThrowFlight {
  id: number;
  channel: ThrowChannel;
  label: string;
  attach: (element: HTMLDivElement | null) => void;
  grab: (event: PointerEvent) => void;
  cancel: () => void;
}
let nextId = 0;
let flights: readonly ThrowFlight[] = [];
const emptyFlights: readonly ThrowFlight[] = [];
const listeners = new Set<() => void>();
const reservations = new WeakMap<HTMLElement, number>();

/** Reference-count target highlights so a second drag cannot erase an existing flight reservation. */
export function reserveComposerThrowTarget(form: HTMLElement): () => void {
  reservations.set(form, (reservations.get(form) ?? 0) + 1);
  form.setAttribute("data-thread-context-over", "true");
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const count = (reservations.get(form) ?? 1) - 1;
    if (count > 0) reservations.set(form, count);
    else {
      reservations.delete(form);
      form.removeAttribute("data-thread-context-over");
    }
  };
}

/** Pick the first composer magnetic field crossed by the projected viewport path, or null. */
export function findComposerThrowTarget(point: Point, velocity: Point): HTMLElement | null {
  const targets = Array.from(document.querySelectorAll<HTMLElement>("[data-thread-context-drop]"))
    .filter((form) => {
      const rect = form.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    })
    .map((form) => ({ ...composerFieldTarget(form), form }));
  return throwTarget(point, velocity, targets, { pick: "path" })?.form ?? null;
}

/** Notify only on flight creation/removal; spring coordinates stay outside the React store. */
function publish() {
  for (const listener of listeners) listener();
}

/** Start a flight or return-to-origin fade. Cancellation never calls onLand; velocity is px/s.
 * Returns an idempotent disposer for the source owner. A regrab invalidates the current reservation.
 */
export function launchComposerThrow(input: ThrowInput): () => void {
  if (!isPhysicsEnabled()) return () => {};
  const x = new Spring({
    value: input.point.x + 12,
    velocity: input.velocity.x,
    token: TOKENS.fling,
  });
  const y = new Spring({
    value: input.point.y + 12,
    velocity: input.velocity.y,
    token: TOKENS.fling,
  });
  let element: HTMLDivElement | null = null;
  let target = input.target;
  let incoming = input.velocity;
  let releaseReservation = target ? reserveComposerThrowTarget(target) : () => {};
  let stop = () => {};
  let unsubscribe = () => {};
  let detachPointer = () => {};
  let disposed = false;
  let fadeSeconds = 0;

  const paint = () => {
    if (element) element.style.transform = `translate(${x.value}px, ${y.value}px)`;
  };
  const cancel = () => {
    if (disposed) return;
    disposed = true;
    stop();
    detachPointer();
    unsubscribe();
    releaseReservation();
    flights = flights.filter((candidate) => candidate !== flight);
    publish();
  };
  const fly = () => {
    fadeSeconds = 0;
    if (element) element.style.opacity = "1";
    stop = run((dt) => {
      if (target && !target.isConnected) {
        releaseReservation();
        target = null;
      }
      // Re-measure because composer expansion, scrolling or a resize can move the catch point.
      const rect = target?.getBoundingClientRect();
      if (rect) {
        x.target = rect.left + (rect.width - (element?.offsetWidth ?? 0)) / 2;
        y.target = rect.top + (rect.height - (element?.offsetHeight ?? 0)) / 2;
      } else {
        x.target = input.origin.x + 12;
        y.target = input.origin.y + 12;
      }
      const movingX = x.step(dt);
      const movingY = y.step(dt);
      paint();
      if (movingX || movingY) return true;
      if (target) {
        const form = target;
        const atX = rect!.left + rect!.width / 2;
        cancel();
        input.onLand(form);
        form.dispatchEvent(
          new CustomEvent(COMPOSER_IMPACT_EVENT, {
            detail: { vx: incoming.x, vy: incoming.y, atX },
          }),
        );
        return false;
      }
      // Opacity has a fixed 150 ms duration; it is not a physical coordinate.
      fadeSeconds += dt;
      if (element) element.style.opacity = String(Math.max(0, 1 - fadeSeconds / 0.15));
      if (fadeSeconds < 0.15) return true;
      cancel();
      return false;
    });
  };
  const flight: ThrowFlight = {
    id: nextId++,
    channel: input.channel,
    label: input.label,
    cancel,
    attach(node) {
      element = node;
      paint();
    },
    grab(event) {
      if (disposed || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      stop();
      detachPointer();
      releaseReservation();
      target = null;
      const tracker = new VelocityTracker();
      tracker.add(event.clientX, event.clientY);
      const grabOffset = { x: x.value - event.clientX, y: y.value - event.clientY };
      if (element) element.style.opacity = "1";
      const move = (next: PointerEvent) => {
        if (next.pointerId !== event.pointerId) return;
        next.preventDefault();
        x.jump(next.clientX + grabOffset.x);
        y.jump(next.clientY + grabOffset.y);
        tracker.add(next.clientX, next.clientY);
        paint();
      };
      const finish = (next: PointerEvent) => {
        if (next.pointerId !== event.pointerId) return;
        detachPointer();
        incoming = tracker.velocity();
        target = findComposerThrowTarget({ x: next.clientX, y: next.clientY }, incoming);
        releaseReservation = target ? reserveComposerThrowTarget(target) : () => {};
        x.velocity = incoming.x;
        y.velocity = incoming.y;
        fly();
      };
      const abandon = () => {
        detachPointer();
        x.velocity = y.velocity = 0;
        fly();
      };
      const keydown = (next: KeyboardEvent) => {
        if (next.key === "Escape") abandon();
      };
      document.addEventListener("pointermove", move, { capture: true, passive: false });
      document.addEventListener("pointerup", finish, true);
      document.addEventListener("pointercancel", abandon, true);
      document.addEventListener("keydown", keydown, true);
      window.addEventListener("blur", abandon);
      detachPointer = () => {
        document.removeEventListener("pointermove", move, true);
        document.removeEventListener("pointerup", finish, true);
        document.removeEventListener("pointercancel", abandon, true);
        document.removeEventListener("keydown", keydown, true);
        window.removeEventListener("blur", abandon);
      };
    },
  };
  flights = [...flights, flight];
  unsubscribe = onPhysicsChange((enabled) => {
    if (!enabled) cancel();
  });
  publish();
  fly();
  return cancel;
}

/** Subscribe to discrete token lifetimes; returns the external-store unsubscribe. */
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Render one surface's throw previews in body; unmount cancels its in-flight insertions. */
export function ComposerThrowToken({ channel }: { channel: ThrowChannel }) {
  const current = useSyncExternalStore(
    subscribe,
    () => flights,
    () => emptyFlights,
  );
  useEffect(
    () => () => {
      for (const flight of flights) if (flight.channel === channel) flight.cancel();
    },
    [channel],
  );
  return createPortal(
    current
      .filter((flight) => flight.channel === channel)
      .map((flight) => (
        <div
          key={flight.id}
          ref={flight.attach}
          aria-hidden="true"
          data-composer-throw-token={channel}
          className="fixed left-0 top-0 z-100 w-62.5 cursor-grab touch-none truncate rounded-card-row bg-sidebar-row-drag px-3 py-2.5 text-foreground shadow-sidebar-context-drag"
          onPointerDown={(event) => flight.grab(event.nativeEvent)}
        >
          {flight.label}
        </div>
      )),
    document.body,
  );
}
