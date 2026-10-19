/** Count feedback owns only the badge's scale, leaving opacity transitions to the caller. */
import { useLayoutEffect, useRef, type RefObject } from "react";
import { isPhysicsEnabled, onPhysicsChange } from "../lib/motion/preference";
import { useMotionJob } from "../lib/motion/react";
import { Spring } from "../lib/motion/spring";
import { TOKENS } from "../lib/motion/tokens";

/**
 * Pop ref's scale only when count increases after mount; text and labels stay caller-owned.
 * A 4 scale-units/s impulse peaks near 1.18 with jolt. Disable, decrease and unmount cancel work.
 * The referenced element must give this hook exclusive ownership of its transform.
 */
export function useCountPop(ref: RefObject<HTMLElement | null>, count: number) {
  const previous = useRef(count);
  const { start, stop } = useMotionJob();
  useLayoutEffect(() => {
    const increased = count > previous.current;
    previous.current = count;
    const reset = () => {
      stop();
      if (ref.current) ref.current.style.transform = "";
    };
    if (!increased || !isPhysicsEnabled() || !ref.current) {
      reset();
      return;
    }
    const spring = new Spring({ value: 1, velocity: 4, token: TOKENS.jolt, precision: 0.001 });
    start((dt) => {
      const moving = spring.step(dt);
      if (ref.current) ref.current.style.transform = moving ? `scale(${spring.value})` : "";
      return moving;
    });
    const unsubscribe = onPhysicsChange((enabled) => {
      if (!enabled) reset();
    });
    return () => {
      unsubscribe();
      reset();
    };
  }, [ref, count, start, stop]);
}
