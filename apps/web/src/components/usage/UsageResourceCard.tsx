/** Primary-environment resources with permission gating and foreground-only collection. */
import { AuthDiagnosticsReadScope, type EnvironmentId } from "@t3tools/contracts";

import { type JSX } from "react";
import { t } from "~/i18n";

import { formatBytes } from "../../lib/formatBytes";
import { usePrimaryEnvironment } from "../../state/environments";
import { useEnvironmentScope } from "../../state/session";

import { PixelIcon } from "../icons/PixelIcon";
import { Button } from "../ui/button";
import { useUsageResourceData } from "./useUsageResourceData";
import { useUsageCardEntrance } from "./useUsageCardEntrance";
import { UsageResourceMeter, UsageResourceSpark } from "./UsageResourceVisuals";
import {
  groupUsageResources,
  usageCpuFrames,
  wholeHostCpuPercent,
  type UsageResourceGroupKey,
} from "./usageResource.logic";

/** Format memory in binary GB, matching the existing byte formatter's units. */
function memoryPair(used: number, total: number) {
  return `${(used / 1024 ** 3).toFixed(1)} / ${(total / 1024 ** 3).toFixed(1)} GB`;
}

/** Render no card or subscriptions without the primary environment and diagnostics grant. */
export function UsageResourceCard(): JSX.Element | null {
  const environment = usePrimaryEnvironment();
  const canRead = useEnvironmentScope(environment?.environmentId ?? null, AuthDiagnosticsReadScope);
  if (!environment || !canRead) return null;
  // A host change must not inherit the previous machine's CPU history.
  return (
    <PrimaryUsageResources
      key={environment.environmentId}
      environmentId={environment.environmentId}
      label={environment.label}
    />
  );
}

/** Own one granted host's push subscription, two-second host query, and local CPU history. */
function PrimaryUsageResources({
  environmentId,
  label,
}: {
  readonly environmentId: EnvironmentId;
  readonly label: string;
}) {
  const { visible, telemetry, hostQuery, host, sample } = useUsageResourceData(environmentId);
  const entranceRef = useUsageCardEntrance(0.045);
  const groups = groupUsageResources(sample.snapshot?.processes ?? []);
  const frames = usageCpuFrames(sample.history);
  const cpuCount = host?.cpuCount ?? 0;
  const cpu = host?.cpuUtilization == null ? null : host.cpuUtilization * 100;
  const usedMemory = host ? host.totalMemoryBytes - host.availableMemoryBytes : null;
  const memoryPercent =
    host && host.totalMemoryBytes > 0 && usedMemory !== null
      ? (usedMemory / host.totalMemoryBytes) * 100
      : null;
  const labels: Record<UsageResourceGroupKey, string> = {
    server: t.tools.usage.resourceServer,
    electron: t.tools.usage.resourceElectron,
    codex: t.tools.usage.resourceCodex,
    claude: t.tools.usage.resourceClaude,
    opencode: t.tools.usage.resourceOpenCode,
    cursor: t.tools.usage.resourceCursor,
    otherAgents: t.tools.usage.resourceOtherAgents,
    terminal: t.tools.usage.resourceTerminal,
    monitor: t.tools.usage.resourceMonitor,
    otherT3: t.tools.usage.resourceOtherT3,
  };
  const error = telemetry.error ?? hostQuery.error;
  return (
    <div ref={entranceRef} className="usage-resource-card">
      <div className="usage-l4-card-header">
        <div>
          <h2>{t.tools.usage.resourceTitle}</h2>
          <p>{label}</p>
        </div>
        <span className="usage-resource-live">
          {visible ? t.tools.usage.resourceLive : t.tools.usage.resourcePaused}
        </span>
      </div>
      <div className="usage-resource-meters">
        <UsageResourceMeter
          label={t.tools.usage.resourceHostCpu.replace(
            "{count}",
            cpuCount > 0 ? String(cpuCount) : "-",
          )}
          percent={cpu}
        />
        <UsageResourceMeter
          label={t.tools.usage.resourceHostMemory}
          percent={memoryPercent}
          text={host && usedMemory !== null ? memoryPair(usedMemory, host.totalMemoryBytes) : "-"}
        />
      </div>
      {error && (
        <div className="usage-resource-error" role="status">
          <p>
            {t.tools.usage.resourceError}: {error}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (document.hidden) return;
              telemetry.refresh();
              hostQuery.refresh();
            }}
          >
            {t.tools.usage.resourceRefresh}
          </Button>
        </div>
      )}
      <table className="usage-resource-table">
        <thead>
          <tr>
            <th>{t.tools.usage.resourceProcesses}</th>
            <th>{t.tools.usage.resourceCpuHistory}</th>
            <th>{t.tools.usage.resourceCpu}</th>
            <th>{t.tools.usage.resourceMemory}</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => {
            const hostCpu = wholeHostCpuPercent(group.cpuPercent, cpuCount);
            return (
              <tr key={group.key} data-group={group.key}>
                <td>
                  <span className="usage-resource-name">
                    {group.key === "codex" || group.key === "claude" ? (
                      <PixelIcon name={group.key} size={14} />
                    ) : (
                      <i aria-hidden className="usage-resource-swatch" />
                    )}
                    <span>{labels[group.key]}</span>
                    <em className="usage-resource-count">×{group.processCount}</em>
                  </span>
                </td>
                <td>
                  <UsageResourceSpark frames={frames} group={group.key} cpuCount={cpuCount} />
                </td>
                <td>{hostCpu === null ? "-" : `${hostCpu.toFixed(1)}%`}</td>
                <td>{formatBytes(group.residentBytes)}</td>
              </tr>
            );
          })}
          {!groups.length && (
            <tr>
              <td colSpan={4}>
                {sample.snapshot ? t.tools.usage.resourceEmpty : t.tools.usage.resourceLoading}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="usage-l4-note">{t.tools.usage.resourceHelp}</p>
    </div>
  );
}
