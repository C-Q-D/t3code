import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";
import {
  TerminalAutomationAction,
  TerminalAutomationBindInput,
  TerminalAutomationClientReply,
  TerminalAutomationClientRequest,
  TerminalAutomationFrame,
  TerminalAutomationInputResult,
  TerminalAutomationReadQuery,
  TerminalAutomationReadResult,
  TerminalAutomationRegistration,
} from "./terminalAutomation.ts";

const decodeAction = Schema.decodeSync(TerminalAutomationAction);
const decodeReadQuery = Schema.decodeSync(TerminalAutomationReadQuery);
const decodeReadResult = Schema.decodeSync(TerminalAutomationReadResult);
const decodeClientRequest = Schema.decodeSync(TerminalAutomationClientRequest);
const decodeClientReply = Schema.decodeSync(TerminalAutomationClientReply);
const decodeInputResult = Schema.decodeSync(TerminalAutomationInputResult);

const frame = {
  activeScreen: "alternate",
  cols: 80,
  rows: 24,
  viewportStartLine: 0,
  retainedRange: { startLine: 0, endLineExclusive: 24 },
  sequence: 3,
  frameRevision: 7,
  cursor: { status: "outside_viewport" },
  pendingWrap: null,
};
const read = {
  source: "output",
  frame,
  text: "",
  returnedRange: null,
  nextCursor: null,
  continuity: "unknown",
  truncated: false,
  change: "no_change",
  softWrapAfterLines: [],
  process: { status: "unknown" },
};
const bridge = {
  version: 1,
  bridgeRequestId: "bridge",
  binding: {
    bindingId: "b",
    alias: "terminal",
    inputEpoch: 1,
    target: { terminalId: "t", terminalInstanceId: "i", viewId: "v" },
  },
};
const historyQuery = {
  source: "history",
  activeScreen: "alternate",
  range: { startLine: 10, endLineExclusive: 12 },
  frameRevision: 7,
  budget: { maxCodeUnits: 2, maxLines: 1 },
};
const partialHistory = {
  ...read,
  source: "history",
  text: "A",
  change: "data",
  truncated: true,
  returnedRange: { startLine: 10, endLineExclusive: 11 },
  nextCursor: {
    source: "history",
    activeScreen: "alternate",
    nextLine: 10,
    codeUnitOffset: 1,
    frameRevision: 7,
  },
};
const localEncoding = {
  operation: "encode_input",
  inputRequestId: "r",
  frameRevision: 7,
  status: "local_action",
  localAction: { type: "scroll", deltaRows: -3 },
};
const applyLocal = {
  ...bridge,
  operation: "apply_local",
  inputRequestId: "r",
  frameRevision: 7,
  localAction: { type: "scroll", deltaRows: -3 },
};

describe("terminal automation wire boundaries", () => {
  it("preserves an intra-line history cursor at a complete codepoint boundary", () => {
    const decode = Schema.decodeSync(TerminalAutomationReadResult);
    expect(decodeReadQuery(historyQuery)).toEqual(historyQuery);
    expect(decode(partialHistory).nextCursor).toEqual(partialHistory.nextCursor);
    expect(decodeReadQuery({ ...historyQuery, codeUnitOffset: 1 })).toMatchObject({
      codeUnitOffset: 1,
    });
    expect(decodeReadQuery({ ...historyQuery, codeUnitOffset: 0 })).toMatchObject({
      codeUnitOffset: 0,
    });
    expect(
      decodeReadQuery({ ...historyQuery, codeUnitOffset: Number.MAX_SAFE_INTEGER }),
    ).toMatchObject({ codeUnitOffset: Number.MAX_SAFE_INTEGER });
    expect(
      decode({
        ...partialHistory,
        text: "😀",
        nextCursor: { ...partialHistory.nextCursor, codeUnitOffset: 3 },
      }).text,
    ).toBe("😀");
  });

  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects unsafe history offset %s in queries and cursors",
    (codeUnitOffset) => {
      expect(() => decodeReadQuery({ ...historyQuery, codeUnitOffset })).toThrow();
      expect(() =>
        decodeReadResult({
          ...partialHistory,
          nextCursor: { ...partialHistory.nextCursor, codeUnitOffset },
        }),
      ).toThrow();
    },
  );

  it("rejects legacy ambiguous history cursors and incomplete-line wrap metadata", () => {
    const decode = Schema.decodeSync(TerminalAutomationReadResult);
    const { codeUnitOffset: _offset, ...legacyCursor } = partialHistory.nextCursor;
    expect(() => decode({ ...partialHistory, nextCursor: legacyCursor })).toThrow();
    expect(() => decode({ ...partialHistory, softWrapAfterLines: [10] })).toThrow();
    expect(() =>
      decode({
        ...partialHistory,
        nextCursor: { ...partialHistory.nextCursor, activeScreen: "primary" },
      }),
    ).toThrow();
    expect(() =>
      decode({ ...partialHistory, nextCursor: { ...partialHistory.nextCursor, frameRevision: 8 } }),
    ).toThrow();
    expect(
      decode({
        ...partialHistory,
        softWrapAfterLines: [10],
        nextCursor: { ...partialHistory.nextCursor, nextLine: 11, codeUnitOffset: 0 },
      }).softWrapAfterLines,
    ).toEqual([10]);
  });

  it("describes local scrolling before a separate correlated application and receipt", () => {
    const decodeReply = Schema.decodeSync(TerminalAutomationClientReply);
    expect(decodeReply({ ...bridge, result: localEncoding }).result).toEqual(localEncoding);
    expect(
      decodeReply({
        ...bridge,
        result: {
          operation: "encode_input",
          inputRequestId: "r",
          frameRevision: 7,
          encodedText: "\u001b[A",
        },
      }).result,
    ).toMatchObject({ encodedText: "\u001b[A" });
    expect(decodeClientRequest(applyLocal)).toEqual(applyLocal);
    for (const phase of ["press", "move", "release"] as const) {
      const localAction = { type: "selection", phase, position: { column: 999, row: 499 } };
      expect(decodeClientRequest({ ...applyLocal, localAction })).toMatchObject({ localAction });
      expect(
        decodeReply({ ...bridge, result: { ...localEncoding, localAction } }).result,
      ).toMatchObject({ localAction });
      expect(() =>
        decodeClientRequest({ ...applyLocal, localAction: { ...localAction, deltaRows: 1 } }),
      ).toThrow();
    }
    expect(
      decodeClientRequest({ ...applyLocal, localAction: { type: "scroll", deltaRows: 100 } }),
    ).toMatchObject({ localAction: { type: "scroll", deltaRows: 100 } });
    expect(
      decodeClientRequest({ ...applyLocal, localAction: { type: "scroll", deltaRows: -100 } }),
    ).toMatchObject({ localAction: { type: "scroll", deltaRows: -100 } });
    expect(
      decodeReply({
        ...bridge,
        result: { operation: "apply_local", status: "local_applied", inputRequestId: "r" },
      }).result,
    ).toEqual({ operation: "apply_local", status: "local_applied", inputRequestId: "r" });
    expect(
      decodeReply({
        ...bridge,
        result: { operation: "apply_local", inputRequestId: "r", error: { code: "stale_request" } },
      }).result,
    ).toMatchObject({ error: { code: "stale_request" } });
    expect(decodeInputResult({ status: "local_applied", requestId: "r" })).toEqual({
      status: "local_applied",
      requestId: "r",
    });
  });

  it("rejects mixed encoded and local intent and premature application receipts", () => {
    const decode = Schema.decodeSync(TerminalAutomationClientReply);
    expect(() => decode({ ...bridge, result: { ...localEncoding, encodedText: "x" } })).toThrow();
    expect(() =>
      decodeClientRequest({ ...applyLocal, localAction: { type: "execute", command: "ls" } }),
    ).toThrow();
    expect(() =>
      decode({ ...bridge, result: { ...localEncoding, status: "local_applied" } }),
    ).toThrow();
    expect(() =>
      decodeInputResult({
        status: "local_applied",
        requestId: "r",
        writtenBytes: 1,
      }),
    ).toThrow();
  });

  it.each([0, -101, 101, 0.5])("rejects local scroll deltaRows %s", (deltaRows) => {
    expect(() =>
      decodeClientRequest({
        ...applyLocal,
        localAction: { type: "scroll", deltaRows },
      }),
    ).toThrow();
  });

  it("requires application request identity, epoch, frame and correlated reply identity", () => {
    const decode = Schema.decodeSync(TerminalAutomationClientRequest);
    const { inputRequestId: _id, ...noId } = applyLocal;
    const { frameRevision: _revision, ...noRevision } = applyLocal;
    const { inputEpoch: _epoch, ...noEpoch } = bridge.binding;
    expect(() => decode(noId)).toThrow();
    expect(() => decode(noRevision)).toThrow();
    expect(() => decode({ ...applyLocal, binding: noEpoch })).toThrow();
    expect(() =>
      decodeClientReply({
        ...bridge,
        result: { operation: "apply_local", status: "local_applied" },
      }),
    ).toThrow();
    expect(() =>
      decodeClientReply({
        ...bridge,
        result: { operation: "apply_local", error: { code: "stale_request" } },
      }),
    ).toThrow();
  });

  it("accepts a full text budget but rejects one extra UTF-16 code unit", () => {
    const decode = Schema.decodeSync(TerminalAutomationAction);
    expect(decode({ type: "paste", text: "😀".repeat(32_768) }).type).toBe("paste");
    expect(() => decode({ type: "paste", text: "😀".repeat(32_768) + "x" })).toThrow(/65536/);
  });

  it("rejects mixed action fields instead of silently stripping executable intent", () => {
    expect(() => decodeAction({ type: "text", text: "ls", key: "Enter" })).toThrow(/key/);
  });

  it("keeps scope and multi-candidate approval out of model bind arguments", () => {
    const decode = Schema.decodeSync(TerminalAutomationBindInput);
    expect(decode({ mode: "auto" })).toEqual({ mode: "auto" });
    expect(() => decode({ mode: "auto", candidateId: "other" })).toThrow(/candidateId/);
    expect(() => decode({ mode: "auto", threadId: "other" })).toThrow(/threadId/);
  });

  it.each([-1, 0.5, 1000])("rejects mouse column %s before grid conversion", (column) => {
    expect(() =>
      decodeAction({
        type: "mouse",
        event: "move",
        position: { column, row: 0 },
        button: "none",
        modifiers: { shift: false, alt: false, ctrl: false, meta: false },
        frameRevision: 7,
      }),
    ).toThrow();
  });

  it("checks visible cursor against actual dimensions and preserves offscreen state", () => {
    const decode = Schema.decodeSync(TerminalAutomationFrame);
    expect(decode(frame).cursor).toEqual({ status: "outside_viewport" });
    expect(() =>
      decode({ ...frame, cursor: { status: "visible", position: { column: 80, row: 0 } } }),
    ).toThrow();
  });

  it.each([
    { startLine: 5, endLineExclusive: 4 },
    { startLine: -1, endLineExclusive: 4 },
    { startLine: 0, endLineExclusive: 10_001 },
  ])("rejects unsafe history range %j", (range) => {
    expect(() =>
      decodeReadQuery({
        source: "history",
        activeScreen: "alternate",
        range,
        budget: { maxCodeUnits: 100, maxLines: 10 },
      }),
    ).toThrow();
  });

  it("rejects an excessive read budget without disallowing an empty output interval", () => {
    const decode = Schema.decodeSync(TerminalAutomationReadQuery);
    expect(
      decode({
        source: "output",
        cursor: { sequence: 0, codeUnitOffset: 0 },
        budget: { maxCodeUnits: 100, maxLines: 10 },
      }).source,
    ).toBe("output");
    expect(() =>
      decode({
        source: "output",
        cursor: { sequence: 0, codeUnitOffset: 0 },
        budget: { maxCodeUnits: 65_537, maxLines: 10 },
      }),
    ).toThrow();
  });

  it("preserves gaps, truncation and unknown process status without inventing completion", () => {
    const decode = Schema.decodeSync(TerminalAutomationReadResult);
    expect(decode(read)).toEqual(read);
    expect(decode({ ...read, continuity: "gap", truncated: true })).toMatchObject({
      continuity: "gap",
      truncated: true,
      process: { status: "unknown" },
    });
    expect(() => decode({ ...read, text: "new output" })).toThrow();
  });

  it("can continue within a truncated output chunk without skipping its remainder", () => {
    const decode = Schema.decodeSync(TerminalAutomationReadResult);
    const result = decode({
      ...read,
      text: "part",
      change: "data",
      truncated: true,
      nextCursor: { source: "output", cursor: { sequence: 3, codeUnitOffset: 4 } },
    });
    expect(result.nextCursor).toEqual({
      source: "output",
      cursor: { sequence: 3, codeUnitOffset: 4 },
    });
    expect(
      decodeReadQuery({
        source: "output",
        cursor: { sequence: 3, codeUnitOffset: 4 },
        budget: { maxCodeUnits: 100, maxLines: 10 },
      }),
    ).toMatchObject({ cursor: { sequence: 3, codeUnitOffset: 4 } });
  });

  it("rejects wrap metadata outside the returned active-screen range", () => {
    const decode = Schema.decodeSync(TerminalAutomationReadResult);
    const history = {
      ...read,
      source: "history",
      returnedRange: { startLine: 10, endLineExclusive: 12 },
      softWrapAfterLines: [10],
    };
    expect(decode(history).softWrapAfterLines).toEqual([10]);
    expect(() => decode({ ...history, softWrapAfterLines: [12] })).toThrow();
  });

  it("separates unknown delivery from writes and refuses command exit codes on receipts", () => {
    const decode = Schema.decodeSync(TerminalAutomationInputResult);
    expect(decode({ status: "unknown", requestId: "r" })).toEqual({
      status: "unknown",
      requestId: "r",
    });
    expect(() =>
      decode({ status: "written", requestId: "r", writtenBytes: 3, commandExitCode: 0 }),
    ).toThrow(/commandExitCode/);
  });

  it("rejects stale protocol versions and client identity claims", () => {
    const decode = Schema.decodeSync(TerminalAutomationRegistration);
    expect(decode({ version: 1, views: [] })).toEqual({ version: 1, views: [] });
    expect(() => decode({ version: 2, views: [] })).toThrow();
    expect(() => decode({ version: 1, views: [], clientId: "trusted" })).toThrow(/clientId/);
  });

  it("rejects an empty encoder result before it can be reported as a PTY write", () => {
    const decode = Schema.decodeSync(TerminalAutomationClientReply);
    expect(() =>
      decode({
        version: 1,
        bridgeRequestId: "bridge",
        binding: {
          bindingId: "b",
          alias: "terminal",
          inputEpoch: 1,
          target: { terminalId: "t", terminalInstanceId: "i", viewId: "v" },
        },
        result: {
          operation: "encode_input",
          inputRequestId: "r",
          frameRevision: 7,
          encodedText: "",
        },
      }),
    ).toThrow(/encodedText/);
  });
});
