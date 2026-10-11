/** Builds display choices and progress for Git controls without changing action discriminants. */
import { t } from "~/i18n";
import type {
  GitRunStackedActionResult,
  GitStackedAction,
  VcsStatusResult,
} from "@t3tools/contracts";
import { isTemporaryWorktreeBranch } from "@t3tools/shared/git";
import { sourceControlClients } from "@t3tools/client-runtime/source-control-clients";
import type { ChangeRequestTerminology } from "@t3tools/client-runtime/source-control-clients";

export type GitActionIconName = "commit" | "push" | "pr";

export type GitDialogAction = "commit" | "push" | "create_pr";

export interface GitActionMenuItem {
  id: "commit" | "push" | "pr";
  label: string;
  disabled: boolean;
  icon: GitActionIconName;
  kind: "open_dialog";
  dialogAction?: GitDialogAction;
}

export interface GitQuickAction {
  label: string;
  disabled: boolean;
  kind: "run_action" | "run_pull" | "open_publish" | "show_hint";
  action?: GitStackedAction;
  hint?: string;
}

export interface DefaultBranchActionDialogCopy {
  title: string;
  description: string;
  continueLabel: string;
}

export interface GitActionProgressPresentation {
  readonly status: string;
  readonly output: string | null;
  readonly startedAtMs: number | null;
}

export interface GitActionResultToastTiming {
  readonly timeout: 0;
  readonly dismissAfterVisibleMs: number | null;
}

export type DefaultBranchConfirmableAction =
  | "push"
  | "create_pr"
  | "commit_push"
  | "commit_push_pr";

export const GIT_ACTION_SUCCESS_VISIBLE_MS = 10_000;

export function resolveGitActionResultToastTiming(
  type: "error" | "success",
): GitActionResultToastTiming {
  return {
    timeout: 0,
    dismissAfterVisibleMs: type === "success" ? GIT_ACTION_SUCCESS_VISIBLE_MS : null,
  };
}

function resolveChangeRequestTerminology(
  gitStatus: VcsStatusResult | null,
): ChangeRequestTerminology {
  return sourceControlClients.get(gitStatus?.sourceControlProvider?.kind).changeRequest;
}

/**
 * Builds inline progress for a running pull or source-control action; returns null for other operations or completed actions.
 * @param input Operation-specific state and options described by the input type.
 * @returns Inline status, optional hook output, and start time; null when this action has no inline progress.
 */
export function resolveGitActionProgressPresentation(input: {
  readonly isRunning: boolean;
  readonly operation: string | null;
  readonly currentLabel: string | null;
  readonly lastOutputLine: string | null;
  readonly phaseStartedAtMs: number | null;
  readonly hookStartedAtMs: number | null;
}): GitActionProgressPresentation | null {
  if (
    !input.isRunning ||
    (input.operation !== "run_change_request" && input.operation !== "pull")
  ) {
    return null;
  }

  const currentLabel = input.currentLabel?.trim();
  const output = input.lastOutputLine?.trim();
  const isPull = input.operation === "pull";
  return {
    status:
      currentLabel && currentLabel !== t.git.actions.runningSourceControlAction
        ? currentLabel
        : isPull
          ? t.git.actions.pullingLatestChanges
          : t.git.actions.startingSourceControlAction,
    output: !isPull && output ? output : null,
    startedAtMs: isPull
      ? input.phaseStartedAtMs
      : (input.hookStartedAtMs ?? input.phaseStartedAtMs),
  };
}

/**
 * Formats elapsed action time in seconds or minutes; returns null when no start time is available.
 * @param startedAtMs Action start time in epoch milliseconds, or null when no action is timed.
 * @param nowMs Current time in epoch milliseconds.
 * @returns Elapsed display text, or null when the start time is absent.
 */
export function formatGitActionElapsed(startedAtMs: number | null, nowMs: number): string | null {
  if (startedAtMs === null) {
    return null;
  }

  const elapsedSeconds = Math.max(0, Math.floor((nowMs - startedAtMs) / 1_000));
  if (elapsedSeconds < 60) {
    return t.git.actions.elapsedSeconds(elapsedSeconds);
  }

  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  return t.git.actions.elapsedMinutes(minutes, seconds);
}

/**
 * Builds ordered progress labels for the requested action and repository state.
 * @param input Operation-specific state and options described by the input type.
 * @returns Progress labels in execution order; omitted stages have no work in this action.
 */
export function buildGitActionProgressStages(input: {
  action: GitStackedAction;
  hasCustomCommitMessage: boolean;
  hasWorkingTreeChanges: boolean;
  pushTarget?: string;
  featureBranch?: boolean;
  shouldPushBeforePr?: boolean;
  terminology?: ChangeRequestTerminology;
}): string[] {
  const terminology = input.terminology ?? sourceControlClients.get(undefined).changeRequest;
  const branchStages = input.featureBranch ? [t.git.actions.preparingFeatureRef] : [];
  const pushStage = input.pushTarget
    ? t.git.actions.pushTo(input.pushTarget)
    : t.git.actions.pushing;
  const prStages = [
    t.git.actions.prepareRequest(terminology.shortLabel),
    t.git.actions.generateRequest(terminology.shortLabel),
    t.git.actions.creatingRequest(terminology.singular),
  ];

  if (input.action === "push") {
    return [pushStage];
  }
  if (input.action === "create_pr") {
    return input.shouldPushBeforePr ? [pushStage, ...prStages] : prStages;
  }

  const shouldIncludeCommitStages = input.action === "commit" || input.hasWorkingTreeChanges;
  const commitStages = !shouldIncludeCommitStages
    ? []
    : input.hasCustomCommitMessage
      ? [t.git.actions.committing]
      : [t.git.actions.generatingCommitMessage, t.git.actions.committing];
  if (input.action === "commit") {
    return [...branchStages, ...commitStages];
  }
  if (input.action === "commit_push") {
    return [...branchStages, ...commitStages, pushStage];
  }
  return [...branchStages, ...commitStages, pushStage, ...prStages];
}

/**
 * Builds commit, push, and change-request menu entries; returns an empty list when Git status is unavailable.
 * @param gitStatus Current repository status, or null when status has not loaded.
 * @param isBusy Whether another Git action prevents execution.
 * @param hasPrimaryRemote Whether the repository has a primary remote; defaults to true.
 * @returns Menu entries with stable action ids and current display labels; empty when Git status is absent.
 */
export function buildMenuItems(
  gitStatus: VcsStatusResult | null,
  isBusy: boolean,
  hasPrimaryRemote = true,
): GitActionMenuItem[] {
  if (!gitStatus) return [];
  const terminology = resolveChangeRequestTerminology(gitStatus);

  const hasBranch = gitStatus.refName !== null;
  const hasChanges = gitStatus.hasWorkingTreeChanges;
  const hasOpenPr = gitStatus.pr?.state === "open";
  const isBehind = gitStatus.behindCount > 0;
  const hasDefaultBranchDelta = (gitStatus.aheadOfDefaultCount ?? gitStatus.aheadCount) > 0;
  const canPushWithoutUpstream = hasPrimaryRemote && !gitStatus.hasUpstream;
  const canCommit = !isBusy && hasChanges;
  const canPush =
    !isBusy &&
    hasBranch &&
    !isBehind &&
    gitStatus.aheadCount > 0 &&
    (gitStatus.hasUpstream || canPushWithoutUpstream);
  const canCreatePr =
    !isBusy &&
    hasBranch &&
    !hasOpenPr &&
    hasDefaultBranchDelta &&
    !isBehind &&
    (gitStatus.hasUpstream || canPushWithoutUpstream);

  const commitItem: GitActionMenuItem = {
    id: "commit",
    label: t.git.actions.commit,
    disabled: !canCommit,
    icon: "commit",
    kind: "open_dialog",
    dialogAction: "commit",
  };

  if (!hasPrimaryRemote) {
    return [commitItem];
  }

  const pushItem: GitActionMenuItem = {
    id: "push",
    label: t.git.actions.push,
    disabled: !canPush,
    icon: "push",
    kind: "open_dialog",
    dialogAction: "push",
  };

  // An open change request is surfaced by the standalone attribution row, so
  // the menu offers no change-request entry at all while one is open.
  if (hasOpenPr) {
    return [commitItem, pushItem];
  }

  return [
    commitItem,
    pushItem,
    {
      id: "pr",
      label: t.git.actions.createRequest(terminology.shortLabel),
      disabled: !canCreatePr,
      icon: "pr",
      kind: "open_dialog",
      dialogAction: "create_pr",
    },
  ];
}

/**
 * Selects the next Git action or a disabled hint from repository state and permissions.
 * @param gitStatus Current repository status, or null when status has not loaded.
 * @param isBusy Whether another Git action prevents execution.
 * @param isDefaultRef Whether the current ref is the repository default.
 * @param hasPrimaryRemote Whether the repository has a primary remote; defaults to true.
 * @returns The action to run, publish, pull, or show as a disabled hint.
 */
export function resolveQuickAction(
  gitStatus: VcsStatusResult | null,
  isBusy: boolean,
  isDefaultRef = false,
  hasPrimaryRemote = true,
): GitQuickAction {
  if (isBusy) {
    return {
      label: t.git.actions.commit,
      disabled: true,
      kind: "show_hint",
      hint: t.git.actions.gitActionInProgress,
    };
  }

  if (!gitStatus) {
    return {
      label: t.git.actions.commit,
      disabled: true,
      kind: "show_hint",
      hint: t.git.actions.gitStatusIsUnavailable,
    };
  }

  const hasBranch = gitStatus.refName !== null;
  const hasChanges = gitStatus.hasWorkingTreeChanges;
  const hasOpenPr = gitStatus.pr?.state === "open";
  const isAhead = gitStatus.aheadCount > 0;
  const hasDefaultBranchDelta = (gitStatus.aheadOfDefaultCount ?? gitStatus.aheadCount) > 0;
  const isBehind = gitStatus.behindCount > 0;
  const isDiverged = isAhead && isBehind;
  const terminology = resolveChangeRequestTerminology(gitStatus);

  if (!hasBranch) {
    return {
      label: t.git.actions.commit,
      disabled: true,
      kind: "show_hint",
      hint: t.git.actions.checkoutBeforeRequest(terminology.singular),
    };
  }

  if (hasChanges) {
    if (!gitStatus.hasUpstream && !hasPrimaryRemote) {
      return { label: t.git.actions.commit, disabled: false, kind: "run_action", action: "commit" };
    }
    if (hasOpenPr || isDefaultRef) {
      return {
        label: t.git.actions.commitPush,
        disabled: false,
        kind: "run_action",
        action: "commit_push",
      };
    }
    return {
      label: t.git.actions.commitPushRequest(terminology.shortLabel),
      disabled: false,
      kind: "run_action",
      action: "commit_push_pr",
    };
  }

  if (!gitStatus.hasUpstream) {
    if (!hasPrimaryRemote) {
      return {
        label: t.git.actions.publishRepository,
        disabled: false,
        kind: "open_publish",
      };
    }
    if (!isAhead) {
      if (hasOpenPr) {
        return {
          label: t.git.actions.commit,
          disabled: true,
          kind: "show_hint",
          hint: t.git.actions.branchIsUpToDateNoActionNeeded,
        };
      }
      return {
        label: t.git.actions.push,
        disabled: true,
        kind: "show_hint",
        hint: t.git.actions.noLocalCommitsToPush,
      };
    }
    if (hasOpenPr || isDefaultRef) {
      return {
        label: t.git.actions.push,
        disabled: false,
        kind: "run_action",
        action: isDefaultRef ? "commit_push" : "push",
      };
    }
    return {
      label: t.git.actions.pushCreateRequest(terminology.shortLabel),
      disabled: false,
      kind: "run_action",
      action: "create_pr",
    };
  }

  if (isDiverged) {
    return {
      label: t.git.actions.syncRef,
      disabled: true,
      kind: "show_hint",
      hint: t.git.actions.branchHasDivergedFromUpstreamRebaseMergeFirst,
    };
  }

  if (isBehind) {
    return {
      label: t.git.actions.pull,
      disabled: false,
      kind: "run_pull",
    };
  }

  if (isAhead) {
    if (hasOpenPr || isDefaultRef) {
      return {
        label: t.git.actions.push,
        disabled: false,
        kind: "run_action",
        action: isDefaultRef ? "commit_push" : "push",
      };
    }
    return {
      label: t.git.actions.pushCreateRequest(terminology.shortLabel),
      disabled: false,
      kind: "run_action",
      action: "create_pr",
    };
  }

  // An open change request is surfaced by the standalone attribution row in the
  // details panel, so the action button rests in its disabled up-to-date state.
  if (hasOpenPr && gitStatus.hasUpstream) {
    return {
      label: t.git.actions.commit,
      disabled: true,
      kind: "show_hint",
      hint: t.git.actions.branchIsUpToDateNoActionNeeded,
    };
  }

  if (hasDefaultBranchDelta && !isDefaultRef) {
    return {
      label: t.git.actions.createRequest(terminology.shortLabel),
      disabled: false,
      kind: "run_action",
      action: "create_pr",
    };
  }

  return {
    label: t.git.actions.commit,
    disabled: true,
    kind: "show_hint",
    hint: t.git.actions.branchIsUpToDateNoActionNeeded,
  };
}

export function requiresDefaultBranchConfirmation(
  action: GitStackedAction,
  isDefaultRef: boolean,
): boolean {
  if (!isDefaultRef) return false;
  return (
    action === "push" ||
    action === "create_pr" ||
    action === "commit_push" ||
    action === "commit_push_pr"
  );
}

/**
 * Builds confirmation text for an action on the named default branch.
 * @param input Operation-specific state and options described by the input type.
 * @returns The title, description, and continue-button label for the requested action.
 */
export function resolveDefaultBranchActionDialogCopy(input: {
  action: DefaultBranchConfirmableAction;
  branchName: string;
  includesCommit: boolean;
  terminology?: ChangeRequestTerminology;
}): DefaultBranchActionDialogCopy {
  const branchLabel = input.branchName;
  const suffix = t.git.actions.defaultBranchSuffix(branchLabel);
  const terminology = input.terminology ?? sourceControlClients.get(undefined).changeRequest;

  if (input.action === "push" || input.action === "commit_push") {
    if (input.includesCommit) {
      return {
        title: t.git.actions.commitPushToDefaultRef,
        description: t.git.actions.commitPushDescription(suffix),
        continueLabel: t.git.actions.commitPushBranch(branchLabel),
      };
    }
    return {
      title: t.git.actions.pushToDefaultRef,
      description: t.git.actions.pushDescription(suffix),
      continueLabel: t.git.actions.pushBranch(branchLabel),
    };
  }

  if (input.includesCommit) {
    return {
      title: t.git.actions.commitPushRequestDefault(terminology.shortLabel),
      description: t.git.actions.commitPushRequestDescription(terminology.singular, suffix),
      continueLabel: t.git.actions.commitPushCreateRequest(terminology.shortLabel),
    };
  }
  return {
    title: t.git.actions.pushRequestDefault(terminology.shortLabel),
    description: t.git.actions.pushRequestDescription(terminology.singular, suffix),
    continueLabel: t.git.actions.pushCreateRequest(terminology.shortLabel),
  };
}

export function resolveThreadBranchUpdate(
  result: GitRunStackedActionResult,
): { branch: string } | null {
  if (result.branch.status !== "created" || !result.branch.name) {
    return null;
  }

  return {
    branch: result.branch.name,
  };
}

export function resolveThreadBranchMetadataPatch(
  branch: string | null,
  expectedBranch: string | null,
): {
  branch: string | null;
  expectedBranch: string | null;
} {
  return { branch, expectedBranch };
}

export function resolveLiveThreadBranchUpdate(input: {
  threadBranch: string | null;
  gitStatus: VcsStatusResult | null;
}): { branch: string | null } | null {
  if (!input.gitStatus) {
    return null;
  }

  if (input.gitStatus.refName === null && input.threadBranch !== null) {
    return null;
  }

  if (input.threadBranch === input.gitStatus.refName) {
    return null;
  }

  if (
    input.threadBranch !== null &&
    input.gitStatus.refName !== null &&
    !isTemporaryWorktreeBranch(input.threadBranch) &&
    isTemporaryWorktreeBranch(input.gitStatus.refName)
  ) {
    return null;
  }

  return {
    branch: input.gitStatus.refName,
  };
}

// Re-export from shared for backwards compatibility in this module's exports
export { resolveAutoFeatureBranchName } from "@t3tools/shared/git";
