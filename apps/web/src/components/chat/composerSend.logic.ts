/** Derives send guards and notices from snapshots without dispatching commands. */
import { t } from "~/i18n";
import type { EnvironmentId, ThreadContextRecord } from "@t3tools/contracts";
import { collectInlineContextIds } from "../../lib/composerContextReferences";
import type { ComposerDispatchMode } from "@t3tools/client-runtime/state/composer-dispatch";
import { parseSideChatCommand } from "../../composer-logic";

/** Resolves the visible run decision and freezes the wire value before asynchronous send work. */
export function composerReplyRewriteState(input: {
  readonly provider: string;
  readonly defaultEnabled: boolean;
  readonly selection?: { readonly enabled: boolean } | undefined;
  readonly running: boolean;
  readonly dispatchMode: ComposerDispatchMode;
  readonly activeRun?: { readonly replyRewrite?: boolean | undefined } | null | undefined;
  readonly prompt?: string;
  readonly sideChatAvailable?: boolean;
  readonly sideChatThread?: boolean;
}) {
  const sideChat = parseSideChatCommand(input.prompt ?? "");
  const inherited =
    input.running &&
    (input.dispatchMode === "steer" || input.dispatchMode === "restart") &&
    !(sideChat && input.sideChatAvailable);
  const sideChatReply =
    input.sideChatThread === true || Boolean(sideChat && input.sideChatAvailable);
  const supported = input.provider === "codex" && !sideChatReply;
  const selected = supported && (input.selection?.enabled ?? input.defaultEnabled);
  const saved = inherited ? input.activeRun?.replyRewrite : undefined;
  return {
    sideChat,
    inherited,
    supported,
    sideChatReply,
    known: !inherited || saved !== undefined,
    checked: supported && (inherited ? (saved ?? false) : selected),
    // A completed run can turn a steer into a new run on the server.
    replyRewrite: supported && (saved ?? selected),
  };
}

/** Attached threads the prompt still links to; replacing linked text leaves stale records. */
export function referencedThreadContexts(draft: {
  readonly prompt: string;
  readonly threadContexts: ReadonlyArray<ThreadContextRecord>;
}): ReadonlyArray<ThreadContextRecord> {
  if (draft.threadContexts.length === 0) return [];
  const referenced = new Set(collectInlineContextIds(draft.prompt));
  return draft.threadContexts.filter((record) => referenced.has(record.contextId));
}

/** Why a send waits for the user to pick a machine when no machine was chosen automatically. */
export function loadBalancingSendWarning(input: {
  readonly pending: boolean;
  readonly threadContexts: ReadonlyArray<ThreadContextRecord>;
  readonly candidateEnvironmentIds: ReadonlyArray<EnvironmentId>;
}) {
  if (input.pending) {
    return {
      title: t.chat.view.checkingMachineResources,
      description: t.chat.view.resourceChecksPending,
    };
  }
  const noMachineReadsEveryThread =
    input.threadContexts.length > 0 &&
    !input.candidateEnvironmentIds.some((environmentId) =>
      input.threadContexts.every((record) => record.environmentId === environmentId),
    );
  return {
    title: t.chat.view.chooseMachine,
    description: noMachineReadsEveryThread
      ? t.chat.machineThreadUi.noMachine
      : t.chat.view.noEligibleMachine,
  };
}

/**
 * Why a multiple-model send cannot start: the server predates worktree bootstrap, or the
 * draft is not a new thread on a Git branch with at least one model.
 */
export function multipleModelSendBlock(input: {
  readonly selectionCount: number;
  readonly serverSupportsWorktreeBootstrap: boolean;
  readonly isLocalDraftThread: boolean;
  readonly isGitRepo: boolean;
  readonly branch: string | null;
}): "server-outdated" | "needs-new-git-thread" | null {
  if (!input.serverSupportsWorktreeBootstrap) return "server-outdated";
  if (
    !input.isLocalDraftThread ||
    !input.isGitRepo ||
    !input.branch ||
    input.selectionCount === 0
  ) {
    return "needs-new-git-thread";
  }
  return null;
}

/** Why a message sent over pending approvals did not go out, or null to stop quietly. */
export function approvalRedirectNotice(input: {
  readonly draftChanged: boolean;
  readonly declined: boolean;
  readonly approvalResponding: boolean;
  readonly approvalArrived: boolean;
}): string | null {
  if (input.draftChanged) {
    return input.declined
      ? t.composer.approval.declinedDraftChanged
      : t.composer.approval.draftChanged;
  }
  if (input.approvalResponding) {
    return t.composer.approval.alreadyResponding;
  }
  if (input.declined && input.approvalArrived) {
    return t.composer.approval.anotherArrived;
  }
  return null;
}
