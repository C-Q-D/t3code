/** Chinese UI labels for PRs, Git operations, diffs, and branches; excludes persisted values and protocol strings. */
import type { Messages } from "../en";

export const git: Messages["git"] = {
  pullRequest: {
    showPrefix: "显示",
    showOnlyPrefix: "仅显示",
    olderBotCommentStem: "条更早的机器人评论",
    recentBotCommentStem: "条最近的机器人评论",
    hiddenSuffix: "条已隐藏）",
    viewedLowercase: "已查看",
    /** Returns the plural suffix for the hidden comment count. */
    commentPluralSuffix: (_count) => "",
    /** Names files using the supplied file count. */
    fileWord: (_count) => "个文件",
    /** Names comments using the supplied comment count. */
    commentWord: (_count) => "条评论",
    /** Names approvals using the supplied approval count. */
    approvalWord: (_count) => "次批准",
    /** Names authors using the supplied author count. */
    authorWord: (_count) => "位作者",
    /** Formats the supplied file count with application number formatting. */
    fileCount: (count) => `${count.toLocaleString()}个文件`,
    /** Formats the supplied comment count with application number formatting. */
    commentCount: (count) => `${count.toLocaleString()}条评论`,
    /** Formats the supplied commit count with application number formatting. */
    commitCount: (count) => `${count.toLocaleString()}个提交`,
    autoMerge: "自动合并",
    toBranch: "到",
    reactionViewer: "你",
    /** Formats the UI heading from the pull request number. */
    requestNumber: (number) => `拉取请求#${number}`,
    /** Names checkout using the provider's unchanged singular term. */
    checkoutRequest: (singular) => `检出${singular}`,
    /** Explains checkout using the provider name and unchanged request term. */
    checkoutDescription: (provider, singular) =>
      `解析 ${provider} ${singular}，然后在主仓库或独立worktree中创建草稿对话。`,
    /** Reports the number of commits not yet shown. */
    moreCommits: (count) => `显示更多（剩余${count}个）`,
    /** Names the already shortened search query. */
    nothingMatches: (query) => `没有匹配“${query}”的结果`,
    /** Names a stack using its number. */
    stackNumber: (number) => `堆叠#${number}`,
    /** Names the stack number, current layer position, and total layer count. */
    viewStackLayer: (number, position, total) => `查看堆叠#${number}，第${position} / ${total}层`,
    /** Reports the number of layers included in the merge. */
    mergeStackLayerCount: (count) => `合并堆叠（${count}）`,
    /** Names the final layer number, destination branch, and included request count. */
    mergeStackThrough: (number, base, count) =>
      `将堆叠合并到#${number}层并合入 ${base}（${count}个拉取请求）`,
    /** Reports the comment count to reveal and the total currently hidden. */
    olderComments: (shown, hidden) => `显示${shown}条更早的评论（隐藏${hidden}条）`,
    /** Reports the recent comment window size. */
    recentComments: (count) => `仅显示${count}条最近评论`,
    /** Reports the number of recent comments available in a truncated conversation. */
    truncatedComments: (count) =>
      `此讨论超过页面单次读取的范围。这里显示最近${count}条，请在托管平台查看其余内容。`,
    /** Reports open and linked pull request counts. */
    linkedRequestCounts: (open, linked) => `${open}个开放 · ${linked}个已关联`,
    /** Counts unnamed actors after named reaction actors. */
    reactionOthers: (count) => `其他${count}人`,
    /** Counts reaction actors when no actors are named. */
    reactionPeople: (count) => `${count}人`,
    reactionNames: {
      thumbsUp: "赞",
      thumbsDown: "踩",
      laugh: "笑",
      hooray: "欢呼",
      confused: "困惑",
      heart: "爱心",
      rocket: "火箭",
      eyes: "关注",
    },
    /** Formats prepareThreadError using singular. */
    prepareThreadError: (singular) => `准备${singular}对话失败。`,
    /** Formats pasteCheckout using singular. */
    pasteCheckout: (singular) => `粘贴${singular}URL、检出命令，或输入123 / #123。`,
    /** Formats checkoutInputHint using singular. */
    checkoutInputHint: (singular) => `使用${singular}URL、检出命令、123或#123。`,
    /** Formats checkoutPlaceholder using shortLabel. */
    checkoutPlaceholder: (shortLabel) => `${shortLabel}URL、检出命令或#42`,
    /** Formats noReadableProject using host, repository. */
    noReadableProject: (host, repository) => `此环境没有可读取${host}/${repository}的项目。`,
    /** Formats openChecks using summary. */
    openChecks: (summary) => `打开检查：${summary}`,
    /** Formats checksLabel using label. */
    checksLabel: (label) => `检查：${label}`,
    /** Formats scopeLabel using scope. */
    scopeLabel: (scope) => `差异范围：${scope}`,
    /** Formats viewedInApp using app. */
    viewedInApp: (app) => `在${app}中已查看`,
    /** Formats conversationCount using count. */
    conversationCount: (count) => `${count}个讨论`,
    /** Formats requestFiles using number. */
    requestFiles: (number) => `拉取请求#${number}的文件`,
    /** Formats pendingReview using count. */
    pendingReview: (count) => `评审拉取请求，${count}条评论待发送`,
    /** Formats reviewCount using count. */
    reviewCount: (count) => `评审（${count}）`,
    /** Formats behindCommits using count. */
    behindCommits: (count) => `，落后${count}个提交`,
    /** Formats branchOutdated using base, behind. */
    branchOutdated: (base, behind) => `此分支落后于${base}${behind}。`,
    /** Formats copiedLabel using label. */
    copiedLabel: (label) => `已复制${label}`,
    /** Formats copyLabelError using label. */
    copyLabelError: (label) => `复制${label}失败`,
    /** Formats checkoutThreadHint using branch. */
    checkoutThreadHint: (branch) =>
      `检出已在\`${branch}\`上就绪。请通过分支选择器将对话指向该检出，再次提问。`,
    /** Formats autoMergeMethod using method. */
    autoMergeMethod: (method) => `自动合并（${method}）`,
    /** Formats openRepository using repository. */
    openRepository: (repository) => `打开${repository}仓库`,
    /** Formats openRequestOnHost using number. */
    openRequestOnHost: (number) => `在托管平台打开拉取请求#${number}`,
    /** Formats stackedOn using branch. */
    stackedOn: (branch) => `堆叠在${branch}上`,
    /** Formats changedFileCount using count. */
    changedFileCount: (count) => `${count}个文件已变更`,
    /** Formats checksSummary using summary. */
    checksSummary: (summary) => `检查：${summary}`,
    /** Formats requestNotFound using number. */
    requestNotFound: (number) => `未找到拉取请求#${number}`,
    /** Formats mergeConfirmation using number, method. */
    mergeConfirmation: (number, method) => `使用 ${method} 合并 #${number}。`,
    /** Formats autoMergeConfirmation using number, method. */
    autoMergeConfirmation: (number, method) =>
      `托管平台认为已就绪时，使用 ${method} 合并 #${number}；可能立即合并。`,
    /** Formats revertConfirmation using number. */
    revertConfirmation: (number) => `创建新的拉取请求，撤销#${number}合并的变更。`,
    /** Formats workflowsConfirmation using count, number. */
    workflowsConfirmation: (count, number) =>
      `允许运行 #${number} 中的 ${count} 个工作流。请先检查代码和工作流变更。`,
    /** Formats closeConfirmation using number. */
    closeConfirmation: (number) => `关闭#${number}，不合并。`,
    /** Formats removeLabelError using label. */
    removeLabelError: (label) => `无法移除标签${label}`,
    /** Formats addLabelError using label. */
    addLabelError: (label) => `无法添加标签${label}`,
    /** Formats searchingHosts using query. */
    searchingHosts: (query) => `正在搜索所有托管平台中的“${query}”`,
    /** Formats selectedLabels using count. */
    selectedLabels: (count) => `已选择${count}个`,
    /** Formats cancelReviewError using login. */
    cancelReviewError: (login) => `无法撤回向${login}发出的评审请求`,
    /** Formats requestReviewError using login. */
    requestReviewError: (login) => `无法请求${login}评审`,
    /** Formats reviewRequestCancelled using login. */
    reviewRequestCancelled: (login) => `已撤回向${login}发出的评审请求`,
    /** Formats reviewRequestedFrom using login. */
    reviewRequestedFrom: (login) => `已请求${login}评审`,
    /** Formats quickActions using number. */
    quickActions: (number) => `拉取请求#${number}的快捷操作`,
    /** Formats immediately using label. */
    immediately: (label) => `立即${label}`,
    /** Formats stackLayer using number, position, total. */
    stackLayer: (number, position, total) => `堆叠${number}，第${position} / ${total}层`,
    /** Formats mergeStackCount using count. */
    mergeStackCount: (count) => `要合并${count}个拉取请求吗？`,
    /** Formats rebaseStackCount using count. */
    rebaseStackCount: (count) => `要变基${count}个拉取请求吗？`,
    /** Formats mergeStackConfirmation using number, base, method. */
    mergeStackConfirmation: (number, base, method) =>
      `使用 ${method} 将 #${number} 及下方未合并的层合并到 ${base}。GitHub会检查规则后合并或加入队列，并在合并后对剩余堆叠变基。`,
    /** Formats rebaseStackConfirmation using base. */
    rebaseStackConfirmation: (base) =>
      `从底层到顶层将远程分支变基到${base}。此操作会重写分支历史，并可能重启检查。某层失败时，先前的更新会保留。`,
    /** Formats commentsCount using count. */
    commentsCount: (count) => `评论（${count}）`,
    /** Formats botCommentsCount using count. */
    botCommentsCount: (count) => `${count}条机器人评论`,
    /** Formats finishedCommentsCount using count. */
    finishedCommentsCount: (count) => `${count}条已解决或已撤销的评论`,
    /** Formats linkedThreadsCount using count. */
    linkedThreadsCount: (count) => `来自${count}个对话的关联`,
    /** Formats viewCommit using commit. */
    viewCommit: (commit) => `查看提交${commit}`,
    /** Formats githubStack using count. */
    githubStack: (count) => `GitHub堆叠包含${count}层：合并一层会同时合入下方层。`,
    /** Formats chainedRequests using count. */
    chainedRequests: (count) => `${count}个拉取请求按基准分支串联。`,
    /** Formats requestActions using number. */
    requestActions: (number) => `为#${number}执行操作`,
    /** Formats syncedAt using time. */
    syncedAt: (time) => ` · 同步于${time}`,
    /** Formats checksRunning using count, total. */
    checksRunning: (count, total) => `${count} / ${total}项检查正在运行`,
    /** Formats checksAwaitingAction using count, total. */
    checksAwaitingAction: (count, total) => `${count} / ${total}项检查等待操作`,
    /** Formats checksFailed using count. */
    checksFailed: (count) => `${count}项失败`,
    /** Formats checksFailing using count, total. */
    checksFailing: (count, total) => `${count} / ${total}项检查失败`,
    /** Formats checksPassing using count, total. */
    checksPassing: (count, total) => `${count} / ${total}项检查通过`,
    /** Formats commitTitle using commit. */
    commitTitle: (commit) => `提交${commit}`,
    /** Formats conflictsWith using base. */
    conflictsWith: (base) => `与${base}冲突`,
    /** Formats earlierReview using label. */
    earlierReview: (label) => `${label}先前的变更`,
    /** Formats openProfile using login. */
    openActorProfile: (login) => `打开${login}的个人资料`,
    /** Formats workflowsAndChecksAwaiting using workflows, checks. */
    workflowsAndChecksAwaiting: (workflows, checks) =>
      `${workflows}个工作流和${checks}项检查等待操作`,
    /** Formats workflowsAwaiting using count. */
    workflowsAwaiting: (count) => `${count}个工作流等待批准`,
    /** Formats otherChecksAwaiting using count. */
    otherChecksAwaiting: (count) => `${count}项检查等待操作`,
    /** Formats joinTwoNames using first, second. */
    joinTwoNames: (first, second) => `${first}和${second}`,
    /** Formats joinMoreNames using first, last. */
    joinMoreNames: (first, last) => `${first}和${last}`,
    /** Formats reactionTooltip using actors, reaction. */
    reactionTooltip: (actors, reaction) => `${actors}用${reaction}表情回应`,
    /** Formats closedBatch using closed, total. */
    closedBatch: (closed, total) => `已关闭${closed} / ${total}个拉取请求`,
    /** Formats closedCount using count. */
    closedCount: (count) => `已关闭${count}个拉取请求`,
    resolving: "正在解析 ",
    preparingLocal: "正在准备本地检出…",
    local: "本地",
    preparingWorktree: "正在准备worktree…",
    worktree: "worktree",
    pasteAFullURLToLinkAPullRequestFromAnotherRepository: "粘贴完整URL以关联其他仓库的拉取请求。",
    pasteAFullURLThisProjectSHostHasNoKnownPullRequestURL:
      "请粘贴完整URL，此项目的托管平台没有已知的拉取请求URL。",
    couldNotLinkThePullRequest: "无法关联拉取请求。",
    pasteAPullRequestURLOrEnter123123: "粘贴拉取请求URL，或输入123 / #123。",
    applyAPullRequestURL123Or123: "使用拉取请求URL、123或#123。",
    linkPullRequest: "关联拉取请求",
    attachAPullRequestToThisThreadAFullURLCanPointAtAnyRepositoryOnAHostThisEnvironmentHa:
      "将拉取请求关联到此对话。完整URL可指向此环境中已有项目所在托管平台的任意仓库。",
    pullRequestURLOr42: "拉取请求URL或#42",
    linking: "正在关联…",
    link: "关联",
    couldNotLoadPullRequestActivity: "无法加载拉取请求动态",
    retry: "重试",
    loadingChecks: "正在加载检查…",
    noChecksReported: "未报告检查",
    unableToOpenCheckDetails: "无法打开检查详情",
    details: "详情",
    showLess: "收起",
    showAll: "显示全部",
    failed: " 失败",
    checkDetailsAreOutOfDateRefreshThePullRequestToUpdateThem:
      "检查详情已过时，请刷新拉取请求以更新。",
    fixInAThread: "在对话中修复",
    theRestOfThisDiffCouldNotBeLoaded: "无法加载此差异的剩余部分。",
    loadingMoreFiles: "正在加载更多文件…",
    changed: "已变更",
    viewed: "已查看",
    thisFileHasBeenPushedToSinceYouMarkedItViewed: "标记已查看后，此文件又有新的推送。",
    moreCommentsCouldNotBeLoaded: "无法加载更多评论",
    replyCouldNotBePosted: "无法发布回复",
    theCommentCouldNotBeSaved: "无法保存评论",
    theConversationCouldNotBeUpdated: "无法更新讨论",
    addToReview: "添加到评审",
    addToAgent: "添加到Agent",
    allCommits: "所有提交",
    theseTicksAreKeptHereNotOnTheHost: "这些标记保存在此环境中",
    thisHostKeepsNoSharedRecordOfWhichFilesYouHaveReadSoTheseTicksAreKeptByThisEnvironmen:
      "此托管平台不保存已读文件的共享记录，所以这些标记保存在此环境中。连接到此环境的应用会共享标记，托管平台的网页不会显示它们。",
    yourTicksCouldNotBeRead: "无法读取已查看标记",
    theBoxesBelowAreWhateverWasLastReadAndEmptyIfNothingHasBeenReadYet:
      "下方复选框显示上次读取的状态；尚未读取时为空。 ",
    thisCountCoversOnlyPartOfTheChange: "此数量仅涵盖部分变更",
    thisChangeHasMoreFilesThanTheHostWillReportTicksForInOneReadSoTheCountIsShortAndSomeB:
      "此变更的文件数超过托管平台单次返回已查看标记的上限，所以数量偏少，部分复选框初始为空。",
    someOfThisDiffWasNotShown: "部分差异未显示",
    theHostWithheldPartOfThisDiffABinaryFileOrAChangeTooLargeToInline:
      "托管平台未返回部分差异，可能是二进制文件或过大的变更。",
    lineCommentsAreWrittenFromTheWholeChange: "行评论基于整个变更",
    aCommentIsAnchoredToTheWholeChangeSoSwitchToAllCommitsToWriteOne:
      "评论定位于整个变更，请切换到“所有提交”后撰写。",
    loadingPullRequestDiff: "正在加载拉取请求差异…",
    thisPullRequestHasNoFileChanges: "此拉取请求没有文件变更。",
    thisCommitHasNoFileChanges: "此提交没有文件变更。",
    conversationsNotOnTheCurrentDiff: "未对应当前差异的讨论",
    conversationsNotOnTheDiffLoadedSoFar: "未对应已加载差异的讨论",
    oneConversation: "1个讨论",
    line: "行 ",
    loadMoreFiles: "加载更多文件",
    showFullComment: "显示完整评论",
    couldNotPostTheComment: "无法发布评论",
    leaveAComment: "留下评论",
    commentOnThisPullRequest: "评论此拉取请求",
    closing: "正在关闭…",
    reopening: "正在重新打开…",
    closeWithComment: "评论并关闭",
    reopenWithComment: "评论并重新打开",
    posting: "正在发布…",
    reviewPullRequest: "评审拉取请求",
    commentOnPullRequest: "评论拉取请求",
    pullRequestComposer: "拉取请求输入框",
    composerMode: "输入框模式",
    review: "评审",
    discardPendingLineComments: "丢弃待发送的行评论",
    closeComposer: "关闭输入框",
    pullRequestMerged: "拉取请求已合并",
    markedReadyForReview: "已标记为可评审",
    convertedToDraft: "已转为草稿",
    pullRequestClosed: "拉取请求已关闭",
    pullRequestReopened: "拉取请求已重新打开",
    branchUpdatedWithTheBaseBranch: "已用基准分支更新分支",
    autoMergeTurnedOnMergesAsSoonAsThisIsReadySoonerIfItAlreadyIs:
      "已开启自动合并，就绪后立即合并；已就绪时可能马上合并",
    autoMergeTurnedOff: "已关闭自动合并",
    revertPullRequestOpened: "已创建撤销变更的拉取请求",
    workflowsApproved: "工作流已批准",
    couldNotMergeThisPullRequest: "无法合并此拉取请求",
    couldNotMarkThisReadyForReview: "无法标记为可评审",
    couldNotConvertThisToADraft: "无法转为草稿",
    couldNotCloseThisPullRequest: "无法关闭此拉取请求",
    couldNotReopenThisPullRequest: "无法重新打开此拉取请求",
    couldNotUpdateThisBranch: "无法更新此分支",
    couldNotTurnOnAutoMerge: "无法开启自动合并",
    couldNotTurnOffAutoMerge: "无法关闭自动合并",
    couldNotOpenARevertPullRequest: "无法创建撤销变更的拉取请求",
    couldNotApproveWorkflows: "无法批准工作流",
    theHostRefusedTheMergeCheckThatYouHaveWriteAccessThatTheChecksItRequiresHavePassedAnd:
      "托管平台拒绝合并。请确认你有写入权限、所需检查已通过且分支没有冲突。",
    theHostRefusedItCheckThatYouHaveWriteAccessToThisRepository:
      "托管平台拒绝操作，请确认你对此仓库有写入权限。",
    theHostRefusedItCheckThatYouHaveWriteAccessOrThatYouOpenedIt:
      "托管平台拒绝操作，请确认你有写入权限或是发起者。",
    theHostRefusedItCheckThatYouHaveWriteAccessAndThatTheBranchStillExists:
      "托管平台拒绝操作，请确认你有写入权限且分支仍然存在。",
    theHostRefusedItCheckThatYouHaveWriteAccessToTheBranchOneFromAForkAlsoNeedsItsAuthorT:
      "托管平台拒绝操作。请确认你对分支有写入权限且分支与基准分支没有冲突；fork分支还需作者允许维护者编辑。",
    theHostRefusedItCheckThatThisRepositoryAllowsAutoMergeThatYouHaveWriteAccessAndThatTh:
      "托管平台拒绝操作，请确认仓库允许自动合并、你有写入权限且仍有待满足的合并条件。",
    theHostRefusedItCheckThatYouHaveWriteAccessAndThatTheMergeHasNotAlreadyHappened:
      "托管平台拒绝操作，请确认你有写入权限且尚未合并。",
    theHostRefusedItCheckThatYouHaveWriteAccessAndThatThisPullRequestWasMergedOnTheHost:
      "托管平台拒绝操作，请确认你有写入权限且此拉取请求已在托管平台合并。",
    theHostRefusedItCheckThatYouHaveActionsWriteAccessAndThatTheseWorkflowRunsAreStillAwa:
      "托管平台拒绝操作，请确认你有Actions写入权限且这些工作流仍在等待批准。",
    theHostRefusedItARebaseStopsAtTheFirstCommitThatDoesNotApplyCleanlyUpdatingWithAMerge:
      "托管平台拒绝操作。变基遇到首个无法直接应用的提交就会停止；使用合并提交更新可能仍然可行。",
    timeline: "时间线",
    code: "代码",
    changesCanBeCleanlyMerged: "变更可以无冲突合并。",
    updateWithRebase: "通过变基更新",
    updateBranch: "更新分支",
    pullRequestReference: "拉取请求引用",
    pRNumber: "PR编号",
    couldNotCopyCheckoutCommand: "无法复制检出命令",
    theTitleCouldNotBeSaved: "无法保存标题",
    theHostRefusedTheNewTitle: "托管平台拒绝新标题。",
    addedToTheComposer: "已添加到输入框",
    theQuestionIsInTheComposerReadItOverThenSend: "问题已放入输入框，请检查后发送。",
    thePullRequestIsInTheComposerTypeYourQuestionThenSend:
      "拉取请求已放入输入框，请输入问题后发送。",
    couldNotOpenAThread: "无法打开对话",
    tryAgainFromTheProjectOrOpenAThreadFirst: "从项目重试，或先打开对话。",
    askedInAThread: "已在对话中提问",
    theTaskIsInTheComposerReadItOverThenSend: "任务已放入输入框，请检查后发送。",
    preparingThePullRequestCheckout: "正在准备拉取请求检出…",
    couldNotOpenAThreadForTheCheckout: "无法为检出打开对话",
    couldNotPrepareThePullRequestCheckout: "无法准备拉取请求检出",
    checkedOutButTheThreadStayedWhereItWas: "已检出，但对话仍留在原位置",
    checkedOutButNotOnTheLatestCommits: "已检出，但未更新到最新提交",
    theCheckoutCouldNotBeMovedOntoThePullRequestSLatestCommitsSoTheCodeThereIsOlderThanTh:
      "无法将检出更新到拉取请求的最新提交，所以代码落后于拉取请求。未提交的工作或本地提交使其停留在当前版本。",
    checkedOutHere: "已在此处检出",
    checkedOut: "已检出",
    thisRepositoryIsOnThePullRequestSBranchWithAThreadOpenOnIt:
      "此仓库已切换到拉取请求分支，并打开了对应对话。",
    thePullRequestIsInItsOwnWorktreeWithAThreadOpenOnIt:
      "拉取请求位于独立worktree中，并打开了对应对话。",
    checkoutReady: "检出已就绪",
    checkingOut: "正在检出…",
    checkOut: "检出",
    checkOutThisPullRequest: "检出此拉取请求",
    inASeparateWorktree: "在独立worktree中",
    itsOwnFolderAndThreadNothingYouHaveOpenMoves: "使用独立文件夹和对话，当前打开的内容保持原位。",
    inThisRepository: "在此仓库中",
    switchesTheBranchYouAreWorkingInLikeGhPrCheckout: "切换当前工作分支，类似于`gh pr checkout`。",
    preparing: "正在准备…",
    resolveConflicts: "解决冲突",
    backToThisThreadSPullRequests: "返回此对话的拉取请求",
    backToPullRequests: "返回拉取请求",
    retryStackLookup: "重试查询堆叠",
    theHostWillMergeThisOnItsOwnOnceItsRequirementsAreMet: "：满足要求后，托管平台会自动合并",
    readyForReview: "可评审",
    enabling: "正在启用…",
    merging: "正在合并…",
    refreshingPullRequest: "正在刷新拉取请求",
    morePullRequestActions: "更多拉取请求操作",
    refresh: "刷新",
    opening: "正在打开…",
    askAQuestion: "提问",
    addsThePullRequestToThisThreadSComposer: "将拉取请求添加到此对话的输入框。",
    opensAThreadThatKnowsWhichPullRequestYouMean: "打开带有此拉取请求上下文的对话。",
    explainThisPR: "解释此PR",
    aWalkThroughTheDiffAndWhatToReadClosely: "解读差异，并指出需要仔细查看的内容。",
    convertToDraft: "转为草稿",
    mergeNow: "立即合并",
    disableAutoMerge: "关闭自动合并",
    enableAutoMerge: "开启自动合并",
    pRLink: "PR链接",
    copyLink: "复制链接",
    copyPRNumber: "复制PR编号",
    closePullRequest: "关闭拉取请求",
    reopenPullRequest: "重新打开拉取请求",
    revertChanges: "撤销变更",
    collapsePullRequestPanel: "收起拉取请求面板",
    stackedPullRequest: "堆叠拉取请求",
    receivesChangesFrom: "接收来自以下分支的变更",
    editTitle: "编辑标题",
    pullRequestTitle: "拉取请求标题",
    saving: "正在保存…",
    save: "保存",
    updated: "更新于 ",
    pullRequestCheckoutCommand: "拉取请求检出命令",
    copyCheckoutCommand: "复制检出命令",
    checkoutCommandCopied: "已复制检出命令",
    branchName: "分支名",
    copyPullRequestBranch: "复制拉取请求分支",
    branchNameCopied: "已复制分支名",
    pullRequestTabs: "拉取请求选项卡",
    approving: "正在批准…",
    approveWorkflowsToRun: "批准运行工作流",
    checks: "检查",
    commentsUnavailable: "评论不可用",
    commitsUnavailable: "提交不可用",
    showOldestActivityFirst: "先显示最早动态",
    showNewestActivityFirst: "先显示最新动态",
    newestFirst: "最新优先",
    oldestFirst: "最早优先",
    itMayBeAnIssueRatherThanAPullRequestOrThisAccountCanTSeeIt:
      "它可能是议题，或此账号无法查看该拉取请求。",
    mergePullRequest: "要合并拉取请求吗？",
    enableAutoMerge2: "要开启自动合并吗？",
    revertTheseChanges: "要撤销这些变更吗？",
    approveWorkflowsToRun2: "要批准运行工作流吗？",
    closePullRequest2: "要关闭拉取请求吗？",
    createRevertPR: "创建撤销PR",
    approveAndRun: "批准并运行",
    close: "关闭",
    loadingPullRequests: "正在加载拉取请求",
    loadingPullRequest: "正在加载拉取请求",
    pullRequestActionsLoading: "正在加载拉取请求操作",
    reviewers: "评审者",
    reviewersLoading: "正在加载评审者",
    labels: "标签",
    none: "无",
    labelsLoading: "正在加载标签",
    description: "描述",
    loadingPeople: "正在加载人员",
    loadingTimeline: "正在加载时间线",
    loadingPullRequestConversation: "正在加载拉取请求讨论",
    theHostRefusedItCheckThatYouHaveTriageAccessOnThisRepository:
      "托管平台拒绝操作，请确认你对此仓库有分类权限。",
    changeLabels: "更改标签",
    changingLabelsNeedsTriageAccessOnThisRepository: "更改标签需要此仓库的分类权限",
    searchLabels: "搜索标签",
    thisRepositoryHasNoLabels: "此仓库没有标签。",
    noLabelMatchesThat: "没有匹配的标签。",
    theLabelsCouldNotBeRead: "无法读取标签。",
    thisRepositoryHasMoreLabelsThanAreListedHereApplyTheRestOnTheHost:
      "此仓库还有未列出的标签，请在托管平台应用其他标签。",
    applied: "已应用",
    opened: "发起于 ",
    noProjectsInThisWorkspace: "此工作区没有项目",
    addAProjectAndThePullRequestsFromItsRepositoryAppearHere:
      "添加项目后，其仓库的拉取请求会显示在这里。",
    addProject: "添加项目",
    theHostsWereSearchedForItTryFewerWordsOrSearchByNumberAuthorOrBranch:
      "已搜索托管平台。请减少关键词，或按编号、作者或分支搜索。",
    clearSearch: "清除搜索",
    checking: "正在检查…",
    checkAgain: "再次检查",
    nothingUnderTheseFilters: "这些筛选条件下没有结果",
    noPullRequests: "没有拉取请求",
    widenTheStateInvolvementOrProjectFilterToSeeMore: "放宽状态、参与或项目筛选以查看更多。",
    pullRequestsFromEveryProjectInThisWorkspaceAppearHere:
      "此工作区所有项目的拉取请求会显示在这里。",
    loading: "正在加载…",
    loadMorePullRequests: "加载更多拉取请求",
    searchPullRequestsOrLabelBug: "搜索拉取请求，或输入label:bug",
    searchPullRequests: "搜索拉取请求",
    all: "全部",
    draftsOnly: "仅草稿",
    hideDrafts: "隐藏草稿",
    approved: "已批准",
    changesRequested: "已请求修改",
    reviewRequired: "需要评审",
    noReviews: "没有评审",
    passing: "通过",
    failing: "失败",
    unavailable: "· 不可用",
    author: "作者",
    anyone: "任何人",
    searchAuthors: "搜索作者",
    mergesLoaded: " 已加载合并记录",
    noAuthorsFound: "未找到作者",
    any: "任意",
    noLabelsInThisView: "此视图没有标签",
    allProjects: "所有项目",
    filters: "筛选",
    state: "状态",
    involvement: "参与",
    draft: "草稿",
    host: "托管平台",
    server: "服务器",
    project: "项目",
    pullRequestVideo: "拉取请求视频",
    openAttachmentOnGitHub: "在GitHub打开附件",
    markdownEditorMode: "Markdown编辑器模式",
    write: "编辑",
    preview: "预览",
    nothingToPreview: "没有可预览内容。",
    theReactionCouldNotBeSaved: "无法保存回应",
    addAReaction: "添加回应",
    pendingSentWhenYouSubmitTheReview: "待发送，在提交评审时发送",
    discardThisComment: "丢弃此评论",
    resolved: "已解决",
    open: "开放",
    outdated: "已过时",
    unresolve: "取消解决",
    resolve: "解决",
    editComment: "编辑评论",
    loadMoreComments: "加载更多评论",
    reply: "回复",
    replyToThisConversation: "回复此讨论",
    reviewSubmitted: "评审已提交",
    approve: "批准",
    pullRequestApproved: "拉取请求已批准",
    requestChanges: "请求修改",
    theReviewCouldNotBeSubmitted: "无法提交评审",
    summarizeYourReviewRequiredToRequestChanges: "总结评审（请求修改时必填）",
    summarizeYourReviewOptional: "总结评审（可选）",
    reviewSummary: "评审摘要",
    reviewVerdict: "评审结论",
    submitting: "正在提交…",
    submitReview: "提交评审",
    theHostRefusedItCheckThatYouHaveWriteAccessOnThisRepositoryAndThatTheyStillHaveAccess:
      "托管平台拒绝操作，请确认你对此仓库有写入权限且对方仍有访问权限。",
    requestAReview: "请求评审",
    askingSomeoneToReviewNeedsWriteAccessOnThisRepository: "请求他人评审需要此仓库的写入权限",
    searchPeopleWithAccess: "搜索有访问权限的人",
    nobodyElseHasAccessToThisRepository: "没有其他人有权访问此仓库。",
    nobodyWithAccessMatchesThat: "没有匹配的有权访问者。",
    thePeopleWithAccessCouldNotBeRead: "无法读取有访问权限的人员。",
    thisRepositoryHasMorePeopleWithAccessThanAreListedHereAskForTheRestOnTheHost:
      "此仓库还有未列出的有权访问者，请在托管平台请求其他人评审。",
    team: "团队",
    alreadyAsked: "已请求",
    matchedInTheDescription: "描述匹配",
    matchedInTheDescription2: "描述匹配",
    noMergeMethodIsAvailableForThisRepository: "此仓库没有可用合并方式。",
    openThisPullRequestToMergeItsStack: "打开此拉取请求以合并其堆叠",
    closeImmediatelyOrDragAcrossRowsToCloseSeveral: "立即关闭，或拖过多行以关闭多个",
    merge: "合并",
    reopen: "重新打开",
    mayBeStale: "可能已过时",
    refreshing: "正在刷新…",
    stackOperationDidNotComplete: "堆叠操作未完成",
    stackMergeRequestCompleted: "堆叠合并请求已完成",
    stackRebased: "堆叠已变基",
    gitHubMergedTheStackOrAddedItToItsMergeQueue: "GitHub已合并堆叠或将其加入合并队列。",
    retryStackRefresh: "重试刷新堆叠",
    rebaseStack: "变基堆叠",
    everyLayerBeingMergedMustBeOpenAndReadyForReview: "要合并的每层必须开放且可评审。",
    mergeStack: "合并堆叠",
    working: "正在处理…",
    loadingStack: "正在加载堆叠…",
    thisPullRequestIsNoLongerInAStack: "此拉取请求已不在堆叠中。",
    openCommentOnHost: " · 在托管平台打开评论",
    outdated2: "已过时",
    latest: "· 最新",
    fix: "修复",
    couldNotSaveTheDescription: "无法保存描述",
    couldNotSaveTheComment: "无法保存评论",
    pullRequestDescription: "拉取请求描述",
    describeThisPullRequest: "描述此拉取请求",
    noDescriptionProvided: "_未提供描述。_",
    editDescription: "编辑描述",
    checkDetailsAreOutOfDate: "检查详情已过时。",
    noChecksReported2: "未报告检查。",
    showOldestCommentsFirst: "先显示最早评论",
    showNewestCommentsFirst: "先显示最新评论",
    noCommentsYet: "尚无评论。",
    reviewDismissed: "评审已撤销",
    couldNotUnlinkThePullRequest: "无法取消关联拉取请求",
    couldNotLinkThePullRequest2: "无法关联拉取请求",
    linkedThreads: "已关联对话",
    searchInTheCommandPalette: "。请在命令面板中搜索。",
    unlinkFromThisThread: "取消与此对话的关联",
    linkToThisThread: "关联到此对话",
    linkToThread: "关联到对话",
    linkPullRequestToAThread: "将拉取请求关联到对话",
    chooseAThread: "选择对话",
    searchThreadsOrProjects: "搜索对话或项目…",
    noActiveThreadsFound: "未找到活动对话。",
    untitledThread: "未命名对话",
    linked: "已关联",
    openActivityOnHost: "在托管平台打开动态",
    untitledCommit: "未命名提交",
    pullRequestOpened: "拉取请求已发起",
    beforeTheLatestCommits: "，早于最新提交",
    noActivityYet: "尚无动态。",
    couldNotLoadPullRequests: "无法加载拉取请求",
    openOnGitHub: "在GitHub打开",
    linkedByYou: "由你关联",
    createdFromThisThread: "从此对话创建",
    linkedByTheAgent: "由Agent关联",
    foundInTheStack: "在堆叠中发现",
    dismissed: "已移除",
    waitingForHostState: "正在等待托管平台状态",
    watching: "正在关注",
    watchingTheAgentWakesWhenChecksFinishSomeoneCommentsOrTheBranchConflicts:
      "正在关注：检查完成、有人评论或分支冲突时，Agent会被唤醒",
    stopWatching: "停止关注",
    watchForChanges: "关注变更",
    dismissFromThread: "从对话中移除",
    unlinkFromThread: "取消与对话的关联",
    linkedPullRequestsUnavailable: "已关联拉取请求不可用",
    thisEnvironmentDoesNotSupportMultipleLinkedPullRequests: "此环境不支持关联多个拉取请求。",
    noLinkedPullRequests: "没有已关联拉取请求",
    pullRequestsTheAgentOpensFromThisThreadLandHereLinkOneYourselfFromAURLOrANumber:
      "Agent从此对话发起的拉取请求会显示在这里。也可通过URL或编号手动关联。",
    squashAndMerge: "压缩并合并",
    rebaseAndMerge: "变基并合并",
    fixInThisThread: "在此对话中修复",
    fixFindingsInThisThread: "在此对话中修复发现的问题",
    fixFindingsInAThread: "在对话中修复发现的问题",
    allChecksPassed: "所有检查已通过",
    openedThisPullRequest: "发起了此拉取请求",
    closed: "已关闭",
    merged: "已合并",
    openOnGitLab: "在GitLab打开",
    openOnForgejo: "在Forgejo打开",
    openOnBitbucket: "在Bitbucket打开",
    openOnAzureDevOps: "在Azure DevOps打开",
    openOnHost: "在托管平台打开",
    couldNotCopyTheLink: "无法复制链接",
    couldNotOpenTheLink: "无法打开链接",
    reviewRequested: "已请求评审",
    authored: "我发起的",
    others: "其他",
    awaitingReview: "等待评审",
    hasConflicts: "存在冲突",
    running: "正在运行",
    awaitingAction: "等待操作",
    passed: "已通过",
    failed2: "已失败",
    cancelled: "已取消",
    skipped: "已跳过",
    neutral: "中立",
    awaitingApproval: "等待批准",
    allChecksHavePassed: "所有检查已通过",
    someChecksWereNotSuccessful: "部分检查未成功",
    someChecksHavenTCompletedYet: "部分检查尚未完成",
    openProfile: " · 打开个人资料",
    stackDataMayBeStaleWeCouldnTRefreshIt: "堆叠数据可能已过时，无法刷新。",
    refreshingStackShowingSavedData: "正在刷新堆叠…显示已保存的数据。",
    mergeRequested: "已请求合并",
    autoMergeEnabled: "已开启自动合并",
    autoMergeDisabled: "已关闭自动合并",
    couldNotEnableAutoMerge: "无法开启自动合并",
    couldNotDisableAutoMerge: "无法关闭自动合并",
    theHostRefusedItCheckThatYouHaveWriteAccessAndThatTheBaseBranchHasNotDivergedInAWayTh:
      "托管平台拒绝操作，请确认你有写入权限且基准分支未产生无法合并的分叉。",
    theHostRefusedItCheckThatAutoMergeIsEnabledForThisRepositoryAndThatYouHaveWriteAccess:
      "托管平台拒绝操作，请确认仓库已启用自动合并且你有写入权限。",
    couldNotUpdateViewedFiles: "无法更新已查看文件",
    thePullRequestIsNotAvailableInThisEnvironment: "此环境无法提供该拉取请求。",
    thisEnvironmentDoesNotSupportLinkingThisPullRequest: "此环境不支持关联该拉取请求。",
    linkUpdateInterrupted: "关联更新已中断。",
    unableToOpenPullRequestLink: "无法打开拉取请求链接",
    reviewing: "我评审的",
    mergeReadiness: "合并就绪程度",
    blockedOnMe: "等待我处理",
    recentlyUpdated: "最近更新",
    newestShown: "显示最新",
    oldestShown: "显示最早",
    largestShown: "显示最大",
    smallestShown: "显示最小",
    selectAPullRequestFirst: "请先选择拉取请求",
    pullRequestsUnavailable: "拉取请求不可用",
    updateYourT3CodeServersToBrowsePullRequests: "请更新T3 Code服务器以浏览拉取请求。",
    showingTheLastPullRequestsLoaded: " 显示上次加载的拉取请求。",
    updatingPullRequests: "正在更新拉取请求",
    loadingMore: "正在加载更多",
    narrowYourSearchToFindMorePullRequests: "缩小搜索范围以查找更多拉取请求。",
    thisHostCouldNotBeRead: "无法读取此托管平台。",
    allServers: "所有服务器",
    sortPullRequests: "排序拉取请求",
    sort: "排序",
    pullRequestLink: "拉取请求链接",
    pRLinkCopied: "已复制PR链接",
    failedToCopyPRLink: "复制PR链接失败",
    pullRequestScope: "拉取请求范围",
    pullRequests: "拉取请求",
    filterByState: "按状态筛选",
    filterByInvolvement: "按参与筛选",
    filterByHost: "按托管平台筛选",
    pullRequestsBreadcrumb: "拉取请求导航路径",
    filterByProvider: "按Provider筛选",
    refreshPullRequests: "刷新拉取请求",
  },
  actions: {
    ownerRepositoryPlaceholder: "所有者/仓库",
    groupProjectPlaceholder: "群组/项目",
    workspaceRepositoryPlaceholder: "工作区/仓库",
    projectRepositoryPlaceholder: "项目/仓库",
    detachedHead: "（HEAD已分离）",
    /** Reports selected files and total files. */
    selectedFileCounts: (selected, total) => `（${selected} / ${total}）`,
    /** Formats elapsedSeconds using seconds. */
    elapsedSeconds: (seconds) => `${seconds}秒`,
    /** Formats elapsedMinutes using minutes, seconds. */
    elapsedMinutes: (minutes, seconds) => `${minutes}分${seconds}秒`,
    /** Formats pushTo using target. */
    pushTo: (target) => `正在推送到${target}…`,
    /** Formats prepareRequest using shortLabel. */
    prepareRequest: (shortLabel) => `正在准备${shortLabel}…`,
    /** Formats generateRequest using shortLabel. */
    generateRequest: (shortLabel) => `正在生成${shortLabel}内容…`,
    /** Formats creatingRequest using singular. */
    creatingRequest: (singular) => `正在创建${singular}…`,
    /** Formats createRequest using shortLabel. */
    createRequest: (shortLabel) => `创建${shortLabel}`,
    /** Formats checkoutBeforeRequest using singular. */
    checkoutBeforeRequest: (singular) => `推送或创建${singular}前，请先创建并检出分支。`,
    /** Formats commitPushRequest using shortLabel. */
    commitPushRequest: (shortLabel) => `提交、推送并创建${shortLabel}`,
    /** Formats pushCreateRequest using shortLabel. */
    pushCreateRequest: (shortLabel) => `推送并创建${shortLabel}`,
    /** Formats defaultBranchSuffix using branch. */
    defaultBranchSuffix: (branch) =>
      `到“${branch}”。你可以继续使用此分支，或创建功能分支后执行相同操作。`,
    /** Formats commitPushDescription using suffix. */
    commitPushDescription: (suffix) => `此操作将提交并推送变更${suffix}`,
    /** Formats commitPushBranch using branch. */
    commitPushBranch: (branch) => `提交并推送到${branch}`,
    /** Formats pushDescription using suffix. */
    pushDescription: (suffix) => `此操作将推送本地提交${suffix}`,
    /** Formats pushBranch using branch. */
    pushBranch: (branch) => `推送到${branch}`,
    /** Formats commitPushRequestDefault using shortLabel. */
    commitPushRequestDefault: (shortLabel) => `要从默认分支提交、推送并创建${shortLabel}吗？`,
    /** Formats commitPushRequestDescription using singular, suffix. */
    commitPushRequestDescription: (singular, suffix) =>
      `此操作将提交、推送并创建${singular}${suffix}`,
    /** Formats commitPushCreateRequest using shortLabel. */
    commitPushCreateRequest: (shortLabel) => `提交、推送并创建${shortLabel}`,
    /** Formats pushRequestDefault using shortLabel. */
    pushRequestDefault: (shortLabel) => `要从默认分支推送并创建${shortLabel}吗？`,
    /** Formats pushRequestDescription using singular, suffix. */
    pushRequestDescription: (singular, suffix) => `此操作将推送本地提交并创建${singular}${suffix}`,
    /** Formats providerUnauthenticated using provider. */
    providerUnauthenticated: (provider) =>
      `${provider}尚未认证。请打开设置 → 源码管理以查看设置指引。`,
    /** Formats detachedBeforeRequest using singular. */
    detachedBeforeRequest: (singular) => `HEAD已分离，请先检出分支再创建${singular}。`,
    /** Formats commitBeforeRequest using singular. */
    commitBeforeRequest: (singular) => `请先提交本地变更再创建${singular}。`,
    /** Formats originBeforeRequest using singular. */
    originBeforeRequest: (singular) => `请先添加“origin”远程仓库再创建${singular}。`,
    /** Formats noCommitsForRequest using singular. */
    noCommitsForRequest: (singular) => `没有可包含在${singular}中的本地提交。`,
    /** Formats behindBeforeRequest using singular. */
    behindBeforeRequest: (singular) => `分支落后于上游，请先拉取或变基再创建${singular}。`,
    /** Formats requestUnavailable using singular. */
    requestUnavailable: (singular) => `当前无法创建${singular}。`,
    /** Formats publishedBranch using branch, provider. */
    publishedBranch: (branch, provider) => `${branch}已发布到${provider}。`,
    /** Formats remoteReady using remote. */
    remoteReady: (remote) => `远程仓库“${remote}”已设置。提交并推送以分享代码。`,
    /** Formats updatedBranch using branch, upstream. */
    updatedBranch: (branch, upstream) => `${branch} 已从 ${upstream} 更新`,
    /** Formats branchSynchronized using branch. */
    branchSynchronized: (branch) => `${branch}已同步。`,
    /** Formats openFile using path. */
    openFile: (path) => `在编辑器中打开${path}`,
    runningSourceControlAction: "正在执行源码管理操作",
    pullingLatestChanges: "正在拉取最新变更…",
    startingSourceControlAction: "正在启动源码管理操作…",
    preparingFeatureRef: "正在准备功能分支…",
    pushing: "正在推送…",
    committing: "正在提交…",
    generatingCommitMessage: "正在生成提交消息…",
    commit: "提交",
    push: "推送",
    gitActionInProgress: "Git操作正在进行。",
    gitStatusIsUnavailable: "无法获取Git状态。",
    commitPush: "提交并推送",
    publishRepository: "发布仓库",
    branchIsUpToDateNoActionNeeded: "分支已是最新，无需操作。",
    noLocalCommitsToPush: "没有可推送的本地提交。",
    syncRef: "同步分支",
    branchHasDivergedFromUpstreamRebaseMergeFirst: "分支与上游已分叉，请先变基或合并。",
    pull: "拉取",
    commitPushToDefaultRef: "要提交并推送到默认分支吗？",
    pushToDefaultRef: "要推送到默认分支吗？",
    yourSignedInServer: "你已登录的服务器",
    yourServer: "你的服务器",
    providerStatusUnavailableOpenSettingsSourceControlAndRescan:
      "无法获取Provider状态。请打开设置 → 源码管理并重新扫描。",
    worktreeIsCleanMakeChangesBeforeCommitting: "worktree没有变更，请先修改再提交。",
    commitIsCurrentlyUnavailable: "当前无法提交。",
    detachedHEADCheckOutABranchBeforePushing: "HEAD已分离，请先检出分支再推送。",
    commitOrStashLocalChangesBeforePushing: "请先提交或暂存本地变更再推送。",
    branchIsBehindUpstreamPullRebaseBeforePushing: "分支落后于上游，请先拉取或变基再推送。",
    addAnOriginRemoteBeforePushing: "请先添加“origin”远程仓库再推送。",
    pushIsCurrentlyUnavailable: "当前无法推送。",
    commitChanges: "提交变更",
    reviewAndConfirmYourCommitLeaveTheMessageBlankToAutoGenerateOne:
      "检查并确认提交。消息留空时会自动生成。",
    provider: "Provider",
    repository: "仓库",
    summary: "摘要",
    anErrorOccurred: "发生错误。",
    pickWhereToHostItThenPointUsAtARepoToPushTo: "选择托管平台，再指定要推送到的仓库。",
    setupRequired: "需要设置",
    openSettingsSourceControlToConfigureThisProvider: "打开设置 → 源码管理以配置此Provider。",
    visibility: "可见性",
    private: "私有",
    onlyInvitedPeople: "仅受邀的人",
    public: "公开",
    anyoneOnTheWeb: "任何人",
    advanced: "高级",
    protocol: "协议",
    publishingRepositoryTo: "正在发布仓库到 ",
    publishFailed: "发布失败",
    repositoryPublished: "仓库已发布",
    repositoryCreated: "仓库已创建",
    openOn: "在以下平台打开 ",
    publishResultUnavailable: "无法获取发布结果。",
    done: "完成",
    back: "返回",
    next: "下一步",
    publishing: "正在发布…",
    publish: "发布",
    thisConnectionCannotChangeSourceControl: "此连接无法更改源码管理。",
    thisActionIsCurrentlyUnavailable: "此操作当前不可用。",
    actionFailed: "操作失败",
    pullFailed: "拉取失败",
    pulled: "已拉取",
    alreadyUpToDate: "已是最新",
    editorOpeningIsUnavailable: "无法打开编辑器。",
    unableToOpenFile: "无法打开文件",
    gitInitializationFailed: "Git初始化失败",
    publishRepository2: "发布仓库…",
    detachedHEADCreateAndCheckOutABranchToEnablePushAndPullRequestActions:
      "HEAD已分离，请创建并检出分支以启用推送和拉取请求操作。",
    behindUpstreamPullRebaseFirst: "落后于上游，请先拉取或变基。",
    initializing: "正在初始化…",
    initializeGit: "初始化Git",
    gitActions: "Git操作",
    gitActionOptions: "Git操作选项",
    defaultBranch: "默认分支",
    files: "文件",
    edit: "编辑",
    none: "无",
    excluded: "已排除",
    commitMessageOptional: "提交消息（可选）",
    leaveEmptyToAutoGenerate: "留空以自动生成",
    commitOnNewBranch: "在新分支上提交",
    runActionOnDefaultBranch: "要在默认分支上执行操作吗？",
    abort: "中止",
    continue: "继续",
    checkOutFeatureBranchContinue: "检出功能分支并继续",
    initializingRepository: "正在初始化仓库",
    publishingRepository: "正在发布仓库",
    thisConnectionCannotChangeThreads: "此连接无法更改对话。",
    preparingPullRequestThread: "正在准备拉取请求对话",
  },
  diff: {
    /** Formats expandFile using path. */
    expandFile: (path) => `展开${path}`,
    /** Formats collapseFile using path. */
    collapseFile: (path) => `折叠${path}`,
    /** Formats turnTitle using turn. */
    turnTitle: (turn) => `轮次${turn}`,
    /** Formats scopeLabel using scope. */
    scopeLabel: (scope) => `差异范围：${scope}`,
    /** Formats compareRefs using head, base. */
    compareRefs: (head, base) => `将${head}与${base}比较`,
    /** Formats changeTarget using base. */
    changeTarget: (base) => `更改比较目标。当前为${base}`,
    /** Formats remoteVersion using branch. */
    remoteVersion: (branch) => `使用${branch}的远程版本`,
    /** Formats sectionFiles using section. */
    sectionFiles: (section) => `${section}的文件`,
    /** Formats commentLines using range. */
    commentLines: (range) => `评论行${range}`,
    copyFilePath: "复制文件路径",
    copied: "已复制",
    copyPath: "复制路径",
    expandDiff: "展开差异",
    collapseDiff: "折叠差异",
    uncommitted: "未提交",
    changes: "变更",
    latestTurn: "最新轮次",
    diffFileContentsAreUnavailableForThisSelection: "无法获取所选差异的文件内容。",
    turn: "轮次",
    turn2: "轮次 ",
    remote: "远程",
    noMatchingRefs: "未找到匹配的分支。",
    automatic: "自动",
    remoteOnly: "仅远程",
    refreshingDiff: "正在刷新差异",
    refreshDiff: "刷新差异",
    refreshingDiff2: "正在刷新差异…",
    expandAllFiles: "展开所有文件",
    collapseAllFiles: "折叠所有文件",
    diffLayout: "差异布局",
    stackedDiffView: "上下差异视图",
    splitDiffView: "左右差异视图",
    disableDiffLineWrapping: "关闭差异自动换行",
    enableDiffLineWrapping: "开启差异自动换行",
    disableLineWrapping: "关闭自动换行",
    enableLineWrapping: "开启自动换行",
    showWhitespaceChanges: "显示空白变更",
    hideWhitespaceChanges: "隐藏空白变更",
    hideFileTree: "隐藏文件树",
    showFileTree: "显示文件树",
    selectAThreadToInspectTurnDiffs: "选择对话以查看轮次差异。",
    turnDiffsAreUnavailableBecauseThisProjectIsNotAGitRepository:
      "此项目不是Git仓库，无法查看轮次差异。",
    noCompletedTurnsYet: "尚无已完成的轮次。",
    checkingFileAccess: "正在检查文件访问权限…",
    thisConnectionCannotReadLocalDiffs: "此连接无法读取本地差异。",
    thisPreviewExceedsTheSizeLimitChangesShownAreIncomplete:
      "此预览超过大小限制，显示的变更不完整。",
    totalsIncludeAllChanges: " 总数包含所有变更。",
    loadingCheckpointDiff: "正在加载检查点差异…",
    loadingUncommittedChanges: "正在加载未提交变更…",
    loadingChanges: "正在加载变更…",
    noNetChangesInThisSelection: "所选范围没有净变更。",
    noPatchAvailableForThisSelection: "所选范围没有可用补丁。",
    loadingCode: "正在加载代码…",
    addAComment: "添加评论…",
    comment: "评论",
    deleteComment: "删除评论",
    ctrlEnterToSend: "按⌘/Ctrl Enter发送",
    loadingDiff: "正在加载差异…",
    retryLoadingDiff: "重试加载差异",
    partialDiffPreview: "部分差异预览",
    thisFileIsTooLargeToShowInFullCountsIncludeAllChanges:
      "此文件太大，无法完整显示。数量包含所有变更。",
    collapseAllFolders: "折叠所有文件夹",
    expandAllFolders: "展开所有文件夹",
    unsupportedDiffFormatShowingRawPatch: "不支持此差异格式，显示原始补丁。",
    failedToParsePatchShowingRawPatch: "补丁解析失败，显示原始补丁。",
  },
  branch: {
    currentBadge: "当前",
    worktreeBadge: "worktree",
    remoteBadge: "远程",
    defaultBadge: "默认",
    /** Formats showingRefs using shown, total. */
    showingRefs: (shown, total) => `显示${shown} / ${total}个分支`,
    searchRefs: "搜索分支…",
    noRefsFound: "未找到分支。",
    startFromOrigin: "从origin开始",
    startWorktreeFromOrigin: "从origin创建worktree",
    createsTheWorktreeFromTheLatestMatchingBranchOnOriginInsteadOfYourLocalBranch:
      "使用origin上匹配分支的最新版本创建worktree。",
    previousWorktree: "先前的worktree",
    loadingRefs: "正在加载分支…",
    loadingMoreRefs: "正在加载更多分支…",
  },
};
