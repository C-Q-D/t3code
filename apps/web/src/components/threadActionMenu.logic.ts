/** Builds shared thread menus and permission availability; action execution belongs in the calling surface. */
import { t } from "~/i18n";
import { SNOOZE_UI_ENABLED } from "../snoozeUi";
import type { ContextMenuItem } from "@t3tools/contracts";
import type { SnoozePreset } from "@t3tools/client-runtime/state/thread-settled";

/**
 * Ids for the per-thread action menu. Snooze presets are dispatched as
 * `snooze:<presetId>` so the union stays closed while the preset list
 * remains data-driven.
 */
export type ThreadActionMenuId =
  | "new-thread-on-branch"
  | "filter-by-project"
  | "project-settings"
  | "pin"
  | "unpin"
  | "settle"
  | "unsettle"
  | "auto-settle"
  | "auto-settle:enabled"
  | "auto-settle:disabled"
  | "snooze"
  | `snooze:${string}`
  | "unsnooze"
  | "rename"
  | "regenerate-title"
  | "mark-unread"
  | "copy"
  | "copy-path"
  | "copy-branch"
  | "export-transcript"
  | "copy-thread-id"
  | "discard-draft"
  | "archive"
  | "delete";

export type DraftActionMenuId =
  | "copy"
  | "copy-path"
  | "copy-branch"
  | "project-settings"
  | "discard";

/** Right-click menu for an unsent draft row in the sidebar. */
export function buildDraftActionMenuItems(options: {
  readonly hasPath: boolean;
  readonly hasBranch: boolean;
  readonly hasProject: boolean;
}): ReadonlyArray<ContextMenuItem<DraftActionMenuId>> {
  return [
    {
      id: "copy",
      label: t.common.threadActions.copy,
      icon: "copy",
      disabled: !options.hasPath && !options.hasBranch,
      children: [
        ...(options.hasPath
          ? [{ id: "copy-path" as const, label: t.common.threadActions.path, icon: "folder" }]
          : []),
        ...(options.hasBranch
          ? [
              {
                id: "copy-branch" as const,
                label: t.common.threadActions.branch,
                icon: "git-branch",
              },
            ]
          : []),
      ],
    },
    ...(options.hasProject
      ? [
          {
            id: "project-settings" as const,
            label: t.common.threadActions.projectSettings,
            icon: "settings",
          },
        ]
      : []),
    {
      id: "discard",
      label: t.common.threadActions.discardDraft,
      icon: "trash",
      destructive: true,
      separatorBefore: true,
    },
  ];
}

/** Snapshot of thread state and server capabilities used only to build menu availability. */
export interface ThreadActionMenuState {
  readonly canOperate: boolean;
  readonly branch: string | null;
  /**
   * Project scoping for the thread list. Null on surfaces with no scoped
   * list behind the menu (the chat header), where the item must not show.
   */
  readonly projectFilter: {
    readonly label: string;
    /** True when the list is already scoped to this thread's project. */
    readonly isActive: boolean;
  } | null;
  readonly isPinned: boolean;
  readonly isSettled: boolean;
  /** False while the user has turned automatic settlement off for this thread. */
  readonly autoSettleEnabled: boolean;
  readonly isSnoozed: boolean;
  readonly canSnoozeNow: boolean;
  readonly isRegeneratingTitle: boolean;
  /** Archive rejects a thread with an attached provider, so disable it here rather than let the action fail. */
  readonly isRunning: boolean;
  readonly supports: {
    readonly settlement: boolean;
    /** Server understands thread.auto-settle.set. */
    readonly autoSettleOptOut: boolean;
    readonly snooze: boolean;
    readonly pinning: boolean;
    readonly titleRegeneration: boolean;
  };
  readonly snoozePresets: ReadonlyArray<SnoozePreset>;
}

/**
 * Determines whether execution requires the destination's operate grant.
 * @param action Closed menu identifier; export is an operation even though it reads a timeline.
 * @returns False for local navigation, read markers and copying; true for server operations.
 */
export function threadActionRequiresOperate(action: ThreadActionMenuId): boolean {
  return ![
    "new-thread-on-branch",
    "project-settings",
    "mark-unread",
    "copy",
    "copy-path",
    "copy-branch",
    "copy-thread-id",
    "discard-draft",
  ].includes(action);
}

/**
 * Builds the titlebar menu and the base commands used by the sidebar adapter.
 * Sidebar presentation has its own ordering while retaining these permission rules.
 * @param state Current destination permissions, thread lifecycle and optional capabilities.
 * @returns Ordered menu entries; export follows Copy at the top level and is disabled without operate.
 * This function performs no mutations; callers recheck grants when an item is selected.
 */
export function buildThreadActionMenuItems(
  state: ThreadActionMenuState,
): ReadonlyArray<ContextMenuItem<ThreadActionMenuId>> {
  const items: ReadonlyArray<ContextMenuItem<ThreadActionMenuId>> = [
    ...(state.branch
      ? [
          {
            id: "new-thread-on-branch" as const,
            label: t.common.threadActions.newThreadOnBranch(state.branch),
            icon: "message-square-plus",
          },
        ]
      : []),
    ...(state.supports.pinning
      ? [
          state.isPinned
            ? { id: "unpin" as const, label: t.common.threadActions.unpin, icon: "pin-off" }
            : { id: "pin" as const, label: t.common.threadActions.pin, icon: "pin" },
        ]
      : []),
    // Both lifecycle actions stay available on pinned threads: settling
    // clears the pin ("done" beats "keep on top"), and snoozing hides the
    // card until wake with the pin intact.
    ...(state.supports.settlement
      ? [
          state.isSettled
            ? {
                id: "unsettle" as const,
                label: t.common.threadActions.unsettle,
                icon: "circle-check",
              }
            : { id: "settle" as const, label: t.common.threadActions.settle, icon: "circle-check" },
        ]
      : []),
    ...(SNOOZE_UI_ENABLED && state.supports.snooze
      ? [
          state.isSnoozed
            ? { id: "unsnooze" as const, label: t.common.threadActions.wake, icon: "clock" }
            : {
                id: "snooze" as const,
                label: t.common.threadActions.snooze,
                icon: "clock",
                disabled: !state.canSnoozeNow,
                children: [
                  ...state.snoozePresets.map((preset) => ({
                    id: `snooze:${preset.id}` as const,
                    label: t.common.threadActions.snoozePreset(preset.label, preset.whenLabel),
                  })),
                  {
                    id: "snooze:custom" as const,
                    label: t.common.threadActions.customSnooze,
                    separatorBefore: true,
                  },
                ],
              },
        ]
      : []),
    { id: "rename", label: t.common.threadActions.rename, icon: "pencil", separatorBefore: true },
    ...(state.supports.titleRegeneration
      ? [
          {
            id: "regenerate-title" as const,
            label: state.isRegeneratingTitle
              ? t.common.threadActions.regeneratingTitle
              : t.common.threadActions.regenerateTitle,
            icon: "refresh-cw",
            disabled: state.isRegeneratingTitle,
          },
        ]
      : []),
    { id: "mark-unread", label: t.common.threadActions.markUnread, icon: "mail-open" },
    ...(state.projectFilter
      ? [
          {
            id: "filter-by-project" as const,
            label: state.projectFilter.isActive
              ? t.common.threadActions.showAllProjects
              : t.common.threadActions.filterByProject(state.projectFilter.label),
            icon: "folder-tree",
          },
        ]
      : []),
    // A submenu with the current option checked, not a one-shot action:
    // this is a setting, and it sits with the other per-thread settings
    // rather than the lifecycle verbs above. Disabled keeps long-running
    // threads out of the settled shelf no matter how quiet they get.
    ...(state.supports.autoSettleOptOut
      ? [
          {
            id: "auto-settle" as const,
            label: t.common.threadActions.autoSettle,
            icon: "timer",
            children: [
              {
                id: "auto-settle:enabled" as const,
                label: t.common.threadActions.enabled,
                checked: state.autoSettleEnabled,
              },
              {
                id: "auto-settle:disabled" as const,
                label: t.common.threadActions.disabled,
                checked: !state.autoSettleEnabled,
              },
            ],
          },
        ]
      : []),
    {
      id: "copy",
      label: t.common.threadActions.copy,
      icon: "copy",
      separatorBefore: true,
      children: [
        { id: "copy-path", label: t.common.threadActions.path, icon: "folder" },
        ...(state.branch
          ? [
              {
                id: "copy-branch" as const,
                label: t.common.threadActions.branch,
                icon: "git-branch",
              },
            ]
          : []),
        { id: "copy-thread-id", label: t.common.threadActions.threadId, icon: "hash" },
      ],
    },
    { id: "export-transcript", label: t.common.threadActions.exportTranscript, icon: "download" },
    { id: "project-settings", label: t.common.threadActions.projectSettings, icon: "settings" },
    // Archive removes the thread from the sidebar while keeping its
    // conversation under Settings > Archived threads — distinct from Settle
    // (stays visible in the Settled shelf) and Delete (clears history for
    // good), so it sits beside Delete without borrowing its destructive
    // styling.
    {
      id: "archive",
      label: t.common.threadActions.archive,
      icon: "archive",
      disabled: state.isRunning,
      separatorBefore: true,
    },
    {
      id: "delete",
      label: t.common.threadActions.delete,
      destructive: true,
      icon: "trash",
    },
  ];
  return state.canOperate
    ? items
    : items.map((item) =>
        threadActionRequiresOperate(item.id)
          ? {
              ...item,
              disabled: true,
              ...(item.children
                ? { children: item.children.map((child) => ({ ...child, disabled: true })) }
                : {}),
            }
          : item,
      );
}

/**
 * Adapts commands to V2 groups without changing the titlebar menu.
 * @param state Menu-open snapshot; hasDraft means unsent user content, including attachments.
 * @returns Ordered rows with disabled placeholders for missing capabilities or branches.
 * Discard stays local; callers recheck server grants before executing other guarded actions.
 */
export function buildSidebarThreadActionMenuItems(
  state: ThreadActionMenuState & { readonly hasDraft: boolean },
): ReadonlyArray<ContextMenuItem<ThreadActionMenuId>> {
  // Derive every V2 command, then disable unavailable capabilities instead of
  // hiding them. The titlebar keeps its existing capability-based visibility.
  const commands = buildThreadActionMenuItems({
    ...state,
    isSnoozed: false,
    supports: {
      settlement: true,
      autoSettleOptOut: true,
      snooze: true,
      pinning: true,
      titleRegeneration: true,
    },
  });
  const command = (
    id: ThreadActionMenuId,
    available = true,
  ): ContextMenuItem<ThreadActionMenuId> => {
    const item = commands.find((candidate) => candidate.id === id);
    if (!item) throw new Error(`Missing sidebar thread command: ${id}`);
    const { separatorBefore: _separatorBefore, ...row } = item;
    const disabled = item.disabled === true || !available;
    return {
      ...row,
      disabled,
      ...(disabled && row.children
        ? { children: row.children.map((child) => ({ ...child, disabled: true })) }
        : {}),
    };
  };
  const items: ContextMenuItem<ThreadActionMenuId>[] = [
    command("rename"),
    command("regenerate-title", state.supports.titleRegeneration),
    command("mark-unread"),
    { ...command(state.isPinned ? "unpin" : "pin", state.supports.pinning), separatorBefore: true },
    command(state.isSettled ? "unsettle" : "settle", state.supports.settlement),
    ...(SNOOZE_UI_ENABLED
      ? [
          {
            id: "unsnooze" as const,
            label: t.sidebar.actions.wake,
            icon: "clock",
            disabled: !state.canOperate || !state.supports.snooze || !state.isSnoozed,
          },
          {
            ...command("snooze", state.supports.snooze && !state.isSnoozed),
            label: t.sidebar.actions.snooze,
          },
        ]
      : []),
    { id: "copy-path", label: t.sidebar.actions.copyPath, icon: "folder", separatorBefore: true },
    {
      id: "copy-branch",
      label: t.sidebar.actions.copyBranch,
      icon: "git-branch",
      disabled: !state.branch,
    },
    { id: "copy-thread-id", label: t.sidebar.actions.copyThreadId, icon: "hash" },
    command("export-transcript"),
    {
      id: "new-thread-on-branch",
      label: state.branch
        ? t.sidebar.thread.newThreadOnBranch(state.branch)
        : t.sidebar.actions.newThreadOnBranchUnavailable,
      icon: "message-square-plus",
      disabled: !state.branch,
      separatorBefore: true,
    },
    command("project-settings"),
    ...(state.projectFilter ? [command("filter-by-project")] : []),
    command("auto-settle", state.supports.autoSettleOptOut),
    ...(state.hasDraft
      ? [
          {
            id: "discard-draft" as const,
            label: t.sidebar.thread.discardDraft,
            icon: "trash",
            separatorBefore: true,
          },
        ]
      : []),
    { ...command("archive"), label: t.sidebar.actions.archive, separatorBefore: !state.hasDraft },
    command("delete"),
  ];
  return items;
}
