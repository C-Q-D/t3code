/** Exercises caption availability across auth routes and a root route error.
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";
import { expect, it, vi } from "vite-plus/test";
import { AppRoot } from "../../AppRoot";
import type { AppRouter } from "../../router";
import { t } from "../../i18n";

vi.mock("../../env", () => ({ isElectron: true }));
vi.mock("../../browser/ElectronBrowserHost", () => ({ ElectronBrowserHost: () => null }));
vi.mock("../../browser/BrowserProfileReporter", () => ({ BrowserProfileReporter: () => null }));
vi.mock("../QuitHoldOverlay", () => ({ QuitHoldOverlay: () => null }));
vi.mock("../PhysicsMotionRoot", () => ({ PhysicsMotionRoot: () => null }));

it("keeps one working caption host on auth pages and after a root route error", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const platform = vi.spyOn(navigator, "platform", "get").mockReturnValue("Win32");
  let maximized = false;
  let minimized = false;
  let closed = false;
  const listeners = new Set<(value: boolean) => void>();
  vi.stubGlobal("desktopBridge", {
    getWindowMaximizedState: () => maximized,
    getWindowFullscreenState: () => false,
    onWindowFullscreenStateChange: () => () => {},
    onWindowMaximizedStateChange: (listener: (value: boolean) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    controlWindow: async (action: string) => {
      if (action === "minimize") minimized = true;
      if (action === "close") closed = true;
      if (action === "toggle-maximize") {
        maximized = !maximized;
        listeners.forEach((listener) => listener(maximized));
      }
    },
  });
  const route = createRootRoute({
    component: Outlet,
    errorComponent: () => <main>root error</main>,
  });
  const auth = createRoute({
    getParentRoute: () => route,
    path: "/auth",
    component: () => <main>authentication</main>,
  });
  const broken = createRoute({
    getParentRoute: () => route,
    path: "/broken",
    loader: () => {
      throw new Error("route failed");
    },
  });
  const router = createRouter({
    routeTree: route.addChildren([auth, broken]),
    history: createMemoryHistory({ initialEntries: ["/auth"] }),
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await router.load();
    await act(() => root.render(<AppRoot router={router as unknown as AppRouter} />));
    expect(container.textContent).toContain("authentication");
    expect(document.querySelectorAll(".windows-window-controls")).toHaveLength(1);
    const minimize = document.querySelector<HTMLButtonElement>(
      `button[aria-label="${t.common.windowControls.minimize}"]`,
    )!;
    await act(() => minimize.click());
    expect(minimized).toBe(true);
    await act(async () => {
      router.history.push("/broken");
      await router.load();
    });
    expect(container.textContent).toContain("root error");
    expect(document.querySelectorAll(".windows-window-controls")).toHaveLength(1);
    expect(listeners.size).toBe(1);
    await act(() =>
      document
        .querySelector<HTMLButtonElement>(
          `button[aria-label="${t.common.windowControls.maximize}"]`,
        )!
        .click(),
    );
    expect(maximized).toBe(true);
    expect(
      document.querySelector(`button[aria-label="${t.common.windowControls.restore}"]`),
    ).not.toBeNull();
    await act(() =>
      document
        .querySelector<HTMLButtonElement>(`button[aria-label="${t.common.windowControls.close}"]`)!
        .click(),
    );
    expect(closed).toBe(true);
  } finally {
    await act(() => root.unmount());
    expect(listeners.size).toBe(0);
    container.remove();
    platform.mockRestore();
    vi.unstubAllGlobals();
  }
});
