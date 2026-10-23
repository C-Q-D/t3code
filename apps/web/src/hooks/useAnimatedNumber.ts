/** Paint numeric text and optional percentage fill without per-frame React updates. */
import { useLayoutEffect, useRef, type RefObject } from "react";
import { isPhysicsEnabled, onPhysicsChange } from "../lib/motion/preference";
import { useMotionJob } from "../lib/motion/react";
import { Spring } from "../lib/motion/spring";
import { TOKENS } from "../lib/motion/tokens";

/**
 * Animate finite value in formatter units, or show a hyphen for unavailable values.
 * ref owns textContent; format returns visual text; optional fillRef owns a 0–100% scaleX.
 * Accessible labels stay caller-owned. Mount/disabled updates are immediate; unmount cancels work.
 */
export function useAnimatedNumber(
  ref: RefObject<HTMLElement | null>,
  value: number | null,
  format: (value: number) => string,
  fillRef?: RefObject<HTMLElement | null>,
) {
  const springRef = useRef<Spring | null>(null);
  const { start, stop } = useMotionJob();
  useLayoutEffect(() => {
    const paint = (current: number | null) => {
      if (ref.current) ref.current.textContent = current === null ? "-" : format(current);
      if (fillRef?.current) {
        fillRef.current.style.transform = `scaleX(${Math.max(0, Math.min(100, current ?? 0)) / 100})`;
      }
    };
    if (value === null || !Number.isFinite(value)) {
      springRef.current = null;
      paint(null);
      return stop;
    }
    const spring = springRef.current ?? new Spring({ value, token: TOKENS.snap, precision: 0.5 });
    springRef.current = spring;
    const finish = () => {
      stop();
      spring.jump(value);
      paint(value);
    };
    spring.target = value;
    const direction = Math.sign(value - spring.value);
    // A reversed target must not carry the old velocity away from the new target.
    if (spring.velocity * direction < 0) spring.velocity = 0;
    paint(spring.value);
    if (!isPhysicsEnabled() || direction === 0) {
      finish();
      return stop;
    }
    start((dt) => {
      const previous = spring.value;
      const moving = spring.step(dt);
      // snap is slightly underdamped; numeric displays must never cross their target.
      if (!moving || (value - spring.value) * direction <= 0) {
        spring.jump(value);
        paint(value);
        return false;
      }
      spring.value =
        direction > 0 ? Math.max(previous, spring.value) : Math.min(previous, spring.value);
      paint(spring.value);
      return true;
    });
    const unsubscribe = onPhysicsChange((enabled) => {
      if (!enabled) finish();
    });
    return () => {
      unsubscribe();
      stop();
    };
  }, [ref, value, format, fillRef, start, stop]);
}
