/** CSS artifacts must match the mathematical source, while duration and shape remain independently bounded. */
// @effect-diagnostics nodeBuiltinImport:off - this Node-only artifact test must read the shipped CSS bytes.
import * as NodeFS from "node:fs";
import { compile } from "tailwindcss";
import { expect, it } from "vite-plus/test";
import {
  MOTION_FLING_DURATION_MS,
  MOTION_SETTLE_DURATION_MS,
  MOTION_SNAP_DURATION_MS,
  springToLinear,
} from "./springToLinear";
import { SpringTimeline } from "./springTimeline";
import { TOKENS } from "./tokens";

const cssPath = new URL("../../styles/motion.css", import.meta.url);

it.each([
  ["settle", 350, 600, MOTION_SETTLE_DURATION_MS],
  ["snap", 200, 350, MOTION_SNAP_DURATION_MS],
  ["fling", 400, 700, MOTION_FLING_DURATION_MS],
] as const)(
  "%s CSS literals and duration match the generator",
  (name, min, max, exportedDuration) => {
    const css = NodeFS.readFileSync(cssPath, "utf8");
    const { easing, durationMs } = springToLinear(TOKENS[name]);
    const literal = css
      .match(new RegExp(`--ease-${name}:\\s*([^;]+);`))?.[1]
      ?.replace(/\s+/g, " ")
      .replace(/\(\s+/g, "(")
      .replace(/\s+\)/g, ")")
      .trim();
    expect(literal).toBe(easing);
    expect(css.match(new RegExp(`--motion-${name}-duration:\\s*(\\d+)ms;`))?.[1]).toBe(
      String(durationMs),
    );
    expect(exportedDuration).toBe(durationMs);
    expect(durationMs).toBeGreaterThanOrEqual(min);
    expect(durationMs).toBeLessThanOrEqual(max);
    expect(easing.split(",").length).toBeLessThanOrEqual(64);
  },
);

it("curvature sampling retains the spring trajectory within one tenth of a percent", () => {
  const { easing, durationMs } = springToLinear(TOKENS.fling);
  const points = easing
    .slice(7, -1)
    .split(", ")
    .map((point, index, all) => {
      const [value, percent] = point.split(" ");
      return {
        value: Number(value),
        time: percent
          ? (parseFloat(percent) * durationMs) / 100
          : index === all.length - 1
            ? durationMs
            : 0,
      };
    });
  const timeline = new SpringTimeline(TOKENS.fling, 0);
  const errors = Array.from({ length: durationMs + 1 }, (_, time) => {
    const end = points.findIndex((point) => point.time >= time);
    if (end === 0) return Math.abs(points[0]!.value);
    const a = points[end - 1]!;
    const b = points[end]!;
    const value = a.value + ((b.value - a.value) * (time - a.time)) / (b.time - a.time);
    return Math.abs(value - timeline.at(time).value);
  });
  expect(Math.max(...errors)).toBeLessThan(0.001);
  expect(Math.max(...points.map((point) => point.value))).toBeGreaterThan(1);
  expect(points[0]).toEqual({ value: 0, time: 0 });
  expect(points.at(-1)).toEqual({ value: 1, time: durationMs });
});

it("point budget is honored and incoming velocity changes the baked path", () => {
  const resting = springToLinear(TOKENS.settle);
  const moving = springToLinear(TOKENS.settle, { initialVelocity: -3, maxPoints: 16 });
  expect(moving.easing.split(",").length).toBeLessThanOrEqual(16);
  expect(moving.easing).toMatch(/, -/);
  expect(moving.easing).not.toBe(resting.easing);
  expect(() => springToLinear(TOKENS.settle, { maxPoints: 65 })).toThrow(RangeError);
});

it("Tailwind compiles physics and legacy reduced-motion variants from the shipped CSS", async () => {
  const css = NodeFS.readFileSync(cssPath, "utf8");
  const compiler = await compile(`${css}\n@tailwind utilities;`);
  const built = compiler.build(["physics:[opacity:1]", "legacy:motion-reduce:transition-none"]);
  expect(built).toContain(':root[data-physics="on"] *');
  expect(built).toContain(':root:not([data-physics="on"]) *');
  expect(built).toContain("prefers-reduced-motion: reduce");
  expect(built).toContain("transition-property: none");
  expect(built).toContain("opacity: 1");
  expect(built).not.toContain("@custom-variant");
});
