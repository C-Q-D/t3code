/**
 * Exercises titlebar menu hover and dismissal through real slots and Base UI menus.
 * @vitest-environment jsdom
 */
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { TitlebarSlotOutlet, TitlebarSlotProvider } from "../frame/titlebarSlot";

const { selected } = vi.hoisted(() => ({ selected: vi.fn() }));
// Replace only server-backed action discovery/dispatch, not menu state or interaction.
vi.mock("../../state/use-orchestration-command", () => ({
  useOrchestrationCommand: () => vi.fn(),
}));
vi.mock("../../state/session", () => ({
  useEnvironmentScope: () => true,
  readEnvironmentScope: () => true,
}));
vi.mock("../../hooks/useSettings", () => ({ useClientSettings: () => "Arial" }));
vi.mock("../ProjectFavicon", () => ({ ProjectFavicon: () => null }));
vi.mock("~/hooks/useThreadActionMenu", () => ({
  useThreadActionMenu: ({
    menuPresenter,
  }: Parameters<typeof import("~/hooks/useThreadActionMenu").useThreadActionMenu>[0]) => ({
    openMenu: (position: { x: number; y: number }) =>
      menuPresenter
        .show(
          [
            { id: "mark-unread", label: "Mark unread" },
            {
              id: "snooze",
              label: "Snooze",
              children: [{ id: "snooze:custom", label: "Custom time" }],
            },
            {
              id: "auto-settle",
              label: "Auto-settle",
              children: [{ id: "auto-settle:disabled", label: "Keep open", checked: false }],
            },
          ],
          position,
        )
        .then(selected),
    closeMenu: menuPresenter.close,
  }),
}));
import { ChatHeader } from "./ChatHeader";

/** Mounts the production title button in its normal portal destination. */
function HeaderFixture() {
  const anchor = useRef<HTMLElement>(null);
  return (
    <TitlebarSlotProvider>
      <header data-window-titlebar="">
        <TitlebarSlotOutlet name="breadcrumb" />
        <TitlebarSlotOutlet name="actions" />
      </header>
      <button type="button">Outside</button>
      <ChatHeader
        activeThreadEnvironmentId={EnvironmentId.make("local")}
        activeThreadId={ThreadId.make("thread-1")}
        activeThreadTitle="Menu regression"
        isServerThread
        activeProject={null}
        parentThreadLink={null}
        onOpenThread={() => {}}
        onNewThreadInProject={() => {}}
        popoverAnchorRef={anchor}
        actions={null}
      />
    </TitlebarSlotProvider>
  );
}

let root: Root;
let container: HTMLDivElement;

/** Flushes focus scheduling and advances Base UI's hover/dismissal delay. */
async function flushMenu() {
  await act(() => vi.advanceTimersByTimeAsync(600));
  await act(() => vi.advanceTimersToNextFrame());
}

/** Opens the actual title button; the mock supplies only the action snapshot. */
async function openMenu() {
  await act(() => {
    const button = container.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!;
    button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    button.focus();
    button.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    button.click();
  });
  await flushMenu();
  expect(document.querySelectorAll('[role="menu"]')).toHaveLength(1);
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("scrollTo", () => {});
  vi.useFakeTimers();
  selected.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(() => root.render(<HeaderFixture />));
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it.each([
  ["Snooze", "Custom time", "snooze:custom"],
  ["Auto-settle", "Keep open", "auto-settle:disabled"],
])(
  "keeps the parent open while hovering %s and selects its child",
  async (label, child, action) => {
    await openMenu();
    const trigger = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (element) => element.textContent === label,
    )!;
    await act(() => {
      trigger.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      trigger.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    });
    await flushMenu();
    expect(document.querySelectorAll('[role="menu"]')).toHaveLength(2);
    expect(selected).not.toHaveBeenCalled();
    const choice = [...document.querySelectorAll<HTMLElement>('[role^="menuitem"]')].find(
      (element) => element.textContent === child,
    )!;
    await act(() => choice.click());
    await flushMenu();
    expect(selected).toHaveBeenCalledExactlyOnceWith(action);
    expect(document.querySelectorAll('[role="menu"]')).toHaveLength(0);
  },
);

it("closes on Escape and returns focus to the title", async () => {
  await openMenu();
  await act(() =>
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
  await flushMenu();
  expect(document.querySelectorAll('[role="menu"]')).toHaveLength(0);
  expect(document.activeElement).toBe(container.querySelector('button[aria-haspopup="menu"]'));
  expect(selected).toHaveBeenCalledExactlyOnceWith(null);
});

it("closes on an outside press without selecting an action", async () => {
  await openMenu();
  const outside = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === "Outside",
  )!;
  await act(() => {
    outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    outside.click();
  });
  await flushMenu();
  expect(document.querySelectorAll('[role="menu"]')).toHaveLength(0);
  expect(selected).toHaveBeenCalledExactlyOnceWith(null);
});

it("closes after selecting an ordinary command", async () => {
  await openMenu();
  const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (element) => element.textContent === "Mark unread",
  )!;
  await act(() => item.click());
  await flushMenu();
  expect(document.querySelectorAll('[role="menu"]')).toHaveLength(0);
  expect(selected).toHaveBeenCalledExactlyOnceWith("mark-unread");
});

it("closes when the title is clicked again", async () => {
  await openMenu();
  const button = container.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!;
  await act(() => {
    button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    button.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    button.click();
  });
  await flushMenu();
  expect(document.querySelectorAll('[role="menu"]')).toHaveLength(0);
  expect(selected).toHaveBeenCalledExactlyOnceWith(null);
});

it("still starts renaming when the title is double-clicked", async () => {
  await openMenu();
  const button = container.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!;
  await act(() => {
    button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, detail: 2 }));
    button.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, detail: 2 }));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 2 }));
    button.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, detail: 2 }));
  });
  await flushMenu();
  expect(document.querySelectorAll('[role="menu"]')).toHaveLength(0);
  expect(container.querySelector("input")?.value).toBe("Menu regression");
  expect(selected).toHaveBeenCalledExactlyOnceWith(null);
});
