/** Owns pull request speed actions on the web pull-request surface; host data and agent context remain unchanged. */
import { t } from "~/i18n";
import { createContext, use, useLayoutEffect, type ReactNode } from "react";
import { useShortcutModifierState } from "~/shortcutModifierState";
import { useAtomValue } from "@effect/atom-react";
import type { PullRequestAction } from "@t3tools/contracts";
import { pullRequestEnvironment } from "~/state/pullRequests";
import { useUiStateStore } from "~/uiStateStore";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { resolvePullRequestMergeMethod } from "./pullRequestDetail.logic";
import { PullRequestGlyph } from "./pullRequestIcons";
import { pullRequestQuickActions, type EnvironmentPullRequestEntry } from "./pullRequestList.logic";
import {
  usePullRequestActionRunner,
  usePullRequestDefaultMergeMethodResolver,
} from "./usePullRequestActions";

type PullRequestSpeedActionEntry = Pick<
  EnvironmentPullRequestEntry,
  "environmentId" | "projectId" | "host" | "repository" | "number" | "state" | "isDraft"
> & { readonly stack?: object | undefined };

export interface PullRequestSpeedActionResult<Entry = EnvironmentPullRequestEntry> {
  readonly entry: Entry;
  readonly action: PullRequestAction;
}

/** No detail or stack reads until a merge is clicked, even on a long list.
 * @param props Display data, state, options, and interaction callbacks defined by this surface's props type.
 * @returns The rendered surface.
 */
export function PullRequestSpeedActions<Entry extends PullRequestSpeedActionEntry>({
  entry,
  hostActions,
  onActed,
  closing = false,
  sweeping = false,
  onCloseSweepStart,
  onPendingChange,
}: {
  entry: Entry;
  hostActions: ReadonlySet<PullRequestAction>;
  onActed?: (result: PullRequestSpeedActionResult<Entry>) => void;
  closing?: boolean;
  sweeping?: boolean;
  onCloseSweepStart?: (entry: Entry, event: PointerEvent) => void;
  /** Reports rendered pending actions before paint; clears the report on unmount. */
  onPendingChange?: (pending: boolean) => void;
}) {
  const canWrite = useAtomValue(
    pullRequestEnvironment.runAction.permissionAtom(entry.environmentId),
  );
  const resolveProjectDefault = usePullRequestDefaultMergeMethodResolver(
    entry.environmentId,
    entry.projectId,
  );
  const reference = {
    projectId: entry.projectId,
    host: entry.host,
    repository: entry.repository,
    number: entry.number,
  };
  const { actionPending, perform } = usePullRequestActionRunner({
    environmentId: entry.environmentId,
    reference,
    onSuccess: (action) => onActed?.({ entry, action }),
    resolveMergeMethod: (detail) => {
      const allowed = detail.capabilities.mergeMethods.filter(
        (method) => detail.mergeCapabilities[method],
      );
      if (allowed.length === 0)
        throw new Error(t.git.pullRequest.noMergeMethodIsAvailableForThisRepository);
      return resolvePullRequestMergeMethod(
        allowed,
        null,
        resolveProjectDefault(),
        useUiStateStore.getState().pullRequestMergeMethod,
      );
    },
  });
  const actions = pullRequestQuickActions(entry, hostActions);
  const busy = actionPending || closing || sweeping;
  const pending = actions.length > 0 && (actionPending || closing);
  useLayoutEffect(() => {
    onPendingChange?.(pending);
    return () => onPendingChange?.(false);
  }, [onPendingChange, pending]);
  if (actions.length === 0) return null;
  return (
    <SpeedModeGroup
      busy={busy}
      pending={pending}
      label={t.git.pullRequest.quickActions(entry.number)}
    >
      {actions.map((action) => {
        const label = ACTIONS[action].label;
        const Icon = ACTIONS[action].Icon;
        return (
          <Tooltip key={action}>
            <TooltipTrigger
              render={
                <Button
                  variant={action === "close" ? "destructive-outline" : "outline"}
                  size="xs"
                  disabled={!canWrite || busy || (action === "merge" && entry.stack !== undefined)}
                  aria-label={`${label} #${entry.number}`}
                  onClick={() => void perform(action)}
                  onPointerDown={(event) => {
                    if (action !== "close" || !event.isPrimary || event.button !== 0) return;
                    event.stopPropagation();
                    onCloseSweepStart?.(entry, event.nativeEvent);
                  }}
                />
              }
            >
              {busy ? <Spinner size="xs" /> : <Icon aria-hidden className="size-3" />}
              {label}
            </TooltipTrigger>
            <TooltipPopup>
              {action === "merge" && entry.stack
                ? t.git.pullRequest.openThisPullRequestToMergeItsStack
                : action === "close" && onCloseSweepStart
                  ? t.git.pullRequest.closeImmediatelyOrDragAcrossRowsToCloseSeveral
                  : t.git.pullRequest.immediately(label)}
            </TooltipPopup>
          </Tooltip>
        );
      })}
    </SpeedModeGroup>
  );
}

/**
 * Whether Shift is held, as context rather than a row prop: a Shift press then re-renders each
 * row's action group, not the rows or their buttons, in one commit.
 */
export const PullRequestSpeedModeContext = createContext(false);

/** Tracks Shift for the quick actions below it. */
export function PullRequestSpeedModeProvider({ children }: { children: ReactNode }) {
  const modifiers = useShortcutModifierState(true);
  const speedMode =
    modifiers.shiftKey && !modifiers.metaKey && !modifiers.ctrlKey && !modifiers.altKey;
  return <PullRequestSpeedModeContext value={speedMode}>{children}</PullRequestSpeedModeContext>;
}

/**
 * Subscribes at the visibility wrapper so Shift does not recreate its supplied action buttons.
 * @param props Busy state keeps the group visible; pending marks ongoing actions, label names the
 * accessible group, and children are the caller-owned buttons.
 * @returns The action wrapper, visible while Shift is held or an action remains busy.
 */
function SpeedModeGroup({
  busy,
  pending,
  label,
  children,
}: {
  busy: boolean;
  pending: boolean;
  label: string;
  children: ReactNode;
}) {
  const speedMode = use(PullRequestSpeedModeContext);
  return (
    <div
      className="shrink-0 items-center gap-1 pr-3"
      style={{ display: speedMode || busy ? "flex" : "none" }}
      role="group"
      aria-label={label}
      data-pull-request-action-pending={pending}
    >
      {children}
    </div>
  );
}

const ACTIONS = {
  close: { label: t.git.pullRequest.close, Icon: PullRequestGlyph.closed },
  merge: { label: t.git.pullRequest.merge, Icon: PullRequestGlyph.merged },
  ready: { label: t.git.pullRequest.readyForReview, Icon: PullRequestGlyph.pullRequest },
  reopen: { label: t.git.pullRequest.reopen, Icon: PullRequestGlyph.reopen },
} as const;
