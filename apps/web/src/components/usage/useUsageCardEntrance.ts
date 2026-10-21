/** Finite card entrance using the application clock and physical motion preference. */
import { useLayoutEffect, useRef } from "react";
import { usePhysicsMotion } from "../../hooks/usePhysicsMotion";
import { useMotionJob } from "../../lib/motion/react";
import { Spring } from "../../lib/motion/spring";
import { TOKENS } from "../../lib/motion/tokens";

/** Return the card ref; delaySeconds staggers first appearance only, with immediate disabled output. */
export function useUsageCardEntrance(delaySeconds: number) {
  const ref = useRef<HTMLDivElement>(null);
  const appeared = useRef(false);
  const { enabled } = usePhysicsMotion();
  const { start, stop } = useMotionJob();
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const finish = () => {
      element.style.opacity = "1";
      element.style.transform = "";
    };
    if (!enabled || appeared.current) {
      finish();
      return stop;
    }
    appeared.current = true;
    const spring = new Spring({ value: 18, target: 0, token: TOKENS.settle, precision: 0.01 });
    let elapsed = -delaySeconds;
    element.style.opacity = "0";
    element.style.transform = "translateY(18px)";
    start((dt) => {
      elapsed += dt;
      if (elapsed < 0) return true;
      const moving = spring.step(dt);
      element.style.opacity = String(Math.max(0, Math.min(1, 1 - spring.value / 18)));
      element.style.transform = `translateY(${spring.value}px)`;
      if (!moving) finish();
      return moving;
    });
    return stop;
  }, [delaySeconds, enabled, start, stop]);
  return ref;
}
