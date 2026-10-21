/** Routes measured tab drops before list sorting while retaining the existing sidebar sensor and commands. */
import {
  DndContext,
  pointerWithin,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import { type ComponentProps } from "react";
import type { SidebarSection } from "../Sidebar.logic";
import {
  resolveSidebarTabDropIntent,
  type SidebarTab,
  type SidebarTabDropIntent,
} from "./sidebarTabs.logic";

/** Current source availability; each drop re-reads this snapshot instead of trusting pickup state. */
export interface SidebarTabDragSource {
  section: SidebarSection;
  canOperate: boolean;
  supportsSettlement: boolean;
  supportsSnooze: boolean;
  canSnooze: boolean;
}

/** Live source lookup and the existing lifecycle command adapter; positions use client pixels. */
export interface SidebarTabDropActions {
  getSource: (threadKey: string) => SidebarTabDragSource | null;
  onDrop: (
    threadKey: string,
    intent: NonNullable<SidebarTabDropIntent>,
    position: { x: number; y: number },
  ) => void;
}

/** Existing list drag configuration plus tab lifecycle dispatch, with no automatic tab switching. */
type SidebarThreadDndContextProps = ComponentProps<typeof DndContext> & {
  collisionDetection: CollisionDetection;
  tabDrop: SidebarTabDropActions;
};

/** Namespace tabs separately from environment-scoped thread keys and sortable section sentinels. */
export function sidebarTabDropId(tab: SidebarTab): string {
  return `sidebar-tab:${tab}`;
}

/** Recognize only the three registered tabs; ordinary rows remain owned by list sorting. */
function tabForDropId(id: string | number | undefined): SidebarTab | null {
  if (id === sidebarTabDropId("active")) return "active";
  if (id === sidebarTabDropId("later")) return "later";
  if (id === sidebarTabDropId("settled")) return "settled";
  return null;
}

/** Reject same-shelf drops and unavailable commands before showing a target or mutating state. */
function availableIntent(
  source: SidebarTabDragSource | null,
  tab: SidebarTab,
): SidebarTabDropIntent {
  if (!source || !source.canOperate) return null;
  const sourceTab =
    source.section === "snoozed" ? "later" : source.section === "settled" ? "settled" : "active";
  if (sourceTab === tab) return null;
  const intent = resolveSidebarTabDropIntent(source.section, tab);
  if (intent === "open-snooze-menu" || intent === "unsnooze") {
    return source.supportsSnooze && (intent === "unsnooze" || source.canSnooze) ? intent : null;
  }
  return source.supportsSettlement ? intent : null;
}

/**
 * Share one DndContext across fixed header and scrolling rows. Pointer hits on tabs take priority
 * over the clamped dragged card; tabs are excluded from nearest-row fallback outside their bounds.
 * Native sensor cancellation and the caller's list handlers retain their existing behavior.
 */
export function SidebarThreadDndContext({
  tabDrop,
  collisionDetection,
  onDragEnd,
  ...props
}: SidebarThreadDndContextProps) {
  const detect = ((args) => {
    const hits = pointerWithin({
      ...args,
      droppableContainers: args.droppableContainers.filter(
        (container) => tabForDropId(container.id) !== null,
      ),
    });
    const hit = hits[0];
    if (hit) {
      const tab = tabForDropId(hit.id)!;
      return availableIntent(tabDrop.getSource(String(args.active.id)), tab) ? hits : [];
    }
    return collisionDetection({
      ...args,
      droppableContainers: args.droppableContainers.filter(
        (container) => tabForDropId(container.id) === null,
      ),
    });
  }) satisfies CollisionDetection;
  const finish = (event: DragEndEvent) => {
    const tab = tabForDropId(event.over?.id);
    if (tab !== null && event.over) {
      const key = String(event.active.id);
      const intent = availableIntent(tabDrop.getSource(key), tab);
      if (intent)
        tabDrop.onDrop(key, intent, { x: event.over.rect.left, y: event.over.rect.bottom });
      return;
    }
    onDragEnd?.(event);
  };
  return <DndContext {...props} collisionDetection={detect} onDragEnd={finish} />;
}
