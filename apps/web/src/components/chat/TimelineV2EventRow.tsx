/** Renders orchestration events and subagent disclosures in the timeline. */
import { ChevronRightIcon } from "lucide-react";
import { PixelIcon } from "../icons/PixelIcon";
import { WorkLogButton } from "./WorkLog";
import { t } from "~/i18n";
import { WorkLogBlock } from "./WorkLog";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { useAtomValue } from "@effect/atom-react";
import { environmentThreadDetails } from "../../state/threads";
import {
  subagentGroupSummary,
  summarizeSubagentStatuses,
} from "@t3tools/client-runtime/state/subagent-display";
import { memo, use, useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import ChatMarkdown from "../ChatMarkdown";
import { V2ItemInspector } from "./V2ItemInspector";
import { cn } from "~/lib/utils";
import { Collapsible, CollapsibleTrigger, CollapsiblePanel } from "../ui/collapsible";
import { isV2LifecycleItem, SubagentElapsed, V2LifecycleRow } from "./V2LifecycleRow";
import { SecretRequestCard } from "./SecretRequestCard";
import { TimelineRowCtx, type TimelineRow } from "./timelineRowContext";
import { v2EventPresentation, subagentGroupTiming } from "./TimelineV2EventRow.logic";

/**
 * Renders an orchestration event with its timestamp and supported lifecycle details.
 * @param props - Required event row; requires TimelineRowCtx for formatting and host actions.
 * @returns The event timeline element; never null.
 */
export function V2EventTimelineRow({ row }: { row: Extract<TimelineRow, { kind: "event" }> }) {
  const ctx = use(TimelineRowCtx);
  const { item, visibility, sourceThreadId } = row.projectedItem;
  if (item.type === "subagent" && (row.subagents?.length ?? 1) > 1) {
    return <V2SubagentGroup key={row.id} row={row} />;
  }
  if (item.type === "secret_request") {
    return (
      <SecretRequestCard
        environmentId={ctx.activeThreadEnvironmentId}
        item={item}
        visibility={visibility}
      />
    );
  }
  if (item.type === "link_request") return null;
  if (isV2LifecycleItem(item)) {
    return (
      <V2LifecycleRow
        environmentId={ctx.activeThreadEnvironmentId}
        item={item}
        resourceSummary={row.resourceSummary}
        runs={ctx.runs}
        onOpenThread={ctx.onOpenThread}
      />
    );
  }
  const presentation = v2EventPresentation(item);
  const Icon = presentation.icon;
  if (item.type === "error") {
    return (
      <details
        className={cn(
          "group rounded-md border",
          presentation.tone === "warning" && "border-warning/25 bg-warning/5",
          presentation.tone === "danger" && "border-destructive/25 bg-destructive/5",
          presentation.tone === "success" && "border-success/20 bg-success/5",
        )}
        data-timeline-card-tone={presentation.tone}
        data-v2-item-type={item.type}
        data-v2-item-visibility={visibility}
        data-v2-event-disclosure="true"
      >
        <summary className="flex min-w-0 cursor-pointer list-none items-center gap-2 px-2.5 py-1.5 text-xs [&::-webkit-details-marker]:hidden">
          <Icon
            className={cn(
              "size-3.5 shrink-0",
              presentation.tone === "warning" && "text-warning",
              presentation.tone === "danger" && "text-destructive",
              presentation.tone === "success" && "text-success",
            )}
          />
          <span className="shrink-0 font-medium text-foreground/90">{presentation.label}</span>
          {item.status !== "completed" ? (
            <span
              className={cn(
                "shrink-0 rounded-full border px-1.5 py-0.5 font-mono text-3xs",
                item.status === "failed"
                  ? "border-destructive/40 text-destructive"
                  : "border-border/70 text-muted-foreground",
              )}
            >
              {item.status}
            </span>
          ) : null}
          {presentation.detail ? (
            <span className="min-w-0 flex-1 truncate text-muted-foreground/65">
              {presentation.detail}
            </span>
          ) : null}
          {visibility !== "local" ? (
            <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-3xs text-muted-foreground">
              {visibility === "inherited" ? t.chat.timeline.inherited : t.chat.timeline.synthetic}
            </span>
          ) : null}
          <ChevronDownIcon className="size-3 shrink-0 text-muted-foreground/60 transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-border/45 px-3 py-2 ps-8">
          {presentation.detail ? (
            <div className="text-xs leading-relaxed text-muted-foreground">
              <ChatMarkdown
                text={presentation.detail}
                cwd={ctx.markdownCwd}
                threadRef={ctx.threadRef ?? undefined}
                skills={ctx.skills}
                lineBreaks
              />
            </div>
          ) : null}
          {visibility === "inherited" ? (
            <p className="mt-1 font-mono text-3xs text-muted-foreground/65">
              {t.chat.timeline.fromThread(sourceThreadId)}
            </p>
          ) : null}
          <div className={presentation.detail ? "mt-2" : undefined}>
            <V2ItemInspector
              presentation="timeline"
              projectedItem={row.projectedItem}
              environmentId={ctx.activeThreadEnvironmentId}
              cwd={ctx.markdownCwd}
              workspaceRoot={ctx.workspaceRoot}
              onOpenToolDiff={ctx.onOpenToolDiff}
              source={ctx.turnItemSource}
              onImageExpand={ctx.onImageExpand}
            />
          </div>
        </div>
      </details>
    );
  }
  return (
    <section
      className={cn(
        "rounded-lg border px-3 py-2",
        presentation.tone === "warning" && "border-warning/25 bg-warning/5",
        presentation.tone === "danger" && "border-destructive/25 bg-destructive/5",
        presentation.tone === "success" && "border-success/20 bg-success/5",
        presentation.tone === "muted" && "border-border/60 bg-card/30",
      )}
      data-timeline-card-tone={presentation.tone}
      data-v2-item-type={item.type}
      data-v2-item-visibility={visibility}
    >
      <div className="flex items-start gap-2.5">
        <Icon
          className={cn(
            "mt-0.5 size-3.5 shrink-0",
            presentation.tone === "warning" && "text-warning",
            presentation.tone === "danger" && "text-destructive",
            presentation.tone === "success" && "text-success",
            presentation.tone === "muted" && "text-muted-foreground",
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-xs font-medium text-foreground/90">{presentation.label}</span>
            {item.status !== "completed" ? (
              <span
                className={cn(
                  "rounded-full border px-1.5 py-0.5 font-mono text-3xs",
                  item.status === "failed"
                    ? "border-destructive/40 text-destructive"
                    : "border-border/70 text-muted-foreground",
                )}
              >
                {item.status}
              </span>
            ) : null}
            {visibility !== "local" ? (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-3xs text-muted-foreground">
                {visibility === "inherited" ? t.chat.timeline.inherited : t.chat.timeline.synthetic}
              </span>
            ) : null}
          </div>
          {presentation.detail ? (
            <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
              <ChatMarkdown
                text={presentation.detail}
                cwd={ctx.markdownCwd}
                threadRef={ctx.threadRef ?? undefined}
                skills={ctx.skills}
                lineBreaks
              />
            </div>
          ) : null}
          {visibility === "inherited" ? (
            <p className="mt-1 font-mono text-3xs text-muted-foreground/65">
              {t.chat.timeline.fromThread(sourceThreadId)}
            </p>
          ) : null}
          <div className="mt-2">
            <V2ItemInspector
              presentation="timeline"
              projectedItem={row.projectedItem}
              environmentId={ctx.activeThreadEnvironmentId}
              cwd={ctx.markdownCwd}
              workspaceRoot={ctx.workspaceRoot}
              onOpenToolDiff={ctx.onOpenToolDiff}
              source={ctx.turnItemSource}
              onImageExpand={ctx.onImageExpand}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

const V2SubagentGroup = memo(function V2SubagentGroup({
  row,
}: {
  row: Extract<TimelineRow, { kind: "event" }>;
}) {
  const ctx = use(TimelineRowCtx);
  const groupId = `subagent-group:${row.id}`;
  const [expanded, setExpanded] = useState(() =>
    ctx.workGroupViewState.expandedEntries.has(groupId),
  );
  const members = (row.subagents ?? [row.projectedItem]).flatMap(({ item }) =>
    item.type === "subagent" ? [item] : [],
  );
  const liveAgents = useAtomValue(
    environmentThreadDetails.threadAtom(
      scopeThreadRef(ctx.activeThreadEnvironmentId, row.projectedItem.item.threadId),
    ),
    (thread) => thread?.projection.subagents,
  );
  const agents = members.map((item) => {
    const live = liveAgents?.find((agent) => agent.id === item.subagentId);
    return {
      item,
      status: live?.status ?? item.status,
      startedAt: live?.startedAt ?? item.startedAt,
      completedAt: live?.completedAt ?? item.completedAt,
    };
  });
  const summary = subagentGroupSummary(agents);
  const label = t.chat.workLog.subagentCount(members.length);
  const statusSummary = summarizeSubagentStatuses(
    agents.map(({ status }) => status),
    t.chat.workLog.shared.subagentStatuses,
  );
  const toggleExpanded = (open: boolean) => {
    ctx.onToggleWorkEntry(row.id, expanded);
    if (open) ctx.workGroupViewState.expandedEntries.add(groupId);
    else ctx.workGroupViewState.expandedEntries.delete(groupId);
    setExpanded(open);
  };
  return (
    <WorkLogBlock continues={row.continuesWorkLog}>
      <Collapsible open={expanded} onOpenChange={toggleExpanded} data-subagent-group>
        {/* pr-3.25 matches the panel border, padding, and row inset so the times line up. */}
        <CollapsibleTrigger
          aria-label={label}
          aria-description={statusSummary}
          render={
            <WorkLogButton
              disclosure={
                <ChevronRightIcon
                  aria-hidden
                  className={cn(
                    "size-3.25 shrink-0 text-muted-foreground",
                    expanded && "rotate-90",
                  )}
                />
              }
              icon={<PixelIcon name="subagent" size={14} />}
              label={
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate">{label}</span>
                  <span aria-hidden className="text-placeholder">
                    ·
                  </span>
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-muted-foreground",
                      summary.failed && "text-error",
                    )}
                  >
                    {statusSummary}
                  </span>
                </span>
              }
              trailing={
                <span className="shrink-0 text-secondary-copy text-muted-foreground tabular-nums">
                  <SubagentElapsed agent={subagentGroupTiming(agents)} />
                </span>
              }
            />
          }
        />
        {/* Virtualized rows must settle before disclosure scroll anchoring resumes. */}
        <CollapsiblePanel animate={false}>
          {expanded ? (
            <div className="ms-8.5 me-1.5 flex flex-col gap-0.5">
              {members.map((item) => (
                <V2LifecycleRow
                  environmentId={ctx.activeThreadEnvironmentId}
                  key={item.id}
                  item={item}
                  runs={ctx.runs}
                />
              ))}
            </div>
          ) : null}
        </CollapsiblePanel>
      </Collapsible>
    </WorkLogBlock>
  );
});
