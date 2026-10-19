/** B1's bottom bulk slab subscribes independently so selection changes do not rerender the thread list. */
import { AuthOrchestrationOperateScope, type EnvironmentId } from "@t3tools/contracts";
import {
  AlarmClockIcon,
  CheckIcon,
  EllipsisIcon,
  MailIcon,
  PinOffIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react";
import { memo, useId, useMemo, useRef, useState } from "react";
import { useThreadSelectionStore } from "~/threadSelectionStore";
import { useEnvironmentsWithScope } from "~/state/session";
import type { SidebarThreadSummary } from "~/types";
import { t } from "~/i18n";
import { SNOOZE_UI_ENABLED } from "~/snoozeUi";
import { cn } from "~/lib/utils";
import { useNowMinute } from "~/hooks/useNowMinute";
import { Tooltip, TooltipPopup, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import {
  buildSidebarBulkActionModel,
  type SidebarBulkCapability,
} from "./sidebarBulkActions.logic";

/** Visible rows and existing capability/action adapters; execution stays in Sidebar. */
interface SidebarBulkActionsProps {
  threadByKey: ReadonlyMap<string, SidebarThreadSummary>;
  supports: (environmentId: EnvironmentId, capability: SidebarBulkCapability) => boolean;
  onAction: (position: { x: number; y: number }, action: string) => Promise<void>;
}

const moreActionIcons = {
  unpin: PinOffIcon,
  "mark-unread": MailIcon,
  "regenerate-title": RefreshCwIcon,
  delete: Trash2Icon,
};

/**
 * Anchor the slab below the scroll viewport, keeping the final row reachable as More expands.
 * Empty or stale-only selections render nothing. Grant changes update disabled states live;
 * the caller rechecks the selection, capabilities and permissions when an action executes.
 */
export const SidebarBulkActions = memo(function SidebarBulkActions(props: SidebarBulkActionsProps) {
  const selectedThreadKeys = useThreadSelectionStore((state) => state.selectedThreadKeys);
  const selectedThreads = useMemo(
    () =>
      [...selectedThreadKeys].flatMap((key) => {
        const thread = props.threadByKey.get(key);
        return thread ? [thread] : [];
      }),
    [props.threadByKey, selectedThreadKeys],
  );
  const permittedEnvironments = useEnvironmentsWithScope(
    selectedThreads,
    AuthOrchestrationOperateScope,
  );
  const nowMinute = useNowMinute();
  const model = useMemo(
    () =>
      buildSidebarBulkActionModel({
        selectedThreadKeys,
        threadByKey: props.threadByKey,
        supports: props.supports,
        canOperate: (threads) =>
          threads.every((thread) => permittedEnvironments.has(thread.environmentId)),
        now: `${nowMinute}:00.000Z`,
        snoozePresets: [],
      }),
    [selectedThreadKeys, props.threadByKey, props.supports, permittedEnvironments, nowMinute],
  );
  // A new selection starts collapsed, including when the previous selection was cleared elsewhere.
  const [expandedSelection, setExpandedSelection] = useState<ReadonlySet<string> | null>(null);
  const expanded = expandedSelection === selectedThreadKeys;
  const panelId = useId();
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  if (model.threadKeys.length === 0) return null;
  const settle = model.items.find((item) => item.id === "settle")!;
  const snooze = model.items.find((item) => item.id === "snooze");
  const more = ["unpin", "mark-unread", "regenerate-title", "delete"].flatMap((id) => {
    const item = model.items.find((candidate) => candidate.id === id);
    return item ? [item] : [];
  });
  const runAction = (element: HTMLButtonElement, action: string) => {
    const rect = element.getBoundingClientRect();
    void props.onAction({ x: rect.left, y: rect.top }, action);
  };
  return (
    <div
      data-thread-selection-safe
      className="relative z-10 mx-3 mt-2 mb-3 shrink-0"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !expanded) return;
        event.stopPropagation();
        setExpandedSelection(null);
        moreButtonRef.current?.focus();
      }}
    >
      <div className="surface-glass flex flex-col gap-1.5 rounded-card-surface p-1.5 shadow-sidebar-bulk">
        <div className="flex gap-1.5">
          <button
            type="button"
            disabled={settle.disabled}
            onClick={(event) => runAction(event.currentTarget, "settle")}
            className="sidebar-bulk-action min-w-0 flex-5"
          >
            <CheckIcon aria-hidden className="size-3.5 shrink-0" strokeWidth={2.25} />
            <span className="truncate">{settle.label}</span>
          </button>
          {SNOOZE_UI_ENABLED ? (
            <button
              type="button"
              disabled={!snooze || snooze.disabled}
              onClick={(event) => runAction(event.currentTarget, "snooze")}
              className="sidebar-bulk-action min-w-0 flex-6"
            >
              <AlarmClockIcon aria-hidden className="size-3.5 shrink-0" strokeWidth={1.75} />
              <span className="truncate">
                {snooze?.label ?? t.sidebar.bulk.snooze(model.threadKeys.length)}
              </span>
            </button>
          ) : null}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    ref={moreButtonRef}
                    type="button"
                    aria-label={t.sidebar.bulk.moreActions}
                    aria-expanded={expanded}
                    aria-controls={expanded ? panelId : undefined}
                    onClick={() => setExpandedSelection(expanded ? null : selectedThreadKeys)}
                    className="sidebar-bulk-more flex size-8.5 shrink-0 cursor-pointer items-center justify-center rounded-compact-row bg-primary p-0 text-primary-foreground text-shadow-none shadow-primary-edge outline-none hover:bg-message-action-hover active:translate-y-0.25 active:shadow-primary-pressed focus-visible:inset-shadow-focus"
                  />
                }
              >
                <EllipsisIcon aria-hidden className="size-4" />
              </TooltipTrigger>
              <TooltipPopup>{t.sidebar.bulk.moreActions}</TooltipPopup>
            </Tooltip>
          </TooltipProvider>
        </div>
        {expanded ? (
          <div
            id={panelId}
            className="flex max-h-48 flex-col gap-px overflow-y-auto rounded-compact-row bg-input p-1 shadow-well-track"
          >
            {more.map((item) => {
              const Icon = moreActionIcons[item.id as keyof typeof moreActionIcons];
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={item.disabled}
                  onClick={(event) => runAction(event.currentTarget, item.id)}
                  className={cn(
                    "flex h-8 shrink-0 cursor-pointer items-center gap-2.25 rounded-menu-row px-2.5 text-left text-secondary-copy-large text-fg-detail outline-none hover:bg-secondary active:shadow-well-pressed focus-visible:inset-shadow-focus disabled:cursor-not-allowed disabled:text-fg-icon-disabled disabled:hover:bg-transparent",
                    item.destructive && "text-error-foreground hover:bg-error-surface",
                    item.id === "regenerate-title" &&
                      model.regeneratableTitleThreads.length === 0 &&
                      "bg-secondary disabled:text-fg-detail disabled:hover:bg-secondary",
                  )}
                >
                  {Icon ? (
                    <Icon aria-hidden className="size-3.5 shrink-0" strokeWidth={1.75} />
                  ) : null}
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
});
