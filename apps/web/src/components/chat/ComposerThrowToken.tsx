/** Body portal for thread and file throw previews; insertion belongs to the sender. */
import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  COMPOSER_FIELD_PX,
  COMPOSER_IMPACT_EVENT,
  composerFieldTarget,
} from "../../lib/motion/composerThrow";
import { run } from "../../lib/motion/loop";
import { isPhysicsEnabled, onPhysicsChange } from "../../lib/motion/preference";
import { fieldStrength, throwTarget, type Point } from "../../lib/motion/project";
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
/** Source-independent pickup: origin is the card's viewport top-left, event is the initiating pointer. */
interface ComposerThrowDragInput {
  channel: ThrowChannel;
  label: string;
  event: PointerEvent;
  origin: Point;
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
/** Viewport CSS pixels from the catch point at which a flying token counts as caught. */
const CONTACT_RADIUS_PX = 8;
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
  return createComposerThrow(input);
}

/** Start a pointer-owned card at origin (CSS px), retaining the event's grab offset and pointer id.
 * The channel's ComposerThrowToken must be mounted. onLand runs only on a successful arrival;
 * the caller owns mention-event dispatch. Returns an idempotent return-home cancellation.
 * Disabled physics or a non-primary button creates nothing; preference changes dispose immediately.
 */
export function beginComposerThrowDrag(input: ComposerThrowDragInput): () => void {
  if (input.event.button !== 0) return () => {};
  return createComposerThrow(
    { ...input, point: input.origin, velocity: { x: 0, y: 0 }, target: null },
    input.event,
  );
}

/** Own a shared portal and flight; an initial pointer opts into direct pickup without the legacy 12px offset. */
function createComposerThrow(input: ThrowInput, initialPointer?: PointerEvent): () => void {
  if (!isPhysicsEnabled()) return () => {};
  const offset = initialPointer ? 0 : 12;
  const x = new Spring({
    value: input.point.x + offset,
    velocity: input.velocity.x,
    token: TOKENS.fling,
  });
  const y = new Spring({
    value: input.point.y + offset,
    velocity: input.velocity.y,
    token: TOKENS.fling,
  });
  const scale = new Spring({ value: 1, token: TOKENS.snap, precision: 0.0005 });
  const tilt = new Spring({ token: TOKENS.settle, precision: 0.01 });
  let element: HTMLDivElement | null = null;
  let target = input.target;
  let incoming = input.velocity;
  let releaseReservation = target ? reserveComposerThrowTarget(target) : () => {};
  let stop = () => {};
  let unsubscribe = () => {};
  let detachPointer = () => {};
  let disposed = false;
  let fadeSeconds = 0;
  let returning = false;

  const paint = () => {
    if (element)
      element.style.transform =
        `translate(${x.value}px, ${y.value}px)` +
        (initialPointer ? ` rotate(${tilt.value}deg) scale(${scale.value})` : "");
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
    stop();
    scale.target = 1;
    tilt.target = 0;
    // Preserve the final drag pose on the first flight frame, before integrating its momentum.
    let handoff = Boolean(initialPointer);
    fadeSeconds = 0;
    if (element) element.style.opacity = "1";
    stop = run((dt) => {
      if (handoff) {
        handoff = false;
        paint();
        return true;
      }
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
        x.target = input.origin.x + offset;
        y.target = input.origin.y + offset;
      }
      const scaling = scale.step(dt);
      const tilting = tilt.step(dt);
      const movingX = x.step(dt);
      const movingY = y.step(dt);
      paint();
      // A caught token lands on contact: the fling spring's sub-pixel tail would otherwise
      // keep it hovering over the composer for about half a second before inserting.
      const arrived =
        target !== null && Math.hypot(x.value - x.target, y.value - y.target) < CONTACT_RADIUS_PX;
      if ((movingX || movingY || scaling || tilting) && !arrived) return true;
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
  const returnHome = () => {
    if (disposed || returning) return;
    returning = true;
    detachPointer();
    releaseReservation();
    target = null;
    x.velocity = y.velocity = 0;
    fly();
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
      if (disposed || returning || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      stop();
      detachPointer();
      releaseReservation();
      target = null;
      const tracker = new VelocityTracker();
      tracker.addPointerEvent(event);
      const grabOffset = { x: x.value - event.clientX, y: y.value - event.clientY };
      let poseRunning = false;
      const stepPose = (dt: number) => {
        const scaling = scale.step(dt);
        const tilting = tilt.step(dt);
        paint();
        poseRunning = scaling || tilting;
        return poseRunning;
      };
      const animatePose = () => {
        // Cancelling the last loop job resets its clock. Keep this task alive between moves
        // so high-refresh frames retain their real elapsed time; restart only after rest.
        if (poseRunning) return;
        poseRunning = true;
        stop = run(stepPose);
      };
      if (initialPointer) {
        scale.target = 1.05;
        animatePose();
      }
      if (element) element.style.opacity = "1";
      const move = (next: PointerEvent) => {
        if (next.pointerId !== event.pointerId) return;
        next.preventDefault();
        tracker.addPointerEvent(next);
        const raw = { x: next.clientX + grabOffset.x, y: next.clientY + grabOffset.y };
        let pull = { x: 0, y: 0 };
        if (initialPointer) {
          const center = {
            x: raw.x + (element?.offsetWidth ?? 0) / 2,
            y: raw.y + (element?.offsetHeight ?? 0) / 2,
          };
          let strength = 0;
          let hover: HTMLElement | null = null;
          let pointerOver: HTMLElement | null = null;
          for (const form of document.querySelectorAll<HTMLElement>("[data-thread-context-drop]")) {
            const rect = form.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) continue;
            const attraction = fieldStrength(center.x, center.y, rect, COMPOSER_FIELD_PX);
            if (
              next.clientX >= rect.left &&
              next.clientX <= rect.right &&
              next.clientY >= rect.top &&
              next.clientY <= rect.bottom
            )
              pointerOver = form;
            if (attraction > strength) {
              strength = attraction;
              hover = form;
              pull = {
                x: (rect.left + rect.width / 2 - center.x) * strength * 0.28,
                y: (rect.top + rect.height / 2 - center.y) * strength * 0.28,
              };
            }
          }
          const highlighted = pointerOver ?? hover;
          if (target !== highlighted) {
            releaseReservation();
            target = highlighted;
            releaseReservation = target ? reserveComposerThrowTarget(target) : () => {};
          }
          tilt.target = Math.max(-7, Math.min(7, tracker.velocity(next.timeStamp).x / 160));
          animatePose();
        }
        x.jump(raw.x + pull.x);
        y.jump(raw.y + pull.y);
        paint();
      };
      const finish = (next: PointerEvent) => {
        if (next.pointerId !== event.pointerId) return;
        detachPointer();
        tracker.addPointerEvent(next);
        incoming = tracker.velocity(next.timeStamp);
        releaseReservation();
        target = findComposerThrowTarget({ x: next.clientX, y: next.clientY }, incoming);
        releaseReservation = target ? reserveComposerThrowTarget(target) : () => {};
        x.velocity = incoming.x;
        y.velocity = incoming.y;
        fly();
      };
      const abandon = () => {
        if (initialPointer) {
          returnHome();
          return;
        }
        detachPointer();
        x.velocity = y.velocity = 0;
        fly();
      };
      const keydown = (next: KeyboardEvent) => {
        if (next.key === "Escape") abandon();
      };
      const pointercancel = (next: PointerEvent) => {
        if (!initialPointer || next.pointerId === event.pointerId) abandon();
      };
      const preventNativeDrag = (next: DragEvent) => next.preventDefault();
      document.addEventListener("pointermove", move, { capture: true, passive: false });
      document.addEventListener("pointerup", finish, true);
      document.addEventListener("pointercancel", pointercancel, true);
      document.addEventListener("keydown", keydown, true);
      if (initialPointer) document.addEventListener("dragstart", preventNativeDrag, true);
      window.addEventListener("blur", abandon);
      detachPointer = () => {
        document.removeEventListener("pointermove", move, true);
        document.removeEventListener("pointerup", finish, true);
        document.removeEventListener("pointercancel", pointercancel, true);
        document.removeEventListener("keydown", keydown, true);
        document.removeEventListener("dragstart", preventNativeDrag, true);
        window.removeEventListener("blur", abandon);
      };
    },
  };
  flights = [...flights, flight];
  unsubscribe = onPhysicsChange((enabled) => {
    if (!enabled) cancel();
  });
  publish();
  if (initialPointer) flight.grab(initialPointer);
  else fly();
  return initialPointer ? returnHome : cancel;
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
