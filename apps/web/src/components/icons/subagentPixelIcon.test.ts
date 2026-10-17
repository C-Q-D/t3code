/** Protects provider choice, cycle boundaries, and stable child identity across view updates. */
import { describe, expect, it } from "vite-plus/test";
import { getSubagentPixelIconName } from "./subagentPixelIcon";

const siblings = ["a", "b", "c", "d"].map((id) => ({
  id,
  runId: "run-1",
  parentNodeId: "parent-1",
}));

describe("subagent pixel characters", () => {
  it.each([
    ["claudeAgent", "a", "claude-sub1"],
    ["claudeAgent", "b", "claude-sub2"],
    ["claudeAgent", "c", "claude-sub3"],
    ["claudeAgent", "d", "claude-sub1"],
    ["codex", "a", "codex-sub1"],
    ["codex", "c", "codex-sub3"],
    ["codex", "d", "codex-sub1"],
  ])("uses %s's stable child %s as %s", (driver, id, expected) => {
    expect(getSubagentPixelIconName(driver, id, siblings)).toBe(expected);
  });

  it("falls back when either provider or stable position is unavailable", () => {
    expect(getSubagentPixelIconName(undefined, "a", siblings)).toBe("subagent");
    expect(getSubagentPixelIconName("cursor", "a", siblings)).toBe("subagent");
    expect(getSubagentPixelIconName("codex", "missing", siblings)).toBe("subagent");
    expect(getSubagentPixelIconName("codex", undefined, siblings)).toBe("subagent");
    expect(getSubagentPixelIconName("codex", "a")).toBe("subagent");
    expect(getSubagentPixelIconName("codex", "a", [])).toBe("subagent");
    expect(getSubagentPixelIconName("codex", "a", [{ id: "a" }])).toBe("subagent");
    expect(
      getSubagentPixelIconName("codex", "a", [{ id: "a", runId: null, parentNodeId: null }]),
    ).toBe("subagent");
  });

  it("keeps a child's variant when its status and start time change", () => {
    const updated = [
      { ...siblings[2]!, status: "waiting", startedAt: null },
      { ...siblings[1]!, status: "running", startedAt: "2026-10-17T10:00:00Z" },
      { ...siblings[0]!, status: "completed", startedAt: "2026-10-17T09:00:00Z" },
      { ...siblings[3]!, status: "running", startedAt: "2026-10-17T11:00:00Z" },
    ];
    expect(getSubagentPixelIconName("codex", "b", updated)).toBe("codex-sub2");
    expect(getSubagentPixelIconName("codex", "a", updated)).toBe("codex-sub1");
    expect(getSubagentPixelIconName("codex", "c", updated)).toBe("codex-sub3");
  });

  it("sorts one group's IDs consistently when projection order changes", () => {
    const shuffled = [siblings[2]!, siblings[0]!, siblings[3]!, siblings[1]!];
    expect(getSubagentPixelIconName("claudeAgent", "a", shuffled)).toBe("claude-sub1");
    expect(getSubagentPixelIconName("claudeAgent", "b", shuffled)).toBe("claude-sub2");
    expect(getSubagentPixelIconName("claudeAgent", "c", shuffled)).toBe("claude-sub3");
    expect(getSubagentPixelIconName("claudeAgent", "d", shuffled)).toBe("claude-sub1");
    expect(shuffled.map(({ id }) => id)).toEqual(["c", "a", "d", "b"]);
  });

  it("starts each run at sub1 regardless of other runs in the loaded window", () => {
    const runs = [
      { id: "b", runId: "run-1", parentNodeId: "parent-shared" },
      { id: "a", runId: "run-2", parentNodeId: "parent-shared" },
      { id: "z", runId: "run-1", parentNodeId: "parent-other" },
      { id: "y", runId: "run-2", parentNodeId: "parent-shared" },
    ];
    expect(getSubagentPixelIconName("codex", "b", runs)).toBe("codex-sub1");
    expect(getSubagentPixelIconName("codex", "a", runs)).toBe("codex-sub1");
    expect(getSubagentPixelIconName("codex", "z", runs)).toBe("codex-sub2");
    expect(getSubagentPixelIconName("codex", "y", runs)).toBe("codex-sub2");
    expect(getSubagentPixelIconName("codex", "y", [runs[3]!, runs[1]!])).toBe("codex-sub2");
  });

  it("groups runless members by parent node without including run-owned members", () => {
    const runless = [
      { id: "c", runId: null, parentNodeId: "parent-1" },
      { id: "b", runId: null, parentNodeId: "parent-2" },
      { id: "a", runId: null, parentNodeId: "parent-1" },
      { id: "aa", runId: "parent-1", parentNodeId: "parent-1" },
    ];
    expect(getSubagentPixelIconName("claudeAgent", "a", runless)).toBe("claude-sub1");
    expect(getSubagentPixelIconName("claudeAgent", "c", runless)).toBe("claude-sub2");
    expect(getSubagentPixelIconName("claudeAgent", "b", runless)).toBe("claude-sub1");
    expect(getSubagentPixelIconName("claudeAgent", "aa", runless)).toBe("claude-sub1");
  });
});
