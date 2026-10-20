/** Shared-clock presentation for the hero and strip; no frame values enter React state. */
import { useLayoutEffect, useRef, useState } from "react";
import { useAnimatedNumber } from "~/hooks/useAnimatedNumber";
import { usePhysicsMotion } from "~/hooks/usePhysicsMotion";
import { useMotionJob } from "~/lib/motion/react";
import { Spring } from "~/lib/motion/spring";
import { TOKENS } from "~/lib/motion/tokens";

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
 * One mount update seeds the existing number hook at zero; subsequent updates retain its spring.
 * Only this mount flag uses state, never the per-frame numeric value.
 */
export function UsageAnimatedValue({
  value,
  format,
  className,
}: {
  readonly value: number;
  readonly format: (value: number) => string;
  readonly className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [mounted, setMounted] = useState(false);
  useAnimatedNumber(ref, mounted ? value : 0, format);
  useLayoutEffect(() => setMounted(true), []);
  return (
    <span className={className}>
      <span ref={ref} aria-hidden />
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}
