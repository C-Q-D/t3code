/** Shares the actionable selection and availability between the bulk slab and native context menu. */
import type { ContextMenuItem, EnvironmentId } from "@t3tools/contracts";
import { canSnooze, type SnoozePreset } from "@t3tools/client-runtime/state/thread-settled";
import { t } from "~/i18n";
import { SNOOZE_UI_ENABLED } from "~/snoozeUi";
import type { SidebarThreadSummary } from "~/types";
import {
  buildBulkTitleRegenerationContextMenuItem,
  buildBulkUnpinContextMenuItem,
} from "../Sidebar.logic";

/** Existing server capabilities used by bulk actions; unsupported actions stay absent. */
export type SidebarBulkCapability = "threadSnooze" | "threadPinning" | "threadTitleRegeneration";

/**
 * Resolve only selected keys still present in the rendered thread map, preserving selection order.
 * `supports` reads each destination environment's capabilities; `canOperate` checks its grants.
 * `now` is an ISO timestamp and presets belong to that same menu-opening time.
 * Pass no presets for availability-only rendering; resolve them afresh when opening the menu.
 * Returned targets and menu counts share one selection, so hidden/deleted rows cannot be acted on.
 */
export function buildSidebarBulkActionModel(input: {
  selectedThreadKeys: ReadonlySet<string>;
  threadByKey: ReadonlyMap<string, SidebarThreadSummary>;
  supports: (environmentId: EnvironmentId, capability: SidebarBulkCapability) => boolean;
  canOperate: (threads: readonly SidebarThreadSummary[]) => boolean;
  now: string;
  snoozePresets: readonly SnoozePreset[];
}) {
  const threadKeys = [...input.selectedThreadKeys].filter((key) => input.threadByKey.has(key));
  const selectedThreads = threadKeys.map((key) => input.threadByKey.get(key)!);
  const count = threadKeys.length;
  const settlingThreads = selectedThreads.filter((thread) => thread.settledOverride !== "settled");
  const canSnoozeSelection =
    SNOOZE_UI_ENABLED &&
    selectedThreads.every(
      (thread) =>
        input.supports(thread.environmentId, "threadSnooze") &&
        canSnooze(thread, { now: input.now }),
    );
  const titleRegenerationThreads = selectedThreads.filter((thread) =>
    input.supports(thread.environmentId, "threadTitleRegeneration"),
  );
  const regeneratableTitleThreads = titleRegenerationThreads.filter(
    (thread) => thread.titleRegeneration == null,
  );
  const titleRegenerationMenuItem = buildBulkTitleRegenerationContextMenuItem({
    supportedCount: titleRegenerationThreads.length,
    actionableCount: regeneratableTitleThreads.length,
  });
  const pinnedSelectedThreads = selectedThreads.filter(
    (thread) => input.supports(thread.environmentId, "threadPinning") && thread.pinnedAt != null,
  );
  const unpinMenuItem = buildBulkUnpinContextMenuItem({
    pinnedCount: pinnedSelectedThreads.length,
  });
  const items: ContextMenuItem[] =
    count === 0
      ? []
      : [
          ...(unpinMenuItem
            ? [{ ...unpinMenuItem, disabled: !input.canOperate(pinnedSelectedThreads) }]
            : []),
          {
            id: "settle",
            label: t.sidebar.bulk.settle(count),
            disabled: settlingThreads.length === 0 || !input.canOperate(settlingThreads),
          },
          ...(canSnoozeSelection
            ? [
                {
                  id: "snooze",
                  label: t.sidebar.bulk.snooze(count),
                  disabled: !input.canOperate(selectedThreads),
                  children: [
                    ...input.snoozePresets.map((preset) => ({
                      id: `snooze:${preset.id}`,
                      label: t.sidebar.snooze.presetLabel(preset.label, preset.whenLabel),
                      disabled: !input.canOperate(selectedThreads),
                    })),
                    {
                      id: "snooze:custom",
                      label: t.sidebar.snooze.custom,
                      separatorBefore: true,
                      disabled: !input.canOperate(selectedThreads),
                    },
                  ],
                },
              ]
            : []),
          ...(titleRegenerationMenuItem
            ? [
                {
                  ...titleRegenerationMenuItem,
                  disabled:
                    titleRegenerationMenuItem.disabled ||
                    !input.canOperate(regeneratableTitleThreads),
                },
              ]
            : []),
          { id: "mark-unread", label: t.sidebar.bulk.markUnread(count) },
          {
            id: "delete",
            label: t.sidebar.bulk.delete(count),
            destructive: true,
            disabled: !input.canOperate(selectedThreads),
          },
        ];
  return {
    threadKeys,
    selectedThreads,
    settlingThreads,
    pinnedSelectedThreads,
    regeneratableTitleThreads,
    items,
  };
}
