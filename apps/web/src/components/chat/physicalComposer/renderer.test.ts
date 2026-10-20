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

it("keeps rainbow focus colors in dark mode while particle hues stay colored", async () => {
  renderer.surface.dispatchEvent(new FocusEvent("focusin"));
  const stop = layer.querySelector("stop")!;
  expect(stop.getAttribute("stop-color")).toBe("hsl(200, 70%, 72%)");
  document.documentElement.classList.add("dark");
  await Promise.resolve();
  expect(stop.getAttribute("stop-color")).toBe("hsl(200, 70%, 72%)");
  renderer.model.burst(100, 20, 1, 200, 0, 1);
  renderer.pulse(100);
  clock.advance(16);
  expect(layer.querySelector<HTMLElement>("[data-physical-bit]")?.style.backgroundColor).toBe(
    "rgb(137, 206, 240)",
  );
});

it("finishes a long send snapshot within 0.6 seconds while new typing can coexist", () => {
  const snapshots = Array.from({ length: 30 }, (_, i) => ({
    text: "字",
    x: i * 12,
    y: 20,
    width: 12,
    height: 20,
    font: "16px sans-serif",
  }));
  renderer.send(snapshots);
  expect(layer.querySelectorAll("[data-physical-send]")).toHaveLength(30);
  renderer.insert(
    [{ text: "新", x: 20, y: 20, width: 16, height: 20, font: "16px sans-serif" }],
    new Set([0]),
  );
  expect(layer.querySelectorAll("[data-physical-send]")).toHaveLength(30);
  expect(layer.textContent).toContain("新");
  for (let time = 0; time <= 610; time += 10) clock.advance(time);
  expect(layer.querySelectorAll("[data-physical-send]")).toHaveLength(0);
});

it("makes newline an edge-only wave and keeps short-send staggering at 30ms", () => {
  renderer.wave();
  expect(renderer.model.top.v.some((value) => value > 0)).toBe(true);
  expect(renderer.model.bottom.v.some((value) => value > 0)).toBe(true);
  expect(renderer.model.bits.some((bit) => bit.active)).toBe(false);
  expect(layer.querySelectorAll("[data-physical-glyph]")).toHaveLength(0);
  renderer.send(
    ["a", "b"].map((text, i) => ({
      text,
      x: 20 + i * 10,
      y: 20,
      width: 10,
      height: 20,
      font: "16px sans-serif",
    })),
  );
  expect(renderer.model.glyphs.map((glyph) => glyph.delay)).toEqual([0.0001, 0.0301]);
  setPhysicsEnabled(false);
  expect(layer.querySelectorAll("[data-physical-send]")).toHaveLength(0);
  expect(activeJobs()).toBe(0);
});

it("keeps a newly measured falling glyph when auto-height delivers its resize notification", () => {
  const surface = renderer.surface;
  renderer.dispose();
  let deliver: ResizeObserverCallback = () => {};
  /** Browser resize delivery boundary; observeResize and the renderer remain real. */
  class TestResizeObserver {
    /** Capture the platform callback for explicit layout delivery. */
    constructor(callback: ResizeObserverCallback) {
      deliver = callback;
    }
    /** No native layout engine is present in jsdom. */
    observe() {}
    /** Release of an observed element has no platform resource in this fixture. */
    unobserve() {}
    /** End the fixture's platform subscription. */
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", TestResizeObserver);
  const geometry = vi
    .spyOn(surface, "getBoundingClientRect")
    .mockReturnValue(new DOMRect(0, 0, 768, 110));
  renderer = new PhysicalComposerRenderer(surface, layer);
  renderer.insert(
    [{ text: "字", x: 20, y: 45, width: 16, height: 20, font: "16px sans-serif" }],
    new Set([0]),
  );
  deliver(
    [
      {
        target: surface,
        contentRect: new DOMRect(0, 0, 768, 110),
        borderBoxSize: [],
        contentBoxSize: [],
        devicePixelContentBoxSize: [],
      },
    ],
    new TestResizeObserver(deliver),
  );
  expect(layer.querySelectorAll("[data-physical-glyph]")).toHaveLength(1);
  expect(renderer.model.glyphs[0]?.y).toBe(-15);
  geometry.mockRestore();
});
