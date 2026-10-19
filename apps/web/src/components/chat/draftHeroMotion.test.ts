/** Guards signed physical velocity when a draft composer is retargeted. */
import { describe, expect, it } from "vite-plus/test";
import { draftHeroAxisSegments } from "./draftHeroMotion";
import { SpringTimeline } from "../../lib/motion/springTimeline";
import { TOKENS } from "../../lib/motion/tokens";

/** Read physical state from the additive springs, without duplicating their integrator. */
function readAxis(offset: number, velocity: number, elapsedMs: number) {
  return draftHeroAxisSegments(offset, velocity).reduce(
    (state, segment) => {
      const sample = new SpringTimeline(TOKENS.settle, 0, segment.initialVelocity).at(elapsedMs);
      return {
        position: state.position + segment.fromPx * (1 - sample.value),
        velocity: state.velocity - segment.fromPx * sample.velocity,
      };
    },
    { position: 0, velocity: 0 },
  );
}

describe("draftHeroAxisSegments", () => {
  it.each([
    { offset: -100, velocity: 300, normalized: 3 },
    { offset: 50, velocity: 300, normalized: -6 },
    { offset: -10, velocity: 1200, normalized: 120 },
  ])(
    "preserves $velocity px/s across a signed $offset px offset",
    ({ offset, velocity, normalized }) => {
      expect(draftHeroAxisSegments(offset, velocity)).toEqual([
        { fromPx: offset, initialVelocity: normalized },
      ]);
      expect(readAxis(offset, velocity, 0)).toEqual({ position: offset, velocity });
      expect(readAxis(offset, velocity, 2000)).toEqual({ position: 0, velocity: 0 });
    },
  );

  it("preserves momentum even when the new target equals the current position", () => {
    expect(readAxis(0, 300, 0)).toEqual({ position: 0, velocity: 300 });
    expect(readAxis(0, 300, 1).position).toBeGreaterThan(0);
    expect(readAxis(0, 300, 2000)).toEqual({ position: 0, velocity: 0 });
  });

  it("does not schedule an axis already at rest", () => {
    expect(draftHeroAxisSegments(0, 0)).toEqual([]);
  });
});
