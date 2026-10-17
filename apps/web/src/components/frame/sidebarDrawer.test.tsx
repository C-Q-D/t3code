/**
 * Protects the 1024px sidebar boundary through the provider's public visibility state.
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { Sidebar, SidebarProvider, SidebarTrigger, useSidebar } from "../ui/sidebar";
import { FRAME_SIDEBAR_DRAWER_GEOMETRY } from "./sidebarDrawerGeometry";

/** Displays the active layout mode and uses the same toggle as the titlebar. */
function DrawerControls() {
  const { isMobile, state, toggleSidebar } = useSidebar();
  return <button onClick={toggleSidebar}>{`${isMobile ? "drawer" : "grid"}/${state}`}</button>;
}

afterEach(() => vi.unstubAllGlobals());

describe("sidebar drawer breakpoint", () => {
  it.each([
    { width: 768, initial: "drawer/collapsed", toggled: "drawer/expanded" },
    { width: 1023, initial: "drawer/collapsed", toggled: "drawer/expanded" },
    { width: 1024, initial: "grid/expanded", toggled: "grid/collapsed" },
  ])(
    "uses the expected visibility mode at $width CSS pixels",
    async ({ width, initial, toggled }) => {
      vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
      vi.stubGlobal("matchMedia", (query: string) => ({
        matches: width <= Number(/max-width: (\d+)px/.exec(query)?.[1]),
        addEventListener() {},
        removeEventListener() {},
      }));
      vi.stubGlobal("cookieStore", { set: vi.fn().mockResolvedValue(undefined) });
      const container = document.createElement("div");
      const root = createRoot(container);
      try {
        await act(() =>
          root.render(
            <SidebarProvider>
              <DrawerControls />
            </SidebarProvider>,
          ),
        );
        expect(container.textContent).toBe(initial);
        await act(() => container.querySelector("button")?.click());
        expect(container.textContent).toBe(toggled);
      } finally {
        await act(() => root.unmount());
      }
    },
  );
});

describe("StyleM A3 drawer bounds", () => {
  it("keeps a 300px slab inset from the titlebar and project rail", () => {
    expect(FRAME_SIDEBAR_DRAWER_GEOMETRY.drawer).toEqual({
      position: "fixed",
      left: 76,
      top: 52,
      bottom: 20,
      width: 300,
    });
    expect(FRAME_SIDEBAR_DRAWER_GEOMETRY.backdrop).toEqual({
      position: "fixed",
      left: 68,
      top: 48,
      right: 0,
      bottom: 0,
    });
  });
});

describe("frame drawer dismissal", () => {
  it("opens from the existing trigger, dismisses, and returns focus", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("matchMedia", () => ({
      matches: true,
      addEventListener() {},
      removeEventListener() {},
    }));
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(() =>
        root.render(
          <SidebarProvider>
            <SidebarTrigger />
            <Sidebar variant="frame">
              <button>Drawer action</button>
            </Sidebar>
          </SidebarProvider>,
        ),
      );
      const trigger = container.querySelector("button");
      if (!trigger) throw new Error("Missing sidebar trigger");
      trigger.focus();
      await act(() => trigger.click());
      expect(trigger.getAttribute("aria-pressed")).toBe("true");
      expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Drawer action");
      await act(() =>
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
      );
      expect(trigger.getAttribute("aria-pressed")).toBe("false");
      expect(document.activeElement).toBe(trigger);
      await act(() => trigger.click());
      const viewport = document.querySelector('[role="dialog"]')?.parentElement;
      if (!viewport) throw new Error("Missing drawer viewport");
      await act(() => {
        viewport.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
        viewport.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0 }));
        viewport.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
      });
      expect(trigger.getAttribute("aria-pressed")).toBe("false");
      expect(document.activeElement).toBe(trigger);
    } finally {
      await act(() => root.unmount());
      container.remove();
    }
  });
});
