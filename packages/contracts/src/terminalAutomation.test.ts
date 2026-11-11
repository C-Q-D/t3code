import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";
import {
  TerminalAutomationAction,
  TerminalAutomationBindInput,
  TerminalAutomationClientReply,
  TerminalAutomationFrame,
  TerminalAutomationInputResult,
  TerminalAutomationReadQuery,
  TerminalAutomationReadResult,
  TerminalAutomationRegistration,
} from "./terminalAutomation.ts";

const decodeAction = Schema.decodeSync(TerminalAutomationAction);
const decodeReadQuery = Schema.decodeSync(TerminalAutomationReadQuery);

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

describe("terminal automation wire boundaries", () => {
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
