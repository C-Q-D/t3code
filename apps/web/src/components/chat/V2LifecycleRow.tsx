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
import { EMPTY_SERVER_PROVIDERS, serverEnvironment } from "../../state/server";
import { MiddleTruncate } from "../ui/middle-truncate";
import * as DateTime from "effect/DateTime";
import { WorkLogRow } from "./WorkLog";
import {
  resolveHandoffEndpoints,
  type HandoffEndpoints,
  type HandoffTimelineRun,
} from "@t3tools/client-runtime/handoff";
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
  CheckIcon,
  ChevronRightIcon,
  CircleXIcon,
  TerminalIcon,
  GitForkIcon,
  MessageSquareIcon,
  CircleStopIcon,
  HandIcon,
  ShrinkIcon,
} from "lucide-react";

import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import {
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
  shouldShowInstanceBadge,
  type ProviderInstanceEntry,
} from "../../providerInstances";
import { formatShortTimestamp } from "../../timestampFormat";
import { getTriggerDisplayModelName } from "./providerIconUtils";
import { ProviderInstanceIcon, providerTextColor } from "./ProviderInstanceIcon";
import { cn } from "~/lib/utils";
import { TimelineSystemDivider } from "./TimelineSystemDivider";
import { subagentResumedSince } from "./V2LifecycleRow.logic";
import { Button, InlineButton } from "../ui/button";
import { T3Wordmark } from "../T3Wordmark";
import { getSubagentPixelIconName } from "../icons/subagentPixelIcon";
import { isTerminalSubagentStatus } from "@t3tools/client-runtime/state/subagentRuntime";
import {
  formatSubagentModelText,
  resolveSubagentModelSummary,
  SubagentAvatar,
  subagentDetailLine,
  SubagentStatusLabel,
  subagentStatusVisual,
} from "./SubagentPresentation";

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
 * runs (possibly empty), and thread-opening callback. Optional resourceSummary
 * controls resource presentation.
 * @returns The lifecycle row, or null when the item has no supported lifecycle presentation.
 */
export function V2LifecycleRow(props: {
  readonly item: OrchestrationV2TurnItem;
  readonly environmentId: EnvironmentId;
  readonly resourceSummary?: boolean | undefined;
  readonly createdAt: string;
  readonly timestampFormat: TimestampFormat;
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
      <EnvironmentHandoffRow
        environmentId={props.environmentId}
        endpoints={resolveHandoffEndpoints(item, props.runs)}
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
          data-timeline-card-tone="muted"
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

function isoOrNull(value: DateTime.Utc | null | undefined): string | null {
  return value ? DateTime.formatIso(value) : null;
}

export function SubagentElapsed({ agent }: { agent: Parameters<typeof AgentElapsed>[0]["agent"] }) {
  return <AgentElapsed agent={agent} />;
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

/** Resolves notification links against live subagent state so resumed work is not shown as finished.
 * @param props Parent/child identities select the agent; outcome and createdAt describe the historical notice,
 * timestampFormat controls its time label, onOpenThread navigates, and fallback is returned if the agent is absent.
 * @returns Live subagent link or the supplied fallback without altering the notification. */
export function SubagentNotificationLink(props: {
  readonly parentRef: ScopedThreadRef;
  readonly childThreadId: ThreadId;
  readonly outcome: OrchestrationV2Notification["outcome"];
  readonly createdAt: string;
  readonly timestampFormat: TimestampFormat;
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
  // A subagent resumed since this notification shows its live status, not the outcome reported then.
  const resumed =
    NOTIFICATION_OUTCOME_STATUS[props.outcome] !== null &&
    subagentResumedSince(agent, props.createdAt);
  return (
    <SubagentTimelineLink
      parentRef={props.parentRef}
      subagentId={agent.id}
      providerInstanceId={agent.providerInstanceId}
      origin={agent.origin}
      status={agent.status}
      driver={agent.driver}
      title={formatSubagentDisplayTitle(agent.title ?? t.chat.timeline.subagent)}
      result={agent.result}
      progress={agent.progress}
      startedAt={agent.startedAt}
      completedAt={agent.completedAt}
      threadId={props.childThreadId}
      onOpenThread={props.onOpenThread}
      {...(resumed
        ? {}
        : {
            event: {
              status: NOTIFICATION_OUTCOME_STATUS[props.outcome],
              label: NOTIFICATION_OUTCOME_LABEL[props.outcome],
              timestamp: formatShortTimestamp(props.createdAt, props.timestampFormat),
            },
          })}
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
  readonly title: string;
  readonly result: string | null;
  readonly progress: string | undefined;
  readonly status: OrchestrationV2TurnItem["status"];
  readonly startedAt: DateTime.Utc | null;
  readonly completedAt: DateTime.Utc | null;
  readonly threadId: ThreadId | null;
  readonly onOpenThread: (threadId: ThreadId) => void;
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
  // A notification's "updated" outcome has no status of its own; it borrows the live colors.
  const status = (props.event ? props.event.status : null) ?? liveStatus;
  const statusLabel = props.event?.label ?? subagentStatusVisual(liveStatus).label;
  const settled = isTerminalSubagentStatus(status);
  const detail = subagentDetailLine({
    status,
    result: agent?.result ?? props.result,
    progress: agent?.progress ?? props.progress,
  });
  const failed = status === "failed";
  const DetailIcon = failed
    ? CircleXIcon
    : status === "completed"
      ? CheckIcon
      : settled
        ? null
        : TerminalIcon;
  const modelText = useAtomValue(
    serverEnvironment.providersValueAtom(props.parentRef.environmentId),
    (providers) =>
      formatSubagentModelText(
        resolveSubagentModelSummary({
          model: agent?.model ?? null,
          providerInstanceId: props.providerInstanceId,
          origin: props.origin,
          modelSelection: agent?.modelSelection,
          provider: providers?.find((provider) => provider.instanceId === props.providerInstanceId),
          providers: providers ?? EMPTY_SERVER_PROVIDERS,
        }),
      ),
  );
  const timing = {
    status: liveStatus,
    startedAt: isoOrNull(agent?.startedAt ?? props.startedAt),
    completedAt: isoOrNull(agent?.completedAt ?? props.completedAt),
  };
  const content = (
    <>
      <SubagentAvatar
        pixelIconName={pixelIconName}
        status={status}
        ringClassName="ring-timeline-agent-well group-hover/subagent:ring-timeline-log-hover"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="min-w-0 truncate text-secondary-copy-large font-medium text-fg-detail">
            {props.title}
          </span>
          {modelText !== null ? (
            <span className="max-w-1/2 shrink-0 truncate font-mono text-meta-large text-muted-foreground">
              {modelText}
            </span>
          ) : null}
        </span>
        {detail !== null ? (
          <span
            className={cn(
              "flex min-w-0 items-center gap-1.5 text-meta-large",
              failed ? "text-error" : "text-muted-foreground",
            )}
          >
            {DetailIcon ? <DetailIcon aria-hidden className="size-3 shrink-0" /> : null}
            {detail.includes("/") && !detail.includes(" ") ? (
              <span className="flex min-w-0 font-mono">
                <MiddleTruncate value={detail} showTitle={false} className="flex" />
              </span>
            ) : (
              <span className={cn("min-w-0 truncate", !settled && "font-mono")}>{detail}</span>
            )}
          </span>
        ) : null}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5">
        <SubagentStatusLabel status={status} label={statusLabel} />
        <span className="font-mono text-meta-large text-muted-foreground tabular-nums">
          {props.event ? props.event.timestamp : <SubagentElapsed agent={timing} />}
        </span>
      </span>
      {threadId !== null ? (
        <ChevronRightIcon
          aria-hidden
          className="size-4 shrink-0 text-placeholder group-hover/subagent:text-foreground"
        />
      ) : null}
    </>
  );
  const className =
    "group/subagent flex w-full min-w-0 items-center gap-3 rounded-compact-row bg-timeline-agent-well py-2 ps-2.5 pe-3 text-left shadow-timeline-file";
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
      {/* Below and start-aligned, so the card stays readable while its hover card is open. */}
      <ThreadHoverCardPopup side="bottom" align="start">
        <SubagentTimelineTooltip
          {...props}
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
 * @param props Timeline identity, model, timing, and state. Parent/child projects may be
 * unavailable; a null child thread ID omits child workspace metadata and the open hint.
 * @returns Tooltip content using live thread/project shells without changing navigation or provider state.
 */
function SubagentTimelineTooltip(
  props: Parameters<typeof SubagentTimelineLink>[0] & {
    model: string | null;
    modelSelection: OrchestrationV2Subagent["modelSelection"];
    elapsed: ReactNode;
  },
) {
  const environmentId = props.parentRef.environmentId;
  // The popup only mounts while open, so the full provider list is read here
  // instead of in every timeline row.
  const providers =
    useAtomValue(serverEnvironment.providersValueAtom(environmentId)) ?? EMPTY_SERVER_PROVIDERS;
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
      title={formatSubagentDisplayTitle(child?.title ?? props.title)}
      model={props.model}
      providerInstanceId={props.providerInstanceId}
      origin={props.origin}
      modelSelection={props.modelSelection}
      provider={providers.find((provider) => provider.instanceId === props.providerInstanceId)}
      providers={providers}
      driver={props.driver}
      elapsed={props.elapsed}
      status={props.status}
      result={props.result}
      progress={props.progress}
      parentThread={parent}
      childThread={child}
      parentProject={parentProject ?? undefined}
      childProject={childProject ?? undefined}
      opensThread={props.threadId !== null}
    />
  );
}

function EnvironmentHandoffRow({
  environmentId,
  ...props
}: {
  readonly environmentId: EnvironmentId;
  readonly endpoints: HandoffEndpoints;
  readonly failed: boolean;
}) {
  const providers =
    useAtomValue(serverEnvironment.providersValueAtom(environmentId)) ?? EMPTY_SERVER_PROVIDERS;
  return <HandoffRow {...props} environmentId={environmentId} providers={providers} />;
}

/** Separates pending and failed handoffs from completed transfers without changing provider identities.
 * @param props Environment settings and providers supply display names; endpoints identify sources and destination.
 * Optional pending/failed flags select the localized label and failure tone.
 * @returns A system divider; missing settings use the derived provider catalog. */
export function HandoffRow(props: {
  readonly environmentId: EnvironmentId;
  readonly endpoints: HandoffEndpoints;
  readonly providers: ReadonlyArray<ServerProvider>;
  readonly pending?: boolean;
  readonly failed?: boolean;
}) {
  const { from: fromEndpoints, to } = props.endpoints;
  const settings = useAtomValue(serverEnvironment.settingsValueAtom(props.environmentId));
  const derived = deriveProviderInstanceEntries(props.providers);
  const entries = settings ? applyProviderInstanceSettings(derived, settings, null) : derived;
  return (
    <TimelineSystemDivider
      label={props.pending ? t.chat.timeline.contextHandoffPending : t.chat.timeline.contextHandoff}
      icon={ArrowRightLeftIcon}
      showDetailSeparator={false}
      tone={props.failed ? "danger" : "neutral"}
      detail={
        <span className="inline-flex min-w-0 flex-wrap items-center justify-center gap-1.5">
          {fromEndpoints.map((endpoint, index) => (
            <span
              key={`${endpoint.instanceId}:${endpoint.model ?? ""}`}
              className="inline-flex min-w-0 items-center"
            >
              <HandoffEndpoint
                entries={entries}
                instanceId={endpoint.instanceId}
                model={endpoint.model}
              />
              {index < fromEndpoints.length - 1 ? (
                <span aria-hidden="true" className="ml-0.5">
                  ,
                </span>
              ) : null}
            </span>
          ))}
          {fromEndpoints.length > 0 ? (
            <ArrowRightIcon aria-hidden="true" className="size-3 shrink-0" />
          ) : null}
          <HandoffEndpoint entries={entries} instanceId={to.instanceId} model={to.model} />
        </span>
      }
    />
  );
}

function HandoffEndpoint(props: {
  readonly entries: ReadonlyArray<ProviderInstanceEntry>;
  readonly instanceId: ProviderInstanceId;
  readonly model?: string | undefined;
}) {
  const entry = props.entries.find((candidate) => candidate.instanceId === props.instanceId);
  const showBadge = entry !== undefined && shouldShowInstanceBadge(entry, props.entries);
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
            className="inline-flex min-w-0 items-center gap-1.5 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <ProviderInstanceIcon
              driverKind={entry?.driverKind ?? ProviderDriverKind.make(props.instanceId)}
              displayName={entry?.displayName ?? props.instanceId}
              accentColor={entry?.accentColor}
              acpRegistryAgentId={entry?.acpRegistryAgentId}
              acpRegistryIconUrl={entry?.acpRegistryIconUrl}
              showBadge={showBadge}
              size="compact"
              iconClassName={cn(showBadge && "opacity-60")}
              indicatorBackground="var(--background)"
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
