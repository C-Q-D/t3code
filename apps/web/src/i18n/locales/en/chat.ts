/** English chat messages; interpolation leaves UI rendering to the caller. */
import { englishWorkLogMessages } from "@t3tools/client-runtime/work-log/messages";
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
  timeline: {
    emptyResponse: "(empty response)",
    tokenChange: (before: number | string, after: number | string) => `${before} → ${after} tokens`,
    moreSelectedElements: (count: number) => `${count} more selected elements`,
    thought: "Thought",
    thinking: "Thinking",
    webSearch: "Web search",
    readFile: "Read file",
    running: "Running",
    failed: "Failed",
    declined: "Declined",
    stopped: "Stopped",
    ran: "Ran",
    command: "command",
    youStoppedThisResponse: "You stopped this response",
    worked: "Worked",
    supersededAttempt: "Superseded attempt",
    subagentOf: "Subagent of",
    openParentThread: "Open parent thread",
    loadEarlierTurns: "Load earlier turns",
    loadingEarlierTurns: "Loading earlier turns…",
    userMessage: "User message",
    previousTurn: "Previous turn",
    nextTurn: "Next turn",
    sentByAutomation: "Sent by automation",
    openSendingThread: "Open sending thread",
    sentByAnotherAgent: "Sent by another agent",
    you: "You",
    queued: "Queued",
    steer: "Steer",
    queuedBehindTheActiveTurn: "Queued behind the active turn",
    originallyQueuedThenPromotedToSteerThe:
      "Originally queued, then promoted to steer the active turn",
    steeredTheActiveTurn: "Steered the active turn",
    editFromHere: "Edit from here",
    forkFromThisResponse: "Fork from this response",
    interruptRequested: "Interrupt requested",
    runInterrupted: "Run interrupted",
    contextHandoff: "Context handoff",
    conversationFork: "Conversation fork",
    contextCompacted: "Context compacted",
    planUpdated: "Plan updated",
    inherited: "Inherited",
    synthetic: "Synthetic",
    activity: "Activity",
    toolCalls: "Tool calls",
    settingUpWorktree: "Setting up worktree…",
    working: "Working...",
    setupScript: "Setup script",
    toolCallFailed: "Tool call failed",
    annotatedPreviewCrop: "Annotated preview crop",
    previewAnnotation: "Preview annotation",
    thisContextIsNoLongerAvailable: "This context is no longer available.",
    skill: "Skill",
    reviewComment: "Review comment",
    showLess: "Show less",
    showFullMessage: "Show full message",
    openSubagentThread: "Open subagent thread",
    contextCompactionFailed: "Context compaction failed",
    contextCompactionStopped: "Context compaction stopped",
    compactingContext: "Compacting context",
    forkedFromConversation: "Forked from conversation",
    openSourceConversation: "Open source conversation",
    openFork: "Open fork",
    createdThread: "Created thread",
    createdThreadLabel: "created thread",
    subagent: "Subagent",
    waiting: "Waiting",
    idleResumable: "Idle · resumable",
    completed: "Completed",
    finished: "Finished",
    updated: "Updated",
    /** Formats a file path and the count of additional files. */
    moreFiles: (path: string, count: number): string => `${path} +${count} more`,
    /** Formats the existing elapsed duration when the user stops. */
    stoppedAfter: (duration: string): string => `You stopped after ${duration}`,
    /** Formats the existing elapsed duration without changing its units. */
    workedFor: (duration: string): string => `Worked for ${duration}`,
    /** Names the message targeted by the timeline minimap. */
    jumpToMessage: (text: string): string => `Jump to message: ${text}`,
    /** Names the media or file to preview. */
    preview: (name: string): string => `Preview ${name}`,
    /** Names the file to download. */
    download: (name: string): string => `Download ${name}`,
    /** Names the continuation thread. */
    continuesIn: (threadId: string): string => `Continues in ${threadId}`,
    /** Names the thread or card to open. */
    open: (title: string): string => `Open ${title}`,
    /** Names a file or video attachment and its formatted size. */
    attachment: (isVideo: boolean, name: string, size: string): string =>
      `${isVideo ? "Video" : "File"} attachment, ${name}, ${size}`,
    /** Names the selected browser element. */
    browserElement: (label: string): string => `Browser element, ${label}`,
    /** Names the preview annotation. */
    annotation: (label: string): string => `Preview annotation, ${label}`,
    /** Formats an optional already formatted usage reset time. */
    usageLimit: (resetTime: string | null): string =>
      `Usage limit reached.${resetTime ? ` Retry after ${resetTime}.` : ""}`,
    sendAMessageToStartTheConversation: "Send a message to start the conversation.",
    partialOutputRetained: "Partial output retained",
    compacting: "Compacting…",
    screenshotUnavailable: "Screenshot unavailable",
    retry: "Retry",
    openChat: "Open chat",
    openSubagent: "Open subagent",
    /** Names the source thread of an inherited or synthetic item. */
    fromThread: (threadId: string): string => `From ${threadId}`,
    /** Names the running worktree setup script. */
    setupStillRunning: (name: string): string => `${name} is still running. Show setup progress.`,
    /** Adds the tool failure announcement to an existing activity label. */
    toolFailure: (label: string): string => `${label}, tool call failed`,
    workingForPrefix: "Working for ",
  },
  markdown: {
    templateLabel: (name: string) => `${name} template`,
    copiedTitle: (title: string) => `${title} copied`,
    mermaidDiagram: "Mermaid diagram",
    note: "Note",
    tip: "Tip",
    important: "Important",
    warning: "Warning",
    caution: "Caution",
    collapseTableCells: "Collapse table cells",
    expandTableCells: "Expand table cells",
    copied: "Copied",
    copyTable: "Copy table",
    copyAsMarkdown: "Copy as Markdown",
    copyAsCSV: "Copy as CSV",
    details: "Details",
    disableLineWrap: "Disable line wrap",
    wrapLines: "Wrap lines",
    copyCode: "Copy code",
    codeBlockActions: "Code block actions",
    runInTerminal: "Run in terminal",
    showDiagram: "Show diagram",
    showCode: "Show code",
    videoUnavailable: "Video unavailable",
    imageUnavailable: "Image unavailable",
    loadingImage: "Loading image",
    unableToOpenFile: "Unable to open file",
    anErrorOccurred: "An error occurred.",
    unableToOpenFileInBrowser: "Unable to open file in browser",
    unableToRevealFile: "Unable to reveal file",
    clipboardAPIUnavailable: "Clipboard API unavailable.",
    previewMedia: "Preview media",
    openInIntegratedBrowser: "Open in integrated browser",
    copyRelativePath: "Copy relative path",
    copyFullPath: "Copy full path",
    relativePath: "Relative path",
    fullPath: "Full path",
    mediaUnavailable: "Media unavailable",
    theFileCouldNotBeLoadedIt: "The file could not be loaded. It may have been moved or deleted.",
    thisConnectionCannotRevealFilesOnThis:
      "This connection cannot reveal files on this environment.",
    previewAccessIsUnavailableForThisClient: "Preview access is unavailable for this client.",
    unableToOpenLinkInBrowser: "Unable to open link in browser",
    environmentIsNotConnected: "Environment is not connected.",
    toggleTask: "Toggle task",
    unableToLinkPullRequest: "Unable to link pull request",
    unableToUnlinkPullRequest: "Unable to unlink pull request",
    theRequestFailed: "The request failed.",
    mermaidFailedToLoad: "Mermaid failed to load.",
    theDiagramCouldNotBeRendered: "The diagram could not be rendered.",
    expandDiagram: "Expand diagram",
    openInPanel: "Open in panel",
    copyMessage: "Copy message",
    retry: "Retry",
    /** Names the code fence language. */
    language: (language: string): string => `Language: ${language}`,
    /** Names the media preview. */
    preview: (name: string): string => `Preview ${name}`,
    /** Names the clipboard operation that failed. */
    copyFailed: (title: string): string => `Failed to copy ${title.toLowerCase()}`,
    /** Names the file whose menu is opened. */
    fileOptions: (label: string): string => `File options for ${label}`,
    /** Combines the diagram error with the rendering failure. */
    renderError: (message: string): string => `Unable to render diagram: ${message}`,
    applyTemplate: "Use template",
    renderingDiagram: "Rendering diagram",
    /** Names the HTML render that failed to load. */
    unableToLoad: (title: string): string => `Unable to load ${title}`,
  },
  plan: {
    couldNotCopyPlan: "Could not copy plan",
    anErrorOccurredWhileCopying: "An error occurred while copying.",
    proposedPlan: "Proposed plan",
    workspacePathIsUnavailable: "Workspace path is unavailable",
    thisThreadDoesNotHaveAWorkspace: "This thread does not have a workspace path to save into.",
    enterAWorkspacePath: "Enter a workspace path",
    planSavedToWorkspace: "Plan saved to workspace",
    couldNotSavePlan: "Could not save plan",
    anErrorOccurredWhileSaving: "An error occurred while saving.",
    plan: "Plan",
    planActions: "Plan actions",
    copied: "Copied!",
    copyToClipboard: "Copy to clipboard",
    downloadAsMarkdown: "Download as markdown",
    saveToWorkspace: "Save to workspace",
    collapsePlan: "Collapse plan",
    expandPlan: "Expand plan",
    savePlanToWorkspace: "Save plan to workspace",
    theWorkspace: "the workspace",
    workspacePath: "Workspace path",
    cancel: "Cancel",
    saving: "Saving...",
    save: "Save",
    pathPrefix: "Enter a path relative to ",
    pathSuffix: ".",
  },
  citation: {
    viewSource: "View source",
    editCitationComment: "Edit citation comment",
    addCommentToCitation: "Add comment to citation",
    commentOnSelectedText: "Comment on selected text",
    enterToSaveTheCitationCommentCommand:
      "Enter to save the citation comment; Command/Ctrl+Enter to save and send; Shift+Enter for a new line.",
    addAnOptionalComment: "Add an optional comment...",
    shortenComment: "Shorten comment",
    save: "Save",
    couldNotOpenTheCitedResponse: "Could not open the cited response",
    clickTheCitationToTryAgain: "Click the citation to try again.",
    theQuotedTextHasChanged: "The quoted text has changed",
    showingTheSourceResponseTheSavedQuote:
      "Showing the source response. The saved quote is unchanged.",
    selectionIsTooLongToCite: "Selection is too long to cite",
    citeSelectionInComposer: "Cite selection in composer",
    shortenSelection: "Shorten selection",
    cite: "Cite",
    couldNotLoadTheCitedResponse: "Could not load the cited response",
    loadEarlierTurnsThenClickTheCitation:
      "Load earlier turns, then click the citation to try again. Your saved quote is unchanged.",
    theCitedResponseIsUnavailable: "The cited response is unavailable",
    itMayHaveBeenRemovedTheSelected:
      "It may have been removed. The selected text is still saved in your citation.",
    theCitationDoesNotReferToAn: "The citation does not refer to an assistant response",
    theSelectedTextIsStillSavedIn: "The selected text is still saved in your citation.",
    /** Names the saved citation excerpt to view. */
    viewCitedText: (label: string): string => `View cited assistant text: ${label}`,
    cancel: "Cancel",
    /** Formats the existing localized citation comment length limit. */
    commentLimit: (count: string): string => `Comments can contain up to ${count} characters.`,
  },
  details: {
    nextRunSuffix: (relative: string) => ` · next ${relative}`,
    pausedSuffix: " · paused",
    workspace: "Workspace",
    clientAndServerVersionsDiffer: "Client and server versions differ",
    dismissVersionMismatchWarning: "Dismiss version mismatch warning",
    versionControl: "Version Control",
    threadDetails: "Thread details",
    resolve: "Resolve",
    preparing: "Preparing...",
    ready: "Ready",
    marking: "Marking...",
    fix: "Fix",
    merging: "Merging...",
    merge: "Merge",
    checkTheBranchOutAndResolveThe:
      "Check the branch out and resolve the conflicts in a new thread",
    markThisPullRequestAsReadyFor: "Mark this pull request as ready for review",
    fixTheFailingChecksInANew: "Fix the failing checks in a new thread",
    mergePullRequest: "Merge pull request?",
    cancel: "Cancel",
    showLess: "Show less",
    couldNotUpdateAutomation: "Could not update automation",
    couldNotRunAutomation: "Could not run automation",
    automations: "Automations",
    manageScheduledTasks: "Manage scheduled tasks",
    editAutomation: "Edit automation",
    runNow: "Run now",
    watchingHint:
      "Watching: the agent wakes when checks finish, someone comments, or the branch conflicts. Click to stop.",
    /** Formats the client version before the server version. */
    clientVersion: (version: string): string => `Client ${version} · `,
    /** Names the pull request by number. */
    pullRequest: (number: number): string => `Pull request #${number}`,
    /** Names the selected pull request merge method. */
    mergeMethod: (method: string): string => `Merge this pull request (${method})`,
    /** Names the pull request watch to stop. */
    stopWatching: (number: number): string => `Stop watching #${number}`,
    /** Names the pull request number and selected merge method. */
    mergeDescription: (number: number, method: string): string =>
      `This merges #${number} using ${method}.`,
    /** Names the branch with which the pull request conflicts. */
    conflicts: (branch: string): string => `Merge conflicts with ${branch}`,
    /** Selects the English singular or plural file unit for the count. */
    fileNoun: (count: number): string => (count === 1 ? "file" : "files"),
    /** Formats the count of additional pull requests. */
    showMore: (count: number): string => `Show ${count} more`,
    /** Names the automation to edit. */
    editTask: (title: string): string => `Edit ${title}`,
    /** Names the automation to run immediately. */
    runTask: (title: string): string => `Run ${title} now`,
    /** Names the automation to pause. */
    pauseTask: (title: string): string => `Pause ${title}`,
    /** Names the automation to resume. */
    resumeTask: (title: string): string => `Resume ${title}`,
    /** Formats the added and deleted line counts for assistive readers. */
    diffStat: (additions: number, deletions: number): string =>
      `${additions} additions, ${deletions} deletions`,
    /** Formats the automation query error. */
    loadAutomationsError: (error: string): string => `Could not load automations: ${error}`,
  },
  relationships: {
    failedCount: (count: number) => `${count} failed`,
    starting: "Starting",
    running: "Running",
    queued: "Queued",
    waiting: "Waiting",
    done: "Done",
    failed: "Failed",
    stopped: "Stopped",
    reverted: "Reverted",
    resolvedNative: "Resolved (native)",
    resolvedPortable: "Resolved (portable)",
    consumed: "Consumed",
    superseded: "Superseded",
    idle: "Idle",
    unknown: "Unknown",
    relatedThreads: "Related threads",
    contextTransfer: "Context transfer",
    subagent: "Subagent",
    parentAgent: "Parent agent",
    fork: "Fork",
    parentThread: "Parent thread",
    previousAgents: "Previous agents",
    couldNotStopSubagent: "Could not stop subagent",
    lineage: "Lineage",
    moreThreadActions: "More thread actions",
    thisRelatedThreadIsUnavailable: "This related thread is unavailable",
    mergeBackToSourceConversation: "Merge back to source conversation",
    completeARunInThisForkBefore: "Complete a run in this fork before merging it back",
    mergeThisConversationBackIntoItsSource: "Merge this conversation back into its source",
    stopSubagent: "Stop subagent",
    /** Formats the running related agent count. */
    lineageRunning: (count: number): string => `Lineage · ${count} running`,
    /** Names the related thread role to open. */
    openRelated: (relationship: string): string =>
      `Open ${relationship.toLowerCase()} in this chat`,
    /** Names the parent conversation to merge back into. */
    mergeBack: (title: string): string => `Merge back to ${title}`,
    /** Names the source conversation receiving the merge. */
    mergeConversation: (title: string): string => `Merge this conversation back into ${title}`,
    /** Names the subagent to stop. */
    stopAgent: (title: string): string => `Stop subagent ${title}`,
    disconnectAgentSession: "Disconnect agent session",
    showMorePrefix: "Show ",
    showMoreSuffix: " more",
  },
  queue: {
    collapseQueuedMessages: "Collapse queued messages",
    expandQueuedMessages: "Expand queued messages",
    queued: "Queued",
    reorderQueuedMessageDragOrPressThe: "Reorder queued message (drag, or press the arrow keys)",
    savingQueuedMessage: "Saving queued message",
    cancelEditingQueuedMessage: "Cancel editing queued message",
    editQueuedMessage: "Edit queued message",
    thereIsNoActiveRunToSteer: "There is no active run to steer",
    removeQueuedMessage: "Remove queued message",
    removeFromQueue: "Remove from queue",
    /** Formats the queued message count with the English plural. */
    count: (count: number): string => `${count} queued message${count === 1 ? "" : "s"}`,
    /** Formats the edit action with an optional shortcut. */
    editInComposer: (shortcut: string | null): string =>
      `Edit in the composer${shortcut ? ` (${shortcut})` : ""}`,
    /** Formats the steer action with an optional shortcut. */
    sendSteer: (shortcut: string | null): string =>
      `Send as a steer instead${shortcut ? ` (${shortcut})` : ""}`,
    cancel: "Cancel",
    steer: "Steer",
    retryOrRemoveFailedUploadsBeforeSaving: "Retry or remove failed uploads before saving.",
    editingQueuedPrefix: "Editing queued message: ",
  },
  runtimeMode: {
    supervised: "Supervised",
    askBeforeCommandsAndFileChanges: "Ask before commands and file changes.",
    autoAcceptEdits: "Auto-accept edits",
    autoApproveEditsAskBeforeOtherActions: "Auto-approve edits, ask before other actions.",
    auto: "Auto",
    supportedProvidersApproveRoutineActionsOthersStill:
      "Supported providers approve routine actions; others still ask.",
    fullAccess: "Full access",
    allowCommandsAndEditsWithoutPrompts: "Allow commands and edits without prompts.",
    moreComposerControls: "More composer controls",
    mode: "Mode",
    chat: "Chat",
    plan: "Plan",
    access: "Access",
  },
  worktreeSetup: {
    settingUpWorktree: "Setting up worktree…",
    worktreeReadySetupScriptFailed: "Worktree ready, setup script failed",
    worktreeReady: "Worktree ready",
    worktreeSetupFailed: "Worktree setup failed",
    worktreeSetupCancelled: "Worktree setup cancelled",
    branch: "Branch",
    base: "Base",
    path: "Path",
    setup: "Setup",
    worktreeSetup: "Worktree setup",
    details: "Details",
    openTerminal: "Open terminal",
    workLocally: "Work locally",
    cancel: "Cancel",
  },
  providerStatus: {
    openProviderSetupToSignInWith: "Open provider setup to sign in with Google.",
    openProviderSetupToSignIn: "Open provider setup to sign in.",
    signInViaTheCLIToAuthenticate: "Sign in via the CLI to authenticate again.",
    noModelsAreAvailableForThisProvider: "No models are available for this provider.",
    openProviderSetup: "Open provider setup",
    chatGPTUsageLimitReached: "ChatGPT usage limit reached",
    reviewYourUsageSettingsInChatGPTTo: "Review your usage settings in ChatGPT to continue.",
    dismissError: "Dismiss error",
    /** Names the provider driver to install. */
    install: (provider: string): string =>
      `Open provider setup to install ${provider} on this environment.`,
    /** Names the unavailable provider. */
    unavailable: (provider: string): string => `${provider} provider is unavailable.`,
    /** Names the provider with limited availability. */
    limited: (provider: string): string => `${provider} provider has limited availability.`,
    /** Names the unauthenticated provider. */
    unauthenticated: (provider: string): string => `${provider} is unauthenticated`,
    /** Names the provider version and its compatibility state. */
    incompatible: (provider: string, version: string, broken: boolean): string =>
      `${provider} ${version} is ${broken ? "known to be broken" : "unsupported"}`,
    /** Names the provider status banner. */
    status: (provider: string): string => `${provider} provider status`,
    /** Names the provider and reported status whose notice is dismissed. */
    dismiss: (provider: string, status: string): string => `Dismiss ${provider} provider ${status}`,
    usingChatGPTPlan: "Using ChatGPT plan",
  },
  media: {
    terminalSelection: "terminal selection",
    terminalInput: "terminal input",
    zoomPercent: (percent: number) => `${percent}% zoom`,
    showScreenshot: "Show screenshot",
    showAccessibilityJSON: "Show accessibility JSON",
    showExtractedText: "Show extracted text",
    previousMedia: "Previous media",
    nextMedia: "Next media",
    thisImageCouldNotBeLoaded: "This image could not be loaded.",
    imageUnavailableTheFileMayHaveBeen:
      "Image unavailable. The file may have been moved or deleted.",
    reconnectToThisEnvironmentAndOpenThe: "Reconnect to this environment and open the media again.",
    theEnvironmentReturnedAnInvalidMediaURL: "The environment returned an invalid media URL.",
    clickToZoomInOrReturnTo:
      "Click to zoom in or return to fit. Scroll to zoom, drag to pan. Use Enter to toggle zoom, plus or minus to zoom, and 0 to fit.",
    accessibilityData: "Accessibility data",
    noAccessibilityData: "No accessibility data",
    viewAccessibilityData: "View accessibility data",
    capturedWindow: "Captured window",
    unreadableAccessibility:
      "Structured accessibility elements were included, but they have no readable names or values.",
    missingAccessibility: "The app or capture backend did not provide verified accessibility data.",
    /** Names the expanded image or video preview. */
    expandedPreview: (video: boolean): string => `Expanded ${video ? "video" : "image"} preview`,
    /** Names the image or video preview to close. */
    closePreview: (video: boolean): string => `Close ${video ? "video" : "image"} preview`,
    /** Names the image that supports zooming. */
    zoomable: (name: string): string => `${name}, zoomable image`,
  },
  links: {
    openInIntegratedBrowser: "Open in integrated browser",
    openInSystemBrowser: "Open in system browser",
    copyLink: "Copy Link",
    linkToThread: "Link to thread",
    unlinkFromThread: "Unlink from thread",
  },
  openIn: {
    thisMachine: "this machine",
    editor: "editor",
    open: "Open",
    /** Names the editor selected for opening the workspace. */
    openIn: (editor: string): string => `Open in ${editor}`,
    openInEditor: "Open in editor",
    openFileInPreferredEditor: "Open file in preferred editor",
    chooseEditor: "Choose editor",
    openInEllipsis: "Open in…",
    noInstalledEditorsFound: "No installed editors found",
    /** Names the environment lacking an SSH route. */
    noSsh: (environment: string): string => `No SSH route to ${environment}`,
    /** Names the environment that needs the SSH key. */
    sshHint: (environment: string): string => `Opens over SSH. Needs your key on ${environment}`,
  },
  panelLayout: {
    rightPanelIsUnavailable: "Right panel is unavailable",
    toggleThreadDetailsPanel: "Toggle thread details panel",
    toggleTerminalDrawer: "Toggle terminal drawer",
    terminalDrawerIsUnavailable: "Terminal drawer is unavailable",
    toggleRightPanel: "Toggle right panel",
    restorePanelSize: "Restore panel size",
    maximizePanel: "Maximize panel",
    /** Formats the terminal drawer action with its optional shortcut. */
    terminalShortcut: (shortcut: string | null): string =>
      `Toggle terminal drawer${shortcut ? ` (${shortcut})` : ""}`,
    /** Formats the right panel action with its optional shortcut. */
    rightShortcut: (shortcut: string | null): string =>
      `Toggle right panel${shortcut ? ` (${shortcut})` : ""}`,
    /** Formats the thread details action with its optional shortcut. */
    threadShortcut: (shortcut: string | null): string =>
      `Toggle thread details${shortcut ? ` (${shortcut})` : ""}`,
  },
  draftHero: {
    noProject: "No project",
    chooseAProject: "Choose a project",
    addAProject: "Add a project",
    whatShouldWeWorkOn: "What should we work on?",
    addAProjectToStart: "Add a project to start",
    orStartWithoutAProject: "or start without a project",
    buildPrefix: "What should we build in ",
    buildSuffix: "?",
    startSuffix: " to start",
    /** Names the selected project in the draft heading. */
    buildIn: (project: string | null): string => `What should we build in ${project}?`,
    /** Names the project selector in the accessible draft heading. */
    start: (project: string): string => `${project} to start`,
    addProject: "Add project",
  },
  limitRecovery: {
    usageLimitReached: "Usage limit reached",
    resetTimeUnavailableRetryManually: "Reset time unavailable; retry manually",
    theResetTimeHasPassedRetryThe: "The reset time has passed. Retry the thread manually.",
    couldNotChangeLimitRecovery: "Could not change limit recovery.",
    saving: "Saving...",
    cancelAutoResume: "Cancel auto-resume",
    resumeAtReset: "Resume at reset",
    snoozeUntilReset: "Snooze until reset",
    /** Formats the existing localized reset date. */
    resets: (time: string): string => `Resets ${time}`,
  },
  subagents: {
    workflowFailed: "Workflow failed",
    workflowStopped: "Workflow stopped",
    statusUnavailable: "Status unavailable",
    completed: "✓ completed",
    working: "working",
    subagents: "subagents",
    runsOnItsOwn: "Runs on its own",
    openParent: "Open parent",
    and: " and ",
    /** Formats the individual subagent count with the English plural. */
    individualCount: (count: number): string => `${count} subagent${count === 1 ? "" : "s"}`,
    /** Formats the batch count and whether individual agents are also listed. */
    batchCount: (count: number, hasIndividuals: boolean): string =>
      `${count} ${hasIndividuals ? "" : "subagent "}batch${count === 1 ? "" : "es"}`,
    /** Formats the launch wording from batch presence, liveness and counted subjects. */
    lead: (batches: boolean, live: boolean, subjects: string): string =>
      `${batches ? "Launched" : live ? "Kicked off" : "Ran"} ${subjects}`,
    /** Formats the active subagent count. */
    workingCount: (count: number): string => `${count} working`,
    /** Formats the failed subagent count. */
    failedCount: (count: number): string => `${count} failed`,
    /** Formats the stopped subagent count. */
    stoppedCount: (count: number): string => `${count} stopped`,
    /** Formats the idle subagent count. */
    idleCount: (count: number): string => `${count} idle`,
    /** Combines the model description with the shared provider status text. */
    announcement: (model: string, status: string): string => `${model} subagent: ${status}`,
  },
  inspector: {
    fileCount: (count: number) => `${count} files`,
    toolOutputImage: "Tool output image",
    outputIsNoLongerAvailable: "Output is no longer available.",
    loadingOutput: "Loading output…",
    noOutput: "No output.",
    searchResult: "Search result",
    /** Formats the tool output loading error. */
    outputError: (error: string): string => `Couldn't load output: ${error}`,
    rollBack: "Roll back",
    openFork: "Open fork",
    openSubagentThread: "Open subagent thread",
    /** Formats the command exit code. */
    exitCode: (code: number): string => `exit ${code}`,
    /** Formats the reported context transfer kind and status. */
    transfer: (type: string, status: string): string =>
      `Transfer ${type.replaceAll("_", " ")} · ${status}`,
  },
  terminalContext: {
    capturedTerminalOutput: "Captured terminal output",
    /** Names the captured terminal excerpt. */
    excerpt: (label: string): string => `Terminal excerpt, ${label}`,
    /** Formats the inclusive captured terminal line range. */
    lines: (start: number, end: number): string =>
      start === end ? `Line ${start}` : `Lines ${start}–${end}`,
    /** Names the terminal excerpt and its expiry state. */
    expiredLabel: (label: string, expired: boolean): string =>
      `Terminal excerpt, ${label}${expired ? ", expired" : ""}`,
    /** Names the terminal excerpt that must be attached again. */
    expiredHint: (label: string): string =>
      `Terminal context expired. Remove and re-add ${label} to include it in your message.`,
  },
  autoBalanceUpdate: {
    updating: "Updating",
    couldNotUpdate: "Could not update",
    updateAvailableFor: "Update available for",
    manualUpdateRequired: "Manual update required",
    reconnectThisMachineToUpdate: "Reconnect this machine to update",
    retry: "Retry",
    updateAll: "Update all",
    dismissUpdateNotice: "Dismiss update notice",
    /** Names the available target version. */
    ready: (version: string): string => `Ready to update to ${version}`,
    /** Formats the machine update count with the English plural. */
    machineCount: (count: number): string =>
      `Update ${count} ${count === 1 ? "machine" : "machines"}`,
    /** Combines the update state prefix with the machine count. */
    title: (prefix: string, count: number): string =>
      `${prefix} ${count} ${count === 1 ? "machine" : "machines"}`,
    /** Names the update notice whose machine list can be opened. */
    viewMachines: (title: string): string => `${title}. View machines`,
    /** Formats the count of machines requiring a manual update. */
    manualCount: (count: number): string =>
      `${count} ${count === 1 ? "needs" : "need"} a manual update`,
  },
  speed: {
    fast: "Fast",
    normal: "Normal",
    ultrafastModeOn: "Ultrafast mode on",
    fastModeOn: "Fast mode on",
  },
  workLog: {
    shared: englishWorkLogMessages,
    subagentCount: (count: number) => `${count} ${count === 1 ? "subagent" : "subagents"}`,
    thinking: "Thinking",
    command: "Command",
    tool: "Tool",
    /** Formats the provider retry attempt progress. */
    retrying: (progress: string): string => `Retrying provider (${progress})`,
    /** Formats the provider recovery retry count. */
    recovered: (progress: string): string => `Provider recovered (${progress} retries)`,
    /** Combines the failure label with retry progress. */
    failedAfterRetries: (label: string, progress: string): string =>
      `${label} after ${progress} retries`,
    /** Formats retry progress when retries stop. */
    retryStopped: (progress: string): string => `Provider retry stopped (${progress})`,
    /** Formats the retry delay in milliseconds. */
    retryDelayMs: (delay: number): string => ` Retrying in ${delay}ms.`,
    /** Formats the already formatted retry delay in seconds. */
    retryDelaySeconds: (delay: string): string => ` Retrying in ${delay}s.`,
    /** Formats the changed file count. */
    changedFiles: (count: number): string => `Changed ${count} files`,
    /** Formats the name of the changed file. */
    changedFile: (fileName: string): string => `Changed ${fileName}`,
    usageLimitReached: "Usage limit reached",
    providerError: "Provider error",
    createdThread: "Created thread",
    ranCommand: "Ran command",
    fileChange: "File change",
    searchedFiles: "Searched files",
    fileSearch: "File search",
    searchedTheWeb: "Searched the web",
    webSearch: "Web search",
    checkpointCaptured: "Checkpoint captured",
    toolCall: "Tool call",
    approvalRequested: "Approval requested",
    answeredQuestions: "Answered questions",
    inputRequested: "Input requested",
  },
  changedFiles: {
    collapseAllFolders: "Collapse all folders",
    expandAllFolders: "Expand all folders",
    openDiff: "Open diff",
    openTheFullDiff: "Open the full diff",
    /** Formats the changed file count with the English plural. */
    count: (count: number): string => `${count} changed file${count === 1 ? "" : "s"}`,
  },
};
