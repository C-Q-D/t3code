/** Verifies image scrolling and anchored zoom through DOM input; only browser geometry and time are simulated.
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { setPhysicsEnabled } from "~/lib/motion/preference";
import { installTestRaf } from "~/lib/motion/testRaf";
import { ZoomableImage } from "./ZoomableImage";

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let viewport: HTMLDivElement;
let img: HTMLImageElement;
let now: number;
let clock: ReturnType<typeof installTestRaf>;

/** Browser affine-transform geometry for this fixture, independent of the component's zoom calculations. */
function imageRect() {
  const scale = Number(/scale\(([-.\d]+)\)/.exec(img.style.transform)?.[1] ?? 1);
  const translation = /translate\(([-.\d]+)px, ([-.\d]+)px\)/.exec(img.style.transform);
  const [originX = 0, originY = 0] = img.style.transformOrigin
    .split(" ")
    .map((value) => Number.parseFloat(value) || 0);
  return new DOMRect(
    20 - viewport.scrollLeft + originX * (1 - scale) + Number(translation?.[1] ?? 0),
    30 - viewport.scrollTop + originY * (1 - scale) + Number(translation?.[2] ?? 0),
    Number.parseFloat(img.style.width) * scale,
    Number.parseFloat(img.style.height) * scale,
  );
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("innerWidth", 1200);
  vi.stubGlobal("innerHeight", 1000);
  setPhysicsEnabled(false);
  clock = installTestRaf();
  now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(<ZoomableImage src="test.png" name="Test" onError={vi.fn()} />),
  );
  viewport = host.querySelector('[role="region"]')!;
  img = host.querySelector("img")!;
  Object.defineProperties(img, { naturalWidth: { value: 400 }, naturalHeight: { value: 300 } });
  Object.defineProperties(viewport, {
    clientWidth: { value: 400 },
    clientHeight: { value: 300 },
    scrollWidth: { get: () => Number.parseFloat(img.style.width) },
    scrollHeight: { get: () => Number.parseFloat(img.style.height) },
    setPointerCapture: { value: vi.fn() },
    hasPointerCapture: { value: () => true },
    releasePointerCapture: { value: vi.fn() },
  });
  vi.spyOn(viewport, "getBoundingClientRect").mockImplementation(
    () => new DOMRect(20, 30, 400, 300),
  );
  vi.spyOn(img, "getBoundingClientRect").mockImplementation(imageRect);
  await act(async () => img.dispatchEvent(new Event("load")));
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  setPhysicsEnabled(false);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** Dispatches captured mouse input with explicit time controlled by each scenario. */
async function pointer(type: string, x: number) {
  await act(async () => {
    const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: 150, button: 0 });
    Object.defineProperties(event, { pointerId: { value: 1 }, pointerType: { value: "mouse" } });
    viewport.dispatchEvent(event);
  });
}

/** Advances the browser clock by frames; the real motion loop decides when to stop. */
async function advanceFrames() {
  await act(async () => {
    for (now = 56; now <= 2056; now += 16) clock.advance(now);
  });
}

it.each([true, false])(
  "physics %s continues a released pan only while enabled",
  async (enabled) => {
    await act(async () =>
      viewport.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })),
    );
    viewport.scrollLeft = 100;
    setPhysicsEnabled(enabled);
    await pointer("pointerdown", 250);
    now = 40;
    await pointer("pointermove", 150);
    await pointer("pointerup", 150);
    expect(viewport.scrollLeft).toBe(200);
    await advanceFrames();
    expect(viewport.scrollLeft).toBe(enabled ? 400 : 200);
    expect(clock.pending.size).toBe(0);
  },
);

it("takes over an inertial pan at the current scroll position", async () => {
  await act(async () =>
    viewport.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })),
  );
  viewport.scrollLeft = 100;
  setPhysicsEnabled(true);
  await pointer("pointerdown", 250);
  now = 40;
  await pointer("pointermove", 150);
  await pointer("pointerup", 150);
  await act(async () => clock.advance(56));
  const flying = viewport.scrollLeft;
  expect(flying).toBeGreaterThan(200);
  await pointer("pointerdown", 150);
  expect(clock.pending.size).toBe(0);
  await pointer("pointermove", 140);
  expect(viewport.scrollLeft).toBeCloseTo(flying + 10);
});

it("animates click zoom without moving the image point under the cursor", async () => {
  setPhysicsEnabled(true);
  await act(async () =>
    viewport.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 120, clientY: 130 })),
  );
  expect(viewport.scrollLeft).toBe(100);
  expect(img.style.transform).toContain("scale(0.5)");
  expect(img.style.transformOrigin).toBe("200px 200px");
  expect(imageRect().left + imageRect().width / 4).toBeCloseTo(120);
  await act(async () => clock.advance(16));
  expect(imageRect().width).toBeGreaterThan(400);
  expect(imageRect().width).toBeLessThan(800);
  expect(imageRect().left + imageRect().width / 4).toBeCloseTo(120);
  await advanceFrames();
  expect(img.style.transform).toBe("");
  expect(Number.parseFloat(img.style.width) - viewport.scrollLeft).toBe(700);
  expect(clock.pending.size).toBe(0);
});

it("starts panning from the visible size and position when a zoom is interrupted", async () => {
  setPhysicsEnabled(true);
  await act(async () =>
    viewport.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 120, clientY: 130 })),
  );
  await act(async () => clock.advance(16));
  const visible = imageRect();
  await pointer("pointerdown", 250);
  expect(clock.pending.size).toBe(0);
  expect(imageRect().width).toBeCloseTo(visible.width);
  expect(imageRect().left).toBeCloseTo(visible.left);
  await pointer("pointermove", 240);
  expect(imageRect().left).toBeCloseTo(visible.left - 10);
});

it.each([
  { boundary: "minimum", setupDelta: 0, delta: 100, width: 400, minScale: 0.5, maxScale: 1 },
  { boundary: "maximum", setupDelta: -2000, delta: -100, width: 3200, minScale: 1, maxScale: 1.5 },
])(
  "rebounds at $boundary zoom after the wheel rests without changing layout zoom",
  async ({ setupDelta, delta, width, minScale, maxScale }) => {
    await act(async () =>
      viewport.dispatchEvent(
        new WheelEvent("wheel", {
          deltaY: setupDelta,
          clientX: 120,
          clientY: 130,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    setPhysicsEnabled(true);
    await act(async () =>
      viewport.dispatchEvent(
        new WheelEvent("wheel", {
          deltaY: delta,
          clientX: 120,
          clientY: 130,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    expect(Number.parseFloat(img.style.width)).toBe(width);
    const scale = Number(/scale\(([-.\d]+)\)/.exec(img.style.transform)?.[1]);
    expect(scale).toBeGreaterThan(minScale);
    expect(scale).toBeLessThan(maxScale);
    await act(async () => vi.advanceTimersByTime(150));
    await advanceFrames();
    expect(img.style.transform).toBe("");
    expect(clock.pending.size).toBe(0);
  },
);
