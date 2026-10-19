/** Inertial projection, elastic bounds and magnetic selection in a shared CSS pixel coordinate space. */
import { DECEL, TOKENS } from "./tokens";

/** A point in CSS pixels, or vector in pixels/second when used as velocity. */
export interface Point {
  x: number;
  y: number;
}
/** Axis-aligned bounds in the same coordinate space as the point. */
export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
/** Target geometry and positive magnetic reach in CSS pixels; callers may attach identity fields. */
export interface ThrowTarget {
  rect: Bounds;
  fieldPx: number;
}
/** Projection and sampling policy; positive sample count/spacing and thresholds in [0, 1]. */
export interface ThrowOptions {
  decel?: number;
  samples?: number;
  maxStepPx?: number;
  nearThreshold?: number;
  pathThreshold?: number;
  pick?: "path" | "landing";
  bounds?: Bounds | null;
}

/** Return travel in pixels for velocity in px/s and per-millisecond decay (strictly between 0 and 1). */
export function project(velocity: number, decel: number = DECEL.normal) {
  return ((velocity / 1000) * decel) / (1 - decel);
}

/** Compress signed overshoot toward positive dimension, with positive resistance coefficient. */
export function rubber(overshoot: number, dimension: number, coeff = 0.55) {
  return (
    Math.sign(overshoot) * (1 - 1 / ((Math.abs(overshoot) * coeff) / dimension + 1)) * dimension
  );
}

/** Preserve movement inside ordered min/max bounds; compress excess toward dimension pixels. */
export function rubberClamp(value: number, min: number, max: number, dimension: number) {
  if (value < min) return min + rubber(value - min, dimension);
  if (value > max) return max + rubber(value - max, dimension);
  return value;
}

/** Return the closest candidate, preferring the first on ties; an empty list returns undefined. */
export function nearest(value: number, candidates: readonly number[]) {
  return candidates.reduce<number | undefined>(
    (best, candidate) =>
      best === undefined || Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best,
    undefined,
  );
}

/** Return squared attraction (0..1) for a point and target with positive field radius. */
export function fieldStrength(x: number, y: number, rect: Bounds, fieldPx: number) {
  const dx = Math.max(rect.left - x, 0, x - rect.right);
  const dy = Math.max(rect.top - y, 0, y - rect.bottom);
  const strength = Math.min(1, Math.max(0, 1 - Math.hypot(dx, dy) / fieldPx));
  return strength * strength;
}

/** Return the original target with greatest attraction strictly above threshold, or null. */
export function strongestAt<T extends ThrowTarget>(
  x: number,
  y: number,
  targets: readonly T[],
  threshold: number,
): T | null {
  let best: T | null = null;
  let bestStrength = threshold;
  for (const target of targets) {
    const strength = fieldStrength(x, y, target.rect, target.fieldPx);
    if (strength > bestStrength) {
      best = target;
      bestStrength = strength;
    }
  }
  return best;
}

/** Clip a segment beginning inside bounds at its first wall, returning its end point. */
export function clipToBounds(start: Point, end: Point, bounds: Bounds) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  let t = 1;
  if (dx > 0 && end.x > bounds.right) t = Math.min(t, (bounds.right - start.x) / dx);
  if (dx < 0 && end.x < bounds.left) t = Math.min(t, (bounds.left - start.x) / dx);
  if (dy > 0 && end.y > bounds.bottom) t = Math.min(t, (bounds.bottom - start.y) / dy);
  if (dy < 0 && end.y < bounds.top) t = Math.min(t, (bounds.top - start.y) / dy);
  t = Math.max(0, t);
  return { x: start.x + dx * t, y: start.y + dy * t };
}

/** Select a target from release position and px/s momentum, returning its original identity or null.
 * Path mode prefers the release field then the first path hit; landing mode first tries the projected end.
 * maxStepPx bounds spatial sampling gaps so fast throws do not skip narrow targets.
 */
export function throwTarget<T extends ThrowTarget>(
  start: Point,
  velocity: Point,
  targets: readonly T[],
  {
    decel = DECEL.normal,
    samples = 12,
    maxStepPx = 24,
    nearThreshold = 0.12,
    pathThreshold = 0.3,
    pick = "path",
    bounds = null,
  }: ThrowOptions = {},
): T | null {
  let end = { x: start.x + project(velocity.x, decel), y: start.y + project(velocity.y, decel) };
  if (bounds) end = clipToBounds(start, end, bounds);
  if (pick === "landing") {
    const landing = strongestAt(end.x, end.y, targets, nearThreshold);
    if (landing) return landing;
  }
  const near = strongestAt(start.x, start.y, targets, nearThreshold);
  if (near) return near;
  const steps = Math.max(
    samples,
    Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / maxStepPx),
  );
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = start.x + (end.x - start.x) * t;
    const y = start.y + (end.y - start.y) * t;
    for (const target of targets) {
      if (fieldStrength(x, y, target.rect, target.fieldPx) > pathThreshold) return target;
    }
  }
  return null;
}

/** Use fling only when absolute velocity in px/s exceeds threshold; otherwise use settle. */
export function tokenFor(velocity: number, threshold = 50) {
  return Math.abs(velocity) > threshold ? TOKENS.fling : TOKENS.settle;
}
