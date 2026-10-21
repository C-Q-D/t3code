/** Presents diagnostics without changing environment access, process signals or trace queries. */
import { t } from "~/i18n";
import { ProcessSignalActions } from "./ProcessSignalActions";
import { resolveUsageAccess } from "@t3tools/client-runtime/state/usage-access";
import { environmentSession } from "../../state/session";
import { AuthOrchestrationOperateScope } from "@t3tools/contracts";
import { readEnvironmentScope, useEnvironmentScope } from "../../state/session";
import { AuthEnvironmentMaintainScope } from "@t3tools/contracts";
import { RefreshIcon } from "~/components/ui/refresh-icon";
import { AlertTriangleIcon, CopyIcon, FolderOpenIcon, InfoIcon } from "lucide-react";
import { ChevronDown, ChevronRight } from "lucide";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type {
  ServerProcessDiagnosticsEntry,
  ServerProcessResourceHistorySummary,
  ServerProcessSignal,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";

import { cn } from "../../lib/utils";
import { ensureLocalApi } from "../../localApi";
import { useOpenInPreferredEditor } from "../../editorPreferences";
import { useRelativeTimeState } from "../../hooks/useRelativeTimeState";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { Button } from "../ui/button";
import { MorphIcon } from "~/components/MorphIcon";
import { ScrollArea } from "../ui/scroll-area";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { toastManager } from "../ui/toast";
import { ExpandableText } from "./ExpandableText";
import { ResourceTelemetryDiagnostics } from "./ResourceTelemetryDiagnostics";
import { SettingsPageContainer, SettingsSection, SettingsRow } from "./settingsLayout";
import { useAtomCommand } from "../../state/use-atom-command";
import { useSettingsScope } from "./SettingsScopeContext";
import { TelemetryExportSettings } from "./TelemetryExportSettings";

const NUMBER_FORMAT = new Intl.NumberFormat();

/** Formats a diagnostic count with the active runtime locale. */
function formatCount(value: number): string {
  return NUMBER_FORMAT.format(value);
}

/** Formats milliseconds for diagnostic tables without changing the recorded duration. */
function formatDuration(value: number): string {
  if (value < 1_000) return `${Math.round(value)} ms`;
  return `${(value / 1_000).toFixed(value >= 10_000 ? 1 : 2)} s`;
}

/** Formats a byte count using binary units for diagnostic measurements. */
function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB"] as const;
  let unitIndex = -1;
  let next = value;
  do {
    next /= 1024;
    unitIndex += 1;
  } while (next >= 1024 && unitIndex < units.length - 1);
  return `${next.toFixed(next >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

/**
 * Subscribes to changing relative time instead of caching the first diagnostic timestamp label.
 * @param props.value UTC observation time.
 * @returns A nonbreaking relative label, or null when the formatter has no relative value.
 */
function RelativeTimeNoWrap(props: { value: DateTime.Utc }) {
  const relative = useRelativeTimeState(DateTime.formatIso(props.value));
  if (relative.status !== "relative") return null;
  return relative.suffix ? `${relative.value}\u00a0${relative.suffix}` : relative.value;
}

/** Abbreviates long trace identifiers for display; copying still uses the complete identifier. */
function shortenTraceId(traceId: string): string {
  if (traceId.length <= 32) return traceId;
  return `${traceId.slice(0, 18)}...${traceId.slice(-10)}`;
}

/** Recognizes the server response for a process that exited before a signal could be sent. */
function isStaleProcessSignalMessage(message: string | undefined): boolean {
  return message?.includes("not a live descendant") ?? false;
}

/** Displays one labeled diagnostic value, with an optional explanation and severity. */
function StatBlock({
  label,
  value,
  tooltip,
  tone = "default",
}: {
  label: string;
  value: string;
  tooltip?: ReactNode;
  tone?: "default" | "warning" | "danger";
}) {
  return (
    <div className="min-w-0 border-settings-divider px-4 py-3 sm:px-5">
      <div className="flex min-w-0 items-center gap-1.5 text-meta-large font-medium tracking-normal text-muted-foreground">
        <span className="min-w-0 truncate">{label}</span>
        {tooltip ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  className="cursor-pointer inline-flex size-3.5 shrink-0 items-center justify-center rounded-sm text-muted-foreground/60 hover:text-foreground"
                  aria-label={t.settings.diagnostics.detailsAriaLabel(label)}
                >
                  <InfoIcon className="size-3" />
                </button>
              }
            />
            <TooltipPopup side="top">{tooltip}</TooltipPopup>
          </Tooltip>
        ) : null}
      </div>
      <div
        className={cn(
          "mt-1 truncate font-mono text-card-title font-semibold tabular-nums text-foreground",
          tone === "warning" && "text-warning-foreground",
          tone === "danger" && "text-destructive",
        )}
      >
        {value}
      </div>
    </div>
  );
}

/** Groups diagnostic values with dividers while preserving their reading order. */
function StatsGrid({ children }: { children: ReactNode }) {
  return (
    <div className="relative grid grid-cols-2 sm:grid-cols-4">
      <span
        className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-border/60"
        aria-hidden
      />
      <span
        className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-border/60 sm:hidden"
        aria-hidden
      />
      <span
        className="pointer-events-none absolute inset-y-0 left-1/4 hidden w-px bg-border/60 sm:block"
        aria-hidden
      />
      <span
        className="pointer-events-none absolute inset-y-0 left-3/4 hidden w-px bg-border/60 sm:block"
        aria-hidden
      />
      {children}
    </div>
  );
}

/** Displays the supplied empty-state explanation in place of table rows. */
function EmptyRows({ label }: { label: string }) {
  return <div className="px-4 py-4 text-secondary-copy text-muted-foreground sm:px-5">{label}</div>;
}

/** Renders labeled diagnostic columns with optional widths and horizontal overflow. */
function DiagnosticsTable({
  headers,
  children,
  minTableWidth = "min-w-[640px]",
  columnWidths,
}: {
  headers: ReadonlyArray<string>;
  children: ReactNode;
  minTableWidth?: string;
  columnWidths?: ReadonlyArray<string>;
}) {
  return (
    <ScrollArea
      radius="none"
      chainVerticalScroll
      scrollFade
      hideScrollbars
      className="w-full max-w-full"
    >
      <table
        className={cn(
          "w-full text-left text-secondary-copy",
          minTableWidth,
          columnWidths && "table-fixed",
        )}
      >
        {columnWidths ? (
          <colgroup>
            {headers.map((header, index) => (
              <col key={header} className={columnWidths[index]} />
            ))}
          </colgroup>
        ) : null}
        <thead className="border-b border-settings-divider text-meta-large tracking-normal text-muted-foreground">
          <tr>
            {headers.map((header, index) => (
              <th
                key={header}
                className={cn(
                  "whitespace-nowrap px-4 py-2.5 font-semibold first:sm:pl-5 last:sm:pr-5",
                  !columnWidths && index === headers.length - 1 && "w-px",
                )}
              >
                {header.replaceAll(" ", "\u00a0")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-settings-divider">{children}</tbody>
      </table>
    </ScrollArea>
  );
}

/** Displays an abbreviated trace ID and copies its complete value through the clipboard hook. */
function TraceIdCell({ traceId }: { traceId: string }) {
  const { copyToClipboard, isCopied: copied } = useCopyToClipboard({
    target: "trace ID",
    timeout: 1_200,
  });

  return (
    <div className="flex w-full min-w-0 max-w-full items-center gap-2">
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="min-w-0 flex-1 truncate font-mono text-meta-large">
              {shortenTraceId(traceId)}
            </span>
          }
        />
        <TooltipPopup side="top" variant="code">
          {traceId}
        </TooltipPopup>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="icon-micro"
              variant="ghost-muted"
              aria-label={
                copied
                  ? t.settings.diagnostics.traces.copiedTrace
                  : t.settings.diagnostics.traces.copyTrace
              }
              onClick={() => copyToClipboard(traceId)}
            >
              <CopyIcon className="size-3" />
            </Button>
          }
        />
        <TooltipPopup side="top">
          {copied ? t.settings.actions.copied : t.settings.diagnostics.traces.copyFullTrace}
        </TooltipPopup>
      </Tooltip>
    </div>
  );
}

/** Derives the displayed executable name while retaining the complete command for inspection. */
function formatProcessName(command: string): string {
  const firstToken = command.trim().split(/\s+/)[0];
  if (!firstToken) return command;
  const normalized = firstToken.replace(/^['"]|['"]$/g, "");
  const segments = normalized.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) ?? normalized;
}

/** Labels a process by depth and recognized agent command without changing its identity. */
function formatProcessType(process: ServerProcessDiagnosticsEntry): string {
  if (process.depth > 0) return t.settings.diagnostics.processCategories.subprocess;
  if (/\b(codex|claude|opencode|cursor)\b/i.test(process.command))
    return t.settings.diagnostics.processCategories.agent;
  return t.settings.diagnostics.processCategories.process;
}

/** Displays a process command and invokes onToggle with its PID when its child list is expanded. */
function ProcessNameCell({
  process,
  isExpanded,
  onToggle,
}: {
  process: ServerProcessDiagnosticsEntry;
  isExpanded: boolean;
  onToggle: (pid: number) => void;
}) {
  const name = formatProcessName(process.command);
  const hasChildren = process.childPids.length > 0;

  return (
    <div
      className="grid min-w-0 grid-cols-[1.25rem_0.375rem_minmax(0,1fr)] items-center gap-2"
      style={{ paddingLeft: `${Math.min(process.depth, 6) * 10}px` }}
    >
      {hasChildren ? (
        <Button
          size="icon-micro"
          variant="ghost-muted"
          aria-label={
            isExpanded
              ? t.settings.diagnostics.collapseAriaLabel(name)
              : t.settings.diagnostics.expandAriaLabel(name)
          }
          onClick={() => onToggle(process.pid)}
        >
          <MorphIcon className="size-3.5" icon={isExpanded ? ChevronDown : ChevronRight} />
        </Button>
      ) : (
        <span className="size-5 shrink-0" aria-hidden="true" />
      )}
      <span className="size-1.5 shrink-0 rounded-full bg-success/80" />
      <Tooltip>
        <TooltipTrigger
          render={<span className="min-w-0 truncate font-medium text-foreground">{name}</span>}
        />
        <TooltipPopup side="top" variant="code">
          {process.command}
        </TooltipPopup>
      </Tooltip>
    </div>
  );
}

/**
 * Preserves preorder while hiding descendants of collapsed processes; sibling branches remain visible.
 * @param processes Depth-first process entries with depth metadata.
 * @param collapsedPids PIDs whose descendants should be hidden, not the parents themselves.
 * @returns Visible entries in input order without mutating the diagnostics snapshot.
 */
function visibleProcessTree(
  processes: ReadonlyArray<ServerProcessDiagnosticsEntry>,
  collapsedPids: ReadonlySet<number>,
) {
  const visible: ServerProcessDiagnosticsEntry[] = [];
  let hiddenChildDepth: number | null = null;

  for (const process of processes) {
    if (hiddenChildDepth !== null) {
      if (process.depth > hiddenChildDepth) continue;
      hiddenChildDepth = null;
    }

    visible.push(process);
    if (collapsedPids.has(process.pid)) {
      hiddenChildDepth = process.depth;
    }
  }

  return visible;
}

/** Renders the process tree and existing permission-gated signal actions; emptyLabel overrides the default empty state. */
function ProcessDiagnosticsTable({
  processes,
  canMaintainEnvironment,
  signalingPid,
  onSignal,
  emptyLabel,
}: {
  processes: ReadonlyArray<ServerProcessDiagnosticsEntry>;
  canMaintainEnvironment: boolean;
  signalingPid: number | null;
  onSignal: (pid: number, signal: ServerProcessSignal) => void;
  emptyLabel?: string;
}) {
  const [collapsedPids, setCollapsedPids] = useState<ReadonlySet<number>>(() => new Set());
  const visibleProcesses = visibleProcessTree(processes, collapsedPids);

  const toggleProcess = (pid: number) => {
    setCollapsedPids((previous) => {
      const next = new Set(previous);
      if (next.has(pid)) {
        next.delete(pid);
      } else {
        next.add(pid);
      }
      return next;
    });
  };

  return (
    <div className="border-t border-settings-divider">
      <ScrollArea
        radius="none"
        chainVerticalScroll
        scrollFade
        hideScrollbars
        className="max-h-[min(64vh,44rem)] w-full max-w-full"
      >
        <table className="w-full min-w-[1040px] table-fixed text-left text-secondary-copy">
          <colgroup>
            <col className="w-[24%]" />
            <col className="w-[8%]" />
            <col className="w-[10%]" />
            <col className="w-[33%]" />
            <col className="w-[8%]" />
            <col className="w-[11%]" />
            <col className="w-[6%]" />
          </colgroup>
          <thead className="sticky top-0 z-10 border-b border-settings-divider bg-card text-meta-large tracking-normal text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-semibold sm:pl-5">
                {t.settings.diagnostics.columns.name}
              </th>
              <th className="px-3 py-2 text-right font-semibold">
                {t.settings.diagnostics.columns.cpu}
              </th>
              <th className="px-3 py-2 text-right font-semibold">
                {t.settings.diagnostics.columns.memory}
              </th>
              <th className="px-3 py-2 font-semibold">{t.settings.diagnostics.columns.command}</th>
              <th className="px-3 py-2 text-right font-semibold">
                {t.settings.diagnostics.columns.pid}
              </th>
              <th className="px-3 py-2 font-semibold">{t.settings.diagnostics.columns.type}</th>
              <th className="p-2 text-right font-semibold sm:pr-4">
                {t.settings.diagnostics.columns.kill}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-settings-divider">
            {visibleProcesses.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-4 text-secondary-copy text-muted-foreground sm:px-5"
                >
                  {emptyLabel ?? t.settings.diagnostics.processes.empty}
                </td>
              </tr>
            ) : null}
            {visibleProcesses.map((process) => (
              <tr key={process.pid} className="hover:bg-muted/20">
                <td className="px-4 py-2 align-middle sm:pl-5">
                  <ProcessNameCell
                    process={process}
                    isExpanded={!collapsedPids.has(process.pid)}
                    onToggle={toggleProcess}
                  />
                </td>
                <td className="px-3 py-2 text-right align-middle font-mono tabular-nums">
                  {process.cpuPercent.toFixed(1)}%
                </td>
                <td className="px-3 py-2 text-right align-middle font-mono tabular-nums">
                  {formatBytes(process.rssBytes)}
                </td>
                <td className="px-3 py-2 align-middle text-muted-foreground">
                  <Tooltip>
                    <TooltipTrigger
                      render={<span className="block truncate">{process.command}</span>}
                    />
                    <TooltipPopup side="top" variant="code">
                      {process.command}
                    </TooltipPopup>
                  </Tooltip>
                </td>
                <td className="px-3 py-2 text-right align-middle font-mono tabular-nums text-muted-foreground">
                  {process.pid}
                </td>
                <td className="truncate px-3 py-2 align-middle text-muted-foreground">
                  {formatProcessType(process)}
                </td>
                <td className="p-2 align-middle sm:pr-4">
                  <ProcessSignalActions
                    disabled={!canMaintainEnvironment || signalingPid === process.pid}
                    onSignal={(signal) => onSignal(process.pid, signal)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollArea>
    </div>
  );
}

const RESOURCE_HISTORY_WINDOWS = [
  {
    label: t.settings.diagnostics.historyWindows.fiveMinutes,
    windowMs: 5 * 60_000,
    bucketMs: 30_000,
  },
  {
    label: t.settings.diagnostics.historyWindows.fifteenMinutes,
    windowMs: 15 * 60_000,
    bucketMs: 60_000,
  },
  {
    label: t.settings.diagnostics.historyWindows.thirtyMinutes,
    windowMs: 30 * 60_000,
    bucketMs: 2 * 60_000,
  },
  {
    label: t.settings.diagnostics.historyWindows.oneHour,
    windowMs: 60 * 60_000,
    bucketMs: 5 * 60_000,
  },
] satisfies readonly [unknown, ...unknown[]];

/** Formats accumulated CPU time using the units supplied by the diagnostic source. */
function formatCpuTime(seconds: number): string {
  if (seconds < 60)
    return t.settings.diagnostics.cpuTime.seconds(seconds.toFixed(seconds >= 10 ? 1 : 2));
  const minutes = seconds / 60;
  if (minutes < 60)
    return t.settings.diagnostics.cpuTime.minutes(minutes.toFixed(minutes >= 10 ? 1 : 2));
  return t.settings.diagnostics.cpuTime.hours((minutes / 60).toFixed(2));
}

/** Extracts a short executable label from a complete command for historical rows. */
function formatShortProcessName(command: string): string {
  const name = formatProcessName(command);
  return name.length > 42 ? `${name.slice(0, 39)}...` : name;
}

/** Displays a historical process name while keeping its full command available for inspection. */
function ResourceHistoryProcessNameCell({
  process,
  visualDepth,
}: {
  process: ServerProcessResourceHistorySummary;
  visualDepth: number;
}) {
  const name = formatShortProcessName(process.command);

  return (
    <div
      className="grid min-w-0 grid-cols-[1.25rem_0.375rem_minmax(0,1fr)] items-center gap-2"
      style={{ paddingLeft: `${Math.min(visualDepth, 6) * 10}px` }}
      aria-label={t.settings.diagnostics.history.processAriaLabel(process.isServerRoot, name)}
    >
      <span className="size-5 shrink-0" aria-hidden="true" />
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          process.isServerRoot ? "bg-warning/90" : "bg-success/80",
        )}
      />
      <Tooltip>
        <TooltipTrigger
          render={<span className="min-w-0 truncate font-medium text-foreground">{name}</span>}
        />
        <TooltipPopup side="top" variant="code">
          {process.command}
        </TooltipPopup>
      </Tooltip>
    </div>
  );
}

/** Plots the supplied server CPU history buckets without animated interpolation. */
function ProcessResourceHistoryChart({
  buckets,
}: {
  buckets: ReadonlyArray<{
    readonly startedAt: DateTime.Utc;
    readonly avgCpuPercent: number;
    readonly maxCpuPercent: number;
  }>;
}) {
  const maxCpuPercent = Math.max(1, ...buckets.map((bucket) => bucket.maxCpuPercent));

  return (
    <div className="border-t border-settings-divider px-4 py-3 sm:px-5">
      <div className="flex h-28 items-end gap-1 overflow-hidden rounded-sm bg-muted/10 p-2">
        {buckets.map((bucket) => {
          const peakHeight = Math.max(2, (bucket.maxCpuPercent / maxCpuPercent) * 100);
          const averageHeight = Math.max(2, (bucket.avgCpuPercent / maxCpuPercent) * 100);
          return (
            <Tooltip key={DateTime.formatIso(bucket.startedAt)}>
              <TooltipTrigger
                render={
                  <div className="flex h-full min-w-1 flex-1 items-end">
                    <div
                      className="relative h-full w-full"
                      aria-label={t.settings.diagnostics.history.cpuAriaLabel(
                        bucket.avgCpuPercent.toFixed(1),
                        bucket.maxCpuPercent.toFixed(1),
                      )}
                    >
                      <div
                        className="absolute inset-x-0 bottom-0 rounded-t-sm bg-foreground/15 transition-colors"
                        style={{ height: `${peakHeight}%` }}
                      />
                      <div
                        className="absolute inset-x-0 bottom-0 rounded-t-sm bg-foreground/60 transition-colors"
                        style={{ height: `${averageHeight}%` }}
                      />
                    </div>
                  </div>
                }
              />
              <TooltipPopup side="top">
                {t.settings.diagnostics.history.cpuHint(
                  bucket.avgCpuPercent.toFixed(1),
                  bucket.maxCpuPercent.toFixed(1),
                )}
              </TooltipPopup>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}

/** Selects an existing history window in milliseconds; invokes onSelect only for supported windows. */
function ResourceHistoryWindowSelector({
  selectedWindowMs,
  onSelect,
}: {
  selectedWindowMs: number;
  onSelect: (windowMs: number) => void;
}) {
  return (
    <ToggleGroup
      aria-label={t.settings.diagnostics.history.periodAriaLabel}
      variant="segmented"
      size="settings"
      value={[String(selectedWindowMs)]}
      onValueChange={(next) => {
        const selected = RESOURCE_HISTORY_WINDOWS.find(
          (option) => String(option.windowMs) === next[0],
        );
        if (selected) onSelect(selected.windowMs);
      }}
    >
      {RESOURCE_HISTORY_WINDOWS.map((option) => (
        <Toggle size="settings" key={option.windowMs} value={String(option.windowMs)}>
          {option.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}

/** Displays historical resource summaries and the supplied loading or empty explanation. */
function ProcessResourceHistoryTable({
  processes,
  emptyLabel,
}: {
  processes: ReadonlyArray<ServerProcessResourceHistorySummary>;
  emptyLabel: string;
}) {
  const shallowestChildDepth = processes.reduce<number | null>((minDepth, process) => {
    if (process.isServerRoot) return minDepth;
    return minDepth === null ? process.depth : Math.min(minDepth, process.depth);
  }, null);

  return (
    <div className="border-t border-settings-divider">
      <ScrollArea
        chainVerticalScroll
        scrollFade
        hideScrollbars
        className="max-h-[min(64vh,44rem)] w-full max-w-full"
      >
        <table className="w-full min-w-[980px] table-fixed text-left text-secondary-copy">
          <colgroup>
            <col className="w-[24%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
            <col className="w-[16%]" />
            <col className="w-[10%]" />
          </colgroup>
          <thead className="sticky top-0 z-10 border-b border-settings-divider bg-card text-meta-large tracking-normal text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-semibold sm:pl-5">
                {t.settings.diagnostics.processCategories.process}
              </th>
              <th className="px-3 py-2 text-right font-semibold">
                {t.settings.diagnostics.columns.cpuTime}
              </th>
              <th className="px-3 py-2 text-right font-semibold">
                {t.settings.diagnostics.columns.current}
              </th>
              <th className="px-3 py-2 text-right font-semibold">
                {t.settings.diagnostics.columns.average}
              </th>
              <th className="px-3 py-2 text-right font-semibold">
                {t.settings.diagnostics.columns.peak}
              </th>
              <th className="px-3 py-2 text-right font-semibold">
                {t.settings.diagnostics.columns.maxMemory}
              </th>
              <th className="px-3 py-2 font-semibold">{t.settings.diagnostics.columns.command}</th>
              <th className="px-3 py-2 text-right font-semibold sm:pr-5">
                {t.settings.diagnostics.columns.pid}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-settings-divider">
            {processes.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-4 text-secondary-copy text-muted-foreground sm:px-5"
                >
                  {emptyLabel}
                </td>
              </tr>
            ) : null}
            {processes.map((process) => (
              <tr key={process.processKey} className="hover:bg-muted/20">
                <td className="px-4 py-2 align-middle sm:pl-5">
                  <ResourceHistoryProcessNameCell
                    process={process}
                    visualDepth={
                      process.isServerRoot || shallowestChildDepth === null
                        ? 0
                        : Math.max(1, process.depth - shallowestChildDepth + 1)
                    }
                  />
                </td>
                <td className="px-3 py-2 text-right align-middle font-mono tabular-nums">
                  {formatCpuTime(process.cpuSecondsApprox)}
                </td>
                <td className="px-3 py-2 text-right align-middle font-mono tabular-nums">
                  {process.currentCpuPercent.toFixed(1)}%
                </td>
                <td className="px-3 py-2 text-right align-middle font-mono tabular-nums">
                  {process.avgCpuPercent.toFixed(1)}%
                </td>
                <td className="px-3 py-2 text-right align-middle font-mono tabular-nums">
                  {process.maxCpuPercent.toFixed(1)}%
                </td>
                <td className="px-3 py-2 text-right align-middle font-mono tabular-nums">
                  {formatBytes(process.maxRssBytes)}
                </td>
                <td className="px-3 py-2 align-middle text-muted-foreground">
                  <Tooltip>
                    <TooltipTrigger
                      render={<span className="block truncate">{process.command}</span>}
                    />
                    <TooltipPopup side="top" variant="code">
                      {process.command}
                    </TooltipPopup>
                  </Tooltip>
                </td>
                <td className="px-3 py-2 text-right align-middle font-mono tabular-nums text-muted-foreground sm:pr-5">
                  {process.pid}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollArea>
    </div>
  );
}

/** Updates only the relative label for the supplied UTC observation time. */
function DiagnosticsLastChecked({ checkedAt }: { checkedAt: DateTime.Utc | null }) {
  const relative = useRelativeTimeState(checkedAt ? DateTime.formatIso(checkedAt) : null);

  if (relative.status === "missing") {
    return (
      <span className="text-meta-large text-muted-foreground/50">
        {t.settings.diagnostics.status.checking}
      </span>
    );
  }

  if (relative.status === "invalid") {
    return (
      <span className="text-meta-large text-muted-foreground/50">
        {t.settings.diagnostics.status.unavailable}
      </span>
    );
  }

  return (
    <span className="text-meta-large text-muted-foreground/60">
      {relative.suffix ? (
        <>
          {t.settings.diagnostics.status.checked}{" "}
          <span className="font-mono tabular-nums">{relative.value}</span> {relative.suffix}
        </>
      ) : (
        <>
          {t.settings.diagnostics.status.checked} {relative.value}
        </>
      )}
    </span>
  );
}

/** Refreshes the owning diagnostic query and reflects its pending state. */
function DiagnosticsRefreshButton({
  isPending,
  label,
  onClick,
}: {
  isPending: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon-xs"
            variant="ghost-muted"
            disabled={isPending}
            onClick={onClick}
            aria-label={label}
          >
            <RefreshIcon refreshing={isPending} />
          </Button>
        }
      />
      <TooltipPopup side="top">{label}</TooltipPopup>
    </Tooltip>
  );
}

/** Loads diagnostics for the selected environment while retaining access checks, export drafts and signal confirmations. */
export function DiagnosticsSettingsPanel() {
  const { environment } = useSettingsScope();
  const environmentId = environment?.environmentId ?? null;
  const canMaintainEnvironment = useEnvironmentScope(environmentId, AuthEnvironmentMaintainScope);
  const observability = environment?.serverConfig?.observability;
  const availableEditors = environment?.serverConfig?.availableEditors;
  const canOpenHostEditor = useEnvironmentScope(environmentId, AuthOrchestrationOperateScope);
  const session = useEnvironmentQuery(
    environmentId === null ? null : environmentSession.sessionStateAtom(environmentId),
  );
  const diagnosticsAccess = resolveUsageAccess({
    connectionPhase: environment?.connection.phase ?? "available",
    session: session.data,
    hasSessionError: session.error !== null,
  });
  const canReadDiagnostics = diagnosticsAccess.canReadDiagnostics;
  const signalServerProcess = useAtomCommand(serverEnvironment.signalProcess, {
    reportFailure: false,
  });
  const openInEditor = useOpenInPreferredEditor(environmentId, availableEditors ?? []);
  const [resourceWindowMs, setResourceWindowMs] = useState(15 * 60_000);
  const selectedResourceWindow =
    RESOURCE_HISTORY_WINDOWS.find((option) => option.windowMs === resourceWindowMs) ??
    RESOURCE_HISTORY_WINDOWS[1];
  const { data, error, isPending, refresh } = useEnvironmentQuery(
    environmentId === null || !canReadDiagnostics
      ? null
      : serverEnvironment.traceDiagnostics({ environmentId, input: {} }),
  );
  const {
    data: processData,
    error: processError,
    isPending: isProcessPending,
    refresh: refreshProcesses,
  } = useEnvironmentQuery(
    environmentId === null || !canReadDiagnostics
      ? null
      : serverEnvironment.processDiagnostics({ environmentId, input: {} }),
  );
  const {
    data: resourceData,
    error: resourceError,
    isPending: isResourcePending,
    refresh: refreshResources,
  } = useEnvironmentQuery(
    environmentId === null || !canReadDiagnostics
      ? null
      : serverEnvironment.processResourceHistory({
          environmentId,
          input: {
            windowMs: selectedResourceWindow.windowMs,
            bucketMs: selectedResourceWindow.bucketMs,
          },
        }),
  );
  const [isOpeningLogsDirectory, setIsOpeningLogsDirectory] = useState(false);
  const [openLogsDirectoryError, setOpenLogsDirectoryError] = useState<string | null>(null);
  const [signalingPid, setSignalingPid] = useState<number | null>(null);
  const signalingPidRef = useRef<number | null>(null);
  const environmentIdRef = useRef(environmentId);
  const processDataRef = useRef(processData);
  useEffect(() => {
    processDataRef.current = processData;
  }, [processData]);
  useEffect(() => {
    environmentIdRef.current = environmentId;
    return () => {
      environmentIdRef.current = null;
    };
  }, [environmentId]);

  const openLogsDirectory = () => {
    const logsDirectoryPath = observability?.logsDirectoryPath ?? null;
    if (!logsDirectoryPath) return;

    if (
      environmentId === null ||
      !readEnvironmentScope(environmentId, AuthOrchestrationOperateScope)
    ) {
      return;
    }

    setIsOpeningLogsDirectory(true);
    setOpenLogsDirectoryError(null);
    void (async () => {
      const result = await openInEditor(logsDirectoryPath);
      setIsOpeningLogsDirectory(false);
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        setOpenLogsDirectoryError(
          error instanceof Error ? error.message : t.settings.diagnostics.traces.openLogsError,
        );
      }
    })();
  };

  const isInitialLoading = isPending && data === null;
  const isProcessInitialLoading = isProcessPending && processData === null;
  const isResourceInitialLoading = isResourcePending && resourceData === null;
  // The export form waits for each environment's first tables so a search target below them
  // stays in view. Later loads, such as a new resource window, must not remount it and drop drafts.
  const [exportFormEnvironmentId, setExportFormEnvironmentId] =
    useState<typeof environmentId>(null);
  if (
    exportFormEnvironmentId !== environmentId &&
    canReadDiagnostics &&
    !isInitialLoading &&
    !isProcessInitialLoading &&
    !isResourceInitialLoading
  ) {
    setExportFormEnvironmentId(environmentId);
  }
  const signalProcess = async (pid: number, signal: ServerProcessSignal) => {
    const targetEnvironmentId = environmentIdRef.current;
    const process = processDataRef.current?.processes.find((entry) => entry.pid === pid);
    if (
      targetEnvironmentId === null ||
      process === undefined ||
      !readEnvironmentScope(targetEnvironmentId, AuthEnvironmentMaintainScope)
    )
      return;
    if (signalingPidRef.current !== null) return;
    signalingPidRef.current = pid;
    setSignalingPid(pid);
    const clearSignaling = () => {
      signalingPidRef.current = null;
      setSignalingPid(null);
    };
    if (signal === "SIGKILL") {
      let confirmed = false;
      try {
        confirmed = await ensureLocalApi().dialogs.confirm(
          t.settings.diagnostics.signal.killConfirmation(pid),
          { variant: "destructive" },
        );
      } catch (error) {
        clearSignaling();
        toastManager.add({
          type: "error",
          title: t.settings.diagnostics.signal.confirmError,
          description:
            error instanceof Error
              ? error.message
              : t.settings.diagnostics.signal.sendErrorDescription(signal),
        });
        return;
      }
      if (!confirmed) {
        clearSignaling();
        return;
      }
    }
    const currentEnvironmentId = environmentIdRef.current;
    if (
      currentEnvironmentId === null ||
      currentEnvironmentId !== targetEnvironmentId ||
      !readEnvironmentScope(currentEnvironmentId, AuthEnvironmentMaintainScope)
    ) {
      clearSignaling();
      return;
    }
    if (
      processDataRef.current?.processes.find((entry) => entry.pid === pid)?.startTimeMs !==
      process.startTimeMs
    ) {
      clearSignaling();
      return;
    }

    const result = await signalServerProcess({
      environmentId: targetEnvironmentId,
      input: { pid, startTimeMs: process.startTimeMs, signal },
    });
    clearSignaling();
    if (result._tag === "Failure") {
      if (!isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add({
          type: "error",
          title: t.settings.diagnostics.signal.sendError(signal),
          description:
            error instanceof Error
              ? error.message
              : t.settings.diagnostics.signal.sendErrorDescription(signal),
        });
      }
      return;
    }
    if (!result.value.signaled) {
      const message = Option.getOrUndefined(result.value.message);
      refreshProcesses();
      if (isStaleProcessSignalMessage(message)) {
        toastManager.add({
          type: "info",
          title: t.settings.diagnostics.signal.exitedToast,
          description: t.settings.diagnostics.signal.exitedHint,
        });
        return;
      }

      toastManager.add({
        type: "error",
        title: t.settings.diagnostics.signal.sendError(signal),
        description: message ?? t.settings.diagnostics.signal.sendErrorDescription(signal),
      });
      return;
    }
    refreshProcesses();
  };

  const processDiagnosticsError = processData ? Option.getOrNull(processData.error) : null;
  const processResourceError = resourceData ? Option.getOrNull(resourceData.error) : null;
  const traceDiagnosticsError = data ? Option.getOrNull(data.error) : null;
  const traceDiagnosticsPartialFailure = data
    ? Option.getOrElse(data.partialFailure, () => false)
    : false;

  if (!canReadDiagnostics) {
    return (
      <SettingsPageContainer>
        <p className="text-secondary-copy-large text-muted-foreground">
          {environmentId === null
            ? t.settings.diagnostics.connectHint
            : diagnosticsAccess.isPending
              ? t.settings.diagnostics.accessChecking
              : diagnosticsAccess.error}
        </p>
      </SettingsPageContainer>
    );
  }

  return (
    <SettingsPageContainer>
      <ResourceTelemetryDiagnostics environmentId={environmentId}>
        <SettingsSection title={t.settings.diagnostics.graphite.tracing}>
          <SettingsRow
            title={t.settings.diagnostics.graphite.exportTrace}
            description={t.settings.diagnostics.graphite.exportTraceUnavailable}
            control={
              <Button size="md" variant="secondary" disabled>
                {t.settings.diagnostics.graphite.export}
              </Button>
            }
          />
          <SettingsRow
            title={t.settings.diagnostics.graphite.signals}
            description={t.settings.diagnostics.graphite.signalsUnavailable}
            control={
              <Button
                size="icon-md"
                variant="ghost"
                disabled
                aria-label={t.settings.diagnostics.graphite.signals}
              >
                <MorphIcon icon={ChevronRight} />
              </Button>
            }
          />
        </SettingsSection>
      </ResourceTelemetryDiagnostics>

      <SettingsSection
        title={t.settings.diagnostics.processes.title}
        headerAction={
          <div className="flex items-center gap-1.5">
            <DiagnosticsLastChecked checkedAt={processData?.readAt ?? null} />
            <DiagnosticsRefreshButton
              isPending={isProcessPending}
              label={t.settings.diagnostics.processes.refreshAriaLabel}
              onClick={refreshProcesses}
            />
          </div>
        }
      >
        <StatsGrid>
          <StatBlock
            label={t.settings.diagnostics.processes.childCount}
            value={processData ? formatCount(processData.processCount) : "..."}
          />
          <StatBlock
            label={t.settings.diagnostics.columns.cpu}
            value={processData ? `${processData.totalCpuPercent.toFixed(1)}%` : "..."}
            tooltip={t.settings.diagnostics.processes.cpuHint}
          />
          <StatBlock
            label={t.settings.diagnostics.columns.memory}
            value={processData ? formatBytes(processData.totalRssBytes) : "..."}
            tooltip={t.settings.diagnostics.processes.memoryHint}
          />
          <StatBlock
            label={t.settings.diagnostics.processes.serverPid}
            value={processData ? String(processData.serverPid) : "..."}
          />
        </StatsGrid>
        {processDiagnosticsError || processError ? (
          <div className="space-y-2 border-t border-settings-divider px-4 py-3 text-secondary-copy text-muted-foreground sm:px-5">
            {processDiagnosticsError ? (
              <div className="flex items-start gap-2 text-destructive">
                <AlertTriangleIcon className="size-3.5 h-lh shrink-0" />
                <span>{processDiagnosticsError.message}</span>
              </div>
            ) : null}
            {processError ? (
              <div className="flex items-start gap-2 text-destructive">
                <AlertTriangleIcon className="size-3.5 h-lh shrink-0" />
                <span>{processError}</span>
              </div>
            ) : null}
          </div>
        ) : null}
        <ProcessDiagnosticsTable
          processes={processData?.processes ?? []}
          canMaintainEnvironment={canMaintainEnvironment}
          signalingPid={signalingPid}
          onSignal={signalProcess}
          emptyLabel={
            isProcessInitialLoading
              ? t.settings.diagnostics.processes.loading
              : t.settings.diagnostics.processes.empty
          }
        />
      </SettingsSection>

      <SettingsSection
        title={t.settings.diagnostics.history.title}
        headerAction={
          <div className="flex items-center gap-1.5">
            <ResourceHistoryWindowSelector
              selectedWindowMs={resourceWindowMs}
              onSelect={setResourceWindowMs}
            />
            <DiagnosticsLastChecked checkedAt={resourceData?.readAt ?? null} />
            <DiagnosticsRefreshButton
              isPending={isResourcePending}
              label={t.settings.diagnostics.history.refreshAriaLabel}
              onClick={refreshResources}
            />
          </div>
        }
      >
        <StatsGrid>
          <StatBlock
            label={t.settings.diagnostics.columns.cpuTime}
            value={resourceData ? formatCpuTime(resourceData.totalCpuSecondsApprox) : "..."}
            tooltip={t.settings.diagnostics.history.cpuTimeHint}
          />
          <StatBlock
            label={t.settings.diagnostics.history.samples}
            value={resourceData ? formatCount(resourceData.retainedSampleCount) : "..."}
            tooltip={t.settings.diagnostics.history.samplesHint}
          />
          <StatBlock
            label={t.settings.diagnostics.history.interval}
            value={
              resourceData
                ? resourceData.sampleIntervalMs === 0
                  ? t.settings.diagnostics.history.onDemand
                  : formatDuration(resourceData.sampleIntervalMs)
                : "..."
            }
          />
          <StatBlock
            label={t.settings.diagnostics.history.processes}
            value={resourceData ? formatCount(resourceData.topProcesses.length) : "..."}
          />
        </StatsGrid>
        {processResourceError || resourceError ? (
          <div className="space-y-2 border-t border-settings-divider px-4 py-3 text-secondary-copy text-muted-foreground sm:px-5">
            {processResourceError ? (
              <div className="flex items-start gap-2 text-destructive">
                <AlertTriangleIcon className="size-3.5 h-lh shrink-0" />
                <span>{processResourceError.message}</span>
              </div>
            ) : null}
            {resourceError ? (
              <div className="flex items-start gap-2 text-destructive">
                <AlertTriangleIcon className="size-3.5 h-lh shrink-0" />
                <span>{resourceError}</span>
              </div>
            ) : null}
          </div>
        ) : null}
        <ProcessResourceHistoryChart buckets={resourceData?.buckets ?? []} />
        <ProcessResourceHistoryTable
          processes={resourceData?.topProcesses ?? []}
          emptyLabel={
            isResourceInitialLoading
              ? t.settings.diagnostics.history.loading
              : t.settings.diagnostics.history.empty
          }
        />
      </SettingsSection>

      <SettingsSection
        title={t.settings.diagnostics.traces.title}
        headerAction={
          <div className="flex items-center gap-1.5">
            <DiagnosticsLastChecked checkedAt={data?.readAt ?? null} />
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="icon-xs"
                    variant="ghost-muted"
                    disabled={
                      !canOpenHostEditor ||
                      !observability?.logsDirectoryPath ||
                      isOpeningLogsDirectory
                    }
                    onClick={openLogsDirectory}
                    aria-label={t.settings.diagnostics.traces.openLogs}
                  >
                    <FolderOpenIcon />
                  </Button>
                }
              />
              <TooltipPopup side="top">{t.settings.diagnostics.traces.openLogs}</TooltipPopup>
            </Tooltip>
            <DiagnosticsRefreshButton
              isPending={isPending}
              label={t.settings.diagnostics.traces.refreshAriaLabel}
              onClick={refresh}
            />
          </div>
        }
      >
        <StatsGrid>
          <StatBlock
            label={t.settings.diagnostics.traces.spans}
            value={data ? formatCount(data.recordCount) : "..."}
          />
          <StatBlock
            label={t.settings.diagnostics.traces.failures}
            value={data ? formatCount(data.failureCount) : "..."}
            tone={data && data.failureCount > 0 ? "danger" : "default"}
          />
          <StatBlock
            label={t.settings.diagnostics.traces.slowSpans}
            value={data ? formatCount(data.slowSpanCount) : "..."}
            tooltip={
              data
                ? t.settings.diagnostics.traces.slowSpanHint(
                    formatDuration(data.slowSpanThresholdMs),
                  )
                : t.settings.diagnostics.traces.slowSpanThresholdHint
            }
            tone={data && data.slowSpanCount > 0 ? "warning" : "default"}
          />
          <StatBlock
            label={t.settings.diagnostics.traces.parseErrors}
            value={data ? formatCount(data.parseErrorCount) : "..."}
            tone={data && data.parseErrorCount > 0 ? "warning" : "default"}
          />
        </StatsGrid>
        {openLogsDirectoryError || traceDiagnosticsError || error ? (
          <div className="space-y-2 border-t border-settings-divider px-4 py-3 text-secondary-copy text-muted-foreground sm:px-5">
            {openLogsDirectoryError ? (
              <div className="flex items-start gap-2 text-destructive">
                <AlertTriangleIcon className="size-3.5 h-lh shrink-0" />
                <span>{openLogsDirectoryError}</span>
              </div>
            ) : null}
            {traceDiagnosticsError ? (
              <div
                className={cn(
                  "flex items-start gap-2",
                  traceDiagnosticsPartialFailure ? "text-warning-foreground" : "text-destructive",
                )}
              >
                <AlertTriangleIcon className="size-3.5 h-lh shrink-0" />
                <span>
                  {traceDiagnosticsPartialFailure
                    ? t.settings.diagnostics.traces.incompleteHint(traceDiagnosticsError.message)
                    : traceDiagnosticsError.message}
                </span>
              </div>
            ) : null}
            {error ? (
              <div className="flex items-start gap-2 text-destructive">
                <AlertTriangleIcon className="size-3.5 h-lh shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}
          </div>
        ) : null}
      </SettingsSection>

      <SettingsSection title={t.settings.diagnostics.traces.latestFailures}>
        {data && data.latestFailures.length > 0 ? (
          <DiagnosticsTable
            headers={[
              t.settings.diagnostics.columns.span,
              t.settings.diagnostics.columns.cause,
              t.settings.diagnostics.columns.duration,
              t.settings.diagnostics.columns.ended,
            ]}
          >
            {data.latestFailures.map((failure) => (
              <tr key={`${failure.traceId}:${failure.spanId}`}>
                <td className="px-4 py-3 align-top text-secondary-copy font-medium text-foreground first:sm:pl-5">
                  {failure.name}
                </td>
                <td className="max-w-[360px] px-4 py-3 align-top text-muted-foreground">
                  <ExpandableText text={failure.cause} />
                </td>
                <td className="px-4 py-3 align-top font-mono tabular-nums">
                  {formatDuration(failure.durationMs)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 align-top font-mono tabular-nums text-muted-foreground last:sm:pr-5">
                  <RelativeTimeNoWrap value={failure.endedAt} />
                </td>
              </tr>
            ))}
          </DiagnosticsTable>
        ) : (
          <EmptyRows
            label={
              isInitialLoading
                ? t.settings.diagnostics.traces.loadingFailures
                : t.settings.diagnostics.traces.noFailures
            }
          />
        )}
      </SettingsSection>

      <SettingsSection title={t.settings.diagnostics.traces.commonFailures}>
        {data && data.commonFailures.length > 0 ? (
          <DiagnosticsTable
            headers={[
              t.settings.diagnostics.columns.span,
              t.settings.diagnostics.columns.count,
              t.settings.diagnostics.columns.cause,
              t.settings.diagnostics.columns.lastSeen,
            ]}
            minTableWidth="min-w-[760px]"
          >
            {data.commonFailures.map((failure) => (
              <tr key={`${failure.name}:${failure.cause}`}>
                <td className="px-4 py-3 align-top text-secondary-copy font-medium text-foreground first:sm:pl-5">
                  {failure.name}
                </td>
                <td className="px-4 py-3 align-top font-mono tabular-nums">
                  {formatCount(failure.count)}
                </td>
                <td className="max-w-[360px] px-4 py-3 align-top text-muted-foreground">
                  <ExpandableText text={failure.cause} />
                </td>
                <td className="w-px whitespace-nowrap px-4 py-3 align-top font-mono tabular-nums text-muted-foreground last:sm:pr-5">
                  <RelativeTimeNoWrap value={failure.lastSeenAt} />
                </td>
              </tr>
            ))}
          </DiagnosticsTable>
        ) : (
          <EmptyRows
            label={
              isInitialLoading
                ? t.settings.diagnostics.traces.loadingGroups
                : t.settings.diagnostics.traces.noGroups
            }
          />
        )}
      </SettingsSection>

      <SettingsSection title={t.settings.diagnostics.traces.slowestSpans}>
        {data && data.slowestSpans.length > 0 ? (
          <DiagnosticsTable
            headers={[
              t.settings.diagnostics.columns.span,
              t.settings.diagnostics.columns.duration,
              t.settings.diagnostics.columns.ended,
              t.settings.diagnostics.columns.trace,
            ]}
            minTableWidth="min-w-[900px]"
            columnWidths={["w-[44%]", "w-[14%]", "w-[12%]", "w-[30%]"]}
          >
            {data.slowestSpans.map((span) => (
              <tr key={`${span.traceId}:${span.spanId}`}>
                <td className="px-4 py-3 align-top text-secondary-copy font-medium text-foreground first:sm:pl-5">
                  {span.name}
                </td>
                <td className="px-4 py-3 align-top font-mono tabular-nums">
                  {formatDuration(span.durationMs)}
                </td>
                <td className="w-px whitespace-nowrap px-4 py-3 align-top font-mono tabular-nums text-muted-foreground">
                  <RelativeTimeNoWrap value={span.endedAt} />
                </td>
                <td className="min-w-0 whitespace-nowrap px-4 py-3 align-top text-muted-foreground last:sm:pr-5">
                  <TraceIdCell traceId={span.traceId} />
                </td>
              </tr>
            ))}
          </DiagnosticsTable>
        ) : (
          <EmptyRows
            label={
              isInitialLoading
                ? t.settings.diagnostics.traces.loadingSpans
                : t.settings.diagnostics.traces.noSpans
            }
          />
        )}
      </SettingsSection>

      <SettingsSection title={t.settings.diagnostics.traces.logs}>
        {data && data.latestWarningAndErrorLogs.length > 0 ? (
          <ScrollArea
            radius="none"
            chainVerticalScroll
            scrollFade
            hideScrollbars
            className="w-full max-w-full"
          >
            <table className="w-full min-w-[920px] table-fixed text-left text-secondary-copy">
              <colgroup>
                <col className="w-[11%]" />
                <col className="w-[9%]" />
                <col className="w-[24%]" />
                <col className="w-[26%]" />
                <col className="w-[30%]" />
              </colgroup>
              <thead className="border-b border-settings-divider text-meta-large tracking-normal text-muted-foreground">
                <tr>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold sm:pl-5">
                    {t.settings.diagnostics.columns.time}
                  </th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">
                    {t.settings.diagnostics.columns.level}
                  </th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">
                    {t.settings.diagnostics.columns.span}
                  </th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">
                    {t.settings.diagnostics.columns.message}
                  </th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold sm:pr-5">
                    {t.settings.diagnostics.columns.trace}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-settings-divider">
                {data.latestWarningAndErrorLogs.map((event) => (
                  <tr
                    key={`${event.traceId}:${event.spanId}:${DateTime.formatIso(event.seenAt)}:${event.message}`}
                    className="hover:bg-muted/15"
                  >
                    <td className="whitespace-nowrap px-4 py-3 align-top font-mono tabular-nums text-muted-foreground sm:pl-5">
                      <RelativeTimeNoWrap value={event.seenAt} />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className="inline-flex rounded bg-muted px-1.5 py-0.5 font-mono text-meta-large font-medium text-foreground/80">
                        {event.level}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="truncate font-medium text-foreground">{event.spanName}</div>
                    </td>
                    <td className="px-4 py-3 align-top text-muted-foreground">
                      <ExpandableText
                        collapsedClassName="line-clamp-2"
                        expandLabel={t.settings.diagnostics.traces.showMessage}
                        text={event.message}
                      />
                    </td>
                    <td className="min-w-0 whitespace-nowrap px-4 py-3 align-top text-muted-foreground sm:pr-5">
                      <TraceIdCell traceId={event.traceId} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
        ) : (
          <EmptyRows
            label={
              isInitialLoading
                ? t.settings.diagnostics.traces.loadingLogs
                : t.settings.diagnostics.traces.noLogs
            }
          />
        )}
      </SettingsSection>

      <SettingsSection title={t.settings.diagnostics.traces.topNames}>
        {data && data.topSpansByCount.length > 0 ? (
          <DiagnosticsTable
            headers={[
              t.settings.diagnostics.columns.span,
              t.settings.diagnostics.columns.count,
              t.settings.diagnostics.traces.failures,
              t.settings.diagnostics.columns.average,
              t.settings.diagnostics.columns.max,
            ]}
            minTableWidth="min-w-[760px]"
            columnWidths={["w-[48%]", "w-[13%]", "w-[13%]", "w-[13%]", "w-[13%]"]}
          >
            {data.topSpansByCount.map((span) => (
              <tr key={span.name}>
                <td className="px-4 py-3 align-top text-secondary-copy font-medium text-foreground first:sm:pl-5">
                  {span.name}
                </td>
                <td className="whitespace-nowrap px-4 py-3 align-top font-mono tabular-nums">
                  {formatCount(span.count)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 align-top font-mono tabular-nums">
                  {formatCount(span.failureCount)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 align-top font-mono tabular-nums">
                  {formatDuration(span.averageDurationMs)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 align-top font-mono tabular-nums last:sm:pr-5">
                  {formatDuration(span.maxDurationMs)}
                </td>
              </tr>
            ))}
          </DiagnosticsTable>
        ) : (
          <EmptyRows
            label={
              isInitialLoading
                ? t.settings.diagnostics.traces.loadingNames
                : t.settings.diagnostics.traces.noSpans
            }
          />
        )}
      </SettingsSection>
      {exportFormEnvironmentId === environmentId && <TelemetryExportSettings />}
    </SettingsPageContainer>
  );
}
