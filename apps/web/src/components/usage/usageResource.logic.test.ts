/** Contract-based process attribution, CPU units, and two-minute ring boundaries. */
import { describe, expect, it } from "vite-plus/test";
import {
  emptyUsageCpuHistory,
  groupUsageResources,
  pushUsageCpuHistory,
  usageCpuFrames,
  wholeHostCpuPercent,
  type UsageResourceProcess,
  type UsageResourceGroup,
} from "./usageResource.logic";

/** Minimal telemetry fields; PID and parent are explicit when testing ancestry. */
function process(
  category: UsageResourceProcess["category"],
  command = "node worker",
  pid = 1,
  ppid = 0,
): UsageResourceProcess {
  return {
    identity: { pid, startTimeMs: 0 },
    ppid,
    category,
    command,
    cpuPercent: 12,
    residentBytes: 1024,
  };
}

const server: UsageResourceGroup = {
  key: "server",
  processCount: 1,
  cpuPercent: 20,
  residentBytes: 1024,
};

describe("usage resource groups", () => {
  it.each([
    ["server", "server"],
    ["server-child", "server"],
    ["electron-main", "electron"],
    ["electron-renderer", "electron"],
    ["electron-gpu", "electron"],
    ["electron-utility", "electron"],
    ["terminal-root", "terminal"],
    ["resource-monitor", "monitor"],
    ["unknown-t3", "otherT3"],
    ["provider-root", "otherAgents"],
  ] as const)("attributes %s to %s", (category, key) => {
    expect(groupUsageResources([process(category)])).toEqual([
      { key, processCount: 1, cpuPercent: 12, residentBytes: 1024 },
    ]);
  });

  it.each(["CoDeX", "CLAUDE", "OpenCode", "cursor"])("recognizes %s case-insensitively", (name) => {
    expect(groupUsageResources([process("provider-root", `node ${name} --run`)])[0]?.key).toBe(
      name.toLowerCase(),
    );
  });

  it("includes native server-child agents and inherited descendants, summing CPU and RSS exactly once", () => {
    expect(
      groupUsageResources([
        { ...process("server-child", "worker", 3, 2), cpuPercent: 5, residentBytes: 2048 },
        process("server-child", "codex app-server", 2, 1),
        process("server", "t3", 1),
      ]),
    ).toEqual([
      { key: "server", processCount: 1, cpuPercent: 12, residentBytes: 1024 },
      { key: "codex", processCount: 2, cpuPercent: 17, residentBytes: 3072 },
    ]);
  });

  it("retains unmatched provider descendants as other agents without substring matches", () => {
    expect(
      groupUsageResources([
        process("provider-root", "mycodexwrapper", 1),
        process("server-child", "worker", 2, 1),
      ]),
    ).toEqual([{ key: "otherAgents", processCount: 2, cpuPercent: 24, residentBytes: 2048 }]);
  });

  it("omits empty groups", () => expect(groupUsageResources([])).toEqual([]));

  it("converts core-relative CPU into whole-host percent and keeps missing capacity unknown", () => {
    expect(wholeHostCpuPercent(220, 8)).toBe(27.5);
    expect(wholeHostCpuPercent(220, 0)).toBeNull();
  });
});

describe("usage CPU history", () => {
  it("keeps the exact two-minute boundary and discards older samples", () => {
    let history = pushUsageCpuHistory(emptyUsageCpuHistory(), [server], 1000);
    history = pushUsageCpuHistory(history, [server], 121000);
    expect(usageCpuFrames(history).map((frame) => frame.at)).toEqual([1000, 121000]);
    history = pushUsageCpuHistory(history, [server], 121001);
    expect(usageCpuFrames(history).map((frame) => frame.at)).toEqual([121000, 121001]);
  });

  it("does not replace or append duplicate and out-of-order timestamps", () => {
    const history = pushUsageCpuHistory(emptyUsageCpuHistory(), [server], 1000);
    const duplicate = pushUsageCpuHistory(history, [{ ...server, cpuPercent: 99 }], 1000);
    const stale = pushUsageCpuHistory(duplicate, [], 999);
    expect(usageCpuFrames(stale).map((frame) => [frame.at, frame.groups.get("server")])).toEqual([
      [1000, 20],
    ]);
  });

  it("records an absent group as a gap and preserves its later return", () => {
    let history = pushUsageCpuHistory(emptyUsageCpuHistory(), [server], 1000);
    history = pushUsageCpuHistory(history, [], 3000);
    history = pushUsageCpuHistory(history, [{ ...server, cpuPercent: 35 }], 5000);
    expect(usageCpuFrames(history).map((frame) => frame.groups.get("server") ?? null)).toEqual([
      20,
      null,
      35,
    ]);
  });

  it("grows and wraps without losing live samples or mutating earlier snapshots", () => {
    const initial = pushUsageCpuHistory(emptyUsageCpuHistory(), [server], 0);
    let history = initial;
    for (let index = 1; index <= 200; index++)
      history = pushUsageCpuHistory(history, [server], index * 1000);
    const frames = usageCpuFrames(history);
    expect(frames).toHaveLength(121);
    expect(frames[0]?.at).toBe(80000);
    expect(frames.at(-1)?.at).toBe(200000);
    expect(usageCpuFrames(initial).map((frame) => frame.at)).toEqual([0]);
  });
});
