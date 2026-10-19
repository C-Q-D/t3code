/** Owns panel pointer capture, elastic sizing and finite rebound jobs; persistence belongs to callers. */
import { type PointerEvent, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useMotionJob } from "../lib/motion/react";
import { isPhysicsEnabled, onPhysicsChange } from "../lib/motion/preference";
import { project, rubberClamp } from "../lib/motion/project";
import { DECEL } from "../lib/motion/tokens";
import { Spring } from "../lib/motion/spring";
import { VelocityTracker } from "../lib/motion/velocity";
import { shouldCollapsePanel } from "../lib/motion/panelFling";

/** An edge sizing transaction (width, or height for a top edge). Physical bounds are CSS pixels; velocity follows increasing size. */
interface ResizeSession {
  width: number;
  edge: "left" | "right" | "top";
  resize: (width: number) => number;
  finish: (width: number, moved: boolean) => void;
  /** Paints a transient size without persisting or clamping it. */
  paint?: (visual: number) => void;
  /** Marks physics-only interactions that have no elastic bounds, such as a collapsed rail probe. */
  physicalInteraction?: boolean;
  physics?: { min: number; max: number; rubberPx?: number; onFling?: (() => void) | undefined };
  /** Runs on every end; false means no width was committed. */
  cleanup?: (committed: boolean) => void;
}

/** Pointer and rebound share one owner so cancellation cannot commit an obsolete session. */
interface ActiveResize<T extends HTMLElement> {
  session: ResizeSession;
  target: T;
  pointerId: number;
  startPosition: number;
  pendingPosition: number;
  origin: number;
  /** Uncompressed size; both the spring and the next pointer gesture use this coordinate space. */
  raw: number;
  width: number;
  visual: number;
  moved: boolean;
  frame: number | null;
  tracker: VelocityTracker;
  time: number;
  physical: boolean;
  settling: boolean;
  stop?: () => void;
}

/** Shared pointer lifecycle for side panels; resetKey abandons old ownership without persisting it. */
export function useResizeDrag<T extends HTMLElement>(
  start: (event: PointerEvent<T>) => ResizeSession | null,
  resetKey?: string,
) {
  const drag = useRef<ActiveResize<T> | null>(null);
  const { start: startMotion, stop: stopMotion } = useMotionJob();

  const flush = useCallback(() => {
    const active = drag.current;
    if (!active || active.settling) return;
    const { session } = active;
    const delta =
      (active.pendingPosition - active.startPosition) * (session.edge === "right" ? 1 : -1);
    active.moved ||= Math.abs(delta) > 2;
    const raw = active.origin + delta;
    active.raw = raw;
    active.width = session.resize(raw);
    active.visual =
      active.physical && session.physics
        ? rubberClamp(
            raw,
            session.physics.min,
            session.physics.max,
            session.physics.rubberPx ?? 160,
          )
        : active.width;
    if (active.physical) session.paint?.(active.visual);
  }, []);

  const release = useCallback((active: ActiveResize<T>) => {
    if (active.frame !== null) cancelAnimationFrame(active.frame);
    active.frame = null;
    try {
      if (active.target.hasPointerCapture(active.pointerId)) {
        active.target.releasePointerCapture(active.pointerId);
      }
    } catch {
      // Capture can disappear when the host is detached.
    }
    document.body.style.removeProperty("cursor");
    document.body.style.removeProperty("user-select");
  }, []);

  const complete = useCallback(
    (active: ActiveResize<T>, commit: boolean) => {
      drag.current = null;
      active.stop?.();
      release(active);
      active.session.cleanup?.(commit);
      if (commit) active.session.finish(active.width, active.moved);
    },
    [release],
  );

  const finish = useCallback(
    (commit = true, allowFling = false) => {
      const active = drag.current;
      if (!active) return;
      if (!commit) {
        complete(active, false);
        return;
      }
      if (!active.settling) flush();
      const bounds = active.physical && isPhysicsEnabled() ? active.session.physics : undefined;
      const velocity =
        active.tracker.velocity(active.time).x * (active.session.edge === "right" ? 1 : -1);
      if (
        bounds &&
        allowFling &&
        bounds.onFling &&
        shouldCollapsePanel(active.visual + project(velocity, DECEL.fast), velocity, bounds.min)
      ) {
        complete(active, false);
        bounds.onFling();
        return;
      }
      if (bounds && (active.visual < bounds.min || active.visual > bounds.max)) {
        if (active.settling) return;
        active.settling = true;
        release(active);
        const spring = new Spring({ value: active.raw, target: active.width, velocity });
        active.stop = stopMotion;
        startMotion((dt) => {
          const moving = spring.step(dt);
          active.raw = spring.value;
          // Keep momentum in raw space: every painted value remains inside the elastic curve's range.
          active.visual = rubberClamp(spring.value, bounds.min, bounds.max, bounds.rubberPx ?? 160);
          active.session.paint?.(active.visual);
          if (!moving) complete(active, true);
          return moving;
        });
        return;
      }
      active.session.paint?.(active.width);
      complete(active, true);
    },
    [complete, flush, release, startMotion, stopMotion],
  );

  const previousResetKey = useRef(resetKey);
  useLayoutEffect(() => {
    if (previousResetKey.current !== resetKey) {
      finish(false);
      previousResetKey.current = resetKey;
    }
  }, [finish, resetKey]);

  useEffect(() => {
    const onBlur = () => {
      // A blurred physical gesture is abandoned, never interpreted as a throw.
      finish(!drag.current?.physical);
    };
    const unsubscribe = onPhysicsChange((enabled) => {
      if (!enabled) finish();
    });
    window.addEventListener("blur", onBlur);
    return () => {
      unsubscribe();
      window.removeEventListener("blur", onBlur);
      finish(false);
    };
  }, [finish]);

  const end = (event: PointerEvent<T>, usePosition: boolean) => {
    const active = drag.current;
    if (!active || active.settling || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    active.time = event.timeStamp;
    if (usePosition) {
      active.pendingPosition = active.session.edge === "top" ? event.clientY : event.clientX;
      active.tracker.add(active.pendingPosition, 0, event.timeStamp);
    }
    finish(usePosition || !active.physical, usePosition);
  };

  const refresh = useCallback(() => {
    const active = drag.current;
    // Geometry changes invalidate a rebound; restoring the owner's bounded size is immediate.
    if (active?.settling) complete(active, false);
    else flush();
  }, [complete, flush]);

  return {
    refresh,
    onPointerDown(event: PointerEvent<T>) {
      if (event.button !== 0 || (drag.current && !drag.current.settling)) return;
      const caught = drag.current;
      // Reuse the same session: cleanup would restore the committed size and visibly jump.
      const session = caught?.session ?? start(event);
      if (!session) return;
      caught?.stop?.();
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        if (caught) complete(caught, false);
        else session.cleanup?.(false);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const visual = caught?.visual ?? session.width;
      // The spring owns raw size, so recapture never needs a potentially singular inverse curve.
      const origin = caught?.raw ?? session.width;
      const physical =
        isPhysicsEnabled() &&
        (session.physicalInteraction === true || session.physics !== undefined);
      const tracker = new VelocityTracker();
      const position = session.edge === "top" ? event.clientY : event.clientX;
      tracker.add(position, 0, event.timeStamp);
      drag.current = {
        session,
        target: event.currentTarget,
        pointerId: event.pointerId,
        startPosition: position,
        pendingPosition: position,
        origin,
        raw: origin,
        width: caught?.width ?? session.width,
        visual,
        moved: caught?.moved ?? false,
        frame: null,
        tracker,
        time: event.timeStamp,
        physical,
        settling: false,
      };
      document.body.style.cursor = session.edge === "top" ? "row-resize" : "col-resize";
      document.body.style.userSelect = "none";
    },
    onPointerMove(event: PointerEvent<T>) {
      const active = drag.current;
      if (!active || active.settling || active.pointerId !== event.pointerId) return;
      event.preventDefault();
      active.pendingPosition = active.session.edge === "top" ? event.clientY : event.clientX;
      active.time = event.timeStamp;
      active.tracker.add(active.pendingPosition, 0, event.timeStamp);
      active.moved ||= Math.abs(active.pendingPosition - active.startPosition) > 2;
      if (active.frame !== null) return;
      active.frame = requestAnimationFrame(() => {
        active.frame = null;
        flush();
      });
    },
    onPointerUp: (event: PointerEvent<T>) => end(event, true),
    onPointerCancel: (event: PointerEvent<T>) => end(event, false),
    onLostPointerCapture: (event: PointerEvent<T>) => end(event, false),
  };
}
