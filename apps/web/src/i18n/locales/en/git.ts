/** English UI labels for PRs, Git operations, diffs, and branches; excludes persisted values and protocol strings. */
export const git = {
  diffSearch: {
    noResults: "No results",
    /** Formats the total number of matching results. */
    results: (count: number) => `${count} results`,
    /** Formats the one-based current match index and total count. */
    currentResult: (index: number, count: number) => `${index} of ${count}`,
    matchCase: "Match Case",
    wholeWord: "Whole Word",
    regexp: "Regexp",
    replace: "Replace",
    replaceAll: "Replace All",
    search: "Search",
    previous: "Previous",
    next: "Next",
    close: "Close",
  },
  pullRequest: {
    attachByUrlOrNumber:
      "Attach a pull request to this thread by its URL, or by its number for this thread's repository.",
    couldNotMergeStack: "Could not merge the stack",
    couldNotRebaseStack: "Could not rebase the stack",
    confirmAutoMerge: "Confirm auto-merge?",
    confirmMerge: "Confirm merge?",
    confirmClose: "Confirm close?",
    confirmRevert: "Confirm revert?",
    confirmApprove: "Confirm approve?",
    filterComments: "Filter comments",
    filter: "Filter",
    show: "Show",
    botComments: "Bot comments",
    resolvedOrDismissed: "Resolved or dismissed",
    runContext: "Run context",
    /** Formats the host-opening action for the selected provider. */
    openOnHostName: (host: string) => `Open on ${host}`,
    /** Names the provider that merged or queued the stack. */
    hostMergedStack: (host: string) => `${host} merged the stack or added it to its merge queue.`,
    /** Describes the selected host stack and its merge behavior. */
    hostStack: (host: string, count: number) =>
      `${host} stack of ${count}: merging a layer lands the ones below it.`,
    /** Counts comments excluded by the current filter. */
    hiddenComments: (count: number) => `${count} hidden`,
    /** Explains when the filter hides every comment. */
    allCommentsHidden: (count: number) =>
      count === 1
        ? "The only comment is hidden by the filter."
        : `All ${count} comments are hidden by the filter.`,

    showPrefix: "Show ",
    showOnlyPrefix: "Show only ",
    olderBotCommentStem: " older bot comment",
    recentBotCommentStem: " recent bot comments",
    hiddenSuffix: " hidden)",
    viewedLowercase: "viewed",
    /** Returns the plural suffix for the hidden comment count. */
    commentPluralSuffix: (count: number) => (count === 1 ? "" : "s"),
    /** Names files using the supplied file count. */
    fileWord: (count: number): string => (count === 1 ? "file" : "files"),
    /** Names comments using the supplied comment count. */
    commentWord: (count: number): string => (count === 1 ? "comment" : "comments"),
    /** Names approvals using the supplied approval count. */
    approvalWord: (count: number): string => (count === 1 ? "approval" : "approvals"),
    /** Names authors using the supplied author count. */
    authorWord: (count: number): string => (count === 1 ? "author" : "authors"),
    /** Formats the supplied file count with application number formatting. */
    fileCount: (count: number) => `${count.toLocaleString()} ${count === 1 ? "file" : "files"}`,
    /** Formats the supplied comment count with application number formatting. */
    commentCount: (count: number) =>
      `${count.toLocaleString()} ${count === 1 ? "comment" : "comments"}`,
    /** Formats the supplied commit count with application number formatting. */
    commitCount: (count: number) =>
      `${count.toLocaleString()} ${count === 1 ? "commit" : "commits"}`,
    autoMerge: "Auto-merge",
    toBranch: "to",
    reactionViewer: "You",
    /** Formats the UI heading from the pull request number. */
    requestNumber: (number: number) => `Pull request #${number}`,
    /** Names checkout using the provider's unchanged singular term. */
    checkoutRequest: (singular: string) => `Checkout ${singular}`,
    /** Explains checkout using the provider name and unchanged request term. */
    checkoutDescription: (provider: string, singular: string) =>
      `Resolve a ${provider} ${singular}, then create the draft thread in the main repo or in a dedicated worktree.`,
    /** Reports the number of commits not yet shown. */
    moreCommits: (count: number) => `Show more (${count} left)`,
    /** Names the already shortened search query. */
    nothingMatches: (query: string) => `Nothing matches “${query}”`,
    /** Names a stack using its number. */
    stackNumber: (number: number) => `Stack #${number}`,
    /** Names the stack number, current layer position, and total layer count. */
    viewStackLayer: (number: number, position: number, total: number) =>
      `View stack #${number}, layer ${position} of ${total}`,
    /** Reports the number of layers included in the merge. */
    mergeStackLayerCount: (count: number) => `Merge stack (${count})`,
    /** Names the final layer number, destination branch, and included request count. */
    mergeStackThrough: (number: number, base: string, count: number) =>
      `Merge stack through #${number} into ${base} (${count} ${count === 1 ? "pull request" : "pull requests"})`,
    /** Reports the comment count to reveal and the total currently hidden. */
    olderComments: (shown: number, hidden: number) =>
      `Show ${shown} older comment${hidden === 1 ? "" : "s"} (${hidden} hidden)`,
    /** Reports the recent comment window size. */
    recentComments: (count: number) => `Show only ${count} recent comments`,
    /** Reports the number of recent comments available in a truncated conversation. */
    truncatedComments: (count: number) =>
      `This conversation is longer than this page reads in one go. The most recent ${count} are here; open it on the host to read the rest.`,
    /** Reports open and linked pull request counts. */
    linkedRequestCounts: (open: number, linked: number) => `${open} open · ${linked} linked`,
    /** Counts unnamed actors after named reaction actors. */
    reactionOthers: (count: number) => `${count} ${count === 1 ? "other" : "others"}`,
    /** Counts reaction actors when no actors are named. */
    reactionPeople: (count: number) => `${count} ${count === 1 ? "person" : "people"}`,
    reactionNames: {
      thumbsUp: "thumbs up",
      thumbsDown: "thumbs down",
      laugh: "laugh",
      hooray: "hooray",
      confused: "confused",
      heart: "heart",
      rocket: "rocket",
      eyes: "eyes",
    },
    /** Formats prepareThreadError using singular. */
    prepareThreadError: (singular: string) => `Failed to prepare ${singular} thread.`,
    /** Formats pasteCheckout using singular. */
    pasteCheckout: (singular: string) =>
      `Paste a ${singular} URL, checkout command, or enter 123 / #123.`,
    /** Formats checkoutInputHint using singular. */
    checkoutInputHint: (singular: string) =>
      `Use a ${singular} URL, checkout command, 123, or #123.`,
    /** Formats checkoutPlaceholder using shortLabel. */
    checkoutPlaceholder: (shortLabel: string) => `${shortLabel} URL, checkout command, or #42`,
    /** Formats noReadableProject using host, repository. */
    noReadableProject: (host: string, repository: string) =>
      `No project in this environment can read ${host}/${repository}.`,
    /** Formats openChecks using summary. */
    openChecks: (summary: string) => `Open checks: ${summary}`,
    /** Formats checksLabel using label. */
    checksLabel: (label: string) => `Checks: ${label}`,
    /** Formats scopeLabel using scope. */
    scopeLabel: (scope: string) => `Diff scope: ${scope}`,
    /** Formats viewedInApp using app. */
    viewedInApp: (app: string) => `viewed in ${app}`,
    /** Formats conversationCount using count. */
    conversationCount: (count: number) => `${count} conversations`,
    /** Formats requestFiles using number. */
    requestFiles: (number: number) => `Pull request #${number} files`,
    /** Formats pendingReview using count. */
    pendingReview: (count: number) =>
      `Review pull request, ${count} ${count === 1 ? "comment" : "comments"} pending`,
    /** Formats reviewCount using count. */
    reviewCount: (count: number) => `Review (${count})`,
    /** Formats behindCommits using count. */
    behindCommits: (count: number) =>
      ` by ${count.toLocaleString()} ${count === 1 ? "commit" : "commits"}`,
    /** Formats branchOutdated using base, behind. */
    branchOutdated: (base: string, behind: string) =>
      `This branch is out-of-date with ${base}${behind}.`,
    /** Formats copiedLabel using label. */
    copiedLabel: (label: string) => `${label} copied`,
    /** Formats copyLabelError using label. */
    copyLabelError: (label: string) => `Failed to copy ${label}`,
    /** Formats checkoutThreadHint using branch. */
    checkoutThreadHint: (branch: string) =>
      `The checkout is ready on \`${branch}\`. Point a thread at it from the branch picker, then ask again.`,
    /** Formats autoMergeMethod using method. */
    autoMergeMethod: (method: string) => `Auto-merge (${method})`,
    /** Formats openRepository using repository. */
    openRepository: (repository: string) => `Open ${repository} repository`,
    /** Formats openRequestOnHost using number. */
    openRequestOnHost: (number: number) => `Open pull request #${number} on host`,
    /** Formats stackedOn using branch. */
    stackedOn: (branch: string) => `Stacked on ${branch}`,
    /** Formats changedFileCount using count. */
    changedFileCount: (count: number) =>
      `${count.toLocaleString()} changed ${count === 1 ? "file" : "files"}`,
    /** Formats checksSummary using summary. */
    checksSummary: (summary: string) => `Checks: ${summary}`,
    /** Formats requestNotFound using number. */
    requestNotFound: (number: number) => `Pull request #${number} not found`,
    /** Formats mergeConfirmation using number, method. */
    mergeConfirmation: (number: number, method: string) =>
      `This merges #${number} using ${method}.`,
    /** Formats autoMergeConfirmation using number, method. */
    autoMergeConfirmation: (number: number, method: string) =>
      `This merges #${number} using ${method} as soon as the host considers it ready, which may be immediately.`,
    /** Formats revertConfirmation using number. */
    revertConfirmation: (number: number) =>
      `This opens a new pull request that reverses the changes merged by #${number}.`,
    /** Formats workflowsConfirmation using count, number. */
    workflowsConfirmation: (count: number, number: number) =>
      `This allows ${count} ${count === 1 ? "workflow" : "workflows"} from #${number} to run. Review the code and workflow changes first.`,
    /** Formats closeConfirmation using number. */
    closeConfirmation: (number: number) => `This closes #${number} without merging it.`,
    /** Formats removeLabelError using label. */
    removeLabelError: (label: string) => `Could not take ${label} off`,
    /** Formats addLabelError using label. */
    addLabelError: (label: string) => `Could not put ${label} on`,
    /** Formats searchingHosts using query. */
    searchingHosts: (query: string) => `Searching every host for “${query}”`,
    /** Formats selectedLabels using count. */
    selectedLabels: (count: number) => `${count} selected`,
    /** Formats cancelReviewError using login. */
    cancelReviewError: (login: string) => `Could not take back the review request to ${login}`,
    /** Formats requestReviewError using login. */
    requestReviewError: (login: string) => `Could not ask ${login} for a review`,
    /** Formats reviewRequestCancelled using login. */
    reviewRequestCancelled: (login: string) => `Review request to ${login} taken back`,
    /** Formats reviewRequestedFrom using login. */
    reviewRequestedFrom: (login: string) => `Review requested from ${login}`,
    /** Formats quickActions using number. */
    quickActions: (number: number) => `Quick actions for pull request #${number}`,
    /** Formats immediately using label. */
    immediately: (label: string) => `${label} immediately`,
    /** Formats stackLayer using number, position, total. */
    stackLayer: (number: number, position: number, total: number) =>
      `Stack ${number}, layer ${position} of ${total}`,
    /** Formats mergeStackCount using count. */
    mergeStackCount: (count: number) => `Merge ${count} pull requests?`,
    /** Formats rebaseStackCount using count. */
    rebaseStackCount: (count: number) => `Rebase ${count} pull requests?`,
    /** Formats mergeStackConfirmation using number, base, method. */
    mergeStackConfirmation: (number: number, base: string, method: string, host: string) =>
      `Merge #${number} and its unmerged layers below into ${base} using ${method}. ${host} checks their rules before merging or queueing them and rebases the remaining stack after merging.`,
    /** Formats rebaseStackConfirmation using base. */
    rebaseStackConfirmation: (base: string) =>
      `Rebase the remote branches from bottom to top onto ${base}. This rewrites branch history and may restart checks. If a layer fails, earlier updates remain.`,
    /** Formats commentsCount using count. */
    commentsCount: (count: number) => `Comments (${count})`,
    /** Formats botCommentsCount using count. */
    botCommentsCount: (count: number) => `${count} bot comment${count === 1 ? "" : "s"}`,
    /** Formats finishedCommentsCount using count. */
    finishedCommentsCount: (count: number) =>
      `${count} resolved or dismissed comment${count === 1 ? "" : "s"}`,
    /** Formats linkedThreadsCount using count. */
    linkedThreadsCount: (count: number) =>
      `Linked from ${count} ${count === 1 ? "thread" : "threads"}`,
    /** Formats viewCommit using commit. */
    viewCommit: (commit: string) => `View commit ${commit}`,
    /** Formats chainedRequests using count. */
    chainedRequests: (count: number) => `${count} pull requests chained by base branch.`,
    /** Formats requestActions using number. */
    requestActions: (number: number) => `Actions for #${number}`,
    /** Formats syncedAt using time. */
    syncedAt: (time: string) => ` · synced ${time}`,
    /** Formats checksRunning using count, total. */
    checksRunning: (count: number, total: number) => `${count} of ${total} running`,
    /** Formats checksAwaitingAction using count, total. */
    checksAwaitingAction: (count: number, total: number) => `${count} of ${total} awaiting action`,
    /** Formats checksFailed using count. */
    checksFailed: (count: number) => `${count} failed`,
    /** Formats checksFailing using count, total. */
    checksFailing: (count: number, total: number) => `${count} of ${total} failing`,
    /** Formats checksPassing using count, total. */
    checksPassing: (count: number, total: number) => `${count} of ${total} passing`,
    /** Formats commitTitle using commit. */
    commitTitle: (commit: string) => `Commit ${commit}`,
    /** Formats conflictsWith using base. */
    conflictsWith: (base: string) => `Conflicts with ${base}`,
    /** Formats earlierReview using label. */
    earlierReview: (label: string) => `${label} earlier changes`,
    /** Formats openProfile using login. */
    openActorProfile: (login: string) => `Open ${login}'s profile`,
    /** Formats workflowsAndChecksAwaiting using workflows, checks. */
    workflowsAndChecksAwaiting: (workflows: number, checks: number) =>
      `${workflows} ${workflows === 1 ? "workflow" : "workflows"} and ${checks} ${checks === 1 ? "check" : "checks"} awaiting action`,
    /** Formats workflowsAwaiting using count. */
    workflowsAwaiting: (count: number) =>
      `${count} ${count === 1 ? "workflow" : "workflows"} awaiting approval`,
    /** Formats otherChecksAwaiting using count. */
    otherChecksAwaiting: (count: number) =>
      `${count} ${count === 1 ? "check" : "checks"} awaiting action`,
    /** Formats joinTwoNames using first, second. */
    joinTwoNames: (first: string | undefined, second: string | undefined) =>
      `${first} and ${second}`,
    /** Formats joinMoreNames using first, last. */
    joinMoreNames: (first: string, last: string | undefined) => `${first}, and ${last}`,
    /** Formats reactionTooltip using actors, reaction. */
    reactionTooltip: (actors: string, reaction: string) =>
      `${actors} reacted with ${reaction} emoji`,
    /** Formats closedBatch using closed, total. */
    closedBatch: (closed: number, total: number) => `Closed ${closed} of ${total} pull requests`,
    /** Formats closedCount using count. */
    closedCount: (count: number) => `Closed ${count} pull request${count === 1 ? "" : "s"}`,
    resolving: "Resolving ",
    preparingLocal: "Preparing local...",
    local: "Local",
    preparingWorktree: "Preparing worktree...",
    worktree: "Worktree",
    pasteAFullURLToLinkAPullRequestFromAnotherRepository:
      "Paste a full URL to link a pull request from another repository.",
    pasteAFullURLThisProjectSHostHasNoKnownPullRequestURL:
      "Paste a full URL; this project's host has no known pull request URL.",
    couldNotLinkThePullRequest: "Could not link the pull request.",
    pasteAPullRequestURLOrEnter123123: "Paste a pull request URL or enter 123 / #123.",
    applyAPullRequestURL123Or123: "Use a pull request URL, 123, or #123.",
    linkPullRequest: "Link pull request",
    pullRequestURLOr42: "Pull request URL or #42",
    linking: "Linking...",
    link: "Link",
    couldNotLoadPullRequestActivity: "Could not load pull request activity",
    retry: "Retry",
    loadingChecks: "Loading checks…",
    noChecksReported: "No checks reported",
    unableToOpenCheckDetails: "Unable to open check details",
    details: "Details",
    showLess: "Show less",
    showAll: "Show all",
    failed: " failed",
    checkDetailsAreOutOfDateRefreshThePullRequestToUpdateThem:
      "Check details are out of date. Refresh the pull request to update them.",
    fixInAThread: "Fix in a thread",
    theRestOfThisDiffCouldNotBeLoaded: "The rest of this diff could not be loaded.",
    loadingMoreFiles: "Loading more files...",
    changed: "Changed",
    viewed: "Viewed",
    thisFileHasBeenPushedToSinceYouMarkedItViewed:
      "This file has been pushed to since you marked it viewed.",
    moreCommentsCouldNotBeLoaded: "More comments could not be loaded",
    replyCouldNotBePosted: "Reply could not be posted",
    theCommentCouldNotBeSaved: "The comment could not be saved",
    theConversationCouldNotBeUpdated: "The conversation could not be updated",
    addToReview: "Add to review",
    addToAgent: "Add to agent",
    allCommits: "All commits",
    theseTicksAreKeptHereNotOnTheHost: "These ticks are kept here, not on the host",
    thisHostKeepsNoSharedRecordOfWhichFilesYouHaveReadSoTheseTicksAreKeptByThisEnvironmen:
      "This host keeps no shared record of which files you have read, so these ticks are kept by this environment. They follow you between the apps connected to it, but the host's own web UI will not show them.",
    yourTicksCouldNotBeRead: "Your ticks could not be read",
    theBoxesBelowAreWhateverWasLastReadAndEmptyIfNothingHasBeenReadYet:
      "The boxes below are whatever was last read, and empty if nothing has been read yet. ",
    thisCountCoversOnlyPartOfTheChange: "This count covers only part of the change",
    thisChangeHasMoreFilesThanTheHostWillReportTicksForInOneReadSoTheCountIsShortAndSomeB:
      "This change has more files than the host will report ticks for in one read, so the count is short and some boxes below start empty.",
    someOfThisDiffWasNotShown: "Some of this diff was not shown",
    theHostWithheldPartOfThisDiffABinaryFileOrAChangeTooLargeToInline:
      "The host withheld part of this diff — a binary file, or a change too large to inline.",
    lineCommentsAreWrittenFromTheWholeChange: "Line comments are written from the whole change",
    aCommentIsAnchoredToTheWholeChangeSoSwitchToAllCommitsToWriteOne:
      "A comment is anchored to the whole change, so switch to All commits to write one.",
    loadingPullRequestDiff: "Loading pull request diff...",
    thisPullRequestHasNoFileChanges: "This pull request has no file changes.",
    thisCommitHasNoFileChanges: "This commit has no file changes.",
    conversationsNotOnTheCurrentDiff: "Conversations not on the current diff",
    conversationsNotOnTheDiffLoadedSoFar: "Conversations not on the diff loaded so far",
    oneConversation: "1 conversation",
    line: "Line ",
    loadMoreFiles: "Load more files",
    showFullComment: "Show full comment",
    couldNotPostTheComment: "Could not post the comment",
    leaveAComment: "Leave a comment",
    commentOnThisPullRequest: "Comment on this pull request",
    closing: "Closing...",
    reopening: "Reopening...",
    closeWithComment: "Close with comment",
    reopenWithComment: "Reopen with comment",
    posting: "Posting...",
    reviewPullRequest: "Review pull request",
    commentOnPullRequest: "Comment on pull request",
    pullRequestComposer: "Pull request composer",
    composerMode: "Composer mode",
    review: "Review",
    discardPendingLineComments: "Discard pending line comments",
    closeComposer: "Close composer",
    pullRequestMerged: "Pull request merged",
    markedReadyForReview: "Marked ready for review",
    convertedToDraft: "Converted to draft",
    pullRequestClosed: "Pull request closed",
    pullRequestReopened: "Pull request reopened",
    branchUpdatedWithTheBaseBranch: "Branch updated with the base branch",
    autoMergeTurnedOnMergesAsSoonAsThisIsReadySoonerIfItAlreadyIs:
      "Auto-merge turned on — merges as soon as this is ready, sooner if it already is",
    autoMergeTurnedOff: "Auto-merge turned off",
    revertPullRequestOpened: "Revert pull request opened",
    workflowsApproved: "Workflows approved",
    couldNotMergeThisPullRequest: "Could not merge this pull request",
    couldNotMarkThisReadyForReview: "Could not mark this ready for review",
    couldNotConvertThisToADraft: "Could not convert this to a draft",
    couldNotCloseThisPullRequest: "Could not close this pull request",
    couldNotReopenThisPullRequest: "Could not reopen this pull request",
    couldNotUpdateThisBranch: "Could not update this branch",
    couldNotTurnOnAutoMerge: "Could not turn on auto-merge",
    couldNotTurnOffAutoMerge: "Could not turn off auto-merge",
    couldNotOpenARevertPullRequest: "Could not open a revert pull request",
    couldNotApproveWorkflows: "Could not approve workflows",
    theHostRefusedTheMergeCheckThatYouHaveWriteAccessThatTheChecksItRequiresHavePassedAnd:
      "The host refused the merge. Check that you have write access, that the checks it requires have passed, and that the branch is not conflicting.",
    theHostRefusedItCheckThatYouHaveWriteAccessToThisRepository:
      "The host refused it. Check that you have write access to this repository.",
    theHostRefusedItCheckThatYouHaveWriteAccessOrThatYouOpenedIt:
      "The host refused it. Check that you have write access, or that you opened it.",
    theHostRefusedItCheckThatYouHaveWriteAccessAndThatTheBranchStillExists:
      "The host refused it. Check that you have write access, and that the branch still exists.",
    theHostRefusedItCheckThatYouHaveWriteAccessToTheBranchOneFromAForkAlsoNeedsItsAuthorT:
      "The host refused it. Check that you have write access to the branch — one from a fork also needs its author to allow edits from maintainers — and that it does not conflict with the base.",
    theHostRefusedItCheckThatThisRepositoryAllowsAutoMergeThatYouHaveWriteAccessAndThatTh:
      "The host refused it. Check that this repository allows auto-merge, that you have write access, and that there is something left for it to wait on.",
    theHostRefusedItCheckThatYouHaveWriteAccessAndThatTheMergeHasNotAlreadyHappened:
      "The host refused it. Check that you have write access, and that the merge has not already happened.",
    theHostRefusedItCheckThatYouHaveWriteAccessAndThatThisPullRequestWasMergedOnTheHost:
      "The host refused it. Check that you have write access and that this pull request was merged on the host.",
    theHostRefusedItCheckThatYouHaveActionsWriteAccessAndThatTheseWorkflowRunsAreStillAwa:
      "The host refused it. Check that you have Actions write access and that these workflow runs are still awaiting approval.",
    theHostRefusedItARebaseStopsAtTheFirstCommitThatDoesNotApplyCleanlyUpdatingWithAMerge:
      "The host refused it. A rebase stops at the first commit that does not apply cleanly; updating with a merge commit may still work.",
    timeline: "Timeline",
    code: "Code",
    changesCanBeCleanlyMerged: "Changes can be cleanly merged.",
    updateWithRebase: "Update with rebase",
    updateBranch: "Update branch",
    pullRequestReference: "pull request reference",
    pRNumber: "PR number",
    couldNotCopyCheckoutCommand: "Could not copy checkout command",
    theTitleCouldNotBeSaved: "The title could not be saved",
    theHostRefusedTheNewTitle: "The host refused the new title.",
    addedToTheComposer: "Added to the composer",
    theQuestionIsInTheComposerReadItOverThenSend:
      "The question is in the composer — read it over, then send.",
    thePullRequestIsInTheComposerTypeYourQuestionThenSend:
      "The pull request is in the composer — type your question, then send.",
    couldNotOpenAThread: "Could not open a thread",
    tryAgainFromTheProjectOrOpenAThreadFirst: "Try again from the project, or open a thread first.",
    askedInAThread: "Asked in a thread",
    theTaskIsInTheComposerReadItOverThenSend:
      "The task is in the composer — read it over, then send.",
    preparingThePullRequestCheckout: "Preparing the pull request checkout...",
    couldNotOpenAThreadForTheCheckout: "Could not open a thread for the checkout",
    couldNotPrepareThePullRequestCheckout: "Could not prepare the pull request checkout",
    checkedOutButTheThreadStayedWhereItWas: "Checked out, but the thread stayed where it was",
    checkedOutButNotOnTheLatestCommits: "Checked out, but not on the latest commits",
    theCheckoutCouldNotBeMovedOntoThePullRequestSLatestCommitsSoTheCodeThereIsOlderThanTh:
      "The checkout could not be moved onto the pull request's latest commits, so the code there is older than the pull request. Uncommitted work or local commits keep it where it is.",
    checkedOutHere: "Checked out here",
    checkedOut: "Checked out",
    thisRepositoryIsOnThePullRequestSBranchWithAThreadOpenOnIt:
      "This repository is on the pull request's branch, with a thread open on it.",
    thePullRequestIsInItsOwnWorktreeWithAThreadOpenOnIt:
      "The pull request is in its own worktree, with a thread open on it.",
    checkoutReady: "Checkout ready",
    checkingOut: "Checking out...",
    checkOut: "Check out",
    checkOutThisPullRequest: "Check out this pull request",
    inASeparateWorktree: "In a separate worktree",
    itsOwnFolderAndThreadNothingYouHaveOpenMoves:
      "Its own folder and thread. Nothing you have open moves.",
    inThisRepository: "In this repository",
    switchesTheBranchYouAreWorkingInLikeGhPrCheckout:
      "Switches the branch you are working in, like `gh pr checkout`.",
    preparing: "Preparing...",
    resolveConflicts: "Resolve conflicts",
    backToThisThreadSPullRequests: "Back to this thread's pull requests",
    backToPullRequests: "Back to pull requests",
    retryStackLookup: "Retry stack lookup",
    theHostWillMergeThisOnItsOwnOnceItsRequirementsAreMet:
      ": the host will merge this on its own once its requirements are met",
    readyForReview: "Ready for review",
    enabling: "Enabling...",
    merging: "Merging...",
    refreshingPullRequest: "Refreshing pull request",
    morePullRequestActions: "More pull request actions",
    refresh: "Refresh",
    opening: "Opening...",
    askAQuestion: "Ask a question",
    addsThePullRequestToThisThreadSComposer: "Adds the pull request to this thread's composer.",
    opensAThreadThatKnowsWhichPullRequestYouMean:
      "Opens a thread that knows which pull request you mean.",
    explainThisPR: "Explain this PR",
    aWalkThroughTheDiffAndWhatToReadClosely: "A walk through the diff and what to read closely.",
    convertToDraft: "Convert to draft",
    mergeNow: "Merge now",
    disableAutoMerge: "Disable auto-merge",
    enableAutoMerge: "Enable auto-merge",
    pRLink: "PR link",
    copyLink: "Copy link",
    copyPRNumber: "Copy PR number",
    closePullRequest: "Close pull request",
    reopenPullRequest: "Reopen pull request",
    revertChanges: "Revert changes",
    collapsePullRequestPanel: "Collapse pull request panel",
    stackedPullRequest: "Stacked pull request",
    receivesChangesFrom: "receives changes from",
    editTitle: "Edit title",
    pullRequestTitle: "Pull request title",
    saving: "Saving...",
    save: "Save",
    updated: "updated ",
    pullRequestCheckoutCommand: "pull request checkout command",
    copyCheckoutCommand: "Copy checkout command",
    checkoutCommandCopied: "Checkout command copied",
    branchName: "branch name",
    copyPullRequestBranch: "Copy pull request branch",
    branchNameCopied: "Branch name copied",
    pullRequestTabs: "Pull request tabs",
    approving: "Approving...",
    approveWorkflowsToRun: "Approve workflows to run",
    checks: "Checks",
    commentsUnavailable: "Comments unavailable",
    commitsUnavailable: "Commits unavailable",
    showOldestActivityFirst: "Show oldest activity first",
    showNewestActivityFirst: "Show newest activity first",
    newestFirst: "Newest first",
    oldestFirst: "Oldest first",
    itMayBeAnIssueRatherThanAPullRequestOrThisAccountCanTSeeIt:
      "It may be an issue rather than a pull request, or this account can't see it.",
    mergePullRequest: "Merge pull request?",
    enableAutoMerge2: "Enable auto-merge?",
    revertTheseChanges: "Revert these changes?",
    approveWorkflowsToRun2: "Approve workflows to run?",
    closePullRequest2: "Close pull request?",
    createRevertPR: "Create revert PR",
    approveAndRun: "Approve and run",
    close: "Close",
    loadingPullRequests: "Loading pull requests",
    loadingPullRequest: "Loading pull request",
    pullRequestActionsLoading: "Pull request actions loading",
    reviewers: "Reviewers",
    reviewersLoading: "Reviewers loading",
    labels: "Labels",
    none: "None",
    labelsLoading: "Labels loading",
    description: "Description",
    loadingPeople: "Loading people",
    loadingTimeline: "Loading timeline",
    loadingPullRequestConversation: "Loading pull request conversation",
    theHostRefusedItCheckThatYouHaveTriageAccessOnThisRepository:
      "The host refused it. Check that you have triage access on this repository.",
    changeLabels: "Change labels",
    changingLabelsNeedsTriageAccessOnThisRepository:
      "Changing labels needs triage access on this repository",
    searchLabels: "Search labels",
    thisRepositoryHasNoLabels: "This repository has no labels.",
    noLabelMatchesThat: "No label matches that.",
    theLabelsCouldNotBeRead: "The labels could not be read.",
    thisRepositoryHasMoreLabelsThanAreListedHereApplyTheRestOnTheHost:
      "This repository has more labels than are listed here. Apply the rest on the host.",
    applied: "Applied",
    opened: "opened ",
    noProjectsInThisWorkspace: "No projects in this workspace",
    addAProjectAndThePullRequestsFromItsRepositoryAppearHere:
      "Add a project, and the pull requests from its repository appear here.",
    addProject: "Add project",
    theHostsWereSearchedForItTryFewerWordsOrSearchByNumberAuthorOrBranch:
      "The hosts were searched for it. Try fewer words, or search by number, author or branch.",
    clearSearch: "Clear search",
    checking: "Checking...",
    checkAgain: "Check again",
    nothingUnderTheseFilters: "Nothing under these filters",
    noPullRequests: "No pull requests",
    widenTheStateInvolvementOrProjectFilterToSeeMore:
      "Widen the state, involvement or project filter to see more.",
    pullRequestsFromEveryProjectInThisWorkspaceAppearHere:
      "Pull requests from every project in this workspace appear here.",
    loading: "Loading...",
    loadMorePullRequests: "Load more pull requests",
    searchPullRequestsOrLabelBug: "Search pull requests, or label:bug",
    searchPullRequests: "Search pull requests",
    all: "All",
    draftsOnly: "Drafts only",
    hideDrafts: "Hide drafts",
    approved: "Approved",
    changesRequested: "Changes requested",
    reviewRequired: "Review required",
    noReviews: "No reviews",
    passing: "Passing",
    failing: "Failing",
    unavailable: "· Unavailable",
    author: "Author",
    anyone: "Anyone",
    searchAuthors: "Search authors",
    mergesLoaded: " merges loaded",
    noAuthorsFound: "No authors found",
    any: "Any",
    noLabelsInThisView: "No labels in this view",
    allProjects: "All projects",
    filters: "Filters",
    state: "State",
    involvement: "Involvement",
    draft: "Draft",
    host: "Host",
    server: "Server",
    project: "Project",
    pullRequestVideo: "Pull request video",
    openAttachmentOnGitHub: "Open attachment on GitHub",
    markdownEditorMode: "Markdown editor mode",
    write: "Write",
    preview: "Preview",
    nothingToPreview: "Nothing to preview.",
    theReactionCouldNotBeSaved: "The reaction could not be saved",
    addAReaction: "Add a reaction",
    pendingSentWhenYouSubmitTheReview: "Pending — sent when you submit the review",
    discardThisComment: "Discard this comment",
    resolved: "Resolved",
    open: "Open",
    outdated: "outdated",
    unresolve: "Unresolve",
    resolve: "Resolve",
    editComment: "Edit comment",
    loadMoreComments: "Load more comments",
    reply: "Reply",
    replyToThisConversation: "Reply to this conversation",
    reviewSubmitted: "Review submitted",
    approve: "Approve",
    pullRequestApproved: "Pull request approved",
    requestChanges: "Request changes",
    theReviewCouldNotBeSubmitted: "The review could not be submitted",
    summarizeYourReviewRequiredToRequestChanges:
      "Summarize your review (required to request changes)",
    summarizeYourReviewOptional: "Summarize your review (optional)",
    reviewSummary: "Review summary",
    reviewVerdict: "Review verdict",
    submitting: "Submitting...",
    submitReview: "Submit review",
    theHostRefusedItCheckThatYouHaveWriteAccessOnThisRepositoryAndThatTheyStillHaveAccess:
      "The host refused it. Check that you have write access on this repository, and that they still have access to it.",
    requestAReview: "Request a review",
    askingSomeoneToReviewNeedsWriteAccessOnThisRepository:
      "Asking someone to review needs write access on this repository",
    searchPeopleWithAccess: "Search people with access",
    nobodyElseHasAccessToThisRepository: "Nobody else has access to this repository.",
    nobodyWithAccessMatchesThat: "Nobody with access matches that.",
    thePeopleWithAccessCouldNotBeRead: "The people with access could not be read.",
    thisRepositoryHasMorePeopleWithAccessThanAreListedHereAskForTheRestOnTheHost:
      "This repository has more people with access than are listed here. Ask for the rest on the host.",
    team: "team",
    alreadyAsked: "Already asked",
    matchedInTheDescription: "matched in the description",
    matchedInTheDescription2: "Matched in the description",
    noMergeMethodIsAvailableForThisRepository: "No merge method is available for this repository.",
    openThisPullRequestToMergeItsStack: "Open this pull request to merge its stack",
    closeImmediatelyOrDragAcrossRowsToCloseSeveral:
      "Close immediately, or drag across rows to close several",
    merge: "Merge",
    reopen: "Reopen",
    mayBeStale: "May be stale",
    refreshing: "Refreshing…",
    stackOperationDidNotComplete: "Stack operation did not complete",
    stackMergeRequestCompleted: "Stack merge request completed",
    stackRebased: "Stack rebased",
    retryStackRefresh: "Retry stack refresh",
    rebaseStack: "Rebase stack",
    everyLayerBeingMergedMustBeOpenAndReadyForReview:
      "Every layer being merged must be open and ready for review.",
    mergeStack: "Merge stack",
    working: "Working…",
    loadingStack: "Loading stack…",
    thisPullRequestIsNoLongerInAStack: "This pull request is no longer in a stack.",
    openCommentOnHost: " · Open comment on host",
    outdated2: "Outdated",
    latest: "· Latest",
    fix: "Fix",
    couldNotSaveTheDescription: "Could not save the description",
    couldNotSaveTheComment: "Could not save the comment",
    pullRequestDescription: "Pull request description",
    describeThisPullRequest: "Describe this pull request",
    noDescriptionProvided: "_No description provided._",
    editDescription: "Edit description",
    checkDetailsAreOutOfDate: "Check details are out of date.",
    noChecksReported2: "No checks reported.",
    showOldestCommentsFirst: "Show oldest comments first",
    showNewestCommentsFirst: "Show newest comments first",
    noCommentsYet: "No comments yet.",
    reviewDismissed: "Review dismissed",
    couldNotUnlinkThePullRequest: "Could not unlink the pull request",
    couldNotLinkThePullRequest2: "Could not link the pull request",
    linkedThreads: "Linked threads",
    searchInTheCommandPalette: ". Search in the command palette.",
    unlinkFromThisThread: "Unlink from this thread",
    linkToThisThread: "Link to this thread",
    linkToThread: "Link to thread",
    linkPullRequestToAThread: "Link pull request to a thread",
    chooseAThread: "Choose a thread",
    searchThreadsOrProjects: "Search threads or projects...",
    noActiveThreadsFound: "No active threads found.",
    untitledThread: "Untitled thread",
    linked: "Linked",
    openActivityOnHost: "Open activity on host",
    untitledCommit: "Untitled commit",
    pullRequestOpened: "Pull request opened",
    beforeTheLatestCommits: ", before the latest commits",
    noActivityYet: "No activity yet.",
    couldNotLoadPullRequests: "Could not load pull requests",
    openOnGitHub: "Open on GitHub",
    linkedByYou: "Linked by you",
    createdFromThisThread: "Created from this thread",
    linkedByTheAgent: "Linked by the agent",
    foundInTheStack: "Found in the stack",
    dismissed: "Dismissed",
    waitingForHostState: "Waiting for host state",
    watching: "Watching",
    watchingTheAgentWakesWhenChecksFinishSomeoneCommentsOrTheBranchConflicts:
      "Watching: the agent wakes when checks finish, someone comments, or the branch conflicts",
    stopWatching: "Stop watching",
    watchForChanges: "Watch for changes",
    dismissFromThread: "Dismiss from thread",
    unlinkFromThread: "Unlink from thread",
    linkedPullRequestsUnavailable: "Linked pull requests unavailable",
    thisEnvironmentDoesNotSupportMultipleLinkedPullRequests:
      "This environment does not support multiple linked pull requests.",
    noLinkedPullRequests: "No linked pull requests",
    pullRequestsTheAgentOpensFromThisThreadLandHereLinkOneYourselfFromAURLOrANumber:
      "Pull requests the agent opens from this thread land here. Link one yourself from a URL or a number.",
    squashAndMerge: "Squash and merge",
    rebaseAndMerge: "Rebase and merge",
    fixInThisThread: "Fix in this thread",
    fixFindingsInThisThread: "Fix findings in this thread",
    fixFindingsInAThread: "Fix findings in a thread",
    allChecksPassed: "All checks passed",
    openedThisPullRequest: "opened this pull request",
    closed: "Closed",
    merged: "Merged",
    openOnGitLab: "Open on GitLab",
    openOnForgejo: "Open on Forgejo",
    openOnBitbucket: "Open on Bitbucket",
    openOnAzureDevOps: "Open on Azure DevOps",
    openOnHost: "Open on host",
    couldNotCopyTheLink: "Could not copy the link",
    couldNotOpenTheLink: "Could not open the link",
    reviewRequested: "Review requested",
    authored: "Authored",
    others: "Others",
    awaitingReview: "Awaiting review",
    hasConflicts: "Has conflicts",
    running: "Running",
    awaitingAction: "Awaiting action",
    passed: "Passed",
    failed2: "Failed",
    cancelled: "Cancelled",
    skipped: "Skipped",
    neutral: "Neutral",
    awaitingApproval: "Awaiting approval",
    allChecksHavePassed: "All checks have passed",
    someChecksWereNotSuccessful: "Some checks were not successful",
    someChecksHavenTCompletedYet: "Some checks haven't completed yet",
    openProfile: " · Open profile",
    stackDataMayBeStaleWeCouldnTRefreshIt: "Stack data may be stale. We couldn’t refresh it.",
    refreshingStackShowingSavedData: "Refreshing stack… Showing saved data.",
    mergeRequested: "Merge requested",
    autoMergeEnabled: "Auto-merge enabled",
    autoMergeDisabled: "Auto-merge disabled",
    couldNotEnableAutoMerge: "Could not enable auto-merge",
    couldNotDisableAutoMerge: "Could not disable auto-merge",
    theHostRefusedItCheckThatYouHaveWriteAccessAndThatTheBaseBranchHasNotDivergedInAWayTh:
      "The host refused it. Check that you have write access, and that the base branch has not diverged in a way the host cannot merge.",
    theHostRefusedItCheckThatAutoMergeIsEnabledForThisRepositoryAndThatYouHaveWriteAccess:
      "The host refused it. Check that auto-merge is enabled for this repository and that you have write access.",
    couldNotUpdateViewedFiles: "Could not update viewed files",
    thePullRequestIsNotAvailableInThisEnvironment:
      "The pull request is not available in this environment.",
    thisEnvironmentDoesNotSupportLinkingThisPullRequest:
      "This environment does not support linking this pull request.",
    linkUpdateInterrupted: "Link update interrupted.",
    unableToOpenPullRequestLink: "Unable to open pull request link",
    reviewing: "Reviewing",
    mergeReadiness: "Merge readiness",
    blockedOnMe: "Blocked on me",
    recentlyUpdated: "Recently updated",
    newestShown: "Newest shown",
    oldestShown: "Oldest shown",
    largestShown: "Largest shown",
    smallestShown: "Smallest shown",
    selectAPullRequestFirst: "Select a pull request first",
    pullRequestsUnavailable: "Pull requests unavailable",
    updateYourT3CodeServersToBrowsePullRequests:
      "Update your T3 Code servers to browse pull requests.",
    showingTheLastPullRequestsLoaded: " Showing the last pull requests loaded.",
    updatingPullRequests: "Updating pull requests",
    loadingMore: "Loading more",
    narrowYourSearchToFindMorePullRequests: "Narrow your search to find more pull requests.",
    thisHostCouldNotBeRead: "This host could not be read.",
    allServers: "All servers",
    sortPullRequests: "Sort pull requests",
    sort: "Sort",
    pullRequestLink: "pull request link",
    pRLinkCopied: "PR link copied",
    failedToCopyPRLink: "Failed to copy PR link",
    pullRequestScope: "Pull request scope",
    pullRequests: "Pull Requests",
    filterByState: "Filter by state",
    filterByInvolvement: "Filter by involvement",
    filterByHost: "Filter by host",
    pullRequestsBreadcrumb: "Pull requests breadcrumb",
    filterByProvider: "Filter by provider",
    refreshPullRequests: "Refresh pull requests",
  },
  actions: {
    ownerRepositoryPlaceholder: "owner/repo",
    groupProjectPlaceholder: "group/project",
    workspaceRepositoryPlaceholder: "workspace/repository",
    projectRepositoryPlaceholder: "project/repository",
    detachedHead: "(detached HEAD)",
    /** Reports selected files and total files. */
    selectedFileCounts: (selected: number, total: number) => `(${selected} of ${total})`,
    /** Formats elapsedSeconds using seconds. */
    elapsedSeconds: (seconds: number) => `${seconds}s`,
    /** Formats elapsedMinutes using minutes, seconds. */
    elapsedMinutes: (minutes: number, seconds: number) => `${minutes}m ${seconds}s`,
    /** Formats pushTo using target. */
    pushTo: (target: string) => `Pushing to ${target}...`,
    /** Formats prepareRequest using shortLabel. */
    prepareRequest: (shortLabel: string) => `Preparing ${shortLabel}...`,
    /** Formats generateRequest using shortLabel. */
    generateRequest: (shortLabel: string) => `Generating ${shortLabel} content...`,
    /** Formats creatingRequest using singular. */
    creatingRequest: (singular: string) => `Creating ${singular}...`,
    /** Formats createRequest using shortLabel. */
    createRequest: (shortLabel: string) => `Create ${shortLabel}`,
    /** Formats checkoutBeforeRequest using singular. */
    checkoutBeforeRequest: (singular: string) =>
      `Create and checkout a ref before pushing or opening a ${singular}.`,
    /** Formats commitPushRequest using shortLabel. */
    commitPushRequest: (shortLabel: string) => `Commit, push & ${shortLabel}`,
    /** Formats pushCreateRequest using shortLabel. */
    pushCreateRequest: (shortLabel: string) => `Push & create ${shortLabel}`,
    /** Formats defaultBranchSuffix using branch. */
    defaultBranchSuffix: (branch: string) =>
      ` on "${branch}". You can continue on this ref or create a feature ref and run the same action there.`,
    /** Formats commitPushDescription using suffix. */
    commitPushDescription: (suffix: string) => `This action will commit and push changes${suffix}`,
    /** Formats commitPushBranch using branch. */
    commitPushBranch: (branch: string) => `Commit & push to ${branch}`,
    /** Formats pushDescription using suffix. */
    pushDescription: (suffix: string) => `This action will push local commits${suffix}`,
    /** Formats pushBranch using branch. */
    pushBranch: (branch: string) => `Push to ${branch}`,
    /** Formats commitPushRequestDefault using shortLabel. */
    commitPushRequestDefault: (shortLabel: string) =>
      `Commit, push & create ${shortLabel} from default ref?`,
    /** Formats commitPushRequestDescription using singular, suffix. */
    commitPushRequestDescription: (singular: string, suffix: string) =>
      `This action will commit, push, and create a ${singular}${suffix}`,
    /** Formats commitPushCreateRequest using shortLabel. */
    commitPushCreateRequest: (shortLabel: string) => `Commit, push & create ${shortLabel}`,
    /** Formats pushRequestDefault using shortLabel. */
    pushRequestDefault: (shortLabel: string) => `Push & create ${shortLabel} from default ref?`,
    /** Formats pushRequestDescription using singular, suffix. */
    pushRequestDescription: (singular: string, suffix: string) =>
      `This action will push local commits and create a ${singular}${suffix}`,
    /** Formats providerUnauthenticated using provider. */
    providerUnauthenticated: (provider: string) =>
      `${provider} is not authenticated. Open Settings -> Source Control for setup guidance.`,
    /** Formats detachedBeforeRequest using singular. */
    detachedBeforeRequest: (singular: string) =>
      `Detached HEAD: check out a branch before creating a ${singular}.`,
    /** Formats commitBeforeRequest using singular. */
    commitBeforeRequest: (singular: string) =>
      `Commit local changes before creating a ${singular}.`,
    /** Formats originBeforeRequest using singular. */
    originBeforeRequest: (singular: string) =>
      `Add an "origin" remote before creating a ${singular}.`,
    /** Formats noCommitsForRequest using singular. */
    noCommitsForRequest: (singular: string) => `No local commits to include in a ${singular}.`,
    /** Formats behindBeforeRequest using singular. */
    behindBeforeRequest: (singular: string) =>
      `Branch is behind upstream. Pull/rebase before creating a ${singular}.`,
    /** Formats requestUnavailable using singular. */
    requestUnavailable: (singular: string) => `Create ${singular} is currently unavailable.`,
    /** Formats publishedBranch using branch, provider. */
    publishedBranch: (branch: string, provider: string) => `${branch} is now live on ${provider}.`,
    /** Formats remoteReady using remote. */
    remoteReady: (remote: string) =>
      `Remote "${remote}" is set up. Make a commit and push it to share your code.`,
    /** Formats updatedBranch using branch, upstream. */
    updatedBranch: (branch: string, upstream: string) => `Updated ${branch} from ${upstream}`,
    /** Formats branchSynchronized using branch. */
    branchSynchronized: (branch: string) => `${branch} is already synchronized.`,
    /** Formats openFile using path. */
    openFile: (path: string) => `Open ${path} in editor`,
    runningSourceControlAction: "Running source control action",
    pullingLatestChanges: "Pulling latest changes...",
    startingSourceControlAction: "Starting source control action...",
    preparingFeatureRef: "Preparing feature ref...",
    pushing: "Pushing...",
    committing: "Committing...",
    generatingCommitMessage: "Generating commit message...",
    commit: "Commit",
    push: "Push",
    gitActionInProgress: "Git action in progress.",
    gitStatusIsUnavailable: "Git status is unavailable.",
    commitPush: "Commit & push",
    publishRepository: "Publish repository",
    branchIsUpToDateNoActionNeeded: "Branch is up to date. No action needed.",
    noLocalCommitsToPush: "No local commits to push.",
    syncRef: "Sync ref",
    branchHasDivergedFromUpstreamRebaseMergeFirst:
      "Branch has diverged from upstream. Rebase/merge first.",
    pull: "Pull",
    commitPushToDefaultRef: "Commit & push to default ref?",
    pushToDefaultRef: "Push to default ref?",
    yourSignedInServer: "Your signed-in server",
    yourServer: "your server",
    providerStatusUnavailableOpenSettingsSourceControlAndRescan:
      "Provider status unavailable. Open Settings -> Source Control and rescan.",
    worktreeIsCleanMakeChangesBeforeCommitting:
      "Worktree is clean. Make changes before committing.",
    commitIsCurrentlyUnavailable: "Commit is currently unavailable.",
    detachedHEADCheckOutABranchBeforePushing: "Detached HEAD: check out a branch before pushing.",
    commitOrStashLocalChangesBeforePushing: "Commit or stash local changes before pushing.",
    branchIsBehindUpstreamPullRebaseBeforePushing:
      "Branch is behind upstream. Pull/rebase before pushing.",
    addAnOriginRemoteBeforePushing: 'Add an "origin" remote before pushing.',
    pushIsCurrentlyUnavailable: "Push is currently unavailable.",
    commitChanges: "Commit changes",
    reviewAndConfirmYourCommitLeaveTheMessageBlankToAutoGenerateOne:
      "Review and confirm your commit. Leave the message blank to auto-generate one.",
    provider: "Provider",
    repository: "Repository",
    summary: "Summary",
    anErrorOccurred: "An error occurred.",
    pickWhereToHostItThenPointUsAtARepoToPushTo:
      "Pick where to host it, then point us at a repo to push to.",
    setupRequired: "Setup Required",
    openSettingsSourceControlToConfigureThisProvider:
      "Open Settings -> Source Control to configure this provider.",
    visibility: "Visibility",
    private: "Private",
    onlyInvitedPeople: "Only invited people",
    public: "Public",
    anyoneOnTheWeb: "Anyone on the web",
    advanced: "Advanced",
    protocol: "Protocol",
    publishingRepositoryTo: "Publishing repository to ",
    publishFailed: "Publish failed",
    repositoryPublished: "Repository published",
    repositoryCreated: "Repository created",
    openOn: "Open on ",
    publishResultUnavailable: "Publish result unavailable.",
    done: "Done",
    back: "Back",
    next: "Next",
    publishing: "Publishing...",
    publish: "Publish",
    thisConnectionCannotChangeSourceControl: "This connection cannot change source control.",
    thisActionIsCurrentlyUnavailable: "This action is currently unavailable.",
    actionFailed: "Action failed",
    pullFailed: "Pull failed",
    pulled: "Pulled",
    alreadyUpToDate: "Already up to date",
    editorOpeningIsUnavailable: "Editor opening is unavailable.",
    unableToOpenFile: "Unable to open file",
    gitInitializationFailed: "Git initialization failed",
    publishRepository2: "Publish repository...",
    detachedHEADCreateAndCheckOutABranchToEnablePushAndPullRequestActions:
      "Detached HEAD: create and check out a branch to enable push and pull request actions.",
    behindUpstreamPullRebaseFirst: "Behind upstream. Pull/rebase first.",
    initializing: "Initializing...",
    initializeGit: "Initialize Git",
    gitActions: "Git actions",
    gitActionOptions: "Git action options",
    defaultBranch: "Default branch",
    files: "Files",
    edit: "Edit",
    none: "none",
    excluded: "Excluded",
    commitMessageOptional: "Commit message (optional)",
    leaveEmptyToAutoGenerate: "Leave empty to auto-generate",
    commitOnNewBranch: "Commit on new branch",
    runActionOnDefaultBranch: "Run action on default branch?",
    abort: "Abort",
    continue: "Continue",
    checkOutFeatureBranchContinue: "Check out feature branch & continue",
    initializingRepository: "Initializing repository",
    publishingRepository: "Publishing repository",
    thisConnectionCannotChangeThreads: "This connection cannot change threads.",
    preparingPullRequestThread: "Preparing pull request thread",
  },
  diff: {
    diffOptions: "Diff options",
    wrapLines: "Wrap lines",
    stacked: "Stacked",
    split: "Split",

    /** Formats expandFile using path. */
    expandFile: (path: string) => `Expand ${path}`,
    /** Formats collapseFile using path. */
    collapseFile: (path: string) => `Collapse ${path}`,
    /** Formats turnTitle using turn. */
    turnTitle: (turn: string | number) => `Turn ${turn}`,
    /** Formats scopeLabel using scope. */
    scopeLabel: (scope: string) => `Diff scope: ${scope}`,
    /** Formats compareRefs using head, base. */
    compareRefs: (head: string, base: string) => `Comparing ${head} against ${base}`,
    /** Formats changeTarget using base. */
    changeTarget: (base: string) => `Change comparison target. Currently ${base}`,
    /** Formats remoteVersion using branch. */
    remoteVersion: (branch: string) => `Use remote version of ${branch}`,
    /** Formats sectionFiles using section. */
    sectionFiles: (section: string) => `${section} files`,
    /** Formats commentLines using range. */
    commentLines: (range: string) => `Comment on lines ${range}`,
    copyFilePath: "Copy file path",
    copied: "Copied",
    copyPath: "Copy path",
    expandDiff: "Expand diff",
    collapseDiff: "Collapse diff",
    uncommitted: "Uncommitted",
    changes: "Changes",
    latestTurn: "Latest turn",
    diffFileContentsAreUnavailableForThisSelection:
      "Diff file contents are unavailable for this selection.",
    turn: "Turn",
    turn2: "Turn ",
    remote: "Remote",
    noMatchingRefs: "No matching refs.",
    automatic: "Automatic",
    remoteOnly: "Remote only",
    refreshingDiff: "Refreshing diff",
    refreshDiff: "Refresh diff",
    refreshingDiff2: "Refreshing diff…",
    expandAllFiles: "Expand all files",
    collapseAllFiles: "Collapse all files",
    diffLayout: "Diff layout",
    stackedDiffView: "Stacked diff view",
    splitDiffView: "Split diff view",
    disableDiffLineWrapping: "Disable diff line wrapping",
    enableDiffLineWrapping: "Enable diff line wrapping",
    disableLineWrapping: "Disable line wrapping",
    enableLineWrapping: "Enable line wrapping",
    showWhitespaceChanges: "Show whitespace changes",
    hideWhitespaceChanges: "Hide whitespace changes",
    hideFileTree: "Hide file tree",
    showFileTree: "Show file tree",
    selectAThreadToInspectTurnDiffs: "Select a thread to inspect turn diffs.",
    turnDiffsAreUnavailableBecauseThisProjectIsNotAGitRepository:
      "Turn diffs are unavailable because this project is not a git repository.",
    noCompletedTurnsYet: "No completed turns yet.",
    checkingFileAccess: "Checking file access...",
    thisConnectionCannotReadLocalDiffs: "This connection cannot read local diffs.",
    thisPreviewExceedsTheSizeLimitChangesShownAreIncomplete:
      "This preview exceeds the size limit. Changes shown are incomplete.",
    totalsIncludeAllChanges: " Totals include all changes.",
    loadingCheckpointDiff: "Loading checkpoint diff...",
    loadingUncommittedChanges: "Loading uncommitted changes...",
    loadingChanges: "Loading changes...",
    noNetChangesInThisSelection: "No net changes in this selection.",
    noPatchAvailableForThisSelection: "No patch available for this selection.",
    loadingCode: "Loading code...",
    addAComment: "Add a comment…",
    comment: "Comment",
    deleteComment: "Delete comment",
    ctrlEnterToSend: "⌘/Ctrl Enter to send",
    loadingDiff: "Loading diff…",
    retryLoadingDiff: "Retry loading diff",
    partialDiffPreview: "Partial diff preview",
    thisFileIsTooLargeToShowInFullCountsIncludeAllChanges:
      "This file is too large to show in full. Counts include all changes.",
    collapseAllFolders: "Collapse all folders",
    expandAllFolders: "Expand all folders",
    unsupportedDiffFormatShowingRawPatch: "Unsupported diff format. Showing raw patch.",
    failedToParsePatchShowingRawPatch: "Failed to parse patch. Showing raw patch.",
  },
  branch: {
    currentBadge: "current",
    worktreeBadge: "worktree",
    remoteBadge: "remote",
    defaultBadge: "default",
    /** Formats showingRefs using shown, total. */
    showingRefs: (shown: number, total: number | undefined) => `Showing ${shown} of ${total} refs`,
    searchRefs: "Search refs...",
    noRefsFound: "No refs found.",
    startFromOrigin: "Start from origin",
    startWorktreeFromOrigin: "Start worktree from origin",
    createsTheWorktreeFromTheLatestMatchingBranchOnOriginInsteadOfYourLocalBranch:
      "Creates the worktree from the latest matching branch on origin instead of your local branch.",
    previousWorktree: "Previous worktree",
    loadingRefs: "Loading refs...",
    loadingMoreRefs: "Loading more refs...",
  },
};
