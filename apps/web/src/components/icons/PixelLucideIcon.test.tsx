/** Protects Lucide-compatible accessibility, DOM attributes, and SVG ref ownership. */
// @vitest-environment jsdom
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { PixelCodexIcon } from "./PixelLucideIcon";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("pixel Lucide accessibility", () => {
  it("hides unnamed decorative artwork by default", async () => {
    await act(async () => root.render(<PixelCodexIcon />));
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it.each([
    { "aria-label": "Codex" },
    { "aria-labelledby": "codex-label" },
    { "aria-describedby": "codex-description" },
    { "aria-live": "polite" as const },
    { role: "img" },
    { title: "Codex" },
    { "aria-label": "" },
    { role: undefined },
    { children: <title>Codex</title> },
  ])("does not hide artwork when Lucide accessibility input is present: %j", async (props) => {
    await act(async () => root.render(<PixelCodexIcon {...props} />));
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.hasAttribute("aria-hidden")).toBe(false);
    for (const [key, value] of Object.entries(props)) {
      if (key !== "children" && value !== undefined) {
        expect(svg?.getAttribute(key)).toBe(value);
      }
    }
    if ("children" in props) expect(svg?.querySelector("title")?.textContent).toBe("Codex");
  });

  it.each([true, false])("preserves the caller's explicit aria-hidden=%s", async (hidden) => {
    await act(async () => root.render(<PixelCodexIcon aria-label="Codex" aria-hidden={hidden} />));
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe(String(hidden));
  });

  it("consumes Lucide-only stroke scaling without leaking it or warning on the DOM", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await act(async () => root.render(<PixelCodexIcon absoluteStrokeWidth />));
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.hasAttribute("absolutestrokewidth")).toBe(false);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("forwards a real SVG ref and clears it when unmounted", async () => {
    const ref = createRef<SVGSVGElement>();
    await act(async () => root.render(<PixelCodexIcon ref={ref} />));
    expect(ref.current).toBeInstanceOf(SVGSVGElement);
    expect(ref.current).toBe(container.querySelector("svg"));
    await act(async () => root.render(null));
    expect(ref.current).toBeNull();
  });
});
