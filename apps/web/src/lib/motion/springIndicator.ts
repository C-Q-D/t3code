/** One-dimensional selection motion; coordinates are pixels from the container's start edge. */
import { isPhysicsEnabled, onPhysicsChange } from "./preference";
import { SpringTimeline } from "./springTimeline";
import { springToLinear } from "./springToLinear";
import { TOKENS } from "./tokens";

/** Ordered start/end coordinates, usable for either horizontal or vertical indicators. */
export type IndicatorEdges = readonly [number, number];

/** Plans independent edge springs; previous animation times are milliseconds on their WAAPI clocks.
 * `from` is the currently rendered geometry, not the previous destination. Returned velocities
 * are normalized to each new travel distance so a reversal preserves physical px/s momentum.
 */
export function planIndicatorTransition(
  from: IndicatorEdges,
  to: IndicatorEdges,
  previous?: readonly (
    | { travelPx: number; timeline: SpringTimeline; elapsedMs: number }
    | undefined
  )[],
) {
  const forward = to[0] + to[1] >= from[0] + from[1];
  return ([0, 1] as const).map((index) => {
    const token = (index === 1) === forward ? TOKENS.snap : TOKENS.fling;
    const travelPx = to[index] - from[index];
    const old = previous?.[index];
    const velocityPx = old ? old.timeline.at(old.elapsedMs).velocity * old.travelPx : 0;
    const initialVelocity = travelPx === 0 ? 0 : velocityPx / travelPx;
    return {
      from: from[index],
      to: to[index],
      travelPx,
      token,
      initialVelocity,
      timeline: new SpringTimeline(token, 0, initialVelocity),
      curve: springToLinear(token, { initialVelocity }),
    };
  });
}

/** Owns two finite WAAPI animations without scaling borders or corners.
 * The element must be absolutely positioned in `container`. Axis selects left/right or top/bottom.
 * Call move with animate=false for mounting/layout changes and dispose when the owner unmounts.
 */
export function createSpringIndicator(
  element: HTMLElement,
  container: HTMLElement,
  axis: "x" | "y" = "x",
) {
  const properties = axis === "x" ? (["left", "right"] as const) : (["top", "bottom"] as const);
  let active: ({ animation: Animation; travelPx: number; timeline: SpringTimeline } | undefined)[] =
    [];
  let target: IndicatorEdges | undefined;

  const cancel = () => {
    for (const edge of active) edge?.animation.cancel();
    active = [];
  };
  const move = (to: IndicatorEdges, animate = true) => {
    const extent = axis === "x" ? container.clientWidth : container.clientHeight;
    const styles = getComputedStyle(element);
    const from: IndicatorEdges = [
      parseFloat(styles[properties[0]]),
      extent - parseFloat(styles[properties[1]]),
    ];
    const previous = active.map((edge) =>
      edge
        ? {
            ...edge,
            elapsedMs:
              typeof edge.animation.currentTime === "number" ? edge.animation.currentTime : 0,
          }
        : undefined,
    );
    const canAnimate =
      target !== undefined && animate && isPhysicsEnabled() && from.every(Number.isFinite);
    cancel();
    target = to;
    element.style[properties[0]] = `${to[0]}px`;
    element.style[properties[1]] = `${extent - to[1]}px`;
    if (!canAnimate) return;
    active = planIndicatorTransition(from, to, previous).map((edge, index) => {
      if (edge.travelPx === 0) return undefined;
      const property = properties[index]!;
      const fromInset = index === 0 ? edge.from : extent - edge.from;
      const toInset = index === 0 ? edge.to : extent - edge.to;
      const animation = element.animate(
        [{ [property]: `${fromInset}px` }, { [property]: `${toInset}px` }],
        {
          duration: edge.curve.durationMs,
          easing: edge.curve.easing,
        },
      );
      return { animation, travelPx: edge.travelPx, timeline: edge.timeline };
    });
  };
  const unsubscribe = onPhysicsChange((enabled) => {
    if (!enabled && target) move(target, false);
  });
  return {
    move,
    dispose() {
      cancel();
      unsubscribe();
    },
  };
}
