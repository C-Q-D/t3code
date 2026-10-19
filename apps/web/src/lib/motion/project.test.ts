/** Projection expectations come from the motion contract and geometric fixtures. */
import { expect, it } from "vite-plus/test";
import {
  clipToBounds,
  fieldStrength,
  nearest,
  project,
  rubber,
  rubberClamp,
  strongestAt,
  throwTarget,
  tokenFor,
} from "./project";
import { DECEL } from "./tokens";

const target = {
  id: "composer",
  rect: { left: 190, right: 246, top: 0, bottom: 100 },
  fieldPx: 10,
};

it.each([
  [DECEL.normal, 299],
  [DECEL.fast, 59],
])("600 px/s with decay %s travels about %s px", (decel, expected) => {
  expect(Math.abs(project(600, decel) - expected)).toBeLessThanOrEqual(1);
  expect(Math.abs(project(-600, decel) + expected)).toBeLessThanOrEqual(1);
});

it("rubber is monotonic, signed and approaches its dimension without crossing it", () => {
  const values = [0, 10, 100, 1000, 1e9].map((value) => rubber(value, 100));
  expect(values[0]).toBe(0);
  expect(values.every((value, index) => index === 0 || value > values[index - 1]!)).toBe(true);
  expect(values.every((value) => value < 100)).toBe(true);
  expect(values.at(-1)).toBeCloseTo(100, 3);
  expect(rubber(-100, 100)).toBeCloseTo(-35.48387, 4);
  expect(rubberClamp(50, 0, 100, 100)).toBe(50);
  expect(rubberClamp(-100, 0, 100, 100)).toBeCloseTo(-35.48387, 4);
  expect(rubberClamp(200, 0, 100, 100)).toBeCloseTo(135.48387, 4);
});

it("release inside a magnetic field selects that target", () => {
  expect(throwTarget({ x: 187, y: 50 }, { x: -600, y: 0 }, [target])).toBe(target);
});
it("throw from outside the field is caught along the projected path", () => {
  expect(throwTarget({ x: 0, y: 50 }, { x: 600, y: 0 }, [target])).toBe(target);
});
it("a fast throw does not skip a narrow target between old sample points", () => {
  expect(throwTarget({ x: 0, y: 50 }, { x: 3600, y: 0 }, [target])).toBe(target);
});
it("a path missing every field returns null", () => {
  expect(throwTarget({ x: 0, y: 200 }, { x: 3600, y: 0 }, [target])).toBeNull();
});
it("landing mode can skip earlier columns but bounds stop it at the wall", () => {
  const columns = [0, 100, 200].map((left) => ({
    rect: { left, right: left + 100, top: 0, bottom: 100 },
    fieldPx: 10,
  }));
  expect(throwTarget({ x: 50, y: 50 }, { x: 400, y: 0 }, columns, { pick: "landing" })).toBe(
    columns[2],
  );
  expect(
    throwTarget({ x: 50, y: 50 }, { x: 400, y: 0 }, columns, {
      pick: "landing",
      bounds: { left: 0, right: 150, top: 0, bottom: 100 },
    }),
  ).toBe(columns[1]);
});
it("geometry helpers retain tie order, squared strength and first-wall clipping", () => {
  expect(nearest(5, [0, 10])).toBe(0);
  expect(nearest(5, [])).toBeUndefined();
  expect(fieldStrength(185, 50, target.rect, 10)).toBe(0.25);
  expect(strongestAt(185, 50, [target], 0.25)).toBeNull();
  expect(strongestAt(185, 50, [target], 0.24)).toBe(target);
  expect(
    clipToBounds(
      { x: 50, y: 50 },
      { x: 200, y: 125 },
      { left: 0, top: 0, right: 100, bottom: 100 },
    ),
  ).toEqual({ x: 100, y: 75 });
  expect(tokenFor(-51)).toEqual({ response: 0.46, damping: 0.8 });
  expect(tokenFor(50)).toEqual({ response: 0.4, damping: 1 });
});
