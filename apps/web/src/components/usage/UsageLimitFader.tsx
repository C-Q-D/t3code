/** Decorative, draggable usage meter; account actions remain on the separate name button. */
import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { usePhysicsMotion } from "../../hooks/usePhysicsMotion";
import { useMotionJob } from "../../lib/motion/react";
import { useAnimatedNumber } from "../../hooks/useAnimatedNumber";
import { FaderMotion } from "./UsageLimitFader.motion";

/** Render quota in percent; label contains the complete accessible name and reset time. */
export function UsageLimitFader({
  usedPercent,
  remainingPercent,
  label,
  resetLabel,
  index,
  children,
}: {
  readonly usedPercent: number;
  readonly remainingPercent: number;
  readonly label: string;
  readonly resetLabel: string;
  readonly index: number;
  readonly children: ReactNode;
}) {
  const { enabled } = usePhysicsMotion();
  const host = useRef<HTMLDivElement>(null);
  const cap = useRef<HTMLSpanElement>(null);
  const motion = useRef<FaderMotion | null>(null);
  const pointer = useRef<{ id: number; bottom: number; height: number } | null>(null);
  const entered = useRef(false);
  const { start, stop } = useMotionJob();
  const paint = useCallback((value: number) => {
    host.current?.style.setProperty("--fader-used", `${Math.max(0, Math.min(100, value))}%`);
  }, []);
  const animate = useCallback(() => {
    start((dt) => {
      const current = motion.current;
      if (!current) return false;
      const moving = current.step(dt);
      paint(current.spring.value);
      return moving;
    });
  }, [paint, start]);

  useEffect(() => {
    const current = motion.current ?? new FaderMotion();
    motion.current = current;
    if (!enabled) {
      stop();
      const active = pointer.current;
      pointer.current = null;
      if (active && cap.current?.hasPointerCapture(active.id)) {
        cap.current.releasePointerCapture(active.id);
      }
      current.spring.jump(usedPercent);
      paint(usedPercent);
      return;
    }
    if (!pointer.current) {
      current.target(usedPercent, entered.current ? 0 : index * 0.06);
      entered.current = true;
      animate();
    }
    return stop;
  }, [animate, enabled, index, paint, stop, usedPercent]);

  const release = () => {
    if (!pointer.current) return;
    pointer.current = null;
    if (!enabled) return;
    motion.current?.release(usedPercent);
    animate();
  };
  return (
    <div className="usage-fader">
      <div
        ref={host}
        className="usage-fader-slot"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={remainingPercent}
        aria-label={label}
      >
        <span className="usage-fader-rail" aria-hidden />
        <span className="usage-fader-fill" aria-hidden />
        {Array.from({ length: 21 }, (_, tick) => (
          <span
            key={tick}
            className="usage-fader-tick"
            data-major={tick % 5 === 0}
            style={{ bottom: `${tick * 5}%` }}
            aria-hidden
          />
        ))}
        <span
          ref={cap}
          className="usage-fader-cap"
          data-draggable={enabled}
          aria-hidden
          onPointerDown={(event) => {
            if (!enabled || event.button !== 0 || pointer.current) return;
            const rect = host.current?.getBoundingClientRect();
            if (!rect || !motion.current) return;
            stop();
            pointer.current = { id: event.pointerId, bottom: rect.bottom, height: rect.height };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const drag = pointer.current;
            if (!enabled || !drag || drag.id !== event.pointerId || !motion.current) return;
            motion.current.drag(((drag.bottom - event.clientY) / drag.height) * 100);
            paint(motion.current.spring.value);
          }}
          onPointerUp={release}
          onPointerCancel={release}
          onLostPointerCapture={release}
        />
      </div>
      {children}
      <FaderPercentage value={remainingPercent} />
      <span className="usage-fader-reset">{resetLabel || "\u00a0"}</span>
    </div>
  );
}

/** Format the authoritative remainder; dragging never changes the displayed quota. */
function formatPercentage(value: number) {
  return `${Math.round(value)}%`;
}

/** Animate refreshed quota with the shared numeric hook; initial and reduced-motion values are immediate. */
export function FaderPercentage({
  value,
  shared = false,
}: {
  readonly value: number;
  readonly shared?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useAnimatedNumber(ref, value, formatPercentage);
  return (
    <span
      ref={ref}
      className={shared ? "usage-fader-shared-number font-serif" : "usage-fader-remaining"}
    >
      {formatPercentage(value)}
    </span>
  );
}
