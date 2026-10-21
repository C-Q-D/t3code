/** Process grouping and a timestamped two-minute CPU ring; no UI, timers, or RPC ownership. */
import type { ResourceTelemetryProcess } from "@t3tools/contracts";

/** Only fields used for attribution; accepts the complete telemetry process records unchanged. */
export type UsageResourceProcess = Pick<
  ResourceTelemetryProcess,
  "identity" | "ppid" | "category" | "command" | "cpuPercent" | "residentBytes"
>;

/** Stable translation/color keys, independent of process IDs and localized labels. */
export type UsageResourceGroupKey =
  | "server"
  | "electron"
  | "codex"
  | "claude"
  | "opencode"
  | "cursor"
  | "otherAgents"
  | "terminal"
  | "monitor"
  | "otherT3";

/** CPU is the raw telemetry sum (100% means one core); memory is resident bytes. */
export interface UsageResourceGroup {
  readonly key: UsageResourceGroupKey;
  readonly processCount: number;
  readonly cpuPercent: number;
  readonly residentBytes: number;
}

const GROUP_ORDER: readonly UsageResourceGroupKey[] = [
  "server",
  "electron",
  "codex",
  "claude",
  "opencode",
  "cursor",
  "otherAgents",
  "terminal",
  "monitor",
  "otherT3",
];

/** Attribute recognized agent commands and their descendants, retaining unknown provider roots as agents. */
function processGroup(
  process: UsageResourceProcess,
  byPid: ReadonlyMap<number, UsageResourceProcess>,
): UsageResourceGroupKey {
  switch (process.category) {
    case "server":
      return "server";
    case "electron-main":
    case "electron-renderer":
    case "electron-gpu":
    case "electron-utility":
      return "electron";
    case "terminal-root":
      return "terminal";
    case "resource-monitor":
      return "monitor";
    case "unknown-t3":
      return "otherT3";
  }
  let current: UsageResourceProcess | undefined = process;
  let providerTree = false;
  const visited = new Set<number>();
  while (current && !visited.has(current.identity.pid)) {
    visited.add(current.identity.pid);
    if (current.category !== "server-child" && current.category !== "provider-root") break;
    providerTree ||= current.category === "provider-root";
    const agent = /\b(codex|claude|opencode|cursor)\b/i.exec(current.command)?.[1]?.toLowerCase();
    if (agent === "codex" || agent === "claude" || agent === "opencode" || agent === "cursor")
      return agent;
    current = byPid.get(current.ppid);
  }
  // The server currently labels native descendants server-child, including provider executables.
  // An unmatched explicit provider root is still an agent, not backend service overhead.
  return providerTree ? "otherAgents" : "server";
}

/** Sum each process exactly once in stable group order; empty groups are omitted. */
export function groupUsageResources(
  processes: readonly UsageResourceProcess[],
): UsageResourceGroup[] {
  const byPid = new Map(processes.map((process) => [process.identity.pid, process]));
  const groups = new Map<UsageResourceGroupKey, UsageResourceGroup>();
  for (const process of processes) {
    const key = processGroup(process, byPid);
    const previous = groups.get(key);
    groups.set(key, {
      key,
      processCount: (previous?.processCount ?? 0) + 1,
      cpuPercent: (previous?.cpuPercent ?? 0) + process.cpuPercent,
      residentBytes: (previous?.residentBytes ?? 0) + process.residentBytes,
    });
  }
  return GROUP_ORDER.flatMap((key) => {
    const group = groups.get(key);
    return group ? [group] : [];
  });
}

/** Convert telemetry's core-relative CPU to whole-host percent; unknown capacity stays unavailable. */
export function wholeHostCpuPercent(cpuPercent: number, cpuCount: number): number | null {
  return cpuCount > 0 ? cpuPercent / cpuCount : null;
}

/** One sample uses the source timestamp in milliseconds, never the client render time. */
export interface UsageCpuFrame {
  readonly at: number;
  readonly groups: ReadonlyMap<UsageResourceGroupKey, number>;
}

/** Immutable circular storage; grows only when a higher sample rate fills the live two-minute window. */
export interface UsageCpuHistory {
  readonly slots: readonly (UsageCpuFrame | undefined)[];
  readonly head: number;
  readonly length: number;
  readonly latestAt: number | null;
}

/** Start an independent environment's history; no samples or time are inferred. */
export function emptyUsageCpuHistory(): UsageCpuHistory {
  return { slots: Array<UsageCpuFrame | undefined>(64), head: 0, length: 0, latestAt: null };
}

/** Return chronological frames; missing groups mean absent processes, not zero-valued observations. */
export function usageCpuFrames(history: UsageCpuHistory): UsageCpuFrame[] {
  return Array.from(
    { length: history.length },
    (_, index) => history.slots[(history.head + index) % history.slots.length]!,
  );
}

/** Append a newer source sample, dropping entries older than 120000ms; duplicate/stale delivery is ignored. */
export function pushUsageCpuHistory(
  history: UsageCpuHistory,
  groups: readonly UsageResourceGroup[],
  at: number,
): UsageCpuHistory {
  if (!Number.isFinite(at) || (history.latestAt !== null && at <= history.latestAt)) return history;
  let slots = [...history.slots];
  let head = history.head;
  let length = history.length;
  while (length > 0 && slots[head]!.at < at - 120_000) {
    slots[head] = undefined;
    head = (head + 1) % slots.length;
    length--;
  }
  if (length === slots.length) {
    slots = [
      ...usageCpuFrames({ ...history, slots, head, length }),
      ...Array<undefined>(slots.length),
    ];
    head = 0;
  }
  slots[(head + length) % slots.length] = {
    at,
    groups: new Map(groups.map((group) => [group.key, group.cpuPercent])),
  };
  return { slots, head, length: length + 1, latestAt: at };
}
