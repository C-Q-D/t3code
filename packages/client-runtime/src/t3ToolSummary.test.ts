/** Checks effect counting, failure semantics, and English summary compatibility. */
import { describe, expect, it } from "vite-plus/test";

import { summarizeT3ToolCalls, type T3ToolSummaryCall } from "./t3ToolSummary.ts";

function completed(input: unknown, output?: unknown): T3ToolSummaryCall {
  return { input, output, outcome: "completed" };
}

describe("summarizeT3ToolCalls", () => {
  it("reads provider result envelopes without treating JSON in the message as result data", () => {
    const result = { messageId: "message-1", threadId: "actual-thread" };
    const json = JSON.stringify(result);
    const outputs = [
      result,
      { structuredContent: result },
      [{ type: "text", text: json }],
      { content: [{ text: { text: json } }], isError: false },
      json,
    ];
    const calls = outputs.map((output) =>
      completed(
        {
          toolName: "t3_thread_send",
          args: { threadId: "input-thread", message: '{"threadId":"fake"}' },
        },
        output,
      ),
    );
    expect(summarizeT3ToolCalls("thread-send", calls).label).toBe("Sent 1 message to 1 thread");
    expect(
      summarizeT3ToolCalls("thread-send", [
        completed({ toolName: "t3_thread_send", args: { threadId: "input-thread" } }),
        completed({ threadId: "input-thread" }),
      ]).label,
    ).toBe("Sent 2 messages to 1 thread");
  });

  it("excludes failed and unfinished sends even if the provider reports completed", () => {
    const calls: T3ToolSummaryCall[] = [
      completed({ threadId: "success" }, { messageId: "ok", threadId: "success" }),
      completed(
        { threadId: "failed" },
        { isError: true, structuredContent: { threadId: "failed" } },
      ),
      completed({ threadId: "failed" }, [
        { type: "text", text: JSON.stringify({ _tag: "OrchestratorMcpFailure" }) },
      ]),
      { input: { threadId: "cancelled" }, output: undefined, outcome: "unfinished" },
    ];
    expect(summarizeT3ToolCalls("thread-send", calls)).toEqual({
      label: "Sent 1 message to 1 thread",
      failedCount: 2,
    });
    expect(summarizeT3ToolCalls("thread-send", [calls[1]!])).toEqual({
      label: "Tried to send 1 message to 1 thread",
      failedCount: 1,
    });
  });

  it("does not confuse a child's failure or wait timeout with failure of the orchestration call", () => {
    const failedChild = { taskId: "task-1", status: "failed", summary: "command not found" };
    expect(
      summarizeT3ToolCalls("delegate", [completed({}, failedChild), completed({}, failedChild)]),
    ).toEqual({
      label: "Delegated 1 task",
      failedCount: 0,
    });
    expect(
      summarizeT3ToolCalls(
        "task-status",
        Array.from({ length: 4 }, () => completed({ taskId: "task-1" }, failedChild)),
      ).label,
    ).toBe("Checked task status 4 times");
    expect(
      summarizeT3ToolCalls("thread-wait", [
        completed({ threadId: "thread-1" }, { threadId: "thread-1", timedOut: true }),
      ]),
    ).toEqual({
      label: "Waited on 1 thread",
      failedCount: 0,
    });
  });
});

it.each([
  ["thread-send", "Sent 1 message"],
  ["thread-create", "Requested thread creation 1 time"],
  ["delegate", "Delegated 1 task"],
  ["thread-read", "Read threads 1 time"],
  ["thread-wait", "Waited on threads 1 time"],
  ["thread-list", "Listed threads 1 time"],
  ["thread-interrupt", "Requested interrupts for 1 thread"],
  ["task-status", "Checked task status 1 time"],
  ["task-cancel", "Requested cancellation of 1 task"],
  ["schedule-create", "Scheduled 1 task"],
  ["schedule-list", "Listed scheduled tasks 1 time"],
  ["schedule-update", "Updated 1 scheduled task"],
  ["schedule-delete", "Requested deletion of 1 scheduled task"],
  ["schedule-run", "Requested 1 scheduled task run"],
  ["thread-configuration", "Checked thread configuration 1 time"],
  ["thread-configure", "Set thread model 1 time"],
  ["thread-fork", "Requested 1 thread fork"],
  ["thread-merge", "Requested 1 context merge"],
  ["thread-search", "Searched threads 1 time"],
  ["thread-transfers", "Checked thread transfers 1 time"],
  ["thread-organize", "Organized threads 1 time"],
  ["thread-update", "Updated 1 thread"],
  ["queue-list", "Listed queued messages 1 time"],
  ["queue-read", "Read 1 queued message"],
  ["queue-edit", "Edited 1 queued message"],
  ["queue-cancel", "Requested cancellation of 1 queued run"],
  ["queue-reorder", "Reordered 1 queued run"],
  ["queue-steer", "Requested steering with 1 queued message"],
  ["question-list", "Listed pending questions 1 time"],
  ["question-read", "Read 1 pending question request"],
  ["question-respond", "Answered 1 pending question request"],
  ["secret-request", "Asked for 1 secret"],
  ["worktree-handoff", "Handed off to 1 worktree"],
  ["worktree-list", "Listed workspace branches 1 time"],
  ["worktree-status", "Checked worktree status 1 time"],
  ["project-list", "Listed projects 1 time"],
  ["project-read", "Read 1 project"],
  ["project-create", "Registered 1 project"],
  ["project-update", "Updated 1 project"],
  ["project-delete", "Deleted 1 project"],
  ["project-clone", "Cloned 1 repository"],
  ["environment-read", "Checked environment preferences 1 time"],
  ["environment-update", "Updated environment preferences 1 time"],
  ["attachment-prepare", "Prepared 1 attachment upload"],
  ["attachment-discard", "Discarded 1 pending attachment"],
  ["attachment-send", "Sent attachments 1 time"],
  ["link-pr", "Linked 1 pull request"],
  ["unlink-pr", "Unlinked 1 pull request"],
  ["watch-pr", "Watching 1 pull request"],
  ["unwatch-pr", "Stopped watching 1 pull request"],
  ["list-prs", "Checked linked pull requests"],
  ["browser", "Used browser 1 time"],
  ["device", "Used device controls 1 time"],
  ["html-preview", "Previewed 1 HTML page"],
  ["html-render", "Rendered 1 HTML page"],
  ["capabilities", "Checked orchestration capabilities 1 time"],
] as const)("preserves English summary for %s", (action, expected) => {
  expect(summarizeT3ToolCalls(action, [completed({})])).toEqual({
    label: expected,
    failedCount: 0,
  });
});
