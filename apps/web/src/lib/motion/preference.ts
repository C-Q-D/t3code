/** Shared motion preference for React and imperative consumers; hydration defaults to disabled. */

/** Local K1 mode; L1 will connect the matching contracts setting. */
export type PhysicsMotionMode = "on" | "system" | "off";

let enabled = false;
const listeners = new Set<(enabled: boolean) => void>();

/** Resolve a hydrated mode: explicit on overrides reduction; system follows it; off never animates. */
export function resolvePhysicsMotion({
  mode,
  prefersReducedMotion,
  hydrated,
}: {
  mode: PhysicsMotionMode;
  prefersReducedMotion: boolean;
  hydrated: boolean;
}) {
  return hydrated && (mode === "on" || (mode === "system" && !prefersReducedMotion));
}

/** Publish effective permission to animate, notifying subscribers only on transitions. */
export function setPhysicsEnabled(value: boolean) {
  if (enabled === value) return;
  enabled = value;
  for (const listener of [...listeners]) listener(value);
}

export function isPhysicsEnabled() {
  return enabled;
}

/** Subscribe to future effective-mode changes; return an idempotent unsubscribe function. */
export function onPhysicsChange(listener: (enabled: boolean) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
