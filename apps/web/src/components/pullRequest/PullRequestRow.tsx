/** Owns pull request row on the web pull-request surface; host data and agent context remain unchanged. */
import { t } from "~/i18n";
import type { PullRequestAction } from "@t3tools/contracts";
import { sourceControlClients } from "@t3tools/client-runtime/source-control-clients";
import { MessageSquareIcon, SearchIcon } from "lucide-react";
import { PullRequestStackPopover } from "./PullRequestStackPopover";
import type { PullRequestSpeedActionResult } from "./PullRequestSpeedActions";
import { PullRequestListActions } from "./PullRequestListActions";
import { memo, type RefCallback } from "react";

import { cn } from "~/lib/utils";
import { getSourceControlPresentationForKind } from "~/sourceControlPresentation";

import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { Badge } from "../ui/badge";
import { formatRelativeTimeLabel } from "~/timestampFormat";
import { PullRequestChecksPopover } from "./PullRequestChecksPopover";
import type { EnvironmentPullRequestEntry } from "./pullRequestList.logic";
import { openOnHostLabel, showPullRequestLinkContextMenu } from "./pullRequestLinkContextMenu";
import { PullRequestRowBranches } from "./PullRequestListRow";
import {
  PullRequestActorLabel,
  PullRequestConflictGlyph,
  PullRequestStateGlyph,
  resolvePullRequestState,
  PullRequestDiffStat,
  PullRequestLabelChip,
  PullRequestReviewDecisionGlyph,
} from "./pullRequestPresentation";

const LABEL_SLOTS = [
  { overflow: "@xl/pr-row-meta:hidden" },
  { overflow: "@3xl/pr-row-meta:hidden" },
  { overflow: "" },
] as const;

/**
 * Shows up to three labels, with overflow counts following the available meta-line width.
 * @param props Host labels for this request; an empty collection renders nothing.
 * @returns Compact shared label chips without triggering additional host reads.
 */
function PullRequestRowLabels({ labels }: { labels: EnvironmentPullRequestEntry["labels"] }) {
  if (labels.length === 0) return null;
  return (
    <span className="flex min-w-0 items-center gap-1">
      {LABEL_SLOTS.map((slot, index) => {
        const label = labels[index];
        if (!label) return null;
        const remaining = labels.length - index - 1;
        return (
          <PullRequestLabelChip
            key={label.name}
            label={label}
            className={
              index === 0
                ? ""
                : index === 1
                  ? "hidden @xl/pr-row-meta:inline-flex"
                  : "hidden @3xl/pr-row-meta:inline-flex"
            }
          >
            {remaining > 0 ? (
              <span className={cn("shrink-0", slot.overflow)}>+{remaining}</span>
            ) : null}
          </PullRequestLabelChip>
        );
      })}
    </span>
  );
}

/** A list selection names its environment as well as the host-local request. */
export type PullRequestRowTarget = Pick<
  EnvironmentPullRequestEntry,
  "environmentId" | "projectId" | "host" | "repository" | "number"
>;

/**
 * Renders pull request row from the supplied display data and callbacks.
 * @param props Display data, state, options, and interaction callbacks defined by this surface's props type.
 * @returns The rendered surface.
 */
function PullRequestRowImpl({
  entry,
  selected,
  showProjectTitle,
  showProvider,
  environmentLabel,
  matchedElsewhere,
  statsKey,
  statsRef,
  onSelect,
  hostActions,
  onActed,
  closing = false,
  sweeping = false,
  onCloseSweepStart,
}: {
  entry: EnvironmentPullRequestEntry;
  selected: boolean;
  showProjectTitle: boolean;
  showProvider: boolean;
  environmentLabel?: string;
  matchedElsewhere?: boolean;
  /** Used by the list's shared visibility observer to defer optional line-count reads. */
  statsKey?: string;
  statsRef?: RefCallback<HTMLDivElement>;
  onSelect: (entry: PullRequestRowTarget) => void;
  hostActions: ReadonlySet<PullRequestAction>;
  onActed: (result: PullRequestSpeedActionResult) => void;
  closing?: boolean;
  sweeping?: boolean;
  onCloseSweepStart?: (entry: EnvironmentPullRequestEntry, event: PointerEvent) => void;
}) {
  const { Icon, providerName } = getSourceControlPresentationForKind(entry.provider);
  const statePresentation = resolvePullRequestState(entry);
  const hasExtraLine =
    entry.labels.length > 0 || entry.stack !== undefined || matchedElsewhere || environmentLabel;
  return (
    <div
      ref={statsRef}
      data-pull-request-stats-key={statsKey}
      data-pull-request-key={statsKey}
      className={cn(
        // Shared columns reserve the actions' actual width without narrowing the metadata lines.
        "group/pr-page-row relative rounded-card-row pr-list-row pr-list-row-layout",
        hasExtraLine && "pr-list-row-expanded",
        selected
          ? "bg-raise-toolbar shadow-raise-m"
          : "hover:bg-sidebar-row-hover hover:shadow-raise-xs focus-within:bg-sidebar-row-hover focus-within:shadow-raise-xs",
      )}
    >
      <button
        type="button"
        aria-current={selected ? "true" : undefined}
        onClick={() => onSelect(entry)}
        className={cn(
          "col-span-2 col-start-1 row-start-1 grid min-w-0 cursor-pointer grid-cols-subgrid content-start gap-y-1 rounded-card-row px-3 py-2.5 text-left outline-none focus-visible:inset-shadow-focus",
          hasExtraLine ? "min-h-27" : "min-h-21.5",
        )}
      >
        <span className="col-start-1 flex w-full min-w-0 items-center gap-1.5">
          {entry.isDraft && entry.state === "open" ? (
            <Badge size="sm" variant="neutral">
              {t.git.pullRequest.draft}
            </Badge>
          ) : null}
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-body",
              selected ? "font-bold" : "font-semibold",
              entry.isDraft && "text-secondary-label",
            )}
          >
            {entry.title}
          </span>
        </span>
        <span className="col-span-2 flex w-full min-w-0 items-center gap-2 font-mono text-pr-list-meta text-muted-foreground">
          <PullRequestStateGlyph state={entry.state} isDraft={entry.isDraft} className="size-3" />
          {/* The number keeps the request's own copy/open context menu. */}
          <span
            className={cn("shrink-0 tabular-nums", statePresentation.toneClassName)}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void showPullRequestLinkContextMenu({
                url: entry.url,
                openLabel: openOnHostLabel(sourceControlClients.get(entry.provider)),
                position: { x: event.clientX, y: event.clientY },
              });
            }}
          >
            #{entry.number}
          </span>
          {showProvider ? (
            <Tooltip>
              <TooltipTrigger render={<span className="inline-flex shrink-0" />}>
                <Icon aria-label={providerName} className="size-3" />
              </TooltipTrigger>
              <TooltipPopup>{providerName}</TooltipPopup>
            </Tooltip>
          ) : null}
          {showProjectTitle ? <span className="min-w-0 truncate">{entry.repository}</span> : null}
          <PullRequestActorLabel actor={entry.author} variant="avatar" />
          <span className="ml-auto" />
          {entry.checksState === undefined ? null : (
            <PullRequestChecksPopover
              checksState={entry.checksState}
              environmentId={entry.environmentId}
              reference={{
                projectId: entry.projectId,
                repository: entry.repository,
                number: entry.number,
              }}
            />
          )}
          {/* Only a verdict the host actually reports: an approval, a request for changes,
                or a review the branch rules still require. No glyph on the common case of a
                pull request nobody has reviewed, so a row only wears a person when the person
                has said something. */}
          {entry.reviewDecision === undefined ? null : (
            <PullRequestReviewDecisionGlyph decision={entry.reviewDecision} />
          )}
          <Tooltip>
            <TooltipTrigger
              render={<span className="flex shrink-0 items-center gap-0.5" />}
              aria-label={t.git.pullRequest.commentCountUnavailable}
            >
              <MessageSquareIcon aria-hidden className="size-2.75" />
              <span aria-hidden>-</span>
            </TooltipTrigger>
            <TooltipPopup>{t.git.pullRequest.commentCountUnavailable}</TooltipPopup>
          </Tooltip>
          <PullRequestDiffStat
            additions={entry.additions}
            deletions={entry.deletions}
            className="font-mono"
          />
        </span>
        <span className="@container/pr-row-meta col-span-2 flex w-full min-w-0 items-center gap-1.5 text-secondary-copy text-muted-foreground">
          <span className="min-w-0 flex-1">
            <PullRequestRowBranches head={entry.headBranch} base={entry.baseBranch} />
          </span>
          <PullRequestConflictGlyph
            state={entry.state}
            isDraft={entry.isDraft}
            mergeability={entry.mergeability}
            baseBranch={entry.baseBranch}
          />
          {entry.updatedAt ? (
            <span className="shrink-0 whitespace-nowrap font-mono text-pr-list-meta tabular-nums">
              {formatRelativeTimeLabel(entry.updatedAt)}
            </span>
          ) : null}
        </span>
        {hasExtraLine ? (
          <span className="@container/pr-row-meta col-span-2 flex w-full min-w-0 items-center gap-1.5 text-secondary-copy text-muted-foreground">
            {matchedElsewhere ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span className="flex min-w-6 items-center gap-1 overflow-hidden rounded-full border border-border/60 px-1 text-3xs" />
                  }
                >
                  <span className="sr-only">{t.git.pullRequest.matchedInTheDescription}</span>
                  <SearchIcon aria-hidden className="size-3 shrink-0" />
                  <span aria-hidden className="hidden truncate @xs/pr-row-meta:block">
                    {t.git.pullRequest.matchedInTheDescription}
                  </span>
                </TooltipTrigger>
                <TooltipPopup side="top">{t.git.pullRequest.matchedInTheDescription2}</TooltipPopup>
              </Tooltip>
            ) : null}
            {environmentLabel ? (
              <span className="min-w-0 max-w-32 truncate">{environmentLabel}</span>
            ) : null}
            {entry.labels.length > 0 ? <PullRequestRowLabels labels={entry.labels} /> : null}
            {entry.stack ? (
              <PullRequestStackPopover
                environmentId={entry.environmentId}
                reference={{
                  projectId: entry.projectId,
                  host: entry.host,
                  repository: entry.repository,
                  number: entry.number,
                }}
                membership={entry.stack}
                onSelect={(target) =>
                  onSelect({ ...target, host: entry.host, environmentId: entry.environmentId })
                }
              />
            ) : null}
          </span>
        ) : null}
      </button>
      {hostActions.size > 0 ? (
        <PullRequestListActions
          entry={entry}
          hostActions={hostActions}
          onActed={onActed}
          closing={closing}
          sweeping={sweeping}
          {...(onCloseSweepStart ? { onCloseSweepStart } : {})}
        />
      ) : null}
    </div>
  );
}

export const PullRequestRow = memo(PullRequestRowImpl);
