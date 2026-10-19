/** Renders subagent metadata and state labels without changing provider status or workspace identifiers. */
import { t } from "~/i18n";
import type {
  OrchestrationV2ThreadShell,
  OrchestrationV2TurnItemStatus,
  OrchestrationProjectShell,
  ServerProvider,
  ProviderDriverKind,
  ProviderInstanceId,
  OrchestrationV2Subagent,
} from "@t3tools/contracts";
import {
  resolveSubagentMetadata,
  subagentDetailPreview,
} from "@t3tools/client-runtime/state/subagent-display";
import { isTerminalSubagentStatus } from "@t3tools/client-runtime/state/subagentRuntime";
import { TraitsSpeedIcon } from "./TraitsSpeed";
import type { ReactNode } from "react";
import { MiddleTruncate } from "../ui/middle-truncate";
import { cn } from "~/lib/utils";
import { resolveSubagentModelSummary, SubagentStatusLabel } from "./SubagentPresentation";

/** Names a workspace difference reported by resolveSubagentMetadata. */
function workspaceLabel(label: string): string {
  switch (label) {
    case "Branch":
      return t.common.threadActions.branch;
    case "Worktree":
      return t.app.subagent.worktree;
    case "Project":
      return t.app.subagent.project;
    default:
      return t.app.subagent.workspace;
  }
}

/** Geometry and preview limits stay identical in lineage and timeline tooltips. */
export function SubagentTooltipContent(props: {
  title: string;
  model: string | null;
  providerInstanceId: ProviderInstanceId;
  origin: OrchestrationV2Subagent["origin"];
  modelSelection?: OrchestrationV2Subagent["modelSelection"];
  provider?: ServerProvider | undefined;
  /** The environment's instances; with several accounts on one provider, the card names this one. */
  providers?: ReadonlyArray<ServerProvider> | undefined;
  driver?: ProviderDriverKind | undefined;
  elapsed?: ReactNode;
  parentThread?: Pick<OrchestrationV2ThreadShell, "projectId" | "worktreePath"> | undefined;
  childThread?:
    | Pick<OrchestrationV2ThreadShell, "branch" | "worktreePath" | "modelSelection">
    | undefined;
  parentProject?: Pick<OrchestrationProjectShell, "workspaceRoot"> | undefined;
  childProject?: Pick<OrchestrationProjectShell, "id" | "title" | "workspaceRoot"> | undefined;
  status: OrchestrationV2TurnItemStatus;
  result?: string | null | undefined;
  progress?: string | null | undefined;
  /** The trigger opens the child's chat on click, so the card says so. */
  opensThread?: boolean | undefined;
}) {
  // Unlike the row, the card keeps the model line when none was reported and says so.
  const { modelLabel, workspace } = resolveSubagentMetadata(props);
  const summary = resolveSubagentModelSummary(props);
  const preview = subagentDetailPreview(props);
  const settled = isTerminalSubagentStatus(props.status);
  const provider = props.provider;
  return (
    <div className="flex w-72 min-w-0 flex-col gap-3 px-1 py-1.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          {props.title}
        </span>
        <SubagentStatusLabel status={props.status} />
      </div>
      <dl className="m-0 grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
        <dt className="text-muted-foreground">{t.app.subagent.model}</dt>
        <dd className="m-0 flex min-w-0 items-center gap-1 font-mono text-foreground">
          <span className="min-w-0 truncate">
            {summary.instanceName ? `${modelLabel} · ${summary.instanceName}` : modelLabel}
          </span>
          {summary.effort || summary.speed?.speedIcon ? (
            <span className="inline-flex shrink-0 items-center gap-1">
              {summary.effort ? " · " : null}
              {summary.speed?.speedIcon && provider ? (
                <TraitsSpeedIcon
                  provider={provider.driver}
                  speedIcon={summary.speed.speedIcon}
                  size="xs"
                />
              ) : null}
              {summary.effort}
            </span>
          ) : null}
        </dd>
        {props.elapsed ? (
          <>
            <dt className="text-muted-foreground">{t.app.subagent.elapsed}</dt>
            <dd className="m-0 font-mono text-foreground tabular-nums">{props.elapsed}</dd>
          </>
        ) : null}
        {workspace.map(({ label, value }) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{workspaceLabel(label)}</dt>
            <dd className="m-0 min-w-0 text-foreground">
              <MiddleTruncate value={value} className="flex" showTitle={false} />
            </dd>
          </div>
        ))}
      </dl>
      {preview ? (
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-meta-large text-muted-foreground">
            {settled ? t.app.subagent.result : t.app.subagent.currentActivity}
          </span>
          <p
            className={cn(
              "m-0 line-clamp-4 rounded-lg bg-input px-2.5 py-2 text-xs leading-relaxed break-all",
              settled ? "font-sans" : "font-mono",
              props.status === "failed" ? "text-error" : "text-code-foreground",
            )}
          >
            {preview}
          </p>
        </div>
      ) : null}
      {props.opensThread ? (
        <span className="border-t border-border/60 pt-2.5 text-meta-large text-muted-foreground">
          {t.app.subagent.openHint}
        </span>
      ) : null}
    </div>
  );
}
