/** English chat messages; interpolation leaves UI rendering to the caller. */
import type { SourceControlProviderKind, WorktreeSubmodules } from "@t3tools/contracts";

export const chat = {
  /** Formats a conversation count; count is the number of threads to describe. */
  threadCount: (count: number) => (count === 1 ? "1 thread" : `${count} threads`),

  view: {
    genericError: "An error occurred.",
    terminalOpen: "terminal open",
    terminalWrite: "terminal write",
    terminalClose: "terminal close",
    previewClose: "preview close",
    loadEarlierHistory: "load earlier thread history",
    composerNotReady: "The composer is not ready",
    citeSelectionHint:
      "Try citing the selection after the connection or pending input is resolved.",
    parentThread: "Parent thread",
    cloningRepository: "Cloning repository",
    repositoryNotCloned: "Repository not cloned",
    cancelCloneError: "Failed to cancel clone",
    cancel: "Cancel",
    retryCloneHint: "Retry to bring in the repository.",
    removeProject: "Remove project",
    retryCloneError: "Failed to retry clone",
    retry: "Retry",
    reconnectEnvironmentError: "Could not reconnect environment",
    reconnectError: "Failed to reconnect.",
    disconnectServerError: "Could not disconnect server",
    disconnectError: "Failed to disconnect.",
    noPullRequestProjectError: "No active project is available for this pull request.",
    server: "server",
    disconnectServerHint: "Hide this server's threads. Switch it on again in Connections.",
    disconnectServer: "Disconnect server",
    reconnect: "Reconnect",
    serverUpdateAvailable: "Server update available",
    update: "Update",
    dismissUpdateNotice: "Dismiss update notice",
    usageLimitsUnavailable: "Usage limits are unavailable for this provider",
    environmentNotConnected: "The environment is not connected.",
    attachmentUnavailable: "The attachment is unavailable.",
    keepAttachmentsHere: "Keep attachments on this machine",
    automaticRoutingAttachmentsHint:
      "Remove attachments before choosing automatic routing, then attach them on the selected machine.",
    autoBalance: "Auto balance",
    checkingMachines: "Checking machines…",
    autoBalanceUnavailable: "Auto balance unavailable",
    switchMachineError: "Could not switch machine",
    interruptTurnError: "Failed to interrupt the current turn.",
    addToChatError: "Unable to add to chat",
    composerBusyHint: "The composer is busy; try again once it is ready.",
    messageNoLongerQueued: "Queued message is no longer queued",
    unsavedEditKept: "Your unsaved edit was kept in the composer.",
    unsavedEditDiscarded: "Your unsaved edit was discarded.",
    openPreviewError: "Could not open preview",
    unexpectedError: "An unexpected error occurred.",
    chatCodeBlock: "Chat code block",
    keyboardShortcutsDenied: "This connection cannot change keyboard shortcuts.",
    deletedScriptShortcutError:
      "The script was deleted, but its keyboard shortcut could not be removed because permission changed.",
    savedScriptShortcutError:
      "The script was saved, but this connection can no longer change keyboard shortcuts.",
    scriptNotFound: "Script not found.",
    deleteActionError: "Could not delete action",
    openBrowserError: "Unable to open browser",
    updateThreadPullRequestError: "Unable to update the thread pull request",
    copyPathError: "Failed to copy path",
    clipboardUnavailable: "Clipboard API unavailable.",
    pathCopied: "Path copied",
    unsettleThreadError: "Failed to un-settle thread",
    wakeThreadError: "Failed to wake thread",
    switchCheckoutError: "Failed to switch checkout",
    checkoutThreadUpdateError: "Checkout switched, but the thread could not be updated",
    stopBackgroundWorkError: "Failed to stop background work.",
    resumeGoalError: "Failed to resume goal.",
    resume: "Resume",
    clearGoalError: "Failed to clear goal.",
    clear: "Clear",
    stopping: "Stopping...",
    stop: "Stop",
    snoozed: "Snoozed",
    waking: "Waking...",
    wakeNow: "Wake now",
    settled: "Settled",
    unsettling: "Un-settling...",
    unsettle: "Un-settle",
    wokeFromSnooze: "Woke from snooze",
    dismiss: "Dismiss",
    threadsDenied: "This connection cannot change threads.",
    chooseProjectBeforeCompacting: "Choose a project before compacting",
    compactionUnsupported: "Compaction is unavailable for this provider",
    compactionUnavailable: "Compacting is unavailable right now",
    branchChanged: "Branch changed — was",
    restoring: "Restoring...",
    restoreBranch: "Restore branch",
    dismissBranchNotice: "Dismiss branch change notice",
    settleThreadError: "Failed to settle thread",
    unpinThreadError: "Failed to unpin thread",
    pinThreadError: "Failed to pin thread",
    revertHistoryUnsupported:
      "This provider does not support reverting conversation history. Start a new thread instead.",
    interruptBeforeReverting: "Interrupt the current turn before reverting checkpoints.",
    waitForAttachmentsBeforeRewinding: "Wait for attachments to finish preparing before rewinding.",
    makeRoomBeforeRewinding:
      "Make room for this message's attachments in the composer before rewinding.",
    revertThreadError: "Failed to revert thread state.",
    rollbackConfirm: "Roll back this thread to the selected checkpoint?",
    rollbackWarningConfirm:
      "Roll back this thread to the selected checkpoint?\nThis action cannot be undone.",
    forkResponseError: "Failed to fork this response.",
    forkDataUnavailable:
      "The fork was created, but its thread data did not reach this client. Reconnect and try opening it from the sidebar.",
    compactContextError: "Failed to compact context.",
    resumeThreadError: "Could not resume thread.",
    annotationAttached: "Annotation attached to draft",
    sendingUnavailableHint:
      "Sending is unavailable right now. Finish the current action, then send.",
    checkingMachineResources: "Checking machine resources",
    chooseMachine: "Choose a machine to continue",
    resourceChecksPending:
      "Resource checks are still running. You can choose a machine in the composer.",
    noEligibleMachine:
      "No eligible machine has available resources. Choose a machine in the composer to override.",
    messageNotSent: "Not connected: message not sent",
    reconnectingSendHint: "Reconnecting to the environment. Try again once it is connected.",
    updateForMultipleModels: "Update this server before starting multiple models.",
    chooseModelsAndBranch: "Choose models and a base branch",
    multipleModelsHint:
      "Multiple models need a new thread in a Git project. Each gets its own worktree.",
    failedUploadsBeforeSaving: "Retry or remove failed uploads before saving.",
    saveQueuedEditError: "Could not save the edited queued message.",
    startCodexThread: "Start a Codex thread first",
    feedbackNeedsMessage: "Send a message before you submit feedback.",
    chooseProject: "Choose a project first",
    draftProjectUnavailable: "This draft no longer points to an available project.",
    chooseBaseBranch: "Select a base branch before sending in New worktree mode.",
    failedUploadsBeforeSending: "Retry or remove failed uploads before sending.",
    fileAttachmentsUnsupported: "This server does not support file attachments.",
    previousRequestMayHaveStarted:
      "The previous request may have started. Open its thread to check before sending again.",
    sendMessageError: "Failed to send message.",
    allowRetry: "Allow retry",
    duplicateThreadConfirm:
      "The previous request may already be running. Check its thread first. Allow another send that could create a duplicate thread?",
    openThread: "Open thread",
    sendMessagesError: "Failed to send messages.",
    backgroundPromptError: "A background prompt could not be sent",
    restoreFailedPromptHint:
      "Your newer draft is unchanged. Restore the failed prompt when this composer is empty.",
    restorePrompt: "Restore prompt",
    returnToOriginalDraftHint:
      "Return to the original draft and send or clear its current prompt before restoring.",
    openFreshComposerError: "Could not open a fresh composer",
    startedInBackground: "Started in background",
    open: "Open",
    backgroundTaskError: "Background task failed",
    openDraft: "Open draft",
    approvalDecisionError: "Failed to submit approval decision.",
    waitForAttachmentUploads: "Wait for attachments to finish uploading, or remove failed uploads.",
    submitUserInputError: "Failed to submit user input.",
    dismissQuestionError: "Failed to dismiss the question.",
    sendPlanFollowUpError: "Failed to send plan follow-up.",
    cleanupImplementationThreadError:
      "Failed to clean up implementation thread after start failure.",
    startImplementationThreadError: "Could not start implementation thread",
    createThreadError: "An error occurred while creating the new thread.",
    pullRequestsUnavailable: "Pull requests unavailable",
    updateToBrowsePullRequests: "Update this environment's T3 Code server to browse pull requests.",
    dropFiles: "Drop files to attach",
    scrollToEnd: "Scroll to end",
    preparingMachine: "Preparing machine",
    rewindingConversation: "Rewinding conversation",
    sendingFeedback: "Sending feedback",
    messagesLoading: "Messages loading",
    preparingWorktree: "Preparing worktree",
    switchTo: "Switch to",
    uncommittedChangesWarning:
      "You have uncommitted changes. They'll carry over to the other branch, or block the switch if they conflict.",
    switchBranch: "Switch branch",
    editFromHere: "Edit from here?",
    rewindDescription:
      "Rewind chat to before this message. Your prompt and attachments return to the composer.",
    revertFilesToo: "Revert files too",
    revertKeepChanges: "Revert and keep changes",
    closeBrowserConfirm: "Close browser while the agent is using it?",
    closeBrowserWarning:
      "The agent is actively controlling this browser. Closing it may interrupt the current browser action.",
    closeBrowsersWarning:
      "The agent is actively controlling these browsers. Closing them may interrupt the current browser actions.",
    installAntigravity: "Install Antigravity in provider settings before sending.",
    signInAntigravity: "Sign in to Antigravity in provider settings before sending.",
    chooseAntigravityModel: "Choose an Antigravity model before sending.",
    refreshAntigravityModels: "Refresh Antigravity models in provider settings before sending.",
    antigravityModelUnavailable:
      "That Antigravity model is no longer available. Choose another model.",
    invalidAttachmentUrl: "The environment returned an invalid attachment URL.",
    attachmentCannotRestore: "This message has an attachment that cannot be restored.",
    expiredTerminalContext: "Expired terminal context",
    expiredTerminalContexts: "Expired terminal contexts",
    expiredContextRemoveHint: "Remove it or re-add it to include terminal output.",
    expiredContextReaddHint: "Re-add it if you want that terminal output included.",
    switchProviderNewChat: "Start a new chat to switch providers",
    switchProviderUnsupported:
      "This thread does not support switching providers after it has started.",
    changeModelNewChat: "Start a new chat to change models",
    changeModelUnsupported:
      "This provider does not allow switching models after a conversation has started.",
    rewindMessageUnavailable: "The message to rewind is no longer available.",
    rewindTimeout: "Timed out waiting for the thread to rewind.",
    noActiveThread: "No active thread",
    pickThread: "Pick a thread to continue",
    pickThreadDescription: "Select an existing thread or create a new one to get started.",
    copyCommand: "Copy command",
    currentThread: "Current thread",
    /** Names the repository being cloned; name is its display label. */
    cloning: (name: string) => `Cloning ${name}`,
    /** Names the repository whose clone was cancelled; name is its display label. */
    cancelledCloning: (name: string) => `Cancelled cloning ${name}`,
    /** Names the repository whose clone failed; name is its display label. */
    cloneError: (name: string) => `Failed to clone ${name}`,
    /** Labels a server using its environment display label. */
    namedServer: (label: string) => `${label} server`,
    /** Describes an environment label; reconnecting selects reconnecting or offline status. */
    environmentOffline: (label: string, reconnecting: boolean) =>
      `${label} is ${reconnecting ? "reconnecting" : "offline"}`,
    /** Names the script that failed to run; name is its display label. */
    runScriptError: (name: string) => `Failed to run script "${name}".`,
    /** Names the deleted action; an undefined name uses the localized unknown fallback. */
    deletedAction: (name: string | undefined) => `Deleted action "${name ?? "Unknown"}"`,
    /** Names the subagent to open; label is supplied by the task presentation. */
    openSubagent: (label: string) => `Open subagent ${label}`,
    /** Adds a snoozed status to the already formatted relative wake time. */
    snoozedUntil: (time: string) => `Snoozed, ${time}`,
    /** Adds a settled status to the already formatted relative completion time. */
    settledAt: (time: string) => `Settled ${time}`,
    /** Names the environment label that must reconnect before reverting. */
    reconnectBeforeReverting: (label: string) => `Reconnect ${label} before reverting checkpoints.`,
    /** Reports the maximum number of attachments allowed in a message. */
    attachmentLimit: (limit: number) => `A message can have at most ${limit} attachments.`,
    /** Names the model whose provider is unavailable. */
    providerUnavailable: (model: string) => `Provider for ${model} is unavailable.`,
    /** Names the attachment whose upload has not finished. */
    attachmentUploadIncomplete: (name: string) => `Attachment '${name}' did not finish uploading.`,
    /** Names the model that could not start. */
    startModelError: (model: string) => `Could not start ${model}`,
    /** Reports the number of background threads started; count selects the English plural. */
    backgroundThreadsStarted: (count: number) =>
      `Started ${count} ${count === 1 ? "thread" : "threads"} in background`,
    /** Appends model-change guidance to the supplied localized reason description. */
    newThreadForModel: (description: string) =>
      `${description} Start a new thread to use this model.`,
    /** Asks to close count browsers currently controlled by the agent. */
    closeBrowsersConfirm: (count: number) =>
      `Close ${count} browsers while the agent is using them?`,
    /** Names the attachment that could not be restored. */
    restoreAttachmentError: (name: string) => `Could not restore attachment: ${name}`,
    /** Explains that the supplied localized singular or plural context noun will not be sent. */
    expiredContextNotSent: (noun: string) => `${noun} won't be sent`,
    /** Explains that the supplied localized singular or plural context noun was omitted. */
    expiredContextOmitted: (noun: string) => `${noun} omitted from message`,
    /** Identifies the messageId whose server image preview could not load. */
    serverPreviewError: (messageId: string) => `Failed to load server preview for ${messageId}.`,
    /** Names the attachment that could not be downloaded. */
    downloadAttachmentError: (name: string) => `Could not download ${name}`,
    /** Describes the previousBranch used by this thread and the currentBranch used on its next send. */
    branchMismatchHint: (previousBranch: string, currentBranch: string) =>
      `This thread last ran on ${previousBranch}. Sending will continue on ${currentBranch}.`,
  },

  rightPanel: {
    /** Formats a generated terminal fallback label; caller-supplied session labels bypass it. */
    terminalLabel: (label: string) => label,
    browserDisabled: "Browser previews are only available in the T3 Code desktop app.",
    terminalDisabled: "Terminal surfaces are only available from a project thread.",
    filesDisabled: "Files are only available when a project is open.",
    diffDisabled: "Diff is only available for server threads in Git repositories.",
    pullRequestDisabled: "This thread's branch has no pull request yet.",
    pullRequestsDisabled: "No linked pull requests are available for this thread.",
    deviceDisabled: "Devices are only available from a thread.",
    browserHint: "Only available in the desktop app.",
    projectHint: "Available when a project is open.",
    gitHint: "Available for Git repositories.",
    pullRequestHint: "No pull request on this branch yet.",
    pullRequestsHint: "No linked pull requests available.",
    deviceHint: "Available from a thread.",
    unmuteTab: "Unmute tab",
    muteTab: "Mute tab",
    browser: "Browser",
    terminal: "Terminal",
    files: "Files",
    diff: "Diff",
    pullRequest: "Pull request",
    linkedPullRequests: "Linked pull requests",
    device: "Device",
    deviceDescription: "Watch an iOS Simulator or Android Emulator.",
    openSurface: "Open a surface",
    openBrowserProfile: "Open browser in a profile",
    pullRequests: "Pull requests",
    rename: "Rename",
    copyPath: "Copy path",
    close: "Close",
    closeOthers: "Close others",
    closeToRight: "Close to the right",
    closeAll: "Close all",
    /** Formats the closeTab message from the supplied title. */
    closeTab: (title: string) => `Close ${title}`,
    /** Formats the unmuteNamedTab message from the supplied title. */
    unmuteNamedTab: (title: string) => `Unmute ${title}`,
    /** Formats the muteNamedTab message from the supplied title. */
    muteNamedTab: (title: string) => `Mute ${title}`,
    deviceTabName: "Device tab name",
    addSurface: "Add panel surface",
    scrollTabs: "Scroll panel tabs",
    scrollLeft: "Scroll tabs left",
    scrollRight: "Scroll tabs right",
    deviceHost: "Device host",
  },
  branchToolbar: {
    submodules: {
      recursive: "Recursive",
      "top-level": "Top level only",
      none: "Skip",
    } satisfies Record<WorktreeSubmodules, string>,
    thisDevice: "This device",
    newWorktree: "New worktree",
    currentCheckout: "Current checkout",
    currentWorktree: "Current worktree",
    worktree: "Worktree",
    localCheckout: "Local checkout",
    /** Formats the previousWorktreeBranch message from the supplied branch. */
    previousWorktreeBranch: (branch: string) => `Previous worktree (${branch})`,
    previousWorktree: "Previous worktree",
    selectRef: "Select ref",
    /** Formats the fromRef message from the supplied ref. */
    fromRef: (ref: string) => `From ${ref}`,
    runOn: "Run on",
    autoBalance: "Auto balance",
    workspace: "Workspace",
    genericError: "An error occurred.",
    loadingRefs: "Loading refs...",
    loadingMoreRefs: "Loading more refs...",
    /** Formats the showingRefs message from the supplied shownCount, totalCount. */
    showingRefs: (shownCount: number, totalCount: number) =>
      `Showing ${shownCount} of ${totalCount} refs`,
    branchName: "branch name",
    branchCopiedToast: "Branch name copied",
    copyBranchError: "Failed to copy branch name",
    copyBranch: "Copy branch name",
    actionUnavailableToast: "Action unavailable",
    branchDeniedError: "This connection cannot change the thread's branch.",
    switchRefError: "Failed to switch ref.",
    createRefError: "Failed to create and switch ref.",
    /** Formats the checkoutChangeRequest message from the supplied kind. */
    checkoutChangeRequest: (kind: SourceControlProviderKind | undefined) =>
      `Checkout ${kind === "gitlab" ? "merge request" : kind === "unknown" ? "change request" : "pull request"}`,
    /** Formats the createRef message from the supplied ref. */
    createRef: (ref: string) => `Create new ref "${ref}"`,
    openPullRequest: "Open pull request",
    create: "Create",
    copyFullPath: "Copy full path",
    workspacePath: "workspace path",
    pathCopiedToast: "Path copied",
    copyPathError: "Failed to copy path",
    modelWorktreeHint: "Each model starts in its own worktree.",
  },
  header: {
    emptyTitleError: "Thread title cannot be empty",
    renameError: "Failed to rename thread",
    genericError: "An error occurred.",
    projectSettings: "Project settings",
    breadcrumb: "Thread breadcrumb",
    /** Formats the newThread message from the supplied projectName. */
    newThread: (projectName: string | undefined) => `New thread in ${projectName}`,
    threadTitle: "Thread title",
    /** Formats the threadActions message from the supplied title. */
    threadActions: (title: string) => `Thread actions for ${title}`,
  },
};
