/**
 * Protects the 1024px sidebar boundary through the provider's public visibility state.
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { Sidebar, SidebarProvider, SidebarRail, SidebarTrigger, useSidebar } from "../ui/sidebar";

/** Displays the active layout mode and uses the same toggle as the titlebar. */
function DrawerControls() {
  const { isMobile, state, toggleSidebar } = useSidebar();
  return <button onClick={toggleSidebar}>{`${isMobile ? "drawer" : "grid"}/${state}`}</button>;
}

/**
 * Installs a viewport whose media-query subscriptions receive live resize events.
 * @param initialWidth Initial viewport width in CSS pixels.
 * @returns A resize operation; call it within act to commit the subscribed React update.
 */
function installViewport(initialWidth: number) {
  let width = initialWidth;
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      const maximum = /max-width: (\d+)px/.exec(query);
      return maximum !== null && width <= Number(maximum[1]);
    },
    addEventListener(_type: string, listener: () => void) {
      listeners.add(listener);
    },
    removeEventListener(_type: string, listener: () => void) {
      listeners.delete(listener);
    },
  }));
  return (nextWidth: number) => {
    width = nextWidth;
    listeners.forEach((listener) => listener());
  };
}

/**
 * Waits for the actual focus move because committing React updates does not flush Base UI's RAF.
 * @param action Interaction that opens or dismisses the drawer.
 * @param hasExpectedFocus Whether focus has reached the required destination.
 * @returns Completion after the interaction commits and focus reaches that destination.
 */
async function actUntilFocused(action: () => void, hasExpectedFocus: () => boolean) {
  let resolveFocused: () => void = () => {};
  const focused = new Promise<void>((resolve) => {
    resolveFocused = resolve;
  });
  const onFocus = () => {
    if (hasExpectedFocus()) resolveFocused();
  };
  document.addEventListener("focusin", onFocus);
  try {
    await act(action);
    if (!hasExpectedFocus()) await focused;
  } finally {
    document.removeEventListener("focusin", onFocus);
  }
}

afterEach(() => vi.unstubAllGlobals());

describe("sidebar drawer breakpoint", () => {
  it.each([
    { width: 768, initial: "drawer/collapsed", toggled: "drawer/expanded" },
    { width: 1023, initial: "drawer/collapsed", toggled: "drawer/expanded" },
    { width: 1024, initial: "drawer/collapsed", toggled: "drawer/expanded" },
    { width: 1025, initial: "grid/expanded", toggled: "grid/collapsed" },
  ])(
    "uses the expected visibility mode at $width CSS pixels",
    async ({ width, initial, toggled }) => {
      vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
      installViewport(width);
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

  it("keeps desktop and drawer visibility independent across live breakpoint changes", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("cookieStore", { set: vi.fn().mockResolvedValue(undefined) });
    const resize = installViewport(1280);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(() =>
        root.render(
          <SidebarProvider>
            <DrawerControls />
            <Sidebar variant="frame">
              <button>Drawer action</button>
            </Sidebar>
          </SidebarProvider>,
        ),
      );
      const controls = container.querySelector("button");
      if (!controls) throw new Error("Missing sidebar controls");
      expect(controls.textContent).toBe("grid/expanded");
      await act(() => controls.click());
      expect(controls.textContent).toBe("grid/collapsed");
      await act(() => resize(1023));
      expect(controls.textContent).toBe("drawer/collapsed");
      expect(document.querySelector<HTMLElement>('[role="dialog"]')?.hidden).toBe(true);
      await act(() => controls.click());
      expect(controls.textContent).toBe("drawer/expanded");
      await act(() => resize(1280));
      expect(controls.textContent).toBe("grid/collapsed");
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      await act(() => controls.click());
      expect(controls.textContent).toBe("grid/expanded");
      await act(() => resize(1023));
      expect(controls.textContent).toBe("drawer/expanded");
      await act(() => controls.click());
      expect(controls.textContent).toBe("drawer/collapsed");
      await act(() => resize(1280));
      expect(controls.textContent).toBe("grid/expanded");
    } finally {
      await act(() => root.unmount());
      container.remove();
    }
  });
});

describe("StyleM A3 drawer bounds", () => {
  it("uses a 300px rendered drawer after restoring a persisted 432px desktop sidebar", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const resize = installViewport(1280);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const storageKey = "frame-drawer-persisted-width";
    const previousWidth = localStorage.getItem(storageKey);
    localStorage.setItem(storageKey, "432");
    try {
      await act(() =>
        root.render(
          <SidebarProvider>
            <SidebarTrigger />
            <Sidebar variant="frame" resizable={{ storageKey }}>
              <button>Drawer action</button>
              <SidebarRail />
            </Sidebar>
          </SidebarProvider>,
        ),
      );
      expect(
        container
          .querySelector<HTMLElement>('[data-slot="sidebar-wrapper"]')
          ?.style.getPropertyValue("--sidebar-width"),
      ).toBe("432px");
      await act(() => resize(1023));
      const trigger = container.querySelector("button");
      if (!trigger) throw new Error("Missing sidebar trigger");
      await act(() => trigger.click());
      const drawer = document.querySelector<HTMLElement>('[role="dialog"]');
      if (!drawer) throw new Error("Missing open drawer");
      expect(getComputedStyle(drawer).width).toBe("300px");
      expect(getComputedStyle(drawer).left).toBe("76px");
      expect(getComputedStyle(drawer).top).toBe("52px");
      expect(getComputedStyle(drawer).bottom).toBe("20px");
      const viewport = drawer.parentElement;
      if (!viewport) throw new Error("Missing drawer viewport");
      expect(getComputedStyle(viewport).left).toBe("68px");
      expect(getComputedStyle(viewport).top).toBe("48px");
      expect(getComputedStyle(viewport).right).toBe("0px");
      expect(getComputedStyle(viewport).bottom).toBe("0px");
    } finally {
      await act(() => root.unmount());
      container.remove();
      if (previousWidth === null) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, previousWidth);
    }
  });
});

describe("frame drawer dismissal", () => {
  it("opens from the existing trigger, dismisses, and returns focus", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    installViewport(1023);
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
      const hasDrawerFocus = () =>
        document.querySelector('[role="dialog"]')?.contains(document.activeElement) === true;
      const hasTriggerFocus = () => document.activeElement === trigger;
      await actUntilFocused(() => trigger.click(), hasDrawerFocus);
      expect(trigger.getAttribute("aria-pressed")).toBe("true");
      expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Drawer action");
      expect(document.querySelector('[role="dialog"]')?.contains(document.activeElement)).toBe(
        true,
      );
      await actUntilFocused(() => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      }, hasTriggerFocus);
      expect(trigger.getAttribute("aria-pressed")).toBe("false");
      expect(document.activeElement).toBe(trigger);
      await actUntilFocused(() => trigger.click(), hasDrawerFocus);
      const viewport = document.querySelector('[role="dialog"]')?.parentElement;
      if (!viewport) throw new Error("Missing drawer viewport");
      await actUntilFocused(() => {
        viewport.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
        viewport.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0 }));
        viewport.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
      }, hasTriggerFocus);
      expect(trigger.getAttribute("aria-pressed")).toBe("false");
      expect(document.activeElement).toBe(trigger);
    } finally {
      await act(() => root.unmount());
      container.remove();
    }
  });
});
