/** Owns use pull request actions on the web pull-request surface; host data and agent context remain unchanged. */
import { t } from "~/i18n";
import { useAtomCommand } from "~/state/use-atom-command";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type {
  EnvironmentId,
  ProjectId,
  PullRequestAction,
  PullRequestDetail,
  PullRequestMergeMethod,
  PullRequestRef,
} from "@t3tools/contracts";
import { useRef, useState } from "react";
import { type ChangeRequestTerminology } from "@t3tools/client-runtime/source-control-clients";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";
import { useClientSettings, useEnvironmentSettings } from "~/hooks/useSettings";
import {
  deriveLogicalProjectKeyFromSettings,
  derivePhysicalProjectKey,
  selectProjectGroupingSettings,
} from "@t3tools/client-runtime/state/project-grouping";
import { buildPhysicalToLogicalProjectKeyMap } from "~/sidebarProjectGrouping";
import { useProjects } from "~/state/entities";
import { usePrimaryEnvironmentId } from "~/state/environments";

import { type DraftId, useComposerDraftStore } from "~/composerDraftStore";
import { useNewThreadHandler } from "~/hooks/useHandleNewThread";
import { usePreparePullRequestThreadAction } from "~/state/sourceControlActions";
import type { ReviewCommentContext } from "~/reviewCommentContext";
import { pullRequestEnvironment } from "~/state/pullRequests";

import { toastManager } from "../ui/toast";
import {
  checkoutFailureDescription,
  handoffPrompt,
  handoffReviewComments,
  readableFailure,
} from "./pullRequestDetail.logic";
import { pullRequestEntryKey, type EnvironmentPullRequestEntry } from "./pullRequestList.logic";

/**
 * Resolves the project preference before legacy client overrides. Callers determine the final
 * merge method by combining that preference with host-supported methods and the last selection.
 * @param environmentId Environment whose settings own the project preference.
 * @param projectId Project to resolve, or null for the environment-level default.
 * @returns A resolver yielding the configured merge method, or undefined when none is configured.
 */
export function usePullRequestDefaultMergeMethodResolver(
  environmentId: EnvironmentId,
  projectId: ProjectId | null,
) {
  const projectDefault = useEnvironmentSettings(
    environmentId,
    (settings) => resolveProjectSettings(settings, projectId).settings.pullRequestMergeMethod,
  );
  const legacyOverrides = useClientSettings((settings) => settings.pullRequestMergeMethodOverrides);
  const grouping = useClientSettings(selectProjectGroupingSettings);
  const projects = useProjects();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  return () => {
    if (projectDefault != null) return projectDefault;
    if (Object.keys(legacyOverrides).length === 0) return undefined;
    const project = projects.find(
      (candidate) => candidate.environmentId === environmentId && candidate.id === projectId,
    );
    if (!project) return undefined;
    const key =
      buildPhysicalToLogicalProjectKeyMap({
        projects,
        settings: grouping,
        primaryEnvironmentId,
      }).get(derivePhysicalProjectKey(project)) ??
      deriveLogicalProjectKeyFromSettings(project, grouping);
    return legacyOverrides[key];
  };
}

const ACTION_SUCCESS_LABELS: Record<PullRequestAction, string> = {
  merge: t.git.pullRequest.mergeRequested,
  ready: t.git.pullRequest.markedReadyForReview,
  draft: t.git.pullRequest.convertedToDraft,
  close: t.git.pullRequest.pullRequestClosed,
  reopen: t.git.pullRequest.pullRequestReopened,
  "update-branch": t.git.pullRequest.branchUpdatedWithTheBaseBranch,
  "enable-auto-merge": t.git.pullRequest.autoMergeEnabled,
  "disable-auto-merge": t.git.pullRequest.autoMergeDisabled,
  revert: t.git.pullRequest.revertPullRequestOpened,
  "approve-workflows": t.git.pullRequest.workflowsApproved,
  get "delete-branch"() {
    return t.git.branchDeletionUi.deleted;
  },
};

const ACTION_FAILURE_LABELS: Record<PullRequestAction, string> = {
  merge: t.git.pullRequest.couldNotMergeThisPullRequest,
  ready: t.git.pullRequest.couldNotMarkThisReadyForReview,
  draft: t.git.pullRequest.couldNotConvertThisToADraft,
  close: t.git.pullRequest.couldNotCloseThisPullRequest,
  reopen: t.git.pullRequest.couldNotReopenThisPullRequest,
  "update-branch": t.git.pullRequest.couldNotUpdateThisBranch,
  "enable-auto-merge": t.git.pullRequest.couldNotEnableAutoMerge,
  "disable-auto-merge": t.git.pullRequest.couldNotDisableAutoMerge,
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
  "update-branch":
    t.git.pullRequest
      .theHostRefusedItCheckThatYouHaveWriteAccessAndThatTheBaseBranchHasNotDivergedInAWayTh,
  "enable-auto-merge":
    t.git.pullRequest
      .theHostRefusedItCheckThatAutoMergeIsEnabledForThisRepositoryAndThatYouHaveWriteAccess,
  "disable-auto-merge":
    t.git.pullRequest.theHostRefusedItCheckThatYouHaveWriteAccessToThisRepository,
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

/** Runs host actions with optimistic row state and rolls it back when the scoped command fails. */
export function usePullRequestActionRunner({
  environmentId,
  reference,
  onSuccess,
  resolveMergeMethod,
}: {
  environmentId: EnvironmentId;
  reference: PullRequestRef | null;
  terminology: ChangeRequestTerminology;
  onSuccess?: (action: PullRequestAction) => void;
  /** Resolve repository settings on click to avoid per-row reads. */
  resolveMergeMethod?: (detail: PullRequestDetail) => PullRequestMergeMethod;
}) {
  const runAction = useAtomCommand(pullRequestEnvironment.runAction, {
    reportFailure: false,
  });
  const [actionPending, setActionPending] = useState(false);
  const pendingRef = useRef(false);

  const perform = async (action: PullRequestAction, method?: PullRequestMergeMethod) => {
    if (pendingRef.current || reference === null) return;
    pendingRef.current = true;
    setActionPending(true);
    const result = await runAction({
      environmentId,
      input: {
        ...reference,
        action,
        ...(method ? { mergeMethod: method } : resolveMergeMethod ? { resolveMergeMethod } : {}),
      },
    });
    pendingRef.current = false;
    setActionPending(false);
    if (result._tag === "Failure") {
      toastManager.add({
        type: "error",
        title: ACTION_FAILURE_LABELS[action],
        description: readableFailure(
          squashAtomCommandFailure(result),
          ACTION_FAILURE_HINTS[action],
        ),
      });
      return;
    }
    toastManager.add({ type: "success", title: ACTION_SUCCESS_LABELS[action] });
    onSuccess?.(action);
  };

  return { actionPending, perform };
}

/** Queue a close sweep through the same environment lanes as individual actions.
 * @param onClosed Callback invoked with each request entry after it closes successfully.
 * @returns The closing-key set and a close callback that notifies onClosed after each successful close.
 */
export function usePullRequestCloseBatch(onClosed: (entry: EnvironmentPullRequestEntry) => void) {
  const runAction = useAtomCommand(pullRequestEnvironment.runAction, { reportFailure: false });
  const pending = useRef(new Set<string>());
  const [closingKeys, setClosingKeys] = useState<ReadonlySet<string>>(() => new Set());
  const close = async (entries: readonly EnvironmentPullRequestEntry[]) => {
    const batch = entries.filter((entry) => {
      const key = pullRequestEntryKey(entry);
      if (entry.state !== "open" || pending.current.has(key)) return false;
      pending.current.add(key);
      return true;
    });
    if (batch.length === 0) return;
    setClosingKeys(new Set(pending.current));
    const failures: string[] = [];
    const outcomes = await Promise.all(
      batch.map(async (entry) => {
        const result = await runAction({
          environmentId: entry.environmentId,
          input: {
            projectId: entry.projectId,
            host: entry.host,
            repository: entry.repository,
            number: entry.number,
            action: "close",
          },
        });
        pending.current.delete(pullRequestEntryKey(entry));
        setClosingKeys(new Set(pending.current));
        if (result._tag === "Failure") {
          failures.push(
            `#${entry.number}: ${readableFailure(squashAtomCommandFailure(result), ACTION_FAILURE_HINTS.close)}`,
          );
          return;
        }
        onClosed(entry);
        return true;
      }),
    );
    const closed = outcomes.filter(Boolean).length;
    toastManager.add({
      type: failures.length > 0 ? "error" : "success",
      title:
        failures.length > 0
          ? t.git.pullRequest.closedBatch(closed, batch.length)
          : t.git.pullRequest.closedCount(closed),
      ...(failures.length > 0 ? { description: failures.slice(0, 3).join("\n") } : {}),
    });
  };
  return { close, closingKeys };
}

export interface PullRequestThreadTask {
  prompt: string;
  reviewComments?: ReadonlyArray<ReviewCommentContext>;
}

export type PullRequestHandoffDetail = Pick<
  PullRequestDetail,
  "projectId" | "workspaceRoot" | "url"
>;

const lastHandoffPromptByDraft = new Map<DraftId, string>();

/**
 * The hand-offs from a pull request into a thread: a question that needs nothing checked out, and
 * a task that needs the branch under the agent's feet first. One `handoff` key holds them all to
 * one at a time, whatever surface pressed the button.
 * @param props Display data, state, options, and interaction callbacks defined by this surface's props type.
 * @returns Question, checkout, and handoff callbacks plus their in-flight state.
 */
export function usePullRequestHandoffs({
  environmentId,
  detail,
}: {
  environmentId: EnvironmentId;
  detail: PullRequestHandoffDetail | null;
}) {
  const newThread = useNewThreadHandler();
  const prepareThread = usePreparePullRequestThreadAction({
    environmentId,
    cwd: detail?.workspaceRoot ?? null,
  });
  // Serialize all handoffs because they check out the same pull request.
  const [handoff, setHandoff] = useState<string | null>(null);

  // Questions must not change checkouts or create worktrees.
  const openThreadWithTask = async (
    projectRef: ReturnType<typeof scopeProjectRef>,
    task: PullRequestThreadTask | null,
    opened?: { draftId: DraftId },
  ): Promise<{ draftId: DraftId } | null> => {
    const session =
      opened ??
      (await newThread(projectRef).then(
        (result) => result,
        () => null,
      ));
    if (session === null) return null;
    const store = useComposerDraftStore.getState();
    if (task === null) return session;
    const draft = store.getComposerDraft(session.draftId);
    const existingComments = draft?.reviewComments ?? [];
    const prompt = handoffPrompt(
      {
        prompt: draft?.prompt ?? "",
        lastHandoffPrompt: lastHandoffPromptByDraft.get(session.draftId),
      },
      task.prompt,
    );
    // Track only the handoff contribution so later handoffs preserve user text.
    lastHandoffPromptByDraft.set(session.draftId, task.prompt);
    store.setPrompt(session.draftId, prompt);
    store.setReviewComments(
      session.draftId,
      handoffReviewComments(existingComments, task.reviewComments ?? []),
    );
    return session;
  };

  const startAsk = async (kind: string, task: PullRequestThreadTask) => {
    if (!detail || handoff !== null) return;
    setHandoff(kind);
    const projectRef = scopeProjectRef(environmentId, detail.projectId);
    const opened = await openThreadWithTask(projectRef, task);
    setHandoff(null);
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
    task: PullRequestThreadTask | null,
    mode: "worktree" | "local" = "worktree",
  ) => {
    if (!detail || handoff !== null) return;
    setHandoff(kind);
    // Explicit timeouts survive toast updates and would pin the result after loading.
    const toastId = toastManager.add({
      type: "loading",
      title: t.git.pullRequest.preparingThePullRequestCheckout,
    });
    const projectRef = scopeProjectRef(environmentId, detail.projectId);
    // Checkout setup requires the thread to exist first.
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
      reference: detail.url,
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

  return { handoff, startAsk, startHandoff };
}
