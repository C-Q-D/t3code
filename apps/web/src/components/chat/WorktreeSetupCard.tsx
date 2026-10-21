/** Displays worktree preparation progress and its existing controls. */
import { t } from "~/i18n";
import {
  worktreeSetupStageLabel,
  type WorktreeSetupSnapshot,
  type WorktreeSetupStage,
} from "@t3tools/contracts";
import { formatDuration } from "@t3tools/shared/orchestrationTiming";
import {
  CheckIcon,
  CircleAlertIcon,
  CircleIcon,
  CircleCheckIcon,
  CircleSlashIcon,
  CircleXIcon,
  FolderGit2Icon,
  HourglassIcon,
  LaptopIcon,
  MinusIcon,
  TerminalIcon,
  XIcon,
} from "lucide-react";
import { ChevronDown, ChevronRight } from "lucide";
import { useEffect, useState } from "react";

import { Button } from "~/components/ui/button";
import { MorphIcon } from "~/components/MorphIcon";
import { Spinner } from "~/components/ui/spinner";
import { MiddleTruncate } from "../ui/middle-truncate";
import { cn } from "~/lib/utils";
import { WorkLogRow } from "./WorkLog";
import { worktreeSetupPresentation } from "./WorktreeSetupCard.logic";

/** Host-owned setup snapshot and actions; null callbacks remain unavailable. */
interface WorktreeSetupCardProps {
  snapshot: WorktreeSetupSnapshot;
  onCancel: (() => void) | null;
  onWorkLocally: (() => void) | null;
  onOpenTerminal: (() => void) | null;
}

/** Returns elapsed stage milliseconds, or null when timestamps are absent or invalid. */
function stageElapsedMs(stage: WorktreeSetupStage, nowMs: number): number | null {
  if (!stage.startedAt) return null;
  const start = Date.parse(stage.startedAt);
  const end = stage.endedAt ? Date.parse(stage.endedAt) : nowMs;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, end - start);
}

function useNowWhile(active: boolean): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [active]);
  return nowMs;
}

/** Displays the server stage status without changing stage progression. */
function StageIcon({ status }: { status: WorktreeSetupStage["status"] }) {
  const className = "size-4 shrink-0 stroke-2";
  switch (status) {
    case "done":
      return <CheckIcon aria-hidden className={className} />;
    case "running":
      return <Spinner size="md" className="shrink-0" />;
    case "failed":
      return <XIcon aria-hidden className={className} />;
    case "warning":
      return <CircleAlertIcon aria-hidden className={className} />;
    case "skipped":
      return <MinusIcon aria-hidden className={className} />;
    case "pending":
      return <CircleIcon aria-hidden className={className} />;
  }
}

/** Maps server outcomes to their existing semantic text tones. */
function stageRowClassName(status: WorktreeSetupStage["status"]): string {
  switch (status) {
    case "failed":
      return "text-error-foreground";
    case "warning":
      return "text-warning-foreground";
    case "pending":
      return "text-secondary-label opacity-40";
    case "running":
    case "skipped":
    case "done":
      return "text-secondary-label";
  }
}

/**
 * Selects the worktree setup heading for its phase and stage outcomes.
 * @param snapshot - Required setup snapshot; stages may be empty.
 * @returns The localized setup heading for the snapshot phase; never null or empty.
 */
function headerLabel(snapshot: WorktreeSetupSnapshot): string {
  return t.chat.worktreeSetup[worktreeSetupPresentation(snapshot, false, false).headingKey];
}

/**
 * Displays T4's ready heading or compact phase capsule, keeping elapsed time available.
 */
function SetupHeaderRow({
  snapshot,
  totalElapsed,
  onCancel,
}: {
  snapshot: WorktreeSetupSnapshot;
  totalElapsed: number | null;
  onCancel: (() => void) | null;
}) {
  const text = headerLabel(snapshot);
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="timeline-setup-heading flex min-w-0 items-center gap-1.5">
        <FolderGit2Icon aria-hidden className="timeline-setup-ready-icon size-4 shrink-0" />
        <HourglassIcon aria-hidden className="timeline-setup-running-icon size-3 shrink-0" />
        <CircleXIcon aria-hidden className="timeline-setup-failed-icon size-3 shrink-0" />
        <CircleSlashIcon aria-hidden className="timeline-setup-cancelled-icon size-3 shrink-0" />
        <span className="min-w-0 truncate">{text}</span>
        {onCancel && snapshot.phase === "running" ? (
          <Button type="button" size="micro" variant="secondary" onClick={onCancel}>
            {t.chat.worktreeSetup.cancel}
          </Button>
        ) : null}
        <CircleCheckIcon
          aria-hidden
          className="timeline-setup-ready-icon ml-auto size-3.75 shrink-0"
        />
      </div>
      {totalElapsed !== null ? (
        <span className="ml-auto shrink-0 text-secondary-copy text-secondary-label tabular-nums">
          {formatDuration(totalElapsed)}
        </span>
      ) : null}
    </div>
  );
}

function StageRow({
  stage,
  nowMs,
  scriptName,
}: {
  stage: WorktreeSetupStage;
  nowMs: number;
  scriptName: string | null;
}) {
  const elapsed = stageElapsedMs(stage, nowMs);
  const label =
    stage.id === "setup-script" && scriptName ? scriptName : worktreeSetupStageLabel(stage.id);
  const running = stage.status === "running";
  const trailing =
    stage.status === "pending"
      ? null
      : stage.status === "skipped"
        ? (stage.detail ?? "skipped")
        : stage.id === "checkout" && running && stage.percent !== null
          ? `${stage.percent}%`
          : stage.detail;
  return (
    <WorkLogRow
      data-worktree-setup-stage={stage.id}
      data-worktree-setup-status={stage.status}
      icon={
        <span className={cn("text-icon-muted", stage.status === "pending" && "opacity-40")}>
          <StageIcon status={stage.status} />
        </span>
      }
      label={<span className={cn("block truncate", stageRowClassName(stage.status))}>{label}</span>}
      trailing={
        <>
          {trailing ? (
            <span className="min-w-0 truncate text-xs text-muted-foreground tabular-nums">
              {trailing}
            </span>
          ) : null}
          {elapsed !== null && stage.status !== "skipped" && stage.status !== "pending" ? (
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {formatDuration(elapsed)}
            </span>
          ) : null}
        </>
      }
    />
  );
}

const OUTPUT_TAIL_LINES = 4;
const OUTPUT_TAIL_SLOTS = Array.from({ length: OUTPUT_TAIL_LINES }, (_, slot) => slot);

function OutputTail({ lines, failed }: { lines: ReadonlyArray<string>; failed: boolean }) {
  const rows = OUTPUT_TAIL_SLOTS.map((slot) => ({
    slot,
    line: lines[lines.length - OUTPUT_TAIL_LINES + slot] ?? "",
  }));
  return (
    <pre
      className={cn(
        "mb-1 ml-8 overflow-hidden rounded-compact-row px-2.5 py-1.5 font-mono text-secondary-copy leading-relaxed select-text",
        failed
          ? "bg-error-surface text-error-foreground"
          : "bg-code text-secondary-label shadow-well-compact",
      )}
    >
      {rows.map(({ slot, line }) => (
        <div key={slot} className="truncate whitespace-pre">
          {line.length === 0 ? "\u00a0" : line}
        </div>
      ))}
    </pre>
  );
}

/**
 * Renders available branch, base reference, path, and script metadata for worktree setup.
 * @param props - Required snapshot; missing or empty metadata omits the corresponding detail row.
 * @returns The detail list, which may contain no rows; never null.
 */
function SetupDetails({ snapshot }: { snapshot: WorktreeSetupSnapshot }) {
  return (
    <dl className="timeline-setup-details grid gap-x-2.5 gap-y-1 text-secondary-copy-medium text-secondary-label">
      {snapshot.branch ? (
        <>
          <dt className="text-foreground/80">{t.chat.worktreeSetup.branch}</dt>
          <dd className="min-w-0 font-mono">
            <MiddleTruncate value={snapshot.branch} className="flex" />
          </dd>
        </>
      ) : null}
      {snapshot.baseRef ? (
        <>
          <dt className="text-foreground/80">{t.chat.worktreeSetup.base}</dt>
          <dd className="min-w-0 font-mono">
            <MiddleTruncate value={snapshot.baseRef} className="flex" />
          </dd>
        </>
      ) : null}
      {snapshot.worktreePath ? (
        <>
          <dt className="text-foreground/80">{t.chat.worktreeSetup.path}</dt>
          <dd className="min-w-0 font-mono">
            <MiddleTruncate value={snapshot.worktreePath} className="flex" />
          </dd>
        </>
      ) : null}
      {snapshot.setupScript ? (
        <>
          <dt className="text-foreground/80">{t.chat.worktreeSetup.setup}</dt>
          <dd className="truncate font-mono">{snapshot.setupScript.command}</dd>
        </>
      ) : null}
    </dl>
  );
}

function CollapsedSummaryRow({
  snapshot,
  totalElapsed,
}: {
  snapshot: WorktreeSetupSnapshot;
  totalElapsed: number | null;
}) {
  const status: WorktreeSetupStage["status"] =
    snapshot.phase === "failed" || snapshot.phase === "cancelled"
      ? "failed"
      : snapshot.stages.some((stage) => stage.id === "setup-script" && stage.status === "failed")
        ? "failed"
        : "done";
  const label = headerLabel(snapshot);
  return (
    <WorkLogRow
      data-worktree-setup-stage="summary"
      data-worktree-setup-status={status}
      icon={
        <span className="text-icon-muted">
          <StageIcon status={status} />
        </span>
      }
      label={<span className={stageRowClassName(status)}>{label}</span>}
      trailing={
        totalElapsed !== null ? (
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {formatDuration(totalElapsed)}
          </span>
        ) : null
      }
    />
  );
}

/**
 * Renders worktree bootstrap stages, script output, and available recovery controls.
 * @param props - Required snapshot; onCancel, onWorkLocally, and onOpenTerminal may each be null to
 * hide unavailable actions. Optional embedded defaults to false and lets the live turn own the
 * header.
 * @returns The setup card with expanded or collapsed stage presentation; never null. User actions
 * call the supplied host callbacks.
 */
export function WorktreeSetupCard({
  snapshot,
  onCancel,
  onWorkLocally,
  onOpenTerminal,
  embedded = false,
}: WorktreeSetupCardProps & {
  embedded?: boolean;
}) {
  const running = snapshot.phase === "running";
  const nowMs = useNowWhile(running);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const totalElapsed = (() => {
    const start = Date.parse(snapshot.startedAt);
    const end = snapshot.endedAt ? Date.parse(snapshot.endedAt) : nowMs;
    return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : null;
  })();
  const { showTerminal, collapsed, showTail } = worktreeSetupPresentation(
    snapshot,
    embedded,
    onOpenTerminal !== null,
  );
  return (
    <section
      aria-label={t.chat.worktreeSetup.worktreeSetup}
      data-worktree-setup-phase={snapshot.phase}
      className={cn(
        "timeline-setup flex min-w-0 flex-col gap-2.5 text-secondary-copy-large text-foreground",
        snapshot.phase === "done" && "surface-glass",
      )}
    >
      {collapsed ? (
        <CollapsedSummaryRow snapshot={snapshot} totalElapsed={totalElapsed} />
      ) : (
        <>
          <SetupHeaderRow snapshot={snapshot} totalElapsed={totalElapsed} onCancel={onCancel} />
          <div>
            {snapshot.stages.map((stage) => (
              <div key={stage.id}>
                <StageRow
                  stage={stage}
                  nowMs={nowMs}
                  scriptName={snapshot.setupScript?.name ?? null}
                />
                {stage.id === "setup-script" && showTail ? (
                  <OutputTail lines={stage.tail} failed={stage.status === "failed"} />
                ) : null}
              </div>
            ))}
          </div>
        </>
      )}

      {snapshot.phase === "failed" && snapshot.error ? (
        <p role="alert" className="text-secondary-copy text-error-foreground">
          {snapshot.error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        {showTerminal && onOpenTerminal ? (
          <Button type="button" size="md" variant="secondary" onClick={onOpenTerminal}>
            <TerminalIcon aria-hidden />
            {t.chat.worktreeSetup.openTerminal}
          </Button>
        ) : null}
        {onWorkLocally ? (
          <Button type="button" size="md" variant="outline" onClick={onWorkLocally}>
            <LaptopIcon aria-hidden />
            {t.chat.worktreeSetup.workLocally}
          </Button>
        ) : null}
        <Button
          type="button"
          size="md"
          variant="ghost-muted"
          aria-expanded={detailsOpen}
          onClick={() => setDetailsOpen((open) => !open)}
        >
          <MorphIcon aria-hidden icon={detailsOpen ? ChevronDown : ChevronRight} />
          {t.chat.worktreeSetup.details}
        </Button>
      </div>
      {detailsOpen ? <SetupDetails snapshot={snapshot} /> : null}
    </section>
  );
}
