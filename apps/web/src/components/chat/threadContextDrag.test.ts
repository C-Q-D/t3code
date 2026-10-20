/** @vitest-environment jsdom */
/** Real projection and spring completion guard insertion; only layout and the frame clock are fixtures. */
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { ComposerThrowToken } from "./ComposerThrowToken";
import {
  endThreadContextDrag,
  moveThreadContextDrag,
  throwThreadContext,
} from "./threadContextDrag";
import { setPhysicsEnabled } from "../../lib/motion/preference";
import { activeJobs } from "../../lib/motion/loop";
import { installTestRaf } from "../../lib/motion/testRaf";

let clock: ReturnType<typeof installTestRaf>;
let root: Root;
let form: HTMLFormElement;
let drops: unknown[];
let impacts: unknown[];
const threads = [{ environmentId: EnvironmentId.make("env"), threadId: ThreadId.make("thread") }];

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  clock = installTestRaf();
  setPhysicsEnabled(true);
  form = document.createElement("form");
  form.setAttribute("data-thread-context-drop", "true");
  form.getBoundingClientRect = () => new DOMRect(400, 200, 200, 100);
  document.body.append(form);
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: (x: number, y: number) => (x >= 400 && x <= 600 && y >= 200 && y <= 300 ? form : null),
  });
  drops = [];
  impacts = [];
  form.addEventListener("t3-thread-context-drop", (event) =>
    drops.push((event as CustomEvent).detail),
  );
  form.addEventListener("t3:composer-impact", (event) =>
    impacts.push((event as CustomEvent).detail),
  );
  root = createRoot(document.createElement("div"));
  act(() => root.render(createElement(ComposerThrowToken, { channel: "thread" })));
});
afterEach(() => {
  act(() => {
    setPhysicsEnabled(false);
    endThreadContextDrag();
    root.unmount();
  });
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

/** Drain actual jobs at deterministic 60 Hz; fail if a flight does not reach rest within ten seconds. */
function settle() {
  act(() => {
    for (let frame = 0; frame < 600 && clock.pending.size; frame++)
      clock.advance((frame * 1000) / 60);
  });
  expect(activeJobs()).toBe(0);
}

it("reserves a projected path hit and inserts exactly once only after the flight lands", () => {
  act(() => {
    moveThreadContextDrag({ x: 50, y: 250 }, { title: "Thread", count: 1 });
    expect(throwThreadContext({ x: 100, y: 250 }, { x: 1000, y: 0 }, threads)).toBe(true);
  });
  expect(drops).toEqual([]);
  expect(impacts).toEqual([]);
  expect(form.hasAttribute("data-thread-context-over")).toBe(true);
  act(() => clock.advance(0));
  expect(drops).toEqual([]);
  settle();
  expect(drops).toEqual([threads]);
  expect(impacts).toEqual([{ vx: 1000, vy: 0, atX: 500 }]);
  expect(form.hasAttribute("data-thread-context-over")).toBe(false);
});

it("inserts on arrival instead of hovering over the catch point while the spring settles", () => {
  act(() => {
    throwThreadContext({ x: 100, y: 250 }, { x: 1000, y: 0 }, threads);
  });
  // jsdom tokens have zero size, so the catch point is the composer centre (500, 250).
  let framesHoveringAtCatchPoint = 0;
  act(() => {
    for (let frame = 0; frame < 600 && clock.pending.size; frame++) {
      clock.advance((frame * 1000) / 60);
      const token = document.querySelector<HTMLElement>("[data-composer-throw-token]");
      const match = token?.style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/);
      if (match && Math.hypot(Number(match[1]) - 500, Number(match[2]) - 250) < 8)
        framesHoveringAtCatchPoint++;
    }
  });
  expect(drops).toEqual([threads]);
  expect(framesHoveringAtCatchPoint).toBeLessThanOrEqual(1);
});

it("returns a miss to its pickup point without inserting", () => {
  act(() => {
    moveThreadContextDrag({ x: 50, y: 50 }, { title: "Thread", count: 1 });
    expect(throwThreadContext({ x: 100, y: 50 }, { x: -500, y: 0 }, threads)).toBe(false);
  });
  expect(document.querySelector("[data-composer-throw-token]")).not.toBeNull();
  settle();
  expect(drops).toEqual([]);
  expect(impacts).toEqual([]);
  expect(document.querySelector("[data-composer-throw-token]")).toBeNull();
});

it("regrabbing cancels the reservation and the old arrival cannot insert", () => {
  act(() => {
    throwThreadContext({ x: 100, y: 250 }, { x: 1000, y: 0 }, threads);
  });
  const token = document.querySelector("[data-composer-throw-token]");
  expect(token).not.toBeNull();
  act(() => {
    token!.dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 110, clientY: 250 }),
    );
  });
  expect(form.hasAttribute("data-thread-context-over")).toBe(false);
  settle();
  expect(drops).toEqual([]);
  expect(impacts).toEqual([]);
});

it("does not insert into a composer removed during flight", () => {
  act(() => {
    throwThreadContext({ x: 100, y: 250 }, { x: 1000, y: 0 }, threads);
  });
  form.remove();
  settle();
  expect(drops).toEqual([]);
  expect(impacts).toEqual([]);
});

it("disabled physics keeps immediate direct drops and starts no flight", () => {
  act(() => setPhysicsEnabled(false));
  expect(throwThreadContext({ x: 450, y: 250 }, { x: 1000, y: 0 }, threads)).toBe(true);
  expect(drops).toEqual([threads]);
  expect(impacts).toEqual([]);
  expect(activeJobs()).toBe(0);
  expect(clock.request).not.toHaveBeenCalled();
});
