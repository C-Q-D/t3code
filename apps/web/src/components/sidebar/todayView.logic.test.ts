/** Today membership and ordering contracts use fixed local dates, not the wall clock. */
import { describe, expect, it } from "vite-plus/test";
import { ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import type {
  EnvironmentThreadShell,
  ThreadRuntimeSummary,
} from "@t3tools/client-runtime/state/models";
import { makeThreadFixture } from "../../test-fixtures";
import { buildTodayView, startOfLocalDay, readTodayTab } from "./todayView.logic";

const now = new Date(2026, 9, 19, 12).getTime();
const yesterday = new Date(2026, 9, 18, 23, 59).toISOString();
const today = new Date(2026, 9, 19, 0, 1).toISOString();

it("keeps Today selections separate from project tabs and defaults to waiting", () => {
  expect(readTodayTab("working")).toBe("working");
  expect(readTodayTab("waiting")).toBe("waiting");
  expect(readTodayTab(null)).toBe("waiting");
  expect(readTodayTab("settled")).toBe("waiting");
  expect(readTodayTab("later")).toBe("waiting");
});

/** Build a shell with explicit membership inputs and otherwise ordinary thread defaults. */
function thread(id: string, overrides: Partial<EnvironmentThreadShell> = {}) {
  return {
    ...makeThreadFixture(),
    id: ThreadId.make(id),
    latestUserAuthoredMessageAt: today,
    latestUserMessageAt: today,
    runtime: null,
    ...overrides,
  };
}

/** Supply the runtime status under test without provider activity or external effects. */
function runtime(status: ThreadRuntimeSummary["status"]): ThreadRuntimeSummary {
  return {
    status,
    activeRunId: null,
    providerInstanceId: ProviderInstanceId.make("codex"),
    providerName: "codex",
    lastError: null,
    updatedAt: yesterday,
  };
}

describe("Today membership", () => {
  it("uses local midnight and drops yesterday's inactive conversation", () => {
    expect(startOfLocalDay(now)).toBe(new Date(2026, 9, 19, 0, 0).getTime());
    const rows = buildTodayView(
      [thread("before", { latestUserAuthoredMessageAt: yesterday }), thread("after")],
      now,
    );
    expect(rows.waiting.map((row) => row.id)).toEqual(["after"]);
    expect(rows.working).toEqual([]);
  });

  it.each([
    { name: "running", overrides: { runtime: runtime("running") }, working: ["old"], waiting: [] },
    {
      name: "approval",
      overrides: { runtime: runtime("running"), hasPendingApprovals: true },
      working: [],
      waiting: ["old"],
    },
    { name: "question", overrides: { hasPendingUserInput: true }, working: [], waiting: ["old"] },
    {
      name: "idle background work",
      overrides: { runtime: runtime("idle") },
      working: [],
      waiting: [],
    },
  ])("handles yesterday's $name", ({ overrides, working, waiting }) => {
    const rows = buildTodayView(
      [thread("old", { latestUserAuthoredMessageAt: yesterday, ...overrides })],
      now,
    );
    expect(rows.working.map((row) => row.id)).toEqual(working);
    expect(rows.waiting.map((row) => row.id)).toEqual(waiting);
  });

  it("excludes explicitly settled conversations even with today's activity and pending work", () => {
    const rows = buildTodayView(
      [
        thread("settled", {
          settledOverride: "settled",
          runtime: runtime("running"),
          hasPendingApprovals: true,
        }),
      ],
      now,
    );
    expect(rows).toEqual({ working: [], waiting: [] });
  });

  it("falls back to the legacy message timestamp only when the authored field is absent", () => {
    const { latestUserAuthoredMessageAt: _authoredAt, ...legacy } = thread("legacy");
    const rows = buildTodayView(
      [
        legacy,
        thread("no-user-message", { latestUserAuthoredMessageAt: null }),
        thread("background-message", { latestUserAuthoredMessageAt: yesterday }),
      ],
      now,
    );
    expect(rows.waiting.map((row) => row.id)).toEqual(["legacy"]);
    expect(rows.working).toEqual([]);
  });
});

describe("Today shelves", () => {
  it("orders running and today's idle conversations by user send time", () => {
    const rows = buildTodayView(
      [
        thread("running", { runtime: runtime("running") }),
        thread("idle", {
          runtime: runtime("idle"),
          latestUserAuthoredMessageAt: new Date(2026, 9, 19, 9).toISOString(),
        }),
        thread("approval", { runtime: runtime("running"), hasPendingApprovals: true }),
      ],
      now,
    );
    expect(rows.working.map((row) => row.id)).toEqual(["idle", "running"]);
    expect(rows.waiting.map((row) => row.id)).toEqual(["approval"]);
  });

  it("orders waiting conversations by return time including client-observed returns", () => {
    const rows = buildTodayView(
      [
        thread("returned", { unsettledAt: new Date(2026, 9, 19, 8).toISOString() }),
        thread("observed"),
        thread("ordinary"),
      ],
      now,
      (row) => (row.id === "observed" ? new Date(2026, 9, 19, 10).getTime() : undefined),
    );
    expect(rows.waiting.map((row) => row.id)).toEqual(["observed", "returned", "ordinary"]);
    expect(rows.working).toEqual([]);
  });
});
