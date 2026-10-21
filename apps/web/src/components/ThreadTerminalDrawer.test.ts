/** Verifies terminal output synchronization, menu availability, theme and selection contracts. */
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createElement, act, useLayoutEffect } from "react";
import { create } from "react-test-renderer";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { setPhysicsEnabled } from "../lib/motion/preference";
import { useTerminalDrawerResize } from "./ThreadTerminalDrawer";

it("uses the current height budget throughout an active physical resize", async () => {
  const painted = new Map<string, string>();
  const drawerHeightRef = { current: 600 };
  const oldCommit = vi.fn();
  const newCommit = vi.fn();
  const target = {
    parentElement: {
      style: { setProperty: (key: string, value: string) => painted.set(key, value) },
    },
    setPointerCapture: vi.fn(),
    hasPointerCapture: () => true,
    releasePointerCapture: vi.fn(),
  };
  const threadRef = { environmentId: EnvironmentId.make("test"), threadId: ThreadId.make("test") };
  let handlers: ReturnType<typeof useTerminalDrawerResize>;
  /** Publishes committed hook handlers while keeping the same mounted resize owner across budget changes. */
  function Probe(props: { max: number; preferred: number; commit: (height: number) => void }) {
    const nextHandlers = useTerminalDrawerResize({
      drawerHeightRef,
      maxDrawerHeight: props.max,
      preferredDrawerHeight: props.preferred,
      visible: true,
      isPanel: false,
      threadRef,
      onCommit: props.commit,
    });
    useLayoutEffect(() => {
      handlers = nextHandlers;
    });
    return null;
  }
  const pointer = (y: number) =>
    ({
      currentTarget: target,
      button: 0,
      pointerId: 1,
      clientX: 0,
      clientY: y,
      timeStamp: 0,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    }) as unknown as Parameters<typeof handlers.onPointerDown>[0];
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("document", { body: { style: { removeProperty: vi.fn() } } });
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  setPhysicsEnabled(true);
  let renderer: ReturnType<typeof create> | undefined;
  try {
    await act(async () => {
      renderer = create(createElement(Probe, { max: 800, preferred: 600, commit: oldCommit }));
    });
    handlers!.onPointerDown(pointer(800));
    handlers!.onPointerMove(pointer(700));
    handlers!.refresh();
    expect(painted.get("height")).toBe("700px");
    await act(async () => {
      renderer!.update(createElement(Probe, { max: 400, preferred: 300, commit: newCommit }));
    });
    handlers!.onPointerMove(pointer(650));
    handlers!.refresh();
    expect(drawerHeightRef.current).toBe(400);
    // Elastic drawing may overshoot the new bound, but only within its 160px rubber range.
    expect(Number.parseFloat(painted.get("height")!)).toBeGreaterThan(400);
    expect(Number.parseFloat(painted.get("height")!)).toBeLessThan(560);
    handlers!.onPointerCancel(pointer(650));
    expect(painted.get("height")).toBe("300px");
    expect(drawerHeightRef.current).toBe(300);
    expect(oldCommit).not.toHaveBeenCalled();
    expect(newCommit).not.toHaveBeenCalled();
    drawerHeightRef.current = 600;
    await act(async () => {
      renderer!.update(createElement(Probe, { max: 800, preferred: 600, commit: oldCommit }));
    });
    handlers!.onPointerDown(pointer(800));
    await act(async () => {
      renderer!.update(createElement(Probe, { max: 400, preferred: 300, commit: newCommit }));
    });
    handlers!.onPointerMove(pointer(1000));
    handlers!.refresh();
    handlers!.onPointerUp(pointer(1000));
    expect(painted.get("height")).toBe("400px");
    expect(newCommit).toHaveBeenCalledExactlyOnceWith(400);
    expect(oldCommit).not.toHaveBeenCalled();
  } finally {
    await act(async () => renderer?.unmount());
    setPhysicsEnabled(false);
    vi.unstubAllGlobals();
  }
});
import {
  applyTerminalAttachStreamEvent,
  combineTerminalSessionState,
  EMPTY_TERMINAL_BUFFER_STATE,
  INITIAL_TERMINAL_OUTPUT_CURSOR,
  nextTerminalAttachSeedState,
} from "@t3tools/client-runtime/state/terminal";

import {
  shouldClearTerminalSelectionAction,
  shouldHandleTerminalExit,
  terminalContextMenuItems,
  synchronizeTerminalOutput,
  terminalSelectionLineRange,
  terminalSelectionMenuItems,
  terminalThemeFromApp,
} from "./ThreadTerminalDrawer";

describe("terminal selection menus", () => {
  it("keeps Add to chat visible but disabled when the terminal has no chat target", () => {
    expect(terminalSelectionMenuItems().map(({ id }) => id)).toEqual(["add-to-chat", "copy"]);
    expect(terminalContextMenuItems({ hasSelection: true }).map(({ id }) => id)).toEqual([
      "add-to-chat",
      "copy",
      "paste",
      "select-all",
      "scroll-to-bottom",
    ]);

    expect(
      terminalSelectionMenuItems({ canAddToChat: false }).map(({ id, disabled }) => ({
        id,
        disabled: !!disabled,
      })),
    ).toEqual([
      { id: "add-to-chat", disabled: true },
      { id: "copy", disabled: false },
    ]);
    expect(
      terminalContextMenuItems({ hasSelection: true, canAddToChat: false }).map(({ id }) => id),
    ).toEqual(["add-to-chat", "copy", "paste", "select-all", "scroll-to-bottom"]);
    expect(terminalContextMenuItems({ hasSelection: true, canAddToChat: false })[0]?.disabled).toBe(
      true,
    );
  });

  it("keeps local viewing actions available to a read-only observer", () => {
    const items = terminalContextMenuItems({ hasSelection: false, readOnly: true });
    expect(items.filter((item) => item.disabled).map((item) => item.id)).toEqual([
      "add-to-chat",
      "copy",
      "paste",
    ]);
    expect(items.filter((item) => !item.disabled).map((item) => item.id)).toEqual([
      "select-all",
      "scroll-to-bottom",
    ]);
  });
});

describe("terminalThemeFromApp", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses terminal colors inherited by the mount instead of a light document theme", () => {
    const root = { classList: { contains: () => false } };
    const body = {};
    const drawer = {};
    let canvasColor = "#000";
    const colors: Record<string, [number, number, number, number]> = {
      "#000": [0, 0, 0, 255],
      "#fff": [255, 255, 255, 255],
      "#ddd": [221, 221, 221, 255],
      "#111": [17, 17, 17, 255],
    };

    vi.stubGlobal("document", {
      documentElement: root,
      body,
      querySelector: () => drawer,
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({
          clearRect: () => undefined,
          fillRect: () => undefined,
          get fillStyle() {
            return canvasColor;
          },
          set fillStyle(value: string) {
            canvasColor = value;
          },
          getImageData: () => ({ data: colors[canvasColor] ?? [0, 0, 0, 0] }),
        }),
      }),
    });
    vi.stubGlobal("getComputedStyle", (element: object) => {
      const local = element === drawer;
      const values = local
        ? {
            "--terminal-background": "#000",
            "--terminal-foreground": "#fff",
            "--terminal-cursor": "#ddd",
            "--terminal-selection-background": "rgba(255, 255, 255, 0.2)",
          }
        : {
            "--terminal-background": "#fff",
            "--terminal-foreground": "#111",
          };
      return {
        backgroundColor: local ? "#000" : "#fff",
        color: local ? "#fff" : "#111",
        colorScheme: local ? "dark" : "light",
        getPropertyValue: (name: string) => values[name as keyof typeof values] ?? "",
      };
    });

    const theme = terminalThemeFromApp();

    expect(theme.background).toEqual({ r: 0, g: 0, b: 0 });
    expect(theme.foreground).toEqual({ r: 255, g: 255, b: 255 });
    expect(theme.cursor).toEqual({ r: 221, g: 221, b: 221 });
  });
});

describe("terminal selection actions", () => {
  it("clears a pending or currently owned menu when the selection disappears", () => {
    expect(
      shouldClearTerminalSelectionAction({
        actionPending: true,
        openMenuRequestId: null,
        currentRequestId: 4,
      }),
    ).toBe(true);
    expect(
      shouldClearTerminalSelectionAction({
        actionPending: false,
        openMenuRequestId: 4,
        currentRequestId: 4,
      }),
    ).toBe(true);
  });

  it("does not let an old selection popup cancel its replacement right-click menu", () => {
    expect(
      shouldClearTerminalSelectionAction({
        actionPending: false,
        openMenuRequestId: 3,
        currentRequestId: 4,
      }),
    ).toBe(false);
    expect(
      shouldClearTerminalSelectionAction({
        actionPending: false,
        openMenuRequestId: null,
        currentRequestId: 4,
      }),
    ).toBe(false);
  });

  it("uses Ghostty's physical screen range for visually wrapped selections", () => {
    expect(
      terminalSelectionLineRange({
        start: { y: 4 },
        end: { y: 6 },
      }),
    ).toEqual({ lineStart: 5, lineEnd: 7 });
  });

  it("handles an exit that lands while the terminal surface is still loading", () => {
    expect(shouldHandleTerminalExit("exited", "running", false, 1)).toBe(true);
    expect(shouldHandleTerminalExit("exited", "exited", false, 1)).toBe(false);
    expect(shouldHandleTerminalExit("closed", "running", true, 1)).toBe(false);
  });

  it.each(["closed", "exited"] as const)("ignores an unsynchronized %s seed", (status) => {
    expect(shouldHandleTerminalExit(status, "running", false, 0)).toBe(false);
    expect(shouldHandleTerminalExit(status, "running", false, 1)).toBe(true);
  });
});

it("retains visible output and selection until a replacement subscription receives its snapshot", () => {
  const terminal = { resetAndWrite: vi.fn(), write: vi.fn(), clearSelection: vi.fn() };
  const snapshot = {
    threadId: "thread",
    terminalId: "term-1",
    cwd: "/repo",
    worktreePath: null,
    status: "running" as const,
    pid: 123,
    history: "host output",
    exitCode: null,
    exitSignal: null,
    label: "Terminal 1",
    updatedAt: "2026-09-05T00:00:00.000Z",
  };
  const attached = applyTerminalAttachStreamEvent(nextTerminalAttachSeedState(), {
    type: "snapshot",
    snapshot,
  });
  const cursor = synchronizeTerminalOutput(terminal, attached, INITIAL_TERMINAL_OUTPUT_CURSOR);
  expect(terminal.resetAndWrite).toHaveBeenLastCalledWith("host output");
  terminal.resetAndWrite.mockClear();
  terminal.clearSelection.mockClear();

  const pending = combineTerminalSessionState(
    { ...snapshot, hasRunningSubprocess: false },
    EMPTY_TERMINAL_BUFFER_STATE,
  );
  expect(pending.status).toBe("running");
  expect(synchronizeTerminalOutput(terminal, pending, cursor)).toBe(cursor);
  expect(terminal.resetAndWrite).not.toHaveBeenCalled();
  expect(terminal.write).not.toHaveBeenCalled();
  expect(terminal.clearSelection).not.toHaveBeenCalled();

  const observed = applyTerminalAttachStreamEvent(nextTerminalAttachSeedState(), {
    type: "snapshot",
    snapshot: { ...snapshot, history: "host output\nobserved output" },
  });
  const observedCursor = synchronizeTerminalOutput(terminal, observed, cursor);
  expect(terminal.resetAndWrite).toHaveBeenLastCalledWith("host output\nobserved output");

  const cleared = applyTerminalAttachStreamEvent(observed, {
    type: "cleared",
    threadId: "thread",
    terminalId: "term-1",
  });
  synchronizeTerminalOutput(terminal, cleared, observedCursor);
  expect(terminal.resetAndWrite).toHaveBeenLastCalledWith("");
});
