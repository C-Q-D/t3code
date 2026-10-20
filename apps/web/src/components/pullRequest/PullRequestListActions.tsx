/** List-only quick actions preserve host permissions and the existing close-sweep gesture. */
import { useAtomValue } from "@effect/atom-react";
import type { PullRequestAction } from "@t3tools/contracts";
import { XIcon } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";

import { t } from "~/i18n";
import { cn } from "~/lib/utils";
import { pullRequestEnvironment } from "~/state/pullRequests";
import { useUiStateStore } from "~/uiStateStore";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { resolvePullRequestMergeMethod } from "./pullRequestDetail.logic";
import { PullRequestGlyph } from "./pullRequestIcons";
import { pullRequestQuickActions, type EnvironmentPullRequestEntry } from "./pullRequestList.logic";
import type { PullRequestSpeedActionResult } from "./PullRequestSpeedActions";
import {
  usePullRequestActionRunner,
  usePullRequestDefaultMergeMethodResolver,
} from "./usePullRequestActions";

/**
 * Show L4's 26px hover close control; speed mode keeps every existing supported action.
 * @param props Host capabilities, current row and callbacks used by the existing list action flow.
 * @returns The action tray, or null when this mode offers no actions; shared hooks own writes.
 */
export function PullRequestListActions({
  entry,
  hostActions,
  speedMode,
  onActed,
  closing,
  sweeping,
  onCloseSweepStart,
}: {
  entry: EnvironmentPullRequestEntry;
  hostActions: ReadonlySet<PullRequestAction>;
  speedMode: boolean;
  onActed: (result: PullRequestSpeedActionResult) => void;
  closing: boolean;
  sweeping: boolean;
  onCloseSweepStart?: (entry: EnvironmentPullRequestEntry, event: PointerEvent) => void;
}) {
  const canWrite = useAtomValue(
    pullRequestEnvironment.runAction.permissionAtom(entry.environmentId),
  );
  const resolveProjectDefault = usePullRequestDefaultMergeMethodResolver(
    entry.environmentId,
    entry.projectId,
  );
  const { actionPending, perform } = usePullRequestActionRunner({
    environmentId: entry.environmentId,
    reference: {
      projectId: entry.projectId,
      host: entry.host,
      repository: entry.repository,
      number: entry.number,
    },
    onSuccess: (action) => onActed({ entry, action }),
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
  const busy = actionPending || closing || sweeping;
  const actions = pullRequestQuickActions(entry, hostActions).filter(
    (action) => speedMode || busy || action === "close",
  );
  if (actions.length === 0) return null;
  return (
    <div
      className={cn(
        "pr-list-actions col-start-2 row-start-1 ml-1.5 mr-2 mt-2 hidden self-start rounded-full bg-secondary group-hover/pr-page-row:flex group-focus-within/pr-page-row:flex",
        speedMode && "flex mt-1.25",
      )}
      data-pull-request-action-pending={busy}
    >
      <div
        className="flex items-center gap-1"
        role="group"
        aria-label={t.git.pullRequest.quickActions(entry.number)}
      >
        {actions.map((action) => {
          const { label, Icon } = LIST_ACTIONS[action];
          const props = {
            disabled: !canWrite || busy || (action === "merge" && entry.stack !== undefined),
            "aria-label": `${label} #${entry.number}`,
            onClick: () => void perform(action),
            onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
              if (action !== "close" || !event.isPrimary || event.button !== 0) return;
              event.stopPropagation();
              onCloseSweepStart?.(entry, event.nativeEvent);
            },
          };
          return (
            <Tooltip key={action}>
              <TooltipTrigger
                render={
                  speedMode ? (
                    <Button
                      variant={action === "close" ? "destructive-outline" : "outline"}
                      size="md"
                      {...props}
                    />
                  ) : (
                    <button
                      type="button"
                      className="flex size-6.5 items-center justify-center rounded-full bg-accent outline-none hover:bg-pr-filter-open focus-visible:inset-shadow-focus disabled:cursor-not-allowed disabled:text-fg-control-disabled"
                      {...props}
                    />
                  )
                }
              >
                {busy ? <Spinner size="xs" /> : <Icon aria-hidden className="size-3.75" />}
                {speedMode ? label : null}
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
      </div>
    </div>
  );
}

const LIST_ACTIONS = {
  close: { label: t.git.pullRequest.close, Icon: XIcon },
  merge: { label: t.git.pullRequest.merge, Icon: PullRequestGlyph.merged },
  ready: { label: t.git.pullRequest.readyForReview, Icon: PullRequestGlyph.pullRequest },
  reopen: { label: t.git.pullRequest.reopen, Icon: PullRequestGlyph.reopen },
} as const;
