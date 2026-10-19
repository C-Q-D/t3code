/**
 * Verifies pointer gestures against hand-calculated canvas coordinates, without browser layout.
 * @vitest-environment jsdom
 */
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { act, type ContextType } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { useRightPanelStore } from "../../rightPanelStore";
import { useThreadDetailsCardPlacementStore as store } from "../../threadDetailsCardPlacementStore";
import { PopoverCreateHandle } from "../ui/popover";
import { ChatCanvasContext } from "./ChatCanvasContext";
import { ThreadDetailsCard } from "./ThreadDetailsCard";
import { setPhysicsEnabled } from "~/lib/motion/preference";
import { installTestRaf } from "~/lib/motion/testRaf";

vi.mock("../ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => children,
}));

const threadRef = {
  environmentId: EnvironmentId.make("drag-test"),
  threadId: ThreadId.make("thread"),
};
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const report = vi.fn();
const content = vi.fn(() => (
  <>
    <p>Workspace</p>
    <button type="button">
      <span>Action</span>
    </button>
    <input aria-label="Name" />
    <div role="slider" />
    <div contentEditable suppressContentEditableWarning />
    <div data-slot="scroll-area-scrollbar" />
  </>
));
const handle = PopoverCreateHandle();

beforeEach(() => {
  setPhysicsEnabled(false);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  store.getState().reset();
  store.persist.clearStorage();
  useRightPanelStore.setState({ threadPanelVisibilityByThreadKey: {} });
  report.mockClear();
  content.mockClear();
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(200);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(200);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    return {
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 280,
      bottom: 200,
      width: 280,
      height: 200,
      toJSON: () => ({}),
    };
  });
  // jsdom has no pointer capture; emulate only capture ownership, not gesture behavior.
  vi.stubGlobal("PointerEvent", MouseEvent);
  Object.defineProperties(HTMLElement.prototype, {
    setPointerCapture: { configurable: true, value: vi.fn() },
    hasPointerCapture: { configurable: true, value: () => true },
    releasePointerCapture: { configurable: true, value: vi.fn() },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  setPhysicsEnabled(false);
  store.getState().reset();
  store.persist.clearStorage();
  Reflect.deleteProperty(HTMLElement.prototype, "setPointerCapture");
  Reflect.deleteProperty(HTMLElement.prototype, "hasPointerCapture");
  Reflect.deleteProperty(HTMLElement.prototype, "releasePointerCapture");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([true, false])("physics %s glides a released card only while enabled", async (enabled) => {
  setPhysicsEnabled(enabled);
  const clock = installTestRaf();
  let now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  await renderCard();
  await pointer(card(), "pointerdown", 950, 40);
  now = 40;
  await pointer(card(), "pointermove", 650, 100);
  await pointer(card(), "pointerup", 650, 100);
  expect(store.getState().placement).toEqual(
    enabled ? null : { side: "right", inset: 312, top: 72 },
  );
  await act(async () => {
    for (now = 56; now < 2056; now += 16) clock.advance(now);
  });
  expect(store.getState().placement).not.toBeNull();
  expect(Number.parseFloat(card().style.left)).toBeGreaterThanOrEqual(12);
  expect(Number.parseFloat(card().style.left) + 280).toBeLessThanOrEqual(1200);
  expect(Number.parseFloat(card().style.top) + 200).toBeLessThanOrEqual(800);
  expect(Number.parseFloat(card().style.left)).toBe(enabled ? 12 : 608);
  expect(clock.pending.size).toBe(0);
});

it("takes over a gliding card without returning to its release point", async () => {
  setPhysicsEnabled(true);
  const clock = installTestRaf();
  let now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  await renderCard();
  await pointer(card(), "pointerdown", 950, 40);
  now = 40;
  await pointer(card(), "pointermove", 850, 40);
  await pointer(card(), "pointerup", 850, 40);
  await act(async () => clock.advance(56));
  const offset = Number.parseFloat(card().style.transform.slice("translate(".length));
  expect(offset).toBeLessThan(-100);
  await pointer(card(), "pointerdown", 850, 40);
  expect(clock.pending.size).toBe(0);
  expect(Number.parseFloat(card().style.left)).toBeCloseTo(908 + offset);
  now = 200;
  await pointer(card(), "pointermove", 870, 40);
  await pointer(card(), "pointerup", 870, 40);
  expect(Number.parseFloat(card().style.left)).toBeCloseTo(928 + offset);
});

/** Reads the visual x coordinate from layout plus the live gesture transform. */
function visualCardLeft() {
  return (
    (Number.parseFloat(card().style.left) || 908) +
    (Number.parseFloat(card().style.transform.slice("translate(".length)) || 0)
  );
}

it.each([5, 25])("preserves elastic card position when grabbed after %s frames", async (frames) => {
  setPhysicsEnabled(true);
  const clock = installTestRaf();
  let now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  await renderCard();
  await pointer(card(), "pointerdown", 950, 40);
  now = 40;
  await pointer(card(), "pointermove", 1050, 40);
  await pointer(card(), "pointerup", 1050, 40);
  await act(async () => {
    for (let i = 0; i < frames; i++) clock.advance((now += 16));
  });
  const before = visualCardLeft();
  expect(before).toBeGreaterThan(908);
  await pointer(card(), "pointerdown", 1050, 40);
  expect(Math.abs(visualCardLeft() - before)).toBeLessThanOrEqual(1);
  expect(clock.pending.size).toBe(0);
  await pointer(card(), "pointermove", 1040, 40);
  expect(visualCardLeft()).toBeLessThan(before);
  expect(visualCardLeft()).toBeGreaterThan(before - 10);
  await pointer(card(), "pointermove", 1050, 40);
  expect(Math.abs(visualCardLeft() - before)).toBeLessThanOrEqual(1);
  now += 100;
  await pointer(card(), "pointerup", 1050, 40);
  expect(Math.abs(visualCardLeft() - before)).toBeLessThanOrEqual(1);
  await act(async () => {
    for (let i = 0; i < 120; i++) clock.advance((now += 16));
  });
  expect(visualCardLeft()).toBe(908);
  expect(clock.pending.size).toBe(0);
});

it("stops a gliding card and saves within resized container bounds", async () => {
  setPhysicsEnabled(true);
  const clock = installTestRaf();
  let now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  await renderCard();
  await pointer(card(), "pointerdown", 950, 40);
  now = 40;
  await pointer(card(), "pointermove", 1050, 40);
  await pointer(card(), "pointerup", 1050, 40);
  await act(async () => clock.advance((now += 16)));
  expect(clock.pending.size).toBe(1);
  await renderCard(1100);
  expect(clock.pending.size).toBe(0);
  expect(card().style.transform).toBe("");
  expect(store.getState().placement).toEqual({ side: "right", inset: 12, top: 12 });
  expect(card().style.left).toBe("808px");
  const saved = store.getState().placement;
  await act(async () => {
    for (let i = 0; i < 120; i++) clock.advance((now += 16));
  });
  expect(store.getState().placement).toBe(saved);
  expect(card().style.transform).toBe("");
});

/** Renders a measured canvas; width and search inset let tests exercise presentation changes. */
async function renderCard(width = 1200, inset = 0) {
  await act(async () =>
    root.render(
      <ChatCanvasContext
        value={{
          container: { width, height: 800 },
          lane: { padding: 48, minChatWidth: 640 },
          layout: { frame: null, overlapsDetailsCard: false } as NonNullable<
            ContextType<typeof ChatCanvasContext>
          >["layout"],
          previewKey: null,
          resolvePreviewFrame: () => null,
          reportPreview: vi.fn(),
          clearPreview: vi.fn(),
          registerTimeline: vi.fn(),
          reportDetailsCard: report,
          detailsCardTopInset: inset,
        }}
      >
        <ThreadDetailsCard
          threadRef={threadRef}
          anchor={{ current: null }}
          handle={handle}
          onPresentationChange={vi.fn()}
        >
          {content}
        </ThreadDetailsCard>
      </ChatCanvasContext>,
    ),
  );
}

/** Sends a primary mouse pointer through React's real event handlers with stable capture identity. */
async function pointer(target: Element, type: string, x: number, y: number) {
  await act(async () => {
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      button: 0,
    });
    Object.defineProperties(event, {
      pointerId: { value: 1 },
      pointerType: { value: "mouse" },
      isPrimary: { value: true },
    });
    target.dispatchEvent(event);
  });
}

/** Returns the inline gesture surface and fails naturally if presentation is wrong. */
function card() {
  return container.querySelector<HTMLElement>('[data-thread-details-panel="inline"]')!;
}

it("commits the release position without rerendering content during pointer movement", async () => {
  await renderCard();
  const element = card();
  await pointer(element, "pointerdown", 950, 40);
  const renders = content.mock.calls.length;
  await pointer(element, "pointermove", 242, 128);
  expect(content).toHaveBeenCalledTimes(renders);
  expect(element.style.transform).toBe("translate(-708px, 88px)");
  expect(store.getState().placement).toBeNull();
  await pointer(element, "pointerup", 242, 128);
  expect(store.getState().placement).toEqual({ side: "left", inset: 200, top: 100 });
  expect(element.style.left).toBe("200px");
  expect(element.style.top).toBe("100px");
  expect(element.style.right).toBe("");
  expect(element.style.transform).toBe("");
  expect(report).toHaveBeenLastCalledWith(null);
});

it.each([
  "button span",
  "input",
  '[role="slider"]',
  '[contenteditable="true"]',
  '[data-slot="scroll-area-scrollbar"]',
])("leaves %s interactions alone", async (selector) => {
  await renderCard();
  const control = card().querySelector(selector)!;
  await pointer(control, "pointerdown", 950, 40);
  await pointer(control, "pointermove", 242, 128);
  await pointer(control, "pointerup", 242, 128);
  expect(store.getState().placement).toBeNull();
  expect(report).toHaveBeenLastCalledWith({ left: 908, right: 1188, bottom: 212 });
});

it("does not publish movements of at most three pixels", async () => {
  await renderCard();
  const subscriber = vi.fn();
  const unsubscribe = store.subscribe(subscriber);
  try {
    await pointer(card(), "pointerdown", 950, 40);
    await pointer(card(), "pointermove", 953, 40);
    await pointer(card(), "pointerup", 953, 40);
    expect(store.getState().placement).toBeNull();
    expect(subscriber).not.toHaveBeenCalled();
  } finally {
    unsubscribe();
  }
});

it("resets on blank double click but preserves placement on controls", async () => {
  store.getState().place({ side: "left", inset: 200, top: 100 });
  await renderCard();
  await act(async () =>
    card()
      .querySelector("button")!
      .dispatchEvent(new MouseEvent("dblclick", { bubbles: true })),
  );
  expect(store.getState().placement).toEqual({ side: "left", inset: 200, top: 100 });
  await act(async () => card().dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
  expect(store.getState().placement).toBeNull();
  expect(card().style.right).toBe("12px");
  expect(report).toHaveBeenLastCalledWith({ left: 908, right: 1188, bottom: 212 });
});

it.each(["pointercancel", "lostpointercapture"])(
  "discards the temporary transform on %s without writing placement",
  async (event) => {
    await renderCard();
    await pointer(card(), "pointerdown", 950, 40);
    await pointer(card(), "pointermove", 242, 128);
    expect(card().style.transform).toBe("translate(-708px, 88px)");
    await pointer(card(), event, 242, 128);
    expect(store.getState().placement).toBeNull();
    expect(card().style.transform).toBe("");
    expect(card().style.right).toBe("12px");
  },
);

it("clamps the entire rendered card inside all four canvas edges", async () => {
  await renderCard();
  await pointer(card(), "pointerdown", 950, 40);
  await pointer(card(), "pointermove", -1000, -1000);
  expect(card().style.transform).toBe("translate(-896px, 0px)");
  await pointer(card(), "pointermove", 3000, 3000);
  expect(card().style.transform).toBe("translate(0px, 576px)");
  await pointer(card(), "pointerup", 3000, 3000);
  expect(store.getState().placement).toEqual({ side: "right", inset: 12, top: 588 });
  expect(card().style.top).toBe("588px");
});

it("ignores search inset and restores placement after a narrow presentation", async () => {
  store.getState().place({ side: "right", inset: 120, top: 100 });
  await renderCard(1200, 48);
  expect(card().style.left).toBe("800px");
  expect(card().style.top).toBe("100px");
  expect(card().style.maxHeight).toBe("688px");
  expect(report).toHaveBeenLastCalledWith(null);
  await renderCard(924, 48);
  expect(card()).toBeNull();
  await renderCard(1400, 48);
  expect(card().style.left).toBe("1000px");
  expect(card().style.top).toBe("100px");
});

it.each([
  ["default", null, "", "12px", "12px"],
  ["saved", { side: "right" as const, inset: 120, top: 100 }, "700px", "100px", ""],
])(
  "cancels a %s drag before paint when the inline canvas resizes",
  async (_label, original, left, top, right) => {
    store.setState({ placement: original });
    await renderCard();
    const element = card();
    const subscriber = vi.fn();
    const unsubscribe = store.subscribe(subscriber);
    try {
      await pointer(element, "pointerdown", 950, 140);
      await pointer(element, "pointermove", 850, 140);
      expect(element.style.transform).toBe("translate(-100px, 0px)");
      await renderCard(1100);
      expect(card()).toBe(element);
      expect(element.style.transform).toBe("");
      expect(element.releasePointerCapture).toHaveBeenCalledWith(1);
      expect(store.getState().placement).toEqual(original);
      expect(element.style.left).toBe(left);
      expect(element.style.top).toBe(top);
      expect(element.style.right).toBe(right);
      await pointer(element, "pointermove", 750, 140);
      await pointer(element, "pointerup", 750, 140);
      expect(element.style.transform).toBe("");
      expect(store.getState().placement).toEqual(original);
      expect(subscriber).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
    }
  },
);
