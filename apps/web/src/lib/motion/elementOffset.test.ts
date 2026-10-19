/** @vitest-environment jsdom */
/** Observable transforms keep layout and impact channels independent; DOM layout is a boundary fixture. */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { flip, nudge, offsetOf, readOffset } from "./elementOffset";
import { activeJobs } from "./loop";
import { setPhysicsEnabled } from "./preference";
import { installTestRaf } from "./testRaf";

let clock: ReturnType<typeof installTestRaf>;
beforeEach(() => {
  clock = installTestRaf();
  setPhysicsEnabled(true);
});
afterEach(() => {
  setPhysicsEnabled(false);
  vi.unstubAllGlobals();
});

/** Place a real styled node at a known layout rectangle; jsdom has no layout engine. */
function element() {
  const el = document.createElement("div");
  el.getBoundingClientRect = () => new DOMRect(100, 100, 100, 100);
  return el;
}

/** Read the rendered pixel translation, including the cleared resting transform. */
function paintedOffset(el: HTMLElement) {
  const coordinates = el.style.transform.match(/-?\d+(?:\.\d+)?/g);
  return { x: Number(coordinates?.[0] ?? 0), y: Number(coordinates?.[1] ?? 0) };
}

it("layout plus impulse equals their independent trajectories and clears at rest", () => {
  const layout = element();
  const impact = element();
  const combined = element();
  flip(layout, { left: 0, top: 40 });
  nudge(impact, 200, -120);
  flip(combined, { left: 0, top: 40 });
  nudge(combined, 200, -120);
  const errors = Array.from({ length: 120 }, (_, index) => {
    clock.advance((index * 1000) / 60);
    const a = paintedOffset(layout);
    const b = paintedOffset(impact);
    const c = paintedOffset(combined);
    return Math.max(Math.abs(c.x - a.x - b.x), Math.abs(c.y - a.y - b.y));
  });
  expect(Math.max(...errors)).toBeLessThan(0.03);
  expect(combined.style.transform).toBe("");
  expect(activeJobs()).toBe(0);
});

it("disabled physics leaves existing transforms alone and registers no job", () => {
  setPhysicsEnabled(false);
  const el = element();
  el.style.transform = "scale(2)";
  flip(el, { left: 0, top: 0 });
  nudge(el, 200, 100);
  offsetOf(el);
  expect(el.style.transform).toBe("scale(2)");
  expect(readOffset(el)).toEqual({ x: 0, y: 0 });
  expect(activeJobs()).toBe(0);
  expect(clock.request).not.toHaveBeenCalled();
});

it("release injects velocity and turning physics off cancels active offsets", () => {
  const el = element();
  flip(el, { left: 100, top: 100 }, undefined, { x: 400, y: -200 });
  expect(offsetOf(el).x.velocity).toBe(400);
  expect(offsetOf(el).y.velocity).toBe(-200);
  clock.advance(0);
  expect(readOffset(el).x).toBeGreaterThan(0);
  expect(readOffset(el).y).toBeLessThan(0);
  expect(el.style.transform).toMatch(/^translate\(/);
  setPhysicsEnabled(false);
  expect(el.style.transform).toBe("");
  expect(readOffset(el)).toEqual({ x: 0, y: 0 });
  expect(clock.pending.size).toBe(0);
});
