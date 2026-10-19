/** Owns the draft-to-docked composer's layout animation; mobile view transitions remain external. */
import { useLayoutEffect, useRef } from "react";
import { usePhysicsMotion } from "../../hooks/usePhysicsMotion";
import { SpringTimeline } from "../../lib/motion/springTimeline";
import { springToLinear } from "../../lib/motion/springToLinear";
import { TOKENS } from "../../lib/motion/tokens";
import { draftHeroAxisSegments } from "./draftHeroMotion";
import {
  DRAFT_HERO_TRANSITION_ANIMATION_ID,
  DRAFT_HERO_TRANSITION_EASING,
} from "./draftHeroTransition";

/** Keep the draft composer visually anchored across docking; physics inherits each axis's velocity. */
export function useDraftHeroLayoutTransition(
  isDraftHeroState: boolean,
  animationsActive: boolean,
  animationDurationMs: number,
) {
  const { enabled: physics } = usePhysicsMotion();
  const transitionGroupRef = useRef<HTMLDivElement | null>(null);
  const composerAnchorRef = useRef<HTMLDivElement | null>(null);
  const previousStateRef = useRef(isDraftHeroState);
  const previousComposerRectRef = useRef<DOMRect | null>(null);
  const animationRef = useRef<Animation | null>(null);
  const physicsAnimationsRef = useRef<
    { axis: "X" | "Y"; fromPx: number; timeline: SpringTimeline; animation: Animation }[]
  >([]);
  const capturedPhysicsRectRef = useRef<DOMRect | null>(null);
  const attachTransitionGroupRef = (element: HTMLDivElement | null) => {
    transitionGroupRef.current = element;
  };
  const attachComposerAnchorRef = (element: HTMLDivElement | null) => {
    composerAnchorRef.current = element;
  };

  const captureComposerRect = () => {
    const rect = composerAnchorRef.current?.getBoundingClientRect() ?? null;
    if (physics) capturedPhysicsRectRef.current = rect;
    else previousComposerRectRef.current = rect;
  };

  useLayoutEffect(
    () => () => {
      for (const entry of physicsAnimationsRef.current) entry.animation.cancel();
      physicsAnimationsRef.current = [];
    },
    [],
  );

  useLayoutEffect(() => {
    const transitionGroup = transitionGroupRef.current;
    const nextComposerRect = composerAnchorRef.current?.getBoundingClientRect() ?? null;
    const stateChanged = previousStateRef.current !== isDraftHeroState;
    const mobileComposerTransitionActive =
      typeof document !== "undefined" &&
      document.documentElement.dataset.mobileComposerRouteTransition === "true";

    const now = performance.now();
    const inherited = { X: { offset: 0, velocity: 0 }, Y: { offset: 0, velocity: 0 } };
    const wasMoving = physicsAnimationsRef.current.length > 0;
    for (const entry of physicsAnimationsRef.current) {
      const sample = entry.timeline.at(now);
      inherited[entry.axis].offset += entry.fromPx * (1 - sample.value);
      inherited[entry.axis].velocity -= entry.fromPx * sample.velocity;
      entry.animation.cancel();
    }
    physicsAnimationsRef.current = [];

    if (physics) {
      animationRef.current?.cancel();
      animationRef.current = null;
      // Measure the destination only after cancelling transforms; the captured rect
      // already includes the old transform, whereas the saved layout rect does not.
      const destination = composerAnchorRef.current?.getBoundingClientRect() ?? null;
      const captured = capturedPhysicsRectRef.current;
      const previous = captured ?? previousComposerRectRef.current;
      if (
        (stateChanged || wasMoving) &&
        animationsActive &&
        !mobileComposerTransitionActive &&
        transitionGroup &&
        previous &&
        destination &&
        typeof transitionGroup.animate === "function"
      ) {
        const offsets = {
          X: previous.left + (captured ? 0 : inherited.X.offset) - destination.left,
          Y: previous.top + (captured ? 0 : inherited.Y.offset) - destination.top,
        };
        for (const axis of ["X", "Y"] as const) {
          for (const segment of draftHeroAxisSegments(offsets[axis], inherited[axis].velocity)) {
            const { initialVelocity, fromPx } = segment;
            const curve = springToLinear(TOKENS.settle, { initialVelocity });
            const animation = transitionGroup.animate(
              [
                { transform: `translate${axis}(${fromPx}px)` },
                { transform: `translate${axis}(0px)` },
              ],
              { duration: curve.durationMs, easing: curve.easing, composite: "add" },
            );
            animation.id = DRAFT_HERO_TRANSITION_ANIMATION_ID;
            const entry = {
              axis,
              fromPx,
              animation,
              timeline: new SpringTimeline(TOKENS.settle, now, initialVelocity),
            };
            physicsAnimationsRef.current.push(entry);
            void animation.finished
              .catch(() => undefined)
              .then(() => {
                physicsAnimationsRef.current = physicsAnimationsRef.current.filter(
                  (active) => active !== entry,
                );
              });
          }
        }
      }
      capturedPhysicsRectRef.current = null;
      previousStateRef.current = isDraftHeroState;
      previousComposerRectRef.current = destination;
      return;
    }
    capturedPhysicsRectRef.current = null;

    animationRef.current?.cancel();
    animationRef.current = null;
    const previousComposerRect = previousComposerRectRef.current;
    if (
      stateChanged &&
      animationsActive &&
      !mobileComposerTransitionActive &&
      transitionGroup &&
      previousComposerRect &&
      nextComposerRect &&
      typeof transitionGroup.animate === "function"
    ) {
      const translateX = previousComposerRect.left - nextComposerRect.left;
      const translateY = previousComposerRect.top - nextComposerRect.top;
      if (Math.abs(translateX) >= 0.5 || Math.abs(translateY) >= 0.5) {
        const animation = transitionGroup.animate(
          [
            { transform: `translate3d(${translateX}px, ${translateY}px, 0)` },
            { transform: "translate3d(0, 0, 0)" },
          ],
          {
            duration: animationDurationMs,
            easing: DRAFT_HERO_TRANSITION_EASING,
          },
        );
        animation.id = DRAFT_HERO_TRANSITION_ANIMATION_ID;
        animationRef.current = animation;
        void animation.finished
          .catch(() => undefined)
          .then(() => {
            if (animationRef.current === animation) animationRef.current = null;
          });
      }
    }
    previousStateRef.current = isDraftHeroState;
    previousComposerRectRef.current = nextComposerRect;
  }, [animationDurationMs, animationsActive, isDraftHeroState, physics]);

  return {
    transitionGroupRef: attachTransitionGroupRef,
    composerAnchorRef: attachComposerAnchorRef,
    captureComposerRect,
  } as const;
}
