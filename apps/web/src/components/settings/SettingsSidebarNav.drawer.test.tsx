/**
 * Exercises settings drawer shortcuts and category keyboard entry through the real navigation.
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vite-plus/test";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useLocation: ({ select }: { select: (location: { hash: string; search: object }) => unknown }) =>
    select({ hash: "", search: {} }),
}));
vi.mock("../sidebar/mainAppLocation", () => ({ useNavigateToMainApp: () => vi.fn() }));
vi.mock("./useAvailableSettingsSearchItems", () => ({ useAvailableSettingsSearchItems: () => [] }));
vi.mock("../clerk/T3ConnectSidebarSignIn", () => ({
  T3ConnectSidebarSignIn: () => null,
  T3ConnectSidebarAvatar: () => null,
}));

import { Sidebar, SidebarProvider, SidebarTrigger } from "../ui/sidebar";
import { SettingsSidebarNav } from "./SettingsSidebarNav";

afterEach(() => vi.unstubAllGlobals());

it.each([
  { key: "f", ctrlKey: true, metaKey: false },
  { key: "f", ctrlKey: false, metaKey: true },
  { key: "/", ctrlKey: false, metaKey: false },
])(
  "opens and focuses settings search from a closed 1024px drawer with $key/$ctrlKey/$metaKey",
  async (shortcut) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: 1024 <= Number(/max-width: (\d+)px/.exec(query)?.[1]),
      addEventListener() {},
      removeEventListener() {},
    }));
    // The queue represents browser animation frames, not elapsed-time polling.
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      frames.push(callback),
    );
    vi.stubGlobal("cancelAnimationFrame", () => {});
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () =>
        root.render(
          <SidebarProvider>
            <SidebarTrigger />
            <Sidebar variant="frame">
              <SettingsSidebarNav pathname="/settings/general" />
            </Sidebar>
          </SidebarProvider>,
        ),
      );
      const trigger = container.querySelector("button");
      if (!trigger) throw new Error("Missing drawer trigger");
      expect(trigger.getAttribute("aria-pressed")).toBe("false");
      const retainedSearch = document.querySelector('input[role="combobox"]');
      if (!retainedSearch) throw new Error("Settings search must stay mounted while closed");
      expect(retainedSearch.closest('[inert][aria-hidden="true"]')).not.toBeNull();
      expect(retainedSearch.closest("[hidden]")).not.toBeNull();
      document.body.focus();
      await act(() =>
        document.body.dispatchEvent(
          new KeyboardEvent("keydown", { ...shortcut, bubbles: true, cancelable: true }),
        ),
      );
      expect(trigger.getAttribute("aria-pressed")).toBe("true");
      await act(() => {
        frames.splice(0).forEach((callback) => callback(0));
      });
      const search = document.querySelector('input[role="combobox"]');
      expect(search).not.toBeNull();
      expect(document.activeElement).toBe(search);
      expect(search?.closest("[inert], [hidden], [aria-hidden=true]")).toBeNull();
      await act(() =>
        retainedSearch.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        ),
      );
      expect(trigger.getAttribute("aria-pressed")).toBe("false");
      expect(document.querySelector('input[role="combobox"]')).toBe(retainedSearch);
      expect(retainedSearch.closest('[inert][aria-hidden="true"]')).not.toBeNull();
    } finally {
      await act(() => root.unmount());
      container.remove();
    }
  },
);

it.each([
  ["/settings/open-source-licenses", "/settings/general"],
  ["/settings/diagnostics", "/settings/general"],
  ["/settings/providers/example-instance", "/settings/providers"],
  ["/settings/providers/", "/settings/providers"],
])("keeps one category Tab stop for %s on %s", async (pathname, expectedSection) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <SidebarProvider>
          <SettingsSidebarNav pathname={pathname} />
        </SidebarProvider>,
      ),
    );
    const tabStops = container.querySelectorAll<HTMLButtonElement>(
      '[data-settings-section][tabindex="0"]',
    );
    expect(tabStops).toHaveLength(1);
    expect(tabStops[0]?.dataset.settingsSection).toBe(expectedSection);
    expect(tabStops[0]?.getAttribute("aria-current")).toBe("page");
  } finally {
    await act(() => root.unmount());
    container.remove();
  }
});
