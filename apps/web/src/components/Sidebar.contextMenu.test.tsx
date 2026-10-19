/**
 * Exercises production sidebar menu ownership with a real router and Base UI focus/selection.
 * @vitest-environment jsdom
 */
import { EnvironmentId, ThreadId, type ScopedThreadRef } from "@t3tools/contracts";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { useSidebarThreadContextMenu, useSidebarThreadContextMenuTrigger } from "./Sidebar";
import {
  buildSidebarThreadActionMenuItems,
  type ThreadActionMenuId,
} from "./threadActionMenu.logic";

const resolutions: Array<{ thread: string; action: ThreadActionMenuId | null }> = [];
// Retain interaction coverage for the reversible, enabled snooze UI.
vi.mock("../snoozeUi", () => ({ SNOOZE_UI_ENABLED: true }));
const dispatched: Array<{ thread: string; action: ThreadActionMenuId }> = [];
let root: Root;
let container: HTMLDivElement;

/** Uses the same production row keyboard/pointer handlers as SidebarThreadRow. */
function Row({
  id,
  open,
}: {
  id: string;
  open: (
    thread: ScopedThreadRef,
    position: { x: number; y: number },
    trigger?: HTMLElement,
  ) => void;
}) {
  const thread = { environmentId: EnvironmentId.make("local"), threadId: ThreadId.make(id) };
  const { handleContextMenu, handleKeyDown } = useSidebarThreadContextMenuTrigger(
    thread,
    open,
    () => {},
  );
  return (
    <div role="button" tabIndex={0} onContextMenu={handleContextMenu} onKeyDown={handleKeyDown}>
      {id}
    </div>
  );
}

/** Keeps the sidebar mounted across draft routes and consumes the production dispatch promise. */
function MenuFixture() {
  const menu = useSidebarThreadContextMenu();
  const open = async (
    thread: ScopedThreadRef,
    position: { x: number; y: number },
    trigger?: HTMLElement,
  ) => {
    const action = await menu.show(
      buildSidebarThreadActionMenuItems({
        canOperate: true,
        branch: "main",
        projectFilter: null,
        isPinned: false,
        isSettled: false,
        autoSettleEnabled: true,
        isSnoozed: false,
        canSnoozeNow: true,
        isRegeneratingTitle: false,
        isRunning: false,
        hasDraft: false,
        supports: {
          settlement: true,
          autoSettleOptOut: true,
          snooze: true,
          pinning: true,
          titleRegeneration: true,
        },
        snoozePresets: [],
      }),
      position,
      trigger,
    );
    resolutions.push({ thread: thread.threadId, action });
    // This is the await/null boundary used by Sidebar's existing action switch.
    if (action !== null) dispatched.push({ thread: thread.threadId, action });
  };
  return (
    <>
      <Row id="thread-a" open={open} />
      <Row id="thread-b" open={open} />
      {menu.popup}
      <Outlet />
    </>
  );
}

/** Mounts an actual memory router so navigation exercises subscriptions and route retention. */
async function mountMenu(initialEntries = ["/draft/first"]) {
  const rootRoute = createRootRoute({ component: MenuFixture });
  const draft = createRoute({
    getParentRoute: () => rootRoute,
    path: "/draft/$draftId",
    component: () => null,
  });
  const settings = createRoute({
    getParentRoute: () => rootRoute,
    path: "/settings",
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([draft, settings]),
    history: createMemoryHistory({ initialEntries }),
  });
  await router.load();
  await act(() => root.render(<RouterProvider router={router} />));
  return router;
}

/** Flushes Base UI's focus microtask and animation-frame work, without wall-clock sleeps. */
async function flushFocus() {
  await act(() => vi.advanceTimersByTimeAsync(0));
  await act(() => vi.advanceTimersToNextFrame());
}

/** Opens through the production key handler, leaving Base UI to focus its menu. */
async function openRow(id: string, key = "ContextMenu") {
  const row = [...container.querySelectorAll<HTMLElement>('[role="button"]')].find(
    (element) => element.textContent === id,
  )!;
  await act(() => {
    row.focus();
    row.dispatchEvent(
      new KeyboardEvent("keydown", {
        key,
        shiftKey: key === "F10",
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await flushFocus();
  expect(document.querySelector('[role="menu"]')).not.toBeNull();
  return row;
}

/** Finds a visible command by its accessible text, not its implementation classes. */
function command(label: string) {
  const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (element) => element.textContent === label,
  );
  expect(item).toBeDefined();
  return item!;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("scrollTo", () => {});
  vi.useFakeTimers();
  resolutions.length = 0;
  dispatched.length = 0;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it.each(["/draft/second", "/settings", "/draft/first?view=changed", "/draft/first#notes"])(
  "cancels the pending selection when navigating from an unpromoted draft to %s",
  async (destination) => {
    const router = await mountMenu();
    await openRow("thread-a");
    const staleCommand = command("Mark unread");
    await act(async () => {
      router.history.push(destination);
    });
    await flushFocus();
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(resolutions).toEqual([{ thread: "thread-a", action: null }]);
    await act(() => staleCommand.click());
    expect(dispatched).toEqual([]);
  },
);

it("cancels the pending selection when browser history returns to another draft", async () => {
  const router = await mountMenu(["/draft/second", "/draft/first"]);
  await openRow("thread-a");
  await act(async () => {
    router.history.back();
  });
  await flushFocus();
  expect(router.state.location.pathname).toBe("/draft/second");
  expect(document.querySelector('[role="menu"]')).toBeNull();
  expect(resolutions).toEqual([{ thread: "thread-a", action: null }]);
  expect(dispatched).toEqual([]);
});

it.each(["ContextMenu", "F10"])(
  "opens with %s and delivers the selected action to the awaiting dispatcher",
  async (key) => {
    await mountMenu();
    await openRow("thread-a", key);
    expect(document.activeElement?.closest('[role="menu"]')).not.toBeNull();
    await act(() => command("Mark unread").click());
    await flushFocus();
    expect(dispatched).toEqual([{ thread: "thread-a", action: "mark-unread" }]);
    expect(document.querySelector('[role="menu"]')).toBeNull();
  },
);

it("cancels on Escape and restores focus to the originating row", async () => {
  await mountMenu();
  const row = await openRow("thread-a");
  await act(() =>
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
  await flushFocus();
  expect(document.querySelector('[role="menu"]')).toBeNull();
  expect(document.activeElement).toBe(row);
  expect(resolutions).toEqual([{ thread: "thread-a", action: null }]);
  expect(dispatched).toEqual([]);
});

it.each([
  ["Snooze", "Custom…", "snooze:custom"],
  ["Auto-settle", "Disabled", "auto-settle:disabled"],
])(
  "keeps the parent open when hovering the %s submenu and dispatches its choice",
  async (label, choiceLabel, action) => {
    await mountMenu();
    await openRow("thread-a");
    const submenu = [...document.querySelectorAll<HTMLElement>('[aria-haspopup="menu"]')].find(
      (element) => element.textContent?.startsWith(label),
    );
    expect(submenu).toBeDefined();
    await act(() => {
      submenu!.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      submenu!.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    });
    // Advance the real Base UI hover delay; no menu state or component is mocked.
    await act(() => vi.advanceTimersByTimeAsync(200));
    await flushFocus();
    expect(document.querySelectorAll('[role="menu"]')).toHaveLength(2);
    expect(resolutions).toEqual([]);
    const choice = [...document.querySelectorAll<HTMLElement>('[role^="menuitem"]')].find(
      (element) => element.textContent === choiceLabel,
    )!;
    await act(() => choice.click());
    await flushFocus();
    expect(dispatched).toEqual([{ thread: "thread-a", action }]);
    expect(document.querySelectorAll('[role="menu"]')).toHaveLength(0);
  },
);

it("opening another row cancels the first promise and only dispatches for the second row", async () => {
  await mountMenu();
  await openRow("thread-a");
  // A pointer context menu does not first move focus out of the old popup.
  const nextRow = [...container.querySelectorAll<HTMLElement>('[role="button"]')].find(
    (element) => element.textContent === "thread-b",
  )!;
  await act(() =>
    nextRow.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 20, clientY: 40 }),
    ),
  );
  await flushFocus();
  expect(resolutions).toEqual([{ thread: "thread-a", action: null }]);
  await act(() => command("Mark unread").click());
  await flushFocus();
  expect(resolutions).toEqual([
    { thread: "thread-a", action: null },
    { thread: "thread-b", action: "mark-unread" },
  ]);
  expect(dispatched).toEqual([{ thread: "thread-b", action: "mark-unread" }]);
});
