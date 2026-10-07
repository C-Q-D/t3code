/** English chat messages; interpolation leaves UI rendering to the caller. */
import type { SourceControlProviderKind, WorktreeSubmodules } from "@t3tools/contracts";

export const chat = {
  /** Formats a conversation count; count is the number of threads to describe. */
  threadCount: (count: number) => (count === 1 ? "1 thread" : `${count} threads`),

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
