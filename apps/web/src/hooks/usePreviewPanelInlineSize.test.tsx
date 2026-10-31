/**
 * Verifies panel width reservations against host geometry without a browser layout engine.
 * @vitest-environment jsdom
 */
import { act, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { usePreviewPanelInlineSize } from "./usePreviewPanelInlineSize";

let root: Root;
let container: HTMLDivElement;
let width: number;

/** Runs the real resize hook with a persisted width above either host's limit. */
function Panel({ standalone }: { standalone: boolean }) {
  const size = usePreviewPanelInlineSize({ container, standalone });
  const { observeRow } = size;
  useLayoutEffect(() => observeRow(container), [observeRow]);
  useLayoutEffect(() => {
    width = size.width;
  });
  return null;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("innerWidth", 1512);
  container = document.createElement("div");
  document.body.append(container);
  Object.defineProperty(container, "clientWidth", { value: 1256 });
  localStorage.setItem("t3code:preview-panel-width", "1200");
  root = createRoot(container);
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("host width reservations", () => {
  it.each([
    { gap: 16, expected: 880 },
    { gap: 24, expected: 872 },
  ])("reserves the standalone CSS gap of $gap px", async ({ gap, expected }) => {
    container.style.setProperty("--frame-slab-gap", `${gap}px`);
    await act(() => root.render(<Panel standalone />));
    expect(width).toBe(expected);
    expect(width + gap + 360).toBeLessThanOrEqual(1256);
  });

  it("does not reserve a slab gap for other hosts even when the theme defines one", async () => {
    container.style.setProperty("--frame-slab-gap", "24px");
    await act(() => root.render(<Panel standalone={false} />));
    expect(width).toBe(896);
    expect(width + 360).toBeLessThanOrEqual(1256);
  });
});
