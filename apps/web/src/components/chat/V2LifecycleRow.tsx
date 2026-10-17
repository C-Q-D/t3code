/** Displays orchestration lifecycle rows without changing lifecycle payloads. */
import { t } from "~/i18n";
import { ThreadHoverCardPopup } from "../ThreadHoverCard";
import { AgentElapsed } from "./AgentElapsed";
import { projectedSubagentsToRuntime } from "@t3tools/client-runtime/state/subagentRuntime";
import type { ReactNode } from "react";
import { useThreadShell, useProject } from "../../state/entities";
import { SubagentTooltipContent } from "./SubagentTooltipContent";
import { useAtomValue } from "@effect/atom-react";
import { scopeThreadRef, scopeProjectRef } from "@t3tools/client-runtime/environment";
import { environmentThreadDetails } from "../../state/threads";
import { MiddleTruncate } from "../ui/middle-truncate";
import * as DateTime from "effect/DateTime";
import { WorkLogRow } from "./WorkLog";
import {
  resolveHandoffEndpoints,
  type HandoffEndpoints,
  type HandoffTimelineRun,
} from "@t3tools/client-runtime/handoff";
import { Fragment } from "react";
import { formatSubagentDisplayTitle } from "@t3tools/client-runtime/state/subagent-display";
import {
  ProviderDriverKind,
  type OrchestrationV2Notification,
  type OrchestrationV2TurnItem,
  type OrchestrationV2Subagent,
  type ProviderInstanceId,
  type ServerProvider,
  type ThreadId,
  type EnvironmentId,
  type NodeId,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import type { TimestampFormat } from "@t3tools/contracts/settings";
import {
  ArrowRightLeftIcon,
  ArrowRightIcon,
  GitForkIcon,
  MessageSquareIcon,
  CircleStopIcon,
  HandIcon,
  ShrinkIcon,
} from "lucide-react";

import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { getProviderInstanceEntry } from "../../providerInstances";
import { formatShortTimestamp } from "../../timestampFormat";
import { getTriggerDisplayModelName } from "./providerIconUtils";
import { ProviderInstanceIcon, providerTextColor } from "./ProviderInstanceIcon";
import { cn } from "~/lib/utils";
import { TimelineSystemDivider } from "./TimelineSystemDivider";
import { Button, InlineButton } from "../ui/button";
import { T3Wordmark } from "../T3Wordmark";
import { PixelIcon } from "../icons/PixelIcon";
import type { PixelIconName } from "../icons/pixelSprites";
import { getSubagentPixelIconName } from "../icons/subagentPixelIcon";

const LIFECYCLE_TYPES = new Set<OrchestrationV2TurnItem["type"]>([
  "run_interrupt_request",
  "run_interrupt_result",
  "compaction",
  "handoff",
  "fork",
  "subagent",
  "thread_created",
]);

export function isV2LifecycleItem(item: OrchestrationV2TurnItem): boolean {
  return LIFECYCLE_TYPES.has(item.type);
}

export type { HandoffTimelineRun } from "@t3tools/client-runtime/handoff";

/**
 * Renders supported lifecycle items such as interruptions, compaction, handoffs, and child tasks.
 * @param props - Required item, environmentId, createdAt timestamp, timestamp format,
 * providerStatuses/runs (possibly empty), and thread-opening callback. Optional resourceSummary
 * controls resource presentation.
 * @returns The lifecycle row, or null when the item has no supported lifecycle presentation.
 */
export function V2LifecycleRow(props: {
  readonly item: OrchestrationV2TurnItem;
  readonly environmentId: EnvironmentId;
  readonly resourceSummary?: boolean | undefined;
  readonly createdAt: string;
  readonly timestampFormat: TimestampFormat;
  readonly providerStatuses: ReadonlyArray<ServerProvider>;
  readonly runs: ReadonlyArray<HandoffTimelineRun>;
  readonly onOpenThread: (threadId: ThreadId) => void;
}) {
  const { item } = props;
  if (item.type === "run_interrupt_request") {
    return (
      <TimelineSystemDivider
        label={t.chat.timeline.interruptRequested}
        icon={HandIcon}
        detail={`${item.message} · ${formatShortTimestamp(props.createdAt, props.timestampFormat)}`}
      />
    );
  }
  if (item.type === "run_interrupt_result") {
    return (
      <TimelineSystemDivider
        label={t.chat.timeline.runInterrupted}
        detail={item.message}
        tone="interrupted"
        icon={CircleStopIcon}
      />
    );
  }
  if (item.type === "compaction") {
    const tokenDetail =
      item.beforeTokenCount === undefined && item.afterTokenCount === undefined
        ? null
        : t.chat.timeline.tokenChange(item.beforeTokenCount ?? "?", item.afterTokenCount ?? "?");
    const label =
      item.status === "failed"
        ? t.chat.timeline.contextCompactionFailed
        : item.status === "cancelled" || item.status === "interrupted"
          ? t.chat.timeline.contextCompactionStopped
          : item.status === "pending" || item.status === "running" || item.status === "waiting"
            ? t.chat.timeline.compactingContext
            : t.chat.timeline.contextCompacted;
    return (
      <TimelineSystemDivider
        label={label}
        detail={item.summary ?? tokenDetail}
        showDetailSeparator={false}
        icon={ShrinkIcon}
      />
    );
  }
  if (item.type === "handoff") {
    return (
      <HandoffRow
        endpoints={resolveHandoffEndpoints(item, props.runs)}
        providers={props.providerStatuses}
        failed={item.status === "failed"}
      />
    );
  }
  if (item.type === "fork") {
    const relatedThreadId = item.source.type === "run" ? item.source.threadId : item.targetThreadId;
    return (
      <TimelineSystemDivider
        label={
          item.source.type === "run"
            ? t.chat.timeline.forkedFromConversation
            : t.chat.timeline.conversationFork
        }
        icon={GitForkIcon}
        actionLabel={
          item.source.type === "run"
            ? t.chat.timeline.openSourceConversation
            : t.chat.timeline.openFork
        }
        onAction={() => props.onOpenThread(relatedThreadId)}
      />
    );
  }
  if (item.type === "thread_created") {
    if (props.resourceSummary) {
      return (
        <div
          data-v2-item-type={item.type}
          className="flex min-w-0 items-center gap-3 rounded-lg border border-border/60 p-3"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/60">
            <MessageSquareIcon className="size-4 text-secondary-label" aria-hidden />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {item.title ?? t.chat.timeline.createdThread}
          </span>
          <Button
            size="xs"
            variant="outline"
            aria-label={t.chat.timeline.open(item.title ?? t.chat.timeline.createdThreadLabel)}
            onClick={() => props.onOpenThread(item.targetThreadId)}
          >
            {t.chat.timeline.openChat}
          </Button>
        </div>
      );
    }
    return (
      <WorkLogRow
        data-v2-item-type={item.type}
        icon={<T3Wordmark className="size-4 text-icon-muted" aria-hidden />}
        label={
          <>
            {t.chat.timeline.createdThread}
            {item.title ? ` · ${item.title}` : ""}
          </>
        }
        trailing={
          <InlineButton
            aria-label={t.chat.timeline.open(item.title ?? t.chat.timeline.createdThreadLabel)}
            onClick={() => props.onOpenThread(item.targetThreadId)}
          >
            {t.chat.timeline.openChat}
          </InlineButton>
        }
      />
    );
  }
  if (item.type === "subagent") {
    return (
      <SubagentTimelineLink
        parentRef={scopeThreadRef(props.environmentId, item.threadId)}
        subagentId={item.subagentId}
        providerInstanceId={item.providerInstanceId}
        origin={item.origin}
        status={item.status}
        driver={item.driver}
        provider={props.providerStatuses.find(
          (provider) => provider.instanceId === item.providerInstanceId,
        )}
        providers={props.providerStatuses}
        title={formatSubagentDisplayTitle(item.title ?? t.chat.timeline.subagent)}
        result={item.result}
        progress={item.progress}
        startedAt={item.startedAt}
        completedAt={item.completedAt}
        threadId={item.childThreadId}
        onOpenThread={props.onOpenThread}
      />
    );
  }
  return null;
}

/**
 * In-flight states all present as Working, the way the agents fleet view did:
 * detail belongs in the activity line, and a waiting or queued subagent is
 * still the fleet doing its job. Only settled states differentiate. Idle reads
 * as settled rather than in progress, since a resting child looks done unless
 * resumed.
 */
const STATUS_VISUALS: Record<
  OrchestrationV2TurnItem["status"],
  { dotClass: string; label: string }
> = {
  pending: { dotClass: "bg-info", label: t.chat.timeline.queued },
  running: { dotClass: "bg-info", label: t.chat.timeline.running },
  waiting: { dotClass: "bg-info", label: t.chat.timeline.waiting },
  idle: { dotClass: "bg-muted-foreground/50", label: t.chat.timeline.idleResumable },
  completed: { dotClass: "bg-success", label: t.chat.timeline.completed },
  failed: { dotClass: "bg-destructive", label: t.chat.timeline.failed },
  cancelled: { dotClass: "bg-muted-foreground/60", label: t.chat.timeline.stopped },
  interrupted: { dotClass: "bg-muted-foreground/60", label: t.chat.timeline.stopped },
};

function subagentStatusVisual(status: OrchestrationV2TurnItem["status"]) {
  return STATUS_VISUALS[status];
}

const SETTLED_SUBAGENT_STATUSES = new Set<OrchestrationV2TurnItem["status"]>([
  "completed",
  "failed",
  "cancelled",
  "interrupted",
]);

/** The server's placeholder when a child ends without output; the status dot already says it. */
const GENERIC_CHILD_END = /^Child task ended with status\b/i;

/** One line of a markdown result: drop list bullets, code ticks, and link targets. */
function plainDetail(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`/g, "")
    .replace(/^[ \t]*[-*][ \t]+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isoOrNull(value: DateTime.Utc | null | undefined): string | null {
  return value ? DateTime.formatIso(value) : null;
}

export function SubagentElapsed({ agent }: { agent: Parameters<typeof AgentElapsed>[0]["agent"] }) {
  return <AgentElapsed agent={agent} />;
}

/** Child character with the agents panel's status dot; rings let a header stack overlap. */
export function SubagentAvatar({
  pixelIconName = "subagent",
  status,
  className,
}: {
  driver?: ProviderDriverKind | undefined;
  provider?: ServerProvider | undefined;
  /** Computed from run/parent groups in the loaded projection, never the visible row order. */
  pixelIconName?: PixelIconName | undefined;
  /** Omitted inside an overlapped stack, where a covered dot would only add noise. */
  status?: OrchestrationV2TurnItem["status"] | undefined;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-border/70 bg-muted ring-2 ring-background",
        className,
      )}
    >
      <PixelIcon name={pixelIconName} className="size-3.5" />
      {status ? (
        <span
          className={cn(
            "absolute -right-px -bottom-px size-2 rounded-full ring-2 ring-background",
            subagentStatusVisual(status).dotClass,
          )}
        />
      ) : null}
    </span>
  );
}

/** The status a notification reported, frozen at the time it arrived. */
const NOTIFICATION_OUTCOME_STATUS: Record<
  OrchestrationV2Notification["outcome"],
  OrchestrationV2TurnItem["status"] | null
> = {
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
  updated: null,
  unknown: null,
};

const NOTIFICATION_OUTCOME_LABEL: Record<OrchestrationV2Notification["outcome"], string> = {
  completed: t.chat.timeline.finished,
  failed: t.chat.timeline.failed,
  cancelled: t.chat.timeline.stopped,
  updated: t.chat.timeline.updated,
  unknown: t.chat.timeline.finished,
};

/** A notification about one subagent, drawn as that subagent's card. Renders `fallback` when the parent has no record of it. */
export function SubagentNotificationLink(props: {
  readonly parentRef: ScopedThreadRef;
  readonly childThreadId: ThreadId;
  readonly outcome: OrchestrationV2Notification["outcome"];
  readonly createdAt: string;
  readonly timestampFormat: TimestampFormat;
  readonly providerStatuses: ReadonlyArray<ServerProvider>;
  readonly onOpenThread: (threadId: ThreadId) => void;
  readonly fallback: ReactNode;
}) {
  const agent = useAtomValue(
    environmentThreadDetails.threadAtom(props.parentRef),
    (thread) =>
      thread?.projection.subagents.find((agent) => agent.childThreadId === props.childThreadId) ??
      null,
  );
  if (agent === null) return props.fallback;
  return (
    <SubagentTimelineLink
      parentRef={props.parentRef}
      subagentId={agent.id}
      providerInstanceId={agent.providerInstanceId}
      origin={agent.origin}
      status={agent.status}
      driver={agent.driver}
      provider={props.providerStatuses.find(
        (provider) => provider.instanceId === agent.providerInstanceId,
      )}
      providers={props.providerStatuses}
      title={formatSubagentDisplayTitle(agent.title ?? t.chat.timeline.subagent)}
      result={agent.result}
      progress={agent.progress}
      startedAt={agent.startedAt}
      completedAt={agent.completedAt}
      threadId={props.childThreadId}
      onOpenThread={props.onOpenThread}
      event={{
        status: NOTIFICATION_OUTCOME_STATUS[props.outcome],
        label: NOTIFICATION_OUTCOME_LABEL[props.outcome],
        timestamp: formatShortTimestamp(props.createdAt, props.timestampFormat),
      }}
    />
  );
}

/**
 * Renders a child-agent summary using live status when available and opens its thread on request.
 * @param props - Required parent scope, child/provider IDs, origin, driver, provider list (possibly
 * empty), title, status, and open callback. provider and progress may be undefined; result,
 * start/end times, and threadId may be null. Optional event supplies historical status (possibly
 * null), label, and timestamp instead of live timing.
 * @returns The child-agent summary; when threadId is null it has no thread-opening action. Never
 * returns null.
 */
function SubagentTimelineLink(props: {
  readonly parentRef: ScopedThreadRef;
  readonly subagentId: NodeId;
  readonly providerInstanceId: ProviderInstanceId;
  readonly origin: OrchestrationV2Subagent["origin"];
  readonly driver: ProviderDriverKind;
  readonly provider: ServerProvider | undefined;
  readonly providers: ReadonlyArray<ServerProvider>;
  readonly title: string;
  readonly result: string | null;
  readonly progress: string | undefined;
  readonly status: OrchestrationV2TurnItem["status"];
  readonly startedAt: DateTime.Utc | null;
  readonly completedAt: DateTime.Utc | null;
  readonly threadId: ThreadId | null;
  readonly onOpenThread: (threadId: ThreadId) => void;
  /** Draws a past event about the subagent: its status then, and when it happened instead of elapsed time. */
  readonly event?: {
    readonly status: OrchestrationV2TurnItem["status"] | null;
    readonly label: string;
    readonly timestamp: string;
  };
}) {
  const pixelIconName = useAtomValue(
    environmentThreadDetails.threadAtom(props.parentRef),
    (thread) =>
      getSubagentPixelIconName(props.driver, props.subagentId, thread?.projection.subagents),
  );
  const agent = useAtomValue(
    environmentThreadDetails.threadAtom(props.parentRef),
    (thread) => thread?.projection.subagents.find((agent) => agent.id === props.subagentId) ?? null,
  );
  const threadId = props.threadId;
  const liveStatus = agent?.status ?? props.status;
  const status = props.event ? props.event.status : liveStatus;
  const statusLabel = props.event?.label ?? subagentStatusVisual(liveStatus).label;
  const result = (agent?.result ?? props.result)?.trim();
  const progress = (agent?.progress ?? props.progress)?.trim();
  const settled = SETTLED_SUBAGENT_STATUSES.has(status ?? liveStatus);
  const rawDetail = settled ? result || progress : progress || result;
  const detail =
    rawDetail && !GENERIC_CHILD_END.test(rawDetail) ? plainDetail(rawDetail) || null : null;
  const failed = status === "failed";
  const timing = {
    status: liveStatus,
    startedAt: isoOrNull(agent?.startedAt ?? props.startedAt),
    completedAt: isoOrNull(agent?.completedAt ?? props.completedAt),
  };
  const content = (
    <>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 truncate text-secondary-copy-large text-fg-detail">
            {props.title}
          </span>
        </span>
        {/* Progress/result previews are existing content; D1's empty-preview state stays one line. */}
        {detail !== null ? (
          <span
            className={cn(
              "block truncate text-meta-large",
              failed ? "text-error" : "text-muted-foreground",
            )}
          >
            {detail.includes("/") && !detail.includes(" ") ? (
              <MiddleTruncate value={detail} showTitle={false} className="flex" />
            ) : (
              <span className="block truncate">{detail}</span>
            )}
          </span>
        ) : null}
      </span>
      <span className="shrink-0 text-secondary-copy text-muted-foreground tabular-nums">
        {props.event ? props.event.timestamp : <SubagentElapsed agent={timing} />}
      </span>
      <span
        className={cn(
          "flex h-5 shrink-0 items-center rounded-tag px-2.25 text-meta-large font-semibold shadow-tag",
          status === "failed"
            ? "bg-error-surface text-error-foreground"
            : status === "completed"
              ? "bg-secondary text-success-foreground"
              : settled
                ? "bg-secondary text-secondary-label"
                : "bg-update-surface text-update-foreground",
        )}
      >
        {statusLabel}
      </span>
    </>
  );
  const className =
    "group/subagent flex h-9.5 w-full min-w-0 items-center gap-2 rounded-compact-row bg-timeline-agent-well ps-3 pe-1.5 text-left shadow-timeline-file";
  return (
    <Tooltip>
      <TooltipTrigger
        delay={200}
        render={
          threadId === null ? (
            <div data-v2-item-type="subagent" aria-description={statusLabel} className={className}>
              {content}
            </div>
          ) : (
            <button
              type="button"
              data-v2-item-type="subagent"
              aria-label={t.chat.timeline.open(props.title)}
              aria-description={statusLabel}
              onClick={() => props.onOpenThread(threadId)}
              className={cn(
                className,
                "cursor-pointer hover:bg-timeline-log-hover focus-visible:outline-none focus-visible:inset-shadow-focus",
              )}
            >
              {content}
            </button>
          )
        }
      />
      <ThreadHoverCardPopup>
        <SubagentTimelineTooltip
          {...props}
          pixelIconName={pixelIconName}
          elapsed={agent ? <AgentElapsed agent={projectedSubagentsToRuntime([agent])[0]!} /> : null}
          model={agent?.model ?? null}
          modelSelection={agent?.modelSelection}
          status={liveStatus}
          result={agent?.result ?? props.result}
          progress={agent?.progress ?? props.progress}
        />
      </ThreadHoverCardPopup>
    </Tooltip>
  );
}

/**
 * Adds available parent/child workspace metadata to the shared subagent hover card.
 * @param props Timeline identity, model, timing, and state, plus the same pixel character as the row.
 * Parent/child projects may be unavailable; a null child thread ID omits child workspace metadata.
 * @returns Tooltip content using live thread/project shells without changing navigation or provider state.
 */
function SubagentTimelineTooltip(
  props: Parameters<typeof SubagentTimelineLink>[0] & {
    pixelIconName: PixelIconName;
    model: string | null;
    modelSelection: OrchestrationV2Subagent["modelSelection"];
    elapsed: ReactNode;
  },
) {
  const environmentId = props.parentRef.environmentId;
  const parent = useThreadShell(props.parentRef)?.source;
  const child = useThreadShell(
    props.threadId ? scopeThreadRef(environmentId, props.threadId) : null,
  )?.source;
  const parentProject = useProject(
    parent ? scopeProjectRef(environmentId, parent.projectId) : null,
  );
  const childProject = useProject(child ? scopeProjectRef(environmentId, child.projectId) : null);
  return (
    <SubagentTooltipContent
      pixelIconName={props.pixelIconName}
      title={formatSubagentDisplayTitle(child?.title ?? props.title)}
      model={props.model}
      providerInstanceId={props.providerInstanceId}
      origin={props.origin}
      modelSelection={props.modelSelection}
      provider={props.provider}
      providers={props.providers}
      driver={props.driver}
      elapsed={props.elapsed}
      status={props.status}
      result={props.result}
      progress={props.progress}
      parentThread={parent}
      childThread={child}
      parentProject={parentProject ?? undefined}
      childProject={childProject ?? undefined}
    />
  );
}

export function HandoffRow(props: {
  readonly endpoints: HandoffEndpoints;
  readonly providers: ReadonlyArray<ServerProvider>;
  readonly pending?: boolean;
  readonly failed?: boolean;
}) {
  const { from: fromEndpoints, to } = props.endpoints;
  return (
    <TimelineSystemDivider
      label={props.pending ? t.chat.timeline.contextHandoffPending : t.chat.timeline.contextHandoff}
      icon={ArrowRightLeftIcon}
      showDetailSeparator={false}
      tone={props.failed ? "danger" : "neutral"}
      detail={
        <span className="inline-flex min-w-0 flex-wrap items-center justify-center gap-1.5">
          {fromEndpoints.map((endpoint, index) => (
            <Fragment key={`${endpoint.instanceId}:${endpoint.model ?? ""}`}>
              {index > 0 ? (
                <span aria-hidden="true" className="-ml-1">
                  ,
                </span>
              ) : null}
              <HandoffEndpoint
                providers={props.providers}
                instanceId={endpoint.instanceId}
                model={endpoint.model}
              />
            </Fragment>
          ))}
          {fromEndpoints.length > 0 ? (
            <ArrowRightIcon aria-hidden="true" className="size-3 shrink-0" />
          ) : null}
          <HandoffEndpoint
            providers={props.providers}
            instanceId={to.instanceId}
            model={to.model}
          />
        </span>
      }
    />
  );
}

function HandoffEndpoint(props: {
  readonly providers: ReadonlyArray<ServerProvider>;
  readonly instanceId: ProviderInstanceId;
  readonly model?: string | undefined;
}) {
  const entry = getProviderInstanceEntry(props.providers, props.instanceId);
  const model = props.model?.trim();
  const providerModel =
    model === undefined || model.length === 0
      ? undefined
      : entry?.models.find((candidate) => candidate.slug === model);
  const label =
    providerModel !== undefined
      ? getTriggerDisplayModelName(providerModel)
      : model !== undefined && model.length > 0
        ? model
        : (entry?.displayName ?? props.instanceId);
  const labelColor = providerTextColor(
    entry?.driverKind ?? ProviderDriverKind.make(props.instanceId),
  );
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            tabIndex={0}
            className="inline-flex min-w-0 items-center gap-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <ProviderInstanceIcon
              driverKind={entry?.driverKind ?? ProviderDriverKind.make(props.instanceId)}
              displayName={entry?.displayName ?? props.instanceId}
              acpRegistryAgentId={entry?.acpRegistryAgentId}
              acpRegistryIconUrl={entry?.acpRegistryIconUrl}
              iconClassName="size-3"
            />
            <span
              className={cn("truncate font-medium", labelColor.className)}
              style={labelColor.style}
            >
              {label}
            </span>
          </span>
        }
      />
      <TooltipPopup>
        {entry?.displayName ?? props.instanceId} · {label}
      </TooltipPopup>
    </Tooltip>
  );
}
