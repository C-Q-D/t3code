/** React lifetime and context for the reusable physical overlay; no editor behavior is replaced. */
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { PhysicsConfig } from "./physics";
import { PhysicalComposerRenderer } from "./renderer";

const PhysicalContext = createContext<PhysicalComposerRenderer | null>(null);

/** Return the nearest mounted renderer; standalone editors retain their existing behavior. */
export function usePhysicalComposer() {
  return useContext(PhysicalContext);
}

/** Mount within a positioned composer surface; omitted parameters use the approved prototype defaults. */
export function PhysicalComposer({
  children,
  ...config
}: Partial<PhysicsConfig> & { children: ReactNode }) {
  const layer = useRef<HTMLDivElement>(null);
  const [renderer, setRenderer] = useState<PhysicalComposerRenderer | null>(null);
  const {
    stiffness,
    bounce,
    dropHeight,
    tension,
    wobble,
    heatPerKey,
    coolingRate,
    confetti,
    hueSpread,
    flowSpeed,
  } = config;
  useEffect(() => {
    const element = layer.current;
    const surface = element?.parentElement;
    if (!element || !surface) return;
    const options = Object.fromEntries(
      Object.entries({
        stiffness,
        bounce,
        dropHeight,
        tension,
        wobble,
        heatPerKey,
        coolingRate,
        confetti,
        hueSpread,
        flowSpeed,
      }).filter(([, value]) => value !== undefined),
    );
    const next = new PhysicalComposerRenderer(surface, element, options);
    setRenderer(next);
    return () => next.dispose();
  }, [
    stiffness,
    bounce,
    dropHeight,
    tension,
    wobble,
    heatPerKey,
    coolingRate,
    confetti,
    hueSpread,
    flowSpeed,
  ]);
  return (
    <PhysicalContext.Provider value={renderer}>
      <div ref={layer} data-physical-composer-overlay="" />
      {children}
    </PhysicalContext.Provider>
  );
}
