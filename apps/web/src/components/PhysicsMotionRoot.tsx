/** Publishes the hydrated client motion preference to CSS and imperative motion consumers. */
import { useEffect } from "react";

import { usePhysicsMotion } from "../hooks/usePhysicsMotion";
import { setPhysicsEnabled } from "../lib/motion/preference";

/** Mount once inside renderer providers; the root attribute also reaches body portals. */
export function PhysicsMotionRoot() {
  const { enabled } = usePhysicsMotion();
  useEffect(() => {
    document.documentElement.dataset.physics = enabled ? "on" : "off";
    setPhysicsEnabled(enabled);
    return () => {
      document.documentElement.dataset.physics = "off";
      setPhysicsEnabled(false);
    };
  }, [enabled]);
  return null;
}
