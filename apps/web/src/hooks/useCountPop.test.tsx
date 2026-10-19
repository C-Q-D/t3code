/** @vitest-environment jsdom */
/** Real spring and lifecycle tests observe badge scale through a deterministic browser clock. */
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { activeJobs } from "../lib/motion/loop";
import { setPhysicsEnabled } from "../lib/motion/preference";
import { installTestRaf } from "../lib/motion/testRaf";
import { useCountPop } from "./useCountPop";

let host: HTMLDivElement;
let root: Root;
let clock: ReturnType<typeof installTestRaf>;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  clock = installTestRaf();
  setPhysicsEnabled(true);
  host = document.createElement("div");
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  setPhysicsEnabled(false);
  vi.unstubAllGlobals();
});

/** Changing the key represents the stash badge's existing fade-in remount. */
function Badge({ count, pulse = 0 }: { count: number; pulse?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useCountPop(ref, count);
  return (
    <span ref={ref} key={pulse}>
      {count}
    </span>
  );
}

/** Commit count and optional fade identity on the same hook owner. */
function render(count: number, pulse = 0) {
  act(() => root.render(<Badge count={count} pulse={pulse} />));
}

/** Read the DOM scale; the empty transform is the CSS identity. */
function scale() {
  return Number(host.querySelector("span")!.style.transform.match(/scale\(([^)]+)\)/)?.[1] ?? 1);
}

it("pops an increasing count to about 1.18 then stops at identity, including remounts", () => {
  render(1);
  expect(clock.request).not.toHaveBeenCalled();
  render(2, 1);
  const values = Array.from({ length: 120 }, (_, index) => {
    clock.advance(index * 16);
    return scale();
  });
  expect(Math.max(...values)).toBeGreaterThan(1.15);
  expect(Math.max(...values)).toBeLessThan(1.21);
  expect(values.at(-1)).toBe(1);
  expect(host.textContent).toBe("2");
  expect(activeJobs()).toBe(0);
  expect(clock.pending.size).toBe(0);
});

it("does not schedule on a decrease or unchanged count", () => {
  render(3);
  render(2);
  render(2, 1);
  expect(scale()).toBe(1);
  expect(clock.request).not.toHaveBeenCalled();
});

it("does not pop when physics is off", () => {
  setPhysicsEnabled(false);
  render(1);
  render(2);
  expect(scale()).toBe(1);
  expect(clock.request).not.toHaveBeenCalled();
});

it("clears a running pop on disable and releases work on unmount", () => {
  render(1);
  render(2);
  clock.advance(0);
  expect(scale()).toBeGreaterThan(1);
  setPhysicsEnabled(false);
  expect(scale()).toBe(1);
  expect(activeJobs()).toBe(0);
  setPhysicsEnabled(true);
  render(3);
  expect(activeJobs()).toBe(1);
  act(() => root.unmount());
  expect(activeJobs()).toBe(0);
  expect(clock.pending.size).toBe(0);
});
