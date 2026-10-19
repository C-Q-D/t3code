/**
 * Verifies drawer lifecycle against the real details-card collapse ownership and visibility store.
 * @vitest-environment jsdom
 */
import { EnvironmentId, ThreadId, type ScopedThreadRef } from "@t3tools/contracts";
import { act, StrictMode, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { selectThreadPanelVisibility, useRightPanelStore } from "../rightPanelStore";
import { setPhysicsEnabled } from "../lib/motion/preference";
import { activeJobs } from "../lib/motion/loop";
import { useTerminalUiStateStore, selectThreadTerminalUiState } from "../terminalUiStateStore";
import ThreadTerminalDrawer from "./ThreadTerminalDrawer";

/** Full session module shape retained while replacing only the server-backed grant hook. */
type SessionModule = typeof import("../state/session");

// Session discovery and grants require a server; collapse ownership and the drawer remain real.
vi.mock("../state/terminalSessions", () => ({ useKnownTerminalSessions: () => [] }));
vi.mock("../state/session", async (importOriginal) => ({
  ...(await importOriginal<SessionModule>()),
  useEnvironmentScope: () => true,
}));

const thread = {
  environmentId: EnvironmentId.make("drawer-details"),
  threadId: ThreadId.make("thread"),
};
const nextThread = { ...thread, threadId: ThreadId.make("next") };
const nextEnvironment = { ...thread, environmentId: EnvironmentId.make("other-environment") };
const drawerProps = {
  cwd: "/repo",
  height: 300,
  terminalIds: [],
  activeTerminalId: "",
  terminalGroups: [],
  activeTerminalGroupId: "",
  focusRequestId: 0,
  keybindings: [],
  onSplitTerminal: () => {},
  onSplitTerminalVertical: () => {},
  onNewTerminal: () => {},
  onActiveTerminalChange: () => {},
  onCloseTerminal: () => {},
  onHeightChange: () => {},
  onAddTerminalContext: () => {},
} satisfies Omit<ComponentProps<typeof ThreadTerminalDrawer>, "threadRef" | "threadId">;
let container: HTMLDivElement;
let root: Root;

/** Read the effective visibility consumed by both details-card presentations. */
function visibility(ref: ScopedThreadRef = thread) {
  return selectThreadPanelVisibility(
    useRightPanelStore.getState().threadPanelVisibilityByThreadKey,
    ref,
  );
}

/** Drive the actual drawer props used by persistent ChatView mounts, including Strict Mode cleanup. */
async function renderDrawer(visible: boolean, ref = thread, mode: "drawer" | "panel" = "drawer") {
  await act(async () =>
    root.render(
      <StrictMode>
        <ThreadTerminalDrawer
          {...drawerProps}
          threadRef={ref}
          threadId={ref.threadId}
          visible={visible}
          mode={mode}
        />
      </StrictMode>,
    ),
  );
}

beforeEach(() => {
  setPhysicsEnabled(false);
  useTerminalUiStateStore.setState({ terminalUiStateByThreadKey: {} });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  useRightPanelStore.setState({ threadPanelVisibilityByThreadKey: {} });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  useRightPanelStore.setState({ threadPanelVisibilityByThreadKey: {} });
  setPhysicsEnabled(false);
  useTerminalUiStateStore.setState({ terminalUiStateByThreadKey: {} });
  vi.unstubAllGlobals();
});

it.each([true, false])(
  "collapses on open and restores the prior inline state (%s) on close",
  async (inlineOpen) => {
    useRightPanelStore.getState().setThreadPanelOpen(thread, "inline", inlineOpen);
    useRightPanelStore.getState().setThreadPanelOpen(thread, "popover", true);
    await renderDrawer(false);
    expect(visibility()).toEqual({ inlineOpen, popoverOpen: true });
    await renderDrawer(true);
    expect(visibility()).toEqual({ inlineOpen: false, popoverOpen: false });
    await renderDrawer(false);
    expect(visibility()).toEqual({ inlineOpen, popoverOpen: true });
  },
);

it.each([nextThread, nextEnvironment])(
  "releases the previous scoped thread when switching to $environmentId/$threadId",
  async (next) => {
    await renderDrawer(true);
    await renderDrawer(true, next);
    expect(visibility(thread)).toEqual({ inlineOpen: true, popoverOpen: false });
    expect(visibility(next)).toEqual({ inlineOpen: false, popoverOpen: false });
    await renderDrawer(false, next);
    expect(visibility(next)).toEqual({ inlineOpen: true, popoverOpen: false });
  },
);

it("releases a hidden persistent drawer without collapsing the next closed thread", async () => {
  await renderDrawer(true);
  await renderDrawer(false);
  expect(visibility()).toEqual({ inlineOpen: true, popoverOpen: false });
  await renderDrawer(false, nextThread);
  expect(visibility(nextThread)).toEqual({ inlineOpen: true, popoverOpen: false });
});

it("releases collapse ownership when the open drawer unmounts", async () => {
  await renderDrawer(true);
  expect(visibility().inlineOpen).toBe(false);
  await act(async () => root.render(null));
  expect(visibility()).toEqual({ inlineOpen: true, popoverOpen: false });
  // Reopening must capture the new preference rather than a leaked previous owner's snapshot.
  useRightPanelStore.getState().setThreadPanelOpen(thread, "inline", false);
  await renderDrawer(true);
  await renderDrawer(false);
  expect(visibility().inlineOpen).toBe(false);
});

it("allows temporary manual expansion but restores the opening snapshot on close", async () => {
  useRightPanelStore.getState().setThreadPanelOpen(thread, "inline", false);
  await renderDrawer(true);
  useRightPanelStore.getState().setThreadPanelOpen(thread, "inline", true);
  useRightPanelStore.getState().setThreadPanelOpen(thread, "popover", true);
  // A fresh ref object for the same scoped thread must not acquire another collapse request.
  await renderDrawer(true, { ...thread });
  expect(visibility()).toEqual({ inlineOpen: true, popoverOpen: true });
  await renderDrawer(false);
  expect(visibility()).toEqual({ inlineOpen: false, popoverOpen: false });
});

it("does not collapse details for the right-side terminal panel", async () => {
  await renderDrawer(true, thread, "panel");
  expect(visibility()).toEqual({ inlineOpen: true, popoverOpen: false });
});

/** Send a browser-shaped pointer event with a deterministic sampling time. */
async function resizePointer(handle: HTMLElement, type: string, y: number, time: number) {
  const event = new MouseEvent(type, { clientY: y, bubbles: true, cancelable: true, button: 0 });
  Object.defineProperties(event, { pointerId: { value: 1 }, timeStamp: { value: time } });
  await act(() => handle.dispatchEvent(event));
}

/** Provide capture and a manually advanced frame queue while exercising the actual drawer DOM. */
function drawerGesture() {
  const drawer = container.querySelector<HTMLElement>("[data-thread-terminal-drawer]")!;
  const handle = drawer.firstElementChild as HTMLElement;
  let captured = false;
  Object.assign(handle, {
    setPointerCapture: () => {
      captured = true;
    },
    hasPointerCapture: () => captured,
    releasePointerCapture: () => {
      captured = false;
    },
  });
  const frames = new Map<number, FrameRequestCallback>();
  let nextId = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++nextId, callback);
    return nextId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  return {
    drawer,
    handle,
    async step(time: number) {
      const pending = [...frames.values()];
      frames.clear();
      await act(() => pending.forEach((callback) => callback(time)));
    },
  };
}

it("hides the drawer on a downward fling while retaining its sessions and saved height", async () => {
  setPhysicsEnabled(true);
  useTerminalUiStateStore
    .getState()
    .ensureTerminal(thread, "keep-session", { open: true, active: true });
  const before = selectThreadTerminalUiState(
    useTerminalUiStateStore.getState().terminalUiStateByThreadKey,
    thread,
  );
  await renderDrawer(true);
  const { drawer, handle } = drawerGesture();
  await resizePointer(handle, "pointerdown", 100, 0);
  await resizePointer(handle, "pointermove", 230, 40);
  await resizePointer(handle, "pointerup", 240, 50);
  const after = selectThreadTerminalUiState(
    useTerminalUiStateStore.getState().terminalUiStateByThreadKey,
    thread,
  );
  expect(after.terminalOpen).toBe(false);
  expect(after.terminalIds).toEqual(["keep-session"]);
  expect(after.terminalHeight).toBe(before.terminalHeight);
  expect(drawer.style.height).toBe("300px");
});

it("compresses a slow downward overshoot and returns to 180px without hiding", async () => {
  setPhysicsEnabled(true);
  useTerminalUiStateStore.getState().setTerminalOpen(thread, true);
  await renderDrawer(true);
  const gesture = drawerGesture();
  await resizePointer(gesture.handle, "pointerdown", 100, 0);
  await resizePointer(gesture.handle, "pointermove", 320, 1000);
  await gesture.step(16);
  expect(parseFloat(gesture.drawer.style.height)).toBeCloseTo(139.06976744186048, 6);
  await resizePointer(gesture.handle, "pointerup", 320, 1100);
  expect(activeJobs()).toBe(1);
  for (let time = 32; activeJobs() && time < 3000; time += 16) await gesture.step(time);
  expect(activeJobs()).toBe(0);
  expect(gesture.drawer.style.height).toBe("180px");
  expect(
    selectThreadTerminalUiState(
      useTerminalUiStateStore.getState().terminalUiStateByThreadKey,
      thread,
    ).terminalOpen,
  ).toBe(true);
});

it("keeps the existing hard-clamped drawer drag when physics is disabled", async () => {
  useTerminalUiStateStore.getState().setTerminalOpen(thread, true);
  await renderDrawer(true);
  const { drawer, handle } = drawerGesture();
  await resizePointer(handle, "pointerdown", 100, 0);
  await resizePointer(handle, "pointermove", 320, 30);
  expect(drawer.style.height).toBe("180px");
  await resizePointer(handle, "pointerup", 320, 40);
  expect(activeJobs()).toBe(0);
  expect(
    selectThreadTerminalUiState(
      useTerminalUiStateStore.getState().terminalUiStateByThreadKey,
      thread,
    ).terminalOpen,
  ).toBe(true);
});

it("hides a minimum-height drawer after twelve downward 8ms moves", async () => {
  setPhysicsEnabled(true);
  useTerminalUiStateStore.getState().setTerminalOpen(thread, true);
  await act(() =>
    root.render(
      <ThreadTerminalDrawer
        {...drawerProps}
        height={180}
        threadRef={thread}
        threadId={thread.threadId}
        visible
      />,
    ),
  );
  const gesture = drawerGesture();
  await resizePointer(gesture.handle, "pointerdown", 583, 0);
  for (let step = 1; step <= 12; step++) {
    await resizePointer(gesture.handle, "pointermove", 583 + (160 * step) / 12, 8 * step);
    await gesture.step(8 * step);
  }
  await resizePointer(gesture.handle, "pointerup", 743, 96.28);
  expect(
    selectThreadTerminalUiState(
      useTerminalUiStateStore.getState().terminalUiStateByThreadKey,
      thread,
    ).terminalOpen,
  ).toBe(false);
});
