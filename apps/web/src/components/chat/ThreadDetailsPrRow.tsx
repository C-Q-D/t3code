/** Presents an F1 PR well and watch explanation while retaining existing host actions and gates. */
import { t } from "~/i18n";
import { ThreadDetailsControl } from "./ThreadDetailsControl";
import { PullRequestGlyph } from "../pullRequest/pullRequestIcons";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import type { EnvironmentId, ProjectId, PullRequestRef } from "@t3tools/contracts";
import { sourceControlRepositorySelector } from "@t3tools/shared/sourceControl";
import { EyeIcon, FileDiffIcon, GitBranchIcon, TriangleAlertIcon } from "lucide-react";
import { selectEnvironmentQueryData } from "@t3tools/client-runtime/state/runtime";
import { AsyncResult } from "effect/reactivity";
import { useState, type MouseEvent as ReactMouseEvent } from "react";

import { useLiveRefresh } from "~/hooks/useLiveRefresh";
import { usePullRequestChecksRefresh } from "~/hooks/usePullRequestChecksRefresh";
import { cn } from "~/lib/utils";
import { useServerConfigs } from "~/state/entities";
import { pullRequestEnvironment } from "~/state/pullRequests";
import { useUiStateStore } from "~/uiStateStore";
import {
  useEnvironmentQueryIsNewer,
  useEnvironmentQueryRefresh,
  useEnvironmentQuerySelector,
} from "~/state/query";

import {
  buildFixFindingsHandoff,
  buildResolveConflictsPrompt,
  classifyPullRequestChecks,
  resolvePullRequestDetailChecks,
  describePullRequestChecks,
  isPullRequestConflicting,
  resolvePullRequestMergeMethod,
  allowedPullRequestMergeMethods,
  resolveThreadPanelPullRequestAction,
} from "../pullRequest/pullRequestDetail.logic";
import { PullRequestChecksPopover } from "../pullRequest/PullRequestChecksPopover";
import {
  pullRequestChecksState,
  PullRequestCheckStatusIcon,
  PullRequestDiffStat,
  resolvePullRequestState,
} from "../pullRequest/pullRequestPresentation";
import {
  usePullRequestActionRunner,
  usePullRequestDefaultMergeMethodResolver,
  usePullRequestHandoffs,
} from "../pullRequest/usePullRequestActions";
import { type PrStatusIndicator, type ThreadPr } from "../ThreadStatusIndicators";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

// A server without checks for this pull request answers null; polling it again finds nothing new.
const isSettledWithoutChecks = (result: AsyncResult.AsyncResult<unknown, unknown>) =>
  result._tag === "Success" && result.value === null;

/**
 * Renders one pull-request row with status and permission-aware host actions.
 * @param props - Required environmentId, PR data, number, labels, and open callback. reference may
 * be null or omitted; status and project may be null when unavailable. Optional onActed refreshes
 * stale status after a mutation. Watch callbacks start/stop the existing command; isWatching
 * preserves persisted watch presentation when mutation permission is unavailable.
 * @returns The pull-request row element; never null. Host actions execute only through user
 * interaction.
 */
export function ThreadDetailsPrRow({
  environmentId,
  pr,
  number,
  reference: linkedReference,
  status,
  project,
  label,
  openAriaLabel,
  onOpen,
  onActed,
  onStopWatching,
  onStartWatching,
  isWatching,
}: {
  environmentId: EnvironmentId;
  pr: ThreadPr;
  number: number;
  reference?: Pick<PullRequestRef, "host" | "repository" | "number"> | null;
  status: PrStatusIndicator | null;
  project: EnvironmentProject | null;
  label: string;
  openAriaLabel: string;
  onOpen: (event: ReactMouseEvent<HTMLElement>) => void;
  onActed?: () => void;
  onStopWatching?: (() => void) | undefined;
  /** Starts the existing thread watch when supported and permitted by the destination server. */
  onStartWatching?: (() => void) | undefined;
  /** Persisted watch state remains visible even when the current connection cannot mutate it. */
  isWatching?: boolean | undefined;
}) {
  const serverConfigs = useServerConfigs();
  const supportsPullRequests =
    serverConfigs.get(environmentId)?.environment.capabilities.pullRequests === true;
  const repository = sourceControlRepositorySelector(project?.repositoryIdentity);
  const reference: PullRequestRef | null =
    supportsPullRequests && project !== null
      ? linkedReference
        ? { ...linkedReference, projectId: project.id as ProjectId }
        : repository !== null
          ? { projectId: project.id as ProjectId, repository, number }
          : null
      : null;
  const detailAtom =
    reference === null
      ? null
      : pullRequestEnvironment.detail({
          environmentId,
          input: { ...reference, allowStale: false },
        });
  // Read the queries part by part: every poll publishes a new result (a new
  // timestamp, `waiting` on and off) even when nothing in it changed.
  const detailData = useEnvironmentQuerySelector(detailAtom, selectEnvironmentQueryData);
  const detailQuery = useEnvironmentQueryRefresh(detailAtom);
  const supportsChecks =
    serverConfigs.get(environmentId)?.environment.capabilities.pullRequestChecks === true;
  const checksAtom =
    supportsChecks && reference !== null && detailData !== null
      ? pullRequestEnvironment.checks({ environmentId, input: reference })
      : null;
  const checksData = useEnvironmentQuerySelector(checksAtom, selectEnvironmentQueryData);
  const checksSettledEmpty = useEnvironmentQuerySelector(checksAtom, isSettledWithoutChecks);
  const checksQuery = useEnvironmentQueryRefresh(checksAtom);
  const checksAreNewer = useEnvironmentQueryIsNewer(checksAtom, detailAtom);
  const detail = resolvePullRequestDetailChecks(detailData, checksData, checksAreNewer);
  const open = reference !== null && (detail?.state ?? pr?.state) === "open";
  const refreshKey = `${environmentId}:${project?.id}:${reference?.host}:${reference?.repository}:${number}`;
  useLiveRefresh(
    () => {
      if (!detailQuery.isPending()) detailQuery.refresh();
    },
    { enabled: open, key: `workspace-pr:${refreshKey}`, intervalMs: 10 * 60_000 },
  );
  usePullRequestChecksRefresh({
    refresh: () => {
      if (!checksQuery.isPending() && !detailQuery.isPending()) checksQuery.refresh();
    },
    enabled: open && supportsChecks && !checksSettledEmpty,
    key: `workspace-pr-checks:${refreshKey}`,
    checks: detail?.checks ?? [],
  });

  const { actionPending, perform } = usePullRequestActionRunner({
    environmentId,
    reference,
    onSuccess: () => {
      detailQuery.refresh();
      checksQuery.refresh();
      onActed?.();
    },
  });
  const { handoff, startHandoff } = usePullRequestHandoffs({ environmentId, detail });
  const lastSelectedMergeMethod = useUiStateStore((state) => state.pullRequestMergeMethod);
  const resolveProjectDefaultMergeMethod = usePullRequestDefaultMergeMethodResolver(
    environmentId,
    (project?.id as ProjectId | undefined) ?? null,
  );
  const [confirmingMerge, setConfirmingMerge] = useState(false);

  const rowAction = resolveThreadPanelPullRequestAction(detail);
  if (confirmingMerge && rowAction !== "merge") {
    setConfirmingMerge(false);
  }
  const conflicting = isPullRequestConflicting(detail);
  const checksState = detail === null ? "none" : classifyPullRequestChecks(detail.checks);
  const checksRollup = detail === null ? null : pullRequestChecksState(detail.checks);
  const selectedMergeMethod = resolvePullRequestMergeMethod(
    allowedPullRequestMergeMethods(detail),
    null,
    resolveProjectDefaultMergeMethod(),
    lastSelectedMergeMethod,
  );

  const startResolveConflicts = () => {
    if (detail === null) return;
    void startHandoff("conflicts", {
      prompt: buildResolveConflictsPrompt({
        number: detail.number,
        url: detail.url,
        headBranch: detail.headBranch,
        baseBranch: detail.baseBranch,
      }),
    });
  };

  const startFixChecks = () => {
    if (detail === null) return;
    // The details card fetches no conversation, so the handoff carries the failing checks alone;
    // review threads keep arriving through the full panel's richer version of this action.
    void startHandoff(
      "findings",
      buildFixFindingsHandoff({
        number: detail.number,
        title: detail.title,
        url: detail.url,
        headBranch: detail.headBranch,
        baseBranch: detail.baseBranch,
        reviewThreads: [],
        comments: [],
        checks: detail.checks,
        commentsTruncated: false,
      }),
    );
  };

  const statePresentation =
    detail === null
      ? null
      : resolvePullRequestState({
          state: detail.state,
          isDraft: detail.isDraft,
        });
  // Everything the host reported, at a glance. The rows stay short; the tooltip is where the
  // rest of the answer lives — styled like the sidebar's thread tooltip, title above icon-led
  // detail rows, so the two read as one family.
  const rowTooltip =
    detail === null || statePresentation === null ? (
      <TooltipPopup side="top">
        {status?.tooltip ?? t.chat.details.pullRequest(number)}
      </TooltipPopup>
    ) : (
      <TooltipPopup
        side="top"
        align="start"
        sideOffset={4}
        variant="glass"
        className="max-w-80 text-left whitespace-normal"
      >
        <div className="flex min-w-0 max-w-80 flex-col gap-2 px-1 py-2">
          <div className="flex min-w-0 items-baseline gap-1.5 text-xs leading-none">
            <span className="min-w-0 truncate font-medium text-foreground">{detail.title}</span>
            <span className="shrink-0 text-muted-foreground">#{detail.number}</span>
          </div>
          <div className="grid gap-1.5 pl-0.5 text-xs text-muted-foreground">
            <div className="flex min-w-0 items-center gap-2">
              <statePresentation.Icon
                aria-hidden
                className={cn("size-3 shrink-0", statePresentation.toneClassName)}
              />
              <div className="min-w-0 truncate text-foreground/75">{statePresentation.label}</div>
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <GitBranchIcon className="size-3 shrink-0 stroke-muted-foreground" />
              <div className="min-w-0 truncate text-foreground/75">
                {detail.baseBranch} ← {detail.headBranch}
              </div>
            </div>
            {detail.state === "open" && checksState !== "none" ? (
              <div className="flex min-w-0 items-center gap-2">
                <PullRequestCheckStatusIcon
                  status={
                    checksState === "failing"
                      ? "failure"
                      : checksState === "pending"
                        ? "pending"
                        : "success"
                  }
                />
                <div className="min-w-0 truncate text-foreground/75">
                  {describePullRequestChecks(detail.checks)}
                </div>
              </div>
            ) : null}
            {detail.isDraft && conflicting ? (
              <div className="flex min-w-0 items-start gap-2 text-destructive">
                <TriangleAlertIcon aria-hidden className="mt-0.5 size-3 shrink-0 stroke-current" />
                <div className="min-w-0 flex-1 wrap-break-word leading-5">
                  {t.chat.details.conflicts(detail.baseBranch)}
                </div>
              </div>
            ) : null}
            <div className="flex min-w-0 items-center gap-2">
              <FileDiffIcon className="size-3 shrink-0 stroke-muted-foreground" />
              <div className="min-w-0 flex items-baseline gap-1 truncate text-foreground/75">
                {detail.changedFiles.toLocaleString()}{" "}
                {t.chat.details.fileNoun(detail.changedFiles)}
                <PullRequestDiffStat additions={detail.additions} deletions={detail.deletions} />
              </div>
            </div>
          </div>
        </div>
      </TooltipPopup>
    );

  const watching =
    (isWatching ?? onStopWatching !== undefined) &&
    (detail?.state ?? pr?.state ?? "open") === "open";
  const isOpen = (detail?.state ?? pr?.state ?? "open") === "open";
  const busy = actionPending || handoff !== null;
  const showChecks = detail !== null && checksRollup !== null && !conflicting && !detail.isDraft;
  const badgeVariant =
    (detail?.state ?? pr?.state) === "merged"
      ? "accent"
      : (detail?.state ?? pr?.state) === "closed"
        ? "danger"
        : (detail?.isDraft ?? pr?.isDraft)
          ? "neutral"
          : "success";
  const PrIcon = statePresentation?.Icon ?? PullRequestGlyph.pullRequest;

  return (
    <>
      <div className="flex min-w-0 flex-col gap-2 rounded-card-row bg-thread-details-well p-2.5 shadow-well-control">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <Tooltip>
            <TooltipTrigger
              render={
                <ThreadDetailsControl
                  part="icon"
                  className="h-auto w-auto"
                  aria-label={openAriaLabel}
                  onClick={onOpen}
                  onAuxClick={onOpen}
                />
              }
            >
              <Badge variant={badgeVariant} size="lg">
                <PrIcon aria-hidden />
                {t.chat.details.prLabel(number)}
              </Badge>
            </TooltipTrigger>
            {rowTooltip}
          </Tooltip>
          {detail ? (
            <PullRequestDiffStat additions={detail.additions} deletions={detail.deletions} />
          ) : null}
        </div>
        {conflicting && detail ? (
          <div className="flex items-center gap-1.5 text-secondary-copy text-thread-details-conflict">
            <TriangleAlertIcon aria-hidden className="size-3.25 shrink-0" />
            {t.chat.details.conflicts(detail.baseBranch)}
          </div>
        ) : null}
        {detail === null ? (
          <span className="truncate text-secondary-copy text-secondary-label">{label}</span>
        ) : null}
        {showChecks && checksRollup !== null && detail ? (
          <PullRequestChecksPopover
            checksState={checksRollup}
            checks={detail.checks}
            variant="count"
            render={<ThreadDetailsControl part="meta" />}
          />
        ) : null}
        {isOpen ? (
          <div className="flex flex-wrap gap-1.5">
            {conflicting ? (
              <ThreadDetailsControl
                part="meta"
                tone={rowAction === "resolve" ? "primary" : "default"}
                disabled={busy}
                onClick={startResolveConflicts}
              >
                {handoff === "conflicts" ? t.chat.details.preparing : t.chat.details.resolve}
              </ThreadDetailsControl>
            ) : null}
            {conflicting || rowAction === "fix" ? (
              <ThreadDetailsControl
                part="meta"
                tone={rowAction === "fix" ? "primary" : "default"}
                disabled={busy || checksState !== "failing"}
                onClick={startFixChecks}
              >
                {handoff === "findings" ? t.chat.details.preparing : t.chat.details.fix}
              </ThreadDetailsControl>
            ) : null}
            {rowAction === "ready" ? (
              <ThreadDetailsControl
                part="meta"
                tone="primary"
                disabled={busy}
                onClick={() => void perform("ready")}
              >
                {actionPending ? t.chat.details.marking : t.chat.details.ready}
              </ThreadDetailsControl>
            ) : null}
            {detail ? (
              <ThreadDetailsControl
                part="meta"
                tone={rowAction === "merge" ? "primary" : "default"}
                disabled={busy || rowAction !== "merge"}
                onClick={() => setConfirmingMerge(true)}
              >
                {actionPending && rowAction === "merge"
                  ? t.chat.details.merging
                  : t.chat.details.merge}
              </ThreadDetailsControl>
            ) : null}
            <ThreadDetailsControl
              part="watch"
              aria-label={
                watching
                  ? t.chat.details.stopWatching(number)
                  : t.chat.details.startWatching(number)
              }
              aria-pressed={watching}
              disabled={busy || (watching ? !onStopWatching : !onStartWatching)}
              onClick={watching ? onStopWatching : onStartWatching}
            >
              <EyeIcon aria-hidden className="size-3.25" />
              {t.chat.details.watch}
            </ThreadDetailsControl>
          </div>
        ) : null}
      </div>
      {watching ? (
        <button
          type="button"
          aria-label={t.chat.details.stopWatching(number)}
          onClick={onStopWatching}
          disabled={!onStopWatching}
          className="w-full cursor-pointer rounded-thread-details-hint bg-primary px-3 py-2.5 text-left text-secondary-copy leading-relaxed text-primary-foreground text-shadow-none shadow-primary-toast focus-visible:inset-shadow-focus"
        >
          {t.chat.details.watchingHint}
        </button>
      ) : null}
      {rowAction === "merge" ? (
        <AlertDialog open={confirmingMerge} onOpenChange={(open) => setConfirmingMerge(open)}>
          <AlertDialogPopup>
            <AlertDialogHeader>
              <AlertDialogTitle>{t.chat.details.mergePullRequest}</AlertDialogTitle>
              <AlertDialogDescription>
                {t.chat.details.mergeDescription(number, selectedMergeMethod)}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogClose render={<Button variant="outline" size="sm" />}>
                {t.chat.details.cancel}
              </AlertDialogClose>
              <Button
                size="sm"
                disabled={actionPending}
                onClick={() => {
                  setConfirmingMerge(false);
                  void perform("merge", selectedMergeMethod);
                }}
              >
                {t.chat.details.merge}
              </Button>
            </AlertDialogFooter>
          </AlertDialogPopup>
        </AlertDialog>
      ) : null}
    </>
  );
}
