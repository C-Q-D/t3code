/** Owns pull request checks popover on the web pull-request surface; host data and agent context remain unchanged. */
import { t } from "~/i18n";
import type * as React from "react";
import type {
  EnvironmentId,
  PullRequestCheck,
  PullRequestChecksState,
  PullRequestRef,
  ScopedThreadRef,
} from "@t3tools/contracts";
import { useState } from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";

import { useOpenLink } from "~/browser/useOpenLink";
import { cn } from "~/lib/utils";
import { pullRequestEnvironment } from "~/state/pullRequests";
import { useEnvironmentQuery } from "~/state/query";

import { Popover, PopoverTrigger } from "../ui/popover";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { toastManager } from "../ui/toast";
import { keyedPullRequestChecks } from "./pullRequestCheckKeys";
import { groupPullRequestChecks } from "./pullRequestDetail.logic";
import {
  PullRequestCheckStatusIcon,
  pullRequestCheckStatusLabel,
  pullRequestChecksStatePresentation,
  summarizePullRequestChecks,
} from "./pullRequestPresentation";

/**
 * The checks behind the rollup, for a row that only carries the rollup. Mounted by the popup, so
 * the read starts when somebody opens it rather than once per row of a listing — the detail read
 * is a request per pull request, and a page of them at rest would be a hundred.
 * @param props Display data, state, options, and interaction callbacks defined by this surface's props type.
 * @returns The rendered surface.
 */
function LazyChecksBody({
  environmentId,
  reference,
  threadRef,
}: {
  environmentId: EnvironmentId;
  reference: PullRequestRef;
  threadRef: ScopedThreadRef | null;
}) {
  const detailQuery = useEnvironmentQuery(
    pullRequestEnvironment.detail({ environmentId, input: reference }),
  );
  if (detailQuery.error !== null) {
    return <p className="text-muted-foreground text-secondary-copy-medium">{detailQuery.error}</p>;
  }
  if (detailQuery.data === null) {
    return (
      <p className="text-muted-foreground text-secondary-copy-medium">
        {detailQuery.isPending
          ? t.git.pullRequest.loadingChecks
          : t.git.pullRequest.noChecksReported}
      </p>
    );
  }
  return <ChecksBody checks={detailQuery.data.checks} threadRef={threadRef} />;
}

/**
 * Renders checks body from the supplied display data and callbacks.
 * @param props Display data, state, options, and interaction callbacks defined by this surface's props type.
 * @returns The rendered surface.
 */
function ChecksBody({
  checks,
  threadRef,
}: {
  checks: ReadonlyArray<PullRequestCheck>;
  threadRef: ScopedThreadRef | null;
}) {
  const openLink = useOpenLink(threadRef);
  const [showAll, setShowAll] = useState(false);
  const { attention, running, completed } = groupPullRequestChecks(checks);
  const canCollapse = attention.length + running.length > 0 && completed.length > 0;
  const visibleChecks = [...attention, ...running, ...(showAll || !canCollapse ? completed : [])];
  if (checks.length === 0) {
    return (
      <p className="text-muted-foreground text-secondary-copy-medium">
        {t.git.pullRequest.noChecksReported}
      </p>
    );
  }
  return (
    <>
      <ScrollArea className="max-h-64">
        <ul className="flex flex-col gap-0.5 pr-2">
          {keyedPullRequestChecks(visibleChecks).map(({ check, key }) => (
            <li
              key={key}
              className="flex min-h-7.5 items-center gap-2 px-2 text-secondary-copy-medium"
            >
              <PullRequestCheckStatusIcon status={check.status} />
              <Tooltip>
                <TooltipTrigger
                  render={
                    check.url === null ? (
                      <span className="min-w-0 flex-1 truncate">{check.name}</span>
                    ) : (
                      <button
                        type="button"
                        aria-label={`${t.git.pullRequest.details}: ${check.name}`}
                        className="min-w-0 flex-1 cursor-pointer truncate rounded-menu-row text-left outline-none hover:underline focus-visible:inset-shadow-focus"
                        onClick={() => {
                          if (!check.url) return;
                          void openLink(check.url).catch((error: unknown) => {
                            console.error(error);
                            toastManager.add({
                              type: "error",
                              title: t.git.pullRequest.unableToOpenCheckDetails,
                            });
                          });
                        }}
                      >
                        {check.name}
                      </button>
                    )
                  }
                />
                <TooltipPopup side="top">{check.description ?? check.name}</TooltipPopup>
              </Tooltip>
              <span className="shrink-0 font-mono text-meta whitespace-nowrap text-muted-foreground">
                {pullRequestCheckStatusLabel(check)}
              </span>
            </li>
          ))}
        </ul>
      </ScrollArea>
      {canCollapse ? (
        <Button
          variant="ghost"
          size="md"
          aria-expanded={showAll}
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? t.git.pullRequest.showLess : t.git.pullRequest.showAll}
        </Button>
      ) : null}
    </>
  );
}

/**
 * The checks indicator and what it opens, in both places a change request is shown: a listing
 * row, which knows only the rollup, and the detail header, which is already holding every check.
 *
 * `checks` decides between the two. Given them, nothing is read; without them, the popup reads
 * the detail itself, which is why the row must also say which environment it came from.
 * @param props Display data, state, options, and interaction callbacks defined by this surface's props type.
 * @returns The rendered surface.
 */
export function PullRequestChecksPopover({
  checksState,
  checks,
  stale = false,
  environmentId,
  reference,
  threadRef = null,
  variant = "icon",
  className,
  render,
}: {
  checksState: PullRequestChecksState;
  checks?: ReadonlyArray<PullRequestCheck>;
  stale?: boolean;
  environmentId?: EnvironmentId;
  reference?: PullRequestRef;
  threadRef?: ScopedThreadRef | null;
  variant?: "icon" | "count";
  className?: string;
  render?: React.ReactElement;
}) {
  const presentation = pullRequestChecksStatePresentation(checksState);
  const incompleteCount =
    checks?.filter((check) => check.status === "pending" || check.status === "action-required")
      .length ?? 0;
  const failedCount =
    checks?.filter((check) => check.status === "failure" || check.status === "cancelled").length ??
    0;
  const summary = checks === undefined || stale ? null : summarizePullRequestChecks(checks);
  return (
    <Popover>
      <PopoverTrigger
        nativeButton={variant === "count"}
        aria-label={
          variant === "count"
            ? t.git.pullRequest.openChecks(summary ?? presentation.label)
            : t.git.pullRequest.checksLabel(presentation.label)
        }
        render={
          variant === "count" ? (
            (render ?? <Button variant="ghost" size="sm" className={className} />)
          ) : (
            <span
              role="button"
              tabIndex={0}
              className={cn("inline-flex shrink-0 cursor-pointer items-center", className)}
            />
          )
        }
        onClick={(event) => event.stopPropagation()}
      >
        <presentation.Icon aria-hidden className={cn("size-3.5", presentation.toneClassName)} />
        {variant === "count" ? (
          <>
            {checks !== undefined && incompleteCount > 0 ? (
              <span className="tabular-nums">
                {checks.length - incompleteCount}/{checks.length} checks
              </span>
            ) : failedCount > 0 ? (
              <span className="tabular-nums">
                {failedCount}
                {t.git.pullRequest.failed}
              </span>
            ) : null}
          </>
        ) : null}
      </PopoverTrigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          align="start"
          side="bottom"
          sideOffset={4}
          collisionPadding={16}
          className="z-130 max-w-full"
        >
          <PopoverPrimitive.Popup className="dropdown-glass pr-popup flex w-62.5 max-w-full flex-col rounded-pr-list-popup p-2 outline-none">
            <p className="sr-only">{presentation.label}</p>
            {summary === null ? null : <p className="sr-only">{summary}</p>}
            {stale ? (
              <p className="text-muted-foreground text-secondary-copy-medium">
                {t.git.pullRequest.checkDetailsAreOutOfDateRefreshThePullRequestToUpdateThem}
              </p>
            ) : checks !== undefined ? (
              <ChecksBody checks={checks} threadRef={threadRef} />
            ) : environmentId !== undefined && reference !== undefined ? (
              <LazyChecksBody
                environmentId={environmentId}
                reference={reference}
                threadRef={threadRef}
              />
            ) : null}
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </Popover>
  );
}
