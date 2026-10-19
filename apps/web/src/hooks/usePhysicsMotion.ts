/** Read client preference and hydration without publishing global state during render. */
import { resolvePhysicsMotion, type PhysicsMotionMode } from "../lib/motion/preference";
import { useMediaQuery } from "./useMediaQuery";
import { useClientSettings, useClientSettingsHydrated } from "./useSettings";

/** Return effective animation permission and selected mode; unhydrated clients always remain disabled. */
export function usePhysicsMotion(): { enabled: boolean; mode: PhysicsMotionMode } {
  const mode = useClientSettings((settings): PhysicsMotionMode => {
    // L1 adds the contracts field; until then missing settings retain the agreed default on.
    const value = "physicsMotion" in settings ? settings.physicsMotion : "on";
    return value === "off" || value === "system" ? value : "on";
  });
  const hydrated = useClientSettingsHydrated();
  const prefersReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  return { enabled: resolvePhysicsMotion({ mode, prefersReducedMotion, hydrated }), mode };
}
