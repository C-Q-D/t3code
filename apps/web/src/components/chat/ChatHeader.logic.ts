/** Adapts the shared action model to the V2 titlebar menu without changing action availability. */
import type { ContextMenuItem } from "@t3tools/contracts";
import type { ThreadActionMenuId } from "../threadActionMenu.logic";

// Supplementary screen 3, V2: commands, lifecycle, clipboard/export, project/settings, removal.
const titlebarMenuGroups: readonly (readonly ThreadActionMenuId[])[] = [
  ["rename", "regenerate-title", "mark-unread", "filter-by-project"],
  ["pin", "unpin", "settle", "unsettle", "unsnooze", "snooze"],
  ["copy-path", "copy-branch", "copy-thread-id", "export-transcript"],
  ["new-thread-on-branch", "project-settings", "auto-settle"],
  ["archive", "delete"],
];

/**
 * Groups existing commands like V2 and exposes Copy's children as individual rows.
 * @param items Shared menu snapshot including capability, permission and lifecycle gating.
 * @param copyLabels Localized standalone action labels; submenu nouns lose their Copy parent here.
 * @returns New top-level rows; nested snooze/settings choices and all action flags stay intact.
 * Unknown commands retain their input order in a final group so no action silently disappears.
 */
export function buildTitlebarThreadMenuItems(
  items: readonly ContextMenuItem<ThreadActionMenuId>[],
  copyLabels: Readonly<Record<"copy-path" | "copy-branch" | "copy-thread-id", string>>,
): readonly ContextMenuItem<ThreadActionMenuId>[] {
  const rows = items.flatMap((item) =>
    item.id === "copy"
      ? (item.children ?? []).map((child) => ({
          ...child,
          label:
            child.id === "copy-path" || child.id === "copy-branch" || child.id === "copy-thread-id"
              ? copyLabels[child.id]
              : child.label,
        }))
      : [item],
  );
  const positions = new Map(
    titlebarMenuGroups
      .flatMap((group, groupIndex) => group.map((id) => ({ id, groupIndex })))
      .map(({ id, groupIndex }, order) => [id, { group: groupIndex, order }] as const),
  );
  return rows
    .toSorted(
      (left, right) =>
        (positions.get(left.id)?.order ?? Infinity) - (positions.get(right.id)?.order ?? Infinity),
    )
    .map((item, index, sorted) => ({
      ...item,
      separatorBefore:
        index > 0 && positions.get(item.id)?.group !== positions.get(sorted[index - 1]!.id)?.group,
    }));
}
