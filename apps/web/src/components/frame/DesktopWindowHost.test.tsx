/** Exercises native snapshot caching and caption availability across auth routes and a root route error.
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
import { DesktopWindowHost, useDesktopWindowState } from "./DesktopWindowHost";

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

/** Exposes context so event delivery is checked independently of caption controls. */
function WindowStateProbe({ label }: { label: string }) {
  const { maximized, fullscreen } = useDesktopWindowState();
  return (
    <output>
      {label}:{String(maximized)}:{String(fullscreen)}
    </output>
  );
}

it.each([false, true])(
  "caches native snapshots and closes the subscription gap: %s",
  async (changeDuringSubscribe) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const platform = vi.spyOn(navigator, "platform", "get").mockReturnValue("Win32");
    let nativeMaximized = false;
    let nativeFullscreen = false;
    const maximizedListeners = new Set<(value: boolean) => void>();
    const fullscreenListeners = new Set<(value: boolean) => void>();
    const getMaximized = vi.fn(() => nativeMaximized);
    const getFullscreen = vi.fn(() => nativeFullscreen);
    const unsubscribeMaximized = vi.fn();
    const unsubscribeFullscreen = vi.fn();
    const subscribeMaximized = vi.fn((listener: (value: boolean) => void) => {
      maximizedListeners.add(listener);
      nativeMaximized = changeDuringSubscribe;
      return () => {
        maximizedListeners.delete(listener);
        unsubscribeMaximized();
      };
    });
    const subscribeFullscreen = vi.fn((listener: (value: boolean) => void) => {
      fullscreenListeners.add(listener);
      nativeFullscreen = changeDuringSubscribe;
      return () => {
        fullscreenListeners.delete(listener);
        unsubscribeFullscreen();
      };
    });
    vi.stubGlobal("desktopBridge", {
      getWindowMaximizedState: getMaximized,
      getWindowFullscreenState: getFullscreen,
      onWindowMaximizedStateChange: subscribeMaximized,
      onWindowFullscreenStateChange: subscribeFullscreen,
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(() =>
        root.render(
          <DesktopWindowHost>
            <WindowStateProbe label="first" />
          </DesktopWindowHost>,
        ),
      );
      const mountedReads = [getMaximized.mock.calls.length, getFullscreen.mock.calls.length];
      expect
        .soft(mountedReads, "one initial read and one post-subscribe read per flag")
        .toEqual([2, 2]);
      expect(getMaximized.mock.invocationCallOrder[0]).toBeLessThan(
        subscribeMaximized.mock.invocationCallOrder[0]!,
      );
      expect(getMaximized.mock.invocationCallOrder[1]).toBeGreaterThan(
        subscribeMaximized.mock.invocationCallOrder[0]!,
      );
      expect(getFullscreen.mock.invocationCallOrder[0]).toBeLessThan(
        subscribeFullscreen.mock.invocationCallOrder[0]!,
      );
      expect(getFullscreen.mock.invocationCallOrder[1]).toBeGreaterThan(
        subscribeFullscreen.mock.invocationCallOrder[0]!,
      );
      expect(container.textContent).toContain(
        `first:${changeDuringSubscribe}:${changeDuringSubscribe}`,
      );
      expect(document.documentElement.dataset.windowMaximized).toBe(String(changeDuringSubscribe));
      expect(document.documentElement.dataset.windowFullscreen).toBe(String(changeDuringSubscribe));
      getMaximized.mockClear();
      getFullscreen.mockClear();
      await act(() =>
        root.render(
          <DesktopWindowHost>
            <WindowStateProbe label="second" />
          </DesktopWindowHost>,
        ),
      );
      const childrenReads = [getMaximized.mock.calls.length, getFullscreen.mock.calls.length];
      expect
        .soft(childrenReads, "changing children must not make synchronous native reads")
        .toEqual([0, 0]);
      getMaximized.mockClear();
      getFullscreen.mockClear();
      // Event payloads are authoritative even before another native getter could observe them.
      await act(() => maximizedListeners.forEach((listener) => listener(!changeDuringSubscribe)));
      const maximizedEventReads = [getMaximized.mock.calls.length, getFullscreen.mock.calls.length];
      expect.soft(maximizedEventReads, "maximized events must use their payload").toEqual([0, 0]);
      expect
        .soft(container.textContent)
        .toContain(`second:${!changeDuringSubscribe}:${changeDuringSubscribe}`);
      expect
        .soft(document.documentElement.dataset.windowMaximized)
        .toBe(String(!changeDuringSubscribe));
      getMaximized.mockClear();
      getFullscreen.mockClear();
      await act(() => fullscreenListeners.forEach((listener) => listener(!changeDuringSubscribe)));
      const fullscreenEventReads = [
        getMaximized.mock.calls.length,
        getFullscreen.mock.calls.length,
      ];
      expect.soft(fullscreenEventReads, "fullscreen events must use their payload").toEqual([0, 0]);
      expect
        .soft(container.textContent)
        .toContain(`second:${!changeDuringSubscribe}:${!changeDuringSubscribe}`);
      expect
        .soft(document.documentElement.dataset.windowFullscreen)
        .toBe(String(!changeDuringSubscribe));
      expect(subscribeMaximized).toHaveBeenCalledTimes(1);
      expect(subscribeFullscreen).toHaveBeenCalledTimes(1);
    } finally {
      await act(() => root.unmount());
      expect(maximizedListeners.size).toBe(0);
      expect(fullscreenListeners.size).toBe(0);
      expect(unsubscribeMaximized).toHaveBeenCalledTimes(1);
      expect(unsubscribeFullscreen).toHaveBeenCalledTimes(1);
      expect(document.documentElement.dataset.windowMaximized).toBeUndefined();
      expect(document.documentElement.dataset.windowFullscreen).toBeUndefined();
      container.remove();
      platform.mockRestore();
      vi.unstubAllGlobals();
    }
  },
);
