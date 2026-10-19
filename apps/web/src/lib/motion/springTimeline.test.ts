/** Interruption tests convert normalized progress back to physical position and velocity. */
import { expect, it } from "vite-plus/test";
import { SpringTimeline } from "./springTimeline";
import { springToLinear } from "./springToLinear";
import { TOKENS } from "./tokens";

it("reversing a transition inherits velocity instead of restarting at rest", () => {
  const previous = new SpringTimeline(TOKENS.settle, 1000).at(1130);
  const position = previous.value * 100;
  const velocity = previous.velocity * 100;
  expect(position).toBeGreaterThan(0);
  expect(velocity).toBeGreaterThan(0);
  const distance = -position;
  const continued = new SpringTimeline(TOKENS.settle, 1130, velocity / distance);
  expect(continued.at(1130).value).toBe(0);
  expect(continued.at(1130).velocity * distance).toBeCloseTo(velocity, 10);
  // The reverse target must not erase forward momentum at the interruption.
  expect(continued.at(1130.1).value).toBeLessThan(0);
  expect(continued.at(1130.1).velocity * distance).toBeGreaterThan(0);
});

it("reads are independent of query order and finish with the baked duration", () => {
  const timeline = new SpringTimeline(TOKENS.fling, 50, 2);
  const early = timeline.at(100);
  timeline.at(300);
  expect(timeline.at(100)).toEqual(early);
  expect(timeline.at(49)).toEqual({ value: 0, velocity: 2 });
  const curve = springToLinear(TOKENS.fling, { initialVelocity: 2 });
  expect(timeline.at(50 + curve.durationMs)).toEqual({ value: 1, velocity: 0 });
});
