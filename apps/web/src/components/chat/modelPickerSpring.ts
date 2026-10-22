/** Finite legacy-section motion; callers retain ownership of the final layout styles. */
import { isPhysicsEnabled, onPhysicsChange } from "~/lib/motion/preference";
import { SpringTimeline } from "~/lib/motion/springTimeline";
import { springToLinear } from "~/lib/motion/springToLinear";
import type { SpringToken } from "~/lib/motion/tokens";

/** Animates a measured height or angle and carries physical velocity through interrupted transitions.
 * Values are CSS pixels for height and degrees for rotate. dispose releases animations and listeners.
 */
export function createModelPickerSpring(
  element: HTMLElement | SVGSVGElement,
  property: "height" | "rotate",
  token: SpringToken,
) {
  let active: { animation: Animation; travel: number; timeline: SpringTimeline } | null = null;
  const sample = () => {
    const elapsed =
      typeof active?.animation.currentTime === "number" ? active.animation.currentTime : 0;
    return {
      value:
        property === "height"
          ? element.getBoundingClientRect().height
          : parseFloat(getComputedStyle(element).rotate) || 0,
      velocity: active ? active.timeline.at(elapsed).velocity * active.travel : 0,
    };
  };
  const cancel = () => {
    active?.animation.cancel();
    active = null;
  };
  const unsubscribe = onPhysicsChange((enabled) => {
    if (!enabled) cancel();
  });
  return {
    /** Read painted geometry and physical velocity (px/s or degrees/s) before changing layout. */
    sample,
    isRunning: () => active !== null,
    /** Measure the caller's underlying layout without replacing its styles or advancing the clock. */
    measureTarget() {
      const animation = active?.animation;
      const effect = animation?.effect ?? null;
      // Temporarily detach the effect in this synchronous read; keep its clock and completion owner.
      if (animation) animation.effect = null;
      const value = sample().value;
      if (animation) animation.effect = effect;
      return value;
    },
    /** Transition to measured pixels/degrees from a sampled position and velocity.
     * reuse refines an in-flight virtualizer estimate without creating another animation.
     */
    move(to: number, from: ReturnType<typeof sample>, reuse = false) {
      const previous = reuse ? active : null;
      if (!previous) cancel();
      const travel = to - from.value;
      if (!isPhysicsEnabled() || Math.abs(travel) < 0.01) {
        cancel();
        return;
      }
      const initialVelocity = from.velocity / travel;
      const curve = springToLinear(token, { initialVelocity });
      const unit = property === "height" ? "px" : "deg";
      const frames = [{ [property]: `${from.value}${unit}` }, { [property]: `${to}${unit}` }];
      const timing = { duration: curve.durationMs, easing: curve.easing };
      if (previous) {
        const effect = previous.animation.effect as KeyframeEffect;
        effect.setKeyframes(frames);
        effect.updateTiming(timing);
        previous.animation.currentTime = 0;
        previous.travel = travel;
        previous.timeline = new SpringTimeline(token, 0, initialVelocity);
        return;
      }
      const animation = element.animate(frames, timing);
      const transition = {
        animation,
        travel,
        timeline: new SpringTimeline(token, 0, initialVelocity),
      };
      active = transition;
      void animation.finished.then(
        () => {
          if (active === transition) cancel();
        },
        () => {
          /* Cancellation is owned by a newer transition or unmount. */
        },
      );
    },
    /** Release both motion and the preference subscription when the owning row/list unmounts. */
    dispose() {
      cancel();
      unsubscribe();
    },
  };
}
