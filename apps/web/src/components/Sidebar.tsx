/** Renders project and thread navigation and dispatches scoped menu actions; server services own export IO. */
import { t } from "~/i18n";
import { useFocusVisibleWithin } from "../hooks/useFocusVisibleWithin";
import { SNOOZE_UI_ENABLED } from "../snoozeUi";
import { ContextMenu } from "@base-ui/react/context-menu";
import { serverEnvironment } from "../state/server";
import { useAtomCommand } from "../state/use-atom-command";
import {
  type ContextMenuItem,
  type EnvironmentId,
  type ScopedProjectRef,
} from "@t3tools/contracts";
import { ThreadHoverCard, ThreadHoverCardPopup } from "./ThreadHoverCard";
import { ThreadTerminalStatusButton } from "./ThreadStatusIndicators";
import { ThreadContextDragGhost } from "./chat/ThreadContextDragGhost";
import { ThreadMenuItems } from "./chat/ChatHeader";
import {
  throwThreadContext,
  endThreadContextDrag,
  moveThreadContextDrag as moveThreadContextDragGhost,
} from "./chat/threadContextDrag";
import { discardComposerDraft } from "../lib/discardComposerDraft";
import { requestCustomSnooze } from "./CustomSnoozeDialog";
import { useSupportsMultiplePullRequests } from "~/hooks/useSupportsMultiplePullRequests";
import { resolveThreadCurrentPullRequestLink } from "@t3tools/shared/threadPullRequests";
import { useAtomValue } from "@effect/atom-react";
import * as Option from "effect/Option";
import { Atom } from "effect/reactivity";
import { replaceComposerContextReferences } from "@t3tools/shared/composerContextReferences";
import {
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type Modifier,
} from "@dnd-kit/core";
import { SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  canSnooze,
  effectiveSnoozed,
  hasQueuedTurnStart,
  QUEUED_TURN_START_GRACE_MS,
  threadWokeAt,
} from "@t3tools/client-runtime/state/thread-settled";
import { createInboxReturnTracker } from "@t3tools/client-runtime/state/thread-inbox";
import { formatDiffCount } from "@t3tools/client-runtime/diff-count";
import {
  resolveSettledThreadTimestamp,
  sortSettledThreads,
} from "@t3tools/client-runtime/state/thread-sort";
import {
  threadSearchMatchKey,
  type EnvironmentThreadSearchMatch,
} from "@t3tools/client-runtime/state/thread-search";
import {
  resolveThreadProviderStack,
  threadRuntimeCanArchive,
  type EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/models";
import {
  parseScopedThreadKey,
  scopeProjectRef,
  scopeThreadRef,
  scopedThreadKey,
} from "@t3tools/client-runtime/environment";
import {
  AuthOrchestrationOperateScope,
  type EnvironmentMachineKind,
  type ScopedThreadRef,
  type ThreadId,
} from "@t3tools/contracts";

import type { TimestampFormat } from "@t3tools/contracts/settings";
import {
  AlarmClockIcon,
  AlarmClockOffIcon,
  ArrowRightLeftIcon,
  CheckIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  GitBranchIcon,
  MessagesSquareIcon,
  PinIcon,
  PinOffIcon,
  PlusIcon,
  SquarePenIcon,
  SearchXIcon,
  TextSearchIcon,
  TerminalIcon,
  Undo2Icon,
  XIcon,
} from "lucide-react";
import {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useRouter } from "@tanstack/react-router";

import { useRightPanelStore } from "../rightPanelStore";
import {
  isAtomCommandInterrupted,
  settlePromise,
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import { isElectron } from "../env";
import {
  resolveShortcutCommand,
  shortcutLabelForCommand,
  shouldShowThreadJumpHintsForModifiers,
  threadJumpCommandForIndex,
  threadJumpIndexFromCommand,
  threadTraversalDirectionFromCommand,
} from "../keybindings";
import { useShortcutModifierState } from "../shortcutModifierState";
import { isTerminalFocused } from "../lib/terminalFocus";
import { isModelPickerOpen } from "../modelPickerVisibility";
import { selectThreadTerminalUiState, useTerminalUiStateStore } from "../terminalUiStateStore";
import { isMacPlatform } from "~/lib/utils";
import { useOpenPrLink } from "../lib/openPullRequestLink";
import { readLocalApi } from "../localApi";
import { useSidebarPendingFileDropStore } from "../sidebarPendingFileDropStore";
import { selectProjectGroupingSettings } from "../logicalProject";
import {
  buildSidebarProjectSnapshots,
  projectGroupsSpanEnvironments,
  resolveSidebarProjectScopeKey,
  getSidebarProjectSettingsKey,
  type SidebarProjectSnapshot,
} from "../sidebarProjectGrouping";
import { useUiStateStore } from "../uiStateStore";
import {
  getThreadKeysToDeselectAfterDelete,
  useThreadSelectionStore,
} from "../threadSelectionStore";
import { useAcknowledgeThreadWoke, useThreadActions } from "../hooks/useThreadActions";
import { useHandleNewThread } from "../hooks/useHandleNewThread";
import { useScratchProject } from "../hooks/useScratchProject";
import { useTerminalFocus } from "../hooks/useTerminalFocus";
import { isCommandPaletteOpen, openCommandPalette } from "../commandPaletteBus";
import { registerSettleAndAdvance } from "../settleAndAdvance";
import { resolveThreadActionProjectRef, startNewThreadFromContext } from "../lib/chatThreadActions";
import { useClientSettings } from "../hooks/useSettings";
import { useCopyToClipboard } from "../hooks/useCopyToClipboard";
import { useNowMinute } from "../hooks/useNowMinute";
import {
  useEnvironmentIdentities,
  useConnectedEnvironmentIds,
  useEnvironmentMachines,
  usePrimaryEnvironmentId,
} from "../state/environments";
import {
  readThreadShell,
  useAllEnvironmentProjectSnapshotsReady,
  useProjects,
  useServerConfigs,
  useThreadShells,
} from "../state/entities";
import { environmentPresentations } from "../state/presentation";
import { primaryServerKeybindingsAtom } from "../state/server";
import { environmentProjects } from "../state/projects";
import { vcsEnvironment } from "../state/vcs";
import { threadEnvironment } from "../state/threads";
import { useEnvironmentQuery } from "../state/query";
import { useThreadSearch } from "../state/queries";
import { useOrchestrationCommand } from "../state/use-orchestration-command";
import { readEnvironmentScope, useEnvironmentScope } from "../state/session";
import { buildThreadRouteParams, resolveActiveThreadRouteRef } from "../threadRoutes";
import { compactSidebarTimeLabel } from "./Sidebar.logic";
import {
  formatChatTimestampTooltip,
  formatRelativeTimeLabel,
  parseTimestampDate,
} from "../timestampFormat";
import type { SidebarThreadSummary } from "../types";
import { isScratchProject } from "@t3tools/client-runtime/state/projects";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import { cn } from "~/lib/utils";
import { EnvironmentMachineIcon } from "./EnvironmentMachineIcon";
import {
  buildDraftActionMenuItems,
  buildSidebarThreadActionMenuItems,
  threadActionRequiresOperate,
  type ThreadActionMenuId,
} from "./threadActionMenu.logic";
import {
  animateSidebarLayoutChanges,
  applySidebarThreadDrop,
  filterSidebarV2VisibleThreads,
  deleteSelectedThreadEntries,
  firstValidTimestampMs,
  hasUnseenCompletion,
  isSidebarNestedLinkClick,
  isSidebarThreadWorking,
  isTrailingDoubleClick,
  orderItemsByPreferredIds,
  planSidebarThreadDrop,
  resolveAdjacentThreadId,
  resolveSidebarSweepKeys,
  sidebarSweepScopes,
  resolveSidebarDropTarget,
  resolveSidebarDropVerb,
  resolveSidebarThreadSection,
  resolveSidebarRowAccessibility,
  type SidebarDropVerb,
  resolveSidebarThreadStatus,
  resolveThreadLastVisitedAt,
  searchSidebarThreads,
  sidebarSearchTextSegments,
  resolveSidebarNewThreadDestination,
  resolveSidebarNewThreadTooltip,
  prepareSidebarProjectsForGrouping,
  shouldNavigateAfterThreadPark,
  sidebarListItemId,
  sidebarMarkerId,
  sidebarThreadKeyAtY,
  sortInboxThreadsByReturn,
  sortPinnedThreadsForSidebar,
  sortSidebarV2ProjectGroups,
  sortThreadsForSidebar,
  sortWorkingThreadsBySend,
  useThreadJumpHintVisibility,
  useRetainedValue,
  useSidebarRowSubscriptionLease,
  type SidebarListItem,
  type SidebarListMarker,
  type SidebarSection,
  resolveSidebarRowThreadId,
} from "./Sidebar.logic";
import { resolveLocalCheckoutBranchMismatch } from "./BranchToolbar.logic";
import {
  createSidebarCollisionDetection,
  createSidebarSortingStrategy,
  restrictSidebarDrag,
} from "./Sidebar.drag";
import { SidebarDragLifecycle, SidebarPointerSensor } from "./Sidebar.pointer";
import { createSidebarListMotion } from "./Sidebar.motion";
import {
  ThreadPullRequestBadgeControl,
  ThreadPullRequestsMiniList,
  ThreadWorktreeIndicator,
  prStatusIndicator,
  resolveThreadPullRequestBadge,
  terminalStatusFromRunningIds,
  type TerminalStatusIndicator,
  useLinkedThreadPullRequest,
  ThreadSearchPullRequestNumber,
} from "./ThreadStatusIndicators";
import { resolveSnoozePresets, snoozeWakeLabel, type SnoozePreset } from "./Sidebar.snooze";
import { ProjectFavicon, type ProjectFaviconProject } from "./ProjectFavicon";
import { makeWorkspaceFileDropHandlers } from "./chat/workspaceFileDrop";
import { ProviderInstanceIcon } from "./chat/ProviderInstanceIcon";
import { getTriggerDisplayModelLabel } from "./chat/providerIconUtils";
import {
  deriveProviderEntriesByEnvironment,
  shouldShowInstanceBadge,
  type ProviderInstanceEntry,
} from "../providerInstances";
import { useThreadRunningTerminalIds } from "../state/terminalSessions";
import { useStableCallback } from "../hooks/useStableCallback";
import { stackedThreadToast, toastManager } from "./ui/toast";
import { InlineButton } from "./ui/button";
import { Badge } from "./ui/badge";
import { SidebarContent, useSidebar } from "./ui/sidebar";
import { SidebarChromeFooter } from "./sidebar/SidebarChrome";
import { SidebarThreadHeader } from "./sidebar/SidebarThreadHeader";
import {
  buildTodayView,
  readTodayTab,
  TODAY_TAB_STORAGE_KEY,
  type TodayTab,
} from "./sidebar/todayView.logic";
import {
  SidebarThreadDndContext,
  type SidebarTabDropActions,
} from "./sidebar/SidebarThreadDndContext";
import { SidebarBulkActions } from "./sidebar/SidebarBulkActions";
import {
  buildSidebarBulkActionModel,
  type SidebarBulkCapability,
} from "./sidebar/sidebarBulkActions.logic";
import {
  buildSidebarTabs,
  nextSidebarSettledVisibleCount,
  readSidebarTab,
  writeSidebarTab,
  type SidebarTab,
  resolveSidebarTabView,
  resolveSidebarSearchResultTab,
  sidebarTabJumpNumbers,
  SIDEBAR_SETTLED_INITIAL_COUNT,
  SIDEBAR_SETTLED_PAGE_COUNT,
  SIDEBAR_TAB_STORAGE_KEY,
} from "./sidebar/sidebarTabs.logic";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuShortcut, MenuTrigger } from "./ui/menu";
import { Tooltip, TooltipPopup, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { MiddleTruncate } from "./ui/middle-truncate";
import {
  composerDraftHasUserContent,
  DraftId,
  useComposerDraftStore,
  useThreadHasUnsentDraft,
  type ComposerThreadDraftState,
  type DraftSessionState,
} from "../composerDraftStore";
import { useThreadRouteTarget } from "../hooks/useThreadRouteTarget";

// The fields thread rows show. Provider status pushes refresh `checkedAt`,
// status and auth on every provider; leaving those out keeps each
// environment's map, and every memoized row, stable across them.
type SidebarProviderEntry = Pick<
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

/** Provider heartbeats must not repaint every row; compare only fields visible in a sidebar badge, including availability. */
function sameSidebarProviderEntries(
  left: ReadonlyMap<string, SidebarProviderEntry>,
  right: ReadonlyMap<string, SidebarProviderEntry>,
): boolean {
  if (left.size !== right.size) return false;
  for (const [instanceId, entry] of right) {
    const other = left.get(instanceId);
    if (
      other === undefined ||
      other.driverKind !== entry.driverKind ||
      other.enabled !== entry.enabled ||
      other.displayName !== entry.displayName ||
      other.accentColor !== entry.accentColor ||
      other.acpRegistryAgentId !== entry.acpRegistryAgentId ||
      other.acpRegistryIconUrl !== entry.acpRegistryIconUrl ||
      other.models !== entry.models
    ) {
      return false;
    }
  }
  return true;
}

// Threads on non-primary environments (T3 Connect, hosted) resolve their
// provider entry from their own environment's config: default instance ids
// are driver slugs, so a flat map would collide across environments.
const sidebarProviderEntriesAtom = Atom.make((get) => {
  const providersByEnvironment = get(environmentPresentations.providersByEnvironmentAtom);
  const derived = deriveProviderEntriesByEnvironment(
    [...get(environmentPresentations.serverConfigsAtom)].map(
      ([environmentId, config]) =>
        [environmentId, providersByEnvironment.get(environmentId) ?? [], config.settings] as const,
    ),
  );
  const previous = Option.getOrNull(
    get.self<ReadonlyMap<string, ReadonlyMap<string, SidebarProviderEntry>>>(),
  );
  const next = new Map<string, ReadonlyMap<string, SidebarProviderEntry>>();
  let changed = previous === null || previous.size !== derived.size;
  for (const [environmentId, entries] of derived) {
    const prior = previous?.get(environmentId);
    if (prior !== undefined && sameSidebarProviderEntries(prior, entries)) {
      next.set(environmentId, prior);
    } else {
      next.set(environmentId, entries);
      changed = true;
    }
  }
  return !changed && previous !== null ? previous : next;
}).pipe(Atom.withLabel("sidebar-provider-entries"));

const EMPTY_PROVIDER_ENTRIES: ReadonlyMap<string, SidebarProviderEntry> = new Map();

// Working beta: when this client saw each thread leave the Working shelf.
// Module scope keeps the inbox order across routes that unmount the sidebar.
type SidebarOptimisticDrop = {
  readonly key: string;
  readonly sourceSection: SidebarSection;
  readonly section: "pinned" | "active" | "settled";
  readonly occurredAt: string;
  readonly clearsSnooze: boolean;
  readonly order: readonly string[] | null;
  readonly keysAtDrop: ReadonlyMap<string, string | null>;
  readonly assignedKeys: ReadonlyMap<string, string>;
};

function isOptimisticDropReleased(input: {
  readonly optimisticDrop: SidebarOptimisticDrop;
  readonly threads: readonly EnvironmentThreadShell[];
  readonly pinnedKeys: readonly string[];
  readonly activeKeys: readonly string[];
  readonly now: string;
}): boolean {
  const { optimisticDrop, threads, pinnedKeys, activeKeys, now } = input;
  const canonicalByKey = new Map(
    threads.map((thread) => [
      scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
      thread,
    ]),
  );
  const thread = canonicalByKey.get(optimisticDrop.key);
  if (thread === undefined || thread.archivedAt !== null) {
    return true;
  }
  const canonicalSection = effectiveSnoozed(thread, { now })
    ? "snoozed"
    : thread.settledOverride === "settled"
      ? "settled"
      : thread.pinnedAt != null
        ? "pinned"
        : "active";
  if (
    canonicalSection !== optimisticDrop.sourceSection &&
    canonicalSection !== optimisticDrop.section
  ) {
    return true;
  }
  if (optimisticDrop.order === null) {
    // Settle also emits unpin/unsnooze events. Wait for the entire move
    // before releasing the projected fields and sort timestamps.
    if (
      canonicalSection === optimisticDrop.section &&
      thread.pinnedAt == null &&
      (!optimisticDrop.clearsSnooze || thread.snoozedUntil == null)
    ) {
      return true;
    }
    return false;
  }
  if (canonicalSection !== optimisticDrop.section) return false;
  if (optimisticDrop.clearsSnooze && thread.snoozedUntil != null) return false;
  const destinationKeys = optimisticDrop.section === "pinned" ? pinnedKeys : activeKeys;
  const canonicalDestination = destinationKeys.flatMap((key) => {
    const canonical = canonicalByKey.get(key);
    return canonical === undefined ? [] : [canonical];
  });
  const keyByThread = new Map(
    canonicalDestination.map((thread) => [
      scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
      (optimisticDrop.section === "pinned" ? thread.pinOrderKey : thread.activeOrderKey) ?? null,
    ]),
  );
  const heldOrder = optimisticDrop.order;
  const heldKeys = new Set(heldOrder);
  const membershipChanged =
    destinationKeys.length !== heldOrder.length ||
    destinationKeys.some((key) => !heldKeys.has(key));
  const foreignKeyLanded = destinationKeys.some((threadKey) => {
    const currentKey = keyByThread.get(threadKey) ?? null;
    if (currentKey === (optimisticDrop.keysAtDrop.get(threadKey) ?? null)) return false;
    return currentKey !== optimisticDrop.assignedKeys.get(threadKey);
  });
  const allAssignmentsLanded = [...optimisticDrop.assignedKeys].every(
    ([threadKey, orderKey]) => keyByThread.get(threadKey) === orderKey,
  );
  return membershipChanged || foreignKeyLanded || allAssignmentsLanded;
}

function scheduleSnoozeWake(wakeAt: string | null, onWake: () => void): (() => void) | undefined {
  const wakeAtMs = wakeAt === null ? Number.NaN : Date.parse(wakeAt);
  if (Number.isNaN(wakeAtMs)) return undefined;
  // setTimeout delays are signed 32-bit: anything larger overflows and fires
  // immediately, turning a far-future wake (event-condition snoozes synced
  // from elsewhere) into a tight re-arm loop.
  const delayMs = Math.min(Math.max(0, wakeAtMs - Date.now()) + 50, 2_147_483_647);
  const id = window.setTimeout(onWake, delayMs);
  return () => window.clearTimeout(id);
}

const inboxReturns = createInboxReturnTracker();

/** Repartitions on clock changes as well as shell events, including local midnight and snooze expiry. */
function partitionSidebarThreads(input: {
  threads: readonly EnvironmentThreadShell[];
  scopedProjectKeys: ReadonlySet<string> | null;
  serverConfigs: ReturnType<typeof useServerConfigs>;
  optimisticDrop: SidebarOptimisticDrop | null;
  workingShelfEnabled: boolean;
  isTodayView: boolean;
  clockKey: string;
}) {
  const {
    threads,
    scopedProjectKeys,
    serverConfigs,
    optimisticDrop,
    workingShelfEnabled,
    isTodayView,
  } = input;

  // Snooze classification uses a REAL clock, not the quantized minute:
  // wake times are second-precise and a woken thread must not linger on
  // the shelf for the rest of the minute. The clock key invalidates this
  // partition at the next wake boundary or local midnight.
  const preciseNow = new Date().toISOString();
  // Subagent child threads live in the parent's Agents surface, not the
  // sidebar roster (v2 models them as real threads with lineage).
  const visible = filterSidebarV2VisibleThreads(threads, scopedProjectKeys);
  inboxReturns.observe(workingShelfEnabled || isTodayView ? threads : null);
  const pinned: EnvironmentThreadShell[] = [];
  const active: EnvironmentThreadShell[] = [];
  const working: EnvironmentThreadShell[] = [];
  // Working beta: only inbox threads fold away. Pins stay where the user
  // put them, and snoozed or settled threads keep their shelves.
  const inbox = (thread: EnvironmentThreadShell) =>
    workingShelfEnabled && isSidebarThreadWorking(thread) ? working : active;
  const snoozed: EnvironmentThreadShell[] = [];
  const settled: EnvironmentThreadShell[] = [];
  const draggable = new Set<string>();
  const activeReorderable = new Set<string>();
  for (const thread of visible) {
    const capabilities = serverConfigs.get(thread.environmentId)?.environment.capabilities;
    // Threads on servers without the settlement capability (old server,
    // or descriptor not loaded yet) never classify as settled: the user
    // could neither un-settle nor pin them, so auto-settling them would
    // strand rows in a tail with no working affordances.
    const supportsSettlement = capabilities?.threadSettlement === true;
    const supportsSnooze = capabilities?.threadSnooze === true;
    const threadKey = scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
    if (capabilities?.threadActiveReorder === true) activeReorderable.add(threadKey);
    // Older servers retain their existing drag actions. Active placement
    // additionally requires its own ordering capability at the drop target.
    if (capabilities?.threadPinning === true && capabilities.threadPinReorder === true) {
      draggable.add(threadKey);
    }
    if (optimisticDrop?.key === threadKey) {
      const projected = applySidebarThreadDrop(
        thread,
        optimisticDrop.section,
        optimisticDrop.occurredAt,
        optimisticDrop.assignedKeys.get(threadKey),
      );
      (optimisticDrop.section === "pinned"
        ? pinned
        : optimisticDrop.section === "settled"
          ? settled
          : inbox(projected)
      ).push(
        optimisticDrop.clearsSnooze
          ? projected
          : { ...projected, snoozedAt: thread.snoozedAt, snoozedUntil: thread.snoozedUntil },
      );
    } else {
      const section = resolveSidebarThreadSection({
        snoozed: supportsSnooze && effectiveSnoozed(thread, { now: preciseNow }),
        settled: supportsSettlement && thread.settledOverride === "settled",
        pinned: thread.pinnedAt != null,
      });
      (section === "snoozed"
        ? snoozed
        : section === "settled"
          ? settled
          : section === "pinned"
            ? pinned
            : inbox(thread)
      ).push(thread);
    }
  }
  // One shared rule on every platform (see sortPinnedThreadsByOrderKey):
  // user-arranged keys first, keyless threads in creation order below.
  // Server capability only gates DRAGGING — it must not influence the
  // sort, or mixed-version fleets would render different pinned orders on
  // web and mobile from the same data.
  const sortedPinned = sortPinnedThreadsForSidebar(pinned);
  const sortedActive = workingShelfEnabled
    ? sortInboxThreadsByReturn(active, inboxReturns.returnedAt)
    : sortThreadsForSidebar(active);
  return {
    todayRows: isTodayView
      ? buildTodayView(visible, Date.parse(preciseNow), inboxReturns.returnedAt)
      : { working: [], waiting: [] },
    pinnedThreads:
      optimisticDrop?.section !== "pinned" || optimisticDrop.order === null
        ? sortedPinned
        : orderItemsByPreferredIds({
            items: sortedPinned,
            preferredIds: optimisticDrop.order,
            getId: (thread) => scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
          }),
    draggableThreadKeys: draggable,
    activeReorderableThreadKeys: activeReorderable,
    activeThreads:
      optimisticDrop?.section !== "active" || optimisticDrop.order === null
        ? sortedActive
        : orderItemsByPreferredIds({
            items: sortedActive,
            preferredIds: optimisticDrop.order,
            getId: (thread) => scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
          }),
    // Newest send first; finishing and waking again do not move a row.
    workingThreads: sortWorkingThreadsBySend(working),
    // Soonest wake first: "what comes back next" is the shelf's question.
    snoozedThreads: snoozed.toSorted(
      (left, right) =>
        firstValidTimestampMs(left.snoozedUntil ?? null) -
        firstValidTimestampMs(right.snoozedUntil ?? null),
    ),
    settledThreads: sortSettledThreads(settled),
    snoozeNow: preciseNow,
  };
}

function canOperateThreads(
  threads: ReadonlyArray<Pick<SidebarThreadSummary, "environmentId">>,
): boolean {
  return threads.every((thread) =>
    readEnvironmentScope(thread.environmentId, AuthOrchestrationOperateScope),
  );
}

function checkThreadOperations(
  threads: ReadonlyArray<Pick<SidebarThreadSummary, "environmentId">>,
): boolean {
  if (canOperateThreads(threads)) return true;
  toastManager.add({
    type: "error",
    title: t.sidebar.thread.actionUnavailableToast,
    description: t.sidebar.thread.operationDeniedHint,
  });
  return false;
}

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
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSnooze: (preset: Pick<SnoozePreset, "snoozedUntil">) => void;
  timestampFormat: TimestampFormat;
}) {
  const { open, onOpenChange, onSnooze, timestampFormat } = props;
  // Presets resolve at open time so "In 1 hour" is relative to the click,
  // not to when the row mounted.
  const presets = (() => (open ? resolveSnoozePresets(new Date(), timestampFormat) : []))();
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
              onSnooze(preset);
            }}
          >
            {preset.label}
            <MenuShortcut>{preset.whenLabel}</MenuShortcut>
          </MenuItem>
        ))}
        <MenuSeparator />
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

const SIDEBAR_SORTABLE_DRAG_DISABLED = { draggable: true } as const;
const SIDEBAR_SORTABLE_DRAG_ENABLED = { draggable: false } as const;

// Takes the row's props rather than a render function: a closure from the
// sidebar body is new on every sidebar render, which rebuilt the bag and
// re-rendered every memoized row with it.
function SortableThreadRow(
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
  // Keyed by variant so a card/slim switch remounts the row.
  return <SidebarThreadRow key={rowProps.variant} {...rowProps} sortable={bag} />;
}

// Drafts share the ordinary card surface; the pen conveys unsent work in B1.
const draftSurfaceClassName =
  "bg-transparent hover:bg-sidebar-row-hover hover:shadow-raise-xs-control";
const draftPenClassName = "size-3.25 shrink-0 text-secondary-label";

/** Keeps headers and empty targets in the sortable geometry without allowing them to be picked up; placeholder reveals must not animate from a hidden position. */
function SortableSidebarMarker(props: {
  marker: SidebarListMarker;
  className?: string;
  children?: ReactNode;
  "data-testid"?: string;
}) {
  const { setNodeRef, transform, transition } = useSortable({
    id: sidebarMarkerId(props.marker),
    disabled: SIDEBAR_SORTABLE_DRAG_DISABLED,
    animateLayoutChanges: animateSidebarLayoutChanges,
  });
  return (
    <li
      ref={setNodeRef}
      data-thread-selection-safe
      data-testid={props["data-testid"]}
      className={cn("list-none", props.className)}
      style={{
        transform: CSS.Translate.toString(transform),
        // A newly revealed target must not slide from its hidden position.
        transition: props.marker.endsWith("-placeholder") ? "none" : transition,
        visibility: transform?.scaleY === 0 ? "hidden" : undefined,
      }}
    >
      {props.children}
    </li>
  );
}

/** Keep the empty Active target measurable without reserving resting space.
 * The sorting strategy opens its hint during a drag; props select its label and target state. */
function SidebarSectionPlaceholder(props: {
  marker: "active-placeholder";
  label: string;
  showHint: boolean;
  isDropTarget: boolean;
}) {
  return (
    <SortableSidebarMarker
      marker={props.marker}
      data-testid={`sidebar-${props.marker}`}
      className="relative mx-0.5 -mb-px h-0"
    >
      {props.showHint ? (
        <div
          className={cn(
            "absolute inset-x-0 top-0 flex h-9 items-center justify-center rounded-md border border-dashed border-sidebar-foreground/25 text-xs text-sidebar-foreground/80",
            props.isDropTarget && "border-primary/40 bg-primary/5 text-primary",
          )}
        >
          {props.label}
        </div>
      ) : null}
    </SortableSidebarMarker>
  );
}

// Pointer travel before a press on a row starts a drag, or a press on its
// action button starts a sweep. Shorter presses stay clicks.
const SIDEBAR_DRAG_DISTANCE = 6;

type SidebarSweepAction = "settle" | "unsettle" | "unsnooze";

// Zero-height markers reserve no label space at rest. During a drag the
// sorting strategy opens 24px for a 16px label with 4px clearance on each side.
const SIDEBAR_DRAG_LABEL_HEIGHT = 24;

function SidebarDragBoundary(props: {
  marker: "pinned-header" | "pinned-divider";
  label: string;
  visible: boolean;
  isDropTarget: boolean;
}) {
  return (
    <SortableSidebarMarker
      marker={props.marker}
      data-testid={`sidebar-${props.marker}`}
      className="pointer-events-none relative mx-0.5 -mb-px h-0"
    >
      {props.visible ? (
        <div className="sidebar-drag-boundary-label absolute inset-x-2 top-1 flex h-4 items-center gap-2">
          <span
            className={cn(
              "shrink-0 text-xs font-medium",
              props.isDropTarget ? "text-primary" : "text-sidebar-foreground/80",
            )}
          >
            {props.label}
          </span>
          <span
            aria-hidden
            className={cn(
              "h-px flex-1",
              props.isDropTarget ? "bg-primary/50" : "bg-sidebar-foreground/25",
            )}
          />
        </div>
      ) : null}
    </SortableSidebarMarker>
  );
}

/** Renders an invested draft in the card layout; the frozen snapshot avoids repainting while typing. */
const SidebarDraftRow = memo(function SidebarDraftRow(props: {
  draftId: DraftId;
  composer: ComposerThreadDraftState;
  project: ProjectFaviconProject | null;
  projectDisplayName: string | null;
  branch: string | null;
  isActive: boolean;
  onNavigate: (draftId: DraftId) => void;
  onDiscard: (draftId: DraftId) => void;
  onContextMenu: (draftId: DraftId, position: { x: number; y: number }) => void;
}) {
  const { composer, draftId, onContextMenu, onDiscard, onNavigate } = props;
  const focusVisibleWithin = useFocusVisibleWithin();
  const promptPreview =
    replaceComposerContextReferences(composer.prompt, (occurrence) => occurrence.label)
      .trim()
      .split("\n", 1)[0] ?? "";
  // images mirrors persistedAttachments once rehydration finishes; before
  // that only the persisted list is populated, hence max not sum.
  const attachmentCount =
    Math.max(composer.images.length, composer.persistedAttachments.length) +
    composer.files.length +
    composer.terminalContexts.length +
    composer.previewAnnotations.length +
    composer.reviewComments.length;
  const preview =
    promptPreview.length > 0 ? promptPreview : t.sidebar.thread.attachmentCount(attachmentCount);
  const accessibility = resolveSidebarRowAccessibility({
    title: preview,
    statusLabel: t.sidebar.thread.unsentDraftHint,
    projectDisplayName: props.projectDisplayName,
    isActive: props.isActive,
  });
  const handleActivate = () => onNavigate(draftId);
  const handleKeyDown = (event: ReactKeyboardEvent) => {
    // Keys targeting the nested discard button belong to the button:
    // preventDefault here would swallow Space's synthesized click and
    // navigate instead of discarding.
    if ((event.target as HTMLElement).closest("button")) return;
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      onContextMenu(draftId, { x: rect.left, y: rect.bottom });
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onNavigate(draftId);
    }
  };
  const handleContextMenu = (event: ReactMouseEvent) => {
    event.preventDefault();
    onContextMenu(draftId, { x: event.clientX, y: event.clientY });
  };
  const handleDiscard = (event: ReactMouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onDiscard(draftId);
  };
  return (
    <li className="list-none pb-0.75">
      <div
        role="button"
        tabIndex={0}
        aria-label={accessibility.label}
        aria-current={accessibility.current}
        data-testid="sidebar-draft-row"
        data-focus-visible-within={focusVisibleWithin.active}
        {...focusVisibleWithin.handlers}
        className={cn(
          "group/sidebar-row relative w-full cursor-pointer rounded-card-row text-left text-sidebar-foreground outline-none select-none focus-visible:inset-shadow-focus",
          props.isActive ? "bg-sidebar-row-active shadow-raise-m" : draftSurfaceClassName,
        )}
        onClick={handleActivate}
        onContextMenu={handleContextMenu}
        onKeyDown={handleKeyDown}
      >
        <span className="sr-only">{preview}</span>
        <div className="relative z-10 flex h-19.5 flex-col gap-0.75 px-3 py-2.5">
          <div className="flex h-5 min-w-0 items-center gap-1.5">
            <SquarePenIcon aria-hidden className={draftPenClassName} />
            {props.project ? (
              <ProjectFavicon project={props.project} className="size-4 shrink-0" />
            ) : null}
            <span className="min-w-0 flex-1 truncate text-secondary-copy text-secondary-label">
              {props.projectDisplayName ?? t.tools.palette.noProject}
            </span>
            <span className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-end">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      aria-label={t.sidebar.thread.discardDraft}
                      onClick={handleDiscard}
                      className="-my-1.5 -mr-1.5 hidden h-7.5 w-7 cursor-pointer items-center justify-center rounded-full bg-secondary text-foreground shadow-raise-xs-control outline-none hover:bg-accent focus-visible:inset-shadow-focus group-hover/sidebar-row:inline-flex group-focus-visible/sidebar-row:inline-flex group-data-[focus-visible-within=true]/sidebar-row:inline-flex"
                    >
                      <XIcon className="size-3.5" />
                    </button>
                  }
                />
                <TooltipPopup side="top">{t.sidebar.thread.discardDraft}</TooltipPopup>
              </Tooltip>
            </span>
          </div>
          <div
            aria-hidden
            className={cn(
              "h-4.5 shrink-0 truncate text-heading leading-4.5 text-foreground",
              props.isActive ? "font-bold" : "font-semibold",
            )}
          >
            {preview}
          </div>
          <div className="flex h-3.5 shrink-0 items-center gap-2 font-mono text-meta-large leading-3.5 text-muted-foreground">
            {props.branch ? (
              <>
                <GitBranchIcon aria-hidden className="size-3 shrink-0" />
                <span className="flex min-w-0">
                  <MiddleTruncate value={props.branch} showTitle={false} />
                </span>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
});

interface SidebarDraftRowData {
  draftId: DraftId;
  session: DraftSessionState;
  composer: ComposerThreadDraftState;
}

/** Owns draft subscriptions above pinned rows so composer keystrokes never rerender the whole list. */
const SidebarDraftBlock = memo(function SidebarDraftBlock(props: {
  projectByKey: ReadonlyMap<string, EnvironmentProject>;
  projectDisplayNameByKey: ReadonlyMap<string, string>;
  scopedProjectKeys: ReadonlySet<string> | null;
  routeDraftId: string | null;
  onNavigateToDraft: (draftId: DraftId) => void;
  onDraftContextMenu: (draftId: DraftId, position: { x: number; y: number }) => void;
}) {
  const draftThreadsByThreadKey = useComposerDraftStore((store) => store.draftThreadsByThreadKey);
  const draftsByThreadKey = useComposerDraftStore((store) => store.draftsByThreadKey);
  // The open draft's row is FROZEN at the moment the draft became the route:
  // it stays visible (like a thread row) but never repaints while the user
  // types. A draft that was never navigated away from has no snapshot to
  // freeze, so a fresh typing session shows no row at all. Captured
  // synchronously on route change (setState-during-render derived state) so
  // the row never flickers out for a frame between route change and capture.
  const [frozenActive, setFrozenActive] = useState<{
    routeDraftId: string | null;
    row: SidebarDraftRowData | null;
  }>({ routeDraftId: null, row: null });
  if (frozenActive.routeDraftId !== props.routeDraftId) {
    let row: SidebarDraftRowData | null = null;
    if (props.routeDraftId !== null) {
      const draftId = DraftId.make(props.routeDraftId);
      const session = draftThreadsByThreadKey[draftId];
      const composer = draftsByThreadKey[draftId];
      row =
        session && session.promotedTo == null && composer && composerDraftHasUserContent(composer)
          ? { draftId, session, composer }
          : null;
    }
    setFrozenActive({ routeDraftId: props.routeDraftId, row });
  }
  const drafts = (() => {
    const rows: SidebarDraftRowData[] = [];
    // Every non-promoted session with content gets a row, mapped or not:
    // new-thread surfaces mint fresh drafts and leave invested ones behind
    // unmapped, so the mapping only knows about the latest per project.
    for (const [draftKey, session] of Object.entries(draftThreadsByThreadKey)) {
      if (session.promotedTo != null) {
        continue;
      }
      if (
        props.scopedProjectKeys !== null &&
        !props.scopedProjectKeys.has(`${session.environmentId}:${session.projectId}`)
      ) {
        continue;
      }
      if (draftKey === props.routeDraftId) {
        // Open draft: render the frozen entry snapshot, or nothing for a
        // draft that has never been left. Gated on the LIVE session above so
        // send/discard still removes the row immediately.
        if (frozenActive.routeDraftId === draftKey && frozenActive.row !== null) {
          rows.push(frozenActive.row);
        }
        continue;
      }
      const composer = draftsByThreadKey[draftKey];
      if (!composer || !composerDraftHasUserContent(composer)) {
        continue;
      }
      rows.push({ draftId: DraftId.make(draftKey), session, composer });
    }
    rows.sort((left, right) => right.session.createdAt.localeCompare(left.session.createdAt));
    return rows;
  })();
  if (drafts.length === 0) {
    return null;
  }
  return (
    <>
      {drafts.map(({ composer, draftId, session }) => {
        const projectKey = `${session.environmentId}:${session.projectId}`;
        return (
          <SidebarDraftRow
            key={draftId}
            draftId={draftId}
            composer={composer}
            project={props.projectByKey.get(projectKey) ?? null}
            projectDisplayName={props.projectDisplayNameByKey.get(projectKey) ?? null}
            branch={session.branch}
            isActive={draftId === props.routeDraftId}
            onNavigate={props.onNavigateToDraft}
            // The /draft/$draftId route redirects home on its own when the
            // draft it renders disappears, so discarding the open draft needs
            // no special-casing here.
            onDiscard={discardComposerDraft}
            onContextMenu={props.onDraftContextMenu}
          />
        );
      })}
      <li
        aria-hidden
        data-testid="sidebar-draft-divider"
        className="mx-2.5 my-1.5 h-px list-none bg-sidebar-border/60"
      />
    </>
  );
});

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
  const { leaseLiveStatus, rowRef } = useSidebarRowSubscriptionLease(props.isActive);
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
    ? getTriggerDisplayModelLabel(selectedModel)
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
  const renameCommittedRef = useRef(false);
  useEffect(() => {
    if (isRenaming) renameCommittedRef.current = false;
  }, [isRenaming]);
  const handleRenameKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === "Enter") {
      event.preventDefault();
      renameCommittedRef.current = true;
      onCommitRename(threadRef, renamingTitle, thread.title);
    } else if (event.key === "Escape") {
      event.preventDefault();
      renameCommittedRef.current = true;
      onCancelRename();
    }
  };
  const handleRenameBlur = () => {
    if (!renameCommittedRef.current) {
      onCommitRename(threadRef, renamingTitle, thread.title);
    }
  };
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
    setSnoozeGateClock({ thread, now: new Date().toISOString() });
  }
  const snoozeGateNow = snoozeGateClock.now;
  const snoozeGateExpiryMs = hasQueuedTurnStart(thread, { now: snoozeGateNow })
    ? Date.parse(thread.latestUserMessageAt ?? "") + QUEUED_TURN_START_GRACE_MS
    : Number.NaN;
  useEffect(() => {
    // A gate still closed past its expiry is held by runtime status, not time,
    // so no clock tick can open it.
    if (!Number.isFinite(snoozeGateExpiryMs) || snoozeGateExpiryMs <= Date.parse(snoozeGateNow)) {
      return;
    }
    const id = window.setTimeout(
      () => setSnoozeGateClock({ thread, now: new Date().toISOString() }),
      Math.min(Math.max(0, snoozeGateExpiryMs - Date.now()) + 50, 2_147_483_647),
    );
    return () => window.clearTimeout(id);
  }, [snoozeGateExpiryMs, snoozeGateNow, thread]);
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
      <input
        autoFocus
        value={renamingTitle}
        aria-label={t.sidebar.thread.titleAriaLabel}
        onChange={(event) => onRenameTitleChange(event.target.value)}
        onFocus={(event) => event.currentTarget.select()}
        onKeyDown={handleRenameKeyDown}
        onBlur={handleRenameBlur}
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        className="min-w-0 flex-1 rounded-keycap border border-border bg-input px-1 text-control text-foreground outline-none focus-visible:inset-shadow-focus"
      />
    ) : (
      <span
        aria-hidden
        className={cn(
          "min-w-0 flex-1 truncate",
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
                role="button"
                tabIndex={0}
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
              role="button"
              tabIndex={0}
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

/** Keeps flat search hits on B1's card surface; keyboard focus remains on the search input. */
const SidebarSearchResultRow = memo(function SidebarSearchResultRow(props: {
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
  onHighlight: () => void;
  onSelect: () => void;
  onFileDropThreads: (threadRef: ScopedThreadRef, files: File[]) => void;
}) {
  const { thread } = props;
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
    ? getTriggerDisplayModelLabel(selectedModel)
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
    <li role="presentation" className="list-none" {...fileDropHandlers}>
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
              <SidebarSearchText text={props.searchMatch.snippet} query={props.searchQuery} />
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

/** Owns a single pending menu selection and its Base UI popup; cancellation resolves null. */
export function useSidebarThreadContextMenu() {
  const router = useRouter();
  const [threadContextMenu, setThreadContextMenu] = useState<{
    items: readonly ContextMenuItem<ThreadActionMenuId>[];
    position: { x: number; y: number };
  } | null>(null);
  const threadMenuResolutionRef = useRef<((action: ThreadActionMenuId | null) => void) | null>(
    null,
  );
  const threadMenuFocusRef = useRef<HTMLElement | null>(null);
  const finishThreadContextMenu = (action: ThreadActionMenuId | null = null) => {
    const resolve = threadMenuResolutionRef.current;
    threadMenuResolutionRef.current = null;
    setThreadContextMenu(null);
    resolve?.(action);
  };
  // Drafts and non-thread pages share a null thread key, so observe navigation itself.
  useEffect(() => {
    const unsubscribe = router.subscribe("onBeforeNavigate", () => finishThreadContextMenu());
    return () => {
      unsubscribe();
      finishThreadContextMenu();
    };
  }, [router, finishThreadContextMenu]);
  const threadMenuAnchor = (() => ({
    getBoundingClientRect: () =>
      DOMRect.fromRect({
        x: threadContextMenu?.position.x ?? 0,
        y: threadContextMenu?.position.y ?? 0,
      }),
  }))();
  const showThreadContextMenu = (
    items: readonly ContextMenuItem<ThreadActionMenuId>[],
    position: { x: number; y: number },
    trigger?: HTMLElement,
  ) => {
    finishThreadContextMenu();
    threadMenuFocusRef.current =
      trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    return new Promise<ThreadActionMenuId | null>((resolve) => {
      threadMenuResolutionRef.current = resolve;
      setThreadContextMenu({ items, position });
    });
  };
  const popup = (
    // ContextMenu registers a root node without a Menu.Trigger, so children are not siblings.
    <ContextMenu.Root
      open={threadContextMenu !== null}
      onOpenChange={(open) => {
        if (!open) finishThreadContextMenu();
      }}
    >
      {threadContextMenu ? (
        <MenuPopup
          anchor={threadMenuAnchor}
          align="start"
          alignOffset={0}
          sideOffset={0}
          finalFocus={() =>
            threadMenuFocusRef.current?.isConnected ? threadMenuFocusRef.current : false
          }
        >
          <ThreadMenuItems
            items={threadContextMenu.items}
            onSelect={finishThreadContextMenu}
            radioChoices
            renderLabel={(item) => (
              <>
                <span className="min-w-0 max-w-64 flex-1 truncate">{item.label}</span>
                {item.id === "auto-settle" ? (
                  <span className="shrink-0 text-secondary-copy text-secondary-label in-data-disabled:text-current">
                    {item.children?.find((child) => child.checked)?.label}
                  </span>
                ) : null}
              </>
            )}
          />
        </MenuPopup>
      ) : null}
    </ContextMenu.Root>
  );
  return { show: showThreadContextMenu, close: finishThreadContextMenu, popup };
}

/** Renders workspace navigation and dispatches project, thread and discussion entry actions. */
export default function Sidebar() {
  const projects = useProjects();
  const projectOrder = useUiStateStore((store) => store.projectOrder);
  const threads = useThreadShells();
  const router = useRouter();
  const { isMobile, setOpenMobile } = useSidebar();
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const confirmThreadDelete = useClientSettings((s) => s.confirmThreadDelete);
  const confirmThreadArchive = useClientSettings((s) => s.confirmThreadArchive);
  const sidebarProjectSortOrder = useClientSettings((s) => s.sidebarProjectSortOrder);
  const timestampFormat = useClientSettings((s) => s.timestampFormat);
  const workingShelfEnabled = useClientSettings((s) => s.sidebarWorkingShelfEnabled);
  const projectGroupingSettings = useClientSettings(selectProjectGroupingSettings);
  const {
    settleThread,
    unsettleThread,
    snoozeThread,
    unsnoozeThread,
    pinThread,
    unpinThread,
    confirmAndUnpinThread,
    setThreadAutoSettle,
    reorderPinnedThread,
    reorderActiveThread,
    markThreadUnread,
    archiveThread,
    deleteThread,
  } = useThreadActions();
  const updateThreadMetadata = useOrchestrationCommand(threadEnvironment.updateMetadata, {
    reportFailure: false,
  });
  const { copyToClipboard: copyPathToClipboard } = useCopyToClipboard<{ path: string }>({
    onCopy: ({ path }) => {
      toastManager.add({
        type: "success",
        title: t.sidebar.clipboard.pathCopiedToast,
        description: path,
      });
    },
    onError: (error) => {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: t.sidebar.clipboard.copyPathError,
          description: error instanceof Error ? error.message : t.sidebar.errors.genericError,
        }),
      );
    },
  });
  const { copyToClipboard: copyBranchToClipboard } = useCopyToClipboard<{ branch: string }>({
    target: "branch name",
    onCopy: ({ branch }) => {
      toastManager.add({
        type: "success",
        title: t.sidebar.clipboard.branchCopiedToast,
        description: branch,
      });
    },
    onError: (error) => {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: t.sidebar.clipboard.copyBranchError,
          description: error instanceof Error ? error.message : t.sidebar.errors.genericError,
        }),
      );
    },
  });
  const { copyToClipboard: copyThreadIdToClipboard } = useCopyToClipboard<{ threadId: ThreadId }>({
    onCopy: ({ threadId }) => {
      toastManager.add({
        type: "success",
        title: t.sidebar.clipboard.threadIdCopiedToast,
        description: threadId,
      });
    },
    onError: (error) => {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: t.sidebar.clipboard.copyThreadIdError,
          description: error instanceof Error ? error.message : t.sidebar.errors.genericError,
        }),
      );
    },
  });
  const newThreadContext = useHandleNewThread();
  const { scratchEnvironmentId, startScratchThread } = useScratchProject();
  const openAddProjectCommandPalette = () => openCommandPalette({ open: "add-project" });
  const environments = useEnvironmentIdentities();
  const serverConfigs = useServerConfigs();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const clearSelection = useThreadSelectionStore((s) => s.clearSelection);
  const setSelectionAnchor = useThreadSelectionStore((s) => s.setAnchor);
  const toggleThreadSelection = useThreadSelectionStore((s) => s.toggleThread);
  const rangeSelectTo = useThreadSelectionStore((s) => s.rangeSelectTo);
  const acknowledgeWoke = useAcknowledgeThreadWoke();
  const routeTarget = useThreadRouteTarget();
  const routeDraftThread = useComposerDraftStore((store) =>
    routeTarget?.kind === "draft" ? store.getDraftSession(routeTarget.draftId) : null,
  );
  const routeThreadRef = (() => resolveActiveThreadRouteRef(routeTarget, routeDraftThread))();
  const routeThreadKey = routeThreadRef ? scopedThreadKey(routeThreadRef) : null;
  const routeRowThreadKey =
    routeThreadRef === null
      ? null
      : scopedThreadKey(
          scopeThreadRef(
            routeThreadRef.environmentId,
            resolveSidebarRowThreadId(
              routeThreadRef.threadId,
              routeThreadRef.environmentId,
              threads,
            ),
          ),
        );
  const routeTargetRef = useRef(routeTarget);
  // Post-settle navigation validates against the CURRENT route, not the one
  // captured when the settle started: if the user navigated elsewhere while
  // the command was in flight, completing it must not yank them away.
  const routeThreadKeyRef = useRef(routeThreadKey);

  const environmentLabelById = (() =>
    new Map(
      environments.map((environment) => [environment.environmentId, environment.label] as const),
    ))();
  const environmentMachineById = useEnvironmentMachines();
  const orderedProjects = (() =>
    prepareSidebarProjectsForGrouping(projects, sidebarProjectSortOrder, projectOrder))();
  const unsortedProjectGroups = (() =>
    buildSidebarProjectSnapshots({
      projects: orderedProjects,
      groupScratchProjects: true,
      settings: projectGroupingSettings,
      primaryEnvironmentId,
      resolveEnvironmentLabel: (environmentId) => environmentLabelById.get(environmentId) ?? null,
    }))();
  const projectGroups = (() =>
    sortSidebarV2ProjectGroups(unsortedProjectGroups, threads, sidebarProjectSortOrder))();
  const projectGroupsRef = useRef(projectGroups);
  // Threads on non-primary environments (T3 Connect, hosted) resolve their
  // provider entry from their own environment's config: default instance ids
  // are driver slugs, so a flat map would collide across environments.
  const providerEntriesByEnvironment = useAtomValue(sidebarProviderEntriesAtom);
  // Rows read the project record for its icon and cwd. Group labels can include
  // a repository owner or a different title, so they travel separately.
  const projectByKey = (() =>
    new Map(projects.map((project) => [`${project.environmentId}:${project.id}`, project])))();
  const projectDisplayNameByKey = (() =>
    new Map(
      projectGroups.flatMap((group) =>
        group.memberProjects.map(
          (project) => [`${project.environmentId}:${project.id}`, group.displayName] as const,
        ),
      ),
    ))();

  const nowMinute = useNowMinute();
  // Snooze wake times are second-precise, so classifying with the quantized
  // minute would hold a woken thread on the shelf for up to a minute. The
  // tick is a plain counter bumped exactly at the next wake boundary (armed
  // below, after the partition knows the boundary); the partition reads a
  // fresh clock whenever it recomputes.
  const [snoozeWakeTick, bumpSnoozeWakeTick] = useState(0);
  const [todayTick, bumpTodayTick] = useState(0);

  // ProjectRail owns the picker; the list reads its shared persisted scope.
  // The selection lives in the persisted UI store next to the other sidebar
  // project preferences, so routes that unmount the sidebar (Settings) and
  // app restarts keep it.
  const persistedProjectScopeKey = useUiStateStore((store) => store.sidebarProjectScopeKey);
  const setProjectScopeKey = useUiStateStore((store) => store.setSidebarProjectScopeKey);
  const projectScopeKey = (() =>
    resolveSidebarProjectScopeKey({
      groups: projectGroups,
      key: persistedProjectScopeKey,
      settings: projectGroupingSettings,
    }))();
  const isTodayView = projectScopeKey === null;
  useEffect(() => {
    if (!isTodayView) return;
    let id: number;
    const armMidnight = () => {
      // Advance the local calendar date rather than adding 24 hours across DST changes.
      const midnight = new Date();
      midnight.setDate(midnight.getDate() + 1);
      midnight.setHours(0, 0, 0, 0);
      const delayMs = Math.min(Math.max(0, midnight.getTime() - Date.now()) + 50, 2_147_483_647);
      id = window.setTimeout(() => {
        bumpTodayTick((tick) => tick + 1);
        armMidnight();
      }, delayMs);
    };
    armMidnight();
    return () => window.clearTimeout(id);
  }, [isTodayView]);
  // Same-named projects on two machines are only told apart by where they
  // live, so rows on another machine carry its icon once the catalog spans
  // more than one environment; a single-machine catalog stays as it was.
  const showProjectEnvironments = (() => projectGroupsSpanEnvironments(projectGroups))();
  const scratchMachineLabelFor = (
    thread: Pick<SidebarThreadSummary, "environmentId" | "projectId">,
  ) => {
    if (!showProjectEnvironments) return null;
    const project = projectByKey.get(`${thread.environmentId}:${thread.projectId}`);
    if (
      !project ||
      !isScratchProject(project, serverConfigs.get(thread.environmentId)?.scratchWorkspaceRoot)
    ) {
      return null;
    }
    return environmentLabelById.get(thread.environmentId) ?? null;
  };
  const scopedProjectGroup = (() =>
    projectScopeKey === null
      ? null
      : (projectGroups.find((project) => project.projectKey === projectScopeKey) ?? null))();
  const scopedProjectKeys = (() =>
    scopedProjectGroup === null
      ? null
      : new Set(
          scopedProjectGroup.memberProjectRefs.map(
            (projectRef) => `${projectRef.environmentId}:${projectRef.projectId}`,
          ),
        ))();
  // Configs identify scratch projects, so both they and live project snapshots
  // must arrive before a persisted scope can be considered missing.
  const allProjectSnapshotsReady = useAllEnvironmentProjectSnapshotsReady();
  const allProjectConfigsReady = useAtomValue(environmentProjects.projectConfigsReadyAtom);
  useEffect(() => {
    const nextKey = resolveSidebarProjectScopeKey({
      groups: projectGroups,
      key: persistedProjectScopeKey,
      settings: projectGroupingSettings,
      canClearMissingScope: allProjectSnapshotsReady && allProjectConfigsReady,
    });
    if (nextKey !== persistedProjectScopeKey) {
      setProjectScopeKey(nextKey);
    }
  }, [
    allProjectConfigsReady,
    allProjectSnapshotsReady,
    persistedProjectScopeKey,
    projectGroups,
    projectGroupingSettings,
    setProjectScopeKey,
  ]);
  // Count-only subscription: the parent needs "are there draft rows" for the
  // empty state, while SidebarDraftBlock owns the per-keystroke content
  // subscription. Selecting a number keeps typing in a draft composer from
  // re-rendering the whole sidebar. Approximates the block's row filter
  // (every non-promoted session with content); it can overcount by one for
  // an open never-left draft, which only softens the empty state.
  const routeDraftIdForRows = routeTarget?.kind === "draft" ? routeTarget.draftId : null;
  const visibleDraftSessionCount = useComposerDraftStore((store) => {
    let count = 0;
    for (const [draftKey, session] of Object.entries(store.draftThreadsByThreadKey)) {
      if (session.promotedTo != null) {
        continue;
      }
      if (!composerDraftHasUserContent(store.draftsByThreadKey[draftKey])) {
        continue;
      }
      if (
        scopedProjectKeys !== null &&
        !scopedProjectKeys.has(`${session.environmentId}:${session.projectId}`)
      ) {
        continue;
      }
      count += 1;
    }
    return count;
  });
  // Scope flips drop the selection: rows selected under the old scope may be
  // hidden now, and bulk actions must never count or touch invisible rows.
  useEffect(() => {
    if (projectScopeKey !== undefined) clearSelection();
  }, [clearSelection, projectScopeKey]);

  const openProjectSettings = useStableCallback(
    (projectGroup: SidebarProjectSnapshot, projectRef?: ScopedProjectRef) => {
      if (isMobile) {
        setOpenMobile(false);
      }
      void router.navigate({
        to: "/projects/$projectKey",
        params: {
          projectKey: getSidebarProjectSettingsKey(
            projectGroup,
            projectGroupingSettings,
            projects,
            projectRef,
          ),
        },
      });
    },
  );
  // Keep a dropped row at its destination while its server applies the
  // lifecycle command and any order-key writes. The next pickup waits for
  // this hold so a second drop cannot replace an unconfirmed placement.
  const [optimisticDrop, setOptimisticDrop] = useState<{
    readonly key: string;
    readonly sourceSection: SidebarSection;
    readonly section: "pinned" | "active" | "settled";
    readonly occurredAt: string;
    readonly clearsSnooze: boolean;
    /** Full destination order for pinned and active drops. */
    readonly order: readonly string[] | null;
    /** Destination order keys before the drop, to recognize concurrent writes. */
    readonly keysAtDrop: ReadonlyMap<string, string | null>;
    /** The keys this drop writes (one per planned assignment). The
        override holds until all of them appear in canonical state. */
    readonly assignedKeys: ReadonlyMap<string, string>;
  } | null>(null);
  const {
    pinnedThreads,
    draggableThreadKeys,
    activeReorderableThreadKeys,
    activeThreads,
    workingThreads,
    snoozedThreads,
    settledThreads,
    snoozeNow,
    todayRows,
  } = partitionSidebarThreads({
    threads,
    scopedProjectKeys,
    serverConfigs,
    optimisticDrop,
    workingShelfEnabled,
    isTodayView,
    clockKey: `${nowMinute}:${snoozeWakeTick}:${todayTick}`,
  });

  const threadSearchInputRef = useRef<HTMLInputElement>(null);
  const [threadSearchQuery, setThreadSearchQuery] = useState("");
  const [searchHighlight, setSearchHighlight] = useState({ orderKey: "", index: 0 });
  const isSearchingThreads = threadSearchQuery.trim().length > 0;
  const searchableThreads = (() => [
    ...pinnedThreads,
    ...activeThreads,
    ...workingThreads,
    ...snoozedThreads,
    ...settledThreads,
  ])();
  const searchEnvironmentIds = useConnectedEnvironmentIds();
  // useThreadSearch owns the debounce and the two-character floor.
  const threadSearch = useThreadSearch(searchEnvironmentIds, threadSearchQuery);
  const threadSearchMatchByKey = (() =>
    new Map(threadSearch.matches.map((match) => [threadSearchMatchKey(match), match] as const)))();
  const threadSearchResults = (() =>
    searchSidebarThreads(
      searchableThreads,
      threadSearchQuery,
      new Set(threadSearchMatchByKey.keys()),
    ))();
  const threadSearchResultOrderKey = threadSearchResults
    .map((thread) => scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)))
    .join("\0");

  // The highlight belongs to one result list; a new list starts at the top.
  const activeSearchResultIndex =
    searchHighlight.orderKey === threadSearchResultOrderKey ? searchHighlight.index : 0;
  const setActiveSearchResultIndex = (index: number | ((index: number) => number)) =>
    setSearchHighlight((current) => {
      const currentIndex = current.orderKey === threadSearchResultOrderKey ? current.index : 0;
      return {
        orderKey: threadSearchResultOrderKey,
        index: typeof index === "function" ? index(currentIndex) : index,
      };
    });
  const activeSearchResult = isSearchingThreads
    ? threadSearchResults[activeSearchResultIndex]
    : undefined;
  const activeSearchResultKey =
    activeSearchResult === undefined
      ? null
      : scopedThreadKey(scopeThreadRef(activeSearchResult.environmentId, activeSearchResult.id));
  useEffect(() => {
    if (activeSearchResultKey === null) return;
    document
      .querySelector(`[data-search-result-key="${globalThis.CSS.escape(activeSearchResultKey)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeSearchResultKey]);

  const nextSnoozeWakeAt = snoozedThreads[0]?.snoozedUntil ?? null;
  useEffect(
    () => scheduleSnoozeWake(nextSnoozeWakeAt, () => bumpSnoozeWakeTick((tick) => tick + 1)),
    [nextSnoozeWakeAt],
  );

  // The settled tail renders in pages: history shouldn't dominate the
  // sidebar, and the common lookups are recent. Expansion resets when the
  // filter context changes so a scope/search flip never inherits a deep
  // page state.
  const [settledVisibleCount, setSettledVisibleCount] = useState(SIDEBAR_SETTLED_INITIAL_COUNT);
  // The raw preference codec deliberately accepts no JSON or translated labels.
  const [currentTab, setCurrentTab] = useState(() => {
    try {
      return readSidebarTab(window.localStorage.getItem(SIDEBAR_TAB_STORAGE_KEY));
    } catch (error) {
      console.error("[SIDEBAR] Could not read the selected tab.", error);
      return readSidebarTab(null);
    }
  });
  const [todayTab, setTodayTab] = useState(() => {
    try {
      return readTodayTab(window.localStorage.getItem(TODAY_TAB_STORAGE_KEY));
    } catch (error) {
      console.error("[SIDEBAR] Could not read the selected Today tab.", error);
      return readTodayTab(null);
    }
  });
  /** Persist Today separately so entering or leaving it preserves the project's lifecycle tab. */
  const handleTodayTabChange = (tab: TodayTab) => {
    clearSelection();
    setTodayTab(tab);
    try {
      window.localStorage.setItem(TODAY_TAB_STORAGE_KEY, tab);
    } catch (error) {
      console.error("[SIDEBAR] Could not save the selected Today tab.", error);
    }
  };
  const showDrafts = isTodayView ? todayTab === "waiting" : currentTab === "active";
  /** Select a shelf and persist its raw identifier; failed storage must not block navigation. */
  const handleSidebarTabChange = (tab: SidebarTab) => {
    if (tab === currentTab) return;
    // Selected rows in another shelf must not remain targets of hidden bulk actions.
    clearSelection();
    setCurrentTab(tab);
    const entry = writeSidebarTab(tab);
    try {
      window.localStorage.setItem(entry.key, entry.value);
    } catch (error) {
      console.error("[SIDEBAR] Could not save the selected tab.", error);
    }
  };
  const settledResetKey = projectScopeKey ?? "all";
  const [lastSettledResetKey, setLastSettledResetKey] = useState(settledResetKey);
  if (lastSettledResetKey !== settledResetKey) {
    setLastSettledResetKey(settledResetKey);
    setSettledVisibleCount(SIDEBAR_SETTLED_INITIAL_COUNT);
  }
  const sidebarTabs = (() =>
    buildSidebarTabs(
      { pinnedThreads, activeThreads, workingThreads, snoozedThreads, settledThreads },
      {
        settledVisibleCount,
        routeThreadKey: routeRowThreadKey,
        getThreadKey: (thread) => scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
      },
    ))();
  const sidebarView = (() =>
    isTodayView && !isSearchingThreads
      ? { mode: "today" as const, rows: todayRows[todayTab] }
      : resolveSidebarTabView({
          tabs: sidebarTabs,
          currentTab,
          searchQuery: threadSearchQuery,
          searchResults: threadSearchResults,
        }))();
  const orderedThreads = sidebarView.rows;
  const hiddenSettledCount = sidebarTabs.hiddenSettledCount;
  const showMoreSettled = () => setSettledVisibleCount(nextSidebarSettledVisibleCount);
  const orderedThreadKeys = (() =>
    orderedThreads.map((thread) =>
      scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
    ))();
  // Rows call back into the click handler without carrying the ordered list as
  // a prop — a fresh array identity per shell update would defeat every row's
  // memoization. The ref keeps shift-range-select working against the list as
  // rendered at click time.
  const orderedThreadKeysRef = useRef(orderedThreadKeys);
  const threadByKey = (() =>
    new Map(
      orderedThreads.map(
        (thread) =>
          [scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)), thread] as const,
      ),
    ))();
  // Handlers read these through refs: depending on per-update Map/Set
  // identities would give every row a fresh callback prop on each shell
  // event and defeat row memoization during streaming.
  const threadByKeyRef = useRef(threadByKey);
  // handleNewThread is inherently unstable (depends on the projects list);
  // a ref keeps it out of attemptSettle's dependency array.
  const handleNewThreadRef = useRef(newThreadContext.handleNewThread);
  const settledThreadKeys = (() =>
    new Set(
      settledThreads.map((thread) =>
        scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
      ),
    ))();
  const settledThreadKeysRef = useRef(settledThreadKeys);
  const snoozedThreadKeys = (() =>
    new Set(
      snoozedThreads.map((thread) =>
        scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
      ),
    ))();
  const snoozedThreadKeysRef = useRef(snoozedThreadKeys);

  const jumpLabelByKey = (() => {
    const numbers = sidebarTabJumpNumbers(sidebarView, (thread) =>
      scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
    );
    const mapping = new Map<string, string>();
    for (const [threadKey, number] of numbers) {
      const command = threadJumpCommandForIndex(number - 1);
      if (command && shortcutLabelForCommand(keybindings, command))
        mapping.set(threadKey, String(number));
    }
    return mapping;
  })();
  const { showThreadJumpHints: showJumpHints, updateThreadJumpHintsVisibility } =
    useThreadJumpHintVisibility();

  // Settled threads are live shells, so opening one is plain navigation:
  // history stays readable without un-settling, and sending a message or
  // starting a session un-settles server-side.
  const navigateToThread = (threadRef: ScopedThreadRef) => {
    if (useThreadSelectionStore.getState().selectedThreadKeys.size > 0) {
      clearSelection();
    }
    setSelectionAnchor(scopedThreadKey(threadRef));
    if (isMobile) {
      setOpenMobile(false);
    }
    return router.navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(threadRef),
    });
  };

  const queuePendingFileDrop = useSidebarPendingFileDropStore((s) => s.queuePendingFileDrop);
  const clearPendingFileDrop = useSidebarPendingFileDropStore((s) => s.clearPendingFileDrop);
  const handleThreadFileDrop = async (threadRef: ScopedThreadRef, files: File[]) => {
    const dropId = queuePendingFileDrop({ threadRef, files });
    const landedBefore =
      router.buildLocation({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(threadRef),
      }).pathname === router.state.location.pathname;
    if (landedBefore) return;

    try {
      await navigateToThread(threadRef);
      const landed =
        router.buildLocation({
          to: "/$environmentId/$threadId",
          params: buildThreadRouteParams(threadRef),
        }).pathname === router.state.location.pathname;
      if (!landed) clearPendingFileDrop(dropId);
    } catch {
      clearPendingFileDrop(dropId);
    }
  };

  const navigateToDraft = (draftId: DraftId) => {
    // Unconditional: also drops a stale selection anchor left by
    // plain-click navigation, so a later shift-click starts fresh
    // instead of ranging from a row that is no longer the context.
    // (clearSelection no-ops when there is nothing to clear.)
    clearSelection();
    if (isMobile) {
      setOpenMobile(false);
    }
    void router.navigate({ to: "/draft/$draftId", params: { draftId } });
  };

  const clearThreadSearch = () => {
    setThreadSearchQuery("");
    setActiveSearchResultIndex(0);
  };
  /** Reveal the result's shelf before closing search, without waking or reopening the thread. */
  const selectThreadSearchResult = (thread: EnvironmentThreadShell) => {
    const threadRef = scopeThreadRef(thread.environmentId, thread.id);
    if (isTodayView && (todayRows.working.includes(thread) || todayRows.waiting.includes(thread))) {
      handleTodayTabChange(isSidebarThreadWorking(thread) ? "working" : "waiting");
    } else {
      // Older and settled search results need their project shelf to remain visible after search closes.
      if (isTodayView) {
        const group = projectGroups.find((candidate) =>
          candidate.memberProjectRefs.some(
            (ref) =>
              ref.environmentId === thread.environmentId && ref.projectId === thread.projectId,
          ),
        );
        if (group) setProjectScopeKey(group.projectKey);
      }
      handleSidebarTabChange(
        resolveSidebarSearchResultTab({
          threadKey: scopedThreadKey(threadRef),
          snoozedThreadKeys,
          settledThreadKeys,
        }),
      );
    }
    clearThreadSearch();
    navigateToThread(threadRef);
  };
  const handleThreadSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    // IME composition (Japanese/Chinese input) uses the same keys; committing
    // a candidate must not move the highlight or navigate away mid-compose.
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === "Escape" && isSearchingThreads) {
      event.preventDefault();
      event.stopPropagation();
      clearThreadSearch();
      return;
    }
    if (threadSearchResults.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveSearchResultIndex((index) => (index + 1) % threadSearchResults.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveSearchResultIndex(
        (index) => (index - 1 + threadSearchResults.length) % threadSearchResults.length,
      );
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const result = threadSearchResults[activeSearchResultIndex];
      if (result) selectThreadSearchResult(result);
    }
  };

  const [renamingThreadKey, setRenamingThreadKey] = useState<string | null>(null);
  const [renamingTitle, setRenamingTitle] = useState("");
  const startThreadRename = (threadRef: ScopedThreadRef, title: string) => {
    if (!readEnvironmentScope(threadRef.environmentId, AuthOrchestrationOperateScope)) return;
    setRenamingThreadKey(scopedThreadKey(threadRef));
    setRenamingTitle(title);
  };
  const cancelThreadRename = () => setRenamingThreadKey(null);
  const commitThreadRename = (threadRef: ScopedThreadRef, title: string, originalTitle: string) => {
    void (async () => {
      if (!readEnvironmentScope(threadRef.environmentId, AuthOrchestrationOperateScope)) return;
      const trimmed = title.trim();
      setRenamingThreadKey(null);
      if (trimmed.length === 0) {
        toastManager.add({ type: "warning", title: t.sidebar.thread.emptyTitleToast });
        return;
      }
      if (trimmed === originalTitle) return;
      const result = await updateThreadMetadata({
        environmentId: threadRef.environmentId,
        input: { threadId: threadRef.threadId, title: trimmed },
      });
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: t.sidebar.thread.renameError,
            description: error instanceof Error ? error.message : t.sidebar.errors.genericError,
          }),
        );
      }
    })();
  };

  const handleThreadClick = (event: ReactMouseEvent, threadRef: ScopedThreadRef) => {
    if (isSidebarNestedLinkClick(event.target)) return;
    const isMac = isMacPlatform(navigator.platform);
    const isModClick = isMac ? event.metaKey : event.ctrlKey;
    const threadKey = scopedThreadKey(threadRef);
    if (isModClick) {
      event.preventDefault();
      toggleThreadSelection(threadKey);
      return;
    }
    if (event.shiftKey) {
      event.preventDefault();
      rangeSelectTo(threadKey, orderedThreadKeysRef.current);
      return;
    }
    if (isTrailingDoubleClick(event.detail)) {
      return;
    }
    navigateToThread(threadRef);
  };

  // A settle per thread at a time: double clicks and repeated menu picks
  // must not dispatch a second settle that fails and toasts a false error.
  const settlingThreadKeysRef = useRef(new Set<string>());
  // Parking the thread you're looking at (settle or snooze) moves you
  // forward: the next remaining card (never a settled or snoozed row, never
  // one leaving in the same batch), or a fresh draft in this project when it
  // was the last active one. Callers snapshot the plan BEFORE the command
  // mutates the partition; background parks never navigate (null plan).
  const planForwardNavigation = (
    threadKey: string,
    coParkingKeys?: ReadonlySet<string>,
  ): (() => void) | null => {
    if (routeThreadKeyRef.current !== threadKey) return null;
    const shell = threadByKeyRef.current.get(threadKey);
    const orderedKeys = orderedThreadKeysRef.current;
    const settledKeys = settledThreadKeysRef.current;
    const snoozedKeys = snoozedThreadKeysRef.current;
    const currentIndex = orderedKeys.indexOf(threadKey);
    const nextCardKey =
      currentIndex === -1
        ? null
        : ([...orderedKeys.slice(currentIndex + 1), ...orderedKeys.slice(0, currentIndex)].find(
            (key) => !settledKeys.has(key) && !snoozedKeys.has(key) && !coParkingKeys?.has(key),
          ) ?? null);
    const nextThread = nextCardKey ? threadByKeyRef.current.get(nextCardKey) : null;
    return nextThread
      ? () => navigateToThread(scopeThreadRef(nextThread.environmentId, nextThread.id))
      : shell
        ? () =>
            void handleNewThreadRef.current(scopeProjectRef(shell.environmentId, shell.projectId))
        : () => void router.navigate({ to: "/" });
  };

  const attemptSettle = (
    threadRef: ScopedThreadRef,
    opts: { coSettlingKeys?: ReadonlySet<string> } = {},
  ) => {
    void (async () => {
      const threadKey = scopedThreadKey(threadRef);
      if (settlingThreadKeysRef.current.has(threadKey)) return;
      settlingThreadKeysRef.current.add(threadKey);
      return await (async () => {
        const navigateAfterSettle = planForwardNavigation(threadKey, opts.coSettlingKeys);
        const result = await settleThread(threadRef);
        if (result._tag === "Failure") {
          // Never navigate away from a thread that did not settle.
          if (!isAtomCommandInterrupted(result)) {
            const error = squashAtomCommandFailure(result);
            toastManager.add(
              stackedThreadToast({
                type: "error",
                title: t.sidebar.thread.settleError,
                description: error instanceof Error ? error.message : t.sidebar.errors.genericError,
              }),
            );
          }
          return;
        }
        // Only move forward if the user is still on the settled thread —
        // a navigation made during the await wins over ours.
        if (
          shouldNavigateAfterThreadPark({
            threadKey,
            currentThreadKey: routeThreadKeyRef.current,
            action: "settle",
            now: new Date().toISOString(),
            thread: readThreadShell(threadRef),
          })
        ) {
          navigateAfterSettle?.();
        }
      })().finally(() => {
        settlingThreadKeysRef.current.delete(threadKey);
      });
    })();
  };
  // The thread.settle shortcut parks the open thread through this same path.
  useEffect(() => registerSettleAndAdvance(attemptSettle), [attemptSettle]);
  // Post-settle navigation must skip threads settling in this same batch —
  // they are all leaving the card block together. Rows that are already
  // explicitly settled are skipped: nothing to do on a valid mixed selection.
  // Pinned rows ARE included: the decider clears the pin as part of settling,
  // so they park like the rest.
  const settleThreads = (threadKeys: readonly string[]) => {
    const coSettlingKeys = new Set(threadKeys);
    for (const threadKey of threadKeys) {
      const thread = threadByKeyRef.current.get(threadKey);
      if (!thread || thread.settledOverride === "settled") continue;
      attemptSettle(scopeThreadRef(thread.environmentId, thread.id), { coSettlingKeys });
    }
  };
  const attemptUnsettle = (threadRef: ScopedThreadRef) => {
    void (async () => {
      const result = await unsettleThread(threadRef);
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: t.sidebar.thread.unsettleError,
            description: error instanceof Error ? error.message : t.sidebar.errors.genericError,
          }),
        );
      }
    })();
  };
  const attemptUnsnooze = (threadRef: ScopedThreadRef) => {
    void (async () => {
      const result = await unsnoozeThread(threadRef);
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: t.sidebar.thread.wakeError,
            description: error instanceof Error ? error.message : t.sidebar.errors.genericError,
          }),
        );
      }
    })();
  };
  const threadListRef = useRef<HTMLUListElement | null>(null);
  const dragLabelOffsetRef = useRef(0);
  const restrictBelowPins: Modifier = (args) =>
    restrictSidebarDrag(args, dragLabelOffsetRef.current);
  const listMotionRef = useRef<ReturnType<typeof createSidebarListMotion> | null>(null);
  const attachListMotionRef = (node: HTMLUListElement | null) => {
    threadListRef.current = node;
    listMotionRef.current?.dispose();
    listMotionRef.current = node === null ? null : createSidebarListMotion(node);
    // The layout effect below captures the initial positions after the commit.
    // Measuring here forces layout midway through mount, then repeats it there.
  };

  const [dragState, setDragState] = useState<{
    readonly activeKey: string;
    readonly activeSection: SidebarSection;
    readonly occurredAt: string;
    readonly activationY: number | null;
    readonly targetSection: SidebarSection | null;
    readonly contextDrag: boolean;
  } | null>(null);
  // Working rows can supply chat context, but never preview sidebar movement.
  const isContextDrag = dragState?.contextDrag === true || dragState?.activeSection === "working";
  const dragTargetSection = isContextDrag ? null : (dragState?.targetSection ?? null);
  const dragSensorRef = useRef<SidebarPointerSensor | null>(null);
  const contextDragKeyRef = useRef<string | null>(null);
  const finishThreadDrag = (
    started: boolean,
    velocity?: { x: number; y: number },
    row?: HTMLElement | null,
  ) => {
    dragSensorRef.current = null;
    contextDragKeyRef.current = null;
    endThreadContextDrag();
    if (started) {
      listMotionRef.current?.release(velocity, row);
      setDragState(null);
    }
  };
  const attachDragSensor = (sensor: SidebarPointerSensor) => {
    dragSensorRef.current = sensor;
  };
  const cancelThreadDrag = useStableCallback(() => {
    dragSensorRef.current?.cancel();
  });
  // Dragged threads: the multi-selection when the picked-up row is part of it.
  const contextDragThreads = (): ReadonlyArray<ScopedThreadRef> => {
    const key = contextDragKeyRef.current;
    if (key === null) return [];
    const selected = useThreadSelectionStore.getState().selectedThreadKeys;
    const keys = selected.has(key) ? [...selected] : [key];
    return keys.flatMap((candidate) => {
      const ref = parseScopedThreadKey(candidate);
      return ref ? [ref] : [];
    });
  };
  const pointerOutsideThreadList = (point: { x: number; y: number }) => {
    const bounds = threadListRef.current?.getBoundingClientRect();
    return bounds !== undefined && (point.x < bounds.left || point.x > bounds.right);
  };
  const moveThreadContextDrag = (point: { x: number; y: number }) => {
    const contextDrag = pointerOutsideThreadList(point);
    setDragState((current) =>
      current === null || current.contextDrag === contextDrag
        ? current
        : { ...current, contextDrag },
    );
    if (!contextDrag) {
      endThreadContextDrag();
      return false;
    }
    const threads = contextDragThreads();
    const title =
      threadByKeyRef.current.get(contextDragKeyRef.current ?? "")?.title.trim() ||
      t.sidebar.thread.fallbackLabel;
    moveThreadContextDragGhost(point, { title, count: threads.length });
    return true;
  };
  const dropThreadContextDrag = (point: { x: number; y: number }, velocity = { x: 0, y: 0 }) => {
    if (!pointerOutsideThreadList(point)) return false;
    throwThreadContext(point, velocity, contextDragThreads(), dragSensorRef.current?.origin);
    // Releasing outside the list never reorders, whether or not a composer took the drop.
    return true;
  };
  const pointerSensorOptions = {
    distance: SIDEBAR_DRAG_DISTANCE,
    onAttach: attachDragSensor,
    onFinish: finishThreadDrag,
    onMove: moveThreadContextDrag,
    onDrop: dropThreadContextDrag,
  };
  const dndSensors = useSensors(useSensor(SidebarPointerSensor, pointerSensorOptions));
  const sectionByThreadKey = (() => {
    const map = new Map<string, SidebarSection>();
    const add = (list: readonly EnvironmentThreadShell[], section: SidebarSection) => {
      for (const thread of list) {
        map.set(scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)), section);
      }
    };
    add(pinnedThreads, "pinned");
    add(activeThreads, "active");
    add(workingThreads, "working");
    add(snoozedThreads, "snoozed");
    add(settledThreads, "settled");
    return map;
  })();
  const sectionByThreadKeyRef = useRef(sectionByThreadKey);
  const sweepScopes = (() =>
    sidebarSweepScopes(sectionByThreadKey, isTodayView ? todayTab : null, orderedThreadKeys))();
  const sweepScopesRef = useRef(sweepScopes);
  useLayoutEffect(() => {
    routeTargetRef.current = routeTarget;
    routeThreadKeyRef.current = routeThreadKey;
    projectGroupsRef.current = projectGroups;
    orderedThreadKeysRef.current = orderedThreadKeys;
    threadByKeyRef.current = threadByKey;
    handleNewThreadRef.current = newThreadContext.handleNewThread;
    settledThreadKeysRef.current = settledThreadKeys;
    snoozedThreadKeysRef.current = snoozedThreadKeys;
    sectionByThreadKeyRef.current = sectionByThreadKey;
    sweepScopesRef.current = sweepScopes;
  });
  // Drag a row action within its project section or visible Today tab.
  // Staying in one scope keeps an overshoot from changing neighboring
  // sections, whose boundaries may be hidden outside a row drag. The sweep
  // runs on the row drag's sensor and ref, so unmounting the list cancels it.
  const [actionSweep, setActionSweep] = useState<{
    action: SidebarSweepAction;
    keys: ReadonlySet<string>;
  } | null>(null);
  const startActionSweep = useStableCallback(
    (threadRef: ScopedThreadRef, action: SidebarSweepAction, event: PointerEvent) => {
      const originKey = scopedThreadKey(threadRef);
      const originScope = sweepScopesRef.current.get(originKey);
      const canApply = (key: string) => {
        const thread = threadByKeyRef.current.get(key);
        const capabilities =
          thread && serverConfigs.get(thread.environmentId)?.environment.capabilities;
        return (
          thread !== undefined &&
          originScope !== undefined &&
          sweepScopesRef.current.get(key) === originScope &&
          (action === "unsnooze"
            ? capabilities?.threadSnooze === true
            : capabilities?.threadSettlement === true)
        );
      };
      let targetKey: string | null = null;
      let sweptKeys: string[] = [];
      const sweepTo = (key: string | null) => {
        if (key === null || key === targetKey) return;
        targetKey = key;
        sweptKeys = resolveSidebarSweepKeys(orderedThreadKeysRef.current, originKey, key, canApply);
        setActionSweep({ action, keys: new Set(sweptKeys) });
      };
      dragSensorRef.current = new SidebarPointerSensor({
        active: originKey,
        event,
        options: {
          distance: SIDEBAR_DRAG_DISTANCE,
          onAttach: () => {},
          onFinish: () => {
            dragSensorRef.current = null;
            setActionSweep(null);
          },
        },
        onPending: () => {},
        onStart: () => sweepTo(originKey),
        onMove: ({ y }) =>
          sweepTo(threadListRef.current && sidebarThreadKeyAtY(threadListRef.current, y)),
        // Also runs after a press that never moved. Nothing is swept then,
        // and the button's own click applies its action. Rows that changed
        // scope mid-gesture are skipped: lifecycle section in project mode,
        // visible Today tab in Today mode, regardless of pinning.
        onEnd: () => {
          const keys = sweptKeys.filter(canApply);
          if (action === "settle") {
            settleThreads(keys);
            return;
          }
          for (const key of keys) {
            const ref = parseScopedThreadKey(key);
            if (ref === null) continue;
            if (action === "unsettle") attemptUnsettle(ref);
            else attemptUnsnooze(ref);
          }
        },
        onCancel: () => {},
        onAbort: () => {},
      });
    },
  );
  const pinnedKeys = (() =>
    pinnedThreads.map((thread) =>
      scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
    ))();
  const activeKeys = (() =>
    activeThreads.map((thread) =>
      scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
    ))();
  if (
    optimisticDrop !== null &&
    isOptimisticDropReleased({
      optimisticDrop,
      threads,
      pinnedKeys,
      activeKeys,
      now: new Date().toISOString(),
    })
  )
    setOptimisticDrop(null);
  const attemptPin = (threadRef: ScopedThreadRef) => {
    void (async () => {
      // Fresh pins take the top of the arranged run: pinThread computes a
      // key before the smallest key across ALL pinned shells — including
      // snoozed pins hidden from this list, whose keys are still part of
      // the run — so the new pin can't land beneath a hidden head.
      const result = await pinThread(threadRef);
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: t.sidebar.thread.pinError,
            description: error instanceof Error ? error.message : t.sidebar.errors.genericError,
          }),
        );
      }
    })();
  };
  const attemptUnpin = (threadRef: ScopedThreadRef) => {
    void (async () => {
      const result = await confirmAndUnpinThread(threadRef);
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: t.sidebar.thread.unpinError,
            description: error instanceof Error ? error.message : t.sidebar.errors.genericError,
          }),
        );
      }
    })();
  };

  const handleThreadDragStart = (event: DragStartEvent) => {
    const activeKey = String(event.active.id);
    contextDragKeyRef.current = activeKey;
    const activeSection = sectionByThreadKey.get(activeKey);
    if (activeSection === undefined) return;
    // Stop normal section motion before dnd-kit measures the picked-up row.
    listMotionRef.current?.suspend();
    const list = threadListRef.current;
    const header = list?.querySelector<HTMLElement>('[data-testid="sidebar-pinned-header"]');
    if (list && header) {
      const listRect = list.getBoundingClientRect();
      const scale = list.offsetWidth > 0 ? listRect.width / list.offsetWidth : 1;
      dragLabelOffsetRef.current =
        header.getBoundingClientRect().top - listRect.top + SIDEBAR_DRAG_LABEL_HEIGHT * scale;
    } else {
      dragLabelOffsetRef.current = 0;
    }
    setDragState({
      activeKey,
      activeSection,
      targetSection: activeSection,
      contextDrag: false,
      occurredAt: new Date().toISOString(),
      activationY:
        event.activatorEvent instanceof PointerEvent ? event.activatorEvent.clientY : null,
    });
  };
  // Include every visible row in the measured order. Older servers disable
  // pickup on their rows without changing where those rows render.
  const sidebarListItemsFresh = ((): readonly SidebarListItem[] => {
    const rowsOf = (
      list: readonly EnvironmentThreadShell[],
      section: SidebarSection,
    ): SidebarListItem[] =>
      list.map((thread) => ({
        kind: "thread",
        key: scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
        section,
      }));
    if (isTodayView) {
      return rowsOf(todayRows[todayTab], todayTab === "working" ? "working" : "active");
    }
    if (currentTab === "later") {
      return [
        { kind: "marker", marker: "snoozed-header" },
        ...rowsOf(sidebarTabs.rowsByTab.later, "snoozed"),
      ];
    }
    if (currentTab === "settled") {
      return [
        { kind: "marker", marker: "settled-header" },
        ...rowsOf(sidebarTabs.rowsByTab.settled, "settled"),
      ];
    }
    if (sidebarTabs.counts.active === 0) return [];
    return [
      { kind: "marker", marker: "pinned-header" },
      ...rowsOf(pinnedThreads, "pinned"),
      { kind: "marker", marker: "pinned-divider" },
      { kind: "marker", marker: "active-placeholder" },
      ...rowsOf(activeThreads, "active"),
      ...(workingThreads.length > 0
        ? [
            { kind: "marker" as const, marker: "working-header" as const },
            ...rowsOf(workingThreads, "working"),
          ]
        : []),
    ];
  })();
  // Thread shells update on every streamed event without moving rows. Keep the
  // list's identity until its order changes, so the sorting strategy, the
  // sortable context and every sortable row stay memoized meanwhile.
  const sidebarListItemsKey = sidebarListItemsFresh
    .map((item) => (item.kind === "thread" ? item.section + ":" + item.key : item.marker))
    .join("\n");
  const [sidebarListItemsState, setSidebarListItems] = useState(sidebarListItemsFresh);
  const [sidebarListItemsKeyState, setSidebarListItemsKeyState] = useState(sidebarListItemsKey);
  let sidebarListItems = sidebarListItemsState;
  if (sidebarListItemsKeyState !== sidebarListItemsKey) {
    setSidebarListItemsKeyState(sidebarListItemsKey);
    setSidebarListItems(sidebarListItemsFresh);
    // The rest of this render still runs before React applies the update, and
    // threadByKey already lacks rows that just left, such as a thread settled
    // into the collapsed Settled shelf.
    sidebarListItems = sidebarListItemsFresh;
  }
  useEffect(() => {
    if (
      dragState !== null &&
      !sidebarListItems.some((item) => item.kind === "thread" && item.key === dragState.activeKey)
    ) {
      cancelThreadDrag();
    }
  }, [cancelThreadDrag, dragState, sidebarListItems]);
  const listMotionPaused = dragState !== null;
  // Every shell event rebuilds sidebarListItems, but rows only move when the
  // rendered order or a row's section changes. Keying the motion pass on that
  // keeps ordinary updates from forcing a layout read and animating rows
  // whose position drifted for other reasons.
  const sidebarListOrderKey = (() =>
    sidebarListItems
      .map((item) => (item.kind === "thread" ? `${item.key}:${item.section}` : item.marker))
      .join("\0"))();
  const sidebarListHasRows =
    orderedThreads.length + (showDrafts ? visibleDraftSessionCount : 0) > 0;
  const listMotionPass = {
    layoutKey: [sidebarListOrderKey, routeDraftIdForRows ?? "", visibleDraftSessionCount].join(
      "\0",
    ),
    animate: !listMotionPaused && sidebarListHasRows,
  };
  useLayoutEffect(() => {
    listMotionRef.current?.update(listMotionPass.animate);
  }, [listMotionPass, listMotionRef]);
  const handleThreadDragOver = (event: DragOverEvent) => {
    const target = event.over
      ? resolveSidebarDropTarget(sidebarListItems, String(event.active.id), String(event.over.id))
      : null;
    setDragState((current) =>
      current === null || current.activeKey !== String(event.active.id)
        ? current
        : { ...current, targetSection: target?.section ?? null },
    );
  };
  const sortableIds = (() => sidebarListItems.map(sidebarListItemId))();
  const draggedSettledOrder = (() => {
    const thread = dragState === null ? undefined : threadByKey.get(dragState.activeKey);
    if (dragState === null || thread === undefined) return [];
    const key = (candidate: EnvironmentThreadShell) =>
      scopedThreadKey(scopeThreadRef(candidate.environmentId, candidate.id));
    return sortSettledThreads([
      ...settledThreads.filter((candidate) => key(candidate) !== dragState.activeKey),
      applySidebarThreadDrop(thread, "settled", dragState.occurredAt),
    ]).map(key);
  })();
  // Working beta: the inbox is time-ordered too, so the preview shows the
  // slot a drop will land in, not the slot under the pointer.
  const draggedActiveOrder = (() => {
    const thread = dragState === null ? undefined : threadByKey.get(dragState.activeKey);
    if (!workingShelfEnabled || dragState === null || thread === undefined) return undefined;
    const key = (candidate: EnvironmentThreadShell) =>
      scopedThreadKey(scopeThreadRef(candidate.environmentId, candidate.id));
    return sortInboxThreadsByReturn(
      [
        ...activeThreads.filter((candidate) => key(candidate) !== dragState.activeKey),
        applySidebarThreadDrop(thread, "active", dragState.occurredAt),
      ],
      inboxReturns.returnedAt,
    ).map(key);
  })();
  const sidebarSortingStrategy = (() =>
    createSidebarSortingStrategy({
      items: sidebarListItems,
      enabled: !isTodayView && !isContextDrag && currentTab === "active",
      boundaryLabelHeight: SIDEBAR_DRAG_LABEL_HEIGHT,
      settledOrder: draggedSettledOrder,
      ...(draggedActiveOrder === undefined ? {} : { activeOrder: draggedActiveOrder }),
      settledExpanded: currentTab === "settled",
      settledVisibleCount,
      routeThreadKey: routeRowThreadKey,
      snoozedThreadCount: snoozedThreads.length,
    }))();
  // Hidden and filtered threads keep their keys. Reserve those slots without
  // including the rows in the visible drop order or writing to them.
  const { pinnedKeysById, activeKeysById } = (() => ({
    pinnedKeysById: new Map(
      threads.map((thread) => [
        scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
        thread.pinOrderKey ?? null,
      ]),
    ),
    activeKeysById: new Map(
      threads.map((thread) => [
        scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
        thread.activeOrderKey ?? null,
      ]),
    ),
  }))();
  const draggedThreadKey = dragState?.activeKey;
  const draggedFromSection = dragState?.activeSection;
  const dragActivationY = dragState?.activationY;
  const dndCollisionDetection = (() => {
    if (draggedThreadKey === undefined || draggedFromSection === undefined)
      return createSidebarCollisionDetection(() => true);
    const source = threadByKey.get(draggedThreadKey);
    if (source === undefined) return createSidebarCollisionDetection(() => false);
    return createSidebarCollisionDetection(
      (id) => {
        const target = resolveSidebarDropTarget(sidebarListItems, draggedThreadKey, id);
        if (target === null) return false;
        return (
          planSidebarThreadDrop({
            activeKey: draggedThreadKey,
            activeSection: draggedFromSection,
            activePinned: source.pinnedAt != null,
            activeSettled: source.settledOverride === "settled",
            supportsSettlement:
              serverConfigs.get(source.environmentId)?.environment.capabilities.threadSettlement ===
              true,
            target,
            pinnedOrder: pinnedKeys,
            pinnedKeysById,
            reorderableKeys: draggableThreadKeys,
            activeOrder: activeKeys,
            activeKeysById,
            activeReorderableKeys: activeReorderableThreadKeys,
            activeTimeOrdered: workingShelfEnabled,
          }).kind !== "none"
        );
      },
      {
        items: sidebarListItems,
        activationY: dragActivationY ?? null,
      },
    );
  })();
  const handleThreadDragEnd = (event: DragEndEvent) => {
    const activeKey = String(event.active.id);
    const activeSection = sectionByThreadKey.get(activeKey);
    const target =
      event.over === null
        ? null
        : resolveSidebarDropTarget(sidebarListItems, activeKey, String(event.over.id));
    const activeThread = threadByKey.get(activeKey);
    if (activeSection === undefined || target === null || activeThread === undefined) return;
    const threadRef = scopeThreadRef(activeThread.environmentId, activeThread.id);
    const plan = planSidebarThreadDrop({
      activeKey,
      activeSection,
      activePinned: activeThread.pinnedAt != null,
      activeSettled: activeThread.settledOverride === "settled",
      supportsSettlement:
        serverConfigs.get(activeThread.environmentId)?.environment.capabilities.threadSettlement ===
        true,
      target,
      pinnedOrder: pinnedKeys,
      pinnedKeysById,
      reorderableKeys: draggableThreadKeys,
      activeOrder: activeKeys,
      activeKeysById,
      activeReorderableKeys: activeReorderableThreadKeys,
      activeTimeOrdered: workingShelfEnabled,
    });
    if (plan.kind === "none") return;
    if (plan.kind === "settle" && settlingThreadKeysRef.current.has(activeKey)) return;
    const assignments =
      plan.kind === "pin"
        ? [
            ...(plan.orderKey === undefined ? [] : [{ id: activeKey, orderKey: plan.orderKey }]),
            ...plan.extraAssignments,
          ]
        : plan.kind === "reorder-pinned" || plan.kind === "move-active"
          ? plan.assignments
          : [];
    // A drop rewrites the dragged row and every row it renumbers, so all of
    // them must be writable before any of them changes.
    if (
      !checkThreadOperations(
        [activeKey, ...assignments.map(({ id }) => id)].flatMap((key) => {
          const thread = threadByKey.get(key);
          return thread ? [thread] : [];
        }),
      )
    )
      return;
    const drop = {
      key: activeKey,
      sourceSection: activeSection,
      section: target.section,
      occurredAt: new Date().toISOString(),
      clearsSnooze:
        plan.kind === "pin" ||
        plan.kind === "settle" ||
        (plan.kind === "move-active" && plan.unsnooze),
      order: plan.kind === "settle" ? null : plan.order,
      keysAtDrop: target.section === "active" ? activeKeysById : pinnedKeysById,
      assignedKeys: new Map(assignments.map(({ id, orderKey }) => [id, orderKey])),
    };
    setOptimisticDrop(drop);
    void (async () => {
      const run = async (
        operation: Promise<AtomCommandResult<unknown, unknown>>,
        title: string,
      ) => {
        const result = await operation;
        if (result._tag === "Success") return true;
        // A late failure must not cancel a newer drag's preview.
        setOptimisticDrop((current) => (current === drop ? null : current));
        if (!isAtomCommandInterrupted(result)) {
          const error = squashAtomCommandFailure(result);
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title,
              description: error instanceof Error ? error.message : t.sidebar.errors.genericError,
            }),
          );
        }
        return false;
      };
      switch (plan.kind) {
        case "settle": {
          settlingThreadKeysRef.current.add(activeKey);
          const navigateAfterSettle = planForwardNavigation(activeKey);
          const settled = await run(settleThread(threadRef), t.sidebar.thread.settleError).finally(
            () => settlingThreadKeysRef.current.delete(activeKey),
          );
          if (
            settled &&
            shouldNavigateAfterThreadPark({
              threadKey: activeKey,
              currentThreadKey: routeThreadKeyRef.current,
              action: "settle",
              now: new Date().toISOString(),
              thread: readThreadShell(threadRef),
            })
          )
            navigateAfterSettle?.();
          return;
        }
        case "move-active":
          // The drag expresses unpin intent; button/menu confirmation is unchanged.
          if (plan.unpin && !(await run(unpinThread(threadRef), t.sidebar.thread.unpinError)))
            return;
          if (
            plan.unsettle &&
            !(await run(unsettleThread(threadRef), t.sidebar.thread.unsettleError))
          )
            return;
          if (plan.unsnooze && !(await run(unsnoozeThread(threadRef), t.sidebar.thread.wakeError)))
            return;
          break;
        case "pin":
          if (
            !(await run(
              pinThread(threadRef, plan.orderKey === undefined ? {} : { orderKey: plan.orderKey }),
              t.sidebar.thread.pinError,
            ))
          )
            return;
          break;
        case "reorder-pinned":
          break;
      }
      // Stop on failure; each successful key write remains a valid placement.
      const keyWrites = plan.kind === "pin" ? plan.extraAssignments : plan.assignments;
      for (const assignment of keyWrites) {
        const thread = threadByKey.get(assignment.id);
        if (thread === undefined) continue;
        if (
          !(await run(
            (plan.kind === "move-active" ? reorderActiveThread : reorderPinnedThread)(
              scopeThreadRef(thread.environmentId, thread.id),
              assignment.orderKey,
            ),
            plan.kind === "move-active"
              ? t.sidebar.thread.reorderActiveError
              : t.sidebar.thread.reorderPinnedError,
          ))
        )
          return;
      }
    })();
  };
  // One snooze per thread at a time — same double-dispatch guard as settle.
  const snoozingThreadKeysRef = useRef(new Set<string>());
  const performSnooze = async (
    threadRef: ScopedThreadRef,
    preset: Pick<SnoozePreset, "snoozedUntil">,
    opts: { coSnoozingKeys?: ReadonlySet<string> } = {},
  ) => {
    const threadKey = scopedThreadKey(threadRef);
    if (snoozingThreadKeysRef.current.has(threadKey)) {
      return { status: "skipped" } as const;
    }
    snoozingThreadKeysRef.current.add(threadKey);
    return await (async () => {
      // Snoozing the open thread moves you forward, same as settle —
      // both park the thread you're done with for now.
      const navigateAfterSnooze = planForwardNavigation(threadKey, opts.coSnoozingKeys);
      const result = await snoozeThread(threadRef, preset.snoozedUntil);
      if (result._tag === "Failure") {
        // Never navigate away from a thread that did not snooze.
        return isAtomCommandInterrupted(result)
          ? ({ status: "interrupted" } as const)
          : ({ status: "failure", error: squashAtomCommandFailure(result) } as const);
      }
      // Only move forward if the user is still on the snoozed thread —
      // a navigation made during the await wins over ours.
      if (
        shouldNavigateAfterThreadPark({
          threadKey,
          currentThreadKey: routeThreadKeyRef.current,
          action: "snooze",
          now: new Date().toISOString(),
          thread: readThreadShell(threadRef),
        })
      ) {
        navigateAfterSnooze?.();
      }
      return { status: "success" } as const;
    })().finally(() => {
      snoozingThreadKeysRef.current.delete(threadKey);
    });
  };
  const attemptSnooze = (
    threadRef: ScopedThreadRef,
    preset: Pick<SnoozePreset, "snoozedUntil">,
    opts: { coSnoozingKeys?: ReadonlySet<string> } = {},
  ) => {
    void (async () => {
      const outcome = await performSnooze(threadRef, preset, opts);
      if (outcome.status === "failure") {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: t.sidebar.thread.snoozeError,
            description:
              outcome.error instanceof Error
                ? outcome.error.message
                : t.sidebar.errors.genericError,
          }),
        );
        return;
      }
    })();
  };

  // Header targets read live source membership and destination grants on hover and release.
  const tabDropActions: SidebarTabDropActions = (() => ({
    getSource: (key) => {
      const thread = threadByKeyRef.current.get(key);
      const section = sectionByThreadKeyRef.current.get(key);
      if (!thread || !section) return null;
      const capabilities = serverConfigs.get(thread.environmentId)?.environment.capabilities;
      return {
        section,
        canOperate: canOperateThreads([thread]),
        supportsSettlement: capabilities?.threadSettlement === true,
        supportsSnooze: capabilities?.threadSnooze === true,
        canSnooze: canSnooze(thread, { now: new Date().toISOString() }),
      };
    },
    onDrop: (key, intent, position) => {
      const thread = threadByKeyRef.current.get(key);
      if (!thread || !checkThreadOperations([thread])) return;
      const threadRef = scopeThreadRef(thread.environmentId, thread.id);
      if (intent === "settle") {
        settleThreads([key]);
        return;
      }
      if (intent === "unsnooze") {
        attemptUnsnooze(threadRef);
        return;
      }
      if (intent === "unsettle") {
        attemptUnsettle(threadRef);
        return;
      }
      void (async () => {
        const api = readLocalApi();
        if (!api) return;
        const presets = resolveSnoozePresets(new Date(), timestampFormat);
        const clicked = await settlePromise(() =>
          api.contextMenu.show(
            [
              ...presets.map((preset) => ({
                id: preset.id,
                label: t.sidebar.snooze.presetLabel(preset.label, preset.whenLabel),
              })),
              { id: "custom", label: t.sidebar.snooze.custom, separatorBefore: true },
            ],
            position,
          ),
        );
        if (clicked._tag === "Failure" || clicked.value === null) return;
        const preset =
          clicked.value === "custom"
            ? await requestCustomSnooze()
            : presets.find((candidate) => candidate.id === clicked.value);
        const current = threadByKeyRef.current.get(key);
        if (preset && current && checkThreadOperations([current])) attemptSnooze(threadRef, preset);
      })();
    },
  }))();

  const removeFromSelection = useThreadSelectionStore((s) => s.removeFromSelection);
  const supportsBulkAction = (environmentId: EnvironmentId, capability: SidebarBulkCapability) =>
    serverConfigs.get(environmentId)?.environment.capabilities[capability] === true;
  /**
   * Resolve live visible targets before reusing bulk confirmations and mutations.
   * Position uses client pixels for the native menu; omit requestedAction for the full menu,
   * or supply a slab action id (snooze opens the existing duration submenu).
   */
  const handleMultiSelectContextMenu = useStableCallback(
    async (position: { x: number; y: number }, requestedAction?: string) => {
      const api = readLocalApi();
      if (!api) return;
      const selectedThreadKeys = [...useThreadSelectionStore.getState().selectedThreadKeys];
      const now = new Date();
      const snoozePresets = resolveSnoozePresets(now, timestampFormat);
      const {
        threadKeys,
        selectedThreads,
        settlingThreads,
        pinnedSelectedThreads,
        regeneratableTitleThreads,
        items,
      } = buildSidebarBulkActionModel({
        selectedThreadKeys: new Set(selectedThreadKeys),
        threadByKey: threadByKeyRef.current,
        supports: supportsBulkAction,
        canOperate: canOperateThreads,
        now: now.toISOString(),
        snoozePresets,
      });
      if (threadKeys.length === 0) return;
      const count = threadKeys.length;
      // Slab shortcuts and native menus share the same availability checks and executor.
      let action = requestedAction;
      if (action && !items.some((item) => item.id === action && !item.disabled)) return;
      if (!action || action === "snooze") {
        const menuItems =
          action === "snooze" ? items.find((item) => item.id === "snooze")!.children! : items;
        const clicked = await settlePromise(() => api.contextMenu.show(menuItems, position));
        if (clicked._tag === "Failure" || clicked.value === null) return;
        action = clicked.value;
      }
      const actionTargets =
        action === "unpin"
          ? pinnedSelectedThreads
          : action === "regenerate-title"
            ? regeneratableTitleThreads
            : action === "settle"
              ? settlingThreads.flatMap((thread) => {
                  const current = threadByKeyRef.current.get(
                    scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
                  );
                  return current && current.settledOverride !== "settled" ? [current] : [];
                })
              : selectedThreads;
      if (action === "settle" && actionTargets.length === 0) return;
      if (action !== "mark-unread" && !checkThreadOperations(actionTargets)) return;
      if (action?.startsWith("snooze:")) {
        const preset =
          action === "snooze:custom"
            ? await requestCustomSnooze()
            : snoozePresets.find((candidate) => `snooze:${candidate.id}` === action);
        if (preset) {
          // Post-snooze navigation must skip threads snoozing in this same
          // batch — they are all leaving the card block together.
          const coSnoozingKeys = new Set(threadKeys);
          clearSelection();
          const outcomes = await Promise.all(
            selectedThreads.map(async (thread) => {
              const threadRef = scopeThreadRef(thread.environmentId, thread.id);
              const outcome = await performSnooze(threadRef, preset, { coSnoozingKeys });
              return { outcome, threadRef };
            }),
          );
          const snoozedThreadRefs = outcomes.flatMap(({ outcome, threadRef }) =>
            outcome.status === "success" ? [threadRef] : [],
          );
          const failures = outcomes.flatMap(({ outcome }) =>
            outcome.status === "failure" ? [outcome.error] : [],
          );

          if (failures.length > 0) {
            const firstError = failures[0];
            toastManager.add(
              stackedThreadToast({
                type: "error",
                title:
                  snoozedThreadRefs.length > 0
                    ? t.sidebar.thread.snoozeFailuresError(failures.length)
                    : t.sidebar.thread.snoozeManyError,
                description:
                  firstError instanceof Error ? firstError.message : t.sidebar.errors.genericError,
              }),
            );
          }
        }
        return;
      }
      if (action === "unpin") {
        // Each unpin reports its own failure, like the single-row action.
        for (const thread of pinnedSelectedThreads) {
          attemptUnpin(scopeThreadRef(thread.environmentId, thread.id));
        }
        clearSelection();
        return;
      }
      if (action === "regenerate-title") {
        for (const thread of regeneratableTitleThreads) {
          const result = await updateThreadMetadata({
            environmentId: thread.environmentId,
            input: { threadId: thread.id, regenerateTitle: true },
          });
          if (result._tag === "Success") continue;
          if (!isAtomCommandInterrupted(result)) {
            const error = squashAtomCommandFailure(result);
            toastManager.add(
              stackedThreadToast({
                type: "error",
                title: t.sidebar.thread.regenerateTitlesError,
                description: error instanceof Error ? error.message : t.sidebar.errors.genericError,
              }),
            );
          }
          return;
        }
        clearSelection();
        return;
      }
      if (action === "settle") {
        settleThreads(
          actionTargets.map((thread) =>
            scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
          ),
        );
        clearSelection();
        return;
      }
      if (action === "mark-unread") {
        for (const threadKey of threadKeys) {
          const thread = threadByKeyRef.current.get(threadKey);
          if (thread) markThreadUnread(scopeThreadRef(thread.environmentId, thread.id));
        }
        clearSelection();
        return;
      }
      if (action !== "delete") return;
      if (confirmThreadDelete) {
        const confirmed = await settlePromise(() =>
          api.dialogs.confirm(
            [
              t.sidebar.confirm.deleteThreads(count),
              t.sidebar.thread.deleteSelectedHistoryHint,
            ].join("\n"),
            { variant: "destructive", confirmLabel: t.common.threadActions.delete },
          ),
        );
        if (confirmed._tag === "Failure" || !confirmed.value) return;
      }
      if (
        !checkThreadOperations(
          threadKeys.flatMap((threadKey) => {
            const thread = threadByKeyRef.current.get(threadKey);
            return thread ? [thread] : [];
          }),
        )
      )
        return;
      const { deletedThreadKeys, firstFailure } = await deleteSelectedThreadEntries({
        entries: threadKeys.map((threadKey) => ({ threadKey })),
        delete: async ({ threadKey }, deletedThreadKeys) => {
          const thread = threadByKeyRef.current.get(threadKey);
          if (!thread) return null;
          return deleteThread(scopeThreadRef(thread.environmentId, thread.id), {
            deletedThreadKeys,
          });
        },
      });
      if (firstFailure !== null) {
        const firstError = squashAtomCommandFailure(firstFailure);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: t.sidebar.thread.deleteManyError,
            description:
              firstError instanceof Error ? firstError.message : t.sidebar.errors.genericError,
          }),
        );
      }
      removeFromSelection(
        getThreadKeysToDeselectAfterDelete(selectedThreadKeys, deletedThreadKeys, (threadKey) => {
          const threadRef = parseScopedThreadKey(threadKey);
          return threadRef !== null && readThreadShell(threadRef) !== null;
        }),
      );
    },
  );

  const handleDraftContextMenu = useStableCallback(
    (draftId: DraftId, position: { x: number; y: number }) => {
      void (async () => {
        const api = readLocalApi();
        const session = useComposerDraftStore.getState().getDraftSession(draftId);
        if (!api || !session || session.promotedTo) return;
        const projectGroup = projectGroupsRef.current.find((group) =>
          group.memberProjectRefs.some(
            (ref) =>
              ref.environmentId === session.environmentId && ref.projectId === session.projectId,
          ),
        );
        const workspacePath =
          session.worktreePath ??
          projectByKey.get(`${session.environmentId}:${session.projectId}`)?.workspaceRoot;
        const clicked = await settlePromise(() =>
          api.contextMenu.show(
            buildDraftActionMenuItems({
              hasPath: Boolean(workspacePath),
              hasBranch: Boolean(session.branch),
              hasProject: projectGroup != null,
            }),
            position,
          ),
        );
        if (clicked._tag === "Failure") return;
        switch (clicked.value) {
          case "project-settings":
            if (projectGroup)
              openProjectSettings(projectGroup, {
                environmentId: session.environmentId,
                projectId: session.projectId,
              });
            return;
          case "copy-path":
            if (workspacePath) copyPathToClipboard(workspacePath, { path: workspacePath });
            return;
          case "copy-branch":
            if (session.branch) copyBranchToClipboard(session.branch, { branch: session.branch });
            return;
          case "discard": {
            // The menu can stay open while the draft sends; discarding a
            // promoting draft would strand the send.
            const current = useComposerDraftStore.getState().getDraftSession(draftId);
            if (current && !current.promotedTo) discardComposerDraft(draftId);
            return;
          }
        }
      })();
    },
  );

  const exportTranscript = useAtomCommand(serverEnvironment.exportTranscript, {
    reportFailure: false,
  });
  const {
    show: showThreadContextMenu,
    close: finishThreadContextMenu,
    popup: threadContextMenuPopup,
  } = useSidebarThreadContextMenu();
  const handleThreadContextMenu = useStableCallback(
    (threadRef: ScopedThreadRef, position: { x: number; y: number }, trigger?: HTMLElement) => {
      void (async () => {
        const api = readLocalApi();
        if (!api) return;
        const threadKey = scopedThreadKey(threadRef);
        const selectionState = useThreadSelectionStore.getState();
        if (selectionState.hasSelection() && selectionState.selectedThreadKeys.has(threadKey)) {
          finishThreadContextMenu();
          await handleMultiSelectContextMenu(position);
          return;
        }
        const thread = threadByKeyRef.current.get(threadKey);
        if (!thread) return;
        const threadWorkspacePath =
          thread.worktreePath ??
          projectByKey.get(`${thread.environmentId}:${thread.projectId}`)?.workspaceRoot ??
          null;
        // V2 keeps unavailable lifecycle commands visible; the model disables them.
        const supportsSettlement =
          serverConfigs.get(thread.environmentId)?.environment.capabilities.threadSettlement ===
          true;
        const supportsSnooze =
          serverConfigs.get(thread.environmentId)?.environment.capabilities.threadSnooze === true;
        const supportsPinning =
          serverConfigs.get(thread.environmentId)?.environment.capabilities.threadPinning === true;
        const supportsAutoSettleOptOut =
          serverConfigs.get(thread.environmentId)?.environment.capabilities
            .threadAutoSettleOptOut === true;
        const supportsTitleRegeneration =
          serverConfigs.get(thread.environmentId)?.environment.capabilities
            .threadTitleRegeneration === true;
        const isRegeneratingTitle = thread.titleRegeneration != null;
        const isSettled = settledThreadKeysRef.current.has(threadKey);
        const isSnoozed = snoozedThreadKeysRef.current.has(threadKey);
        const isPinned = thread.pinnedAt != null;
        // Presets resolve at menu-open time (same as the popover).
        const snoozePresets = resolveSnoozePresets(new Date(), timestampFormat);
        const threadProjectGroup =
          projectGroupsRef.current.find((project) =>
            project.memberProjectRefs.some(
              (projectRef) =>
                projectRef.environmentId === thread.environmentId &&
                projectRef.projectId === thread.projectId,
            ),
          ) ?? null;
        const clicked = await settlePromise(() =>
          showThreadContextMenu(
            buildSidebarThreadActionMenuItems({
              hasDraft: composerDraftHasUserContent(
                useComposerDraftStore.getState().getComposerDraft(threadRef),
              ),
              canOperate: readEnvironmentScope(
                threadRef.environmentId,
                AuthOrchestrationOperateScope,
              ),
              branch: thread.branch ?? null,
              projectFilter: threadProjectGroup
                ? {
                    label: threadProjectGroup.displayName,
                    isActive: projectScopeKey === threadProjectGroup.projectKey,
                  }
                : null,
              isPinned,
              isSettled,
              autoSettleEnabled: thread.autoSettleDisabledAt == null,
              isSnoozed,
              canSnoozeNow: canSnooze(thread, { now: new Date().toISOString() }),
              isRegeneratingTitle,
              isRunning: !threadRuntimeCanArchive(thread.runtime),
              supports: {
                settlement: supportsSettlement,
                autoSettleOptOut: supportsAutoSettleOptOut,
                snooze: supportsSnooze,
                pinning: supportsPinning,
                titleRegeneration: supportsTitleRegeneration,
              },
              snoozePresets,
            }),
            position,
            trigger,
          ),
        );
        if (clicked._tag === "Failure" || clicked.value === null) return;
        if (threadActionRequiresOperate(clicked.value) && !checkThreadOperations([thread])) return;
        if (clicked.value?.startsWith("snooze:")) {
          const preset =
            clicked.value === "snooze:custom"
              ? await requestCustomSnooze()
              : snoozePresets.find((candidate) => `snooze:${candidate.id}` === clicked.value);
          if (preset) attemptSnooze(threadRef, preset);
          return;
        }
        switch (clicked.value) {
          case "discard-draft":
            discardComposerDraft(threadRef);
            return;
          case "filter-by-project":
            // This item is the only scope control here, so picking the
            // already-scoped project again is the way back to all projects.
            if (threadProjectGroup) {
              setProjectScopeKey(
                projectScopeKey === threadProjectGroup.projectKey
                  ? null
                  : threadProjectGroup.projectKey,
              );
            }
            return;
          case "project-settings":
            if (threadProjectGroup)
              openProjectSettings(threadProjectGroup, {
                environmentId: threadRef.environmentId,
                projectId: thread.projectId,
              });
            return;
          case "new-thread-on-branch": {
            // Explicit branch carry-over: reuse the thread's worktree when it
            // has one, otherwise its branch on the local checkout.
            const result = await settlePromise(() =>
              handleNewThreadRef.current(scopeProjectRef(thread.environmentId, thread.projectId), {
                branch: thread.branch,
                worktreePath: thread.worktreePath,
                envMode: thread.worktreePath ? "worktree" : "local",
                startFromOrigin: false,
              }),
            );
            if (result._tag === "Failure") {
              const error = squashAtomCommandFailure(result);
              toastManager.add(
                stackedThreadToast({
                  type: "error",
                  title: t.sidebar.thread.createError,
                  description:
                    error instanceof Error ? error.message : t.sidebar.errors.genericError,
                }),
              );
            }
            return;
          }
          case "settle":
            attemptSettle(threadRef);
            return;
          case "unsettle":
            attemptUnsettle(threadRef);
            return;
          case "unsnooze":
            attemptUnsnooze(threadRef);
            return;
          case "pin":
            attemptPin(threadRef);
            return;
          case "unpin":
            attemptUnpin(threadRef);
            return;
          case "auto-settle:enabled":
          case "auto-settle:disabled": {
            const result = await setThreadAutoSettle(
              threadRef,
              clicked.value === "auto-settle:enabled",
            );
            if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
              const error = squashAtomCommandFailure(result);
              toastManager.add(
                stackedThreadToast({
                  type: "error",
                  title: t.sidebar.thread.autoSettleError,
                  description:
                    error instanceof Error ? error.message : t.sidebar.errors.genericError,
                }),
              );
            }
            return;
          }
          case "rename":
            startThreadRename(threadRef, thread.title);
            return;
          case "regenerate-title": {
            if (isRegeneratingTitle) return;
            const result = await updateThreadMetadata({
              environmentId: threadRef.environmentId,
              input: { threadId: threadRef.threadId, regenerateTitle: true },
            });
            if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
              const error = squashAtomCommandFailure(result);
              toastManager.add(
                stackedThreadToast({
                  type: "error",
                  title: t.sidebar.thread.regenerateTitleError,
                  description:
                    error instanceof Error ? error.message : t.sidebar.errors.genericError,
                }),
              );
            }
            return;
          }
          case "mark-unread":
            markThreadUnread(threadRef);
            return;
          case "copy-path":
            if (!threadWorkspacePath) {
              toastManager.add(
                stackedThreadToast({
                  type: "error",
                  title: t.sidebar.thread.pathUnavailableToast,
                  description: t.sidebar.thread.pathUnavailableHint,
                }),
              );
              return;
            }
            copyPathToClipboard(threadWorkspacePath, { path: threadWorkspacePath });
            return;
          case "copy-branch":
            if (thread.branch) {
              copyBranchToClipboard(thread.branch, { branch: thread.branch });
            }
            return;
          case "copy-thread-id":
            copyThreadIdToClipboard(thread.id, { threadId: thread.id });
            return;
          case "export-transcript": {
            const result = await exportTranscript({
              environmentId: threadRef.environmentId,
              input: { threadId: threadRef.threadId },
            });
            if (result._tag === "Success") {
              toastManager.add({
                type: "success",
                title: t.sidebar.thread.exportTranscriptSuccess,
                description: result.value.path,
              });
            } else if (!isAtomCommandInterrupted(result)) {
              const error = squashAtomCommandFailure(result);
              toastManager.add(
                stackedThreadToast({
                  type: "error",
                  title: t.sidebar.thread.exportTranscriptError,
                  description:
                    error instanceof Error ? error.message : t.sidebar.errors.genericError,
                }),
              );
            }
            return;
          }
          case "archive": {
            if (confirmThreadArchive) {
              const confirmed = await settlePromise(() =>
                api.dialogs.confirm(t.sidebar.confirm.archiveThread(thread.title)),
              );
              if (confirmed._tag === "Failure" || !confirmed.value) return;
            }
            let didArchive = false;
            const result = await archiveThread(threadRef, {
              onArchived: () => {
                didArchive = true;
              },
            });
            if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
              const error = squashAtomCommandFailure(result);
              toastManager.add(
                stackedThreadToast({
                  type: "error",
                  title: didArchive
                    ? t.sidebar.thread.archiveNavigationError
                    : t.sidebar.thread.archiveError,
                  description:
                    error instanceof Error ? error.message : t.sidebar.errors.genericError,
                }),
              );
              return;
            }
            return;
          }
          case "delete": {
            if (confirmThreadDelete) {
              const confirmed = await settlePromise(() =>
                api.dialogs.confirm(
                  [
                    t.sidebar.confirm.deleteThread(thread.title),
                    t.sidebar.thread.deleteHistoryHint,
                  ].join("\n"),
                  { variant: "destructive" },
                ),
              );
              if (confirmed._tag === "Failure" || !confirmed.value) return;
            }
            const result = await deleteThread(threadRef);
            if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
              const error = squashAtomCommandFailure(result);
              toastManager.add(
                stackedThreadToast({
                  type: "error",
                  title: t.sidebar.thread.deleteError,
                  description:
                    error instanceof Error ? error.message : t.sidebar.errors.genericError,
                }),
              );
              return;
            }
            return;
          }
          default:
            return;
        }
      })();
    },
  );

  // Thread jump (cmd+1..9) and prev/next traversal reuse the same commands as
  // v1 — the keybinding layer is shared, only the ordered list differs.
  const routeTerminalOpen = useTerminalUiStateStore((state) =>
    routeThreadRef
      ? selectThreadTerminalUiState(state.terminalUiStateByThreadKey, routeThreadRef).terminalOpen
      : false,
  );
  useEffect(() => {
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || isCommandPaletteOpen() || isModelPickerOpen()) {
        return;
      }
      const command = resolveShortcutCommand(event, keybindings, {
        platform: navigator.platform,
        context: {
          terminalFocus: isTerminalFocused(),
          terminalOpen: routeTerminalOpen,
          modelPickerOpen: isModelPickerOpen(),
          isWeb: !isElectron,
          isDesktop: isElectron,
        },
      });
      const navigateToThreadKey = (targetThreadKey: string | null) => {
        if (!targetThreadKey) return false;
        const targetThread = threadByKey.get(targetThreadKey);
        if (!targetThread) return false;
        event.preventDefault();
        event.stopPropagation();
        navigateToThread(scopeThreadRef(targetThread.environmentId, targetThread.id));
        return true;
      };
      const traversalDirection = threadTraversalDirectionFromCommand(command);
      if (traversalDirection !== null) {
        navigateToThreadKey(
          resolveAdjacentThreadId({
            threadIds: orderedThreadKeys,
            currentThreadId: routeRowThreadKey,
            direction: traversalDirection,
          }),
        );
        return;
      }
      const jumpIndex = threadJumpIndexFromCommand(command ?? "");
      if (jumpIndex === null) return;
      navigateToThreadKey(orderedThreadKeys[jumpIndex] ?? null);
    };
    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, [
    keybindings,
    navigateToThread,
    orderedThreadKeys,
    routeTerminalOpen,
    routeRowThreadKey,
    threadByKey,
  ]);

  // Same predicate as v1: hints show only while the held modifiers exactly
  // match a thread-jump binding. Adding Shift (screenshots) or Alt no
  // longer matches ⌘1..9, so the overlay hides for chords like ⌘⇧4.
  const shortcutModifiers = useShortcutModifierState();
  const terminalFocused = useTerminalFocus();
  const shouldShowJumpHintsNow = shouldShowThreadJumpHintsForModifiers(
    shortcutModifiers,
    keybindings,
    {
      platform: navigator.platform,
      context: {
        terminalFocus: terminalFocused,
        terminalOpen: routeTerminalOpen,
        modelPickerOpen: isModelPickerOpen(),
        isWeb: !isElectron,
        isDesktop: isElectron,
      },
    },
  );
  useEffect(() => {
    updateThreadJumpHintsVisibility(shouldShowJumpHintsNow);
  }, [shouldShowJumpHintsNow, updateThreadJumpHintsVisibility]);

  // Honor the rail scope while sharing physical target selection with the picker.
  const newThreadDestination = resolveSidebarNewThreadDestination({
    shiftKey: false,
    groups: projectGroups,
    scopeKey: projectScopeKey,
    preferredProjectRef: resolveThreadActionProjectRef({
      ...newThreadContext,
      activeThread: newThreadContext.activeThread ?? undefined,
    }),
    scratchEnvironmentId,
  });
  const handleNewThreadClick = (event?: ReactMouseEvent) => {
    const context = {
      ...newThreadContext,
      activeThread: newThreadContext.activeThread ?? undefined,
    };
    const destination = event?.shiftKey ? { kind: "context" as const } : newThreadDestination;
    if (isMobile) setOpenMobile(false);
    switch (destination.kind) {
      case "context":
        void startNewThreadFromContext(context);
        break;
      case "project":
        void newThreadContext.handleNewThread(destination.projectRef);
        break;
      case "scratch":
        void startScratchThread(destination.environmentId);
        break;
      case "picker":
        openCommandPalette({ open: "new-thread-in" });
        break;
    }
  };

  // The button and chat.new share the scope-aware destination policy. Shift+click
  // and chat.newLocal keep contextual creation even when another group is selected.
  // The label retains its single-group shortcut fallback; the second tooltip line
  // retains the multi-group hint for contextual creation.
  const newThreadShortcutLabel =
    shortcutLabelForCommand(keybindings, "chat.new") ??
    (projectGroups.length <= 1 ? shortcutLabelForCommand(keybindings, "chat.newLocal") : undefined);
  const newThreadInProjectShortcutLabel = shortcutLabelForCommand(keybindings, "chat.newLocal");
  const contextDragThread = dragState ? threadByKey.get(dragState.activeKey) : undefined;
  const contextDragProject = contextDragThread
    ? (projectByKey.get(`${contextDragThread.environmentId}:${contextDragThread.projectId}`) ??
      null)
    : null;
  const dndModifiers = [restrictBelowPins];
  return (
    <>
      <ThreadContextDragGhost project={contextDragProject} />
      {threadContextMenuPopup}
      <SidebarThreadDndContext
        sensors={dndSensors}
        autoScroll={!isContextDrag}
        collisionDetection={dndCollisionDetection}
        modifiers={dndModifiers}
        onDragStart={handleThreadDragStart}
        onDragOver={handleThreadDragOver}
        onDragEnd={handleThreadDragEnd}
        tabDrop={tabDropActions}
      >
        <SidebarContent
          className="min-h-full"
          fixedHeader={
            <SidebarThreadHeader
              today={
                isTodayView
                  ? {
                      currentTab: todayTab,
                      counts: {
                        working: todayRows.working.length,
                        waiting: todayRows.waiting.length,
                      },
                      onTabChange: handleTodayTabChange,
                    }
                  : null
              }
              currentTab={currentTab}
              tabCounts={sidebarTabs.counts}
              onTabChange={handleSidebarTabChange}
              hasProjects={projectGroups.length > 0}
              onOpenDiscussions={() => void router.navigate({ to: "/discussions" })}
              onNewThread={handleNewThreadClick}
              newThreadDisabled={projects.length === 0}
              newThreadShortcutLabel={newThreadShortcutLabel}
              newThreadTooltipLabel={resolveSidebarNewThreadTooltip(
                newThreadDestination,
                scopedProjectGroup,
                newThreadShortcutLabel,
              )}
              newThreadInProjectShortcutLabel={newThreadInProjectShortcutLabel}
              showNewThreadInProjectHint={projectGroups.length > 1}
              searchInputRef={threadSearchInputRef}
              searchQuery={threadSearchQuery}
              onSearchQueryChange={(value) => {
                setThreadSearchQuery(value);
                setActiveSearchResultIndex(0);
              }}
              onSearchKeyDown={handleThreadSearchKeyDown}
              isSearching={isSearchingThreads}
              searchResultCount={threadSearchResults.length}
              activeSearchResultIndex={activeSearchResultIndex}
              onClearSearch={clearThreadSearch}
            />
          }
        >
          <div className="flex min-w-0 flex-1 flex-col pb-2.5 pt-0.5" role="presentation">
            {isSearchingThreads ? (
              threadSearchResults.length > 0 ? (
                <TooltipProvider
                  key="sidebar-thread-search-tooltips-150"
                  delay={150}
                  closeDelay={0}
                  timeout={400}
                >
                  <ul
                    id="sidebar-thread-search-results"
                    role="listbox"
                    aria-label={t.sidebar.search.resultsAriaLabel}
                    className="flex flex-col gap-1"
                  >
                    {threadSearchResults.map((thread, index) => {
                      const threadKey = scopedThreadKey(
                        scopeThreadRef(thread.environmentId, thread.id),
                      );
                      return (
                        <SidebarSearchResultRow
                          isSettled={settledThreadKeys.has(threadKey)}
                          key={threadKey}
                          thread={thread}
                          project={
                            projectByKey.get(`${thread.environmentId}:${thread.projectId}`) ?? null
                          }
                          projectDisplayName={
                            projectDisplayNameByKey.get(
                              `${thread.environmentId}:${thread.projectId}`,
                            ) ?? null
                          }
                          environmentLabel={environmentLabelById.get(thread.environmentId) ?? null}
                          environmentMachine={
                            environmentMachineById.get(thread.environmentId) ?? "server"
                          }
                          providerEntryByInstanceId={
                            providerEntriesByEnvironment.get(thread.environmentId) ??
                            EMPTY_PROVIDER_ENTRIES
                          }
                          isHighlighted={activeSearchResultIndex === index}
                          isRouteActive={routeRowThreadKey === threadKey}
                          resultId={`sidebar-thread-search-result-${index}`}
                          searchMatch={
                            threadSearchMatchByKey.get(
                              threadSearchMatchKey({
                                environmentId: thread.environmentId,
                                threadId: thread.id,
                              }),
                            ) ?? null
                          }
                          searchQuery={threadSearchQuery}
                          onHighlight={() => setActiveSearchResultIndex(index)}
                          onSelect={() => selectThreadSearchResult(thread)}
                          onFileDropThreads={handleThreadFileDrop}
                        />
                      );
                    })}
                  </ul>
                  {threadSearch.isPending ? (
                    <div
                      role="status"
                      className="flex h-9 items-center gap-2 px-3 text-secondary-copy-medium text-muted-foreground"
                    >
                      <TextSearchIcon aria-hidden className="size-3.5" />
                      {t.sidebar.search.searchingHint}
                    </div>
                  ) : null}
                </TooltipProvider>
              ) : (
                <div
                  role="status"
                  className={cn(
                    "flex items-center gap-2.5 px-3 text-secondary-copy-large text-muted-foreground",
                    threadSearch.isPending
                      ? "h-9 gap-2 text-secondary-copy-medium"
                      : "h-24 flex-col justify-center text-center",
                  )}
                >
                  {threadSearch.isPending ? (
                    <TextSearchIcon aria-hidden className="size-3.5" />
                  ) : (
                    <span className="flex size-10 items-center justify-center rounded-compact-row shadow-well-control">
                      <SearchXIcon aria-hidden className="size-4.5" />
                    </span>
                  )}
                  {threadSearch.isPending ? t.sidebar.search.searchingHint : t.sidebar.search.empty}
                </div>
              )
            ) : null}
            {!isSearchingThreads ? (
              <TooltipProvider
                key="sidebar-thread-tooltips-150"
                delay={150}
                closeDelay={0}
                timeout={400}
              >
                <SidebarDragLifecycle onUnmount={cancelThreadDrag} />
                <SortableContext items={sortableIds} strategy={sidebarSortingStrategy}>
                  <ul
                    ref={attachListMotionRef}
                    data-dragging={(!isContextDrag && dragState !== null) || undefined}
                    // VoiceOver treats an exposed list as an interaction boundary,
                    // which hides its rows from ordinary linear navigation. A
                    // presentational list also makes its implicit listitems
                    // presentational while preserving every descendant control.
                    role="presentation"
                    className={cn(
                      "sidebar-thread-list relative flex flex-col gap-px",
                      sidebarListItems.length > 0 && "flex-1",
                      // An action sweep owns the pointer: rows it passes over
                      // neither show hover actions nor open tooltips, even
                      // controls that opt back in, like the Woke pill.
                      actionSweep !== null && "**:pointer-events-none",
                    )}
                  >
                    {(() => {
                      const renderThreadRow = (
                        thread: EnvironmentThreadShell,
                        section: SidebarSection,
                      ) => {
                        const threadKey = scopedThreadKey(
                          scopeThreadRef(thread.environmentId, thread.id),
                        );
                        // Settled and snoozed are the ONLY things that collapse a
                        // row: every other thread is a full card. Density comes
                        // from users (or the auto rules) actually parking work,
                        // not from the sidebar second-guessing what still matters.
                        // Working rows stay cards so their live status shows.
                        const isCard =
                          section === "active" || section === "pinned" || section === "working";
                        const rowVariant = isCard ? "card" : "slim";
                        return (
                          <SortableThreadRow
                            key={threadKey}
                            sortableId={threadKey}
                            contextDrag={isContextDrag}
                            sortableDisabled={
                              isTodayView ||
                              renamingThreadKey === threadKey ||
                              !draggableThreadKeys.has(threadKey) ||
                              optimisticDrop !== null
                            }
                            thread={thread}
                            variant={rowVariant}
                            // Snoozed rows wake, settled rows un-settle, and cards settle.
                            variantAction={
                              section === "snoozed"
                                ? "unsnooze"
                                : section === "settled"
                                  ? "unsettle"
                                  : "settle"
                            }
                            settlementSupported={
                              serverConfigs.get(thread.environmentId)?.environment.capabilities
                                .threadSettlement === true
                            }
                            snoozeSupported={
                              serverConfigs.get(thread.environmentId)?.environment.capabilities
                                .threadSnooze === true
                            }
                            pinningSupported={
                              serverConfigs.get(thread.environmentId)?.environment.capabilities
                                .threadPinning === true
                            }
                            isPinned={thread.pinnedAt != null}
                            dropVerb={
                              dragState?.activeKey === threadKey
                                ? resolveSidebarDropVerb(dragState.activeSection, dragTargetSection)
                                : null
                            }
                            dragOverPinned={
                              dragState?.activeKey === threadKey && dragTargetSection === "pinned"
                            }
                            sweepAction={
                              actionSweep?.keys.has(threadKey) ? actionSweep.action : null
                            }
                            snoozeWakeLabelText={
                              SNOOZE_UI_ENABLED &&
                              section === "snoozed" &&
                              thread.snoozedUntil != null
                                ? snoozeWakeLabel(thread.snoozedUntil, {
                                    now: new Date().toISOString(),
                                  })
                                : null
                            }
                            // All sections: a woken thread can classify straight
                            // into the settled tail (PR merged while snoozed), and
                            // the wake signal must survive the trip. Still-snoozed
                            // rows resolve to null on their own.
                            wokeAt={threadWokeAt(thread, { now: snoozeNow })}
                            isActive={routeRowThreadKey === threadKey}
                            isRouteThread={routeThreadKey === threadKey}
                            openPullRequestsInRightPanel={routeThreadRef !== null}
                            jumpLabel={
                              showJumpHints ? (jumpLabelByKey.get(threadKey) ?? null) : null
                            }
                            currentEnvironmentId={primaryEnvironmentId}
                            environmentLabel={
                              environmentLabelById.get(thread.environmentId) ?? null
                            }
                            environmentMachine={
                              environmentMachineById.get(thread.environmentId) ?? "server"
                            }
                            scratchMachineLabel={scratchMachineLabelFor(thread)}
                            project={
                              projectByKey.get(`${thread.environmentId}:${thread.projectId}`) ??
                              null
                            }
                            projectDisplayName={
                              projectDisplayNameByKey.get(
                                `${thread.environmentId}:${thread.projectId}`,
                              ) ?? null
                            }
                            providerEntryByInstanceId={
                              providerEntriesByEnvironment.get(thread.environmentId) ??
                              EMPTY_PROVIDER_ENTRIES
                            }
                            timestampFormat={timestampFormat}
                            onThreadClick={handleThreadClick}
                            onThreadActivate={navigateToThread}
                            onStartRename={startThreadRename}
                            onRenameTitleChange={setRenamingTitle}
                            onCommitRename={commitThreadRename}
                            onCancelRename={cancelThreadRename}
                            isRenaming={renamingThreadKey === threadKey}
                            renamingTitle={renamingThreadKey === threadKey ? renamingTitle : ""}
                            onContextMenu={handleThreadContextMenu}
                            onSettle={attemptSettle}
                            onActionSweepStart={startActionSweep}
                            onUnsettle={attemptUnsettle}
                            onSnooze={attemptSnooze}
                            onUnsnooze={attemptUnsnooze}
                            onUnpin={attemptUnpin}
                            onAcknowledgeWoke={acknowledgeWoke}
                            onFileDropThreads={handleThreadFileDrop}
                          />
                        );
                      };
                      const from = isContextDrag ? null : (dragState?.activeSection ?? null);
                      const items: ReactNode[] = showDrafts
                        ? [
                            <SidebarDraftBlock
                              key="draft-sessions"
                              projectByKey={projectByKey}
                              projectDisplayNameByKey={projectDisplayNameByKey}
                              scopedProjectKeys={scopedProjectKeys}
                              routeDraftId={routeDraftIdForRows}
                              onNavigateToDraft={navigateToDraft}
                              onDraftContextMenu={handleDraftContextMenu}
                            />,
                          ]
                        : [];
                      for (const item of sidebarListItems) {
                        if (item.kind === "thread") {
                          items.push(renderThreadRow(threadByKey.get(item.key)!, item.section));
                          continue;
                        }
                        switch (item.marker) {
                          case "pinned-header":
                            items.push(
                              <SidebarDragBoundary
                                key="pinned-header"
                                marker="pinned-header"
                                label={t.sidebar.thread.pinned}
                                visible={from !== null}
                                isDropTarget={dragTargetSection === "pinned"}
                              />,
                            );
                            break;
                          case "pinned-divider":
                            items.push(
                              <SidebarDragBoundary
                                key="pinned-divider"
                                marker="pinned-divider"
                                label={t.sidebar.sections.active}
                                visible={from !== null}
                                isDropTarget={dragTargetSection === "active"}
                              />,
                            );
                            break;
                          case "active-placeholder":
                            items.push(
                              <SidebarSectionPlaceholder
                                key="active-placeholder"
                                marker="active-placeholder"
                                label={t.sidebar.sections.active}
                                showHint={
                                  from !== null &&
                                  (activeThreads.length === 0 ||
                                    (from === "active" &&
                                      activeThreads.length === 1 &&
                                      dragTargetSection !== null &&
                                      dragTargetSection !== "active"))
                                }
                                isDropTarget={dragTargetSection === "active"}
                              />,
                            );
                            break;
                          case "working-header":
                          case "snoozed-header":
                          case "settled-header":
                            // Keep zero-height section sentinels for existing drop resolution.
                            // Visible shelf headings and their fold state are replaced by tabs.
                            items.push(
                              <SortableSidebarMarker
                                key={item.marker}
                                marker={item.marker}
                                className="-mb-px h-0"
                              />,
                            );
                            break;
                        }
                      }
                      return items;
                    })()}
                    {!isTodayView && currentTab === "settled" && hiddenSettledCount > 0 ? (
                      <li className="list-none">
                        <button
                          type="button"
                          onClick={showMoreSettled}
                          className="mx-3 mt-2 inline-flex cursor-pointer rounded-keycap text-left text-secondary-copy-medium text-secondary-label outline-none hover:text-foreground focus-visible:inset-shadow-focus"
                        >
                          {t.sidebar.sections.showMoreCount(
                            Math.min(hiddenSettledCount, SIDEBAR_SETTLED_PAGE_COUNT),
                          )}
                        </button>
                      </li>
                    ) : null}
                  </ul>
                </SortableContext>
              </TooltipProvider>
            ) : null}
            {!isSearchingThreads &&
            (!showDrafts || visibleDraftSessionCount === 0) &&
            orderedThreads.length === 0 ? (
              <div className="flex flex-col items-center gap-2.5 px-3 py-5 text-center text-secondary-copy-large text-secondary-label">
                <span className="flex size-10 items-center justify-center rounded-compact-row shadow-well-control">
                  <MessagesSquareIcon aria-hidden className="size-4.5" />
                </span>
                {projects.length === 0 ? (
                  <>
                    <span>{t.sidebar.projects.empty}</span>
                    <button
                      type="button"
                      onClick={openAddProjectCommandPalette}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-sidebar-border px-2.5 py-1 text-2xs font-medium text-sidebar-muted-foreground transition-colors hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
                    >
                      <PlusIcon className="-mx-0.5 size-3" />
                      {t.sidebar.header.addProject}
                    </button>
                  </>
                ) : isTodayView ? (
                  t.sidebar.today.empty[todayTab]
                ) : scopedProjectGroup ? (
                  t.sidebar.sections.projectEmpty(scopedProjectGroup.displayName)
                ) : (
                  t.sidebar.sections.empty
                )}
              </div>
            ) : null}
          </div>
        </SidebarContent>
      </SidebarThreadDndContext>
      <SidebarBulkActions
        threadByKey={threadByKey}
        supports={supportsBulkAction}
        onAction={handleMultiSelectContextMenu}
      />
      <SidebarChromeFooter />
    </>
  );
}
