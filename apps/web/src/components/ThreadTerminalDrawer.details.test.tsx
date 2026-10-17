/**
 * Verifies drawer lifecycle against the real details-card collapse ownership and visibility store.
 * @vitest-environment jsdom
 */
import { EnvironmentId, ThreadId, type ScopedThreadRef } from "@t3tools/contracts";
import { act, StrictMode, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { selectThreadPanelVisibility, useRightPanelStore } from "../rightPanelStore";
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
