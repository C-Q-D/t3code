/** Renders live thread rows while the parent list uses quiet shells. */
import { ThreadHoverCard, ThreadHoverCardPopup } from "../ThreadHoverCard";
import {
  ThreadTerminalStatusButton,
  ThreadPullRequestBadgeControl,
  ThreadPullRequestsMiniList,
  ThreadWorktreeIndicator,
  prStatusIndicator,
  resolveThreadPullRequestBadge,
  terminalStatusFromRunningIds,
  type TerminalStatusIndicator,
  useLinkedThreadPullRequest,
  ThreadSearchPullRequestNumber,
} from "../ThreadStatusIndicators";
import { discardComposerDraft } from "../../lib/discardComposerDraft";
import { requestCustomSnooze } from "../CustomSnoozeDialog";
import { useSupportsMultiplePullRequests } from "~/hooks/useSupportsMultiplePullRequests";
import { useDeadlinePassed } from "~/hooks/useDeadline";
import { resolveThreadCurrentPullRequestLink } from "@t3tools/client-runtime/thread-pull-requests";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  canSnooze,
  hasQueuedTurnStart,
  QUEUED_TURN_START_GRACE_MS,
} from "@t3tools/client-runtime/state/thread-settled";
import { formatDiffCount } from "@t3tools/client-runtime/diff-count";
import { resolveSettledThreadTimestamp } from "@t3tools/client-runtime/state/thread-sort";
import { type EnvironmentThreadSearchMatch } from "@t3tools/client-runtime/state/thread-search";
import { resolveThreadProviderStack } from "@t3tools/client-runtime/state/models";
import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import {
  AuthOrchestrationOperateScope,
  type EnvironmentMachineKind,
  type EnvironmentId,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import { type TimestampFormat } from "@t3tools/contracts/settings";
import {
  AlarmClockIcon,
  AlarmClockOffIcon,
  ArrowRightLeftIcon,
  CheckIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  GitBranchIcon,
  PinIcon,
  PinOffIcon,
  SquarePenIcon,
  TerminalIcon,
  Undo2Icon,
  XIcon,
  MessagesSquareIcon,
} from "lucide-react";
import {
  memo,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useRightPanelStore } from "../../rightPanelStore";
import { useOpenPrLink } from "../../lib/openPullRequestLink";
import { useUiStateStore } from "../../uiStateStore";
import { useThreadSelectionStore } from "../../threadSelectionStore";
import { useNowMinute } from "../../hooks/useNowMinute";
import { vcsEnvironment } from "../../state/vcs";
import { useEnvironmentQuery } from "../../state/query";
import { readEnvironmentScope, useEnvironmentScope } from "../../state/session";
import {
  formatRelativeTimeLabel,
  parseTimestampDate,
  formatChatTimestampTooltip,
} from "../../timestampFormat";
import { type SidebarThreadSummary } from "../../types";
import { type EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import { cn } from "~/lib/utils";
import { textDirection } from "~/textDirection";
import { EnvironmentMachineIcon } from "../EnvironmentMachineIcon";
import {
  animateSidebarLayoutChanges,
  hasUnseenCompletion,
  resolveSidebarRowAccessibility,
  type SidebarDropVerb,
  resolveSidebarThreadStatus,
  resolveThreadLastVisitedAt,
  useRetainedValue,
  useSidebarRowSubscriptionLease,
  compactSidebarTimeLabel,
  sidebarSearchTextSegments,
} from "../Sidebar.logic";
import { resolveLocalCheckoutBranchMismatch } from "../BranchToolbar.logic";
import { pickSnoozePreset, resolveSnoozePresets, type SnoozePreset } from "../Sidebar.snooze";
import { useThreadShell } from "../../state/entities";
import { ProjectFavicon, type ProjectFaviconProject } from "../ProjectFavicon";
import { makeWorkspaceFileDropHandlers } from "../chat/workspaceFileDrop";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import { getTriggerDisplayModelName } from "../chat/providerIconUtils";
import { shouldShowInstanceBadge, type ProviderInstanceEntry } from "../../providerInstances";
import { useThreadRunningTerminalIds } from "../../state/terminalSessions";
import { InlineButton } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuShortcut, MenuTrigger } from "../ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { MiddleTruncate } from "../ui/middle-truncate";
import { useThreadHasUnsentDraft } from "../../composerDraftStore";
import { t } from "~/i18n";
import { useFocusVisibleWithin } from "../../hooks/useFocusVisibleWithin";
import { SNOOZE_UI_ENABLED } from "../../snoozeUi";
import { useClientSettings } from "../../hooks/useSettings";
import { useStableCallback } from "../../hooks/useStableCallback";
import { Badge } from "../ui/badge";

// The fields thread rows show. Provider status pushes refresh `checkedAt`,
// status and auth on every provider; leaving those out keeps each
// environment's map, and every memoized row, stable across them.
export type SidebarProviderEntry = Pick<
  ProviderInstanceEntry,
  | "instanceId"
  | "driverKind"
  | "enabled"
  | "displayName"
  | "accentColor"
  | "acpRegistryAgentId"
  | "acpRegistryIconUrl"
  | "models"
>;

/** Owns the clock subscription so memoized rows do not freeze relative labels. */
function RelativeTimeLabel(props: { timestamp: string | null }) {
  const nowMinute = useNowMinute();
  return props.timestamp === null
    ? null
    : compactSidebarTimeLabel(
        formatRelativeTimeLabel(props.timestamp, Date.parse(`${nowMinute}:00.000Z`)),
      );
}

function JumpHintBadge(props: { label: string }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute right-2.5 top-1/2 z-10 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-sidebar-quick-action bg-primary font-mono text-secondary-copy-large font-medium text-primary-foreground shadow-sidebar-jump text-shadow-none"
    >
      {props.label}
    </span>
  );
}

function terminalProcessLabel(count: number): string {
  return t.sidebar.thread.terminalProcessCount(count);
}

/** Keeps every configured provider role and its instance label; B1 sizes the current role at 18px. */
function SidebarProviderStack(props: {
  thread: SidebarThreadSummary;
  providerEntryByInstanceId: ReadonlyMap<string, SidebarProviderEntry>;
}) {
  const stack = resolveThreadProviderStack(props.thread);
  const currentInstanceId = stack[stack.length - 1]!;
  const currentEntry = props.providerEntryByInstanceId.get(currentInstanceId) ?? null;
  if (currentEntry === null) return null;
  const showInstanceBadge = shouldShowInstanceBadge(
    currentEntry,
    props.providerEntryByInstanceId.values(),
  );
  const current = (
    <ProviderInstanceIcon
      driverKind={currentEntry.driverKind}
      displayName={currentEntry.displayName}
      accentColor={currentEntry.accentColor}
      acpRegistryAgentId={currentEntry.acpRegistryAgentId}
      acpRegistryIconUrl={currentEntry.acpRegistryIconUrl}
      showBadge={showInstanceBadge}
      // Instance labels still disambiguate configured providers; these are not run-state badges.
      iconClassName="size-4.5"
      badgeClassName="-right-0.75 -bottom-0.75 h-3 min-w-3 px-0.5 text-5xs"
    />
  );
  if (stack.length === 1) {
    return <span className="inline-flex shrink-0 items-center">{current}</span>;
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5">
      {stack.slice(0, -1).map((instanceId) => {
        const entry = props.providerEntryByInstanceId.get(instanceId);
        if (entry === undefined) return null;
        return (
          <ProviderInstanceIcon
            key={instanceId}
            driverKind={entry.driverKind}
            displayName={entry.displayName}
            acpRegistryAgentId={entry.acpRegistryAgentId}
            acpRegistryIconUrl={entry.acpRegistryIconUrl}
            iconClassName="size-3 opacity-35 grayscale"
          />
        );
      })}
      <span className="relative z-10 inline-flex items-center">{current}</span>
    </span>
  );
}

/**
 * Renders the detail popup used by SidebarThreadRow on hover or keyboard focus.
 * Shows the title, Started time and available Last reply state, followed by optional
 * project, environment, branch/mismatch, model/provider, handoff, terminal and error
 * rows; supported pull requests appear in the footer. Times use the client clock setting.
 * @param props Row-owned inputs derived from the thread shell, project/environment
 * metadata, provider registry, branch comparison and terminal state. `thread` supplies
 * creation and latest-run timestamps, provider history, errors and pull requests.
 * `project` supplies the favicon; nullable display labels omit their respective rows.
 * `environmentMachine` selects the machine icon. `providerEntry`, the instance map,
 * `modelInstanceId`, `modelLabel` and `showInstanceBadge` describe the resolved model
 * and provider presentation. Nullable `branchMismatch` and `terminalStatus` control
 * their detail rows; `terminalProcessCount` supplies the terminal summary count.
 * @returns A read-only hover card; absent reply data omits Last reply, while an active
 * run without a completion time shows Replying. This component does not mutate threads.
 */
function SidebarThreadTooltip({
  thread,
  project,
  projectDisplayName,
  environmentLabel,
  environmentMachine,
  providerEntry,
  providerEntryByInstanceId,
  showInstanceBadge,
  modelInstanceId,
  modelLabel,
  branchMismatch,
  terminalStatus,
  terminalProcessCount,
}: {
  thread: SidebarThreadSummary;
  project: ProjectFaviconProject | null;
  projectDisplayName: string | null;
  environmentLabel: string | null;
  environmentMachine: EnvironmentMachineKind;
  providerEntry: SidebarProviderEntry | null;
  providerEntryByInstanceId: ReadonlyMap<string, SidebarProviderEntry>;
  showInstanceBadge: boolean;
  modelInstanceId: string;
  modelLabel: string;
  branchMismatch: {
    threadBranch: string;
    currentBranch: string;
  } | null;
  terminalStatus: TerminalStatusIndicator | null;
  terminalProcessCount: number;
}) {
  const driverKind = providerEntry?.driverKind ?? null;
  const timestampFormat = useClientSettings((settings) => settings.timestampFormat);
  const lastReply = resolveSidebarLastReply(thread.latestRun);
  const previousProviderNames = thread.providerInstanceHistory
    .filter((instanceId) => instanceId !== modelInstanceId)
    .map((instanceId) => providerEntryByInstanceId.get(instanceId)?.displayName ?? instanceId);
  const supportsMultiplePullRequests = useSupportsMultiplePullRequests(thread.environmentId);
  return (
    <ThreadHoverCardPopup side="right" align="start" sideOffset={4}>
      <ThreadHoverCard
        title={thread.title}
        footer={
          supportsMultiplePullRequests && thread.pullRequests.length > 0 ? (
            <div className="border-t border-border/60 pt-2 pl-0.5 text-xs text-muted-foreground">
              <ThreadPullRequestsMiniList pullRequests={thread.pullRequests} />
            </div>
          ) : null
        }
      >
        <div className="flex min-w-0 items-center gap-2">
          <AlarmClockIcon aria-hidden className="size-3 shrink-0 stroke-muted-foreground" />
          <div className="min-w-0 text-foreground/75">
            {t.sidebar.thread.started}{" "}
            {formatChatTimestampTooltip(thread.createdAt, timestampFormat)}
          </div>
        </div>
        {lastReply ? (
          <div className="flex min-w-0 items-center gap-2">
            <MessagesSquareIcon aria-hidden className="size-3 shrink-0 stroke-muted-foreground" />
            <div className="min-w-0 text-foreground/75">
              {t.sidebar.thread.lastReply}{" "}
              {lastReply.status === "replying"
                ? t.sidebar.thread.replying
                : t.sidebar.thread.replyTime(
                    formatChatTimestampTooltip(lastReply.completedAt, timestampFormat),
                    formatRelativeTimeLabel(lastReply.completedAt),
                  )}
            </div>
          </div>
        ) : null}
        {projectDisplayName ? (
          <div className="flex min-w-0 items-center gap-2">
            {project ? <ProjectFavicon project={project} className="size-3 shrink-0" /> : null}
            <div className="min-w-0 truncate text-foreground/75">{projectDisplayName}</div>
          </div>
        ) : null}
        {environmentLabel ? (
          <div className="flex min-w-0 items-center gap-2">
            <EnvironmentMachineIcon
              kind={environmentMachine}
              className="size-3 shrink-0 stroke-muted-foreground"
            />
            <div className="min-w-0 truncate text-foreground/75">{environmentLabel}</div>
          </div>
        ) : null}
        {thread.branch ? (
          <div className="flex min-w-0 items-center gap-2">
            <GitBranchIcon className="size-3 shrink-0 stroke-muted-foreground" />
            <MiddleTruncate value={thread.branch} className="flex" />
          </div>
        ) : null}
        {branchMismatch ? (
          <div className="flex min-w-0 items-start gap-2 text-warning">
            <CircleAlertIcon aria-hidden className="mt-0.5 size-3 shrink-0 stroke-current" />
            <div className="min-w-0 flex-1 wrap-break-word">
              {t.sidebar.thread.branchMismatchHint}
            </div>
          </div>
        ) : null}
        {driverKind ? (
          <div className="flex min-w-0 items-center gap-2">
            <ProviderInstanceIcon
              driverKind={driverKind}
              displayName={
                providerEntry?.displayName ?? thread.runtime?.providerName ?? modelInstanceId
              }
              accentColor={providerEntry?.accentColor}
              acpRegistryAgentId={providerEntry?.acpRegistryAgentId}
              acpRegistryIconUrl={providerEntry?.acpRegistryIconUrl}
              // Initials would swallow a size-3 glyph: accent dot, name in label.
              showBadge={showInstanceBadge && providerEntry?.accentColor !== undefined}
              badgeContent="none"
              badgeClassName="h-2 min-w-2 px-0"
              iconClassName="size-3 shrink-0 grayscale opacity-60"
            />
            <div className="min-w-0 truncate text-foreground/75">
              {showInstanceBadge && providerEntry
                ? `${modelLabel} · ${providerEntry.displayName}`
                : modelLabel}
            </div>
          </div>
        ) : null}
        {previousProviderNames.length > 0 ? (
          <div className="flex min-w-0 items-center gap-2">
            <ArrowRightLeftIcon className="size-3 shrink-0 stroke-muted-foreground" />
            <div className="min-w-0 truncate text-foreground/75">
              {t.sidebar.thread.handedOffFrom(previousProviderNames.join(", "))}
            </div>
          </div>
        ) : null}
        {terminalStatus ? (
          <div className="flex min-w-0 items-center gap-2">
            <TerminalIcon
              aria-hidden
              className={cn("size-3 shrink-0", terminalStatus.colorClass)}
            />
            <div className="min-w-0 truncate text-foreground/75">
              {terminalProcessLabel(terminalProcessCount)}
            </div>
          </div>
        ) : null}
        {thread.runtime?.lastError ? (
          <div
            className={cn(
              "flex min-w-0 items-center gap-2",
              thread.runtime.lastErrorClass === "usage_limit" ? "text-warning" : "text-error",
            )}
          >
            <CircleAlertIcon className="size-3 shrink-0 stroke-current" />
            <div className="min-w-0 truncate">
              {thread.runtime.lastErrorClass === "usage_limit"
                ? t.sidebar.thread.usageLimitHint
                : t.sidebar.thread.errorHint}
            </div>
          </div>
        ) : null}
      </ThreadHoverCard>
    </ThreadHoverCardPopup>
  );
}

/**
 * Hover entry point for snooze: a clock button opening the preset menu.
 * Controlled by the row (which also uses the open state to pin its hover
 * actions while the menu is up).
 */
function SnoozeMenuButton(props: {
  environmentId: EnvironmentId;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSnooze: (preset: Pick<SnoozePreset, "snoozedUntil">) => void;
  timestampFormat: TimestampFormat;
}) {
  const { open, onOpenChange, onSnooze, timestampFormat, environmentId } = props;
  // Presets resolve at open time so "In 1 hour" is relative to the click,
  // not to when the row mounted.
  const presets = open
    ? // oxlint-disable-next-line react/purity -- Reopening the menu resolves relative presets from a fresh clock.
      resolveSnoozePresets(new Date(), timestampFormat, environmentId)
    : [];
  return (
    <Menu open={open} onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger
          render={
            <MenuTrigger
              render={
                <button
                  type="button"
                  aria-label={t.sidebar.thread.snoozeAriaLabel}
                  onClick={(event) => event.stopPropagation()}
                  onDoubleClick={(event) => event.stopPropagation()}
                  className="inline-flex size-7.5 cursor-pointer items-center justify-center rounded-full bg-secondary text-code-foreground shadow-raise-xs-control outline-none hover:text-foreground focus-visible:inset-shadow-focus"
                />
              }
            />
          }
        >
          <AlarmClockIcon className="size-3.75" />
        </TooltipTrigger>
        <TooltipPopup>{t.sidebar.thread.snoozeAriaLabel}</TooltipPopup>
      </Tooltip>
      <MenuPopup side="bottom" align="end">
        {presets.map((preset) => (
          <MenuItem
            key={preset.id}
            onClick={(event) => {
              event.stopPropagation();
              const picked = pickSnoozePreset(presets, preset.id, timestampFormat, environmentId);
              if (picked) onSnooze(picked);
            }}
          >
            {preset.label}
            <MenuShortcut>{preset.whenLabel}</MenuShortcut>
          </MenuItem>
        ))}
        {presets.length > 0 ? <MenuSeparator /> : null}
        <MenuItem
          onClick={async (event) => {
            event.stopPropagation();
            const choice = await requestCustomSnooze();
            if (choice) onSnooze(choice);
          }}
        >
          {t.sidebar.snooze.custom}
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}

// Subset of useSortable applied to a thread row's root <li>. Listeners go
// on the whole row (no dedicated handle): the pointer sensor's distance
// constraint keeps plain clicks working, and we skip dnd-kit's aria
// attributes since there is no keyboard sensor and the row body already
// carries its own button semantics.
type SortableThreadRowBag = Pick<
  ReturnType<typeof useSortable>,
  "listeners" | "setNodeRef" | "transform" | "transition" | "isDragging"
>;

// Drafts share the ordinary card surface; the pen conveys unsent work in B1.
export const draftSurfaceClassName =
  "bg-transparent hover:bg-sidebar-row-hover hover:shadow-raise-xs-control";

export const draftPenClassName = "size-3.25 shrink-0 text-secondary-label";

// useSortable memoizes on its `disabled` object, so a fresh one per render
// re-renders every row and marker on each sidebar update.
export const SIDEBAR_SORTABLE_DRAG_DISABLED = { draggable: true } as const;

const SIDEBAR_SORTABLE_DRAG_ENABLED = { draggable: false } as const;

// Takes the row's props rather than a render function: a closure from the
// sidebar body is new on every sidebar render, which rebuilt the bag and
// re-rendered every memoized row with it.
export function SortableThreadRow(
  props: Omit<SidebarThreadRowProps, "sortable"> & {
    sortableId: string;
    sortableDisabled: boolean;
    contextDrag: boolean;
  },
) {
  const { sortableId, sortableDisabled, contextDrag, ...rowProps } = props;
  const canOperateThread = useEnvironmentScope(
    rowProps.thread.environmentId,
    AuthOrchestrationOperateScope,
  );
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sortableId,
    disabled:
      sortableDisabled || !canOperateThread
        ? SIDEBAR_SORTABLE_DRAG_DISABLED
        : SIDEBAR_SORTABLE_DRAG_ENABLED,
    animateLayoutChanges: animateSidebarLayoutChanges,
  });
  // dnd-kit memoizes each field but not the bag, so the memoized row would
  // rerender on every shell update without this.
  const bag = {
    listeners,
    setNodeRef,
    transform: contextDrag ? null : transform,
    transition: contextDrag && isDragging ? "transform 150ms ease-out" : transition,
    isDragging: isDragging && !contextDrag,
  };
  // The sidebar arranges rows from quiet shells, which hold still while a
  // thread streams; reading the live shell here re-renders only this row.
  const thread =
    useThreadShell(scopeThreadRef(rowProps.thread.environmentId, rowProps.thread.id)) ??
    rowProps.thread;
  // Keyed by variant so a card/slim switch remounts the row.
  return <SidebarThreadRow key={rowProps.variant} {...rowProps} thread={thread} sortable={bag} />;
}

export type SidebarSweepAction = "settle" | "unsettle" | "unsnooze";

// Verb and icon on the lifted row while it hovers over another section. Uses
// the same icons as the row actions and context menu so the drop reads as the
// action it performs.
const dropVerbBadge: Record<SidebarDropVerb, ReactNode> = {
  pin: (
    <>
      <PinIcon aria-hidden className="size-3" />
      {t.sidebar.actions.pin}
    </>
  ),
  unpin: (
    <>
      <PinOffIcon aria-hidden className="size-3" />
      {t.sidebar.actions.unpin}
    </>
  ),
  settle: (
    <>
      <CircleCheckIcon aria-hidden className="size-3" />
      {t.sidebar.actions.settle}
    </>
  ),
  unsettle: (
    <>
      <Undo2Icon aria-hidden className="size-3" />
      {t.sidebar.actions.unsettle}
    </>
  ),
  wake: (
    <>
      <AlarmClockOffIcon aria-hidden className="size-3" />
      {t.sidebar.actions.wake}
    </>
  ),
};

/** Presents B1 card/compact states with existing capability-gated actions; row subscriptions remain local. */
type SidebarThreadRowProps = {
  thread: SidebarThreadSummary;
  variant: "card" | "slim";
  navigationParent?: string | undefined;
  // Settled rows un-settle, snoozed rows wake, and cards settle.
  variantAction: SidebarSweepAction;
  // False on environments whose server predates thread.settle/unsettle:
  // the lifecycle affordances hide entirely rather than fail on click.
  settlementSupported: boolean;
  // Same contract for thread.snooze/unsnooze.
  snoozeSupported: boolean;
  // Renders the pin glyph. Pinned cards keep the full settle/snooze quick
  // actions: settling clears the pin server-side, and snoozing hides the
  // card until wake with the pin intact underneath. The glyph is also the
  // in-row pin state cue (the pinned block has no header), so it always
  // shows while pinned; it only becomes a clickable unpin quick-action once
  // the pinning capability is confirmed, and stays a passive marker while
  // the descriptor is not loaded. Pinning itself lives in the context menu.
  pinningSupported: boolean;
  isPinned: boolean;
  // Present on rows whose server supports every drop outcome: dnd-kit
  // sortable bag applied to the row root so the whole row drags (the
  // pointer sensor's distance constraint keeps plain clicks working).
  sortable?: SortableThreadRowBag | undefined;
  dropVerb: SidebarDropVerb | null;
  // While dragging, the pin marker stays only for a pinned thread still over
  // the pinned section. Any other position shows the verb badge instead, and
  // the badge carries its own icon.
  dragOverPinned: boolean;
  // The action this row will take when the sweep is released.
  sweepAction: SidebarSweepAction | null;
  // Compact wake countdown ("2h") for rows in the snoozed shelf.
  snoozeWakeLabelText: string | null;
  // When a snooze ended (timer or early wake); drives the Woke pill until
  // the user visits the thread.
  wokeAt: string | null;
  isActive: boolean;
  // Set on the active row only; scrolls it into view when a reveal is owed.
  revealRef?: ((row: HTMLElement, threadKey: string) => void) | undefined;
  // Unlike isActive, never true for the ancestor standing in for an open
  // subagent: drafts and PR clicks care about which composer is on screen.
  isRouteThread: boolean;
  openPullRequestsInRightPanel: boolean;
  jumpLabel: string | null;
  currentEnvironmentId: string | null;
  environmentLabel: string | null;
  environmentMachine: EnvironmentMachineKind;
  scratchMachineLabel: string | null;
  project: EnvironmentProject | null;
  projectDisplayName: string | null;
  providerEntryByInstanceId: ReadonlyMap<string, SidebarProviderEntry>;
  timestampFormat: TimestampFormat;
  onThreadClick: (event: ReactMouseEvent, threadRef: ScopedThreadRef) => void;
  onThreadActivate: (threadRef: ScopedThreadRef) => void;
  onStartRename: (threadRef: ScopedThreadRef, title: string) => void;
  onRenameTitleChange: (title: string) => void;
  onCommitRename: (threadRef: ScopedThreadRef, title: string, originalTitle: string) => void;
  onCancelRename: () => void;
  isRenaming: boolean;
  renamingTitle: string;
  onContextMenu: (
    threadRef: ScopedThreadRef,
    position: { x: number; y: number },
    trigger?: HTMLElement,
  ) => void;
  onSettle: (threadRef: ScopedThreadRef) => void;
  onActionSweepStart: (
    threadRef: ScopedThreadRef,
    action: SidebarSweepAction,
    event: PointerEvent,
  ) => void;
  onUnsettle: (threadRef: ScopedThreadRef) => void;
  onSnooze: (threadRef: ScopedThreadRef, preset: Pick<SnoozePreset, "snoozedUntil">) => void;
  onUnsnooze: (threadRef: ScopedThreadRef) => void;
  onUnpin: (threadRef: ScopedThreadRef) => void;
  onAcknowledgeWoke: (threadRef: ScopedThreadRef, visitedAt: string) => void;
  onFileDropThreads?: ((threadRef: ScopedThreadRef, files: File[]) => void) | undefined;
};

// Mounted only while renaming, so each rename starts uncommitted.
/** Mounts a fresh title draft for each rename session; composition guards prevent Enter from committing an unfinished IME conversion. */
function ThreadRenameInput(props: {
  title: string;
  onTitleChange: (title: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  // Enter and Escape blur the input as it unmounts; that blur must not commit again.
  const settledRef = useRef(false);
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === "Enter") {
      event.preventDefault();
      settledRef.current = true;
      props.onCommit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      settledRef.current = true;
      props.onCancel();
    }
  };
  return (
    <input
      autoFocus
      value={props.title}
      dir="auto"
      aria-label={t.sidebar.thread.titleAriaLabel}
      onChange={(event) => props.onTitleChange(event.target.value)}
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={handleKeyDown}
      onBlur={() => {
        if (!settledRef.current) props.onCommit();
      }}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      className="min-w-0 flex-1 rounded-keycap border border-border bg-input px-1 text-control text-foreground outline-none focus-visible:inset-shadow-focus"
    />
  );
}

const SidebarThreadRow = memo(function SidebarThreadRow(props: SidebarThreadRowProps) {
  const {
    isRenaming,
    onCancelRename,
    onCommitRename,
    onContextMenu,
    onAcknowledgeWoke,
    onFileDropThreads,
    onRenameTitleChange,
    onSettle,
    onActionSweepStart,
    onSnooze,
    onStartRename,
    onThreadActivate,
    onThreadClick,
    onUnsettle,
    onUnsnooze,
    onUnpin,
    openPullRequestsInRightPanel,
    renamingTitle,
    thread,
    variant,
    variantAction,
  } = props;
  const threadRef = (() => scopeThreadRef(thread.environmentId, thread.id))();
  const threadKey = scopedThreadKey(threadRef);
  const canOperateThread = useEnvironmentScope(thread.environmentId, AuthOrchestrationOperateScope);
  useEffect(() => {
    if (!canOperateThread && isRenaming) onCancelRename();
  }, [canOperateThread, isRenaming, onCancelRename]);
  const { leaseLiveStatus, rowRef: leaseRowRef } = useSidebarRowSubscriptionLease(props.isActive);
  const rowRef = (row: HTMLElement | null) => {
    if (row !== null) props.revealRef?.(row, threadKey);
    return leaseRowRef(row);
  };
  const focusVisibleWithin = useFocusVisibleWithin();
  const isRegeneratingTitle = thread.titleRegeneration != null;
  const localLastVisitedAt = useUiStateStore((state) => state.threadLastVisitedAtById[threadKey]);
  const lastVisitedAt = resolveThreadLastVisitedAt(thread.lastVisitedAt, localLastVisitedAt);
  const isSelected = useThreadSelectionStore((state) => state.selectedThreadKeys.has(threadKey));
  const openPrLink = useOpenPrLink();
  const runningTerminalIds = useThreadRunningTerminalIds({
    environmentId: thread.environmentId,
    threadId: thread.id,
  });
  const terminalStatus = terminalStatusFromRunningIds(runningTerminalIds);
  const terminalProcessCount = runningTerminalIds.length;
  // Unsent composer text on this thread. The open thread shows its own
  // composer, so the marker only decorates rows you have navigated away from.
  const hasUnsentDraft = useThreadHasUnsentDraft(threadRef) && !props.isRouteThread;
  const handleDiscardDraftClick = (event: ReactMouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    discardComposerDraft(threadRef);
  };

  const gitCwd = thread.worktreePath ?? props.project?.workspaceRoot ?? null;
  const linkedPullRequestStatus = useLinkedThreadPullRequest(
    thread.environmentId,
    thread.linkedPullRequest,
    leaseLiveStatus,
    thread.pullRequests,
    thread.branchPullRequest,
  );
  const gitStatus = useEnvironmentQuery(
    leaseLiveStatus && (thread.branch != null || thread.worktreePath !== null) && gitCwd !== null
      ? vcsEnvironment.status({
          environmentId: thread.environmentId,
          input: { cwd: gitCwd, includeRemote: false },
        })
      : null,
  );
  const visibleGitStatus = useRetainedValue(
    JSON.stringify([thread.environmentId, gitCwd]),
    gitStatus.data,
  );
  const pr = linkedPullRequestStatus?.pr ?? null;
  const supportsMultiplePullRequests = useSupportsMultiplePullRequests(thread.environmentId);
  const currentLinkedPr = supportsMultiplePullRequests
    ? resolveThreadCurrentPullRequestLink(thread.pullRequests)
    : null;

  // Same semantics as the legacy sidebar (never-visited counts as read):
  // switching sidebars must not light up every historical thread as unread.
  const isUnread = hasUnseenCompletion({ ...thread, lastVisitedAt });
  const status = resolveSidebarThreadStatus(thread);

  // A woken thread reappears at its original position (the sort is
  // deliberately static), so the pill has to carry the weight. Snoozing is
  // an explicit act, so the pill clears only when the user re-engages:
  // reading a completion-triggered wake, clicking the pill, sending a
  // message, settling, archiving, or a change request state that settles the
  // thread. Timer wakes survive a mere visit. An unparseable visit timestamp
  // counts as never-visited, so corrupt local data cannot eat the wake signal.
  const lastVisitedDate = lastVisitedAt === undefined ? null : parseTimestampDate(lastVisitedAt);
  const wokeAtDate = props.wokeAt === null ? null : parseTimestampDate(props.wokeAt);
  const isWoke =
    SNOOZE_UI_ENABLED &&
    wokeAtDate !== null &&
    (lastVisitedDate === null || lastVisitedDate < wokeAtDate) &&
    thread.settledOverride !== "settled";
  // B1 uses static semantic pills; the running glyph does not repaint on a timer.
  const topStatus =
    status === "working"
      ? {
          label:
            thread.goal?.status === "active" ? t.sidebar.status.goal : t.sidebar.status.working,
          icon: "working" as const,
          className: "bg-update-surface text-update-foreground",
        }
      : status === "waiting"
        ? {
            label: t.sidebar.status.waiting,
            icon: null,
            className: "bg-warning-surface text-status-warning-foreground text-shadow-none",
          }
        : status === "approval"
          ? {
              label: t.sidebar.status.approval,
              icon: "approval" as const,
              className: "bg-primary text-primary-foreground font-bold text-shadow-none",
            }
          : status === "input"
            ? {
                label: t.sidebar.status.input,
                icon: "input" as const,
                className: "bg-primary text-primary-foreground font-bold text-shadow-none",
              }
            : status === "limited"
              ? {
                  label: t.sidebar.status.limited,
                  icon: "failed" as const,
                  className:
                    "bg-status-restricted text-status-restricted-foreground text-shadow-none",
                }
              : status === "failed"
                ? {
                    label: t.sidebar.status.failed,
                    icon: "failed" as const,
                    className: "bg-status-error text-status-error-foreground text-shadow-none",
                  }
                : isWoke
                  ? {
                      label: t.sidebar.status.woke,
                      icon: "woke" as const,
                      className:
                        "bg-warning-surface text-status-warning-foreground text-shadow-none",
                    }
                  : isUnread
                    ? {
                        label: t.sidebar.status.done,
                        icon: "done" as const,
                        className: "bg-status-success text-success-foreground",
                      }
                    : null;
  const isWokeStatus = topStatus?.icon === "woke";

  const branchMismatch = resolveLocalCheckoutBranchMismatch({
    effectiveEnvMode: thread.worktreePath === null ? "local" : "worktree",
    activeWorktreePath: thread.worktreePath,
    activeThreadBranch: thread.branch,
    currentGitBranch: visibleGitStatus?.refName ?? null,
  });
  const prStatus = prStatusIndicator(pr, linkedPullRequestStatus?.sourceControlProvider);

  const modelInstanceId = thread.runtime?.providerInstanceId ?? thread.modelSelection.instanceId;
  const providerEntry = props.providerEntryByInstanceId.get(modelInstanceId) ?? null;
  const showInstanceBadge =
    providerEntry !== null &&
    shouldShowInstanceBadge(providerEntry, props.providerEntryByInstanceId.values());
  const selectedModel = providerEntry?.models.find(
    (model) => model.slug === thread.modelSelection.model,
  );
  const modelLabel = selectedModel
    ? getTriggerDisplayModelName(selectedModel, providerEntry?.driverKind)
    : thread.modelSelection.model;

  // The local environment is "this machine" and needs no marker; every other
  // one gets its machine glyph. With no local environment (the hosted app)
  // that is every thread, which is the point: the glyph is what tells rows on
  // different machines apart.
  const isRemote = thread.environmentId !== props.currentEnvironmentId;
  const showsScratchMachine = !thread.branch && props.scratchMachineLabel !== null;

  const detailsTooltip = (
    <SidebarThreadTooltip
      thread={thread}
      project={props.project}
      projectDisplayName={props.projectDisplayName}
      environmentLabel={props.environmentLabel}
      environmentMachine={props.environmentMachine}
      providerEntry={providerEntry}
      providerEntryByInstanceId={props.providerEntryByInstanceId}
      showInstanceBadge={showInstanceBadge}
      modelInstanceId={modelInstanceId}
      modelLabel={modelLabel}
      branchMismatch={branchMismatch}
      terminalStatus={terminalStatus}
      terminalProcessCount={terminalProcessCount}
    />
  );

  const handleClick = (event: ReactMouseEvent) => {
    onThreadClick(event, threadRef);
  };
  const handleAcknowledgeWokeClick = (event: ReactMouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (props.wokeAt === null) return;
    onAcknowledgeWoke(threadRef, props.wokeAt);
  };
  const { handleContextMenu, handleKeyDown } = useSidebarThreadContextMenuTrigger(
    threadRef,
    onContextMenu,
    onThreadActivate,
  );
  const handleDoubleClick = (event: ReactMouseEvent) => {
    if (
      !readEnvironmentScope(threadRef.environmentId, AuthOrchestrationOperateScope) ||
      isRenaming ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    if ((event.target as HTMLElement).closest("button, a, input")) return;
    event.preventDefault();
    onStartRename(threadRef, thread.title);
  };
  const [isFileDragOver, setIsFileDragOver] = useState(false);
  const fileDropHandlers = (() =>
    onFileDropThreads
      ? makeWorkspaceFileDropHandlers({
          setDragActive: setIsFileDragOver,
          addFiles: (files) => {
            onFileDropThreads(threadRef, files);
          },
          addFolders: () => {},
        })
      : null)();
  useEffect(() => {
    if (!isFileDragOver) return;
    const clearFileDrag = () => setIsFileDragOver(false);
    window.addEventListener("dragend", clearFileDrag);
    return () => window.removeEventListener("dragend", clearFileDrag);
  }, [isFileDragOver]);

  const handleSettleClick = (event: ReactMouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onSettle(threadRef);
  };
  const handleActionPointerDown = (event: ReactPointerEvent) => {
    if (!event.isPrimary || event.button !== 0) return;
    // Action buttons sweep their section rather than picking up the row.
    event.stopPropagation();
    onActionSweepStart(threadRef, variantAction, event.nativeEvent);
  };
  const handleUnsettleClick = (event: ReactMouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onUnsettle(threadRef);
  };
  const handleUnsnoozeClick = (event: ReactMouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onUnsnooze(threadRef);
  };
  const handleUnpinClick = (event: ReactMouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onUnpin(threadRef);
  };
  const handleSnoozePreset = (preset: Pick<SnoozePreset, "snoozedUntil">) => {
    onSnooze(threadRef, preset);
  };
  // While the snooze popover is open the pointer leaves the row, which
  // would fade the hover actions out from under the open menu. Pin them and
  // suppress the row tooltip so its portal cannot overlap the popover.
  const [snoozeMenuOpenRaw, setSnoozeMenuOpen] = useState(false);
  // Snooze is offered only where it can succeed: capability-gated and never
  // on blocked-on-you work or queued turns (the server rejects both).
  // The React Compiler caches render results on their inputs, so a clock read
  // here would stay frozen until `thread` changes and a queued-turn gate would
  // never reopen. The gate's clock is state, reset with the thread.
  const [snoozeGateClock, setSnoozeGateClock] = useState(() => ({
    thread,
    now: new Date().toISOString(),
  }));
  if (snoozeGateClock.thread !== thread) {
    // oxlint-disable-next-line react/purity -- Reseeds the snooze gate clock only in the render-phase adjustment that runs when the thread changes.
    setSnoozeGateClock({ thread, now: new Date().toISOString() });
  }
  const snoozeGateNow = snoozeGateClock.now;
  const snoozeGateExpiryMs = hasQueuedTurnStart(thread, { now: snoozeGateNow })
    ? Date.parse(thread.latestUserMessageAt ?? "") + QUEUED_TURN_START_GRACE_MS
    : Number.NaN;
  // A gate still closed past its expiry is held by runtime status, not time,
  // so no clock tick can open it.
  const snoozeGateOpensAt =
    Number.isFinite(snoozeGateExpiryMs) && snoozeGateExpiryMs > Date.parse(snoozeGateNow)
      ? snoozeGateExpiryMs + 50
      : null;
  const snoozeGateOpened = useDeadlinePassed(snoozeGateOpensAt);
  if (snoozeGateOpened && snoozeGateOpensAt !== null) {
    setSnoozeGateClock({ thread, now: new Date(snoozeGateOpensAt).toISOString() });
  }
  const showSnoozeButton =
    SNOOZE_UI_ENABLED &&
    canOperateThread &&
    props.snoozeSupported &&
    canSnooze(thread, { now: snoozeGateNow });
  const showHoverActions =
    (canOperateThread && props.settlementSupported) || showSnoozeButton || hasUnsentDraft;
  // Reset when the button disappears so a later remount cannot reopen a stale menu.
  if (snoozeMenuOpenRaw && !showSnoozeButton) setSnoozeMenuOpen(false);
  const snoozeMenuOpen = snoozeMenuOpenRaw && showSnoozeButton;
  const handlePrClick = (event: ReactMouseEvent<HTMLElement>, targetUrl?: string) => {
    const url = targetUrl ?? pr?.url ?? currentLinkedPr?.url;
    if (!url) return;
    const showInRightPanel = targetUrl !== undefined || openPullRequestsInRightPanel;
    const openedInRightPanel = openPrLink(event, url, showInRightPanel ? threadRef : undefined);
    if (openedInRightPanel && showInRightPanel && !props.isRouteThread) {
      onThreadActivate(threadRef);
    }
  };

  // B1 reserves elevation for hover/current and the white inset for multi-selection.
  // Draft and background-work state stays in the content rather than tinting the row.
  const rowSurfaceClassName = cn(
    "group/sidebar-row relative w-full cursor-pointer text-left text-sidebar-foreground outline-none select-none focus-visible:inset-shadow-focus",
    variant === "card" ? "rounded-card-row" : "rounded-compact-row",
    isSelected || props.sweepAction !== null
      ? "bg-sidebar-row-selected inset-shadow-selected-control"
      : props.isActive
        ? "bg-sidebar-row-active shadow-raise-m"
        : topStatus?.icon === "done"
          ? "bg-transparent shadow-sidebar-row-unread hover:bg-sidebar-row-hover"
          : "bg-transparent hover:bg-sidebar-row-hover hover:shadow-raise-xs-control",
    isFileDragOver && "inset-shadow-selected-control",
    props.sortable?.isDragging && "bg-sidebar-row-drag shadow-sidebar-row-drag",
  );
  // dnd-kit props for the row root. Same bag on both variants: every row in
  // the list translates around the gap as the drag passes it.
  const sortable = props.sortable;
  const sortableRootProps = sortable
    ? {
        ref: sortable.setNodeRef,
        style: {
          transform: CSS.Translate.toString(sortable.transform),
          transition: sortable.transition,
          // A zero-height boundary also makes dnd-kit scale the source to
          // zero. Only projected peers use scaleY as a visibility sentinel.
          visibility:
            !sortable.isDragging && sortable.transform?.scaleY === 0
              ? ("hidden" as const)
              : undefined,
        },
        ...sortable.listeners,
      }
    : {};
  // Sweeps reuse the corresponding row-drop action badge.
  const destinationVerb = sortable?.isDragging
    ? props.dropVerb
    : props.sweepAction === "unsnooze"
      ? "wake"
      : props.sweepAction;
  const dragDestination =
    destinationVerb !== null ? (
      <span
        role="status"
        className="sidebar-drop-badge pointer-events-none ml-auto inline-flex h-5.5 shrink-0 items-center gap-1.25 rounded-tag bg-primary px-2 text-secondary-copy font-bold text-primary-foreground text-shadow-none"
      >
        {dropVerbBadge[destinationVerb]}
      </span>
    ) : null;

  const accessibility = resolveSidebarRowAccessibility({
    title: thread.title,
    statusLabel: topStatus?.label ?? null,
    projectDisplayName: props.projectDisplayName,
    isActive: props.isActive,
  });

  const title =
    isRenaming && canOperateThread ? (
      <ThreadRenameInput
        title={renamingTitle}
        onTitleChange={onRenameTitleChange}
        onCommit={() => onCommitRename(threadRef, renamingTitle, thread.title)}
        onCancel={onCancelRename}
      />
    ) : (
      <span
        aria-hidden
        className={cn(
          "min-w-0 flex-1 truncate text-start",
          variant === "card" ? "text-heading leading-4.5" : "text-control",
          props.isActive
            ? "font-bold"
            : variant === "card" || isWoke
              ? "font-semibold"
              : "font-medium",
          variantAction === "unsettle" && !props.isActive
            ? "text-code-foreground group-hover/sidebar-row:text-foreground"
            : "text-foreground",
          isRegeneratingTitle && "opacity-55",
        )}
        dir={textDirection(thread.title)}
      >
        {thread.title}
      </span>
    );
  const accessibleTitle = isRenaming ? null : <span className="sr-only">{thread.title}</span>;

  // Stacks show their layer count; multiple unrelated links show their total count.
  // Either opens the thread's pull requests tab; a single PR link opens that PR and still
  // supports opening the host in a new tab.
  const prBadgeShape = supportsMultiplePullRequests
    ? resolveThreadPullRequestBadge(thread.pullRequests)
    : null;
  const handlePrListClick = () => {
    useRightPanelStore.getState().open(threadRef, "pull-requests");
    if (!props.isRouteThread) onThreadActivate(threadRef);
  };
  const prBadgeState =
    prBadgeShape?.state ??
    (pr?.isDraft ? "draft" : (pr?.state ?? currentLinkedPr?.snapshot?.state));
  const prBadge =
    prBadgeShape?.kind === "stack" || pr || currentLinkedPr ? (
      <Badge
        size="sm"
        variant={
          prBadgeState === "merged"
            ? "accent"
            : prBadgeState === "open"
              ? "success"
              : prBadgeState === "closed"
                ? "error"
                : "neutral"
        }
      >
        <ThreadPullRequestBadgeControl
          render={<InlineButton />}
          badge={prBadgeShape}
          pullRequests={thread.pullRequests}
          number={pr?.number ?? currentLinkedPr?.number}
          url={pr?.url ?? currentLinkedPr?.url}
          status={prStatus}
          onOpenList={handlePrListClick}
          onOpenPullRequest={handlePrClick}
        />
      </Badge>
    ) : null;
  const terminalStatusIcon = (
    <ThreadTerminalStatusButton
      threadRef={threadRef}
      terminalIds={runningTerminalIds}
      onThreadActivate={onThreadActivate}
    />
  );
  // Same pen the new-thread draft rows lead with, so both kinds of unsent
  // work read the same way in the list.
  const draftIndicator = hasUnsentDraft ? (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            role="img"
            aria-label={t.sidebar.thread.unsentDraftHint}
            data-testid={`sidebar-draft-indicator-${thread.id}`}
            className="inline-flex shrink-0 items-center"
          />
        }
      >
        <SquarePenIcon aria-hidden className={draftPenClassName} />
      </TooltipTrigger>
      <TooltipPopup side="top">{t.sidebar.thread.unsentDraftHint}</TooltipPopup>
    </Tooltip>
  ) : null;
  const showPin =
    props.isPinned && (!sortable?.isDragging || (props.dragOverPinned && props.dropVerb === null));
  const pinIndicator = showPin ? (
    props.pinningSupported && canOperateThread && !sortable?.isDragging ? (
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label={t.sidebar.thread.unpinAriaLabel}
              onClick={handleUnpinClick}
              className="group/unpin inline-flex cursor-pointer items-center rounded-sm text-muted-foreground/65 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            />
          }
        >
          {/* Pin marks the pinned state at rest; hover and focus swap in pin-off so the
              icon reads as the action the button performs. */}
          <PinIcon
            aria-hidden
            className="size-3 shrink-0 group-hover/unpin:hidden group-focus-visible/unpin:hidden"
          />
          <PinOffIcon
            aria-hidden
            className="hidden size-3 shrink-0 group-hover/unpin:block group-focus-visible/unpin:block"
          />
        </TooltipTrigger>
        <TooltipPopup>{t.sidebar.thread.unpinAriaLabel}</TooltipPopup>
      </Tooltip>
    ) : (
      <PinIcon
        aria-label={t.sidebar.thread.pinned}
        role="img"
        className="size-3 shrink-0 text-muted-foreground/65"
      />
    )
  ) : null;

  const pillClassName =
    "inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-tag px-2.25 text-meta-large font-semibold shadow-tag";
  const statusPill = topStatus ? (
    isWokeStatus ? (
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label={t.sidebar.thread.dismissWokeAriaLabel}
              onClick={handleAcknowledgeWokeClick}
              className={cn(
                pillClassName,
                topStatus.className,
                variant === "slim" && "h-5.5 rounded-full",
                "cursor-pointer outline-none focus-visible:inset-shadow-focus",
              )}
            />
          }
        >
          <span role="status">{topStatus.label}</span>
        </TooltipTrigger>
        <TooltipPopup side="top">{t.sidebar.thread.dismissWokeAriaLabel}</TooltipPopup>
      </Tooltip>
    ) : (
      <span className={cn(pillClassName, topStatus.className)}>
        {topStatus.icon === "working" ? (
          <span aria-hidden className="flex h-2.25 shrink-0 flex-col justify-between">
            <span className="h-0.5 w-2 rounded-full bg-current" />
            <span className="h-0.5 w-1.5 rounded-full bg-current" />
            <span className="h-0.5 w-1 rounded-full bg-current" />
          </span>
        ) : null}
        <span role="status">{topStatus.label}</span>
      </span>
    )
  ) : null;
  const actionClassName =
    "inline-flex h-7.5 cursor-pointer items-center justify-center gap-1 rounded-full bg-secondary px-2 text-secondary-copy-medium font-semibold text-foreground shadow-raise-xs-control outline-none hover:bg-accent focus-visible:inset-shadow-focus";
  const hoverActions = showHoverActions ? (
    <span
      className={cn(
        "-my-1.5 -mr-1.5 hidden shrink-0 items-center gap-1 group-hover/sidebar-row:inline-flex group-focus-visible/sidebar-row:inline-flex group-data-[focus-visible-within=true]/sidebar-row:inline-flex",
        snoozeMenuOpen && "inline-flex",
      )}
    >
      {hasUnsentDraft ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={t.sidebar.thread.discardDraft}
                onClick={handleDiscardDraftClick}
                className={cn(actionClassName, "w-7 px-0")}
              />
            }
          >
            <XIcon className="size-3.5" />
          </TooltipTrigger>
          <TooltipPopup side="top">{t.sidebar.thread.discardDraft}</TooltipPopup>
        </Tooltip>
      ) : null}
      {showSnoozeButton ? (
        <SnoozeMenuButton
          environmentId={thread.environmentId}
          open={snoozeMenuOpen}
          onOpenChange={setSnoozeMenuOpen}
          onSnooze={handleSnoozePreset}
          timestampFormat={props.timestampFormat}
        />
      ) : null}
      {canOperateThread && props.settlementSupported ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={t.sidebar.thread.settleAriaLabel}
                onClick={handleSettleClick}
                onPointerDown={handleActionPointerDown}
                className={cn(actionClassName, "pl-2.25 pr-3")}
              />
            }
          >
            <CheckIcon className="size-3.5" />
            {t.sidebar.actions.settle}
          </TooltipTrigger>
          <TooltipPopup side="top">{t.sidebar.thread.settleAriaLabel}</TooltipPopup>
        </Tooltip>
      ) : null}
    </span>
  ) : null;
  const itemClassName = cn(
    // The sortable projection owns a 1px gap. Tail padding supplies B1 spacing
    // without changing that geometry contract: card 78+3+1, compact 36+1+1.
    // 81px is the card's default-font baseline; projection scales from measured outer rows.
    variant === "card" ? "list-none pb-0.75" : "list-none pb-0.25",
    sortable?.isDragging
      ? "sidebar-drag-source relative z-20"
      : // Intrinsic size describes the content box; the tail padding is added separately.
        variant === "card"
        ? "[content-visibility:auto] [contain-intrinsic-size:auto_78px]"
        : "[content-visibility:auto] [contain-intrinsic-size:auto_36px]",
  );

  if (variant === "slim") {
    return (
      <li
        data-thread-item={threadKey}
        data-sidebar-drag-variant={variant}
        data-dragging={sortable?.isDragging || undefined}
        {...sortableRootProps}
        {...(fileDropHandlers ?? {})}
        className={itemClassName}
      >
        <Tooltip disabled={sortable?.isDragging}>
          <TooltipTrigger
            render={
              <div
                ref={rowRef}
                role="treeitem"
                tabIndex={-1}
                data-sidebar-row={threadKey}
                data-sidebar-parent={props.navigationParent}
                aria-label={accessibility.label}
                aria-current={accessibility.current}
                data-testid="sidebar-row-slim"
                data-sidebar-thread-row="slim"
                data-focus-visible-within={focusVisibleWithin.active}
                {...focusVisibleWithin.handlers}
                aria-busy={isRegeneratingTitle || undefined}
                className={cn(
                  rowSurfaceClassName,
                  "flex h-9 min-w-0 items-center gap-2 pl-3 pr-2.5",
                  sortable?.isDragging && "sidebar-row-drag",
                )}
                onClick={handleClick}
                onDoubleClick={handleDoubleClick}
                onKeyDown={handleKeyDown}
                onContextMenu={handleContextMenu}
              />
            }
          >
            {accessibleTitle}
            <span
              className={cn(
                "flex shrink-0 items-center",
                !props.isActive &&
                  !isSelected &&
                  "opacity-40 grayscale group-hover/sidebar-row:opacity-100 group-hover/sidebar-row:grayscale-0 group-focus-within/sidebar-row:opacity-100 group-focus-within/sidebar-row:grayscale-0",
              )}
            >
              {props.project ? <ProjectFavicon project={props.project} className="size-4" /> : null}
            </span>
            {draftIndicator}
            {title}
            {pinIndicator}
            {terminalStatusIcon}
            {isRegeneratingTitle ? (
              <span role="status" className="sr-only">
                {t.sidebar.thread.regeneratingTitleHint}
              </span>
            ) : null}
            {prBadge}
            {sortable?.isDragging || props.sweepAction !== null ? (
              dragDestination
            ) : (
              <>
                <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-secondary-copy tabular-nums text-muted-foreground">
                  {SNOOZE_UI_ENABLED &&
                  variantAction === "unsnooze" &&
                  props.snoozeWakeLabelText !== null ? (
                    <span className="inline-flex items-center gap-1 font-mono text-info">
                      <AlarmClockIcon aria-hidden className="size-3" />
                      {props.snoozeWakeLabelText}
                    </span>
                  ) : isWoke ? (
                    statusPill
                  ) : variantAction === "unsettle" ? (
                    <RelativeTimeLabel timestamp={resolveSettledThreadTimestamp(thread)} />
                  ) : (
                    <RelativeTimeLabel timestamp={thread.latestUserMessageAt ?? thread.updatedAt} />
                  )}
                </span>
                {canOperateThread &&
                (variantAction === "unsnooze"
                  ? SNOOZE_UI_ENABLED && props.snoozeSupported
                  : props.settlementSupported) ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          aria-label={
                            variantAction === "unsnooze"
                              ? t.sidebar.thread.wakeAriaLabel
                              : variantAction === "unsettle"
                                ? t.sidebar.thread.unsettleAriaLabel
                                : t.sidebar.thread.settleAriaLabel
                          }
                          onClick={
                            variantAction === "unsnooze"
                              ? handleUnsnoozeClick
                              : variantAction === "unsettle"
                                ? handleUnsettleClick
                                : handleSettleClick
                          }
                          onPointerDown={handleActionPointerDown}
                          className="-mr-1.5 hidden size-7 shrink-0 cursor-pointer items-center justify-center rounded-sidebar-quick-action bg-accent text-foreground shadow-raise-tab outline-none group-hover/sidebar-row:inline-flex group-focus-visible/sidebar-row:inline-flex group-data-[focus-visible-within=true]/sidebar-row:inline-flex focus-visible:inset-shadow-focus"
                        />
                      }
                    >
                      {variantAction === "unsnooze" ? (
                        <AlarmClockOffIcon className="size-3.5" />
                      ) : variantAction === "unsettle" ? (
                        <Undo2Icon className="size-3.5" />
                      ) : (
                        <CheckIcon className="size-3.5" />
                      )}
                    </TooltipTrigger>
                    <TooltipPopup side="top">
                      {variantAction === "unsnooze"
                        ? t.sidebar.thread.wakeAriaLabel
                        : variantAction === "unsettle"
                          ? t.sidebar.thread.unsettleAriaLabel
                          : t.sidebar.thread.settleAriaLabel}
                    </TooltipPopup>
                  </Tooltip>
                ) : null}
              </>
            )}
            {props.jumpLabel ? <JumpHintBadge label={props.jumpLabel} /> : null}
          </TooltipTrigger>
          {detailsTooltip}
        </Tooltip>
      </li>
    );
  }

  const diff = latestRunDiff(thread);
  return (
    <li
      data-thread-item={threadKey}
      data-sidebar-drag-variant={variant}
      data-dragging={sortable?.isDragging || undefined}
      {...sortableRootProps}
      {...(fileDropHandlers ?? {})}
      className={itemClassName}
    >
      <Tooltip disabled={snoozeMenuOpen || sortable?.isDragging}>
        <TooltipTrigger
          render={
            <div
              ref={rowRef}
              role="treeitem"
              tabIndex={-1}
              data-sidebar-row={threadKey}
              data-sidebar-parent={props.navigationParent}
              aria-label={accessibility.label}
              aria-current={accessibility.current}
              data-testid="sidebar-row-card"
              data-sidebar-thread-row="card"
              data-focus-visible-within={focusVisibleWithin.active}
              {...focusVisibleWithin.handlers}
              aria-busy={isRegeneratingTitle || undefined}
              className={cn(
                rowSurfaceClassName,
                "flex h-19.5 flex-col gap-0.75 px-3 py-2.5",
                sortable?.isDragging && "sidebar-row-drag",
              )}
              onClick={handleClick}
              onDoubleClick={handleDoubleClick}
              onKeyDown={handleKeyDown}
              onContextMenu={handleContextMenu}
            />
          }
        >
          {accessibleTitle}
          <div className="flex h-5 min-w-0 shrink-0 items-center gap-1.5 text-secondary-copy text-secondary-label">
            {draftIndicator}
            {props.project ? (
              <ProjectFavicon project={props.project} className="size-4 shrink-0" />
            ) : null}
            {pinIndicator}
            <span className="min-w-0 truncate">{props.projectDisplayName}</span>
            <span className="flex-1" />
            {sortable?.isDragging || props.sweepAction !== null ? (
              dragDestination
            ) : (
              <>
                <span
                  className={cn(
                    "ml-auto inline-flex shrink-0 items-center tabular-nums",
                    showHoverActions &&
                      !isWokeStatus &&
                      "group-hover/sidebar-row:hidden group-focus-visible/sidebar-row:hidden group-data-[focus-visible-within=true]/sidebar-row:hidden",
                    snoozeMenuOpen && "hidden",
                  )}
                >
                  {statusPill ?? (
                    <span>
                      {
                        <RelativeTimeLabel
                          timestamp={thread.latestUserMessageAt ?? thread.updatedAt}
                        />
                      }
                    </span>
                  )}
                </span>
                {hoverActions}
              </>
            )}
          </div>
          <div className={cn("flex h-4.5 min-w-0 shrink-0", props.jumpLabel && "pr-8.5")}>
            {title}
            {isRegeneratingTitle ? (
              <span role="status" className="sr-only">
                {t.sidebar.thread.regeneratingTitleHint}
              </span>
            ) : null}
          </div>
          <div
            className={cn(
              "flex h-3.5 min-w-0 shrink-0 items-center gap-2 font-mono text-meta-large leading-3.5",
              props.isActive ? "text-secondary-label" : "text-muted-foreground",
            )}
          >
            {thread.branch ? (
              <>
                <ThreadWorktreeIndicator thread={thread} />
                <span className="flex min-w-0">
                  <MiddleTruncate value={thread.branch} showTitle={false} />
                </span>
              </>
            ) : showsScratchMachine ? (
              <>
                <EnvironmentMachineIcon
                  aria-hidden
                  kind={props.environmentMachine}
                  className="size-3 shrink-0"
                />
                <span className="min-w-0 truncate font-sans text-secondary-copy">
                  {props.scratchMachineLabel}
                </span>
              </>
            ) : null}
            {terminalStatusIcon}
            {prBadge}
            {diff ? (
              <span className="shrink-0 whitespace-nowrap">
                <span className="text-success">+{formatDiffCount(diff.insertions)}</span>{" "}
                <span className="text-error">−{formatDiffCount(diff.deletions)}</span>
              </span>
            ) : null}
            {isRemote && !showsScratchMachine ? (
              <EnvironmentMachineIcon
                aria-hidden
                kind={props.environmentMachine}
                className="size-3 shrink-0"
              />
            ) : null}
            <span
              aria-hidden
              className="pointer-events-none ml-auto inline-flex shrink-0 items-center"
            >
              <SidebarProviderStack
                thread={thread}
                providerEntryByInstanceId={props.providerEntryByInstanceId}
              />
            </span>
          </div>
          {props.jumpLabel ? <JumpHintBadge label={props.jumpLabel} /> : null}
        </TooltipTrigger>
        {detailsTooltip}
      </Tooltip>
    </li>
  );
});

function latestRunDiff(
  thread: SidebarThreadSummary,
): { insertions: number; deletions: number } | null {
  // Shells don't carry checkpoint summaries; diff stats render only when the
  // shell projection grows them. Kept as a seam so the row layout is ready.
  void thread;
  return null;
}

/** Scrolls the highlighted result without moving keyboard focus out of search. */
const scrollHighlightedResultIntoView = (node: HTMLLIElement | null) => {
  node?.scrollIntoView({ block: "nearest" });
};

/** Keeps flat search hits on B1's card surface; keyboard focus remains on the search input. */
export const SidebarSearchResultRow = memo(function SidebarSearchResultRow(props: {
  isSettled: boolean;
  thread: SidebarThreadSummary;
  project: EnvironmentProject | null;
  projectDisplayName: string | null;
  environmentLabel: string | null;
  environmentMachine: EnvironmentMachineKind;
  providerEntryByInstanceId: ReadonlyMap<string, SidebarProviderEntry>;
  isHighlighted: boolean;
  isRouteActive: boolean;
  resultId: string;
  searchMatch: EnvironmentThreadSearchMatch | null;
  searchQuery: string;
  /** The query `searchMatch` was found for, which lags `searchQuery` while a search runs. */
  searchMatchQuery?: string;
  onHighlight: () => void;
  onSelect: () => void;
  onFileDropThreads: (threadRef: ScopedThreadRef, files: File[]) => void;
}) {
  const thread =
    useThreadShell(scopeThreadRef(props.thread.environmentId, props.thread.id)) ?? props.thread;
  const accessibility = resolveSidebarRowAccessibility({
    title: thread.title,
    statusLabel: null,
    projectDisplayName: props.projectDisplayName,
    isActive: props.isRouteActive,
  });
  const threadRef = (() => scopeThreadRef(thread.environmentId, thread.id))();
  const { leaseLiveStatus, rowRef } = useSidebarRowSubscriptionLease(
    props.isHighlighted || props.isRouteActive,
  );
  // Same details tooltip as the regular rows: a search hit is still a thread,
  // and the hover card is how you disambiguate identically-titled results.
  const gitCwd = thread.worktreePath ?? props.project?.workspaceRoot ?? null;
  const gitStatus = useEnvironmentQuery(
    leaseLiveStatus && (thread.branch != null || thread.worktreePath !== null) && gitCwd !== null
      ? vcsEnvironment.status({
          environmentId: thread.environmentId,
          input: { cwd: gitCwd, includeRemote: false },
        })
      : null,
  );
  const visibleGitStatus = useRetainedValue(
    JSON.stringify([thread.environmentId, gitCwd]),
    gitStatus.data,
  );
  const branchMismatch = resolveLocalCheckoutBranchMismatch({
    effectiveEnvMode: thread.worktreePath === null ? "local" : "worktree",
    activeWorktreePath: thread.worktreePath,
    activeThreadBranch: thread.branch,
    currentGitBranch: visibleGitStatus?.refName ?? null,
  });
  const modelInstanceId = thread.runtime?.providerInstanceId ?? thread.modelSelection.instanceId;
  const providerEntry = props.providerEntryByInstanceId.get(modelInstanceId) ?? null;
  const showInstanceBadge =
    providerEntry !== null &&
    shouldShowInstanceBadge(providerEntry, props.providerEntryByInstanceId.values());
  const selectedModel = providerEntry?.models.find(
    (model) => model.slug === thread.modelSelection.model,
  );
  const modelLabel = selectedModel
    ? getTriggerDisplayModelName(selectedModel, providerEntry?.driverKind)
    : thread.modelSelection.model;
  const runningTerminalIds = useThreadRunningTerminalIds({
    environmentId: thread.environmentId,
    threadId: thread.id,
  });
  const terminalStatus = terminalStatusFromRunningIds(runningTerminalIds);
  const [isFileDragOver, setIsFileDragOver] = useState(false);
  const fileDropHandlers = (() =>
    makeWorkspaceFileDropHandlers({
      setDragActive: setIsFileDragOver,
      addFiles: (files) => {
        props.onFileDropThreads(threadRef, files);
      },
      addFolders: () => {},
    }))();
  useEffect(() => {
    if (!isFileDragOver) return;
    const clearFileDrag = () => setIsFileDragOver(false);
    window.addEventListener("dragend", clearFileDrag);
    return () => window.removeEventListener("dragend", clearFileDrag);
  }, [isFileDragOver]);
  return (
    <li
      ref={props.isHighlighted ? scrollHighlightedResultIntoView : undefined}
      role="presentation"
      className="list-none"
      {...fileDropHandlers}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              ref={rowRef}
              id={props.resultId}
              type="button"
              data-search-result-key={scopedThreadKey(threadRef)}
              role="option"
              // aria-activedescendant options: focus stays on the search input,
              // which owns all keyboard interaction for the listbox.
              tabIndex={-1}
              aria-selected={props.isHighlighted}
              aria-current={accessibility.current}
              aria-describedby={`${props.resultId}-pr`}
              aria-label={accessibility.label}
              onMouseMove={props.onHighlight}
              onClick={props.onSelect}
              className={cn(
                "group/sidebar-row flex w-full cursor-pointer flex-col gap-1 rounded-card-row px-3 py-2.5 text-left text-foreground outline-none",
                props.isRouteActive
                  ? "bg-sidebar-row-active shadow-raise-m"
                  : props.isHighlighted
                    ? "bg-sidebar-row-hover shadow-raise-xs-control"
                    : "bg-transparent hover:bg-sidebar-row-hover hover:shadow-raise-xs-control",
                isFileDragOver && "inset-shadow-selected-control",
                isFileDragOver && !props.isRouteActive && "bg-sidebar-row-hover",
              )}
            />
          }
        >
          <span className="flex w-full min-w-0 items-center gap-1.5">
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-body font-semibold",
                thread.titleRegeneration != null && "opacity-55",
              )}
            >
              <SidebarSearchText text={thread.title} query={props.searchQuery} />
            </span>
            <span id={`${props.resultId}-pr`} className="contents">
              <ThreadSearchPullRequestNumber
                thread={thread}
                query={props.searchQuery}
                enabled={leaseLiveStatus}
                settled={props.isSettled}
              />
            </span>
          </span>
          {props.searchMatch ? (
            <span className="line-clamp-2 text-secondary-copy-medium text-secondary-label">
              <SidebarSearchText
                text={props.searchMatch.snippet}
                query={props.searchMatchQuery ?? props.searchQuery}
              />
            </span>
          ) : null}
        </TooltipTrigger>
        <SidebarThreadTooltip
          thread={thread}
          project={props.project}
          projectDisplayName={props.projectDisplayName}
          environmentLabel={props.environmentLabel}
          environmentMachine={props.environmentMachine}
          providerEntry={providerEntry}
          providerEntryByInstanceId={props.providerEntryByInstanceId}
          showInstanceBadge={showInstanceBadge}
          modelInstanceId={modelInstanceId}
          modelLabel={modelLabel}
          branchMismatch={branchMismatch}
          terminalStatus={terminalStatus}
          terminalProcessCount={runningTerminalIds.length}
        />
      </Tooltip>
    </li>
  );
});

/**
 * Selects the hover card's last-reply state without treating an active run as a reply.
 * @param run Latest run summary, or null when the thread has never run.
 * @returns A completed timestamp, a replying state, or null when neither is available.
 */
export function resolveSidebarLastReply(
  run: Pick<NonNullable<SidebarThreadSummary["latestRun"]>, "completedAt" | "status"> | null,
) {
  if (run?.completedAt) return { status: "completed" as const, completedAt: run.completedAt };
  if (run && ["preparing", "queued", "starting", "running", "waiting"].includes(run.status)) {
    return { status: "replying" as const };
  }
  return null;
}

/** Marks literal hits in titles and snippets while leaving the full text available to assistive technology. */
function SidebarSearchText(props: { text: string; query: string }) {
  return sidebarSearchTextSegments(props.text, props.query).map((part) =>
    part.matched ? (
      <mark
        key={part.start}
        className="rounded-sidebar-search-hit bg-sidebar-search-hit px-0.25 text-sidebar-search-hit-foreground"
      >
        {part.text}
      </mark>
    ) : (
      part.text
    ),
  );
}

/** Opens the row menu from pointer or keyboard input while retaining Enter/Space activation. */
export function useSidebarThreadContextMenuTrigger(
  threadRef: ScopedThreadRef,
  onContextMenu: (
    threadRef: ScopedThreadRef,
    position: { x: number; y: number },
    trigger?: HTMLElement,
  ) => void,
  onThreadActivate: (threadRef: ScopedThreadRef) => void,
) {
  const handleContextMenu = useStableCallback((event: ReactMouseEvent) => {
    event.preventDefault();
    const trigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : undefined;
    onContextMenu(threadRef, { x: event.clientX, y: event.clientY }, trigger);
  });
  const handleKeyDown = useStableCallback((event: ReactKeyboardEvent) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      const trigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : undefined;
      const rect = event.currentTarget.getBoundingClientRect();
      onContextMenu(threadRef, { x: rect.left, y: rect.bottom }, trigger);
      return;
    }
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onThreadActivate(threadRef);
  });
  return { handleContextMenu, handleKeyDown };
}
