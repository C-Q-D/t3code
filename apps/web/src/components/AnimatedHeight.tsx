/** Measures content height and clips only while its size transition is active. */
"use client";

import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { observeResize } from "../lib/observeResize";
import { usePhysicsMotion } from "../hooks/usePhysicsMotion";
import { MOTION_SETTLE_DURATION_MS } from "../lib/motion/springToLinear";

const HEIGHT_TRANSITION_FALLBACK_MS = 250;

/** Animate children to their measured height; holdHeight retains the previous size during loading. */
export function AnimatedHeight({
  children,
  holdHeight = false,
}: {
  readonly children: ReactNode;
  /** Retain the previous content height while a replacement is loading. */
  readonly holdHeight?: boolean;
}) {
  const { enabled: physics } = usePhysicsMotion();
  const contentRef = useRef<HTMLDivElement>(null);
  const [heightState, setHeightState] = useState<{
    readonly height: number | null;
    readonly isClipping: boolean;
  }>({ height: null, isClipping: false });

  useEffect(() => {
    if (!heightState.isClipping) return;
    // Keep the existing 50ms guard beyond the chosen curve before uncovering content.
    const timeoutId = window.setTimeout(
      () => {
        setHeightState((currentState) =>
          currentState.isClipping ? { ...currentState, isClipping: false } : currentState,
        );
      },
      physics ? MOTION_SETTLE_DURATION_MS + 50 : HEIGHT_TRANSITION_FALLBACK_MS,
    );
    return () => window.clearTimeout(timeoutId);
  }, [heightState.height, heightState.isClipping, physics]);

  useLayoutEffect(() => {
    if (holdHeight) return;
    const element = contentRef.current;
    if (!element) return;
    let firstFrameId: number | null = null;
    let secondFrameId: number | null = null;

    const updateHeight = () => {
      const nextHeight = Math.ceil(element.scrollHeight || element.getBoundingClientRect().height);
      setHeightState((currentState) => {
        if (currentState.height === nextHeight) return currentState;
        return {
          height: nextHeight,
          isClipping: currentState.height !== null,
        };
      });
    };
    const cancelPendingFrames = () => {
      if (firstFrameId !== null) {
        window.cancelAnimationFrame(firstFrameId);
        firstFrameId = null;
      }
      if (secondFrameId !== null) {
        window.cancelAnimationFrame(secondFrameId);
        secondFrameId = null;
      }
    };
    const updateHeightAfterPaint = () => {
      cancelPendingFrames();
      updateHeight();
      firstFrameId = window.requestAnimationFrame(() => {
        firstFrameId = null;
        updateHeight();
        secondFrameId = window.requestAnimationFrame(() => {
          secondFrameId = null;
          updateHeight();
        });
      });
    };

    updateHeightAfterPaint();
    const stopObserving = observeResize(element, updateHeightAfterPaint);
    return () => {
      stopObserving();
      cancelPendingFrames();
    };
  }, [holdHeight]);

  return (
    <div
      data-slot="animated-height"
      className="transition-[height] legacy:duration-200 legacy:ease-out legacy:motion-reduce:transition-none physics:duration-(--motion-settle-duration) physics:ease-(--ease-settle) [overflow-clip-margin:2px]"
      style={
        heightState.height === null
          ? undefined
          : { height: heightState.height, overflow: heightState.isClipping ? "clip" : "visible" }
      }
      onTransitionEnd={(event) => {
        if (event.target !== event.currentTarget || event.propertyName !== "height") return;
        setHeightState((currentState) =>
          currentState.isClipping ? { ...currentState, isClipping: false } : currentState,
        );
      }}
    >
      <div ref={contentRef} style={holdHeight ? { height: "100%" } : undefined}>
        {children}
      </div>
    </div>
  );
}
