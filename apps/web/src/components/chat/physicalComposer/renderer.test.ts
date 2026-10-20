/** Exercises real rendering and shared clock lifetime; only the browser frame boundary is controlled. */
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { activeJobs } from "../../../lib/motion/loop";
import { setPhysicsEnabled } from "../../../lib/motion/preference";
import { installTestRaf } from "../../../lib/motion/testRaf";
import { PhysicalComposerRenderer } from "./renderer";

let renderer: PhysicalComposerRenderer;
let layer: HTMLDivElement;
let clock: ReturnType<typeof installTestRaf>;
beforeEach(() => {
  clock = installTestRaf();
  setPhysicsEnabled(true);
  const surface = document.createElement("div");
  layer = document.createElement("div");
  surface.append(layer);
  document.body.append(surface);
  renderer = new PhysicalComposerRenderer(surface, layer);
});
afterEach(() => {
  renderer.dispose();
  setPhysicsEnabled(false);
  document.body.replaceChildren();
  document.documentElement.classList.remove("dark");
  vi.unstubAllGlobals();
});

it("stops the shared clock when edges, particles and heat settle", () => {
  renderer.pulse(100);
  expect(activeJobs()).toBe(1);
  for (let time = 0; time < 20_000; time += 16) clock.advance(time);
  expect(activeJobs()).toBe(0);
  expect(clock.pending.size).toBe(0);
});

it("immediately releases hidden real text and in-flight shadows when physics is disabled", () => {
  const restore = vi.fn();
  renderer.insert(
    [{ text: "字", x: 20, y: 20, width: 16, height: 20, font: "16px sans-serif", restore }],
    new Set([0]),
  );
  expect(layer.querySelectorAll("[data-physical-glyph]")).toHaveLength(1);
  expect(activeJobs()).toBe(1);
  setPhysicsEnabled(false);
  expect(layer.querySelectorAll("[data-physical-glyph]")).toHaveLength(0);
  expect(restore).toHaveBeenCalledOnce();
  expect(activeJobs()).toBe(0);
  renderer.pulse(100);
  expect(activeJobs()).toBe(0);
});

it("keeps the same 180 particle DOM nodes through repeated bursts and disable", () => {
  const slots = [...layer.querySelectorAll<HTMLElement>("[data-physical-bit]")];
  expect(slots).toHaveLength(180);
  for (let i = 0; i < 100; i++) {
    renderer.model.burst(100, 20, 8, 200, 0, 1);
    renderer.pulse(100);
    clock.advance(i * 16);
  }
  expect([...layer.querySelectorAll("[data-physical-bit]")]).toEqual(slots);
  expect(slots.some((slot) => Number(slot.style.opacity) > 0)).toBe(true);
  setPhysicsEnabled(false);
  expect(slots.every((slot) => slot.style.opacity === "0")).toBe(true);
  expect([...layer.querySelectorAll("[data-physical-bit]")]).toEqual(slots);
});

it("uses white dark-mode focus colors while leaving particle hues colored", async () => {
  renderer.surface.dispatchEvent(new FocusEvent("focusin"));
  const stop = layer.querySelector("stop")!;
  expect(stop.getAttribute("stop-color")).toBe("hsl(200, 70%, 72%)");
  document.documentElement.classList.add("dark");
  await Promise.resolve();
  expect(stop.getAttribute("stop-color")).toBe("#FFFFFF");
  renderer.model.burst(100, 20, 1, 200, 0, 1);
  renderer.pulse(100);
  clock.advance(16);
  expect(layer.querySelector<HTMLElement>("[data-physical-bit]")?.style.backgroundColor).not.toBe(
    "rgb(255, 255, 255)",
  );
});
