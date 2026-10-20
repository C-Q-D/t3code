/** @vitest-environment jsdom */
/** Pointer pickup contracts run against real DOM dispatch, springs and velocity; only layout and rAF are fixtures. */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import {
  beginComposerThrowDrag,
  ComposerThrowToken,
  launchComposerThrow,
} from "./ComposerThrowToken";
import { activeJobs } from "../../lib/motion/loop";
import { setPhysicsEnabled } from "../../lib/motion/preference";
import { installTestRaf } from "../../lib/motion/testRaf";
import { Spring } from "../../lib/motion/spring";

let clock: ReturnType<typeof installTestRaf>;
let root: Root;
let form: HTMLFormElement;
let onLand: ReturnType<typeof vi.fn<(form: HTMLElement) => void>>;
let time: number;

/** Construct viewport pointer samples with explicit milliseconds, independent of test execution speed. */
function pointer(type: string, x: number, y: number, timestamp: number, pointerId = 1) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: x,
    clientY: y,
  });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    timeStamp: { value: timestamp },
  });
  return event as PointerEvent;
}

/** Start the public pickup with a 10px grab offset; give jsdom the real card's nonzero layout size. */
function pickup(x = 30, y = 40) {
  let cancel = () => {};
  act(() => {
    cancel = beginComposerThrowDrag({
      channel: "mention",
      label: "src/example.ts",
      event: pointer("pointerdown", x, y, 0),
      origin: { x: x - 10, y: y - 10 },
      onLand,
    });
  });
  const token = document.querySelector<HTMLDivElement>("[data-composer-throw-token]")!;
  Object.defineProperties(token, {
    offsetWidth: { value: 100 },
    offsetHeight: { value: 40 },
  });
  return { token, cancel };
}

/** Read visible CSS pose, not internal spring state; fail if the portal did not paint its transform. */
function pose(token: HTMLElement) {
  const match = token.style.transform.match(
    /translate\(([-\d.e]+)px, ([-\d.e]+)px\) rotate\(([-\d.e]+)deg\) scale\(([-\d.e]+)\)/,
  );
  expect(match).not.toBeNull();
  return {
    x: Number(match![1]),
    y: Number(match![2]),
    tilt: Number(match![3]),
    scale: Number(match![4]),
  };
}

/** Drain the real demand-driven jobs, requiring rest within ten simulated seconds. */
function settle() {
  act(() => {
    for (let frame = 0; frame < 600 && clock.pending.size; frame++) {
      time += 1000 / 60;
      clock.advance(time);
    }
  });
  expect(activeJobs()).toBe(0);
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  clock = installTestRaf();
  time = 0;
  setPhysicsEnabled(true);
  onLand = vi.fn();
  form = document.createElement("form");
  form.setAttribute("data-thread-context-drop", "true");
  form.getBoundingClientRect = () => new DOMRect(400, 200, 200, 100);
  document.body.append(form);
  root = createRoot(document.createElement("div"));
  act(() => root.render(createElement(ComposerThrowToken, { channel: "mention" })));
});

afterEach(() => {
  act(() => {
    root.unmount();
    setPhysicsEnabled(false);
  });
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("paints every pointermove synchronously without advancing a frame or replacing the card", () => {
  const { token } = pickup();
  document.dispatchEvent(pointer("pointermove", 60, 70, 20));
  expect(pose(token)).toMatchObject({ x: 50, y: 60 });
  document.dispatchEvent(pointer("pointermove", 85, 90, 40));
  expect(pose(token)).toMatchObject({ x: 75, y: 80 });
  document.dispatchEvent(pointer("pointermove", 100, 110, 60));
  expect(pose(token)).toMatchObject({ x: 90, y: 100 });
  expect(document.querySelector("[data-composer-throw-token]")).toBe(token);
  expect(onLand).not.toHaveBeenCalled();
});

it("advances pose springs by actual 144Hz intervals between pointer moves and restarts after rest", () => {
  // Observe the real integrator without replacing it: both pose springs must receive elapsed
  // frame time even when a move changes their targets between consecutive browser frames.
  const step = vi.spyOn(Spring.prototype, "step");
  const { token } = pickup();
  document.dispatchEvent(pointer("pointermove", 70, 40, 20));
  act(() => clock.advance(0));
  document.dispatchEvent(pointer("pointermove", 90, 40, 26.944));
  act(() => clock.advance(6.944));
  document.dispatchEvent(pointer("pointermove", 110, 40, 33.888));
  act(() => clock.advance(13.888));
  document.dispatchEvent(pointer("pointermove", 130, 40, 40.832));
  act(() => clock.advance(20.832));
  expect(step.mock.calls.map(([dt]) => dt)).toEqual([
    expect.closeTo(1 / 60, 10),
    expect.closeTo(1 / 60, 10),
    expect.closeTo(0.006944, 10),
    expect.closeTo(0.006944, 10),
    expect.closeTo(0.006944, 10),
    expect.closeTo(0.006944, 10),
    expect.closeTo(0.006944, 10),
    expect.closeTo(0.006944, 10),
  ]);
  time = 20.832;
  settle();
  expect(pose(token)).toMatchObject({ tilt: 7, scale: 1.05 });
  document.dispatchEvent(pointer("pointermove", 0, 40, 1000));
  document.dispatchEvent(pointer("pointermove", -40, 40, 1020));
  settle();
  expect(pose(token)).toMatchObject({ tilt: -7, scale: 1.05 });
});

it.each([
  { name: "inside", x: 410, y: 240, expectedX: 414, expectedY: 230, highlighted: true },
  { name: "half reach", x: 290, y: 240, expectedX: 291.9, expectedY: 230, highlighted: true },
  { name: "outside", x: 200, y: 240, expectedX: 190, expectedY: 230, highlighted: false },
  { name: "vertical", x: 460, y: 120, expectedX: 450, expectedY: 118.4, highlighted: true },
])("applies center-based magnetic pull: $name", ({ x, y, expectedX, expectedY, highlighted }) => {
  const { token } = pickup();
  document.dispatchEvent(pointer("pointermove", x, y, 20));
  expect(pose(token).x).toBeCloseTo(expectedX, 6);
  expect(pose(token).y).toBeCloseTo(expectedY, 6);
  expect(form.hasAttribute("data-thread-context-over")).toBe(highlighted);
});

it.each([
  { name: "positive speed", x: 46, expected: 5 },
  { name: "negative speed", x: 14, expected: -5 },
  { name: "positive clamp", x: 70, expected: 7 },
  { name: "negative clamp", x: -10, expected: -7 },
])("settles tilt from pointer velocity and scale to 1.05: $name", ({ x, expected }) => {
  const { token } = pickup();
  document.dispatchEvent(pointer("pointermove", x, 40, 20));
  settle();
  expect(pose(token).tilt).toBeCloseTo(expected, 6);
  expect(pose(token).scale).toBeCloseTo(1.05, 6);
  expect(clock.pending.size).toBe(0);
});

it("keeps the release pose for the first flight frame then lands once with pointer momentum", () => {
  const { token } = pickup(100, 240);
  const impacts: unknown[] = [];
  form.addEventListener("t3:composer-impact", (event) =>
    impacts.push((event as CustomEvent).detail),
  );
  document.dispatchEvent(pointer("pointermove", 140, 240, 20));
  act(() => clock.advance(10));
  document.dispatchEvent(pointer("pointermove", 180, 240, 40));
  const released = pose(token);
  document.dispatchEvent(pointer("pointerup", 180, 240, 40));
  expect(onLand).not.toHaveBeenCalled();
  expect(pose(token)).toEqual(released);
  act(() => clock.advance(20));
  expect(Math.hypot(pose(token).x - released.x, pose(token).y - released.y)).toBeLessThanOrEqual(1);
  expect(pose(token)).toEqual(released);
  expect(document.querySelector("[data-composer-throw-token]")).toBe(token);
  settle();
  expect(onLand).toHaveBeenCalledExactlyOnceWith(form);
  expect(impacts).toEqual([{ vx: 2000, vy: 0, atX: 500 }]);
  expect(form.hasAttribute("data-thread-context-over")).toBe(false);
  expect(token.isConnected).toBe(false);
});

it.each(["Escape", "pointercancel", "blur", "dispose", "physics off"] as const)(
  "%s cancels a highlighted drag without landing and releases all jobs",
  (reason) => {
    const { token, cancel } = pickup(410, 240);
    document.dispatchEvent(pointer("pointermove", 450, 240, 20));
    expect(form.hasAttribute("data-thread-context-over")).toBe(true);
    act(() => {
      switch (reason) {
        case "Escape":
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
          break;
        case "pointercancel":
          document.dispatchEvent(pointer("pointercancel", 450, 240, 20));
          break;
        case "blur":
          window.dispatchEvent(new Event("blur"));
          break;
        case "dispose":
          cancel();
          cancel();
          break;
        case "physics off":
          setPhysicsEnabled(false);
          break;
      }
    });
    expect(form.hasAttribute("data-thread-context-over")).toBe(false);
    document.dispatchEvent(pointer("pointerup", 450, 240, 40));
    settle();
    expect(onLand).not.toHaveBeenCalled();
    expect(token.isConnected).toBe(false);
  },
);

it("rejects native dragstart during pickup and releases that guard after returning a miss", () => {
  pickup();
  const nativeStart = new Event("dragstart", { cancelable: true, bubbles: true });
  document.dispatchEvent(nativeStart);
  expect(nativeStart.defaultPrevented).toBe(true);
  document.dispatchEvent(pointer("pointermove", 10, 40, 20));
  document.dispatchEvent(pointer("pointerup", 10, 40, 40));
  const afterRelease = new Event("dragstart", { cancelable: true });
  document.dispatchEvent(afterRelease);
  expect(afterRelease.defaultPrevented).toBe(false);
  settle();
  expect(onLand).not.toHaveBeenCalled();
  expect(document.querySelector("[data-composer-throw-token]")).toBeNull();
});

it.each(["mention", "thread"] as const)(
  "%s inserts on the contact frame and shrinks away within 150ms without landing twice",
  (channel) => {
    act(() => root.render(createElement(ComposerThrowToken, { channel })));
    const impact = vi.fn();
    form.addEventListener("t3:composer-impact", impact);
    act(() => {
      launchComposerThrow({
        channel,
        label: "contact",
        point: { x: 438, y: 218 },
        velocity: { x: 0, y: 0 },
        origin: { x: 0, y: 0 },
        target: form,
        onLand,
      });
    });
    const token = document.querySelector<HTMLDivElement>("[data-composer-throw-token]")!;
    Object.defineProperties(token, {
      offsetWidth: { value: 100 },
      offsetHeight: { value: 40 },
    });
    act(() => clock.advance(0));
    expect(onLand).toHaveBeenCalledExactlyOnceWith(form);
    expect(impact).toHaveBeenCalledTimes(1);
    expect(token.isConnected).toBe(true);
    expect(Number(token.style.opacity)).toBe(1);
    act(() => clock.advance(50));
    expect(token.isConnected).toBe(true);
    expect(Number(token.style.opacity)).toBeCloseTo(2 / 3);
    act(() => clock.advance(100));
    expect(Number(token.style.opacity)).toBeCloseTo(1 / 3);
    act(() => clock.advance(149));
    expect(token.isConnected).toBe(true);
    expect(Number(token.style.opacity)).toBeGreaterThan(0);
    expect(Number(token.style.opacity)).toBeLessThan(0.01);
    expect(token.style.transform).toMatch(/scale\(0\.60/);
    act(() => clock.advance(150));
    expect(token.isConnected).toBe(false);
    expect(onLand).toHaveBeenCalledTimes(1);
    expect(impact).toHaveBeenCalledTimes(1);
    expect(activeJobs()).toBe(0);
  },
);
