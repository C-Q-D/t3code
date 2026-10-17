/**
 * Checks observable dismissal of the A4 overlay through the real dialog primitive.
 * @vitest-environment jsdom
 */
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { RightPanelSheet } from "./RightPanelSheet";

let container: HTMLDivElement;
let root: Root;
const originalGetAnimations = Object.getOwnPropertyDescriptor(Element.prototype, "getAnimations");

/** Uses controlled open state so dismissal must actually close the panel. */
function OverlayHost() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>open panel</button>
      <output>{open ? "open" : "closed"}</output>
      <RightPanelSheet
        standalone
        open={open}
        animationDurationMs={0}
        onClose={() => setOpen(false)}
      >
        <button>panel action</button>
      </RightPanelSheet>
    </>
  );
}

/** Flushes the primitive's scheduled opening and focus work without wall-clock waits. */
async function openOverlay() {
  await act(() => root.render(<OverlayHost />));
  await act(() => container.querySelector("button")?.click());
  await act(() => vi.advanceTimersByTimeAsync(0));
  await act(() => vi.advanceTimersToNextFrame());
  await act(() => vi.advanceTimersToNextFrame());
  expect(container.querySelector("output")?.textContent).toBe("open");
  expect(document.querySelector('[role="dialog"][data-open]')).not.toBeNull();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.defineProperty(Element.prototype, "getAnimations", {
    configurable: true,
    value: () => [],
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  if (originalGetAnimations) {
    Object.defineProperty(Element.prototype, "getAnimations", originalGetAnimations);
  } else {
    Reflect.deleteProperty(Element.prototype, "getAnimations");
  }
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("standalone right panel overlay", () => {
  it("closes on Escape", async () => {
    await openOverlay();
    await act(() =>
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(container.querySelector("output")?.textContent).toBe("closed");
  });

  it("closes when its backdrop is clicked", async () => {
    await openOverlay();
    const backdrop = document.querySelector<HTMLElement>(
      '.right-panel-overlay-region[role="presentation"]',
    );
    if (!backdrop) throw new Error("Missing panel backdrop");
    await act(() => {
      backdrop.dispatchEvent(new MouseEvent("mousedown", { button: 0, bubbles: true }));
      backdrop.dispatchEvent(new MouseEvent("mouseup", { button: 0, bubbles: true }));
      backdrop.click();
    });
    expect(container.querySelector("output")?.textContent).toBe("closed");
  });
});
