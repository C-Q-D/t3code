/** Bake the same spring used by gestures into bounded-size CSS linear() curves. */
import { Spring } from "./spring";
import { TOKENS, type SpringToken } from "./tokens";

/** Baking accuracy and normalized initial velocity (whole transitions per second). */
export interface SpringLinearOptions {
  precision?: number;
  maxPoints?: number;
  initialVelocity?: number;
}

/** Select curvature-sensitive knots by repeatedly splitting the largest chord error.
 * Samples are equally spaced milliseconds; endpoints are retained and output never exceeds maxPoints.
 */
function simplify(samples: readonly number[], maxPoints: number) {
  const indices = [0, samples.length - 1];
  while (indices.length < maxPoints) {
    let largestError = 0.0005;
    let split = -1;
    let insertAt = -1;
    for (let segment = 1; segment < indices.length; segment++) {
      const from = indices[segment - 1]!;
      const to = indices[segment]!;
      for (let index = from + 1; index < to; index++) {
        const interpolated =
          samples[from]! + ((samples[to]! - samples[from]!) * (index - from)) / (to - from);
        const error = Math.abs(samples[index]! - interpolated);
        if (error > largestError) {
          largestError = error;
          split = index;
          insertAt = segment;
        }
      }
    }
    if (split === -1) break;
    indices.splice(insertAt, 0, split);
  }
  return indices;
}

/** Sample a positive, damped token every millisecond until position/velocity satisfy precision.
 * precision must be in (0, 1), maxPoints an integer in [2, 64], and initialVelocity finite.
 * Returns normalized CSS easing and milliseconds; throws RangeError for invalid input or no rest within 10 s.
 */
export function springToLinear(
  token: SpringToken,
  { precision = 0.01, maxPoints = 64, initialVelocity = 0 }: SpringLinearOptions = {},
) {
  if (
    !Number.isFinite(token.response) ||
    token.response <= 0 ||
    !Number.isFinite(token.damping) ||
    token.damping <= 0 ||
    !Number.isFinite(precision) ||
    precision <= 0 ||
    precision >= 1 ||
    !Number.isInteger(maxPoints) ||
    maxPoints < 2 ||
    maxPoints > 64 ||
    !Number.isFinite(initialVelocity)
  ) {
    throw new RangeError("Invalid spring curve parameters");
  }
  const spring = new Spring({ target: 1, token, velocity: initialVelocity, precision });
  const samples = [0];
  let durationMs = 0;
  do {
    spring.step(0.001);
    samples.push(spring.value);
    durationMs++;
  } while (!spring.isSettled && durationMs < 10_000);
  if (!spring.isSettled) throw new RangeError("Spring curve did not settle within 10 seconds");
  const indices = simplify(samples, maxPoints);
  const points = indices.map((index) => {
    if (index === 0) return "0";
    if (index === durationMs) return "1";
    return `${Number(samples[index]!.toFixed(5))} ${Number(((index / durationMs) * 100).toFixed(3))}%`;
  });
  return { easing: `linear(${points.join(", ")})`, durationMs };
}

export const MOTION_SETTLE_DURATION_MS = springToLinear(TOKENS.settle).durationMs;
export const MOTION_SNAP_DURATION_MS = springToLinear(TOKENS.snap).durationMs;
export const MOTION_FLING_DURATION_MS = springToLinear(TOKENS.fling).durationMs;
