/** Pure process-tree and history geometry used by resource diagnostics. */
import type { ResourceTelemetryProcess, ResourceTelemetrySourceStatus } from "@t3tools/contracts";

/** Includes process start time so a reused PID cannot inherit another process action state. */
export function processIdentityKey(process: Pick<ResourceTelemetryProcess, "identity">): string {
  return `${process.identity.pid}:${process.identity.startTimeMs}`;
}

/** Returns input-order processes whose ancestors are not collapsed; identity keys include process start time. */
export function visibleResourceTelemetryProcesses(
  processes: ReadonlyArray<ResourceTelemetryProcess>,
  collapsed: ReadonlySet<string>,
): ReadonlyArray<ResourceTelemetryProcess> {
  const childrenByParent = new Map<number, ResourceTelemetryProcess[]>();
  for (const process of processes) {
    const children = childrenByParent.get(process.ppid) ?? [];
    children.push(process);
    childrenByParent.set(process.ppid, children);
  }

  const hidden = new Set<string>();
  const hideDescendants = (pid: number): void => {
    for (const child of childrenByParent.get(pid) ?? []) {
      const key = processIdentityKey(child);
      if (hidden.has(key)) continue;
      hidden.add(key);
      hideDescendants(child.identity.pid);
    }
  };
  for (const process of processes) {
    if (collapsed.has(processIdentityKey(process))) {
      hideDescendants(process.identity.pid);
    }
  }
  return processes.filter((process) => !hidden.has(processIdentityKey(process)));
}

/** Offers retry for failed or unavailable collectors, but not a healthy source or a pending initial load. */
export function shouldShowResourceMonitorRetry(input: {
  readonly nativeStatus: ResourceTelemetrySourceStatus | null;
  readonly error: string | null;
}): boolean {
  return (
    (input.nativeStatus === null && input.error !== null) ||
    input.nativeStatus === "degraded" ||
    input.nativeStatus === "unavailable" ||
    input.nativeStatus === "stopped"
  );
}

/** Returns a percentage height from a value and scale; zero remains invisible and positive samples honor the visibility floor. */
export function resourceHistoryBarHeight(input: {
  readonly value: number;
  readonly max: number;
  readonly minimumVisiblePercent: number;
}): number {
  if (input.value <= 0) return 0;
  return Math.max(input.minimumVisiblePercent, (input.value / Math.max(1, input.max)) * 100);
}

/** Scales CPU history by averages, independently of peak spikes; an empty or zero series uses a scale of one. */
export function resourceHistoryCpuScaleMax(
  buckets: ReadonlyArray<{ readonly avgCpuPercent: number }>,
): number {
  return Math.max(1, ...buckets.map((bucket) => bucket.avgCpuPercent));
}

/** Returns percentage heights in bucket order, scaling CPU averages and peak RSS bytes independently. */
export function resourceSummaryBarHeights(
  buckets: ReadonlyArray<{ readonly avgCpuPercent: number; readonly maxRssBytes: number }>,
) {
  const cpuMax = resourceHistoryCpuScaleMax(buckets);
  const memoryMax = Math.max(1, ...buckets.map((bucket) => bucket.maxRssBytes));
  return {
    cpu: buckets.map((bucket) =>
      resourceHistoryBarHeight({
        value: bucket.avgCpuPercent,
        max: cpuMax,
        minimumVisiblePercent: 2,
      }),
    ),
    memory: buckets.map((bucket) =>
      resourceHistoryBarHeight({
        value: bucket.maxRssBytes,
        max: memoryMax,
        minimumVisiblePercent: 2,
      }),
    ),
  };
}
