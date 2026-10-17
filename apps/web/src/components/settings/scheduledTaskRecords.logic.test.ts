/** Verify the latest-run projection against the ST8 record contract, independent of delivery responses and UI classes. */
import {
  ProjectId,
  ProviderInstanceId,
  ScheduledTaskId,
  type ScheduledTask,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import { scheduledTaskRunRecords } from "./scheduledTasksSettings.logic";

/** Create a complete task with explicit test overrides; timestamps are fixed and no service is invoked. */
function task(id: string, overrides: Partial<ScheduledTask> = {}): ScheduledTask {
  return {
    id: ScheduledTaskId.make(id),
    title: id,
    prompt: "Review issues",
    enabled: true,
    schedule: { type: "interval", everyMs: 60_000 },
    projectId: ProjectId.make("project"),
    threadId: null,
    workspaceStrategy: { type: "root" },
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
    runtimeMode: "full-access",
    interactionMode: "default",
    createdBy: "user",
    creationSource: "web",
    createdAt: "2026-10-18T00:00:00Z",
    updatedAt: "2026-10-18T00:00:00Z",
    nextRunAt: null,
    lastRunAt: null,
    lastRunStatus: "never",
    lastRunError: null,
    runCount: 0,
    ...overrides,
  };
}

describe("latest scheduled-task run records", () => {
  it("includes a failed webhook run and its concrete error without delivery data", () => {
    const webhook = task("hook", {
      schedule: { type: "webhook", signature: null },
      lastRunStatus: "failed",
      lastRunAt: "2026-10-18T01:00:00Z",
      lastRunError: "Provider process exited with code 17",
    });
    expect(scheduledTaskRunRecords([webhook])).toEqual([
      {
        task: webhook,
        status: "failed",
        runAt: "2026-10-18T01:00:00Z",
        error: "Provider process exited with code 17",
        variant: "danger",
      },
    ]);
  });

  it("keeps running tasks visible before completion and suppresses stale failure text", () => {
    const running = task("running", { lastRunStatus: "running", lastRunError: "Previous failure" });
    expect(scheduledTaskRunRecords([running])).toEqual([
      {
        task: running,
        status: "running",
        runAt: null,
        error: null,
        variant: "info",
      },
    ]);
  });

  it("omits never-run ordinary and webhook tasks", () => {
    expect(
      scheduledTaskRunRecords([
        task("ordinary"),
        task("hook", { schedule: { type: "webhook", signature: null } }),
      ]),
    ).toEqual([]);
  });

  it("sorts by actual time descending, keeps ties stable and does not reorder the subscription", () => {
    const input = Object.freeze([
      task("older", { lastRunStatus: "succeeded", lastRunAt: "2026-10-18T09:00:00+08:00" }),
      task("pending-time", { lastRunStatus: "running" }),
      task("newest", { lastRunStatus: "succeeded", lastRunAt: "2026-10-18T02:00:00Z" }),
      task("tie", { lastRunStatus: "failed", lastRunAt: "2026-10-18T10:00:00+08:00" }),
    ]);
    expect(scheduledTaskRunRecords(input).map((row) => row.task.id)).toEqual([
      "newest",
      "tie",
      "older",
      "pending-time",
    ]);
    expect(input.map((entry) => entry.id)).toEqual(["older", "pending-time", "newest", "tie"]);
  });

  it("reflects the next subscribed task snapshot without preserving an earlier failure", () => {
    const failed = task("hook", {
      schedule: { type: "webhook", signature: null },
      lastRunStatus: "failed",
      lastRunAt: "2026-10-18T01:00:00Z",
      lastRunError: "Old failure",
    });
    expect(scheduledTaskRunRecords([failed])[0]?.status).toBe("failed");
    const succeeded = {
      ...failed,
      lastRunStatus: "succeeded" as const,
      lastRunAt: "2026-10-18T02:00:00Z",
    };
    expect(scheduledTaskRunRecords([succeeded])).toEqual([
      {
        task: succeeded,
        status: "succeeded",
        runAt: "2026-10-18T02:00:00Z",
        error: null,
        variant: "success",
      },
    ]);
  });
});
