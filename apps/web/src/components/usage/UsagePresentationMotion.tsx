/** Shared-clock presentation for the hero and strip; no frame values enter React state. */
import { useLayoutEffect, useRef } from "react";
import { usePhysicsMotion } from "~/hooks/usePhysicsMotion";
import { useMotionJob } from "~/lib/motion/react";
import { Spring } from "~/lib/motion/spring";
import { TOKENS } from "~/lib/motion/tokens";
import type { UsageChartMetric } from "./UsageProviderChart";

/**
 * Returns the section ref for a one-time 18px spring entrance after delaySeconds.
 * The caller owns the section; disabling physics jumps to visible and unmount cancels the job.
 */
export function useUsageEntrance(delaySeconds: number) {
  const ref = useRef<HTMLElement>(null);
  const springRef = useRef<Spring | null>(null);
  const { enabled } = usePhysicsMotion();
  const { start, stop } = useMotionJob();
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const spring =
      springRef.current ?? new Spring({ target: 1, token: TOKENS.fling, precision: 0.001 });
    springRef.current = spring;
    const paint = () => {
      element.style.opacity = String(Math.max(0, Math.min(1, spring.value * 1.4)));
      element.style.transform = spring.isSettled ? "" : `translateY(${(1 - spring.value) * 18}px)`;
    };
    if (!enabled || spring.isSettled) {
      spring.jump(1);
      paint();
      return stop;
    }
    let elapsed = 0;
    paint();
    start((dt) => {
      elapsed += dt;
      if (elapsed < delaySeconds) return true;
      const moving = spring.step(dt);
      paint();
      return moving;
    });
    return stop;
  }, [delaySeconds, enabled, start, stop]);
  return ref;
}

/**
 * Displays a finite value with the page formatter and an accessible final value.
 * A ref-owned spring starts at zero and retains position across target changes.
 * Unlike the shared number hook's immediate mount, this entrance needs no React state update.
 * Physics disabled writes the target immediately; unmount releases the shared-clock job.
 * Changing optional unit jumps to the new value before paint; omitted unit means a fixed measure.
 */
export function UsageAnimatedValue({
  value,
  format,
  className,
  unit,
}: {
  readonly value: number;
  readonly format: (value: number) => string;
  readonly className?: string;
  readonly unit?: UsageChartMetric;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const springRef = useRef<Spring | null>(null);
  const unitRef = useRef(unit);
  const { enabled } = usePhysicsMotion();
  const { start, stop } = useMotionJob();
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (!Number.isFinite(value)) {
      springRef.current = null;
      element.textContent = "—";
      return stop;
    }
    // Sub-cent precision keeps small USD totals animated without rounding their final value.
    const spring = springRef.current ?? new Spring({ token: TOKENS.snap, precision: 0.005 });
    springRef.current = spring;
    const unitChanged = unitRef.current !== unit;
    unitRef.current = unit;
    spring.target = value;
    const direction = Math.sign(value - spring.value);
    if (spring.velocity * direction < 0) spring.velocity = 0;
    // A magnitude from the previous unit cannot be interpolated or painted in the new unit.
    if (!enabled || unitChanged || direction === 0) {
      spring.jump(value);
      element.textContent = format(value);
      return stop;
    }
    element.textContent = format(spring.value);
    start((dt) => {
      const previous = spring.value;
      const moving = spring.step(dt);
      // Numeric readouts must not overshoot or briefly move away after a target reversal.
      if (!moving || (value - spring.value) * direction <= 0) {
        spring.jump(value);
        element.textContent = format(value);
        return false;
      }
      spring.value =
        direction > 0 ? Math.max(previous, spring.value) : Math.min(previous, spring.value);
      element.textContent = format(spring.value);
      return true;
    });
    return stop;
  }, [value, format, unit, enabled, start, stop]);
  return (
    <span className={className}>
      <span ref={ref} aria-hidden />
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}
