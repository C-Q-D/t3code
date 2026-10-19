/** @vitest-environment jsdom */
/** Fake frames exercise real hook, spring and scheduler behavior at the painted DOM boundary. */
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { activeJobs } from "../lib/motion/loop";
import { setPhysicsEnabled } from "../lib/motion/preference";
import { installTestRaf } from "../lib/motion/testRaf";
import { useAnimatedNumber } from "./useAnimatedNumber";

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

/** The accessible truth stays on React props while the hook owns visual text and fill. */
function Meter({ value }: { value: number }) {
  const text = useRef<HTMLSpanElement>(null);
  const fill = useRef<HTMLSpanElement>(null);
  useAnimatedNumber(text, value, String, fill);
  return (
    <div role="meter" aria-valuenow={value} aria-label={`${value}%`}>
      <span ref={text} aria-hidden />
      <span ref={fill} aria-hidden />
    </div>
  );
}

/** Commit a new target, preserving the mounted hook and DOM nodes. */
function render(value: number) {
  act(() => root.render(<Meter value={value} />));
}

/** Sample deterministic frames; assertions use the requested endpoints, not spring calculations. */
function sample(start: number) {
  return Array.from({ length: 120 }, (_, index) => {
    clock.advance(start + index * 16);
    return Number(host.querySelector("span")!.textContent);
  });
}

it.each<[number, number, string]>([
  [0, 100, "scaleX(1)"],
  [100, 0, "scaleX(0)"],
  [0, 100000, "scaleX(1)"],
])("moves monotonically from %s to %s and stops exactly", (from, to, fill) => {
  render(from);
  render(to);
  const values = sample(0);
  const direction = Math.sign(to - from);
  expect((values[0]! - from) * direction).toBeGreaterThan(0);
  expect((to - values[0]!) * direction).toBeGreaterThan(0);
  expect(values.every((value, i) => (value - (values[i - 1] ?? from)) * direction >= 0)).toBe(true);
  expect(values.every((value) => (to - value) * direction >= 0)).toBe(true);
  expect(values.at(-1)).toBe(to);
  expect(host.querySelectorAll("span")[1]!.style.transform).toBe(fill);
  expect(activeJobs()).toBe(0);
  expect(clock.pending.size).toBe(0);
});

it("keeps accessible truth while retargeting a running animation", () => {
  render(0);
  render(100);
  clock.advance(0);
  const before = Number(host.querySelector("span")!.textContent);
  render(-20);
  expect(host.firstElementChild!.getAttribute("aria-valuenow")).toBe("-20");
  expect(host.firstElementChild!.getAttribute("aria-label")).toBe("-20%");
  expect(Number(host.querySelector("span")!.textContent)).toBe(before);
  const values = sample(16);
  expect(values.every((value, i) => value <= (values[i - 1] ?? before) && value >= -20)).toBe(true);
  expect(values.at(-1)).toBe(-20);
});

it("writes the target with no task when disabled", () => {
  setPhysicsEnabled(false);
  render(10);
  render(90);
  expect(host.querySelector("span")!.textContent).toBe("90");
  expect(activeJobs()).toBe(0);
  expect(clock.request).not.toHaveBeenCalled();
});

it("finishes immediately when disabled mid-flight and cancels on unmount", () => {
  render(0);
  render(100);
  clock.advance(0);
  setPhysicsEnabled(false);
  expect(host.querySelector("span")!.textContent).toBe("100");
  expect(activeJobs()).toBe(0);
  setPhysicsEnabled(true);
  render(50);
  act(() => root.unmount());
  expect(activeJobs()).toBe(0);
  expect(clock.pending.size).toBe(0);
});
