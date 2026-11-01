import { cn } from "~/lib/utils";
import { useEnvironmentSettings } from "../../hooks/useSettings";
/** Displays related threads and their navigation, merge and agent controls. */
import { PixelSubagentIcon } from "../icons/PixelLucideIcon";
import { getSubagentPixelIconName } from "../icons/subagentPixelIcon";
import { t } from "~/i18n";
import { useAtomValue } from "@effect/atom-react";
import { ThreadDetailsControl } from "./ThreadDetailsControl";
import { ThreadHoverCardPopup } from "../ThreadHoverCard";
import { ThreadDetailsSection } from "./ThreadDetailsSection";
import { Badge } from "../ui/badge";
import { CollapsibleSectionHeader, SectionHeaderStatus } from "../ui/collapsible-section-header";
import { SubagentTooltipContent } from "./SubagentTooltipContent";
import { PullRequestGlyph } from "../pullRequest/pullRequestIcons";
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  deriveWorkflowGroups,
  isTerminalSubagentStatus,
  projectedSubagentsToRuntime,
  type RuntimeSubagent,
} from "@t3tools/client-runtime/state/subagentRuntime";
import { formatSubagentDisplayTitle } from "@t3tools/client-runtime/state/subagent-display";
import { deriveProviderSubagentStatus } from "@t3tools/client-runtime/state/thread-execution";
import {
  deriveThreadRelationshipGraph,
  immediateThreadRelationships,
  isParentThreadRelationship,
  threadRelationshipRowStatus,
  orderWebThreadLineageRows,
  resolveMergeBackTargetThreadId,
  type ThreadRelationshipEdge,
  type ThreadRelationshipWalkRow,
} from "@t3tools/client-runtime/state/thread-relationships";
import {
  canDetachThreadProviderSession,
  resolveLatestMergeBackRun,
} from "@t3tools/client-runtime/state/thread-workflows";
import {
  isOrchestrationV2WorkActive,
  isProviderNativeSubagentThread,
  NodeId,
  type EnvironmentId,
  type OrchestrationV2DelegatedFrom,
  type OrchestrationV2RemoteTaskChild,
  type OrchestrationV2Subagent,
  type OrchestrationV2ThreadShell,
  type ServerProvider,
  type ThreadId,
} from "@t3tools/contracts";
import { deriveSubagentElapsedMs } from "@t3tools/shared/orchestrationTiming";
import { groupBy } from "effect/Array";
import * as DateTime from "effect/DateTime";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowRightIcon,
  BotIcon,
  CornerLeftUpIcon,
  GitForkIcon,
  MessagesSquareIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SquareIcon,
  UnplugIcon,
} from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

import { useArchivedThreadSnapshots } from "../../lib/archivedThreadsState";
import { buildThreadRouteParams } from "../../threadRoutes";
import {
  useProjects,
  useQuietThreadShell,
  useThreadProjection,
  useThreadRelationshipShells,
} from "../../state/entities";
import { useEnvironment, useEnvironmentProviders } from "../../state/environments";
import { threadEnvironment } from "../../state/threads";
import { orchestrationEnvironment } from "../../state/orchestration";
import { useAtomCommand } from "../../state/use-atom-command";
import { AgentElapsed } from "./AgentElapsed";
import { ThreadRelationshipIcon, threadRelationshipStatusLabel } from "./ThreadRelationshipIcon";
import {
  ThreadLineageWorkflowRow,
  threadLineageWorkflowRegistry,
} from "./ThreadLineageWorkflowRow";
import {
  formatSubagentModelText,
  resolveSubagentModelSummary,
  SubagentAvatar,
  subagentDetailLine,
} from "./SubagentPresentation";
import { openSideChatTab } from "../../lib/sideChatPane";

import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { toastManager } from "../ui/toast";
import { Spinner } from "../ui/spinner";
import {
  THREAD_DETAILS_PANEL_SPLIT_GROUP_CLASS,
  THREAD_DETAILS_PANEL_ROW_CONTENT_CLASS,
  THREAD_DETAILS_PANEL_SPLIT_SEPARATOR_CLASS,
} from "./threadDetailsPanelStyles";

const THREAD_LINEAGE_INITIAL_COUNT = 6;
const THREAD_LINEAGE_PAGE_COUNT = 12;

function resolveThreadLineageWindow<Row>(
  rows: ReadonlyArray<Row>,
  visibleCount: number,
): { readonly visibleRows: ReadonlyArray<Row>; readonly hiddenCount: number } {
  const visibleRows = rows.slice(0, visibleCount);
  return { visibleRows, hiddenCount: rows.length - visibleRows.length };
}

/**
 * Renders lineage rows and a disclosure for additional hidden relationships.
 * @param props - Required hiddenCount and show-more callback; children may be null or empty. A zero
 * hiddenCount omits the disclosure.
 * @returns The lineage list element; never null.
 */
export function ThreadLineageRowList(props: {
  readonly hiddenCount: number;
  readonly onShowMore: () => void;
  readonly children: ReactNode;
}) {
  const { counts, onChange } = threadLineageWorkflowRegistry.usePresence();
  const workflowExpanded = (counts.expanded ?? 0) > 0;
  return (
    <>
      {/* ScrollArea's max-height viewport measures badly inside this scrolling panel. */}
      <ul
        aria-label={t.chat.relationships.relatedThreads}
        data-workflow-expanded={workflowExpanded}
        className="m-0 max-h-[13.5rem] list-none overflow-y-auto overscroll-contain p-0 data-[workflow-expanded=true]:max-h-[min(28rem,55dvh)]"
      >
        <threadLineageWorkflowRegistry.Provider onChange={onChange}>
          {props.children}
        </threadLineageWorkflowRegistry.Provider>
      </ul>
      {props.hiddenCount > 0 ? (
        <button
          type="button"
          onClick={props.onShowMore}
          className={`flex h-8 w-full cursor-pointer items-center rounded-lg ${THREAD_DETAILS_PANEL_ROW_CONTENT_CLASS} text-sm font-medium text-muted-foreground/70 hover:bg-black/[0.055] hover:text-foreground/80 dark:hover:bg-white/[0.075]`}
        >
          <PlusIcon aria-hidden className="size-4 shrink-0" />
          {t.chat.relationships.showMorePrefix}
          {Math.min(props.hiddenCount, THREAD_LINEAGE_PAGE_COUNT)}
          {t.chat.relationships.showMoreSuffix}
        </button>
      ) : null}
    </>
  );
}

/** Renders a collapsible page of related threads and their failure count; empty groups are omitted. */
function ThreadLineageGroup(props: {
  readonly label: string | null;
  readonly rows: ReadonlyArray<ThreadRelationshipWalkRow>;
  readonly expanded: boolean;
  readonly children: (rows: ReadonlyArray<ThreadRelationshipWalkRow>) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(props.expanded);
  const [visibleCount, setVisibleCount] = useState(THREAD_LINEAGE_INITIAL_COUNT);
  const { visibleRows, hiddenCount } = resolveThreadLineageWindow(props.rows, visibleCount);
  const failedCount = props.rows.filter(
    ({ edge }) => edge.status === "failed" || edge.status === "error",
  ).length;
  if (props.rows.length === 0) return null;
  return (
    <div>
      {props.label ? (
        <CollapsibleSectionHeader
          variant="panel"
          expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          accessory={
            failedCount > 0 ? (
              <SectionHeaderStatus>
                {t.chat.relationships.failedCount(failedCount)}
              </SectionHeaderStatus>
            ) : null
          }
        >
          {props.label}
          {!expanded && ` (${props.rows.length})`}
        </CollapsibleSectionHeader>
      ) : null}
      {expanded ? (
        <ThreadLineageRowList
          hiddenCount={hiddenCount}
          onShowMore={() => setVisibleCount((count) => count + THREAD_LINEAGE_PAGE_COUNT)}
        >
          {props.children(visibleRows)}
        </ThreadLineageRowList>
      ) : null}
    </div>
  );
}

/**
 * Names a relationship from the perspective of the current thread.
 * @param edge - Required relationship edge, including its direction and kind.
 * @param currentThreadId - Required thread ID whose perspective determines parent/child wording.
 * @returns The localized relationship label; never null or empty.
 */
function relationshipLabel(edge: ThreadRelationshipEdge, currentThreadId: ThreadId) {
  if (edge.kind === "transfer") return t.chat.relationships.contextTransfer;
  if (edge.kind === "subagent") {
    return edge.sourceThreadId === currentThreadId
      ? t.chat.timeline.subagent
      : t.chat.relationships.parentAgent;
  }
  return edge.sourceThreadId === currentThreadId
    ? t.chat.relationships.fork
    : t.chat.relationships.parentThread;
}

function relationshipThreadTitle(input: {
  readonly title: string;
  readonly isSubagent: boolean;
}): string {
  if (!input.isSubagent) return input.title;
  return formatSubagentDisplayTitle(input.title);
}

/**
 * Second line of a child's lineage row: its model while it works, otherwise its outcome.
 * @param props The child's live status, model and output; statusLabel is the lineage wording for it.
 * @returns One truncated line; failed children read in the error color.
 */
function SubagentRowSubtitle(props: {
  readonly agent: Pick<RuntimeSubagent, "status" | "model" | "result" | "error" | "progress"> &
    Pick<OrchestrationV2Subagent, "providerInstanceId" | "origin" | "modelSelection">;
  readonly statusLabel: string;
  readonly provider: ServerProvider | undefined;
  readonly providers: ReadonlyArray<ServerProvider> | undefined;
}) {
  const { agent } = props;
  const working = agent.status === "pending" || agent.status === "running";
  const modelText = working
    ? formatSubagentModelText(
        resolveSubagentModelSummary({
          model: agent.model,
          providerInstanceId: agent.providerInstanceId,
          origin: agent.origin,
          modelSelection: agent.modelSelection,
          provider: props.provider,
          providers: props.providers,
        }),
      )
    : null;
  const detail = isTerminalSubagentStatus(agent.status)
    ? subagentDetailLine({
        status: agent.status,
        result: agent.result ?? agent.error,
        progress: agent.progress,
      })
    : null;
  return (
    <span
      className={cn(
        "truncate text-meta-large leading-4",
        agent.status === "failed" ? "text-error" : "text-muted-foreground",
        modelText !== null && "font-mono",
      )}
    >
      {modelText ?? (detail ? `${props.statusLabel} · ${detail}` : props.statusLabel)}
    </span>
  );
}

/**
 * The row's timer and hover card follow current child work, including queued
 * follow-ups whose provider turn has not started yet.
 */
function currentSubagent<Agent extends RuntimeSubagent>(
  agent: Agent | undefined,
  childThread: OrchestrationV2ThreadShell | null | undefined,
): Agent | undefined {
  if (!agent || !childThread || isOrchestrationV2WorkActive(agent.status)) return agent;
  const liveStatus =
    childThread.activityRunStatus ?? (childThread.status === "queued" ? "queued" : null);
  const newerRun =
    childThread.latestRunRequestedAt &&
    DateTime.toEpochMillis(childThread.latestRunRequestedAt) >
      Date.parse(agent.completedAt ?? agent.startedAt ?? agent.updatedAt);
  if (!liveStatus && !newerRun) return agent;
  const status = liveStatus ?? childThread.status;
  const startedAt = liveStatus ? childThread.activityRunStartedAt : childThread.latestRunStartedAt;
  const completedAt = liveStatus ? null : childThread.latestRunCompletedAt;
  return {
    ...agent,
    status:
      status === "preparing" || status === "starting" || status === "queued"
        ? "pending"
        : status === "rolled_back"
          ? "interrupted"
          : status,
    startedAt: startedAt ? DateTime.formatIso(startedAt) : null,
    completedAt: completedAt ? DateTime.formatIso(completedAt) : null,
    progress: null,
    result: null,
    error: null,
  };
}

/**
 * A task delegated to a linked environment. It has no thread here, so it opens
 * the thread there, when this client is connected to that environment.
 */
function RemoteSubagentRow(props: {
  readonly agent: OrchestrationV2Subagent & {
    readonly remoteChild: OrchestrationV2RemoteTaskChild;
  };
  readonly provider: ServerProvider | undefined;
}) {
  const navigate = useNavigate();
  const environment = useEnvironment(props.agent.remoteChild.environmentId);
  const { remoteChild } = props.agent;
  const status = props.agent.status;
  const failed = status === "failed";
  const title = relationshipThreadTitle({
    title: props.agent.title ?? t.chat.timeline.subagent,
    isSubagent: true,
  });
  return (
    <li className="group relative flex h-8 items-center rounded-lg">
      <Tooltip>
        <TooltipTrigger
          delay={200}
          render={
            <ThreadDetailsControl
              size="sm"
              variant="ghost"
              part="row"
              disabled={environment === null}
              onClick={() =>
                void navigate({
                  to: "/$environmentId/$threadId",
                  params: buildThreadRouteParams(
                    scopeThreadRef(remoteChild.environmentId, remoteChild.threadId),
                  ),
                })
              }
            />
          }
        >
          <ThreadRelationshipIcon
            // The task's own driver here is only a "remote" label.
            driver={props.provider?.driver}
            provider={props.provider}
            fallbackIcon={BotIcon}
            status={status}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-left text-sm font-medium leading-4 text-foreground/85">
              {title}
            </span>
          </span>
          <span
            className={`shrink-0 text-2xs ${failed ? "text-destructive" : "text-muted-foreground"}`}
          >
            on {remoteChild.label} · {threadRelationshipStatusLabel(status)}
          </span>
        </TooltipTrigger>
        <TooltipPopup side="left">
          {environment === null
            ? t.chat.relationshipLinks.remoteHint(remoteChild.label)
            : t.chat.relationshipLinks.openRemote(remoteChild.label)}
        </TooltipPopup>
      </Tooltip>
    </li>
  );
}

/**
 * The thread on a linked environment whose agent delegated this one. It opens
 * there when this client is connected to that environment.
 */
function DelegatedFromRow(props: {
  readonly delegatedFrom: OrchestrationV2DelegatedFrom;
  readonly fallbackLabel: string | undefined;
}) {
  const navigate = useNavigate();
  const { delegatedFrom } = props;
  const environment = useEnvironment(delegatedFrom.environmentId);
  const parentRef = scopeThreadRef(delegatedFrom.environmentId, delegatedFrom.threadId);
  // The title it had at delegation, until this client sees the parent itself.
  const parent = useQuietThreadShell(parentRef);
  const label = environment?.label ?? props.fallbackLabel;
  const title = parent?.title ?? delegatedFrom.title;
  return (
    <li className="group relative flex h-8 items-center rounded-lg">
      <Tooltip>
        <TooltipTrigger
          delay={200}
          render={
            <ThreadDetailsControl
              size="sm"
              variant="ghost"
              part="row"
              disabled={environment === null}
              onClick={() =>
                void navigate({
                  to: "/$environmentId/$threadId",
                  params: buildThreadRouteParams(parentRef),
                })
              }
            />
          }
        >
          <ThreadRelationshipIcon fallbackIcon={CornerLeftUpIcon} status={null} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-left text-sm font-medium leading-4 text-foreground/85">
              {title}
            </span>
          </span>
          {label ? (
            <span className="shrink-0 text-2xs text-muted-foreground">on {label}</span>
          ) : null}
        </TooltipTrigger>
        <TooltipPopup side="left">
          {environment === null
            ? t.chat.relationshipLinks.delegated(
                label ?? t.chat.relationshipLinks.linkedEnvironment,
              )
            : t.chat.relationshipLinks.openParent}
        </TooltipPopup>
      </Tooltip>
    </li>
  );
}

/** Renders enabled lineage and side-chat groups while preserving per-agent controls. */
export function ThreadRelationshipsPanel(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly showLineage: boolean;
  readonly showSideChats: boolean;
}) {
  const ref = scopeThreadRef(props.environmentId, props.threadId);
  const projection = useThreadProjection(ref)?.projection ?? null;
  const providersByEnvironment = useEnvironmentProviders();
  const relationshipShells = useThreadRelationshipShells(ref);
  const allProjects = useProjects();
  const archived = useArchivedThreadSnapshots([props.environmentId]);
  const archivedShells = archived.snapshots.find(
    (entry) => entry.environmentId === props.environmentId,
  )?.snapshot.threads;
  const currentThread =
    projection?.thread ??
    relationshipShells.find((thread) => thread.id === props.threadId) ??
    archivedShells?.find((thread) => thread.id === props.threadId);
  const parentThreadId =
    currentThread?.forkedFrom?.type === "run"
      ? currentThread.forkedFrom.threadId
      : currentThread?.lineage.parentThreadId;
  const parentShell = parentThreadId
    ? (relationshipShells.find((thread) => thread.id === parentThreadId) ??
      archivedShells?.find((thread) => thread.id === parentThreadId))
    : undefined;
  const parentRef =
    parentShell && isProviderNativeSubagentThread(parentShell)
      ? scopeThreadRef(props.environmentId, parentShell.id)
      : null;
  const parentProjection = useThreadProjection(parentRef)?.projection;
  const navigate = useNavigate();
  const mergeBack = useAtomCommand(threadEnvironment.mergeBack);
  const stopSession = useAtomCommand(threadEnvironment.stopSession);
  const interruptTurn = useAtomCommand(threadEnvironment.interruptTurn);
  const stopWorkflowCommand = useAtomCommand(orchestrationEnvironment.stopWorkflow);
  const canOperateWorkflow = useAtomValue(
    orchestrationEnvironment.stopWorkflow.permissionAtom(props.environmentId),
  );
  const [busyAction, setBusyAction] = useState<"merge" | "detach" | null>(null);
  const mergeErrorToastId = useRef<string | null>(null);
  const detachErrorToastId = useRef<string | null>(null);
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  // Derive graphs after hooks to preserve their compiler cache.
  const providers = providersByEnvironment.get(props.environmentId);
  const projects = allProjects.filter((project) => project.environmentId === props.environmentId);
  const parentNativeStatus = parentProjection
    ? deriveProviderSubagentStatus(parentProjection)?.status
    : undefined;
  const projected = projection?.subagents ?? [];
  const runtimeSubagents = projectedSubagentsToRuntime(projected);
  const byId = new Map(runtimeSubagents.map((agent) => [agent.id, agent]));
  const subagentsByThreadId = new Map(
    projected
      .filter((subagent) => subagent.childThreadId !== null)
      .map((subagent) => [
        subagent.childThreadId,
        {
          ...byId.get(subagent.id)!,
          id: subagent.id,
          threadId: subagent.threadId,
          runId: subagent.runId,
          nativeTaskRef: subagent.nativeTaskRef,
          nativeStatus: subagent.status,
          driver: subagent.driver,
          providerInstanceId: subagent.providerInstanceId,
          origin: subagent.origin,
          modelSelection: subagent.modelSelection,
        },
      ]),
  );
  const workflowGroupsById = new Map(
    deriveWorkflowGroups(runtimeSubagents).map((group) => [group.workflow.id, group]),
  );
  const shells: ReadonlyArray<OrchestrationV2ThreadShell> = [
    ...relationshipShells,
    ...(archivedShells ?? []),
  ];
  const graph = deriveThreadRelationshipGraph({ threads: shells, projection });
  const currentProject = projects.find((project) => project.id === currentThread?.projectId);
  const latestMergeBackRun = projection === null ? null : resolveLatestMergeBackRun(projection);
  const mergeTargetThreadId = resolveMergeBackTargetThreadId(projection);
  const relationshipRows = orderWebThreadLineageRows({
    graph,
    rows: immediateThreadRelationships(graph, props.threadId),
    currentThreadId: props.threadId,
    mergeTargetThreadId,
  }).map((row) => {
    const agent =
      row.edge.kind === "subagent" && !isParentThreadRelationship(row.edge, props.threadId)
        ? subagentsByThreadId.get(row.threadId)
        : undefined;
    const workflowGroup = agent === undefined ? undefined : workflowGroupsById.get(agent.id);
    return workflowGroup === undefined
      ? row
      : { ...row, edge: { ...row.edge, status: workflowGroup.workflow.status } };
  });
  const canMerge = mergeTargetThreadId !== null && latestMergeBackRun !== null;
  const canDetach = projection ? canDetachThreadProviderSession(projection) : false;

  const {
    related = [],
    active = [],
    previous = [],
    sideChats = [],
  } = groupBy(relationshipRows, ({ threadId, edge }) => {
    const isParent = isParentThreadRelationship(edge, props.threadId);
    if (!isParent && graph.nodes.get(threadId)?.thread?.lineage.sideChat === true)
      return "sideChats";
    if (edge.kind !== "subagent" || isParent) return "related";
    return ["completed", "failed", "error", "cancelled", "interrupted", "idle"].includes(
      edge.status ?? "",
    )
      ? "previous"
      : "active";
  });
  const groups = [
    { id: "related", label: null, rows: related, expanded: true },
    { id: "active", label: null, rows: active, expanded: true },
    { id: "previous", label: t.chat.relationships.previousAgents, rows: previous, expanded: false },
  ];
  // Tasks running in a linked environment have no thread here; they get their own rows.
  const linkedEnvironmentsEnabled = useEnvironmentSettings(
    props.environmentId,
    (settings) => settings.linkedEnvironmentsEnabled,
  );
  const remoteSubagents = (projection?.subagents ?? []).filter(
    (agent): agent is OrchestrationV2Subagent & { remoteChild: OrchestrationV2RemoteTaskChild } =>
      linkedEnvironmentsEnabled && agent.remoteChild !== undefined,
  );
  const runningCount =
    (projection?.subagents.filter(
      (agent) => agent.childThreadId === null && agent.status === "running",
    ).length ?? 0) + active.filter(({ edge }) => edge.status === "running").length;

  // A linked environment's agent may have delegated this thread from there.
  const delegatedFrom = linkedEnvironmentsEnabled ? currentThread?.delegatedFrom : undefined;

  const lineageVisible =
    props.showLineage &&
    (related.length > 0 ||
      active.length > 0 ||
      previous.length > 0 ||
      runningCount > 0 ||
      remoteSubagents.length > 0 ||
      delegatedFrom !== undefined ||
      // Disconnect lives in this heading, so a thread with only side chats still shows it.
      (canDetach && sideChats.length > 0));
  const sideChatsVisible = props.showSideChats && sideChats.length > 0;
  const runningSideChats = sideChats.filter(({ edge }) => edge.status === "running").length;

  if (!lineageVisible && !sideChatsVisible) {
    return null;
  }

  const openThread = (threadId: ThreadId) => {
    if (openSideChatTab(ref, graph.nodes.get(threadId)?.thread ?? null)) return;
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(scopeThreadRef(props.environmentId, threadId)),
    });
  };

  const merge = async () => {
    if (!latestMergeBackRun || mergeTargetThreadId === null || busyAction !== null) return;
    if (mergeErrorToastId.current !== null) {
      toastManager.close(mergeErrorToastId.current);
      mergeErrorToastId.current = null;
    }
    setBusyAction("merge");
    const result = await mergeBack({
      environmentId: props.environmentId,
      input: {
        sourceThreadId: props.threadId,
        targetThreadId: mergeTargetThreadId,
        runId: latestMergeBackRun.id,
      },
    });
    setBusyAction(null);
    if (result._tag === "Failure") {
      mergeErrorToastId.current = toastManager.add({
        type: "error",
        title: t.chat.relationshipErrors.merge,
      });
      return;
    }
    openThread(mergeTargetThreadId);
  };

  const detach = async () => {
    if (!canDetach || busyAction !== null) return;
    if (detachErrorToastId.current !== null) {
      toastManager.close(detachErrorToastId.current);
      detachErrorToastId.current = null;
    }
    setBusyAction("detach");
    const result = await stopSession({
      environmentId: props.environmentId,
      input: { threadId: props.threadId },
    });
    setBusyAction(null);
    if (result._tag === "Failure") {
      detachErrorToastId.current = toastManager.add({
        type: "error",
        title: t.chat.relationshipErrors.disconnect,
      });
    }
  };

  const stopSubagent = async (
    childThreadId: ThreadId,
    agent: Pick<OrchestrationV2Subagent, "id" | "threadId">,
  ) => {
    if (stoppingId !== null) return;
    setStoppingId(childThreadId);
    const result = await interruptTurn({
      environmentId: props.environmentId,
      input: { threadId: agent.threadId, subagentId: agent.id },
    });
    setStoppingId(null);
    if (result._tag === "Failure") {
      toastManager.add({ type: "error", title: t.chat.relationships.couldNotStopSubagent });
    }
  };

  const stopWorkflow = async (subagentId: string) => {
    if (stoppingId !== null) return;
    setStoppingId(subagentId);
    const result = await stopWorkflowCommand({
      environmentId: props.environmentId,
      input: { threadId: props.threadId, subagentId: NodeId.make(subagentId) },
    });
    setStoppingId(null);
    if (result._tag === "Failure") {
      toastManager.add({ type: "error", title: t.chat.relationships.stopWorkflowFailed });
    }
  };

  const parentTitle =
    mergeTargetThreadId === null
      ? null
      : (graph.nodes.get(mergeTargetThreadId)?.thread?.title ?? null);

  const renderRelationshipRow = ({ threadId, edge }: ThreadRelationshipWalkRow) => {
    const node = graph.nodes.get(threadId);
    const isSubagent = edge.kind === "subagent";
    const isMergeTarget = threadId === mergeTargetThreadId;
    const isParent = isParentThreadRelationship(edge, props.threadId);
    const rowStatus =
      (isParent && threadId === parentRef?.threadId
        ? (node?.thread?.activityRunStatus ?? parentNativeStatus)
        : undefined) ?? threadRelationshipRowStatus(graph, { threadId, edge });
    const RelationshipIcon = isParent
      ? CornerLeftUpIcon
      : isSubagent
        ? PixelSubagentIcon
        : node?.thread?.lineage.sideChat === true
          ? MessagesSquareIcon
          : GitForkIcon;
    const relationship =
      node?.thread?.lineage.sideChat === true && !isParent
        ? t.chat.sideChat.title
        : relationshipLabel(edge, props.threadId);
    const projectedAgent = isSubagent && !isParent ? subagentsByThreadId.get(threadId) : undefined;
    const workflowGroup =
      projectedAgent === undefined ? undefined : workflowGroupsById.get(projectedAgent.id);
    const agent = workflowGroup ? projectedAgent : currentSubagent(projectedAgent, node?.thread);
    const failed = rowStatus === "failed" || rowStatus === "error";
    const canStop =
      agent &&
      (agent.origin === "app_owned" ||
        (agent.origin === "provider_native" &&
          agent.driver === "claudeAgent" &&
          agent.runId != null &&
          agent.nativeTaskRef?.strength === "strong" &&
          agent.nativeTaskRef.nativeId !== null &&
          ["pending", "running", "waiting"].includes(agent.nativeStatus))) &&
      agent.startedAt &&
      ["pending", "running", "waiting"].includes(agent.status);
    const threadTitle = relationshipThreadTitle({
      title:
        workflowGroup?.workflow.workflowName ?? node?.thread?.title ?? agent?.title ?? threadId,
      isSubagent,
    });
    const provider = providers?.find(
      (entry) =>
        entry.instanceId === (agent?.providerInstanceId ?? node?.thread?.providerInstanceId),
    );
    const providerDriver = agent?.driver ?? provider?.driver;
    const pixelIconName = getSubagentPixelIconName(
      providerDriver,
      agent?.id,
      projection?.subagents,
    );
    const canStopWorkflow =
      canOperateWorkflow &&
      workflowGroup?.workflow.status === "running" &&
      agent?.origin === "provider_native" &&
      providerDriver === "claudeAgent";
    const trailingVisibilityClass = (workflowGroup ? canStopWorkflow : canStop)
      ? "group-hover:opacity-0 group-focus-within:opacity-0 pointer-coarse:opacity-0 [@media(hover:none)]:opacity-0"
      : "";
    const project = projects.find((project) => project.id === node?.thread?.projectId);
    const relationshipHint = node?.missing
      ? t.chat.relationships.thisRelatedThreadIsUnavailable
      : t.chat.relationships.openRelated(relationship);
    // A plain child (not a workflow) gets the two-line agent row; forks, parents
    // and workflow headers keep the single-line pill.
    const agentRow = agent !== undefined && workflowGroup === undefined && !isMergeTarget;
    const RelationshipPopup = agent ? ThreadHoverCardPopup : TooltipPopup;
    const relationshipTooltip = agent ? (
      <SubagentTooltipContent
        opensThread={node?.missing !== true}
        title={threadTitle}
        model={agent.model}
        providerInstanceId={agent.providerInstanceId}
        origin={agent.origin}
        modelSelection={agent.modelSelection}
        provider={provider}
        providers={providers}
        driver={providerDriver}
        elapsed={<AgentElapsed agent={agent} />}
        status={agent.status}
        result={agent.result}
        progress={agent.progress}
        parentThread={currentThread ?? undefined}
        childThread={node?.thread ?? undefined}
        parentProject={currentProject}
        childProject={project}
      />
    ) : (
      relationshipHint
    );
    const relationshipContent = agentRow ? (
      <>
        <SubagentAvatar
          size="sm"
          pixelIconName={pixelIconName}
          status={agent.status}
          ringClassName="ring-card group-hover:ring-secondary"
        />
        <span className="flex min-w-0 flex-1 flex-col text-left">
          <span className="truncate text-sm font-medium leading-5 text-foreground/85">
            {threadTitle}
          </span>
          <SubagentRowSubtitle
            agent={agent}
            statusLabel={threadRelationshipStatusLabel(rowStatus)}
            provider={provider}
            providers={providers}
          />
        </span>
        {deriveSubagentElapsedMs(agent, 0) !== null ? (
          <span
            className={`shrink-0 font-mono text-2xs font-normal tabular-nums text-muted-foreground ${trailingVisibilityClass}`}
          >
            <AgentElapsed agent={agent} compact />
          </span>
        ) : null}
      </>
    ) : (
      <>
        <ThreadRelationshipIcon
          pixelIconName={isSubagent && !isParent ? pixelIconName : undefined}
          driver={isSubagent && !isParent ? providerDriver : undefined}
          provider={provider}
          fallbackIcon={RelationshipIcon}
          status={rowStatus}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-left text-sm font-medium leading-4 text-foreground/85">
            {threadTitle}
          </span>
        </span>
        {agent ? null : (
          <ArrowRightIcon className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        )}
        {agent && !failed && (deriveSubagentElapsedMs(agent, 0) !== null || canStopWorkflow) ? (
          <span
            className={`shrink-0 text-2xs font-normal tabular-nums text-muted-foreground ${canStopWorkflow ? "min-w-6 text-end" : ""} ${trailingVisibilityClass}`}
          >
            <AgentElapsed agent={agent} compact />
          </span>
        ) : !isMergeTarget ? (
          <span className={workflowGroup ? "sr-only" : trailingVisibilityClass}>
            <Badge variant={failed ? "danger" : rowStatus === "running" ? "info" : "neutral"}>
              {threadRelationshipStatusLabel(rowStatus)}
            </Badge>
          </span>
        ) : null}
      </>
    );
    const relationshipLink = (
      <Tooltip>
        <TooltipTrigger
          delay={200}
          render={
            <ThreadDetailsControl
              size="sm"
              variant="ghost"
              part={workflowGroup ? "primary" : agentRow ? "agent" : "row"}
              disabled={node?.missing === true}
              onClick={() => openThread(threadId)}
            />
          }
        >
          {relationshipContent}
        </TooltipTrigger>
        <RelationshipPopup side="left">{relationshipTooltip}</RelationshipPopup>
      </Tooltip>
    );
    if (workflowGroup && agent) {
      return (
        <ThreadLineageWorkflowRow
          key={threadId}
          group={workflowGroup}
          siblings={projection?.subagents}
          providerInstanceId={agent.providerInstanceId}
          provider={provider}
          providers={providers}
          driver={providerDriver}
          onOpenThread={(memberThreadId) => openThread(memberThreadId as ThreadId)}
          isThreadAvailable={(memberThreadId) =>
            graph.nodes.get(memberThreadId as ThreadId)?.missing === false
          }
          onStop={canStopWorkflow ? () => void stopWorkflow(agent.id) : undefined}
          stopping={stoppingId === agent.id}
          stopDisabled={stoppingId !== null}
          header={relationshipLink}
        />
      );
    }
    return (
      <li
        key={threadId}
        className={
          agentRow
            ? "group relative flex min-h-11 items-center rounded-lg"
            : "group relative flex h-9.5 items-center rounded-full bg-thread-details-well shadow-well-control"
        }
      >
        {isMergeTarget ? (
          <div className={THREAD_DETAILS_PANEL_SPLIT_GROUP_CLASS}>
            <Tooltip>
              <TooltipTrigger
                delay={200}
                render={
                  <ThreadDetailsControl
                    size="sm"
                    variant="ghost"
                    part="primary"
                    aria-label={`${threadTitle} ${threadRelationshipStatusLabel(rowStatus)}`}
                    disabled={node?.missing === true}
                    onClick={() => openThread(threadId)}
                  />
                }
              >
                {relationshipContent}
              </TooltipTrigger>
              <RelationshipPopup side="left">{relationshipTooltip}</RelationshipPopup>
            </Tooltip>
            <span aria-hidden="true" className={THREAD_DETAILS_PANEL_SPLIT_SEPARATOR_CLASS} />
            <Tooltip>
              <TooltipTrigger
                render={
                  <ThreadDetailsControl
                    size="sm"
                    variant="ghost"
                    part="secondary"
                    aria-label={
                      parentTitle
                        ? t.chat.relationships.mergeBack(parentTitle)
                        : t.chat.relationships.mergeBackToSourceConversation
                    }
                    disabled={!canMerge || busyAction !== null}
                    onClick={() => void merge()}
                  >
                    {busyAction === "merge" ? (
                      <Spinner size="xs" />
                    ) : (
                      <PullRequestGlyph.merged className="size-3" />
                    )}
                  </ThreadDetailsControl>
                }
              />
              <TooltipPopup side="left">
                {latestMergeBackRun === null
                  ? t.chat.relationships.completeARunInThisForkBefore
                  : parentTitle
                    ? t.chat.relationships.mergeConversation(parentTitle)
                    : t.chat.relationships.mergeThisConversationBackIntoItsSource}
              </TooltipPopup>
            </Tooltip>
            <span className="shrink-0 border border-transparent ps-1 pe-2.5 text-2xs font-medium text-muted-foreground">
              {threadRelationshipStatusLabel(rowStatus)}
            </span>
          </div>
        ) : (
          relationshipLink
        )}
        {canStop && agent ? (
          <div className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 pointer-coarse:pointer-events-auto pointer-coarse:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100">
            <Tooltip>
              <TooltipTrigger
                render={
                  <ThreadDetailsControl
                    size="icon-xs"
                    variant="ghost"
                    part="icon"
                    tone="destructive"
                    aria-label={t.chat.relationships.stopAgent(threadTitle)}
                    disabled={stoppingId !== null}
                    onClick={() => void stopSubagent(threadId, agent)}
                  />
                }
              >
                {stoppingId === threadId ? (
                  <Spinner aria-hidden size="xs" />
                ) : (
                  <SquareIcon aria-hidden className="size-3 fill-current" />
                )}
              </TooltipTrigger>
              <TooltipPopup side="left">{t.chat.relationships.stopSubagent}</TooltipPopup>
            </Tooltip>
          </div>
        ) : null}
      </li>
    );
  };

  return (
    <>
      {lineageVisible ? (
        <ThreadDetailsSection
          headingId="thread-details-lineage-heading"
          title={t.chat.relationships.lineage}
          titleAccessory={
            runningCount > 0 ? (
              <Badge variant="info" data-lineage-running-count>
                {t.chat.relationships.runningCount(runningCount)}
              </Badge>
            ) : null
          }
          // A lone "Previous agents" row names itself; the heading returns for status or actions.
          showHeading={
            runningCount > 0 ||
            canDetach ||
            related.length > 0 ||
            active.length > 0 ||
            delegatedFrom !== undefined
          }
          data-thread-relationships-panel
          actions={
            canDetach ? (
              <Menu>
                <MenuTrigger
                  render={
                    <ThreadDetailsControl
                      size="icon-xs"
                      variant="ghost"
                      part="icon"
                      aria-label={t.chat.relationships.moreThreadActions}
                      disabled={busyAction !== null}
                    />
                  }
                >
                  <MoreHorizontalIcon className="size-3.5" />
                </MenuTrigger>
                <MenuPopup align="end" className="min-w-60 max-w-(--available-width)">
                  <MenuItem onClick={() => void detach()}>
                    <UnplugIcon className="size-3.5" />
                    {t.chat.relationships.disconnectAgentSession}
                  </MenuItem>
                </MenuPopup>
              </Menu>
            ) : null
          }
        >
          {delegatedFrom === undefined ? null : (
            <ThreadLineageRowList hiddenCount={0} onShowMore={() => {}}>
              <DelegatedFromRow
                delegatedFrom={delegatedFrom}
                fallbackLabel={currentThread?.linkOrigin?.label}
              />
            </ThreadLineageRowList>
          )}
          {groups.map((group) => (
            <ThreadLineageGroup key={`${scopedThreadKey(ref)}:${group.id}`} {...group}>
              {(visibleRows) => visibleRows.map(renderRelationshipRow)}
            </ThreadLineageGroup>
          ))}
          {remoteSubagents.length > 0 ? (
            <ThreadLineageRowList hiddenCount={0} onShowMore={() => {}}>
              {remoteSubagents.map((agent) => (
                <RemoteSubagentRow
                  key={agent.id}
                  agent={agent}
                  // Its provider instance belongs to the environment it runs in.
                  provider={providersByEnvironment
                    .get(agent.remoteChild.environmentId)
                    ?.find((entry) => entry.instanceId === agent.providerInstanceId)}
                />
              ))}
            </ThreadLineageRowList>
          ) : null}
        </ThreadDetailsSection>
      ) : null}
      {sideChatsVisible ? (
        <ThreadDetailsSection
          headingId="thread-details-side-chats-heading"
          title={
            runningSideChats > 0
              ? t.chat.sideChat.running(runningSideChats)
              : t.chat.sideChat.plural
          }
          data-thread-side-chats-panel
        >
          <ThreadLineageGroup
            key={`${scopedThreadKey(ref)}:side-chats`}
            label={null}
            rows={sideChats}
            expanded
          >
            {(visibleRows) => visibleRows.map(renderRelationshipRow)}
          </ThreadLineageGroup>
        </ThreadDetailsSection>
      ) : null}
    </>
  );
}
