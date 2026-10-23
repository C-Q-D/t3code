/**
 * Exercises legacy options through the production sidebar and real DOM controls.
 * @vitest-environment jsdom
 */
import {
  DEFAULT_CLIENT_SETTINGS,
  type ClientSettings,
  type ClientSettingsPatch,
} from "@t3tools/contracts/settings";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import LegacySidebar from "./LegacySidebar";
import { SidebarProvider } from "./ui/sidebar";
import { CommandDialog } from "./ui/command";

type EntitiesModule = typeof import("../state/entities");
type EnvironmentsModule = typeof import("../state/environments");
type AtomModule = typeof import("@effect/atom-react");
type SettingsModule = typeof import("../hooks/useSettings");
const empty = vi.hoisted(() => []);
let settings: ClientSettings;
const writes: ClientSettingsPatch[] = [];
const subscribers = new Set<() => void>();

vi.mock("../state/entities", async (original) => ({
  ...(await original<EntitiesModule>()),
  useProjects: () => empty,
  useThreadShells: () => empty,
}));
vi.mock("../state/environments", async (original) => ({
  ...(await original<EnvironmentsModule>()),
  useEnvironments: () => ({ environments: empty }),
  usePrimaryEnvironmentId: () => null,
}));
vi.mock("@effect/atom-react", async (original) => ({
  ...(await original<AtomModule>()),
  useAtomValue: () => empty,
}));
vi.mock("../hooks/useHandleNewThread", () => ({ useNewThreadHandler: () => vi.fn() }));
vi.mock("../hooks/useThreadActions", () => ({
  useThreadActions: () => ({
    archiveThread: vi.fn(),
    deleteThread: vi.fn(),
    markThreadUnread: vi.fn(),
  }),
}));
vi.mock("../state/desktopUpdate", () => ({ useDesktopUpdateState: () => null }));
vi.mock("../connection/useDesktopLocalBootstraps", () => ({
  useDesktopLocalBootstraps: () => empty,
}));
vi.mock("@formkit/auto-animate", () => ({ autoAnimate: () => ({ disable() {} }) }));
vi.mock("./sidebar/SidebarChrome", () => ({ SidebarChromeFooter: () => null }));
vi.mock("../hooks/useSettings", async (original) => ({
  ...(await original<SettingsModule>()),
  useClientSettings: (select = (value: ClientSettings) => value) =>
    select(
      useSyncExternalStore(
        (listener) => {
          subscribers.add(listener);
          return () => {
            subscribers.delete(listener);
          };
        },
        () => settings,
      ),
    ),
  updateClientSettings: (patch: ClientSettingsPatch) => {
    writes.push(patch);
    settings = { ...settings, ...patch };
    subscribers.forEach((listener) => listener());
  },
}));

let root: Root;
let host: HTMLDivElement;

/** Supplies only the normal app providers; settings writes cross the real sidebar handlers. */
function SidebarFixture() {
  return (
    <SidebarProvider>
      <CommandDialog>
        <LegacySidebar routeReveal={{ observedKey: null, pendingKey: null }} />
      </CommandDialog>
    </SidebarProvider>
  );
}

/** Advances Base UI focus scheduling without wall-clock sleeps. */
async function flushFocus() {
  await act(() => vi.advanceTimersByTimeAsync(0));
  await act(() => vi.advanceTimersToNextFrame());
}

/** Finds a control by its accessible label; throws when the UI does not expose it. */
function control(label: string) {
  const element = document.querySelector<HTMLElement>(`[aria-label="${label}"]`);
  expect(element, label).not.toBeNull();
  return element!;
}

beforeEach(async () => {
  settings = {
    ...DEFAULT_CLIENT_SETTINGS,
    sidebarProjectSortOrder: "updated_at",
    sidebarThreadSortOrder: "updated_at",
    sidebarThreadPreviewCount: 5,
  };
  writes.length = 0;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    /** JSDOM has no layout changes; observer registration remains inert. */
    class {
      /** Accepts observation without fabricating layout events. */
      observe() {}
      /** Releases the inert observation. */
      unobserve() {}
      /** Leaves no observer resources behind. */
      disconnect() {}
    },
  );
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal("scrollTo", () => {});
  Object.defineProperty(HTMLElement.prototype, "getAnimations", {
    configurable: true,
    value: () => [],
  });
  vi.useFakeTimers();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const router = createRouter({
    routeTree: createRootRoute({ component: SidebarFixture }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  await act(() => root.render(<RouterProvider router={router} />));
});

afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLElement.prototype, "getAnimations");
});

it("writes all three settings through the options form and restores focus on Escape", async () => {
  const trigger = control("Sidebar options");
  await act(() => {
    trigger.focus();
    trigger.click();
  });
  await flushFocus();
  const dialog = document.querySelector('[role="dialog"]');
  expect(dialog).not.toBeNull();
  const title = dialog!.querySelector("h2");
  expect(title?.textContent).toBe("Sidebar options");
  expect(dialog!.getAttribute("aria-labelledby")).toBe(title!.id);
  expect(dialog!.hasAttribute("aria-label")).toBe(false);
  const projectSort = control("Sort projects");
  await act(() => projectSort.click());
  await flushFocus();
  const manual = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
    (item) => item.textContent === "Manual",
  );
  expect(manual).toBeDefined();
  await act(() => manual!.click());
  const createdAt = document.querySelector<HTMLInputElement>(
    'input[type="radio"][value="created_at"]',
  );
  expect(createdAt).not.toBeNull();
  await act(() => createdAt!.click());
  const increment = control("Increase visible thread count");
  await act(() => increment.click());
  expect(writes).toEqual([
    { sidebarProjectSortOrder: "manual" },
    { sidebarThreadSortOrder: "created_at" },
    { sidebarThreadPreviewCount: 6 },
  ]);
  expect((control("Visible thread count") as HTMLInputElement).value).toBe("6");
  await act(() => {
    increment.focus();
    increment.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  await flushFocus();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it("clamps typed preview counts to 1 and 15 and disables the matching step", async () => {
  await act(() => control("Sidebar options").click());
  await flushFocus();
  const input = control("Visible thread count") as HTMLInputElement;
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(() => {
    setValue.call(input, "0");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(writes).toEqual([{ sidebarThreadPreviewCount: 1 }]);
  expect(input.value).toBe("1");
  expect((control("Decrease visible thread count") as HTMLButtonElement).disabled).toBe(true);
  await act(() => {
    setValue.call(input, "20");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(writes).toEqual([{ sidebarThreadPreviewCount: 1 }, { sidebarThreadPreviewCount: 15 }]);
  expect(input.value).toBe("15");
  expect((control("Increase visible thread count") as HTMLButtonElement).disabled).toBe(true);
});
