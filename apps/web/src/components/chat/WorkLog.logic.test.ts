/** Verifies D1 summary counts from tool facts, independently of localized labels and rendering. */
import { describe, expect, it } from "vite-plus/test";
import type { WorkLogEntry } from "../../session-logic";
import { workLogSummaryCounts } from "./WorkLog.logic";
import { ThreadId, TurnItemId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

/** Build a settled tool; overrides supply only the facts relevant to each counting rule. */
function entry(id: string, overrides: Partial<WorkLogEntry> = {}): WorkLogEntry {
  return {
    id,
    createdAt: "2026-01-01T00:00:00Z",
    label: "Tool",
    tone: "tool",
    toolLifecycleStatus: "completed",
    ...overrides,
  };
}

describe("workLogSummaryCounts", () => {
  it("counts distinct read and changed paths, and counts repeated command executions separately", () => {
    const entries = [
      entry("read-a", { requestKind: "file-read", toolData: { input: { file_path: "src/a.ts" } } }),
      entry("read-a-again", { requestKind: "file-read", toolData: { filePath: "./src/a.ts" } }),
      entry("read-b", { requestKind: "file-read", changedFiles: ["src/b.ts"] }),
      entry("command-a", { itemType: "command_execution", command: "vp test run" }),
      entry("command-b", { itemType: "command_execution", command: "vp test run" }),
      entry("edit-a", { itemType: "file_change", changedFiles: ["src/a.ts", "src/b.ts"] }),
      entry("edit-b", { itemType: "file_change", changedFiles: ["src/a.ts"] }),
    ];
    expect(workLogSummaryCounts(entries)).toEqual({ readFiles: 2, commands: 2, changedFiles: 2 });
  });

  it("counts a command lifecycle once, using the latest update for its call ID", () => {
    expect(
      workLogSummaryCounts([
        entry("started", {
          toolCallId: "call-1",
          itemType: "command_execution",
          toolLifecycleStatus: "inProgress",
        }),
        entry("finished", {
          toolCallId: "call-1",
          itemType: "command_execution",
          toolLifecycleStatus: "failed",
        }),
      ]),
    ).toEqual({ readFiles: 0, commands: 1, changedFiles: 0 });
  });

  it("omits an incomplete file category without dropping known command and edit counts", () => {
    expect(
      workLogSummaryCounts([
        entry("known-read", { requestKind: "file-read", changedFiles: ["known.ts"] }),
        entry("unknown-read", { requestKind: "file-read", detail: "Read 99 files" }),
        entry("command", { itemType: "command_execution" }),
        entry("edit", { itemType: "file_change", changedFiles: ["saved.ts"] }),
      ]),
    ).toEqual({ readFiles: null, commands: 1, changedFiles: 1 });
  });

  it("does not report requested, failed, or running file work as completed files", () => {
    expect(
      workLogSummaryCounts([
        entry("approval", { itemType: "approval_request", changedFiles: ["requested.ts"] }),
        entry("failed", {
          requestKind: "file-read",
          changedFiles: ["failed.ts"],
          toolLifecycleStatus: "failed",
        }),
        entry("running", {
          itemType: "file_change",
          changedFiles: ["running.ts"],
          toolLifecycleStatus: "inProgress",
        }),
        entry("reasoning", { tone: "thinking", itemType: "reasoning", detail: "Read src/a.ts" }),
      ]),
    ).toEqual({ readFiles: 0, commands: 0, changedFiles: 0 });
  });

  it("keeps reads larger than the compact-label path limit exact and ignores file bodies", () => {
    expect(
      workLogSummaryCounts([
        entry("multi-read", {
          requestKind: "file-read",
          toolData: {
            input: {
              locations: [
                { path: "1.ts" },
                { path: "2.ts" },
                { path: "3.ts" },
                { path: "4.ts" },
                { path: "5.ts" },
                { path: "6.ts" },
                { path: "7.ts" },
                { path: "8.ts" },
                { path: "9.ts" },
              ],
              content: '{"path":"not-a-read.ts"}',
            },
            output: { path: "not-a-read-either.ts" },
          },
        }),
      ]),
    ).toEqual({ readFiles: 9, commands: 0, changedFiles: 0 });
  });

  it("returns zero for absent work and unknown for an edit without paths", () => {
    expect(workLogSummaryCounts([])).toEqual({ readFiles: 0, commands: 0, changedFiles: 0 });
    expect(workLogSummaryCounts([entry("edit", { itemType: "file_change" })])).toEqual({
      readFiles: 0,
      commands: 0,
      changedFiles: null,
    });
  });

  it("uses structured inputs and changed destinations instead of counting a rename twice", () => {
    const base = {
      id: TurnItemId.make("retained"),
      threadId: ThreadId.make("thread-1"),
      runId: null,
      nodeId: null,
      providerThreadId: null,
      providerTurnId: null,
      nativeItemRef: null,
      parentItemId: null,
      ordinal: 0,
      status: "completed" as const,
      title: null,
      startedAt: null,
      completedAt: null,
      updatedAt: DateTime.makeUnsafe("2026-01-01T00:00:00Z"),
    };
    expect(
      workLogSummaryCounts([
        entry("read", {
          requestKind: "file-read",
          structuredPayload: {
            ...base,
            type: "dynamic_tool",
            toolName: "Read",
            input: { file_path: "src/read.ts" },
          },
        }),
        entry("edit", {
          itemType: "file_change",
          changedFiles: ["aggregate label"],
          structuredPayload: {
            ...base,
            type: "file_change",
            fileName: "aggregate label",
            changes: [
              { path: "src/new.ts", oldPath: "src/old.ts", operation: "rename" },
              { path: "src/other.ts", operation: "update" },
            ],
          },
        }),
      ]),
    ).toEqual({ readFiles: 1, commands: 0, changedFiles: 2 });
  });
});
