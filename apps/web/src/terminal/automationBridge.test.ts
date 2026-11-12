import { expect, it, vi } from "vite-plus/test";
import type * as A from "@t3tools/contracts";
import {
  applyTerminalAttachStreamEvent,
  EMPTY_TERMINAL_BUFFER_STATE,
  type TerminalAutomationOutput,
} from "@t3tools/client-runtime/state/terminal";
import { createTerminalAutomationBridge, readAutomationOutput } from "./automationBridge";
import { GhosttyTerminalCore } from "./ghostty/core";
import {
  encodeGhosttyAutomation,
  ghosttyAutomationFrame,
  readGhosttyAutomation,
} from "./ghostty/automation";

vi.mock("./ghostty/vendor/ghostty-vt.wasm?url", async () => ({
  default: (await import("./ghostty/vendor/ghostty-vt.wasm?inline")).default,
}));
vi.mock("./ghostty/vendor/ghostty-write-pty.wasm?url&no-inline", async () => ({
  default: (await import("./ghostty/vendor/ghostty-write-pty.wasm?inline")).default,
}));

const frame: A.TerminalAutomationFrame = {
  activeScreen: "primary",
  cols: 8,
  rows: 3,
  viewportStartLine: 0,
  retainedRange: { startLine: 0, endLineExclusive: 3 },
  sequence: 4,
  frameRevision: 1,
  cursor: { status: "unknown" },
  pendingWrap: null,
};
const target = { terminalId: "term", terminalInstanceId: "instance", viewId: "view" };
const binding = { bindingId: "binding", target, alias: "terminal", inputEpoch: 0 };
const fields = { version: 1 as const, bridgeRequestId: "bridge", binding };

it("reads actual sequenced PTY chunks with UTF16 budgets, gaps and instance resets", () => {
  const snapshot: A.TerminalSessionSnapshot = {
    terminalInstanceId: "instance",
    threadId: "thread",
    terminalId: "term",
    cwd: "/",
    worktreePath: null,
    status: "running",
    pid: 1,
    history: "a😀b\n",
    sequence: 2,
    exitCode: null,
    exitSignal: null,
    label: "Terminal",
    updatedAt: "2026-11-12T00:00:00Z",
  };
  let state = applyTerminalAttachStreamEvent(EMPTY_TERMINAL_BUFFER_STATE, {
    type: "snapshot",
    snapshot,
  });
  state = applyTerminalAttachStreamEvent(state, {
    type: "output",
    threadId: "thread",
    terminalId: "term",
    sequence: 3,
    data: "tail",
  });
  const budget = { maxCodeUnits: 3, maxLines: 1 };
  state = applyTerminalAttachStreamEvent(state, {
    type: "snapshot",
    snapshot: { ...snapshot, sequence: 3, history: "a😀b\ntail" },
  });
  expect(
    readAutomationOutput(
      state.automation!,
      { source: "output", cursor: { sequence: 3, codeUnitOffset: 4 }, budget },
      frame,
    ),
  ).toMatchObject({ text: "", change: "no_change", continuity: "complete" });
  const first = readAutomationOutput(
    state.automation!,
    { source: "output", cursor: null, budget },
    frame,
  );
  expect(first).toMatchObject({
    text: "a😀",
    truncated: true,
    nextCursor: { cursor: { sequence: 2, codeUnitOffset: 3 } },
  });
  const second = readAutomationOutput(
    state.automation!,
    { source: "output", cursor: { sequence: 2, codeUnitOffset: 3 }, budget },
    frame,
  );
  expect(second).toMatchObject({ text: "b\n", truncated: true });
  expect(() =>
    readAutomationOutput(
      state.automation!,
      { source: "output", cursor: { sequence: 2, codeUnitOffset: 2 }, budget },
      frame,
    ),
  ).toThrow("stale_request");
  expect(() =>
    readAutomationOutput(
      state.automation!,
      {
        source: "output",
        cursor: { sequence: 2, codeUnitOffset: 1 },
        budget: { maxCodeUnits: 1, maxLines: 1 },
      },
      frame,
    ),
  ).toThrow("budget_exceeded");
  state = applyTerminalAttachStreamEvent(
    state,
    { type: "output", threadId: "thread", terminalId: "term", sequence: 5, data: "after-gap" },
    9,
  );
  expect(
    readAutomationOutput(
      state.automation!,
      { source: "output", cursor: { sequence: 2, codeUnitOffset: 3 }, budget },
      frame,
    ),
  ).toMatchObject({ continuity: "gap", text: "aft" });
  state = applyTerminalAttachStreamEvent(state, {
    type: "error",
    threadId: "thread",
    terminalId: "term",
    message: "UI-only error",
  });
  expect(state.automation!.chunks.map((chunk) => chunk.data).join("")).not.toContain("UI-only");
  state = applyTerminalAttachStreamEvent(state, {
    type: "restarted",
    threadId: "thread",
    terminalId: "term",
    snapshot: { ...snapshot, terminalInstanceId: "new-instance", sequence: 0, history: "new" },
  });
  expect(state.automation).toMatchObject({
    terminalInstanceId: "new-instance",
    sequence: 0,
    chunks: [{ sequence: 0, data: "new" }],
  });
  expect(() =>
    readAutomationOutput(
      state.automation!,
      { source: "output", cursor: { sequence: 5, codeUnitOffset: 0 }, budget },
      frame,
    ),
  ).toThrow("stale_request");
});

it("encodes through real Ghostty modes without writing or emitting human input", async () => {
  const onData = vi.fn();
  const core = await GhosttyTerminalCore.create(
    8,
    3,
    8,
    16,
    {
      foreground: { r: 255, g: 255, b: 255 },
      background: { r: 0, g: 0, b: 0 },
      cursor: { r: 255, g: 255, b: 255 },
    },
    onData,
  );
  try {
    let scrolls = 0;
    let now = 0;
    const output: TerminalAutomationOutput = {
      terminalInstanceId: "instance",
      sequence: 4,
      chunks: [],
      gap: false,
    };
    const bridge = createTerminalAutomationBridge({
      surface: {
        automationFrame: (sequence) => ghosttyAutomationFrame(core.automationMetadata(), sequence),
        readAutomation: (query, sequence) => readGhosttyAutomation(core, query, sequence),
        encodeAutomationInput: (action, revision) =>
          encodeGhosttyAutomation(core, action, revision, {
            cellWidth: 8,
            cellHeight: 16,
            screenWidth: 64,
            screenHeight: 48,
            paddingLeft: 0,
            paddingRight: 0,
            paddingTop: 0,
            paddingBottom: 0,
          }),
        applyAutomationLocalAction: () => {
          scrolls += 1;
          return { status: "local_applied" };
        },
      },
      output: () => output,
      target: () => target,
      ready: () => true,
      show: async () => {},
      now: () => now,
    });
    const signal = new AbortController().signal;
    const prepared = await bridge.perform(
      { ...fields, operation: "prepare_input", inputRequestId: "key" },
      () => {},
      signal,
    );
    if (prepared.operation !== "prepare_input" || !("frame" in prepared))
      throw new Error("expected frame");
    const revision = prepared.frame.frameRevision;
    core.write("log\r\n\x1b[?1h");
    expect(
      await bridge.perform(
        {
          ...fields,
          operation: "encode_input",
          inputRequestId: "key",
          frameRevision: revision,
          action: {
            type: "key",
            key: "ArrowUp",
            phase: "press",
            modifiers: { shift: false, alt: false, ctrl: false, meta: false },
          },
        },
        () => {},
        signal,
      ),
    ).toMatchObject({ encodedText: "\x1bOA", frameRevision: revision });
    expect(onData).not.toHaveBeenCalled();
    const prep = await bridge.perform(
      { ...fields, operation: "prepare_input", inputRequestId: "wheel" },
      () => {},
      signal,
    );
    if (prep.operation !== "prepare_input" || !("frame" in prep)) throw new Error("expected frame");
    const scrollRevision = prep.frame.frameRevision;
    const encoded = await bridge.perform(
      {
        ...fields,
        operation: "encode_input",
        inputRequestId: "wheel",
        frameRevision: scrollRevision,
        action: {
          type: "mouse",
          event: "wheel",
          position: { column: 0, row: 0 },
          deltaColumns: 0,
          deltaRows: -1,
          frameRevision: scrollRevision,
          modifiers: { shift: false, alt: false, ctrl: false, meta: false },
        },
      },
      () => {},
      signal,
    );
    expect(encoded).toMatchObject({ status: "local_action" });
    expect(scrolls).toBe(0);
    const apply = {
      ...fields,
      operation: "apply_local" as const,
      inputRequestId: "wheel",
      frameRevision: scrollRevision,
      localAction: { type: "scroll" as const, deltaRows: -1 },
    };
    await bridge.perform(apply, () => {}, signal);
    await bridge.perform(apply, () => {}, signal);
    expect(scrolls).toBe(1);
    for (let index = 0; index < 129; index += 1) {
      const inputRequestId = `completed-${index}`;
      await bridge.perform(
        { ...fields, operation: "prepare_input", inputRequestId },
        () => {},
        signal,
      );
      await bridge.perform(
        {
          ...fields,
          operation: "encode_input",
          inputRequestId,
          frameRevision: scrollRevision,
          action: {
            type: "mouse",
            event: "wheel",
            position: { column: 0, row: 0 },
            deltaRows: -1,
            deltaColumns: 0,
            frameRevision: scrollRevision,
            modifiers: { shift: false, alt: false, ctrl: false, meta: false },
          },
        },
        () => {},
        signal,
      );
      await bridge.perform({ ...apply, inputRequestId }, () => {}, signal);
    }
    expect(scrolls).toBe(130);
    for (let index = 0; index < 100; index += 1)
      await bridge.perform(
        { ...fields, operation: "prepare_input", inputRequestId: `expires-${index}` },
        () => {},
        signal,
      );
    now = 20_000;
    await bridge.perform(
      { ...fields, operation: "prepare_input", inputRequestId: "after-expiry" },
      () => {},
      signal,
    );
    await expect(bridge.perform(apply, () => {}, signal)).rejects.toMatchObject({
      code: "stale_request",
    });
    await expect(
      bridge.perform(
        { ...fields, operation: "prepare_input", inputRequestId: "wheel" },
        () => {},
        signal,
      ),
    ).rejects.toMatchObject({ code: "request_conflict" });
    bridge.retainBindings([]);
    const nextBinding = { ...binding, bindingId: "next-binding" };
    bridge.retainBindings([nextBinding]);
    await bridge.perform(
      { ...fields, binding: nextBinding, operation: "prepare_input", inputRequestId: "next" },
      () => {},
      signal,
    );
    await expect(bridge.perform(apply, () => {}, signal)).rejects.toMatchObject({
      code: "target_invalid",
    });
    expect(scrolls).toBe(130);
    bridge.invalidate();
    await expect(
      bridge.perform({ ...apply, binding: nextBinding, inputRequestId: "next" }, () => {}, signal),
    ).rejects.toMatchObject({
      code: "stale_request",
    });
  } finally {
    core.dispose();
  }
});
