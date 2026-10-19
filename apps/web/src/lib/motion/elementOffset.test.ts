/** @vitest-environment jsdom */
/** Observable transforms keep layout and impact channels independent; DOM layout is a boundary fixture. */
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { clearOffset, flip, nudge, offsetOf, readOffset, stopOffset } from "./elementOffset";
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

it("stop hands off the last offset without writing or stopping another element", () => {
  const el = element();
  const other = element();
  flip(el, { left: 0, top: 40 });
  nudge(el, 200, -120);
  nudge(other, 100, 0);
  clock.advance(0);
  const before = readOffset(el);
  const painted = paintedOffset(el);
  const transform = el.style.transform;
  const returned = stopOffset(el);
  expect(returned).toEqual(before);
  expect(returned.x).toBeCloseTo(painted.x, 2);
  expect(returned.y).toBeCloseTo(painted.y, 2);
  expect(el.style.transform).toBe(transform);
  expect(activeJobs()).toBe(1);
  expect(readOffset(el)).toEqual({ x: 0, y: 0 });
  el.style.transform = "translate(12px, 34px)";
  clock.advance(16);
  setPhysicsEnabled(false);
  expect(el.style.transform).toBe("translate(12px, 34px)");
  expect(activeJobs()).toBe(0);
});

it("clear removes the transform and the pending task", () => {
  const el = element();
  flip(el, { left: 0, top: 0 });
  clock.advance(0);
  expect(el.style.transform).not.toBe("");
  clearOffset(el);
  expect(el.style.transform).toBe("");
  expect(activeJobs()).toBe(0);
  expect(clock.pending.size).toBe(0);
  clock.advance(16);
  expect(el.style.transform).toBe("");
});

it.each(["flip", "nudge"] as const)("%s restarts from zero after stopping", (kind) => {
  const el = element();
  const fresh = element();
  flip(el, { left: 0, top: 40 });
  nudge(el, 200, -120);
  clock.advance(0);
  stopOffset(el);
  // The new drag owner completes the handoff before requesting another animation.
  el.style.transform = "";
  const start =
    kind === "flip"
      ? (node: HTMLElement) => flip(node, { left: 50, top: 70 })
      : (node: HTMLElement) => nudge(node, -100, 80);
  start(el);
  start(fresh);
  clock.advance(16);
  expect(readOffset(el)).toEqual(readOffset(fresh));
  expect(el.style.transform).toBe(fresh.style.transform);
  expect(activeJobs()).toBe(2);
});

it("stopping an unknown element returns zero without scheduling or changing its transform", () => {
  const el = element();
  el.style.transform = "scale(2)";
  expect(stopOffset(el)).toEqual({ x: 0, y: 0 });
  expect(el.style.transform).toBe("scale(2)");
  expect(clock.request).not.toHaveBeenCalled();
});
