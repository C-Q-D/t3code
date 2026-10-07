/** English composer labels and messages; functions format display data only. */
export const composer = {
  mode: {
    planTooltip: "Plan mode — click to return to normal build mode",
    buildTooltip: "Default mode — click to enter plan mode",
    plan: "Plan",
    build: "Build",
    runtimeAriaLabel: "Runtime mode",
  },
  attachments: {
    questionServerUpdateHint: "Update this server to send files with question answers",
    reattachFileHint: "Attach the interrupted file again or remove it",
    reattachFilesHint: "Attach the interrupted files again or remove them",
    /** Names the source attachment that could not be imported. */
    importError: (name: string) => `Couldn't bring ${name} into this message`,
    /** Adds recovery steps after the displayed import failure reason. */
    importRecoveryHint: (reason: string) => `${reason} Remove the chip or attach the file again.`,
    sourceDisconnectedError: "The environment it came from is not connected.",
    sourceMissingError: "The original attachment is no longer available.",
    sourceDownloadError: "Downloading it from the source failed.",
    draftRejectedError:
      "The draft rejected this attachment (duplicate or attachment limit reached).",
    compressingToast: "Still compressing a pasted image.",
    compressingSendHint: "Send again once its thumbnail appears.",
    importingToast: "Still bringing a pasted attachment into this message.",
    importingSendHint: "Send again once its chip resolves.",
    importingStashHint: "Stash again once its chip resolves.",
    /** Names the attachment whose preview can be opened. */
    preview: (name: string) => `Preview ${name}`,
    /** Describes the count of hidden image attachments. */
    showMoreImages: (count: number) => `Show ${count} more image attachments`,
    questionUnsupportedToast: "This question cannot accept attachments.",
    /** Reports the maximum file count allowed in one message. */
    limitError: (limit: number) => `You can attach up to ${limit} files per message.`,
    /** Reports an unsupported image filename and the accepted formats. */
    unsupportedImageError: (name: string) =>
      `'${name}' is not a supported image type. Attach GIF, HEIC, HEIF, JPEG, PNG, or WebP images.`,
    serverUnsupportedError: "This server does not support file attachments.",
    /** Reports the filename of an empty or unreadable file. */
    unreadableFileError: (name: string) => `'${name}' is empty or could not be read.`,
    /** Names the file created from a large clipboard paste. */
    largePasteToast: (name: string) => `Large paste attached as ${name}`,
    /** Shows the attachment size and the platform shortcut for an inline paste. */
    largePasteHint: (size: string, shortcut: string) =>
      `${size} · Use ${shortcut} to keep a large paste inline.`,
    /** Reports the filename of an image that could not be decoded. */
    unreadableImageError: (name: string) => `'${name}' could not be read as an image.`,
    /** Reports the filename of an image still too large after compression. */
    imageTooLargeError: (name: string) =>
      `'${name}' is too large to attach, even after compression.`,
    /** Names the image and explains that removing it also removes its text references. */
    removeReferencedImageConfirm: (name: string) =>
      `Remove ${name} from the message?\nIt is referenced in your text; removing it also removes every reference.`,
    pasteMessageTooLargeToast: "Pasted text is too large for this message",
    pasteMessageTooLargeHint: "Remove some text or an attachment, then paste again.",
    pasteAttachmentTooLargeToast: "Pasted text is too large to attach",
    pasteAttachmentTooLargeHint:
      "Reduce the clipboard contents or save a smaller excerpt as a file.",
    remoteFolderToast: "Folders can't be dropped into remote environments",
    /** Names the dropped folder whose local path could not be read. */
    folderPathErrorToast: (name: string) => `Couldn't get the path of "${name}"`,
    folderPathHint: "Type the folder path with @ instead.",
    /** Names the attachment to remove from the draft. */
    remove: (name: string) => `Remove ${name}`,
    persistenceWarning: "Draft attachment may not persist",
    persistenceHint: "Draft attachment could not be saved locally and may be lost on navigation.",
    /** Names the attachment whose failed upload can be retried. */
    retryUpload: (name: string) => `Retry upload for ${name}`,
    /** Names the video attachment to play. */
    play: (name: string) => `Play ${name}`,
    attachAgain: "Attach again",
    removeToSend: "Remove to send",
    attach: "Attach files",
    waitingForServerHint: "Waiting for the server before file attachments can send",
    capabilityUnsupportedHint:
      "This server does not accept file attachments right now. Remove the files to send.",
    thisImage: "this image",
  },
  validation: {
    compactUnavailableHint: "Compacting is unavailable right now",
    selectModelHint: "Select at least one model.",
    /** Reports excess characters and the input limit; excess selects the English plural. */
    promptLengthError: (excess: number, limit: number) =>
      `Prompt is ${excess.toLocaleString("en-US")} ${excess === 1 ? "character" : "characters"} over the ${limit.toLocaleString("en-US")}-character limit. Shorten or split it before sending.`,
  },
  commandMenu: {
    switchModelDescription: "Switch response model for this thread",
    planDescription: "Switch this thread into plan mode",
    buildDescription: "Switch this thread back to normal build mode",
    runCommandDescription: "Run provider command",
    /** Describes a skill using its provider-reported scope. */
    skillScope: (scope: string) => `${scope} skill`,
    runSkillDescription: "Run provider skill",
    skillsEmpty: "No skills found. Try / to browse provider commands.",
    pullRequestsUnavailableHint: "Pull requests are not available for this project.",
    pullRequestsReadError: "Pull requests could not be read for this project.",
    /** Includes the search query that matched no pull request. */
    pullRequestEmpty: (query: string) => `No pull request matches ${query}.`,
    repositoryPullRequestsEmpty: "No pull requests found in this repository.",
    pathsEmpty: "No matching files or folders.",
    commandsEmpty: "No matching command.",
    findingPullRequest: "Finding pull request...",
    searchingPaths: "Searching workspace files...",
    searchingSkills: "Searching workspace skills...",
    pathsLabel: "Files and folders",
    pullRequestsLabel: "Pull requests",
    commandsLabel: "Commands",
    skillsLabel: "Skills",
    appSource: "App",
    repoSource: "Repo",
    projectSource: "Project",
    personalSource: "Personal",
    systemSource: "System",
    providerSource: "Provider",
    skillSuffix: " Skill",
  },
  primaryActions: {
    resume: "Resume thread",
    openToCompact: "Open composer to compact and send",
    send: "Send message",
    submit: "Submit",
    next: "Next",
    nextQuestion: "Next question",
    submitAnswers: "Submit answers",
    submitAnswer: "Submit answer",
    stop: "Stop generation",
    interrupt: "Interrupt",
    previousQuestion: "Previous question",
    previous: "Previous",
    sending: "Sending...",
    refine: "Refine",
    implement: "Implement",
    implementationActions: "Implementation actions",
    implementNewThread: "Implement in a new thread",
    compactSend: "Compact and send",
    sendOptions: "Send options",
    updateQueued: "Update queued message",
    queue: "Queue message",
    steer: "Steer message",
    submitMessage: "Submit message",
    disconnected: "Environment disconnected",
    connecting: "Connecting",
    preparingWorktree: "Preparing worktree",
    updatingQueued: "Updating queued message",
    submittingMessage: "Submitting message",
    /** Describes the default and alternate send actions and an optional shortcut. */
    dispatchTooltip: (
      behavior: "queue" | "steer",
      shortcut: string | null,
      alternateAction: "queue" | "steer" | "restart",
    ) =>
      `Click to ${behavior}, Ctrl/⌘-click${shortcut ? ` or ${shortcut}` : ""} to ${alternateAction}`,
    /** Describes compaction using an already formatted history token count. */
    summarizeHistory: (tokens: string) => `Summarize ${tokens} tokens of history, then send`,
    /** Describes sending without compaction using a formatted history token count. */
    fullHistory: (tokens: string) => `Send with full history (${tokens} tokens)`,
    submitting: "Submitting...",
  },
  stash: {
    differentEnvironmentToast: "Stashed files belong to another environment",
    differentEnvironmentHint: "Restore this prompt in the environment that received its files.",
    restorePersistenceToast: "Restored prompt may reappear in the stash",
    restorePersistenceHint:
      "Browser storage rejected the update, so this entry could still be there after a reload.",
    /** Lists filenames discarded because the stash exceeded its storage limit. */
    droppedImagesHint: (names: string) =>
      `${names} exceeded the stash size limit when this prompt was saved.`,
    /** Lists filenames that could not be read while saving the stash. */
    unreadableImagesHint: (names: string) =>
      `${names} could not be read when this prompt was saved.`,
    /** Lists unrestored filenames and the composer attachment count limit. */
    unrestoredAttachmentsHint: (names: string, limit: number) =>
      `${names} could not be restored: the composer is at its ${limit}-attachment limit.`,
    /** Lists expired filenames and explains the 24-hour retention period. */
    expiredFilesHint: (names: string) =>
      `${names}: stashed files are kept for 24 hours and this upload expired. Attach the file again.`,
    attachmentsMissingToast: "Some attachments were not restored",
    deletePersistenceToast: "Stash entry may come back",
    deletePersistenceHint:
      "Browser storage rejected the delete, so this prompt could reappear after a reload.",
    reattachBeforeStashingToast: "Attach dropped files again or remove them before stashing",
    waitForUploadsToast: "Wait for file uploads before stashing this prompt",
    saveErrorToast: "Could not stash this prompt",
    saveErrorHint:
      "Browser storage rejected the write, so the composer was left as-is. Free up site data and try again.",
    sessionOnlyToast: "Stashed prompt will not survive a reload",
    sessionOnlyHint:
      "Browser storage is unavailable, so this stash is kept in memory only for this session.",
    oldestDiscardedToast: "Oldest stashed prompt discarded",
    /** Reports the stash entry limit when the oldest prompt is discarded. */
    oldestDiscardedHint: (limit: number) =>
      `The stash holds ${limit} prompts; the oldest was removed to make room.`,
    imagesNotSavedToast: "Stashed images were not saved",
    imagesNotSavedHint:
      "The prompt was stashed, but browser storage rejected its images. They will be missing if you reload.",
    imagesDidNotAttachToast: "Stashed images did not attach",
    /** Reports the saved image count when its stash entry disappeared; English uses singular or plural. */
    imagesDidNotAttachHint: (count: number) =>
      `That prompt was restored or deleted before ${count} image${count === 1 ? "" : "s"} finished saving. Re-attach ${count === 1 ? "it" : "them"} if you still need ${count === 1 ? "it" : "them"}.`,
    /** Announces the stashed prompt count and the action that opens the stash. */
    openAriaLabel: (count: number) => `Stashed prompts: ${count}. Open stash.`,
    title: "Stash",
    /** Summarizes an attachment-only stash entry; kind is a stable singular selector. */
    attachmentSnippet: (count: number, kind: "attachment" | "file" | "image") =>
      `(${count} ${kind}${count === 1 ? "" : "s"})`,
    close: "Close stash",
    listAriaLabel: "Stashed prompts",
    empty: "Nothing stashed yet.",
    /** Explains how to stash a prompt using the supplied shortcut label. */
    shortcutHint: (shortcut: string) =>
      ` Press ${shortcut} with a prompt in the composer to stash it.`,
    /** Names the stashed prompt to restore using its display snippet. */
    restoreAriaLabel: (snippet: string) => `Restore stashed prompt: ${snippet}`,
    delete: "Delete stashed prompt",
    emptySnippet: "(empty)",
    /** Reports the image count still being saved; English uses singular or plural. */
    savingImagesHint: (count: number) => `saving ${count} image${count === 1 ? "" : "s"}…`,
    /** Reports the dropped image count; English uses singular or plural. */
    droppedImagesCountHint: (count: number) => `${count} image${count === 1 ? "" : "s"} dropped`,
  },
  provider: {
    openSettings: "Open provider settings",
    unavailable: "No provider available",
  },
  context: {
    addErrorToast: "Unable to add to chat",
    busyHint: "The composer is busy; try again once it is ready.",
    wrongEnvironmentToast: "Use threads from this environment",
    wrongEnvironmentHint: "The agent can only read threads on its own server.",
    /** Combines a context kind display label with its content label. */
    chipAriaLabel: (kind: string, label: string) => `${kind}, ${label}`,
    uploadFailed: "upload failed",
    attachAgain: "attach again",
    /** Names a file attachment and size; previewVideo selects the video preview action. */
    fileAriaLabel: (previewVideo: boolean, name: string, size: string) =>
      `${previewVideo ? "Preview video" : "File"} attachment, ${name}, ${size}`,
    /** Names a draft file that must be attached again before sending. */
    reattachHint: (name: string) =>
      `${name} was not saved with this draft. Attach it again to send it.`,
    /** Formats an annotation target count; kind selects its singular name and count selects the English plural. */
    annotationCount: (count: number, kind: "element" | "region" | "drawing" | "style change") =>
      `${count} ${kind}${count === 1 ? "" : "s"}`,
    annotationCrop: "Annotated preview crop",
    screenshotUnavailable: "Screenshot unavailable",
    unavailableHint: "This context is no longer available. Remove it or attach it again.",
    reviewComment: "Review comment",
    previewAnnotation: "Preview annotation",
    /** Describes the PR state for display; null selects the generic pull request label. */
    pullRequestKind: (state: "open" | "draft" | "merged" | "closed" | null) =>
      state === null ? "Pull request" : `${state[0]!.toUpperCase()}${state.slice(1)} pull request`,
  },
  placeholder: {
    customAnswer: "Write custom answer",
    expand: "Expand composer",
    chooseOption: "Choose an option above",
    ownAnswer: "Type your own answer, or leave this blank to use the selected option",
    enableProvider: "Enable a provider in Settings",
    ask: "Ask anything...",
    draft: "Draft",
    message: "Message",
    resolveApproval: "Resolve this approval request to continue",
    refinePlan: "Add feedback to refine the plan, or leave this blank to implement it",
    chooseProject: "Choose a project above to start a thread",
    enableProviderToSend: "Enable a provider in Settings to send a message",
    full: "Ask anything, @tag files/folders, $use skills, or / for commands",
    disconnected: "Ask for changes, send follow-ups, or attach images",
  },
  bannerStack: {
    showOtherNotices: "Show other notices",
    otherNotices: "Other notices",
    showDetails: "Show notice details",
    details: "Notice details",
    dismissWarning: "Dismiss warning",
  },
  feedback: {
    clipboardLabel: "Codex feedback thread ID",
    copyErrorToast: "Could not copy thread ID",
    errorHint: "An error occurred.",
    copyId: "Copy ID",
    dismiss: "Dismiss feedback notice",
  },
  approval: {
    cancel: "Cancel",
    decline: "Decline",
    allowSession: "Always allow this session",
    approve: "Approve",
    moreOptions: "More approval options",
    appAccessTitle: "App access approval",
    commandTitle: "Command approval",
    fileReadTitle: "File read approval",
    permissionTitle: "App permission approval",
    fileChangeTitle: "File change approval",
    appAccessAriaLabel: "App access request",
    commandAriaLabel: "Command",
    fileReadAriaLabel: "File to read",
    permissionAriaLabel: "Permission request",
    fileChangeAriaLabel: "File change",
    processGoneHint: "Provider process is gone — interrupt or restart the run to respond.",
  },
  userInput: {
    showQuestion: "Show the question and its options",
    hideQuestion: "Hide the question and its options",
    dismiss: "Dismiss question without answering",
    selectMultipleHint: "Select one or more options.",
  },
  planFollowUp: {
    ready: "Plan ready",
  },
  serverUpdate: {
    serverLabel: "server",
    /** Names the server being updated; failed selects the failure wording. */
    title: (failed: boolean, server: string) =>
      `${failed ? "Could not update" : "Updating"} ${server}`,
    /** Combines the server update title with its stage or failure detail. */
    detailsAriaLabel: (title: string, detail: string) => `${title}: ${detail}`,
  },
  tasks: {
    pending: "Pending",
    running: "Running",
    completed: "Completed",
    title: "Tasks",
    /** Announces completed and total task counts and the current step; expanded selects the collapse action. */
    progressAriaLabel: (expanded: boolean, completed: number, total: number, step: string) =>
      `${expanded ? "Collapse tasks" : "Tasks"}: ${completed} of ${total} complete. Current task: ${step}`,
    /** Announces completed and total counts for the task list. */
    listAriaLabel: (completed: number, total: number) =>
      `Task list. ${completed} of ${total} complete.`,
    now: "now",
  },
  usageLimits: {
    toggleAccount: "Toggle account label visibility",
    revealAccount: "Click to reveal account",
    hideAccount: "Click to hide account",
    /** Reports the number of accounts in a usage limits report. */
    accountCount: (count: number) => `${count} accounts`,
    title: "Usage limits",
    dismiss: "Dismiss usage limits",
    manage: "Manage usage",
  },
  contextWindow: {
    /** Describes the token threshold at which automatic compaction starts. */
    compactAtHint: (threshold: number) =>
      `Compacts automatically at ${threshold.toLocaleString("en-US")} tokens.`,
    /** Names the model whose context compacts automatically. */
    modelAutoCompactHint: (model: string) =>
      `Context for ${model} compacts automatically when needed.`,
    autoCompactHint: "Context compacts automatically when needed.",
    /** Announces context usage using an already formatted percentage. */
    usedPercentageAriaLabel: (percentage: string) => `Context window ${percentage} used`,
    /** Announces context usage using an already formatted token count. */
    usedTokensAriaLabel: (tokens: string) => `Context window ${tokens} tokens used`,
    title: "Context Window",
    usageAriaLabel: "Context window usage",
    totalProcessed: "Total processed",
    cost: "Cost",
    compact: "Compact context",
  },
  modelPicker: {
    newAriaLabel: "New model",
    newBadge: "New",
    unavailable: "Unavailable",
    removeFavorite: "Remove from favorites",
    addFavorite: "Add to favorites",
    /** Names a provider that cannot be selected within the current thread. */
    providerLockedHint: (provider: string) =>
      `${provider} is unavailable in this thread. Start a new thread to switch providers.`,
    searchPlaceholder: "Search models...",
    legacy: "Legacy models",
    /** Names the provider whose setup can be opened. */
    setupProvider: (provider: string) => `Set up ${provider}`,
    openSetup: "Open provider setup",
    empty: "No models found",
    /** Names a provider disabled in settings. */
    disabledHint: (provider: string) => `${provider} — Disabled in settings.`,
    limited: "Limited",
    notReady: "Not ready",
    /** Combines a provider name and status label with optional provider-reported detail. */
    statusHint: (provider: string, kind: string, message: string | undefined) =>
      message ? `${provider} — ${kind}. ${message}` : `${provider} — ${kind}.`,
    providersAriaLabel: "Providers",
    favorites: "Favorites",
    /** Marks a provider display name as new. */
    newProviderTooltip: (provider: string) => `${provider} — New`,
    /** Announces that a provider is new using its display name. */
    newProviderAriaLabel: (provider: string) => `${provider}, new`,
    choose: "Choose model",
    /** Adds an availability suffix to a model display label when unavailable is true. */
    labelWithAvailability: (label: string, unavailable: boolean) =>
      `${label}${unavailable ? " (Unavailable)" : ""}`,
    chooseMultiple: "Choose models",
    /** Shows the first two ordered model labels and the count of remaining selections. */
    multipleLabel: (labels: string[]) =>
      `${labels.slice(0, 2).join(", ")}${labels.length > 2 ? `, ${labels.length - 2} more` : ""}`,
    /** Reports the model count in the legacy model section. */
    modelCount: (count: number) => `${count} models`,
  },
  secretRequest: {
    save: "Save securely",
    decline: "Decline",
  },
  traits: {
    agent: "Agent",
    effort: "Effort",
    reasoningEffort: "Reasoning effort",
    default: "Default",
    ultrathinkBodyHint:
      'Your prompt contains "ultrathink" in the text. Remove it to change this option.',
    on: "On",
    off: "Off",
    fast: "Fast",
    normal: "Normal",
    ultrafast: "Ultrafast",
    ultrathink: "Ultrathink",
    /** Combines a provider trait display label with its enabled state. */
    booleanLabel: (label: string, enabled: boolean) => `${label} ${enabled ? "On" : "Off"}`,
    reasoning: "Reasoning",
  },
};
