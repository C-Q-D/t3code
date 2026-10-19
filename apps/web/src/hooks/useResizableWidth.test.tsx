/** Exercises resize gestures through their visible width and persisted result. */
import { act, useLayoutEffect, type PointerEvent } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { setPhysicsEnabled } from "../lib/motion/preference";
import { activeJobs } from "../lib/motion/loop";

import { RESIZABLE_WIDTH_PROPERTY, useResizableWidth } from "./useResizableWidth";

let renderer: ReactTestRenderer;
let result: ReturnType<typeof useResizableWidth>;
let captured = false;
const hostStyle = new Map<string, string>();
const target = {
  parentElement: {
    style: {
      setProperty: (property: string, value: string) => hostStyle.set(property, value),
      removeProperty: (property: string) => hostStyle.delete(property),
    },
  },
  setPointerCapture: () => {
    captured = true;
  },
  hasPointerCapture: () => captured,
  releasePointerCapture: () => {
    captured = false;
  },
};
const style = {
  cursor: "",
  userSelect: "",
  removeProperty(property: string) {
    if (property === "cursor") this.cursor = "";
    if (property === "user-select") this.userSelect = "";
  },
};
const savedWidths = new Map<string, string>();
const setItem = vi.fn((key: string, value: string) => savedWidths.set(key, value));
const cancelAnimationFrame = vi.fn();
let events: EventTarget;
let frame: FrameRequestCallback | undefined;

function pointer(clientX = 100, timeStamp = 0) {
  return {
    button: 0,
    pointerId: 1,
    clientX,
    timeStamp,
    currentTarget: target,
    preventDefault() {},
    stopPropagation() {},
  } as unknown as PointerEvent<HTMLElement>;
}

function Panel({
  edge = "left",
  maxWidth = 800,
  storageKey = "test-panel-width",
  onCollapse,
}: {
  edge?: "left" | "right";
  maxWidth?: number;
  storageKey?: string;
  onCollapse?: () => void;
}) {
  const resize = useResizableWidth({
    storageKey,
    defaultWidth: 400,
    minWidth: 200,
    maxWidth,
    edge,
    onCollapse,
  });
  useLayoutEffect(() => {
    result = resize;
  });
  return null;
}

beforeEach(async () => {
  setPhysicsEnabled(false);
  savedWidths.clear();
  hostStyle.clear();
  captured = false;
  frame = undefined;
  style.cursor = "";
  style.userSelect = "";
  events = new EventTarget();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", {
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    localStorage: { getItem: (key: string) => savedWidths.get(key) ?? null, setItem },
  });
  vi.stubGlobal("document", { body: { style } });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frame = callback;
    return 42;
  });
  vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);
  await act(() => {
    renderer = create(<Panel />);
  });
});

afterEach(async () => {
  await act(() => renderer.unmount());
  setPhysicsEnabled(false);
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("panel resize cleanup", () => {
  it.each(["unmount", "lost capture", "blur", "cancel"])(
    "clears the cursor and pending resize after %s",
    async (reason) => {
      await act(() => {
        result.handlers.onPointerDown(pointer());
        result.handlers.onPointerMove(pointer(50));
      });
      await act(() => frame?.(0));
      expect(hostStyle.get(RESIZABLE_WIDTH_PROPERTY)).toBe("450px");
      expect(hostStyle.get("transition-property")).toBe("none");
      expect(result.width).toBe(400);
      // Queue another move to check that interruption cancels pending work too.
      await act(() => result.handlers.onPointerMove(pointer(25)));
      expect(style.cursor).toBe("col-resize");
      expect(style.userSelect).toBe("none");
      await act(() => {
        if (reason === "unmount") renderer.unmount();
        if (reason === "lost capture") result.handlers.onLostPointerCapture(pointer());
        if (reason === "blur") events.dispatchEvent(new Event("blur"));
        if (reason === "cancel") result.handlers.onPointerCancel(pointer());
      });
      expect(style.cursor).toBe("");
      expect(style.userSelect).toBe("");
      expect(captured).toBe(false);
      expect(hostStyle.has("transition-property")).toBe(false);
      expect(cancelAnimationFrame).toHaveBeenCalledWith(42);
      if (reason === "unmount") {
        expect(setItem).not.toHaveBeenCalled();
      } else {
        expect(result.width).toBe(475);
        expect(setItem).toHaveBeenCalledExactlyOnceWith("test-panel-width", "475");
      }
    },
  );

  it.each(["left", "right"] as const)(
    "uses the release position for a fast %s-edge drag",
    async (edge) => {
      await act(() => renderer.update(<Panel edge={edge} />));
      await act(() => {
        result.handlers.onPointerDown(pointer());
        result.handlers.onPointerMove(pointer(edge === "left" ? 50 : 150));
        result.handlers.onPointerUp(pointer(edge === "left" ? 25 : 175));
      });
      expect(result.width).toBe(475);
      expect(setItem).toHaveBeenCalledExactlyOnceWith("test-panel-width", "475");
      expect(cancelAnimationFrame).toHaveBeenCalledWith(42);
    },
  );

  it.each([
    [800, 450],
    [450, 800],
  ])("uses updated bounds during a drag from max %s to %s", async (initialMax, nextMax) => {
    await act(() => renderer.update(<Panel maxWidth={initialMax} />));
    await act(() => {
      result.handlers.onPointerDown(pointer());
      result.handlers.onPointerMove(pointer(-200));
    });
    await act(() => frame?.(0));
    expect(hostStyle.get(RESIZABLE_WIDTH_PROPERTY)).toBe(`${Math.min(700, initialMax)}px`);
    await act(() => renderer.update(<Panel maxWidth={nextMax} />));
    await act(() => result.handlers.onPointerMove(pointer(-250)));
    await act(() => frame?.(0));
    expect(hostStyle.get(RESIZABLE_WIDTH_PROPERTY)).toBe(`${Math.min(750, nextMax)}px`);
    await act(() => result.handlers.onPointerUp(pointer(-300)));
    expect(result.width).toBe(nextMax);
    expect(setItem).toHaveBeenCalledExactlyOnceWith("test-panel-width", String(nextMax));
  });

  it("handles release before any move event", async () => {
    await act(() => {
      result.handlers.onPointerDown(pointer());
      result.handlers.onPointerUp(pointer(25));
    });
    expect(result.width).toBe(475);
    expect(setItem).toHaveBeenCalledExactlyOnceWith("test-panel-width", "475");
  });

  it("clamps the release position to the panel bounds", async () => {
    await act(() => {
      result.handlers.onPointerDown(pointer());
      result.handlers.onPointerUp(pointer(-1000));
    });
    expect(result.width).toBe(800);
    expect(setItem).toHaveBeenCalledExactlyOnceWith("test-panel-width", "800");
  });

  it("saves the final width when release is followed by lost capture", async () => {
    await act(() => {
      result.handlers.onPointerDown(pointer());
      result.handlers.onPointerMove(pointer(50));
      result.handlers.onPointerUp(pointer(50));
      result.handlers.onLostPointerCapture(pointer(50));
    });
    expect(result.width).toBe(450);
    expect(setItem).toHaveBeenCalledExactlyOnceWith("test-panel-width", "450");
    expect(style.cursor).toBe("");
    expect(captured).toBe(false);
  });
});

describe("panel width storage changes", () => {
  it("restores separate thread widths without remounting and retains them after reload", async () => {
    await act(() => {
      result.handlers.onPointerDown(pointer());
      result.handlers.onPointerMove(pointer(50));
      result.handlers.onPointerUp(pointer(50));
    });
    expect(result.width).toBe(450);
    await act(() => renderer.update(<Panel storageKey="thread-b" />));
    expect(result.width).toBe(400);
    await act(() => {
      result.handlers.onPointerDown(pointer());
      result.handlers.onPointerMove(pointer(-100));
      result.handlers.onPointerUp(pointer(-100));
    });
    expect(result.width).toBe(600);
    await act(() => renderer.update(<Panel />));
    expect(result.width).toBe(450);
    await act(() => renderer.unmount());
    await act(() => {
      renderer = create(<Panel storageKey="thread-b" />);
    });
    expect(result.width).toBe(600);
  });

  it("cancels an unfinished drag on a thread switch without saving it to either thread", async () => {
    savedWidths.set("thread-b", "650");
    await act(() => {
      result.handlers.onPointerDown(pointer());
      result.handlers.onPointerMove(pointer(50));
    });
    await act(() => frame?.(0));
    expect(hostStyle.get(RESIZABLE_WIDTH_PROPERTY)).toBe("450px");
    await act(() => result.handlers.onPointerMove(pointer(25)));
    await act(() => renderer.update(<Panel storageKey="thread-b" />));
    expect(result.width).toBe(650);
    expect(hostStyle.get(RESIZABLE_WIDTH_PROPERTY)).toBe("650px");
    expect(captured).toBe(false);
    expect(style.cursor).toBe("");
    await act(() => {
      frame?.(0);
      result.handlers.onPointerUp(pointer(25));
    });
    expect(result.width).toBe(650);
    expect(setItem).not.toHaveBeenCalled();
    await act(() => renderer.update(<Panel />));
    expect(result.width).toBe(400);
  });
});

/** Consume the fake animation clock until the real motion loop releases its job. */
async function settleFrames() {
  let time = 0;
  while (activeJobs() > 0 && time < 3000) {
    time += 16;
    await act(() => frame?.(time));
  }
  expect(activeJobs()).toBe(0);
}

describe("physical panel resizing", () => {
  it.each([
    [400, 159.06976744186048, 200],
    [-400, 840.9302325581396, 800],
  ])(
    "compresses overshoot at pointer %s and commits only after returning to the boundary",
    async (position, visual, boundary) => {
      setPhysicsEnabled(true);
      await act(() => {
        result.handlers.onPointerDown(pointer(100, 0));
        result.handlers.onPointerMove(pointer(position, 1000));
      });
      await act(() => frame?.(0));
      expect(parseFloat(hostStyle.get(RESIZABLE_WIDTH_PROPERTY)!)).toBeCloseTo(visual, 6);
      await act(() => result.handlers.onPointerUp(pointer(position, 1100)));
      expect(setItem).not.toHaveBeenCalled();
      expect(activeJobs()).toBe(1);
      await settleFrames();
      expect(hostStyle.get(RESIZABLE_WIDTH_PROPERTY)).toBe(`${boundary}px`);
      expect(result.width).toBe(boundary);
      expect(setItem).toHaveBeenCalledExactlyOnceWith("test-panel-width", String(boundary));
    },
  );

  it("collapses a quick inward throw without replacing the saved width", async () => {
    setPhysicsEnabled(true);
    const collapse = vi.fn();
    await act(() => renderer.update(<Panel onCollapse={collapse} />));
    await act(() => {
      result.handlers.onPointerDown(pointer(100, 0));
      result.handlers.onPointerMove(pointer(250, 50));
      result.handlers.onPointerUp(pointer(260, 60));
    });
    expect(collapse).toHaveBeenCalledOnce();
    expect(setItem).not.toHaveBeenCalled();
    expect(result.width).toBe(400);
    expect(hostStyle.get(RESIZABLE_WIDTH_PROPERTY)).toBe("400px");
  });

  it("keeps a slow inward drag open and returns its overshoot", async () => {
    setPhysicsEnabled(true);
    const collapse = vi.fn();
    await act(() => renderer.update(<Panel onCollapse={collapse} />));
    await act(() => {
      result.handlers.onPointerDown(pointer(100, 0));
      result.handlers.onPointerMove(pointer(500, 1000));
      result.handlers.onPointerUp(pointer(500, 1100));
    });
    expect(collapse).not.toHaveBeenCalled();
    expect(activeJobs()).toBe(1);
    await settleFrames();
    expect(result.width).toBe(200);
  });

  it("takes over the current rebound position without a jump or stale commit", async () => {
    setPhysicsEnabled(true);
    await act(() => {
      result.handlers.onPointerDown(pointer(100, 0));
      result.handlers.onPointerUp(pointer(-400, 1000));
    });
    expect(activeJobs()).toBe(1);
    await act(() => frame?.(16));
    const caught = parseFloat(hostStyle.get(RESIZABLE_WIDTH_PROPERTY)!);
    await act(() => result.handlers.onPointerDown(pointer(100, 1200)));
    expect(activeJobs()).toBe(0);
    expect(parseFloat(hostStyle.get(RESIZABLE_WIDTH_PROPERTY)!)).toBe(caught);
    await act(() => {
      result.handlers.onPointerMove(pointer(110, 1300));
    });
    await act(() => frame?.(32));
    expect(parseFloat(hostStyle.get(RESIZABLE_WIDTH_PROPERTY)!)).toBeLessThan(caught);
    expect(parseFloat(hostStyle.get(RESIZABLE_WIDTH_PROPERTY)!)).toBeGreaterThan(800);
    await act(() => result.handlers.onPointerUp(pointer(110, 1400)));
    await settleFrames();
    expect(setItem).toHaveBeenCalledExactlyOnceWith("test-panel-width", "800");
  });

  it("retains hard bounds and never collapses with physics disabled", async () => {
    const collapse = vi.fn();
    await act(() => renderer.update(<Panel onCollapse={collapse} />));
    await act(() => {
      result.handlers.onPointerDown(pointer(100, 0));
      result.handlers.onPointerUp(pointer(500, 20));
    });
    expect(result.width).toBe(200);
    expect(collapse).not.toHaveBeenCalled();
    expect(activeJobs()).toBe(0);
  });
});
