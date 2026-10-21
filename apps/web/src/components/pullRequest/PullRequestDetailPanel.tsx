/** Owns pull request detail panel on the web pull-request surface; host data and agent context remain unchanged. */
import { PixelSparkIcon } from "../icons/PixelLucideIcon";
import { t } from "~/i18n";
import { parseChangeRequestUrl } from "@t3tools/shared/changeRequestUrl";
import { useAtomValue } from "@effect/atom-react";
import { usePullRequestStack } from "~/state/usePullRequestStack";
import { RefreshIcon } from "~/components/ui/refresh-icon";
import {
  scopedThreadKey,
  scopeProjectRef,
  scopeThreadRef,
} from "@t3tools/client-runtime/environment";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import {
  AuthOrchestrationOperateScope,
  AuthSourceControlWriteScope,
  type EnvironmentId,
  type PullRequestAction,
  type PullRequestDetail,
  type PullRequestMergeMethod,
  type PullRequestListEntry,
  type PullRequestUpdateMethod,
  type PullRequestRef,
  type PullRequestReviewGuideStop,
  resolveEnvironmentMachineKind,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import {
  ArrowDownUpIcon,
  ArrowLeftIcon,
  ArrowUpRightIcon,
  CircleDotIcon,
  EyeIcon,
  CopyIcon,
  ChevronDownIcon,
  FileDiffIcon,
  FolderGit2Icon,
  GitBranchIcon,
  GitCommitHorizontalIcon,
  HammerIcon,
  MessageCircleQuestionIcon,
  MessageSquareIcon,
  LinkIcon,
  MoreHorizontalIcon,
  HashIcon,
  PanelRightIcon,
  PencilIcon,
  PlayIcon,
  Undo2Icon,
  Trash2Icon,
  TriangleAlertIcon,
  TerminalIcon,
} from "lucide-react";
import {
  lazy,
  Suspense,
  type MouseEvent as ReactMouseEvent,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { type DraftId, useComposerDraftStore } from "~/composerDraftStore";
import { type PullRequestDetailTab, useRightPanelStore } from "~/rightPanelStore";
import { useEnvironmentSettings } from "~/hooks/useSettings";
import { useNewThreadHandler } from "~/hooks/useHandleNewThread";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { isCommandPaletteOpen } from "~/commandPaletteBus";
import {
  resolveShortcutCommand,
  shortcutLabelForCommand,
  type ShortcutMatchContext,
} from "~/keybindings";
import { primaryServerKeybindingsAtom } from "~/state/server";
import { usePullRequestDefaultMergeMethodResolver } from "./usePullRequestActions";
import { changeRequestRepositoryUrl, gitHubPullRequestBrowserUrl } from "~/lib/openPullRequestLink";
import { usePreparePullRequestThreadAction } from "~/lib/sourceControlActions";
import { cn } from "~/lib/utils";
import { readLocalApi } from "~/localApi";
import type { ReviewCommentContext } from "~/reviewCommentContext";
import { useProjects, useServerConfigs } from "~/state/entities";
import { useEnvironments } from "~/state/environments";
import { useEnvironmentQuery } from "~/state/query";
import { readEnvironmentScope, useEnvironmentScope } from "~/state/session";
import { useLiveRefresh } from "~/hooks/useLiveRefresh";
import {
  pullRequestEnvironment,
  pullRequestListEntryToSummary,
  newestPullRequestSummary,
  usePullRequestTurnRefresh,
  useSharedPullRequestSummary,
} from "~/state/pullRequests";
import { useAtomCommand } from "~/state/use-atom-command";
import { PullRequestStackMenu } from "./PullRequestStackMenu";
import { PullRequestDiffStat } from "./pullRequestPresentation";
import { sourceControlClients } from "@t3tools/client-runtime/source-control-clients";
import { PullRequestThreadLinks } from "./PullRequestThreadLinks";
import { vcsEnvironment } from "~/state/vcs";
import { RelativeTime } from "~/components/RelativeTime";
import { useUiStateStore } from "~/uiStateStore";

import { EnvironmentMachineIcon } from "../EnvironmentMachineIcon";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Group } from "../ui/group";
import { Input } from "../ui/input";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuShortcut,
  MenuTrigger,
} from "../ui/menu";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { MiddleTruncate } from "../ui/middle-truncate";
import {
  PullRequestChecksStatusLine,
  PullRequestDetailHeaderBody,
  PullRequestDetailTabBar,
  PullRequestDetailTitleRow,
} from "./PullRequestDetailLayout";
import { PullRequestDetailGhost, PullRequestTimelineGhost } from "./PullRequestGhosts";
import { PullRequestCopyableCode } from "./PullRequestCopyableCode";
import { PullRequestActivityUnavailableState } from "./PullRequestActivityUnavailableState";
import { DiffPanelLoadingState } from "../DiffPanelShell";
import { PullRequestsUnavailableState } from "./PullRequestsUnavailableState";
import type { PullRequestAgentSelectionInput } from "./PullRequestCodeTab";
import { openOnHostLabel, showPullRequestLinkContextMenu } from "./pullRequestLinkContextMenu";
import { PullRequestMarkdownContext } from "./PullRequestMarkdown";
import { PullRequestComposer } from "./PullRequestComposer";
import { PullRequestSummaryTab } from "./PullRequestSummaryTab";
import { PullRequestTimelineTab } from "./PullRequestTimelineTab";
import {
  buildAddSelectionToAgentHandoff,
  buildAskAboutGuideStopHandoff,
  buildAskAboutPullRequestHandoff,
  buildExplainPullRequestHandoff,
  buildFixFindingHandoff,
  buildFixFindingsHandoff,
  buildResolveConflictsPrompt,
  handoffPrompt,
  handoffReviewComments,
  latestPullRequestReviewOutcomes,
  loadingPullRequestCheckoutCommand,
  isPullRequestNotFound,
  isStackedPullRequestBase,
  pullRequestActionNeedsHostRefresh,
  pullRequestCheckoutCommand,
  pullRequestFindingKey,
  pullRequestHandoffLabels,
  PULL_REQUEST_MERGE_METHOD_LABELS,
  checkoutFailureDescription,
  readableFailure,
  readPullRequestDetailSnapshot,
  resolvePullRequestReferenceHost,
  resolveDisplayedPullRequestDetail,
  resolvePullRequestActionGroups,
  allowsSinglePullRequestMerge,
  canDeletePullRequestBranch,
  resolveBaseFreshness,
  resolvePullRequestMergeMethod,
  type PullRequestFinding,
  shouldRefreshPullRequestActivity,
  stripPullRequestHandoffReferences,
  writePullRequestDetailSnapshot,
} from "./pullRequestDetail.logic";
import { canEditPullRequestChangeRequest } from "./pullRequestEditing.logic";
import {
  resolvePickableEnvironments,
  type PickableEnvironment,
} from "./pullRequestProjectAssignment.logic";
import { PullRequestChecksPopover } from "./PullRequestChecksPopover";
import {
  PullRequestActorLabel,
  PullRequestMetaLine,
  PullRequestReviewOutcomeIcon,
  pullRequestChecksState,
  pullRequestChecksStatePresentation,
  pullRequestReviewOutcomeToneClassName,
  resolvePullRequestState,
  summarizePullRequestChecks,
} from "./pullRequestPresentation";
import { PullRequestGlyph } from "./pullRequestIcons";
import { PullRequestGuideTab } from "./PullRequestGuideTab";
import { guideRunKey, useGuideRunStore } from "./guide/guideRunStore";
import { useReviewGuideWriter } from "./guide/useReviewGuideWriter";
import { useInlineActionConfirm } from "./useInlineActionConfirm";

const ACTION_FAILURE_LABELS: Record<PullRequestAction, string> = {
  merge: t.git.pullRequest.couldNotMergeThisPullRequest,
  ready: t.git.pullRequest.couldNotMarkThisReadyForReview,
  draft: t.git.pullRequest.couldNotConvertThisToADraft,
  close: t.git.pullRequest.couldNotCloseThisPullRequest,
  reopen: t.git.pullRequest.couldNotReopenThisPullRequest,
  "update-branch": t.git.pullRequest.couldNotUpdateThisBranch,
  "enable-auto-merge": t.git.pullRequest.couldNotTurnOnAutoMerge,
  "disable-auto-merge": t.git.pullRequest.couldNotTurnOffAutoMerge,
  revert: t.git.pullRequest.couldNotOpenARevertPullRequest,
  "approve-workflows": t.git.pullRequest.couldNotApproveWorkflows,
  get "delete-branch"() {
    return t.git.branchDeletionUi.failed;
  },
};

const ACTION_FAILURE_HINTS: Record<PullRequestAction, string> = {
  merge:
    t.git.pullRequest
      .theHostRefusedTheMergeCheckThatYouHaveWriteAccessThatTheChecksItRequiresHavePassedAnd,
  ready: t.git.pullRequest.theHostRefusedItCheckThatYouHaveWriteAccessToThisRepository,
  draft: t.git.pullRequest.theHostRefusedItCheckThatYouHaveWriteAccessToThisRepository,
  close: t.git.pullRequest.theHostRefusedItCheckThatYouHaveWriteAccessOrThatYouOpenedIt,
  reopen: t.git.pullRequest.theHostRefusedItCheckThatYouHaveWriteAccessAndThatTheBranchStillExists,
  // Said for the merge commit, which is what an update is unless a rebase was asked for. The
  // rebase has its own reasons to fail and its own sentence below.
  "update-branch":
    t.git.pullRequest
      .theHostRefusedItCheckThatYouHaveWriteAccessToTheBranchOneFromAForkAlsoNeedsItsAuthorT,
  // The one refusal that is usually a repository setting rather than anything about this branch:
  // GitHub will not arm an auto-merge at all unless the repository has the feature switched on.
  "enable-auto-merge":
    t.git.pullRequest
      .theHostRefusedItCheckThatThisRepositoryAllowsAutoMergeThatYouHaveWriteAccessAndThatTh,
  "disable-auto-merge":
    t.git.pullRequest
      .theHostRefusedItCheckThatYouHaveWriteAccessAndThatTheMergeHasNotAlreadyHappened,
  revert:
    t.git.pullRequest
      .theHostRefusedItCheckThatYouHaveWriteAccessAndThatThisPullRequestWasMergedOnTheHost,
  get "delete-branch"() {
    return t.git.branchDeletionUi.refused;
  },
  "approve-workflows":
    t.git.pullRequest
      .theHostRefusedItCheckThatYouHaveActionsWriteAccessAndThatTheseWorkflowRunsAreStillAwa,
};

const UPDATE_BRANCH_REBASE_FAILURE_HINT =
  t.git.pullRequest
    .theHostRefusedItARebaseStopsAtTheFirstCommitThatDoesNotApplyCleanlyUpdatingWithAMerge;

const TABS: ReadonlyArray<{ value: PullRequestDetailTab; label: string }> = [
  { value: "summary", label: t.git.actions.summary },
  { value: "guide", label: t.git.pullRequest.guide },
  { value: "timeline", label: t.git.pullRequest.timeline },
  { value: "code", label: t.git.pullRequest.code },
];

// The diff viewer pulls in its worker pool, so load it only when the reader approaches Code.
const loadCodeTab = () => import("./PullRequestCodeTab");
const PullRequestCodeTab = lazy(loadCodeTab);

/**
 * What the last hand-off wrote into each draft, kept outside React because the panel that wrote it
 * is closed by the time the next one opens. It is how a prompt the reader has since edited is told
 * apart from the one they were handed: only the sentence still exactly as written may be replaced.
 */
const lastHandoffPromptByDraft = new Map<string, string>();

const composerTargetKey = (target: ScopedThreadRef | DraftId): string =>
  typeof target === "string" ? target : scopedThreadKey(target);

function ActOnEnvironmentPicker({
  environments,
  value,
  onChange,
  disabled,
}: {
  environments: ReadonlyArray<PickableEnvironment>;
  value: EnvironmentId;
  onChange: (environmentId: EnvironmentId) => void;
  disabled: boolean;
}) {
  return (
    <>
      <MenuSeparator />
      <MenuRadioGroup
        value={value}
        onValueChange={(environmentId) => onChange(environmentId as EnvironmentId)}
      >
        {environments.map((environment) => (
          <MenuRadioItem
            key={environment.environmentId}
            value={environment.environmentId}
            disabled={disabled}
          >
            <span className="flex min-w-0 items-center gap-2">
              <EnvironmentMachineIcon
                kind={environment.machine ?? "server"}
                className="size-3.5 shrink-0"
              />
              <span className="truncate">{environment.label}</span>
            </span>
          </MenuRadioItem>
        ))}
      </MenuRadioGroup>
    </>
  );
}

const openNumberContextMenu = (
  event: ReactMouseEvent,
  detail: { readonly url: string; readonly provider: string },
): void => {
  event.preventDefault();
  event.stopPropagation();
  void showPullRequestLinkContextMenu({
    url: detail.url,
    openLabel: openOnHostLabel(sourceControlClients.get(detail.provider)),
    position: { x: event.clientX, y: event.clientY },
  });
};

/**
 * The stale-branch warning, said beside the branch it is about rather than as a bar of its own.
 * The banner this replaces held a row of chrome open across the top of every pull request that
 * had fallen behind, pushing the reading down to say something that is true of the base branch
 * and nothing else; as a mark on the base branch it is where a reader would look for it, and the
 * sentence and the way out of it arrive together the moment the mark is pointed at.
 *
 * A popover rather than a tooltip because what it holds can be pressed: a tooltip's layer takes
 * no pointer, and a control nobody can reach is worse than no control.
 * @param props Display data, state, options, and interaction callbacks defined by this surface's props type.
 * @returns The rendered surface.
 */
function PullRequestBaseFreshnessWarning({
  baseBranch,
  freshness,
  pending,
  onUpdate,
  iconClassName,
  className,
  children,
}: {
  readonly baseBranch: string;
  readonly freshness: {
    readonly behindBy: number | null;
    readonly methods: ReadonlyArray<PullRequestUpdateMethod>;
  };
  readonly pending: boolean;
  readonly onUpdate: (method: PullRequestUpdateMethod) => void;
  readonly iconClassName?: string;
  readonly className?: string;
  readonly children?: ReactNode;
}) {
  const behind =
    freshness.behindBy === null ? "" : t.git.pullRequest.behindCommits(freshness.behindBy);
  const summary = t.git.pullRequest.branchOutdated(baseBranch, behind);
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={0}
        closeDelay={120}
        render={
          <button
            type="button"
            aria-label={summary}
            className={cn(
              "inline-flex min-w-0 shrink-0 cursor-help items-center gap-1 rounded-sm text-warning-foreground outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              className,
            )}
          />
        }
      >
        {children}
        <TriangleAlertIcon aria-hidden className={cn("size-3.5 shrink-0", iconClassName)} />
      </PopoverTrigger>
      <PopoverPopup align="start" side="bottom" className="max-w-80" padding="compact">
        <p className="text-xs text-foreground">{summary}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t.git.pullRequest.changesCanBeCleanlyMerged}
        </p>
        {/* Each way the host offers and this reader may take, as its own button: a split button
            would need a menu inside a popover, and two buttons say the same thing in one layer. */}
        {freshness.methods.length > 0 ? (
          <span className="mt-2 flex flex-wrap items-center gap-1.5">
            {freshness.methods.map((method) => (
              <Button
                key={method}
                size="xs"
                variant="outline"
                disabled={pending}
                onClick={() => onUpdate(method)}
              >
                <PullRequestGlyph.merged aria-hidden className="size-3" />
                {method === "rebase"
                  ? t.git.pullRequest.updateWithRebase
                  : t.git.pullRequest.updateBranch}
              </Button>
            ))}
          </span>
        ) : null}
      </PopoverPopup>
    </Popover>
  );
}

function reportCheckoutCommandError(error: Error) {
  toastManager.add({
    type: "error",
    title: t.git.pullRequest.couldNotCopyCheckoutCommand,
    description: error.message,
  });
}

function resolvePullRequestReference(
  requestedReference: PullRequestRef,
  repositoryIdentity: Parameters<typeof resolvePullRequestReferenceHost>[1],
  supportsThreadPullRequests: boolean,
): PullRequestRef {
  return supportsThreadPullRequests
    ? resolvePullRequestReferenceHost(requestedReference, repositoryIdentity)
    : {
        projectId: requestedReference.projectId,
        repository: requestedReference.repository,
        number: requestedReference.number,
      };
}

function pullRequestRefKey(reference: PullRequestRef) {
  return `${reference.projectId}:${reference.host ?? ""}:${reference.repository}#${reference.number}`;
}

function pullRequestDetailSummary(data: PullRequestDetail | null) {
  return data === null ? null : { ...data, checksState: pullRequestChecksState(data.checks) };
}

/**
 * Loads a pull request's detail and activity and merges them, with the snapshot cache, the shared
 * summary and the list row, into the detail the panel shows.
 */
function usePullRequestDetail(
  environmentId: EnvironmentId,
  reference: PullRequestRef,
  listEntry: PullRequestListEntry | null,
) {
  const scopeKey = `${environmentId}:${pullRequestRefKey(reference)}`;
  const canWriteSourceControl = useEnvironmentScope(environmentId, AuthSourceControlWriteScope);
  const detailQuery = useEnvironmentQuery(
    pullRequestEnvironment.detail({ environmentId, input: reference }),
  );
  const activityQuery = useEnvironmentQuery(
    pullRequestEnvironment.activity({ environmentId, input: reference }),
  );
  const [cachedDetail, setCachedDetail] = useState(() =>
    readPullRequestDetailSnapshot(
      typeof window === "undefined" ? undefined : window.localStorage,
      environmentId,
      reference,
    ),
  );
  const [cachedDetailKey, setCachedDetailKey] = useState(scopeKey);
  if (cachedDetailKey !== scopeKey) {
    setCachedDetailKey(scopeKey);
    setCachedDetail(
      detailQuery.data ??
        readPullRequestDetailSnapshot(
          typeof window === "undefined" ? undefined : window.localStorage,
          environmentId,
          reference,
        ),
    );
  } else if (detailQuery.data !== null && detailQuery.data !== cachedDetail) {
    setCachedDetail(detailQuery.data);
  }
  const saveDetailSnapshot = useEffectEvent((data: PullRequestDetail) => {
    writePullRequestDetailSnapshot(
      typeof window === "undefined" ? undefined : window.localStorage,
      environmentId,
      reference,
      data,
    );
  });
  useEffect(() => {
    if (detailQuery.data !== null) saveDetailSnapshot(detailQuery.data);
  }, [detailQuery.data]);
  const detailSummary = pullRequestDetailSummary(detailQuery.data);
  const observedSummary = useSharedPullRequestSummary(
    environmentId,
    reference,
    detailSummary,
    detailQuery.dataUpdatedAt,
  );
  const activity = activityQuery.data;
  const resolvedCoreDetail = resolveDisplayedPullRequestDetail({
    live: detailQuery.data,
    cached: cachedDetail,
    reference,
  });
  // Every hook runs above this line: a hook between the merge and the panel's plain readers of
  // `detail` would cost it its cache scope.
  const listSummary = listEntry === null ? null : pullRequestListEntryToSummary(listEntry);
  // The list row is also published to the shared cache, but only after this commit's layout
  // effects run, so it is compared directly rather than trusted to be there already.
  const sharedSummary = newestPullRequestSummary(
    resolvedCoreDetail,
    newestPullRequestSummary(observedSummary, listSummary),
  );
  const coreDetail =
    resolvedCoreDetail === null || sharedSummary === null || sharedSummary === resolvedCoreDetail
      ? resolvedCoreDetail
      : {
          ...resolvedCoreDetail,
          title: sharedSummary.title,
          state: sharedSummary.state,
          headBranch: sharedSummary.headBranch,
          baseBranch: sharedSummary.baseBranch,
          updatedAt: sharedSummary.updatedAt,
          author: sharedSummary.author ?? resolvedCoreDetail.author,
          additions: sharedSummary.additions ?? resolvedCoreDetail.additions,
          deletions: sharedSummary.deletions ?? resolvedCoreDetail.deletions,
          changedFiles: sharedSummary.changedFiles ?? resolvedCoreDetail.changedFiles,
          mergeability: sharedSummary.mergeability ?? resolvedCoreDetail.mergeability,
          closedAt:
            sharedSummary.closedAt === undefined
              ? resolvedCoreDetail.closedAt
              : sharedSummary.closedAt,
          mergedAt:
            sharedSummary.mergedAt === undefined
              ? resolvedCoreDetail.mergedAt
              : sharedSummary.mergedAt,
          isDraft: sharedSummary.isDraft ?? resolvedCoreDetail.isDraft,
        };
  const detail =
    coreDetail === null
      ? null
      : {
          ...coreDetail,
          capabilities: canWriteSourceControl
            ? coreDetail.capabilities
            : {
                ...coreDetail.capabilities,
                reactions: false,
                edit: { changeRequest: false, comment: false },
              },
          viewerPermissions: canWriteSourceControl
            ? coreDetail.viewerPermissions
            : {
                ...coreDetail.viewerPermissions,
                actions: [],
                comment: false,
                resolve: false,
                verdicts: [],
                requestReviewers: false,
                updateMethods: [],
                labels: false,
              },
          author: activity?.author ?? coreDetail.author,
          reviewers: activity?.reviewers ?? coreDetail.reviewers,
          comments: activity?.comments ?? [],
          commentCount: Math.max(
            activity?.commentCount ?? 0,
            new Set([
              ...(activity?.comments.map((comment) => comment.id) ?? []),
              ...(activity?.reviewThreads.flatMap((thread) =>
                thread.comments.map((comment) => comment.id),
              ) ?? []),
            ]).size,
          ),
          commentsTruncated: activity?.commentsTruncated ?? false,
          reviewThreads: activity?.reviewThreads ?? [],
          commits: activity?.commits ?? [],
          reactions: activity?.reactions ?? [],
        };
  return {
    canWriteSourceControl,
    detailQuery,
    activityQuery,
    activity,
    sharedSummary,
    coreDetail,
    detail,
  };
}

function pullRequestMarkdownContext(
  hostClient: ReturnType<typeof sourceControlClients.get>,
  repositoryUrl: string | null,
  threadRef: ScopedThreadRef | null,
) {
  return {
    repositoryUrl:
      repositoryUrl === null ? null : hostClient.referenceAutolinkRepositoryUrl(repositoryUrl),
    threadRef,
  };
}

function pullRequestStackReference(
  detail: Pick<PullRequestDetail, "url" | "capabilities"> | null,
  reference: PullRequestRef,
  supportsThreadPullRequests: boolean,
) {
  return detail === null || detail.capabilities.stacks !== true || !supportsThreadPullRequests
    ? null
    : { ...reference, host: reference.host ?? parseChangeRequestUrl(detail.url)?.host };
}

/**
 * Renders request details, host actions, and agent handoffs while keeping submitted bodies and prompts unchanged.
 * @param props Display data, state, options, and interaction callbacks defined by this surface's props type.
 * @returns The rendered surface.
 */
export function PullRequestDetailPanel({
  environmentId,
  shortcutsEnabled,
  getShortcutContext,
  threadRef = null,
  reference: requestedReference,
  listEntry = null,
  refreshToken: forcedRefreshToken = 0,
  onActed,
  onClose,
  context = "page",
  composerDraftTarget,
  onBack,
  onSelectPullRequest,
  onGuideShown,
  initialTab = "summary",
  onTabChange,
}: {
  environmentId: EnvironmentId;
  shortcutsEnabled: boolean;
  getShortcutContext: () => ShortcutMatchContext;
  onSelectPullRequest?: ((reference: PullRequestRef) => void) | undefined;
  threadRef?: ScopedThreadRef | null;
  reference: PullRequestRef;
  listEntry?: PullRequestListEntry | null;
  refreshToken?: number;
  onActed?: (action?: PullRequestAction, phase?: "sent" | "done" | "failed") => void;
  onClose?: () => void;
  context?: "page" | "thread";
  composerDraftTarget?: ScopedThreadRef | DraftId;
  onBack?: (() => void) | undefined;
  onGuideShown?: (() => void) | undefined;
  initialTab?: PullRequestDetailTab;
  onTabChange?: ((tab: PullRequestDetailTab) => void) | undefined;
}) {
  const environmentConfigs = useServerConfigs();
  const projects = useProjects();
  const project = projects.find(
    (project) =>
      project.id === requestedReference.projectId && project.environmentId === environmentId,
  );
  const repositoryIdentity = project?.repositoryIdentity;
  const supportsThreadPullRequests =
    environmentConfigs.get(environmentId)?.environment.capabilities.threadPullRequests === true;
  const reference = resolvePullRequestReference(
    requestedReference,
    repositoryIdentity,
    supportsThreadPullRequests,
  );
  const loadingCheckoutCommand = loadingPullRequestCheckoutCommand(reference, repositoryIdentity);
  const unavailableGitHubUrl = gitHubPullRequestBrowserUrl(
    repositoryIdentity,
    reference.repository,
    reference.number,
  );
  const pullRequestKey = pullRequestRefKey(reference);
  const matchingListEntry =
    listEntry?.projectId === reference.projectId &&
    listEntry.repository.toLowerCase() === reference.repository.toLowerCase() &&
    (reference.host === undefined ||
      listEntry.host.toLowerCase() === reference.host.toLowerCase()) &&
    listEntry.number === reference.number
      ? listEntry
      : null;
  const [threadPickerOpen, setThreadPickerOpen] = useState(false);
  const [openReviewRequest, setOpenReviewRequest] = useState(0);
  const [tab, setTab] = useState<PullRequestDetailTab>(initialTab);
  const selectTab = (next: PullRequestDetailTab) => {
    setTab(next);
    onTabChange?.(next);
  };
  const [timelineOrder, setTimelineOrder] = useState<"newest" | "oldest">("newest");
  const [codeCommitScope, setCodeCommitScope] = useState<{
    readonly pullRequestKey: string;
    readonly oid: string | null;
  }>(() => ({ pullRequestKey, oid: null }));
  const selectedCodeCommitOid =
    codeCommitScope.pullRequestKey === pullRequestKey ? codeCommitScope.oid : null;
  const selectCodeCommit = (oid: string | null) => {
    setCodeCommitScope({ pullRequestKey, oid });
  };
  const openCommit = (oid: string) => {
    selectCodeCommit(oid);
    selectTab("code");
  };
  const [codeRevealRequest, setCodeRevealRequest] = useState<{
    readonly path: string;
    readonly nonce: number;
  } | null>(null);
  const openFileInCode = (path: string) => {
    selectCodeCommit(null);
    setCodeRevealRequest((previous) => ({ path, nonce: (previous?.nonce ?? 0) + 1 }));
    void loadCodeTab();
    selectTab("code");
  };
  const guideOpenRequested = useGuideRunStore(
    (state) => state.openRequestKey === guideRunKey(environmentId, reference),
  );
  if (guideOpenRequested && tab !== "guide") setTab("guide");
  useEffect(() => {
    if (!guideOpenRequested) return;
    useGuideRunStore.getState().requestOpen(null);
    onTabChange?.("guide");
  }, [guideOpenRequested, onTabChange]);
  const tabScopeKey = `${environmentId}:${pullRequestKey}`;
  const [tabMountState, setTabMountState] = useState(() => ({
    key: tabScopeKey,
    tabs: new Set<PullRequestDetailTab>([tab]),
  }));
  // A previously visited Code tab must not fetch diffs for every later PR while hidden.
  const mountedTabs =
    tabMountState.key === tabScopeKey ? tabMountState.tabs : new Set<PullRequestDetailTab>([tab]);
  if (tabMountState.key !== tabScopeKey) {
    setTabMountState({ key: tabScopeKey, tabs: new Set([tab]) });
  } else if (!tabMountState.tabs.has(tab)) {
    setTabMountState({ key: tabScopeKey, tabs: new Set(tabMountState.tabs).add(tab) });
  }
  // Each tab restores the condensed state its own scrolling left behind.
  const [condensedByTab, setCondensedByTab] = useState<
    Partial<Record<PullRequestDetailTab, boolean>>
  >({});
  const condensed = condensedByTab[tab] ?? false;
  const scrollerByTab = useRef<Partial<Record<PullRequestDetailTab, HTMLDivElement | null>>>({});
  // Fresh ref callbacks would detach and reattach every scroller on each render.
  const [scrollerRefs] = useState(() => ({
    summary: (node: HTMLDivElement | null) => {
      scrollerByTab.current.summary = node;
    },
    timeline: (node: HTMLDivElement | null) => {
      scrollerByTab.current.timeline = node;
    },
    code: (node: HTMLDivElement | null) => {
      scrollerByTab.current.code = node;
    },
  }));
  const foldRef = useRef<HTMLDivElement | null>(null);
  const condensedRowRef = useRef<HTMLDivElement | null>(null);
  // Save the target before collapse: the browser may clamp scrollTop as the viewport grows,
  // so applying a delta afterward would compensate twice.
  const compensationRef = useRef<{
    tab: PullRequestDetailTab;
    scroller: HTMLDivElement;
    target: number;
  } | null>(null);
  useLayoutEffect(() => {
    const compensation = compensationRef.current;
    if (compensation === null) return;
    compensationRef.current = null;
    if (
      !condensed ||
      compensation.tab !== tab ||
      scrollerByTab.current[tab] !== compensation.scroller
    )
      return;
    compensation.scroller.scrollTop = Math.max(0, compensation.target);
  }, [condensed, tab]);
  const lastSelectedMergeMethod = useUiStateStore((state) => state.pullRequestMergeMethod);
  const setLastSelectedMergeMethod = useUiStateStore((state) => state.setPullRequestMergeMethod);
  const resolveProjectDefaultMergeMethod = usePullRequestDefaultMergeMethodResolver(
    environmentId,
    reference.projectId,
  );
  const projectDefaultMergeMethod = resolveProjectDefaultMergeMethod();
  const [mergeMethodSelection, setMergeMethodSelection] = useState<{
    readonly pullRequestKey: string;
    readonly method: PullRequestMergeMethod;
  } | null>(null);
  const setMergeMethod = (method: PullRequestMergeMethod) => {
    setMergeMethodSelection({ pullRequestKey, method });
  };
  const inlineConfirm = useInlineActionConfirm(pullRequestKey);
  const [handoff, setHandoff] = useState<string | null>(null);
  const turnRefresh = usePullRequestTurnRefresh(environmentId);
  const {
    canWriteSourceControl,
    detailQuery,
    activityQuery,
    activity,
    sharedSummary,
    coreDetail,
    detail,
  } = usePullRequestDetail(environmentId, reference, matchingListEntry);
  const handoffSummary = detail ?? sharedSummary;
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const { copyToClipboard: copyReference } = useCopyToClipboard<string>({
    target: t.git.pullRequest.pullRequestReference,
    onCopy: (label) =>
      toastManager.add({ type: "success", title: t.git.pullRequest.copiedLabel(label) }),
    onError: (error, label) =>
      toastManager.add({
        type: "error",
        title: t.git.pullRequest.copyLabelError(label),
        description: error.message,
      }),
  });
  const copyFromShortcut = useEffectEvent((event: KeyboardEvent) => {
    if (!shortcutsEnabled || event.defaultPrevented || isCommandPaletteOpen()) return;
    const command = resolveShortcutCommand(event, keybindings, {
      context: getShortcutContext(),
    });
    if (command !== "pullRequest.copyNumber") return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) copyReference(`#${reference.number}`, t.git.pullRequest.pRNumber);
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => copyFromShortcut(event);
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
  const autoMergeKey = `${pullRequestKey}:${detail?.autoMergeMethod ?? ""}`;
  const [seenAutoMergeKey, setSeenAutoMergeKey] = useState<string | null>(null);
  if (seenAutoMergeKey !== autoMergeKey) {
    setSeenAutoMergeKey(autoMergeKey);
    if (detail?.autoMergeMethod !== undefined) setMergeMethod(detail.autoMergeMethod);
  }
  const repositoryUrl = detail === null ? null : changeRequestRepositoryUrl(detail.url);
  const hostClient = sourceControlClients.get(detail?.provider);
  const markdownContext = pullRequestMarkdownContext(hostClient, repositoryUrl, threadRef);
  const authorProfileUrl =
    detail?.author && repositoryUrl !== null
      ? hostClient.authorProfileUrl(detail.author.login, repositoryUrl)
      : null;
  const checkoutCommand = handoffSummary
    ? pullRequestCheckoutCommand(
        handoffSummary.provider,
        handoffSummary.number,
        handoffSummary.headBranch,
        detail?.headRepositoryNameWithOwner,
        changeRequestRepositoryUrl(handoffSummary.url),
      )
    : loadingCheckoutCommand;
  const branchRefsQuery = useEnvironmentQuery(
    detail === null
      ? null
      : vcsEnvironment.listRefs({
          environmentId,
          input: {
            cwd: detail.workspaceRoot,
            includeMatchingRemoteRefs: true,
            limit: 2,
          },
        }),
  );
  const isStackedPullRequest =
    detail !== null &&
    isStackedPullRequestBase(detail.baseBranch, branchRefsQuery.data?.refs ?? []);
  const stackReference = pullRequestStackReference(detail, reference, supportsThreadPullRequests);
  const nativeStackQuery = usePullRequestStack(environmentId, stackReference);
  const nativeStack = nativeStackQuery.data;
  const supportsStackActions =
    supportsThreadPullRequests &&
    detail?.capabilities.stacks === true &&
    detail.capabilities.stackActions === true &&
    environmentConfigs.get(environmentId)?.environment.capabilities.pullRequestStackActions ===
      true;
  const canMergeSinglePullRequest = allowsSinglePullRequestMerge({
    supportsStackActions,
    hasStack: nativeStack !== null,
    stackPending: !nativeStackQuery.isFresh,
    stackError: nativeStackQuery.error,
  });
  const activityPending = activityQuery.isPending && activity === null;
  const activityError = activity === null ? activityQuery.error : null;
  const refreshDetail = () => {
    detailQuery.refresh();
    activityQuery.refresh();
    nativeStackQuery.refresh();
  };
  const [refreshToken, setRefreshToken] = useState(0);
  const [activityRevision, setActivityRevision] = useState<{
    readonly key: string;
    readonly updatedAt: string;
  } | null>(null);
  const [activityRevalidations, setActivityRevalidations] = useState(0);
  const coreUpdatedAt = coreDetail?.updatedAt ?? null;
  if (
    coreUpdatedAt !== null &&
    (activityRevision?.key !== tabScopeKey || activityRevision.updatedAt !== coreUpdatedAt)
  ) {
    const next = { key: tabScopeKey, updatedAt: coreUpdatedAt };
    if (!shouldRefreshPullRequestActivity(activityRevision, next)) {
      setActivityRevision(next);
    } else if (!activityQuery.isPending) {
      // Let an existing read settle before revalidating the new revision. Interrupting a
      // mutation's activity refresh can leave SWR displaying its previous value.
      setActivityRevision(next);
      setActivityRevalidations((count) => count + 1);
      setRefreshToken((token) => token + 1);
    }
  }
  const revalidateActivity = useEffectEvent(() => activityQuery.refresh());
  useEffect(() => {
    if (activityRevalidations > 0) revalidateActivity();
  }, [activityRevalidations]);
  useLiveRefresh(
    () => {
      detailQuery.refresh();
    },
    { key: `pull-request:${environmentId}:${pullRequestKey}` },
  );
  const invalidate = useAtomCommand(pullRequestEnvironment.invalidate, { reportFailure: false });
  const [isInvalidating, setIsInvalidating] = useState(false);
  const refreshing = isInvalidating || detailQuery.isPending;
  const refreshFromHost = async () => {
    setIsInvalidating(true);
    // Atom commands settle instead of throwing, so the reset below always runs.
    await invalidate({ environmentId, input: { reference } });
    refreshDetail();
    setRefreshToken((token) => token + 1);
    setIsInvalidating(false);
  };
  const refreshFromHostOnRequest = useEffectEvent(() => void refreshFromHost());
  const appliedForcedToken = useRef(forcedRefreshToken);
  useEffect(() => {
    if (appliedForcedToken.current === forcedRefreshToken) return;
    appliedForcedToken.current = forcedRefreshToken;
    refreshFromHostOnRequest();
  }, [forcedRefreshToken]);
  const runAction = useAtomCommand(pullRequestEnvironment.runAction, {
    reportFailure: false,
  });
  const postComment = useAtomCommand(pullRequestEnvironment.comment, {
    reportFailure: false,
  });
  const [pendingAction, setPendingAction] = useState<PullRequestAction | null>(null);
  const actionPending = pendingAction !== null;
  const update = useAtomCommand(pullRequestEnvironment.update, { reportFailure: false });
  const [titleScope, setTitleScope] = useState<{
    readonly pullRequestKey: string;
    readonly text: string;
  } | null>(null);
  const titleDraft = titleScope?.pullRequestKey === pullRequestKey ? titleScope.text : null;
  const [titleSaving, setTitleSaving] = useState(false);
  const newThread = useNewThreadHandler();
  const { environments } = useEnvironments();
  const pickableEnvironments =
    context === "page"
      ? resolvePickableEnvironments(
          { environmentId, projectId: reference.projectId },
          projects,
          environments.map((environment) => ({
            environmentId: environment.environmentId,
            label: environment.label,
            machine: resolveEnvironmentMachineKind(environment.serverConfig),
          })),
        )
      : [];
  const [actingScope, setActingScope] = useState<{
    readonly pullRequestKey: string;
    readonly environmentId: EnvironmentId;
  } | null>(null);
  const chosenEnvironmentId =
    actingScope?.pullRequestKey === pullRequestKey ? actingScope.environmentId : environmentId;
  const acting =
    pickableEnvironments.find((entry) => entry.environmentId === chosenEnvironmentId) ?? null;
  const actingEnvironmentId = acting?.environmentId ?? environmentId;
  const checkoutRoot =
    acting?.workspaceRoot ?? detail?.workspaceRoot ?? project?.workspaceRoot ?? null;
  const canOperateThread = useEnvironmentScope(actingEnvironmentId, AuthOrchestrationOperateScope);
  const prepareThread = usePreparePullRequestThreadAction({
    environmentId: actingEnvironmentId,
    cwd: checkoutRoot,
  });

  const finishAction = async (
    action: PullRequestAction,
    method?: PullRequestMergeMethod,
    updateMethod?: PullRequestUpdateMethod,
  ) => {
    onActed?.(action, "sent");
    const result = await runAction({
      environmentId,
      input: {
        ...reference,
        action,
        ...(method ? { mergeMethod: method } : {}),
        ...(updateMethod ? { updateMethod } : {}),
      },
    });
    setPendingAction(null);
    if (result._tag === "Failure") {
      // A merge strategy a branch policy forbids is refused at completion and nowhere earlier —
      // Azure DevOps publishes no per-strategy availability to hide the control with — so
      // "action failed" would leave the reader pressing the same button again.
      const failure = squashAtomCommandFailure(result);
      const hint =
        updateMethod === "rebase"
          ? UPDATE_BRANCH_REBASE_FAILURE_HINT
          : ACTION_FAILURE_HINTS[action];
      toastManager.add({
        type: "error",
        title: ACTION_FAILURE_LABELS[action],
        description: readableFailure(failure, hint),
      });
      onActed?.(action, "failed");
      return false;
    }
    if (action === "revert") {
      toastManager.add({ type: "success", title: t.git.pullRequest.revertPullRequestOpened });
    }
    if (action === "delete-branch") {
      toastManager.add({ type: "success", title: t.git.branchDeletionUi.deleted });
    }
    if (pullRequestActionNeedsHostRefresh(action)) {
      void refreshFromHost();
    } else {
      refreshDetail();
    }
    onActed?.(action, "done");
    return true;
  };

  const perform = async (
    action: PullRequestAction,
    method?: PullRequestMergeMethod,
    updateMethod?: PullRequestUpdateMethod,
  ) => {
    if (!canWriteSourceControl || pendingAction !== null) return false;
    setPendingAction(action);
    return finishAction(action, method, updateMethod);
  };

  const performCommentAction = async (body: string, action: "close" | "reopen") => {
    if (!canWriteSourceControl || pendingAction !== null) return { commentPosted: false };
    setPendingAction(action);
    const commentResult = await postComment({
      environmentId,
      input: { ...reference, body },
    });
    if (commentResult._tag === "Failure") {
      setPendingAction(null);
      toastManager.add({ type: "error", title: t.git.pullRequest.couldNotPostTheComment });
      return { commentPosted: false };
    }
    const actionSucceeded = await finishAction(action);
    // The comment is durable even if the state change was refused, so make it visible while the
    // shared action failure explains why the pull request stayed where it was.
    if (!actionSucceeded) refreshDetail();
    return { commentPosted: true };
  };

  const saveTitle = async (next: string) => {
    const title = next.trim();
    if (!canWriteSourceControl || detail === null || titleSaving) return;
    if (title.length === 0 || title === detail.title) {
      setTitleScope(null);
      return;
    }
    setTitleSaving(true);
    const result = await update({ environmentId, input: { ...reference, title } });
    setTitleSaving(false);
    if (result._tag === "Failure") {
      toastManager.add({
        type: "error",
        title: t.git.pullRequest.theTitleCouldNotBeSaved,
        description: readableFailure(
          squashAtomCommandFailure(result),
          t.git.pullRequest.theHostRefusedTheNewTitle,
        ),
      });
      return;
    }
    setTitleScope(null);
    refreshDetail();
  };

  type ThreadTask = {
    prompt: string;
    reviewComments?: ReadonlyArray<ReviewCommentContext>;
  };

  const attachTarget = composerDraftTarget ?? null;
  const canPrepareWorktree = prepareThread.isAllowed && canOperateThread;
  const canFixFindings = attachTarget !== null || canPrepareWorktree;
  const handoffLabels = pullRequestHandoffLabels(attachTarget !== null);
  const guideWriter = useReviewGuideWriter({
    environmentId,
    reference,
    title: detail?.title ?? null,
  });
  const writeGuide = () => {
    void guideWriter.write();
    if (guideWriter.data?.guide == null) selectTab("guide");
  };

  const writeTaskToComposer = (target: ScopedThreadRef | DraftId, task: ThreadTask) => {
    const store = useComposerDraftStore.getState();
    const draft = store.getComposerDraft(target);
    const key = composerTargetKey(target);
    const previousCommentIds = new Set((draft?.reviewComments ?? []).map((comment) => comment.id));
    const repeatedCommentIds = new Set(
      (task.reviewComments ?? [])
        .filter((comment) => previousCommentIds.has(comment.id))
        .map((comment) => comment.id),
    );
    const promptWithoutPreviousHandoff = stripPullRequestHandoffReferences(
      draft?.prompt ?? "",
      draft?.reviewComments ?? [],
      repeatedCommentIds,
    );
    const prompt = handoffPrompt(
      {
        prompt: promptWithoutPreviousHandoff,
        lastHandoffPrompt: lastHandoffPromptByDraft.get(key),
      },
      task.prompt,
    );
    lastHandoffPromptByDraft.set(key, task.prompt);
    store.setPrompt(target, prompt);
    store.setReviewComments(
      target,
      handoffReviewComments(draft?.reviewComments ?? [], task.reviewComments ?? []),
    );
    for (const comment of task.reviewComments ?? []) {
      if (!repeatedCommentIds.has(comment.id)) continue;
      store.addReviewComment(target, comment, {
        allowDuplicateReference: true,
        insertAtCaret: false,
      });
    }
  };

  const openThreadWithTask = async (
    projectRef: ReturnType<typeof scopeProjectRef>,
    task: ThreadTask | null,
    opened?: { draftId: DraftId },
  ): Promise<{ draftId: DraftId } | null> => {
    const session =
      opened ??
      (await newThread(projectRef).then(
        (result) => result,
        () => null,
      ));
    if (session === null) return null;
    if (task === null) return session;
    writeTaskToComposer(session.draftId, task);
    return session;
  };

  const startAsk = async (
    kind: string,
    task: ThreadTask,
    options?: { readonly keepGuide?: boolean },
  ) => {
    if (!detail || handoff !== null) return;
    if (attachTarget !== null) {
      writeTaskToComposer(attachTarget, task);
      toastManager.add({
        type: "success",
        title: t.git.pullRequest.addedToTheComposer,
        description:
          task.prompt.length > 0
            ? t.git.pullRequest.theQuestionIsInTheComposerReadItOverThenSend
            : t.git.pullRequest.thePullRequestIsInTheComposerTypeYourQuestionThenSend,
      });
      return;
    }
    setHandoff(kind);
    const projectRef = scopeProjectRef(actingEnvironmentId, acting?.projectId ?? detail.projectId);
    const opened = await openThreadWithTask(projectRef, task);
    setHandoff(null);
    if (opened !== null && options?.keepGuide === true) {
      const draft = useComposerDraftStore.getState().getDraftSession(opened.draftId);
      if (draft !== null) {
        useRightPanelStore
          .getState()
          .openPullRequest(scopeThreadRef(draft.environmentId, draft.threadId), {
            environmentId,
            projectId: reference.projectId,
            ...(reference.host === undefined ? {} : { host: reference.host }),
            repository: reference.repository,
            number: reference.number,
            url: detail.url,
          });
        useGuideRunStore.getState().requestOpen(guideRunKey(environmentId, reference));
      }
    }
    if (opened === null) {
      toastManager.add({
        type: "error",
        title: t.git.pullRequest.couldNotOpenAThread,
        description: t.git.pullRequest.tryAgainFromTheProjectOrOpenAThreadFirst,
      });
      return;
    }
    toastManager.add({
      type: "success",
      title: t.git.pullRequest.askedInAThread,
      // "Ask" leaves the composer empty on purpose, so saying the question is in it would send
      // the reader looking for something that is not there. The chips are what landed.
      description:
        task.prompt.length > 0
          ? t.git.pullRequest.theQuestionIsInTheComposerReadItOverThenSend
          : t.git.pullRequest.thePullRequestIsInTheComposerTypeYourQuestionThenSend,
    });
  };

  const startHandoff = async (
    kind: string,
    task: { prompt: string; reviewComments?: ReadonlyArray<ReviewCommentContext> } | null,
    mode: "worktree" | "local" = "worktree",
  ) => {
    if (!handoffSummary || handoff !== null) return;
    if (attachTarget !== null && task !== null) {
      writeTaskToComposer(attachTarget, task);
      toastManager.add({
        type: "success",
        title: t.git.pullRequest.addedToTheComposer,
        description: t.git.pullRequest.theTaskIsInTheComposerReadItOverThenSend,
      });
      return;
    }
    if (checkoutRoot === null) return;
    if (
      !prepareThread.isAllowed ||
      !readEnvironmentScope(actingEnvironmentId, AuthSourceControlWriteScope)
    ) {
      return;
    }
    if (
      mode === "worktree" &&
      !readEnvironmentScope(actingEnvironmentId, AuthOrchestrationOperateScope)
    ) {
      return;
    }
    setHandoff(kind);
    const toastId = toastManager.add({
      type: "loading",
      title: t.git.pullRequest.preparingThePullRequestCheckout,
    });
    const projectRef = scopeProjectRef(
      actingEnvironmentId,
      acting?.projectId ?? handoffSummary.projectId,
    );
    // The thread is opened before the checkout rather than after it, because the project's setup
    // script only runs for a checkout that knows which thread it is for — and a worktree with no
    // dependencies installed is not something anyone can test.
    const opened = await newThread(projectRef).then(
      (session) => session,
      () => null,
    );
    if (opened === null) {
      setHandoff(null);
      toastManager.update(toastId, {
        type: "error",
        title: t.git.pullRequest.couldNotOpenAThreadForTheCheckout,
        description: t.git.pullRequest.tryAgainFromTheProjectOrOpenAThreadFirst,
      });
      return;
    }
    const prepared = await prepareThread.run({
      reference: handoffSummary.url,
      mode,
      threadId: opened.threadId,
    });
    if (prepared._tag === "Failure") {
      setHandoff(null);
      toastManager.update(toastId, {
        type: "error",
        title: t.git.pullRequest.couldNotPrepareThePullRequestCheckout,
        description: checkoutFailureDescription(
          isAtomCommandInterrupted(prepared) ? undefined : squashAtomCommandFailure(prepared),
        ),
      });
      return;
    }
    const pointed = await newThread(projectRef, {
      branch: prepared.value.branch,
      worktreePath: prepared.value.worktreePath,
      envMode: prepared.value.worktreePath === null ? "local" : "worktree",
    }).then(
      (session) => session !== null,
      () => false,
    );
    if (!pointed) {
      setHandoff(null);
      // The checkout is on disk; only the thread failed to move onto it. Writing the task now
      // would send the agent at whatever the thread was already open on — which is the one
      // outcome worth stopping for, since it reads as success and is not.
      toastManager.update(toastId, {
        type: "error",
        title: t.git.pullRequest.checkedOutButTheThreadStayedWhereItWas,
        description: t.git.pullRequest.checkoutThreadHint(prepared.value.branch),
      });
      return;
    }
    setHandoff(null);
    // A worktree that was already there and had been worked in keeps whatever it holds, so the
    // thread opens on older code than the pull request carries. Said once, in place of the
    // success, because everything else about the handoff did happen.
    const staleCheckoutToast = {
      type: "warning",
      title: t.git.pullRequest.checkedOutButNotOnTheLatestCommits,
      description:
        t.git.pullRequest
          .theCheckoutCouldNotBeMovedOntoThePullRequestSLatestCommitsSoTheCodeThereIsOlderThanTh,
    } as const;
    if (task === null) {
      toastManager.update(
        toastId,
        prepared.value.isOnPullRequestHead
          ? {
              type: "success",
              title:
                mode === "local" ? t.git.pullRequest.checkedOutHere : t.git.pullRequest.checkedOut,
              description:
                mode === "local"
                  ? t.git.pullRequest.thisRepositoryIsOnThePullRequestSBranchWithAThreadOpenOnIt
                  : t.git.pullRequest.thePullRequestIsInItsOwnWorktreeWithAThreadOpenOnIt,
            }
          : staleCheckoutToast,
      );
      return;
    }
    await openThreadWithTask(projectRef, task, opened);
    toastManager.update(
      toastId,
      prepared.value.isOnPullRequestHead
        ? {
            type: "success",
            title: t.git.pullRequest.checkoutReady,
            description: t.git.pullRequest.theTaskIsInTheComposerReadItOverThenSend,
          }
        : staleCheckoutToast,
    );
  };

  const askAboutPullRequest = () => {
    if (!detail) return;
    void startAsk("ask", {
      ...buildAskAboutPullRequestHandoff({
        number: detail.number,
        title: detail.title,
        url: detail.url,
        headBranch: detail.headBranch,
        baseBranch: detail.baseBranch,
        state: detail.state,
        isDraft: detail.isDraft,
      }),
    });
  };

  const explainPullRequest = () => {
    if (!detail) return;
    void startAsk("explain", {
      ...buildExplainPullRequestHandoff({
        number: detail.number,
        title: detail.title,
        url: detail.url,
        headBranch: detail.headBranch,
        baseBranch: detail.baseBranch,
        state: detail.state,
        isDraft: detail.isDraft,
      }),
    });
  };

  const askAboutGuideStop = (stop: PullRequestReviewGuideStop, index: number, question: string) => {
    if (!detail) return;
    void startAsk(
      `guide-stop:${index}`,
      buildAskAboutGuideStopHandoff({
        number: detail.number,
        title: detail.title,
        url: detail.url,
        headBranch: detail.headBranch,
        baseBranch: detail.baseBranch,
        state: detail.state,
        isDraft: detail.isDraft,
        stop: {
          index,
          title: stop.title,
          summary: stop.summary,
          attention: stop.attention?.note ?? null,
          excerpts: stop.excerpts,
        },
        question,
      }),
      { keepGuide: true },
    );
  };

  const addSelectionToAgent = (
    selection: PullRequestAgentSelectionInput,
    options?: { readonly keepGuide?: boolean },
  ) => {
    if (!detail) return;
    void startAsk(
      `selection:${selection.comment.id}`,
      buildAddSelectionToAgentHandoff({
        number: detail.number,
        title: detail.title,
        url: detail.url,
        headBranch: detail.headBranch,
        baseBranch: detail.baseBranch,
        state: detail.state,
        isDraft: detail.isDraft,
        comment: selection.comment,
        request: selection.request,
      }),
      options,
    );
  };

  const startCheckout = (mode: "worktree" | "local") => {
    if (!handoffSummary) return;
    void startHandoff(`checkout:${mode}`, null, mode);
  };

  const startFixFinding = (finding: PullRequestFinding) => {
    if (!detail) return;
    void startHandoff(
      pullRequestFindingKey(finding),
      buildFixFindingHandoff({
        number: detail.number,
        title: detail.title,
        url: detail.url,
        headBranch: detail.headBranch,
        baseBranch: detail.baseBranch,
        finding,
      }),
    );
  };

  const startFixFindings = () => {
    if (!detail) return;
    void startHandoff(
      "findings",
      buildFixFindingsHandoff({
        number: detail.number,
        title: detail.title,
        url: detail.url,
        headBranch: detail.headBranch,
        baseBranch: detail.baseBranch,
        reviewThreads: detail.reviewThreads,
        comments: detail.comments,
        checks: checksStale ? [] : detail.checks,
        commentsTruncated: detail.commentsTruncated,
      }),
    );
  };

  const startResolveConflicts = () => {
    if (!handoffSummary) return;
    void startHandoff("conflicts", {
      prompt: buildResolveConflictsPrompt({
        number: handoffSummary.number,
        url: handoffSummary.url,
        headBranch: handoffSummary.headBranch,
        baseBranch: handoffSummary.baseBranch,
      }),
    });
  };

  const allowedMergeMethods = detail
    ? detail.capabilities.mergeMethods.filter((method) => detail.mergeCapabilities[method])
    : [];
  const currentMergeMethod =
    mergeMethodSelection?.pullRequestKey === pullRequestKey ? mergeMethodSelection.method : null;
  const selectedMergeMethod = resolvePullRequestMergeMethod(
    allowedMergeMethods,
    currentMergeMethod,
    projectDefaultMergeMethod,
    lastSelectedMergeMethod,
  );
  const conflicting = detail?.state === "open" && detail.mergeability === "conflicting";
  const autoMergeArmed = detail?.state === "open" && detail.autoMergeEnabled === true;
  const armedMergeMethod = detail?.autoMergeMethod;
  const armedAutoMergeLabel = armedMergeMethod
    ? t.git.pullRequest.autoMergeMethod(
        PULL_REQUEST_MERGE_METHOD_LABELS[armedMergeMethod].toLowerCase(),
      )
    : t.git.pullRequest.autoMerge;
  const workflowApprovalsRequired =
    detail?.state === "open" ? (detail.workflowApprovalsRequired ?? 0) : 0;
  const freshness = detail === null ? null : resolveBaseFreshness(detail);
  const reviewGuidesEnabled = useEnvironmentSettings(
    environmentId,
    (settings) => settings.reviewGuidesEnabled,
  );
  const visibleTabs = TABS.filter(
    (item) =>
      (item.value !== "code" || detail === null || detail.capabilities.diff) &&
      (item.value !== "guide" || reviewGuidesEnabled),
  );
  // Keep unavailable-tab fallbacks out of the saved selection.
  if (!visibleTabs.some((item) => item.value === tab)) setTab("summary");
  const can = (action: PullRequestAction) =>
    detail?.capabilities.actions.includes(action) === true &&
    detail.viewerPermissions.actions.includes(action);
  const detailChecksState = detail ? pullRequestChecksState(detail.checks) : null;
  const latestChecksState =
    sharedSummary?.checksState === undefined ? detailChecksState : sharedSummary.checksState;
  // List rollups can omit workflows awaiting approval. Only refreshed detail can clear those.
  const checksState =
    latestChecksState !== "failing" &&
    detail?.checks.some((check) => check.status === "action-required")
      ? "pending"
      : latestChecksState;
  const checksStale = checksState !== detailChecksState;
  const headerActions = resolvePullRequestActionGroups({
    state: detail?.state ?? "closed",
    isDraft: detail?.isDraft ?? false,
    mergeability: detail?.mergeability ?? "unknown",
    checksState,
    autoMergeEnabled: detail?.autoMergeEnabled,
    mergeMethodCount: allowedMergeMethods.length,
    canMergeSinglePullRequest,
    canMerge: can("merge"),
    canMarkReady: can("ready"),
    canConvertToDraft: can("draft"),
    canEnableAutoMerge: can("enable-auto-merge"),
    canDisableAutoMerge: can("disable-auto-merge"),
  });
  // Conflicts do not change the host's PR state; the identity badge keeps that distinction.
  const statePresentation = detail
    ? resolvePullRequestState({ state: detail.state, isDraft: detail.isDraft })
    : null;
  const showsDeleteBranch = detail !== null && canDeletePullRequestBranch(detail);
  const environmentConnected = environments.some(
    (environment) =>
      environment.environmentId === environmentId && environment.connection.phase === "connected",
  );
  const confirmDeleteBranch = async () => {
    if (detail === null) return;
    const confirmed = await readLocalApi()?.dialogs.confirm(
      [
        t.git.branchDeletionText.confirm(detail.headBranch),
        t.git.branchDeletionText.hint(
          detail.headBranch,
          detail.headRepositoryNameWithOwner ?? detail.repository,
        ),
      ].join("\n"),
      { variant: "destructive" },
    );
    if (confirmed) void perform("delete-branch");
  };
  const showsApproveWorkflows =
    workflowApprovalsRequired > 0 && !checksStale && can("approve-workflows");
  const checksSummary = checksStale
    ? checksState === null
      ? t.git.pullRequest.noChecksReported
      : pullRequestChecksStatePresentation(checksState).label
    : detail
      ? summarizePullRequestChecks(detail.checks)
      : null;
  const approvalCount =
    detail && !detail.commentsTruncated
      ? latestPullRequestReviewOutcomes(detail.comments, detail.commits).filter(
          (entry) => entry.outcome === "approved" && !entry.stale,
        ).length
      : 0;

  const checkoutControl =
    context === "page" ? (
      <Menu>
        <Group variant="split" leadingIcon aria-label={t.git.pullRequest.checkOutThisPullRequest}>
          <MenuTrigger
            disabled={handoff !== null || checkoutRoot === null}
            render={
              <Button
                size="default"
                variant="secondary"
                aria-label={
                  handoff?.startsWith("checkout")
                    ? t.git.pullRequest.checkingOut
                    : t.git.pullRequest.checkOut
                }
              />
            }
          >
            <GitBranchIcon aria-hidden className="size-3.5" />
            {handoff?.startsWith("checkout")
              ? t.git.pullRequest.checkingOut
              : t.git.pullRequest.checkOutThisPullRequest}
          </MenuTrigger>
          <MenuTrigger
            disabled={handoff !== null || checkoutRoot === null}
            render={
              <Button
                size="icon"
                variant="secondary"
                aria-label={t.git.pullRequest.checkoutMethod}
              />
            }
          >
            <ChevronDownIcon aria-hidden className="size-3.5" />
          </MenuTrigger>
        </Group>
        <MenuPopup align="end" side="bottom">
          <MenuItem disabled={!canPrepareWorktree} onClick={() => startCheckout("worktree")}>
            <GitBranchIcon className="mt-1 size-3.5 shrink-0 self-start" />
            <span className="flex min-w-0 flex-col">
              <span>{t.git.pullRequest.inASeparateWorktree}</span>
              <span className="text-xs text-muted-foreground">
                {t.git.pullRequest.itsOwnFolderAndThreadNothingYouHaveOpenMoves}
              </span>
            </span>
          </MenuItem>
          <MenuItem disabled={!prepareThread.isAllowed} onClick={() => startCheckout("local")}>
            <FolderGit2Icon className="mt-1 size-3.5 shrink-0 self-start" />
            <span className="flex min-w-0 flex-col">
              <span>{t.git.pullRequest.inThisRepository}</span>
              <span className="text-xs text-muted-foreground">
                {t.git.pullRequest.switchesTheBranchYouAreWorkingInLikeGhPrCheckout}
              </span>
            </span>
          </MenuItem>
          {pickableEnvironments.length > 0 ? (
            <ActOnEnvironmentPicker
              environments={pickableEnvironments}
              value={actingEnvironmentId}
              onChange={(next) => setActingScope({ pullRequestKey, environmentId: next })}
              disabled={handoff !== null}
            />
          ) : null}
        </MenuPopup>
      </Menu>
    ) : null;

  const resolveConflictsControl = (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="inline-flex shrink-0">
            <Button
              size="xs"
              variant="destructive-outline"
              disabled={handoff !== null || (attachTarget === null && checkoutRoot === null)}
              onClick={startResolveConflicts}
              aria-label={
                handoff === "conflicts"
                  ? t.git.pullRequest.preparing
                  : t.git.pullRequest.resolveConflicts
              }
            >
              <PullRequestGlyph.conflicting aria-hidden className="size-3.5" />
              <span className="@max-[30rem]/pr-header:hidden">
                {handoff === "conflicts"
                  ? t.git.pullRequest.preparing
                  : t.git.pullRequest.resolveConflicts}
              </span>
            </Button>
          </span>
        }
      />
      <TooltipPopup side="top">
        {handoff === "conflicts" ? t.git.pullRequest.preparing : t.git.pullRequest.resolveConflicts}
      </TooltipPopup>
    </Tooltip>
  );

  if (detailQuery.isPending && !detail) {
    return (
      <PullRequestDetailGhost
        seed={matchingListEntry}
        summary={sharedSummary}
        checkoutCommand={checkoutCommand}
        onCheckoutError={reportCheckoutCommandError}
        number={reference.number}
        tabs={visibleTabs}
        activeTab={tab}
        {...(onBack ? { onBack } : {})}
        {...(onClose ? { onClose } : {})}
        actions={
          handoffSummary ? (
            <TooltipProvider delay={150} closeDelay={150} timeout={400}>
              {handoffSummary.state === "open" && handoffSummary.mergeability === "conflicting"
                ? resolveConflictsControl
                : null}
              {checkoutControl}
            </TooltipProvider>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col bg-background">
      {threadPickerOpen && detail ? (
        <PullRequestThreadLinks
          key={`${environmentId}:${detail.url}`}
          display="picker"
          environmentId={environmentId}
          reference={reference}
          url={detail.url}
          threadRef={null}
          onPickerOpenChange={setThreadPickerOpen}
        />
      ) : null}
      <div className={cn("min-w-0 shrink-0", !detail && !onClose && "hidden")}>
        <TooltipProvider delay={150} closeDelay={150} timeout={400}>
          <div className="flex min-h-7 min-w-0 flex-wrap items-center gap-2 px-4 pt-1 pb-2.5">
            {onBack ? (
              <Button
                size="icon-sm"
                variant="ghost-muted"
                onClick={onBack}
                aria-label={t.git.pullRequest.backToThisThreadSPullRequests}
              >
                <ArrowLeftIcon aria-hidden className="size-3.5" />
              </Button>
            ) : null}
            {detail && statePresentation ? (
              <>
                <Badge
                  size="lg"
                  variant={
                    detail.state === "open" && detail.isDraft
                      ? "neutral"
                      : detail.state === "open"
                        ? "success"
                        : detail.state === "merged"
                          ? "accent"
                          : "danger"
                  }
                >
                  <statePresentation.Icon aria-hidden className="size-3" />
                  {statePresentation.label}
                </Badge>
                <button
                  type="button"
                  onClick={() => void readLocalApi()?.shell.openExternal(detail.url)}
                  onAuxClick={(event) => {
                    if (event.button === 1) void readLocalApi()?.shell.openExternal(detail.url);
                  }}
                  onContextMenu={(event) => openNumberContextMenu(event, detail)}
                  className="shrink-0 cursor-pointer rounded-keycap font-mono text-secondary-copy-medium text-muted-foreground underline-offset-2 hover:underline focus-visible:inset-shadow-focus"
                  aria-label={t.git.pullRequest.openRequestOnHost(detail.number)}
                >
                  #{detail.number}
                </button>
              </>
            ) : null}
            <div className="ml-auto flex min-w-0 items-center gap-1">
              {detail ? (
                <>
                  <Button
                    size="md"
                    variant="ghost"
                    disabled={handoff !== null}
                    onClick={askAboutPullRequest}
                  >
                    <MessageCircleQuestionIcon aria-hidden className="size-3.5" />
                    {handoff === "ask" ? t.git.pullRequest.opening : t.git.pullRequest.askAQuestion}
                  </Button>
                  <Button
                    size="md"
                    variant="secondary"
                    disabled={handoff !== null}
                    onClick={explainPullRequest}
                  >
                    <PixelSparkIcon aria-hidden className="size-3.5" />
                    {handoff === "explain"
                      ? t.git.pullRequest.opening
                      : t.git.pullRequest.explainThisPR}
                  </Button>
                  <Menu>
                    <MenuTrigger
                      render={
                        <Button
                          size="icon-menu"
                          variant="ghost-muted"
                          aria-label={t.git.pullRequest.copyMenu}
                        />
                      }
                    >
                      <CopyIcon aria-hidden className="size-3.5" />
                      <ChevronDownIcon aria-hidden className="size-3" />
                    </MenuTrigger>
                    <MenuPopup align="end">
                      <MenuItem onClick={() => copyReference(detail.url, t.git.pullRequest.pRLink)}>
                        <LinkIcon aria-hidden className="size-3.5" />
                        {t.git.pullRequest.copyLinkLabel}
                        <MenuShortcut>
                          {shortcutLabelForCommand(keybindings, "thread.copyReference")}
                        </MenuShortcut>
                      </MenuItem>
                      <MenuItem
                        onClick={() =>
                          copyReference(`#${reference.number}`, t.git.pullRequest.pRNumber)
                        }
                      >
                        <HashIcon aria-hidden className="size-3.5" />
                        {t.git.pullRequest.copyNumberLabel}
                        <MenuShortcut>
                          {shortcutLabelForCommand(keybindings, "pullRequest.copyNumber")}
                        </MenuShortcut>
                      </MenuItem>
                      <MenuItem
                        onClick={() =>
                          copyReference(detail.headBranch, t.git.pullRequest.branchName)
                        }
                      >
                        <GitBranchIcon aria-hidden className="size-3.5" />
                        {t.git.pullRequest.copyBranchLabel}
                      </MenuItem>
                      {checkoutCommand ? (
                        <MenuItem
                          onClick={() =>
                            copyReference(
                              checkoutCommand,
                              t.git.pullRequest.pullRequestCheckoutCommand,
                            )
                          }
                        >
                          <TerminalIcon aria-hidden className="size-3.5" />
                          {t.git.pullRequest.copyCheckoutLabel}
                        </MenuItem>
                      ) : null}
                    </MenuPopup>
                  </Menu>
                </>
              ) : null}
              {onClose ? (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t.git.pullRequest.collapsePullRequestPanel}
                  onClick={onClose}
                >
                  <PanelRightIcon aria-hidden className="size-3.5" />
                </Button>
              ) : null}
            </div>
          </div>
          <div className={cn("grid", condensed ? "pr-detail-expanded" : "pr-detail-folded")}>
            <div
              ref={condensedRowRef}
              inert={!condensed}
              className={cn(
                "min-h-0 overflow-hidden px-4 transition-opacity motion-reduce:transition-none",
                !condensed && "opacity-0",
              )}
            >
              {detail ? (
                <p className="truncate pb-2.5 font-serif text-card-title font-bold">
                  {detail.title}
                </p>
              ) : null}
              {detail ? (
                <div className="min-w-0 pb-2.5">
                  <div className="flex min-w-0 items-center gap-2 text-secondary-copy text-muted-foreground">
                    <span className="flex min-w-0 shrink items-center gap-1.5 overflow-hidden text-secondary-copy text-muted-foreground">
                      <PullRequestActorLabel
                        actor={detail.author}
                        profileUrl={authorProfileUrl}
                        variant="avatar"
                        className="shrink-0"
                      />
                      <span className="shrink-0">
                        {<RelativeTime timestamp={detail.updatedAt} />}
                      </span>
                    </span>
                    <span aria-hidden className="h-3 w-px shrink-0 bg-border/70" />
                    <span className="flex min-w-0 flex-1 items-center gap-1.5 font-mono text-meta text-muted-foreground/65">
                      {/* An out-of-date base wears the warning on the branch name itself, so the
                        name is amber and pointing at either the name or the mark opens the way
                        out. Up to date, the name keeps its plain tooltip. */}
                      {freshness ? (
                        <PullRequestBaseFreshnessWarning
                          baseBranch={detail.baseBranch}
                          freshness={freshness}
                          pending={actionPending}
                          onUpdate={(method) => void perform("update-branch", undefined, method)}
                          iconClassName="size-3"
                          className="max-w-36"
                        >
                          {isStackedPullRequest ? (
                            <PullRequestGlyph.stack
                              aria-label={t.git.pullRequest.stackedPullRequest}
                              className="size-3 shrink-0"
                            />
                          ) : null}
                          <code className="flex min-w-0">
                            <MiddleTruncate value={detail.baseBranch} showTitle={false} />
                          </code>
                        </PullRequestBaseFreshnessWarning>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <span className="inline-flex min-w-0 max-w-36 shrink-0 items-center gap-1">
                                {isStackedPullRequest ? (
                                  <PullRequestGlyph.stack
                                    aria-label={t.git.pullRequest.stackedPullRequest}
                                    className="size-3 shrink-0"
                                  />
                                ) : null}
                                <code className="flex min-w-0">
                                  <MiddleTruncate value={detail.baseBranch} showTitle={false} />
                                </code>
                              </span>
                            }
                          />
                          <TooltipPopup side="top">
                            {isStackedPullRequest
                              ? t.git.pullRequest.stackedOn(detail.baseBranch)
                              : detail.baseBranch}
                          </TooltipPopup>
                        </Tooltip>
                      )}
                      <ArrowLeftIcon
                        aria-label={t.git.pullRequest.receivesChangesFrom}
                        className="size-3 shrink-0 opacity-60"
                      />
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <code className="flex min-w-0 flex-1">
                              <MiddleTruncate value={detail.headBranch} showTitle={false} />
                            </code>
                          }
                        />
                        <TooltipPopup side="top">{detail.headBranch}</TooltipPopup>
                      </Tooltip>
                    </span>
                    <span className="ml-auto inline-flex shrink-0 items-center justify-end gap-2 text-meta">
                      <span
                        className="inline-flex items-center gap-1 tabular-nums"
                        aria-label={t.git.pullRequest.changedFileCount(detail.changedFiles)}
                      >
                        <FileDiffIcon aria-hidden className="size-3" />
                        {detail.changedFiles.toLocaleString()}
                      </span>
                      <PullRequestDiffStat
                        additions={detail.additions}
                        deletions={detail.deletions}
                        className="shrink-0 font-mono text-meta"
                      />
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <div className={cn("grid", condensed ? "pr-detail-folded" : "pr-detail-expanded")}>
            <div
              ref={foldRef}
              inert={condensed}
              className={cn(
                "min-h-0 overflow-hidden transition-opacity motion-reduce:transition-none",
                condensed && "opacity-0",
              )}
            >
              {detail ? (
                <PullRequestDetailHeaderBody
                  title={
                    titleDraft === null ? (
                      <PullRequestDetailTitleRow className="group gap-2">
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <h1 className="min-w-0 truncate font-serif text-pr-detail-title font-bold">
                                {detail.title}
                              </h1>
                            }
                          />
                          <TooltipPopup side="top">{detail.title}</TooltipPopup>
                        </Tooltip>
                        {canEditPullRequestChangeRequest(detail) ? (
                          <Button
                            size="icon-xs"
                            variant="ghost-muted"
                            aria-label={t.git.pullRequest.editTitle}
                            onClick={() => setTitleScope({ pullRequestKey, text: detail.title })}
                          >
                            <PencilIcon aria-hidden className="size-3.5" />
                          </Button>
                        ) : null}
                      </PullRequestDetailTitleRow>
                    ) : (
                      // A title is one line of text, not markdown, so it takes an input rather than
                      // the editor the description and the remarks share.
                      <div className="space-y-2">
                        <Input
                          autoFocus
                          size="sm"
                          disabled={titleSaving}
                          value={titleDraft}
                          aria-label={t.git.pullRequest.pullRequestTitle}
                          onChange={(event) =>
                            setTitleScope({ pullRequestKey, text: event.target.value })
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void saveTitle(titleDraft);
                            } else if (event.key === "Escape") {
                              event.preventDefault();
                              setTitleScope(null);
                            }
                          }}
                        />
                        <div className="flex justify-end gap-2">
                          <Button
                            size="xs"
                            variant="ghost"
                            disabled={titleSaving}
                            onClick={() => setTitleScope(null)}
                          >
                            {t.common.confirm.cancel}
                          </Button>
                          <Button
                            size="xs"
                            variant="outline"
                            disabled={
                              !canWriteSourceControl ||
                              titleSaving ||
                              titleDraft.trim().length === 0
                            }
                            onClick={() => void saveTitle(titleDraft)}
                          >
                            {titleSaving ? t.git.pullRequest.saving : t.git.pullRequest.save}
                          </Button>
                        </div>
                      </div>
                    )
                  }
                  author={
                    <PullRequestActorLabel
                      actor={detail.author}
                      profileUrl={authorProfileUrl}
                      variant="avatar"
                      avatarSize="lg"
                    />
                  }
                  updated={
                    <span>
                      {t.git.pullRequest.updated}
                      {<RelativeTime timestamp={detail.updatedAt} />}
                    </span>
                  }
                  base={
                    /* An out-of-date base wears the warning on the branch name itself, so the
                        name is amber and pointing at either the name or the mark opens the way
                        out. Up to date, the name keeps its plain tooltip. */
                    freshness ? (
                      <PullRequestBaseFreshnessWarning
                        baseBranch={detail.baseBranch}
                        freshness={freshness}
                        pending={actionPending}
                        onUpdate={(method) => void perform("update-branch", undefined, method)}
                        className="max-w-36"
                      >
                        {isStackedPullRequest ? (
                          <PullRequestGlyph.stack
                            aria-label={t.git.pullRequest.stackedPullRequest}
                            className="size-3 shrink-0"
                          />
                        ) : null}
                        <code className="flex min-w-0">
                          <MiddleTruncate value={detail.baseBranch} showTitle={false} />
                        </code>
                      </PullRequestBaseFreshnessWarning>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <span className="inline-flex min-w-0 max-w-36 shrink-0 items-center gap-1">
                              {isStackedPullRequest ? (
                                <PullRequestGlyph.stack
                                  aria-label={t.git.pullRequest.stackedPullRequest}
                                  className="size-3 shrink-0"
                                />
                              ) : null}
                              <code className="flex min-w-0">
                                <MiddleTruncate value={detail.baseBranch} showTitle={false} />
                              </code>
                            </span>
                          }
                        />
                        <TooltipPopup side="top">
                          {isStackedPullRequest
                            ? t.git.pullRequest.stackedOn(detail.baseBranch)
                            : detail.baseBranch}
                        </TooltipPopup>
                      </Tooltip>
                    )
                  }
                  head={
                    <PullRequestCopyableCode
                      key={detail.headBranch}
                      value={detail.headBranch}
                      target={t.git.pullRequest.branchName}
                      copyLabel={t.git.pullRequest.copyPullRequestBranch}
                      copiedLabel={t.git.pullRequest.branchNameCopied}
                      className="p-0"
                    />
                  }
                  files={t.git.pullRequest.fileCount(detail.changedFiles)}
                  diffStat={
                    <PullRequestDiffStat
                      additions={detail.additions}
                      deletions={detail.deletions}
                      className="shrink-0 font-mono text-secondary-copy"
                    />
                  }
                />
              ) : null}
            </div>
          </div>
          {detail ? (
            <div className="flex flex-col gap-2.5 px-4 pb-2.5">
              {conflicting ? (
                <p className="flex items-center gap-1.5 text-secondary-copy text-attention">
                  <TriangleAlertIcon aria-hidden className="size-3.25" />
                  {t.git.pullRequest.mergeConflictsWith(detail.baseBranch)}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-1.5">
                <Menu>
                  <Group variant="split" leadingIcon={false} aria-label={t.git.pullRequest.merge}>
                    <Button
                      variant="default"
                      disabled={actionPending || !headerActions.merge}
                      {...inlineConfirm.props(
                        "merge",
                        () => void perform("merge", selectedMergeMethod),
                      )}
                      aria-label={
                        pendingAction === "merge"
                          ? t.git.pullRequest.merging
                          : inlineConfirm.isArmed("merge")
                            ? t.git.pullRequest.confirmMerge
                            : t.git.pullRequest.merge
                      }
                    >
                      {pendingAction === "merge"
                        ? t.git.pullRequest.merging
                        : inlineConfirm.isArmed("merge")
                          ? t.git.pullRequest.confirmMerge
                          : t.git.pullRequest.merge}
                    </Button>
                    <MenuTrigger
                      disabled={actionPending || !headerActions.mergeMethods}
                      render={
                        <Button
                          size="icon"
                          variant="default"
                          aria-label={t.git.pullRequest.mergeMethod}
                        />
                      }
                    >
                      <ChevronDownIcon aria-hidden className="size-3.5" />
                    </MenuTrigger>
                  </Group>
                  <MenuPopup align="start">
                    <MenuRadioGroup
                      value={selectedMergeMethod}
                      onValueChange={(method) => {
                        const selectedMethod = method as PullRequestMergeMethod;
                        setMergeMethod(selectedMethod);
                        setLastSelectedMergeMethod(selectedMethod);
                      }}
                    >
                      {allowedMergeMethods.map((method) => (
                        <MenuRadioItem
                          key={method}
                          value={method}
                          disabled={actionPending}
                          closeOnClick
                        >
                          {PULL_REQUEST_MERGE_METHOD_LABELS[method]}
                        </MenuRadioItem>
                      ))}
                    </MenuRadioGroup>
                  </MenuPopup>
                </Menu>
                <Menu>
                  <MenuTrigger
                    disabled={actionPending || !freshness?.methods.length}
                    render={
                      <Button variant={freshness?.methods.length ? "default" : "secondary"} />
                    }
                  >
                    {t.git.pullRequest.updateBranch}
                  </MenuTrigger>
                  <MenuPopup align="start">
                    {freshness?.methods.map((method) => (
                      <MenuItem
                        key={method}
                        disabled={actionPending}
                        onClick={() => void perform("update-branch", undefined, method)}
                      >
                        {method === "rebase"
                          ? t.git.pullRequest.updateWithRebase
                          : t.git.pullRequest.updateBranch}
                      </MenuItem>
                    ))}
                  </MenuPopup>
                </Menu>
                {checkoutControl}
                <Menu>
                  <MenuTrigger
                    render={
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={t.git.pullRequest.morePullRequestActions}
                      />
                    }
                  >
                    {refreshing ? (
                      <RefreshIcon refreshing size="md" />
                    ) : (
                      <MoreHorizontalIcon aria-hidden className="size-4" />
                    )}
                  </MenuTrigger>
                  <MenuPopup align="end" className="w-42.5">
                    <MenuItem
                      density="compact"
                      closeOnClick={
                        headerActions.disableAutoMerge || inlineConfirm.isArmed("enable-auto-merge")
                      }
                      disabled={
                        actionPending ||
                        !(headerActions.enableAutoMerge || headerActions.disableAutoMerge)
                      }
                      aria-label={
                        headerActions.disableAutoMerge
                          ? t.git.pullRequest.disableAutoMerge
                          : inlineConfirm.isArmed("enable-auto-merge")
                            ? t.git.pullRequest.confirmAutoMerge
                            : t.git.pullRequest.enableAutoMerge
                      }
                      {...(headerActions.disableAutoMerge
                        ? { onClick: () => void perform("disable-auto-merge") }
                        : inlineConfirm.props(
                            "enable-auto-merge",
                            () => void perform("enable-auto-merge", selectedMergeMethod),
                          ))}
                    >
                      <PullRequestGlyph.merged aria-hidden className="size-3.5" />
                      {headerActions.disableAutoMerge
                        ? t.git.pullRequest.disableAutoMerge
                        : pendingAction === "enable-auto-merge"
                          ? t.git.pullRequest.enabling
                          : inlineConfirm.isArmed("enable-auto-merge")
                            ? t.git.pullRequest.confirmAutoMerge
                            : t.git.pullRequest.autoMerge}
                    </MenuItem>
                    <MenuItem
                      density="compact"
                      disabled={actionPending || !headerActions.ready}
                      onClick={() => void perform("ready")}
                    >
                      <EyeIcon aria-hidden className="size-3.5" />
                      {t.git.pullRequest.readyForReview}
                    </MenuItem>
                    <MenuItem
                      density="compact"
                      disabled={actionPending || !headerActions.draft}
                      onClick={() => void perform("draft")}
                    >
                      <PullRequestGlyph.draft aria-hidden className="size-3.5" />
                      {t.git.pullRequest.convertToDraft}
                    </MenuItem>
                    <MenuItem
                      density="compact"
                      closeOnClick={inlineConfirm.isArmed("revert")}
                      disabled={actionPending || detail.state !== "merged" || !can("revert")}
                      variant={inlineConfirm.isArmed("revert") ? "destructive" : "default"}
                      {...inlineConfirm.props("revert", () => void perform("revert"))}
                    >
                      <Undo2Icon aria-hidden className="size-3.5" />
                      {inlineConfirm.isArmed("revert")
                        ? t.git.pullRequest.confirmRevert
                        : t.git.pullRequest.revertChanges}
                    </MenuItem>
                    <MenuSeparator />
                    <MenuItem
                      density="compact"
                      disabled={actionPending || detail.state !== "closed" || !can("reopen")}
                      onClick={() => void perform("reopen")}
                    >
                      <PullRequestGlyph.reopen aria-hidden className="size-3.5" />
                      {t.git.pullRequest.reopen}
                    </MenuItem>
                    <MenuItem
                      density="compact"
                      closeOnClick={inlineConfirm.isArmed("close")}
                      variant="destructive"
                      disabled={actionPending || detail.state !== "open" || !can("close")}
                      {...inlineConfirm.props("close", () => void perform("close"))}
                    >
                      <PullRequestGlyph.closed aria-hidden className="size-3.5" />
                      {inlineConfirm.isArmed("close")
                        ? t.git.pullRequest.confirmClose
                        : t.git.pullRequest.close}
                    </MenuItem>
                    <MenuSeparator />
                    {conflicting ? (
                      <MenuItem
                        density="compact"
                        disabled={
                          handoff !== null || (attachTarget === null && checkoutRoot === null)
                        }
                        onClick={startResolveConflicts}
                      >
                        <PullRequestGlyph.conflicting aria-hidden className="size-3.5" />
                        {handoff === "conflicts"
                          ? t.git.pullRequest.preparing
                          : t.git.pullRequest.resolveConflicts}
                      </MenuItem>
                    ) : null}
                    <PullRequestThreadLinks
                      display="menu-item"
                      environmentId={environmentId}
                      reference={reference}
                      url={detail.url}
                      threadRef={
                        threadRef ??
                        (typeof composerDraftTarget === "object" ? composerDraftTarget : null)
                      }
                      onPickerOpenChange={setThreadPickerOpen}
                    />
                    <MenuItem
                      density="compact"
                      disabled={refreshing}
                      onClick={() => void refreshFromHost()}
                    >
                      <RefreshIcon size="sm" refreshing={refreshing} />
                      {t.git.pullRequest.refresh}
                    </MenuItem>
                    <MenuItem
                      density="compact"
                      disabled={handoff !== null || !canFixFindings}
                      onClick={startFixFindings}
                    >
                      <HammerIcon aria-hidden className="size-3.5" />
                      {handoff === "findings"
                        ? t.git.pullRequest.preparing
                        : handoffLabels.fixFindings}
                    </MenuItem>
                    {reviewGuidesEnabled && guideWriter.canWrite ? (
                      <MenuItem
                        density="compact"
                        disabled={guideWriter.running}
                        onClick={writeGuide}
                      >
                        <PixelSparkIcon aria-hidden className="size-3.5" />
                        {guideWriter.running
                          ? "Writing guide..."
                          : guideWriter.data?.guide == null
                            ? "Write guide"
                            : "Rewrite guide"}
                      </MenuItem>
                    ) : null}
                    {pickableEnvironments.length > 0 ? (
                      <ActOnEnvironmentPicker
                        environments={pickableEnvironments}
                        value={actingEnvironmentId}
                        onChange={(next) => setActingScope({ pullRequestKey, environmentId: next })}
                        disabled={handoff !== null}
                      />
                    ) : null}
                    {showsDeleteBranch ? (
                      <>
                        <MenuSeparator />
                        <MenuItem
                          variant="destructive"
                          disabled={actionPending || !environmentConnected}
                          onClick={() => void confirmDeleteBranch()}
                        >
                          <Trash2Icon className="mt-1 size-3.5 shrink-0 self-start" />
                          <span className="flex min-w-0 flex-col">
                            <span>
                              {pendingAction === "delete-branch"
                                ? t.git.branchDeletionUi.deleting
                                : t.git.branchDeletionUi.delete}
                            </span>
                            <span className="truncate text-xs text-muted-foreground">
                              {environmentConnected
                                ? detail.headBranch
                                : t.git.branchDeletionUi.reconnect}
                            </span>
                          </span>
                        </MenuItem>
                      </>
                    ) : null}
                    <MenuSeparator />
                    <MenuItem
                      density="compact"
                      onClick={() => void readLocalApi()?.shell.openExternal(detail.url)}
                    >
                      <ArrowUpRightIcon aria-hidden className="size-3.5" />
                      {openOnHostLabel(hostClient)}
                    </MenuItem>
                    {repositoryUrl ? (
                      <MenuItem
                        density="compact"
                        onClick={() => void readLocalApi()?.shell.openExternal(repositoryUrl)}
                      >
                        <FolderGit2Icon aria-hidden className="size-3.5" />
                        {t.git.pullRequest.openRepository(detail.repository)}
                      </MenuItem>
                    ) : null}
                  </MenuPopup>
                </Menu>
                {!nativeStack && supportsStackActions && nativeStackQuery.error ? (
                  <Button variant="ghost" size="xs" onClick={nativeStackQuery.refresh}>
                    {t.git.pullRequest.retryStackLookup}
                  </Button>
                ) : null}
                {nativeStack ? (
                  <PullRequestStackMenu
                    hostLabel={hostClient.label}
                    stack={nativeStack}
                    notice={nativeStackQuery.notice}
                    onRetry={nativeStackQuery.error ? nativeStackQuery.refresh : undefined}
                    reference={reference}
                    environmentId={environmentId}
                    onSelect={onSelectPullRequest}
                    mergeMethod={selectedMergeMethod}
                    canMerge={
                      nativeStackQuery.isFresh &&
                      supportsStackActions &&
                      can("merge") &&
                      allowedMergeMethods.length > 0
                    }
                    canRebase={
                      nativeStackQuery.isFresh &&
                      supportsStackActions &&
                      detail.viewerPermissions.stackRebase === true
                    }
                    onActed={() => {
                      refreshDetail();
                      onActed?.();
                    }}
                  />
                ) : null}
                {context === "page" ? (
                  <PullRequestThreadLinks
                    display="count"
                    environmentId={environmentId}
                    reference={reference}
                    url={detail.url}
                    threadRef={null}
                  />
                ) : null}

                {autoMergeArmed ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Badge variant="info" role="img" aria-label={armedAutoMergeLabel}>
                          {armedAutoMergeLabel}
                        </Badge>
                      }
                    />
                    <TooltipPopup>
                      {armedAutoMergeLabel}
                      {t.git.pullRequest.theHostWillMergeThisOnItsOwnOnceItsRequirementsAreMet}
                    </TooltipPopup>
                  </Tooltip>
                ) : null}
              </div>
            </div>
          ) : null}
        </TooltipProvider>
        {detail ? (
          <PullRequestDetailTabBar
            tabs={visibleTabs}
            value={tab}
            onValueChange={selectTab}
            onTabIntent={(item) => {
              if (item === "code") void loadCodeTab();
            }}
          >
            {tab === "summary" ? (
              showsApproveWorkflows ? (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span className="ml-auto inline-flex shrink-0">
                        <Button
                          size="xs"
                          variant="warning-outline"
                          disabled={actionPending}
                          {...inlineConfirm.props(
                            "approve-workflows",
                            () => void perform("approve-workflows"),
                          )}
                          aria-label={
                            pendingAction === "approve-workflows"
                              ? t.git.pullRequest.approving
                              : inlineConfirm.isArmed("approve-workflows")
                                ? t.git.pullRequest.confirmApprove
                                : t.git.pullRequest.approveWorkflowsToRun
                          }
                        >
                          <PlayIcon aria-hidden className="size-3.5" />
                          <span className="inline-grid">
                            <span aria-hidden className="invisible col-start-1 row-start-1">
                              {t.git.pullRequest.approveWorkflowsToRun}
                            </span>
                            <span aria-hidden className="invisible col-start-1 row-start-1">
                              {t.git.pullRequest.confirmApprove}
                            </span>
                            <span className="col-start-1 row-start-1">
                              {pendingAction === "approve-workflows"
                                ? t.git.pullRequest.approving
                                : inlineConfirm.isArmed("approve-workflows")
                                  ? t.git.pullRequest.confirmApprove
                                  : t.git.pullRequest.approveWorkflowsToRun}
                            </span>
                          </span>
                        </Button>
                      </span>
                    }
                  />
                  <TooltipPopup side="top">
                    {pendingAction === "approve-workflows"
                      ? t.git.pullRequest.approving
                      : inlineConfirm.isArmed("approve-workflows")
                        ? t.git.pullRequest.confirmApprove
                        : t.git.pullRequest.approveWorkflowsToRun}
                  </TooltipPopup>
                </Tooltip>
              ) : (
                <PullRequestChecksStatusLine
                  className="text-muted-foreground"
                  aria-label={
                    checksSummary
                      ? t.git.pullRequest.checksSummary(checksSummary)
                      : t.git.pullRequest.checks
                  }
                  icon={
                    checksState !== null ? (
                      <PullRequestChecksPopover
                        checks={detail.checks}
                        stale={checksStale}
                        checksState={checksState}
                        threadRef={threadRef}
                      />
                    ) : (
                      <CircleDotIcon aria-hidden className="size-3.5" />
                    )
                  }
                  label={checksSummary}
                />
              )
            ) : tab === "timeline" ? (
              <div className="ml-auto flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                <PullRequestMetaLine
                  className={cn(
                    "whitespace-nowrap text-2xs transition-opacity",
                    (activityPending || activityError) && "opacity-35",
                  )}
                >
                  <span
                    className="inline-flex items-center gap-1"
                    aria-label={
                      activityError
                        ? t.git.pullRequest.commentsUnavailable
                        : t.git.pullRequest.commentCount(detail.commentCount)
                    }
                  >
                    <MessageSquareIcon aria-hidden className="size-3" />
                    {activityError
                      ? "—"
                      : activityPending
                        ? "…"
                        : detail.commentCount.toLocaleString()}
                  </span>
                  <span
                    className="inline-flex items-center gap-1"
                    aria-label={
                      activityError
                        ? t.git.pullRequest.commitsUnavailable
                        : t.git.pullRequest.commitCount(detail.commits.length)
                    }
                  >
                    <GitCommitHorizontalIcon aria-hidden className="size-3" />
                    {activityError
                      ? "—"
                      : activityPending
                        ? "…"
                        : detail.commits.length.toLocaleString()}
                  </span>
                  {approvalCount > 0 ? (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1",
                        pullRequestReviewOutcomeToneClassName("approved"),
                      )}
                    >
                      <PullRequestReviewOutcomeIcon outcome="approved" className="size-3" />
                      {approvalCount.toLocaleString()}
                      <span className="sr-only">
                        {t.git.pullRequest.approvalWord(approvalCount)}
                      </span>
                    </span>
                  ) : null}
                </PullRequestMetaLine>
                <Button
                  size="xs"
                  variant="ghost-muted"
                  aria-label={
                    timelineOrder === "newest"
                      ? t.git.pullRequest.showOldestActivityFirst
                      : t.git.pullRequest.showNewestActivityFirst
                  }
                  onClick={() =>
                    setTimelineOrder((value) => (value === "newest" ? "oldest" : "newest"))
                  }
                >
                  <ArrowDownUpIcon aria-hidden className="size-3" />
                  {timelineOrder === "newest"
                    ? t.git.pullRequest.newestFirst
                    : t.git.pullRequest.oldestFirst}
                </Button>
              </div>
            ) : null}
          </PullRequestDetailTabBar>
        ) : null}
      </div>

      <div
        className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
        onScrollCapture={(event) => {
          const scroller = scrollerByTab.current[tab];
          if (event.target !== scroller || scroller === null || scroller === undefined) return;
          const top = scroller.scrollTop;
          // Decided here, not in a state updater, which React may run during render.
          const previous = condensedByTab[tab] ?? false;
          const foldHeight = foldRef.current?.scrollHeight ?? 0;
          let next = previous;
          if (previous) {
            if (top < 4 && foldHeight > 0) next = false;
          } else if (foldHeight > 0 && top > foldHeight + 32) {
            const chromeDelta = foldHeight - (condensedRowRef.current?.scrollHeight ?? 0);
            compensationRef.current = { tab, scroller, target: top - chromeDelta };
            next = true;
          }
          if (next !== previous) setCondensedByTab({ ...condensedByTab, [tab]: next });
        }}
      >
        {detailQuery.error && !detail ? (
          <PullRequestsUnavailableState
            {...(isPullRequestNotFound(detailQuery.failure)
              ? {
                  title: t.git.pullRequest.requestNotFound(reference.number),
                  error:
                    t.git.pullRequest.itMayBeAnIssueRatherThanAPullRequestOrThisAccountCanTSeeIt,
                }
              : { error: detailQuery.error })}
            refreshing={detailQuery.isPending}
            onRetry={refreshDetail}
            {...(unavailableGitHubUrl ? { gitHubUrl: unavailableGitHubUrl } : {})}
          />
        ) : detail ? (
          <PullRequestMarkdownContext value={markdownContext}>
            {mountedTabs.has("summary") ? (
              <div className={cn("absolute inset-0", tab !== "summary" && "invisible")}>
                <PullRequestSummaryTab
                  scrollerRef={scrollerRefs.summary}
                  environmentId={environmentId}
                  threadRef={threadRef}
                  reference={reference}
                  detail={detail}
                  activityPending={activityPending}
                  checksStale={checksStale}
                  activityError={activityError}
                  pendingFinding={handoff}
                  fixFindingLabel={handoffLabels.fixFinding}
                  fixCheckLabel={handoffLabels.fixCheck}
                  {...(canFixFindings ? { onFixFinding: startFixFinding } : {})}
                  onRefresh={refreshDetail}
                  onRefreshChecks={refreshFromHost}
                />
              </div>
            ) : null}
            {mountedTabs.has("guide") ? (
              <div className={cn("absolute inset-0", tab !== "guide" && "invisible")}>
                <PullRequestGuideTab
                  environmentId={environmentId}
                  reference={reference}
                  active={tab === "guide"}
                  title={detail.title}
                  workspaceRoot={detail.workspaceRoot}
                  canComment={
                    detail.capabilities.review.inlineComment && detail.viewerPermissions.comment
                  }
                  onAskAboutLines={(comment, request) =>
                    addSelectionToAgent({ comment, request }, { keepGuide: true })
                  }
                  onAskAboutStop={askAboutGuideStop}
                  onFinishReview={
                    detail.capabilities.review.verdicts.some((verdict) =>
                      detail.viewerPermissions.verdicts.includes(verdict),
                    )
                      ? () => setOpenReviewRequest((count) => count + 1)
                      : null
                  }
                  onOpenFile={openFileInCode}
                  onTourShown={onGuideShown}
                />
              </div>
            ) : null}
            {mountedTabs.has("timeline") ? (
              <div className={cn("absolute inset-0", tab !== "timeline" && "invisible")}>
                {activityPending ? (
                  <PullRequestTimelineGhost />
                ) : activityError ? (
                  <PullRequestActivityUnavailableState
                    error={activityError}
                    onRetry={activityQuery.refresh}
                  />
                ) : (
                  <PullRequestTimelineTab
                    scrollerRef={scrollerRefs.timeline}
                    detail={detail}
                    environmentId={environmentId}
                    threadRef={threadRef}
                    reference={reference}
                    order={timelineOrder}
                    onOpenCommit={openCommit}
                    onRefresh={refreshDetail}
                  />
                )}
              </div>
            ) : null}
            {mountedTabs.has("code") ? (
              <div className={cn("absolute inset-0", tab !== "code" && "invisible")}>
                <Suspense
                  fallback={
                    <DiffPanelLoadingState label={t.git.pullRequest.loadingPullRequestDiff} />
                  }
                >
                  <PullRequestCodeTab
                    scrollerRef={scrollerRefs.code}
                    onAddToAgentSelection={addSelectionToAgent}
                    environmentId={environmentId}
                    reference={reference}
                    detail={detail}
                    selectedCommitOid={selectedCodeCommitOid}
                    onSelectedCommitChange={selectCodeCommit}
                    pendingFinding={handoff}
                    fixFindingLabel={handoffLabels.fixFinding}
                    {...(canFixFindings ? { onFixFinding: startFixFinding } : {})}
                    onRefresh={refreshDetail}
                    refreshToken={refreshToken}
                    backgroundRefreshToken={turnRefresh ?? 0}
                    revealRequest={codeRevealRequest}
                  />
                </Suspense>
              </div>
            ) : null}
          </PullRequestMarkdownContext>
        ) : null}
      </div>

      {detail ? (
        <div className="absolute right-4 bottom-3 z-20">
          <PullRequestComposer
            key={JSON.stringify([
              environmentId,
              reference.projectId,
              reference.host,
              reference.repository,
              reference.number,
            ])}
            environmentId={environmentId}
            reference={reference}
            detail={detail}
            actionPending={actionPending}
            onCommentAction={performCommentAction}
            onCommented={refreshDetail}
            onReviewSubmitted={refreshDetail}
            openReviewRequest={openReviewRequest}
          />
        </div>
      ) : null}
    </div>
  );
}
