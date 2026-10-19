// @vitest-environment jsdom
/** Exercises real release springs and listener ownership; only browser layout and time are fixtures. */
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { act, useLayoutEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import * as offsets from "~/lib/motion/elementOffset";
import { activeJobs } from "~/lib/motion/loop";
import { setPhysicsEnabled } from "~/lib/motion/preference";
import { installTestRaf } from "~/lib/motion/testRaf";
import { useSortableFling } from "./useSortableFling";

let root: Root;
let host: HTMLDivElement;
let handlers: ReturnType<typeof useSortableFling>;
let clock: ReturnType<typeof installTestRaf>;
let now = 0;
let released = false;

/** Minimal sortable consumer; jsdom rectangles model the visual drag and committed layout. */
function Harness({ reversed = false, overlay = false }: { reversed?: boolean; overlay?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const fling = useSortableFling({ containerRef, overlayRef });
  useLayoutEffect(() => {
    handlers = fling;
  });
  return (
    <div ref={containerRef}>
      {(reversed ? ["b", "a"] : ["a", "b"]).map((id, index) => (
        <div
          key={id}
          data-sortable-fling-id={id}
          ref={(element) => {
            if (element)
              element.getBoundingClientRect = () =>
                new DOMRect(released ? index * 100 : id === "a" ? 130 : 10, 0, 100, 40);
          }}
        />
      ))}
      {overlay && (
        <div
          ref={(element) => {
            overlayRef.current = element;
            if (element) element.getBoundingClientRect = () => new DOMRect(160, 20, 100, 40);
          }}
        />
      )}
    </div>
  );
}

/** A real sensor event envelope; the hook owns only release animation, not order persistence. */
function startEvent(keyboard = false): DragStartEvent {
  return {
    activatorEvent: keyboard
      ? new KeyboardEvent("keydown", { key: " " })
      : new MouseEvent("pointerdown", { clientX: 0, clientY: 0 }),
    active: {
      id: "a",
      data: { current: {} },
      rect: { current: { initial: null, translated: null } },
    },
  };
}

/** End the same drag over its neighbor. */
function endEvent(): DragEndEvent {
  return {
    ...startEvent(),
    delta: { x: 40, y: 0 },
    collisions: null,
    over: { id: "b", rect: new DOMRect(100, 0, 100, 40), disabled: false, data: { current: {} } },
  };
}

/** Sample 40 pixels in 40 ms, giving an independently specified 1000 px/s release. */
async function drag(keyboard = false) {
  await act(() => handlers.onDragStart(startEvent(keyboard)));
  now = 40;
  document.dispatchEvent(new MouseEvent("pointermove", { clientX: 40, clientY: 0 }));
}

/** Snapshot before the consumer commits the new order in the same React batch. */
async function release(overlay = false) {
  await act(() => {
    handlers.onDragEnd(endEvent());
    released = true;
    root.render(<Harness reversed overlay={overlay} />);
  });
}

/** Resolve a real rendered sortable node by its stable id. */
function node(id: string) {
  return host.querySelector<HTMLElement>(`[data-sortable-fling-id="${id}"]`)!;
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  clock = installTestRaf();
  now = 0;
  released = false;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  setPhysicsEnabled(true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(() => root.render(<Harness />));
});

afterEach(async () => {
  await act(() => root.unmount());
  setPhysicsEnabled(false);
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("injects release velocity into the active FLIP and settles displaced neighbors", async () => {
  const flip = vi.spyOn(offsets, "flip");
  await drag();
  await release();
  expect(node("a").style.transform).toBe("translate(30.00px, 0.00px)");
  expect(node("b").style.transform).toBe("translate(10.00px, 0.00px)");
  expect(offsets.offsetOf(node("a")).x.velocity).toBe(1000);
  expect(offsets.offsetOf(node("b")).x.velocity).toBe(0);
  expect(flip.mock.calls.map((call) => call[2])).toEqual([
    { response: 0.4, damping: 1 },
    { response: 0.46, damping: 0.8 },
  ]);
  clock.advance(0);
  expect(offsets.readOffset(node("a")).x).toBeGreaterThan(30);
  expect(offsets.readOffset(node("b")).x).toBeLessThan(10);
});

it("measures the visible overlay instead of the active placeholder", async () => {
  await act(() => root.render(<Harness overlay />));
  await drag();
  await release(true);
  expect(node("a").style.transform).toBe("translate(60.00px, 20.00px)");
});

it.each(["disabled", "keyboard"])(
  "leaves transforms and pointer listeners alone for %s sorting",
  async (mode) => {
    if (mode === "disabled") setPhysicsEnabled(false);
    const listen = vi.spyOn(document, "addEventListener");
    node("a").style.transform = "translateX(7px)";
    await drag(mode === "keyboard");
    await release();
    expect(node("a").style.transform).toBe("translateX(7px)");
    expect(node("b").style.transform).toBe("");
    expect(listen.mock.calls.filter(([type]) => type === "pointermove")).toEqual([]);
    expect(activeJobs()).toBe(0);
  },
);

it("hands transforms back on a second drag without later spring writes", async () => {
  await drag();
  await release();
  expect(activeJobs()).toBe(2);
  await act(() => handlers.onDragStart(startEvent()));
  expect(activeJobs()).toBe(0);
  expect(node("a").style.transform).toBe("");
  node("a").style.transform = "translateX(25px)";
  clock.advance(16);
  expect(node("a").style.transform).toBe("translateX(25px)");
  expect(clock.pending.size).toBe(0);
});

it("removes sampling on cancel and clears owned jobs on unmount", async () => {
  const remove = vi.spyOn(document, "removeEventListener");
  await drag();
  await act(() => handlers.onDragCancel());
  expect(remove.mock.calls.some(([type]) => type === "pointermove")).toBe(true);
  now = 0;
  await drag();
  await release();
  await act(() => root.render(null));
  expect(activeJobs()).toBe(0);
  expect(clock.pending.size).toBe(0);
});
