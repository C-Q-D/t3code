/** Renders project and thread navigation and dispatches scoped menu actions; server services own export IO. */
import {
  ProjectId,
  type EnvironmentId,
  type ScopedProjectRef,
  AuthOrchestrationOperateScope,
  type ScopedThreadRef,
  type ThreadId,
  type ContextMenuItem,
} from "@t3tools/contracts";
import { copyThreadReference } from "../lib/copyThreadReference";
import { threadChipCopyTarget } from "@t3tools/client-runtime/thread-reference";
import { attachSidebarTree, SIDEBAR_TREE_PROPS } from "../lib/sidebarTree";
import { foldSearchQuery, rankMessageMatches } from "@t3tools/shared/paletteSearch";
import { findForMessageMatch, openThreadFindOnQuery } from "./chat/threadFindStore";
import type { OlderSettledScope } from "@t3tools/client-runtime/state/threads";
import { useOlderSettledShelf, useOlderSettledShelfGrowth } from "../state/olderSettledShelf";
import { ThreadContextDragGhost } from "./chat/ThreadContextDragGhost";
import {
  endThreadContextDrag,
  moveThreadContextDrag as moveThreadContextDragGhost,
  throwThreadContext,
} from "./chat/threadContextDrag";
import { discardComposerDraft } from "../lib/discardComposerDraft";
import { requestCustomSnooze } from "./CustomSnoozeDialog";
import { useAtomValue } from "@effect/atom-react";
import * as Option from "effect/Option";
import { Atom } from "effect/reactivity";
import {
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type Modifier,
} from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import {
  canSnooze,
  effectiveSnoozed,
  threadWokeAt,
} from "@t3tools/client-runtime/state/thread-settled";
import {
  createInboxReturnTracker,
  isThreadWorking,
  isThreadWorking as isSidebarThreadWorking,
} from "@t3tools/client-runtime/state/thread-inbox";
import { sortSettledThreads } from "@t3tools/client-runtime/state/thread-sort";
import {
  nextShownOrder,
  threadSearchSubject,
  type ShownOrder,
  threadSearchMatchKey,
} from "@t3tools/client-runtime/state/thread-search";
import {
  threadRuntimeCanArchive,
  type EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/models";
import {
  parseScopedThreadKey,
  scopeProjectRef,
  scopeThreadRef,
  scopedThreadKey,
} from "@t3tools/client-runtime/environment";
import { PlusIcon, MessagesSquareIcon, SearchXIcon, TextSearchIcon } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { useRouter } from "@tanstack/react-router";
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
import { isMacPlatform, cn } from "~/lib/utils";
import { readLocalApi } from "../localApi";
import { useSidebarPendingFileDropStore } from "../sidebarPendingFileDropStore";
import {
  pickableProjectGroups,
  selectProjectGroupingSettings,
} from "@t3tools/client-runtime/state/project-grouping";
import {
  projectGroupsSpanEnvironments,
  resolveSidebarProjectScopeKeys,
  getSidebarProjectSettingsKey,
  type SidebarProjectSnapshot,
  buildSidebarProjectSnapshots,
} from "../sidebarProjectGrouping";
import { useUiStateStore } from "../uiStateStore";
import {
  getThreadKeysToDeselectAfterDelete,
  useThreadSelectionStore,
} from "../threadSelectionStore";
import {
  canTurnThreadIntoProject,
  useAcknowledgeThreadWoke,
  useThreadActions,
} from "../hooks/useThreadActions";
import { useHandleNewThread } from "../hooks/useHandleNewThread";
import { useTerminalFocus } from "../hooks/useTerminalFocus";
import { isCommandPaletteOpen, openCommandPalette } from "../commandPaletteBus";
import { registerSettleAndAdvance } from "../settleAndAdvance";
import { startNewThreadFromContext, resolveThreadActionProjectRef } from "../lib/chatThreadActions";
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
  useDelegatedUnderParent,
  useProjects,
  useServerConfigs,
} from "../state/entities";
import { environmentPresentations } from "../state/presentation";
import { primaryServerKeybindingsAtom, serverEnvironment } from "../state/server";
import { environmentProjects } from "../state/projects";
import { environmentThreadShells, threadEnvironment } from "../state/threads";
import { useThreadSearch } from "../state/queries";
import { useOrchestrationCommand } from "../state/use-orchestration-command";
import { readEnvironmentScope } from "../state/session";
import { buildThreadRouteParams, resolveActiveThreadRouteRef } from "../threadRoutes";
import { type SidebarThreadSummary } from "../types";
import { isScratchProject } from "@t3tools/client-runtime/state/projects";
import {
  buildDraftActionMenuItems,
  threadActionRequiresOperate,
  buildSidebarThreadActionMenuItems,
  type ThreadActionMenuId,
} from "./threadActionMenu.logic";
import {
  applySidebarThreadDrop,
  filterSidebarV2VisibleThreads,
  deleteSelectedThreadEntries,
  firstValidTimestampMs,
  isSidebarNestedLinkClick,
  isTrailingDoubleClick,
  orderItemsByPreferredIds,
  planSidebarThreadDrop,
  resolveAdjacentThreadId,
  resolveSidebarSweepKeys,
  resolveSidebarDropTarget,
  resolveSidebarDropVerb,
  resolveSidebarThreadSection,
  searchSidebarThreads,
  shouldNavigateAfterThreadPark,
  sidebarListItemId,
  sidebarThreadKeyAtY,
  sortInboxThreadsByReturn,
  sortPinnedThreadsForSidebar,
  sortThreadsForSidebar,
  sortWorkingThreadsBySend,
  useThreadJumpHintsVisible,
  resolveSidebarReorderableThreadKeys,
  type SidebarListItem,
  type SidebarSection,
  resolveSidebarRowThreadId,
  sidebarSweepScopes,
  resolveSidebarNewThreadDestination,
  resolveSidebarNewThreadTooltip,
  prepareSidebarProjectsForGrouping,
  sortSidebarV2ProjectGroups,
} from "./Sidebar.logic";
import {
  createSidebarCollisionDetection,
  createSidebarSortingStrategy,
  restrictSidebarDrag,
} from "./Sidebar.drag";
import { SidebarDragLifecycle, SidebarPointerSensor } from "./Sidebar.pointer";
import { createSidebarListMotion } from "./Sidebar.motion";
import { resolveSnoozePresets, snoozeWakeLabel, type SnoozePreset } from "./Sidebar.snooze";
import { deriveProviderEntriesByEnvironment } from "../providerInstances";
import { useStableCallback } from "../hooks/useStableCallback";
import {
  pendingSidebarRouteReveal,
  completeSidebarRouteReveal,
  type SidebarRouteReveal,
} from "./sidebar/routeReveal";
import { stackedThreadToast, toastManager } from "./ui/toast";
import { SidebarContent, useSidebar } from "./ui/sidebar";
import { SidebarChromeFooter } from "./sidebar/SidebarChrome";
import { SidebarThreadHeader } from "./sidebar/SidebarThreadHeader";
import { TooltipProvider } from "./ui/tooltip";
import { composerDraftHasUserContent, DraftId, useComposerDraftStore } from "../composerDraftStore";
import { useThreadRouteTarget } from "../hooks/useThreadRouteTarget";
import {
  SidebarSearchResultRow,
  SortableThreadRow,
  type SidebarProviderEntry,
  type SidebarSweepAction,
} from "./sidebar/SidebarThreadRow";
import { SidebarDraftBlock } from "./sidebar/SidebarDraftBlock";
import {
  SidebarDragBoundary,
  SidebarSectionPlaceholder,
  SortableSidebarMarker,
} from "./sidebar/SidebarListMarkers";
import { t } from "~/i18n";
import { SNOOZE_UI_ENABLED } from "../snoozeUi";
import { ContextMenu } from "@base-ui/react/context-menu";
import { useAtomCommand } from "../state/use-atom-command";
import { ThreadMenuItems } from "./chat/ChatHeader";
import { useScratchProject } from "../hooks/useScratchProject";
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
import { MenuPopup } from "./ui/menu";
export {
  resolveSidebarLastReply,
  useSidebarThreadContextMenuTrigger,
} from "./sidebar/SidebarThreadRow";

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

// Resolve providers per environment because default instance ids collide across environments.
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

const inboxReturns = createInboxReturnTracker();

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

/** Repartitions on clock changes as well as shell events, including local midnight and snooze expiry. */
function partitionSidebarThreads(input: {
  threads: readonly EnvironmentThreadShell[];
  scopedProjectKeys: ReadonlySet<string> | null;
  delegatedUnderParent: ReadonlySet<string>;
  connectedEnvironmentIds: readonly EnvironmentId[];
  serverConfigs: ReturnType<typeof useServerConfigs>;
  optimisticDrop: SidebarOptimisticDrop | null;
  workingShelfEnabled: boolean;
  isTodayView: boolean;
  clockKey: string;
}) {
  const {
    threads,
    scopedProjectKeys,
    delegatedUnderParent,
    serverConfigs,
    connectedEnvironmentIds,
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
  const visible = filterSidebarV2VisibleThreads(threads, scopedProjectKeys).filter(
    (thread) =>
      !delegatedUnderParent.has(scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id))),
  );
  const inboxObservation = inboxReturns.observe(
    workingShelfEnabled || isTodayView ? threads : null,
  );
  const pinned: EnvironmentThreadShell[] = [];
  const active: EnvironmentThreadShell[] = [];
  const working: EnvironmentThreadShell[] = [];
  // Working beta: only inbox threads fold away. Pins stay where the user
  // put them, and snoozed or settled threads keep their shelves.
  const inbox = (thread: EnvironmentThreadShell, manuallyMoved = false) =>
    workingShelfEnabled &&
    (manuallyMoved ? isThreadWorking(thread) : inboxObservation.isWorking(thread))
      ? working
      : active;
  const snoozed: EnvironmentThreadShell[] = [];
  const settled: EnvironmentThreadShell[] = [];
  const { draggableThreadKeys, activeReorderableThreadKeys } = resolveSidebarReorderableThreadKeys({
    threads: visible,
    serverConfigs,
    connectedEnvironmentIds,
  });
  for (const thread of visible) {
    const configLoaded = serverConfigs.has(thread.environmentId);
    const threadKey = scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
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
          : inbox(projected, true)
      ).push(
        optimisticDrop.clearsSnooze
          ? projected
          : { ...projected, snoozedAt: thread.snoozedAt, snoozedUntil: thread.snoozedUntil },
      );
    } else {
      const section = resolveSidebarThreadSection({
        snoozed: configLoaded && effectiveSnoozed(thread, { now: preciseNow }),
        settled: configLoaded && thread.settledOverride === "settled",
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
    ? sortInboxThreadsByReturn(active, inboxObservation.returnedAt)
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
    draggableThreadKeys,
    activeReorderableThreadKeys,
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
    visibleThreads: visible,
    snoozeNow: preciseNow,
  };
}

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
    // Settle emits unpin/unsnooze too; hold projected fields and sort times until the whole move completes.
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

// Pointer travel before a press on a row starts a drag, or a press on its
// action button starts a sweep. Shorter presses stay clicks.
const SIDEBAR_DRAG_DISTANCE = 6;

// Zero-height markers reserve no label space at rest. During a drag the
// sorting strategy opens 24px for a 16px label with 4px clearance on each side.
const SIDEBAR_DRAG_LABEL_HEIGHT = 24;

/** Renders workspace navigation and dispatches project, thread and discussion entry actions. */
export default function Sidebar({ routeReveal }: { routeReveal: SidebarRouteReveal }) {
  const projects = useProjects();
  const delegatedUnderParent = useDelegatedUnderParent();
  const connectedEnvironmentIds = useConnectedEnvironmentIds();
  const projectOrder = useUiStateStore((store) => store.projectOrder);
  const threads = useAtomValue(environmentThreadShells.quietThreadShellsAtom);
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
    turnThreadIntoProject,
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
  const inboxReturnsVersion = useSyncExternalStore(
    inboxReturns.subscribe,
    inboxReturns.getSnapshot,
  );
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
  const persistedProjectScopeKeys = useUiStateStore((store) => store.sidebarProjectScopeKeys);
  const setProjectScopeKeys = useUiStateStore((store) => store.setSidebarProjectScopeKeys);
  const allProjectSnapshotsReady = useAllEnvironmentProjectSnapshotsReady();
  const allProjectConfigsReady = useAtomValue(environmentProjects.projectConfigsReadyAtom);
  const scopeGroups = pickableProjectGroups(projectGroups);
  const archivedProjectKeys = new Set(
    projectGroups.filter((group) => group.archived).map((group) => group.projectKey),
  );
  const projectScopeKeys = resolveSidebarProjectScopeKeys({
    groups: projectGroups,
    keys: persistedProjectScopeKeys,
    settings: projectGroupingSettings,
    canClearMissingScope: allProjectSnapshotsReady && allProjectConfigsReady,
  }).filter((key) => !archivedProjectKeys.has(key));
  const projectScopeKey = projectScopeKeys.length === 0 ? null : projectScopeKeys.join("\n");
  const setProjectScopeKey = (key: string | null) => setProjectScopeKeys(key === null ? [] : [key]);
  const isTodayView = projectScopeKeys.length === 0;
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
  const scopedProjectGroups = scopeGroups.filter((group) =>
    projectScopeKeys.includes(group.projectKey),
  );
  const scopedProjectGroup = scopedProjectGroups.length === 1 ? scopedProjectGroups[0]! : null;
  const scopedProjectKeys =
    scopedProjectGroups.length === 0
      ? null
      : new Set(
          scopedProjectGroups.flatMap((group) =>
            group.memberProjectRefs.map((ref) => `${ref.environmentId}:${ref.projectId}`),
          ),
        );
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
    connectedEnvironmentIds,
    delegatedUnderParent,
    optimisticDrop,
    workingShelfEnabled,
    isTodayView,
    clockKey: `${nowMinute}:${snoozeWakeTick}:${todayTick}:${inboxReturnsVersion}`,
  });

  const threadSearchInputRef = useRef<HTMLInputElement>(null);
  const [threadSearchQuery, setThreadSearchQuery] = useState("");
  const [searchHighlightKey, setSearchHighlightKey] = useState<string | null>(null);
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
  const threadSearch = useThreadSearch(
    searchEnvironmentIds,
    threadSearchQuery,
    scopedProjectGroups.length === 0
      ? {}
      : {
          projectIds: scopedProjectGroups.flatMap((group) =>
            group.memberProjectRefs.map((ref) => ref.projectId),
          ),
        },
  );
  const threadByMatchKey = new Map(
    searchableThreads.map((thread) => [
      threadSearchMatchKey({ environmentId: thread.environmentId, threadId: thread.id }),
      thread,
    ]),
  );
  const rankedServerMatches = rankMessageMatches(
    threadSearch.matches,
    (match) => {
      const thread = threadByMatchKey.get(threadSearchMatchKey(match));
      return thread ? threadSearchSubject(thread, null) : undefined;
    },
    foldSearchQuery(threadSearchQuery),
    Date.parse(nowMinute),
    { picks: false },
  );
  const serverMatchByKey = new Map(
    rankedServerMatches.map((match) => [threadSearchMatchKey(match), match] as const),
  );
  const [shownMessageOrder, setShownMessageOrder] = useState<ShownOrder | null>(null);
  const messageOrder = nextShownOrder(
    shownMessageOrder,
    threadSearch.query,
    [...serverMatchByKey.keys()],
    Number.POSITIVE_INFINITY,
  );
  if (messageOrder !== shownMessageOrder) setShownMessageOrder(messageOrder);
  const { titleMatches, contentMatches } = searchSidebarThreads(
    searchableThreads,
    threadSearchQuery,
    new Set(messageOrder.keys),
    Date.parse(nowMinute),
  );
  const threadSearchResults = [...titleMatches, ...contentMatches];
  const threadSearchMatchByKey = new Map(
    contentMatches.flatMap((thread) => {
      const key = threadSearchMatchKey({
        environmentId: thread.environmentId,
        threadId: thread.id,
      });
      const match = serverMatchByKey.get(key);
      return match ? [[key, match] as const] : [];
    }),
  );
  const threadSearchResultKeys = threadSearchResults.map((thread) =>
    scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
  );
  const activeSearchResultIndex = Math.max(
    0,
    searchHighlightKey === null ? 0 : threadSearchResultKeys.indexOf(searchHighlightKey),
  );
  const setActiveSearchResultIndex = (index: number | ((index: number) => number)) =>
    setSearchHighlightKey(
      threadSearchResultKeys[
        typeof index === "function" ? index(activeSearchResultIndex) : index
      ] ?? null,
    );

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
  const olderSettledShelf = useOlderSettledShelf({
    scopes: [...serverConfigs.keys()].flatMap<OlderSettledScope>((environmentId) => {
      if (scopedProjectKeys === null) return [{ environmentId, projectIds: null }];
      const prefix = `${environmentId}:`;
      const projectIds = [...scopedProjectKeys].flatMap((key) =>
        key.startsWith(prefix) ? [ProjectId.make(key.slice(prefix.length))] : [],
      );
      return projectIds.length === 0 ? [] : [{ environmentId, projectIds }];
    }),
    expanded: !isTodayView && currentTab === "settled",
    visibleCount: settledVisibleCount,
  });
  const listedSettledThreads = settledThreads.filter(olderSettledShelf.isListed);
  useOlderSettledShelfGrowth(olderSettledShelf, listedSettledThreads);
  const unloadedSettledCount = olderSettledShelf.unloadedCount(threads);
  const sidebarTabs = (() =>
    buildSidebarTabs(
      {
        pinnedThreads,
        activeThreads,
        workingThreads,
        snoozedThreads,
        settledThreads: listedSettledThreads,
      },
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
  const hiddenSettledCount = sidebarTabs.hiddenSettledCount + unloadedSettledCount;
  const showMoreSettled = () => {
    olderSettledShelf.retry();
    setSettledVisibleCount(nextSidebarSettledVisibleCount);
  };
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

  // History navigation must reveal the route inside the fork's Today/project tabs.
  // A manual scope change with an unchanged route must keep the chosen filter.
  const mountRevealOwed = useRef(true);
  const revealRouteRow = useStableCallback(() => {
    const pendingKey = pendingSidebarRouteReveal(routeReveal, routeRowThreadKey);
    if (isSearchingThreads) return;
    const revealKey = pendingKey ?? (mountRevealOwed.current ? routeRowThreadKey : null);
    if (revealKey === null) return;
    const thread = threads.find(
      (candidate) =>
        scopedThreadKey(scopeThreadRef(candidate.environmentId, candidate.id)) === revealKey,
    );
    if (thread === undefined) return;
    if (pendingKey !== null) {
      if (filterSidebarV2VisibleThreads([thread], null).length === 0) return;
      const inTodayWorking = todayRows.working.includes(thread);
      const inTodayWaiting = todayRows.waiting.includes(thread);
      if (
        (isTodayView && !inTodayWorking && !inTodayWaiting) ||
        (scopedProjectKeys !== null &&
          filterSidebarV2VisibleThreads([thread], scopedProjectKeys).length === 0)
      ) {
        const group = projectGroups.find((candidate) =>
          candidate.memberProjectRefs.some(
            (ref) =>
              ref.environmentId === thread.environmentId && ref.projectId === thread.projectId,
          ),
        );
        if (!group) return;
        setProjectScopeKey(group.projectKey);
        return;
      }
      if (isTodayView) {
        const tab = inTodayWorking ? "working" : "waiting";
        if (todayTab !== tab) {
          handleTodayTabChange(tab);
          return;
        }
      } else {
        const tab = resolveSidebarSearchResultTab({
          threadKey: revealKey,
          snoozedThreadKeys,
          settledThreadKeys,
        });
        if (currentTab !== tab) {
          handleSidebarTabChange(tab);
          return;
        }
      }
    }
    const activeRow = document.querySelector('[data-sidebar="content"] [aria-current="page"]');
    if (!activeRow) return;
    completeSidebarRouteReveal(routeReveal);
    mountRevealOwed.current = false;
    activeRow.scrollIntoView({ block: "nearest" });
  });
  useEffect(revealRouteRow, [
    revealRouteRow,
    routeRowThreadKey,
    threads,
    projectScopeKey,
    isSearchingThreads,
    currentTab,
    todayTab,
  ]);

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
    const match = threadSearchMatchByKey.get(
      threadSearchMatchKey({ environmentId: thread.environmentId, threadId: thread.id }),
    );
    const query = threadSearch.query;
    clearThreadSearch();
    navigateToThread(threadRef);
    if (match) openThreadFindOnQuery(scopedThreadKey(threadRef), findForMessageMatch(match, query));
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

  const attachTreeRef = (node: HTMLUListElement) => {
    attachListMotionRef(node);
    const detachTree = attachSidebarTree(node);
    return () => {
      detachTree?.();
      attachListMotionRef(null);
    };
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
        return (
          thread !== undefined &&
          originScope !== undefined &&
          sweepScopesRef.current.get(key) === originScope &&
          serverConfigs.has(thread.environmentId)
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
      now: snoozeNow,
    })
  )
    setOptimisticDrop(null);
  const attemptPin = (threadRef: ScopedThreadRef) => {
    void (async () => {
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
  // Preserve the list while streamed updates leave order unchanged to retain row memoization.
  const sidebarListItemsKey = sidebarListItemsFresh
    .map((item) => (item.kind === "thread" ? item.section + ":" + item.key : item.marker))
    .join("\n");
  const [sidebarListItemsState, setSidebarListItems] = useState(sidebarListItemsFresh);
  const [sidebarListItemsKeyState, setSidebarListItemsKeyState] = useState(sidebarListItemsKey);
  let sidebarListItems = sidebarListItemsState;
  if (sidebarListItemsKeyState !== sidebarListItemsKey) {
    setSidebarListItemsKeyState(sidebarListItemsKey);
    setSidebarListItems(sidebarListItemsFresh);
    // Update the local list too; threadByKey already omits rows moved into collapsed shelves.
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
            supportsSettlement: serverConfigs.has(source.environmentId),
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
      supportsSettlement: serverConfigs.has(activeThread.environmentId),
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
      // oxlint-disable-next-line react/purity -- The drop event samples its own timestamp.
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
        // oxlint-disable-next-line react/purity -- Drag eligibility is read by the drag event callback.
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
      // oxlint-disable-next-line react/purity -- Presets resolve when the user opens the bulk menu.
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
            // The menu may outlive draft promotion; discarding then would strand the send.
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
        const configLoaded = serverConfigs.has(thread.environmentId);
        const supportsAutoSettleOptOut =
          serverConfigs.get(thread.environmentId)?.environment.capabilities
            .threadAutoSettleOptOut === true;
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
              // An archived project is not a filter choice.
              projectFilter:
                threadProjectGroup && !threadProjectGroup.archived
                  ? {
                      label: threadProjectGroup.displayName,
                      isActive: projectScopeKeys.includes(threadProjectGroup.projectKey),
                    }
                  : null,
              isPinned,
              isSettled,
              autoSettleEnabled: thread.autoSettleDisabledAt == null,
              isSnoozed,
              canSnoozeNow: canSnooze(thread, { now: new Date().toISOString() }),
              isRegeneratingTitle,
              isRunning: !threadRuntimeCanArchive(thread.runtime),
              canTurnIntoProject: canTurnThreadIntoProject(threadRef),
              supports: {
                settlement: configLoaded,
                autoSettleOptOut: supportsAutoSettleOptOut,
                snooze: configLoaded,
                pinning: configLoaded,
                titleRegeneration: configLoaded,
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
              setProjectScopeKeys(
                projectScopeKeys.includes(threadProjectGroup.projectKey)
                  ? []
                  : [threadProjectGroup.projectKey],
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
          case "turn-into-project": {
            const result = await turnThreadIntoProject(threadRef);
            if (result._tag === "Success") {
              toastManager.add({
                type: "success",
                title: "Project created",
                description: thread.title,
              });
            } else if (!isAtomCommandInterrupted(result)) {
              const error = squashAtomCommandFailure(result);
              toastManager.add(
                stackedThreadToast({
                  type: "error",
                  title: "Could not turn thread into a project",
                  description: error instanceof Error ? error.message : "An error occurred.",
                }),
              );
            }
            return;
          }
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
          case "copy-thread":
            void copyThreadReference(threadChipCopyTarget(threadRef, thread.title));
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
  const showJumpHints = useThreadJumpHintsVisible(shouldShowJumpHintsNow);

  // Honor the rail scope while sharing physical target selection with the picker.
  const newThreadDestination = resolveSidebarNewThreadDestination({
    shiftKey: false,
    groups: projectGroups,
    scopeKey: scopedProjectGroup?.projectKey ?? null,
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
                          searchMatchQuery={threadSearch.query}
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
                    ref={attachTreeRef}
                    data-dragging={(!isContextDrag && dragState !== null) || undefined}
                    {...SIDEBAR_TREE_PROPS}
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
                            settlementSupported={serverConfigs.has(thread.environmentId)}
                            snoozeSupported={serverConfigs.has(thread.environmentId)}
                            pinningSupported={serverConfigs.has(thread.environmentId)}
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
                          disabled={olderSettledShelf.loading}
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
