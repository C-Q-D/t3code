/** App shell and shared UI messages; excludes protocol and persisted values. */
export const app = {
  desktopWebLinkCouldNotOpen: "Could not open the link",
  quitHoldOverlay: {
    /** Formats the hold-or-double-press hint using the platform's quit shortcut. */
    holdOrPressTwice: (shortcut: string) => `Hold ${shortcut} or press twice to quit`,
    /** Formats the second-press hint using the platform's quit shortcut. */
    pressAgain: (shortcut: string) => `Press ${shortcut} again to quit`,
  },
  storage: {
    /** Describes the failed storage operation and the affected preference key. */
    failure: (
      operation: "read" | "decode" | "encode" | "update" | "write" | "remove" | "notify",
      storageKey: string,
    ) => `Failed to ${operation} local storage item ${storageKey}.`,
  },
  environment: {
    /** Describes the named remote machines; alsoHere indicates a local copy. */
    onMachines: (alsoHere: boolean, labels: string) => `${alsoHere ? "Also on" : "On"} ${labels}`,
  },
  subagent: {
    worktree: "Worktree",
    project: "Project",
    status: {
      idle: "idle",
      pending: "pending",
      running: "running",
      waiting: "waiting",
      completed: "completed",
      failed: "failed",
      cancelled: "cancelled",
      interrupted: "interrupted",
    },
  },
  actions: {
    loading: "Loading",
    dismiss: "Dismiss",
    copied: "Copied",
    copyLink: "Copy link",
    retry: "Retry",
    import: "Import",
    update: "Update",
    updateAll: "Update all",
    continue: "Continue",
    saving: "Saving…",
    saveChanges: "Save changes",
    close: "Close",
  },
  composer: {
    /** Formats the message using path. */
    preview: (path: string) => `Preview ${path}`,
    /** Formats the message using skillLabel. */
    skill: (skillLabel: string) => `Skill ${skillLabel}`,
    noSkillDescription: "No description is available for this skill.",
    viewInstructions: "View instructions",
  },
  snooze: {
    invalidDate: "Choose a valid date and time in the future.",
    invalidDuration: "Enter a positive duration.",
    title: "Custom snooze",
    description: "Choose when snoozed threads return to your inbox.",
    scheduleType: "Schedule type",
    dateAndTime: "Date and time",
    duration: "Duration",
    date: "Date",
    chooseDate: "Choose snooze date",
    time: "Time",
    snoozeFor: "Snooze for",
    decreaseDuration: "Decrease duration",
    increaseDuration: "Increase duration",
    unit: "Unit",
    minutes: "Minutes",
    hours: "Hours",
    days: "Days",
  },
  machine: {
    server: "Server",
    cloudVm: "Cloud VM",
    desktop: "Desktop",
    laptop: "Laptop",
    miniPc: "Mini PC",
    workstation: "Workstation",
  },
  keybindings: {
    openError: "Unable to open keybindings file",
    unknownOpenError: "Unknown error opening file.",
    openFile: "Open keybindings.json",
  },
  migration: {
    restoring: "Restoring your threads…",
    /** Describes the number of threads being migrated. */
    progress: (count: number) =>
      `Migrating ${count.toLocaleString()} ${count === 1 ? "thread" : "threads"} from the previous version. You can keep working while this finishes.`,
  },
  mobile: {
    nightlyTitle: "Nightly needs the beta mobile app",
    nightlyDescription:
      "Nightly uses the new orchestrator. The App Store and Google Play versions of T3 Code cannot connect to it.",
    getBeta: "Get the beta app",
    title: "Mobile app",
    betaDescription:
      "Nightly needs the beta app. The App Store and Google Play versions cannot connect.",
    testFlightBeta: "TestFlight beta",
    scanIphone: "Scan with your iPhone camera.",
    testFlightLink: "TestFlight beta link",
    googlePlayBeta: "Google Play beta",
    googleStepsHint:
      "Use the same Google account for both steps. Step 2 can take up to an hour to work after you join the group.",
    joinGroup: "1. Join the group",
    androidGroupLink: "Android beta group link",
    becomeTester: "2. Become a tester",
    googlePlayLink: "Google Play beta link",
  },
  projects: {
    heroTitle: "What should we work on?",
    addFirst: "Add a project to start your first thread.",
    addOrStart: "Add a project, or start without one.",
    startWithout: "Start without a project",
    open: "Open project",
    remove: "Remove project",
    publishError: (provider: string) => `Could not create the ${provider} repository`,
    /** Formats the message using message. */
    publishRetryHint: (message: string) =>
      `${message} Use Publish Repository in the Git menu to try again.`,
    published: (provider: string) => `Published to ${provider}`,
    createError: "Could not create the project",
    /** Formats the message using name. */
    created: (name: string) => `Created ${name}`,
    /** Formats the message using name. */
    createdWithoutCommit: (name: string) => `Created ${name} without a first commit`,
    /** Formats the message using message, workspaceRoot. */
    commitErrorHint: (message: string, workspaceRoot: string) =>
      `${message} The project is in ${workspaceRoot}.`,
    openError: "Failed to open project",
    /** Formats the message using message. */
    sidebarCatchupHint: (message: string) =>
      `${message} It will appear in the sidebar once this client catches up.`,
    removeError: "Failed to remove project",
    scratchError: "Could not start without a project",
    desktopTimeout: "The project did not appear in the desktop app.",
  },
  permissions: {
    /** Formats the message using environmentLabel. */
    changed: (environmentLabel: string) => `Permissions have changed for ${environmentLabel}`,
    changedHint:
      "This connection still uses the old permissions, so some actions may no longer be available. Pair again using a new link with the permissions you need.",
    openConnections: "Open Connections",
    allowed: "Allowed",
    allow: "Allow",
    checkError: "Could not check permissions. We'll try again automatically.",
  },
  clone: {
    /** Formats the message using name. */
    cloning: (name: string) => `Cloning ${name}`,
    cancelError: "Failed to cancel clone",
    /** Formats the message using name. */
    cloned: (name: string) => `Cloned ${name}`,
    /** Formats the message using name. */
    cancelled: (name: string) => `Cancelled cloning ${name}`,
    /** Formats the message using name. */
    failed: (name: string) => `Failed to clone ${name}`,
    failedDescription: "The clone failed.",
    retryError: "Failed to retry clone",
  },
  scripts: {
    /** Asks to delete the action with the supplied display name. */
    confirmDelete: (name: string) => `Delete action "${name}"?`,
    importError: "Failed to import action.",
    fromFile: "From t3.json",
    /** Formats the message using name. */
    editNamed: (name: string) => `Edit ${name}`,
    addScript: "Add project script",
    addAction: "Add action",
    run: "Run ",
    projectActions: "Project actions",
    addProjectAction: "Add project action…",
    projectScripts: "Project scripts",
    /** Formats the message using name. */
    runNamed: (name: string) => `Run ${name}`,
    pairTerminalHint: "Pair this client again with permission to run terminal commands.",
    scriptActions: "Script actions",
    actions: "Actions",
    chooseAction: "Choose project action",
    play: "Play",
    test: "Test",
    lint: "Lint",
    configure: "Configure",
    build: "Build",
    debug: "Debug",
    changeDenied: "This connection cannot change project actions.",
    keybindingDenied: "This connection cannot change keyboard shortcuts.",
    nameRequired: "Name is required.",
    commandRequired: "Command is required.",
    saveError: "Failed to save action.",
    editTitle: "Edit Action",
    addTitle: "Add Action",
    description: "Actions are project-scoped commands you can run from the top bar or keybindings.",
    name: "Name",
    chooseIcon: "Choose icon",
    keybinding: "Keybinding",
    pressShortcut: "Press shortcut",
    shortcutHintLead: "Press a shortcut. Use ",
    shortcutHintTail:
      "to clear. Shortcuts are environment-wide. Projects using the same action share its shortcut.",
    command: "Command",
    previewUrl: "Preview URL (optional)",
    previewHint: "Open this URL in the in-app preview when this action runs.",
    runOnCreate: "Run automatically on worktree creation",
    waitBeforeAgent: "Wait for it to finish before the agent starts",
    runOnSettle: "Run in the thread's worktree when the thread settles",
    autoPreview: "Open preview automatically when this action runs",
    saveAction: "Save action",
    deleteAction: "Delete action",
    invalidKeybinding: "Invalid keybinding.",
  },
  provider: {
    manageDenied: "This connection cannot manage provider accounts.",
    timeout: "Update timed out — try again.",
    disconnected: "This environment isn’t connected — try again once it reconnects.",
    manageDeniedHint:
      "This connection cannot manage provider accounts. View provider settings for update details.",
  },
  errors: {
    noEnvironment: "No environment is selected.",
    resourceMonitorDenied: "This connection cannot restart the resource monitor.",
    reopenView: "Could not reopen view",
    openLink: "Unable to open link.",
    openSystemSettings: "Unable to open System Settings.",
    loadRefs: "Failed to load refs.",
    searchFilesDenied: "This connection cannot search host files.",
    environmentRequest: "The environment request failed.",
  },
  server: {
    downloading: "Downloading…",
    restarting: "Restarting…",
    updateErrorDescription: "Server update failed.",
    updateError: "Server update failed",
    /** Formats the message using serverLabel. */
    updated: (serverLabel: string) => `${serverLabel} updated`,
    /** Formats the message using version. */
    desktopRelaunched: (version: string) => `Desktop app relaunched on ${version}.`,
    /** Formats the message using version. */
    reconnected: (version: string) => `Reconnected on t3@${version}.`,
    /** Formats the message using serverLabels. */
    confirmDesktopUpdates: (serverLabels: string) =>
      `Update the T3 Code desktop apps on ${serverLabels}? They will close and relaunch on those machines.`,
    /** Formats the message using serverLabel. */
    namedUpdateError: (serverLabel: string) => `${serverLabel} update failed`,
    updateCommandCopied: "Update command copied",
    relaunchCommandCopied: "Relaunch command copied",
    /** Formats the message using command, serverLabel. */
    runUpdateHint: (command: string, serverLabel: string) =>
      `Run \`${command}\` on ${serverLabel}, then restart t3 with your usual options.`,
    /** Formats the message using serverLabel, command. */
    runRelaunchHint: (serverLabel: string, command: string) =>
      `Stop t3 on ${serverLabel}, then relaunch with \`${command}\` using the same subcommand and options. This does not update an installed t3 command.`,
    copyCommandError: "Could not copy update command",
    /** Formats the message using serverLabel. */
    confirmDesktopUpdate: (serverLabel: string) =>
      `Update the T3 Code desktop app that runs the ${serverLabel}? It will close and relaunch on that machine.`,
    updateDesktopHint: "Update the desktop app on that machine to update this server.",
    copyUpdateCommand: "Copy update command",
    copyRelaunchCommand: "Copy relaunch command",
    /** Formats the message using actionLabel, serverLabel. */
    actionForServer: (actionLabel: string, serverLabel: string) =>
      `${actionLabel} for ${serverLabel}`,
    versionMismatch:
      "Version mismatch. Try syncing the client and server to the same T3 Code version.",
    updateDesktop: "Update the desktop app",
    updateToSync: "Update to stay in sync",
    /** Formats the message using message, hint. */
    mismatchHint: (message: string, hint: string) => `${message} Hint: ${hint}`,
  },
  requests: {
    /** Describes the waiting request count and the elapsed threshold in seconds. */
    slowDescription: (count: number, thresholdSeconds: number) =>
      `${count} request${count === 1 ? "" : "s"} waiting longer than ${thresholdSeconds}s.`,
    started: "Started ",
    hide: "Hide requests",
    show: "Show requests",
    slowTitle: "Some requests are slow",
  },
  thread: {
    thisThread: "this thread",
    /** Formats the message using title. */
    accessibleLabel: (title: string) => `Thread, ${title}`,
    open: "Open thread",
    unavailable: "Thread no longer available",
    completed: "Thread completed",
    approvalNeeded: "Approval needed",
    failed: "Thread failed",
    inputNeeded: "Input needed",
    changeDenied: "This connection cannot change threads.",
    archiveActiveError: "Cannot archive while the provider is active.",
    settleUnsupported:
      "This environment's server does not support settling yet. Update the server to use Settle.",
    snoozeUnsupported:
      "This environment's server does not support snoozing yet. Update the server to use Snooze.",
    snoozeBlocked:
      "This thread is waiting on you. Respond to the pending request before snoozing it.",
    autoSettleUnsupported:
      "This environment's server does not support turning auto-settle off per thread yet. Update the server to use it.",
    pinUnsupported:
      "This environment's server does not support pinning yet. Update the server to use Pin.",
    pinReorderUnsupported:
      "This environment's server does not support reordering pinned threads yet. Update the server to reorder pins.",
    reorderUnsupported: "Update this environment's server to reorder active threads.",
    /** Formats the message using title. */
    confirmUnpin: (title: string) => `Unpin thread "${title}"?`,
    unpinHint: "This will move the thread out of your pinned section.",
    deleteNavigationError: "Thread deleted, but navigation failed",
    undoArchiveError: "Failed to undo archive",
    onlyWorktreeThread: "This thread is the only one linked to this worktree:",
    deleteWorktreeQuestion: "Delete the worktree too?",
    removeWorktreeDenied: "This connection can no longer remove worktrees.",
    deleteWorktreeError: "Failed to delete worktree",
    worktreeRefreshError: "Worktree deleted, but Git status refresh failed",
    /** Formats the message using path, message. */
    removeWorktreeError: (path: string, message: string) => `Could not remove ${path}. ${message}`,
    undoUnpinError: "Failed to undo unpin",
    undoSettleError: "Failed to undo settle",
    loadingMessages: "Loading messages...",
    syncingMessages: "Syncing messages...",
  },
  context: {
    /** Formats the message using label. */
    showDetails: (label: string) => `${label}. Show details`,
    /** Formats the message using kindLabel, label, title. */
    open: (kindLabel: string, label: string, title: string) =>
      `Open ${kindLabel} ${label}: ${title}`,
    /** Formats the message using name, size. */
    imageAttachment: (name: string, size: string) => `Image attachment, ${name}, ${size}`,
    /** Formats the message using label. */
    unavailable: (label: string) => `Unavailable context, ${label}`,
  },
  clipboard: {
    branchName: "branch name",
    updateCommand: "update command",
    relaunchCommand: "relaunch command",
    copied: "Copied!",
    failed: "Failed to copy",
    copiedError: "Copied error",
    copyError: "Copy error",
  },
  color: {
    /** Names the saturation and brightness control for the supplied color label. */
    saturationAndBrightness: (label: string) => `${label} saturation and brightness`,
    instructions:
      "Use arrow keys to adjust the focused value. Hold Shift for larger steps. Use Home and End for the minimum and maximum. Press Tab to move between saturation and brightness.",
    saturation: "Saturation",
    brightness: "Brightness",
  },
  sidebar: {
    title: "Sidebar",
    description: "Displays the mobile sidebar.",
    toggle: "Toggle Sidebar",
    resize: "Resize Sidebar",
    dragResize: "Drag to resize sidebar",
  },
  details: {
    show: "Show details",
    hide: "Hide details",
  },
  notifications: {
    dismiss: "Dismiss notification",
    off: "Off",
    only: "Notifications only",
    soundOnly: "Sound only",
    withSound: "Notifications with sound",
  },
  wizard: {
    progress: "Setup progress",
    /** Formats the message using label, stepNumber, summarySuffix. */
    step: (label: string, stepNumber: number, summarySuffix: string) =>
      `${label}, step ${stepNumber}${summarySuffix}`,
  },
  editor: {
    fallback: "Editor",
    open: "Open in editor",
    /** Formats the message using editorLabel. */
    openNamed: (editorLabel: string) => `Open in ${editorLabel}`,
    /** Formats the message using targetPath. */
    noEnvironment: (targetPath: string) =>
      `Cannot open ${targetPath} because no environment is selected.`,
    /** Formats the message using targetPath, environmentId. */
    noAvailable: (targetPath: string, environmentId: string) =>
      `No available editor can open ${targetPath} in environment ${environmentId}.`,
    openDenied: "This connection cannot open an editor on this environment.",
  },
  settings: {
    serverRequired:
      "This setting is saved on a server, and the hosted app is not anchored to one. Change it from the desktop app or from the server's own address.",
    notSaved: "Setting not saved",
    permissionDenied: "This connection does not have permission to change these settings.",
    updateServers: "Update older servers to save this setting.",
  },
  upload: {
    /** Formats the message using status. */
    rejected: (status: number) => `Upload rejected (${status})`,
    failed: "Upload failed",
    timeout: "Upload timed out",
    cancelled: "Upload cancelled",
    denied: "This connection cannot upload attachments.",
    expired: "Uploaded file expired. Remove it and attach it again.",
    verifyError: "Uploaded file could not be verified. Retry when the server reconnects.",
    unsupportedImage: "Unsupported image type",
    originalMissing: "Original file is no longer available",
    startError: "Upload could not start",
    disconnected: "Not connected",
    retrySingle: "Retry or remove the failed attachment",
    retryMultiple: "Retry or remove the failed attachments",
    uploadingSingle: "Attachment still uploading",
    uploadingMultiple: "Attachments still uploading",
    readDataError: "Could not read image data.",
    readImageError: "Failed to read image.",
  },
  boot: {
    loadError: "T3 Code could not load.",
    reload: "Reload",
  },
  draft: {
    restoreError: "Failed to restore draft",
    newContent: "The draft has new content.",
  },
  colors: {
    gray: "Gray",
    red: "Red",
    orange: "Orange",
    amber: "Amber",
    yellow: "Yellow",
    lime: "Lime",
    green: "Green",
    emerald: "Emerald",
    teal: "Teal",
    cyan: "Cyan",
    sky: "Sky",
    blue: "Blue",
    indigo: "Indigo",
    violet: "Violet",
    purple: "Purple",
    fuchsia: "Fuchsia",
    pink: "Pink",
    rose: "Rose",
  },
  plan: {
    previewUnavailable: "Plan preview unavailable.",
  },
  themeImport: {
    /** Formats the library read error for the supplied storage key. */
    libraryReadFailed: (storageKey: string) =>
      `Failed to read the theme library from ${storageKey}.`,
    /** Formats the library write error for the supplied storage key. */
    libraryWriteFailed: (storageKey: string) =>
      `Failed to write the theme library to ${storageKey}.`,
    malformedDetails: "Open VSX returned malformed theme details.",
    responseTimeout: "Open VSX took too long to respond.",
    searchUnavailable: "Open VSX search is unavailable right now.",
    responseTooLarge: "Open VSX returned an unexpectedly large response.",
    unreadableResponse: "Open VSX returned an unreadable response.",
    unreadableSearch: "Open VSX returned an unreadable search response.",
    detailsUnavailable: "Open VSX theme details are unavailable.",
    detailTooLarge: "Open VSX returned an unexpectedly large detail response.",
    manifestTooLarge: "Open VSX returned an unexpectedly large manifest.",
    unreadableDetails: "Open VSX returned unreadable theme details.",
    detailsUnavailableNow: "Open VSX theme details are unavailable right now.",
    extensionManifest: "Extension manifest",
    noZipDirectory: "That extension package has no ZIP directory.",
    invalidZipDirectory: "That extension package has an invalid ZIP directory.",
    tooManyFiles: "That extension package has too many files.",
    unsupportedZip64: "That extension package has unsupported ZIP64 metadata.",
    expandedSizeLimit: "That extension package expands beyond the safe import limit.",
    unsafeCompressionRatio: "That extension package has an unsafe compression ratio.",
    downloadFailed: "That Open VSX theme could not be downloaded.",
    extensionTooLarge: "That theme extension is too large to import safely.",
    unreadableManifest: "That Open VSX extension has no readable manifest.",
    extensionManifestTooLarge: "That Open VSX extension manifest is too large.",
    noColorThemes: "That extension does not contain color themes.",
    tooManyColorThemes: "That extension contains too many color themes to import safely.",
    unreadableChecksum: "That Open VSX theme has no readable checksum.",
    invalidChecksumResponse: "That Open VSX checksum response is invalid.",
    invalidChecksum: "That Open VSX theme has an invalid checksum.",
    integrityCheckFailed: "That Open VSX theme failed its integrity check.",
    packageOpenFailed: "That Open VSX extension package could not be opened.",
    packageMismatch: "That extension package does not match the selected Open VSX theme.",
    licenseMismatch: "That extension package does not match its advertised license.",
    unsafeThemes: "One or more color themes in that extension could not be imported safely.",
    noCompatibleThemes: "That extension has no compatible color themes.",
    emptyCollection: "A theme collection cannot be empty.",
    invalidCollection: "That theme collection is invalid.",
    installedThemesChanged:
      "Your installed themes changed while this package was downloading. Try again.",
    colorsObjectRequired: "Theme colors must be objects.",
    colorRoleRequired: "Add at least one color role to the theme file.",
    jsonObjectRequired: "Theme files must contain a JSON object.",
    nameRequired: "Theme files need a name (48 characters or fewer).",
    appearanceRequired: 'Theme files need an appearance of "light" or "dark".',
    colorsRequired: "Theme files need a colors object.",
    invalidId: "Theme ids may only contain lowercase letters, numbers, and hyphens.",
    collectionMetadataRequired: "Theme collections need a valid id and label.",
    variantsObjectRequired: "Theme variants must be an object.",
    variantNames: 'Theme variants may only be named "light" or "dark".',
    missingEditorBackground:
      'That VS Code theme has no "editor.background" color, so there is nothing to build a palette from.',
    /** Formats the error using the supplied description. */
    invalidJson: (description: string) => `${description} is not valid JSON.`,
    /** Formats the error using the supplied description. */
    missingPackageFile: (description: string) =>
      `${description} is missing from the extension package.`,
    /** Formats the error using the supplied description. */
    unreadableSize: (description: string) => `${description} has unreadable size metadata.`,
    /** Formats the error using the supplied description. */
    fileTooLarge: (description: string) => `${description} is too large.`,
    /** Formats the error using the supplied id. */
    reservedId: (id: string) => `The theme id "${id}" is reserved.`,
    /** Formats the error using the supplied label. */
    alreadyInstalled: (label: string) => `A theme named "${label}" is already installed.`,
    /** Formats the error using the supplied label. */
    notInstalled: (label: string) => `The theme "${label}" is not installed.`,
    /** Formats the error using the supplied role. */
    unsupportedColorRole: (role: string) => `"${role}" is not a supported theme color role.`,
    /** Formats the error using the supplied role. */
    literalColorRequired: (role: string) =>
      `The color for "${role}" must be a literal CSS color such as oklch(0.62 0.2 280).`,
    /** Formats the error using the supplied version. */
    unsupportedVersion: (version: number) =>
      `This theme file uses an unsupported version. Expected ${version}.`,
    /** Formats the error using the supplied appearance. */
    repeatedAppearance: (appearance: string) =>
      `Theme variants must not repeat the base appearance "${appearance}".`,
  },
};
