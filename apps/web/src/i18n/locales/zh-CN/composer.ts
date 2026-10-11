/** Chinese composer labels and messages matching the English dictionary. */
import type { Messages } from "../en";

export const composer: Messages["composer"] = {
  mode: {
    planTooltip: "计划模式 — 点击返回普通执行模式",
    buildTooltip: "默认模式 — 点击进入计划模式",
    plan: "计划",
    build: "执行",
    runtimeAriaLabel: "运行模式",
  },
  attachments: {
    questionServerUpdateHint: "请更新此服务器，才能在回答问题时发送文件",
    reattachFileHint: "请重新附加中断的文件或将其移除",
    reattachFilesHint: "请重新附加中断的文件或将其移除",
    /** Names the source attachment that could not be imported. */
    importError: (name: string) => `无法将 ${name} 加入此消息`,
    /** Adds recovery steps after the displayed import failure reason. */
    importRecoveryHint: (reason: string) => `${reason} 请移除该标签或重新附加文件。`,
    sourceDisconnectedError: "其来源环境未连接。",
    sourceMissingError: "原始附件已不可用。",
    sourceDownloadError: "从来源下载失败。",
    draftRejectedError: "草稿拒绝了此附件（重复或已达附件上限）。",
    compressingToast: "仍在压缩粘贴的图片。",
    compressingSendHint: "缩略图出现后请再次发送。",
    importingToast: "仍在将粘贴的附件加入此消息。",
    importingSendHint: "标签加载完成后请再次发送。",
    importingStashHint: "标签加载完成后请再次暂存。",
    /** Names the attachment whose preview can be opened. */
    preview: (name: string) => `预览 ${name}`,
    /** Describes the count of hidden image attachments. */
    showMoreImages: (count: number) => `显示另外 ${count} 个图片附件`,
    questionUnsupportedToast: "此问题不接受附件。",
    /** Reports the maximum file count allowed in one message. */
    limitError: (limit: number) => `每条消息最多可附加 ${limit} 个文件。`,
    /** Reports an unsupported image filename and the accepted formats. */
    unsupportedImageError: (name: string) =>
      `“${name}”不是支持的图片类型。请附加GIF、HEIC、HEIF、JPEG、PNG或WebP图片。`,
    serverUnsupportedError: "此服务器不支持文件附件。",
    /** Reports the filename of an empty or unreadable file. */
    unreadableFileError: (name: string) => `“${name}”为空或无法读取。`,
    /** Names the file created from a large clipboard paste. */
    largePasteToast: (name: string) => `大段粘贴内容已作为 ${name} 附加`,
    /** Shows the attachment size and the platform shortcut for an inline paste. */
    largePasteHint: (size: string, shortcut: string) =>
      `${size} · 使用 ${shortcut} 可将大段粘贴内容保留在正文中。`,
    /** Reports the filename of an image that could not be decoded. */
    unreadableImageError: (name: string) => `无法将“${name}”读取为图片。`,
    /** Reports the filename of an image still too large after compression. */
    imageTooLargeError: (name: string) => `“${name}”即使压缩后仍过大，无法附加。`,
    /** Names the image and explains that removing it also removes its text references. */
    removeReferencedImageConfirm: (name: string) =>
      `要从消息中移除 ${name} 吗？\n正文中引用了它，移除后所有引用也会被删除。`,
    pasteMessageTooLargeToast: "粘贴的文本超出此消息的大小上限",
    pasteMessageTooLargeHint: "请删除部分文本或附件，然后重新粘贴。",
    pasteAttachmentTooLargeToast: "粘贴的文本过大，无法附加",
    pasteAttachmentTooLargeHint: "请减少剪贴板内容，或将较小的片段另存为文件。",
    remoteFolderToast: "不能将文件夹拖入远程环境",
    /** Names the dropped folder whose local path could not be read. */
    folderPathErrorToast: (name: string) => `无法获取“${name}”的路径`,
    folderPathHint: "请改用 @ 输入文件夹路径。",
    /** Names the attachment to remove from the draft. */
    remove: (name: string) => `移除 ${name}`,
    persistenceWarning: "草稿附件可能无法保留",
    persistenceHint: "草稿附件无法保存到本地，切换页面时可能丢失。",
    /** Names the attachment whose failed upload can be retried. */
    retryUpload: (name: string) => `重新上传 ${name}`,
    /** Names the video attachment to play. */
    play: (name: string) => `播放 ${name}`,
    attachAgain: "重新附加",
    removeToSend: "移除后发送",
    attach: "附加文件",
    waitingForServerHint: "正在等待服务器，之后才能发送文件附件",
    capabilityUnsupportedHint: "此服务器当前不接受文件附件，请移除文件后发送。",
    thisImage: "此图片",
  },
  validation: {
    compactUnavailableHint: "当前无法压缩",
    selectModelHint: "请至少选择一个模型。",
    /** Reports excess characters and the input limit; excess selects the English plural. */
    promptLengthError: (excess: number, limit: number) =>
      `提示词超出 ${limit.toLocaleString("en-US")} 字符上限 ${excess.toLocaleString("en-US")} 个字符。请缩短或拆分后再发送。`,
  },
  commandMenu: {
    switchModelDescription: "切换此对话的回复模型",
    planDescription: "将此对话切换到计划模式",
    buildDescription: "将此对话切换回普通执行模式",
    runCommandDescription: "运行provider命令",
    /** Describes a skill using its provider-reported scope. */
    skillScope: (scope: string) => `${scope} 技能`,
    runSkillDescription: "运行provider技能",
    skillsEmpty: "未找到技能。输入 / 浏览provider命令。",
    pullRequestsUnavailableHint: "此项目不支持拉取请求。",
    pullRequestsReadError: "无法读取此项目的拉取请求。",
    /** Includes the search query that matched no pull request. */
    pullRequestEmpty: (query: string) => `没有与 ${query} 匹配的拉取请求。`,
    repositoryPullRequestsEmpty: "此仓库中没有拉取请求。",
    pathsEmpty: "没有匹配的文件或文件夹。",
    commandsEmpty: "没有匹配的命令。",
    findingPullRequest: "正在查找拉取请求…",
    searchingPaths: "正在搜索工作区文件…",
    searchingSkills: "正在搜索工作区技能…",
    pathsLabel: "文件和文件夹",
    pullRequestsLabel: "拉取请求",
    commandsLabel: "命令",
    skillsLabel: "技能",
    appSource: "应用",
    repoSource: "仓库",
    projectSource: "项目",
    personalSource: "个人",
    systemSource: "系统",
    providerSource: "Provider",
    skillSuffix: " 技能",
  },
  primaryActions: {
    resume: "继续对话",
    openToCompact: "打开输入框以压缩并发送",
    send: "发送消息",
    submit: "提交",
    next: "下一步",
    nextQuestion: "下一个问题",
    submitAnswers: "提交回答",
    submitAnswer: "提交回答",
    stop: "停止生成",
    interrupt: "中断",
    previousQuestion: "上一个问题",
    previous: "上一步",
    sending: "正在发送…",
    refine: "完善",
    implement: "实施",
    implementationActions: "实施操作",
    implementNewThread: "在新对话中实施",
    fullLabel: "完整",
    compactLabel: "压缩",
    /** Labels the compaction toggle using a formatted history token count. */
    compactHistoryAria: (tokens: string) => `发送前压缩 ${tokens} 个 token 的历史记录`,
    /** Describes the full-history setting and how to switch to compaction. */
    keepHistoryTooltip: (tokens: string) => `下次发送保留全部 ${tokens} 个 token。点击可先压缩`,
    /** Describes the compaction setting and how to keep the full history. */
    compactHistoryTooltip: (tokens: string) =>
      `下次发送先压缩 ${tokens} 个 token。点击可保留完整历史`,
    compactSend: "压缩并发送",
    updateQueued: "更新排队的消息",
    queue: "排队发送消息",
    steer: "引导消息",
    submitMessage: "提交消息",
    disconnected: "环境已断开",
    connecting: "正在连接",
    preparingWorktree: "正在准备worktree",
    updatingQueued: "正在更新排队的消息",
    submittingMessage: "正在提交消息",
    /** Describes the default and alternate send actions and an optional shortcut. */
    dispatchTooltip: (
      behavior: "queue" | "steer",
      shortcut: string | null,
      alternateAction: "queue" | "steer" | "restart",
    ) =>
      `点击以${behavior === "queue" ? "排队发送" : "引导"}，按住Ctrl/⌘ 点击${shortcut ? `或按 ${shortcut}` : ""}以${alternateAction === "queue" ? "排队发送" : alternateAction === "restart" ? "重新运行" : "引导"}`,
    /** Describes compaction using an already formatted history token count. */
    summarizeHistory: (tokens: string) => `总结 ${tokens} 个token的历史记录，然后发送`,
    submitting: "正在提交…",
  },
  stash: {
    differentEnvironmentToast: "暂存的文件属于其他环境",
    differentEnvironmentHint: "请在接收这些文件的环境中恢复此提示词。",
    restorePersistenceToast: "已恢复的提示词可能再次出现在暂存区",
    restorePersistenceHint: "浏览器存储拒绝了此次更新，因此重新加载后该条目可能仍然存在。",
    /** Lists filenames discarded because the stash exceeded its storage limit. */
    droppedImagesHint: (names: string) => `保存此提示词时，${names} 超出了暂存区大小上限。`,
    /** Lists filenames that could not be read while saving the stash. */
    unreadableImagesHint: (names: string) => `保存此提示词时，无法读取 ${names}。`,
    /** Lists unrestored filenames and the composer attachment count limit. */
    unrestoredAttachmentsHint: (names: string, limit: number) =>
      `无法恢复 ${names}：输入框已达 ${limit} 个附件的上限。`,
    /** Lists expired filenames and explains the 24-hour retention period. */
    expiredFilesHint: (names: string) =>
      `${names}：暂存的文件只保留24小时，此上传已过期，请重新附加文件。`,
    attachmentsMissingToast: "部分附件未恢复",
    deletePersistenceToast: "暂存条目可能再次出现",
    deletePersistenceHint: "浏览器存储拒绝了删除操作，因此重新加载后此提示词可能再次出现。",
    reattachBeforeStashingToast: "暂存前请重新附加拖入的文件或将其移除",
    waitForUploadsToast: "请等待文件上传完成后再暂存此提示词",
    saveErrorToast: "无法暂存此提示词",
    saveErrorHint: "浏览器存储拒绝了写入，输入框内容保持不变。请清理网站数据后重试。",
    sessionOnlyToast: "暂存的提示词在重新加载后不会保留",
    sessionOnlyHint: "浏览器存储不可用，此暂存仅在本次会话的内存中保留。",
    oldestDiscardedToast: "已丢弃最早的暂存提示词",
    /** Reports the stash entry limit when the oldest prompt is discarded. */
    oldestDiscardedHint: (limit: number) =>
      `暂存区最多保存 ${limit} 条提示词，已移除最早的一条以腾出空间。`,
    imagesNotSavedToast: "暂存的图片未保存",
    imagesNotSavedHint: "提示词已暂存，但浏览器存储拒绝了其中的图片。重新加载后这些图片会丢失。",
    imagesDidNotAttachToast: "暂存的图片未附加",
    /** Reports the saved image count when its stash entry disappeared; English uses singular or plural. */
    imagesDidNotAttachHint: (count: number) =>
      `${count} 张图片保存完成前，该提示词已被恢复或删除。如仍需要，请重新附加。`,
    /** Announces the stashed prompt count and the action that opens the stash. */
    openAriaLabel: (count: number) => `暂存的提示词：${count} 条。打开暂存区。`,
    title: "暂存区",
    /** Summarizes an attachment-only stash entry; kind is a stable singular selector. */
    attachmentSnippet: (count: number, kind: "attachment" | "file" | "image") =>
      `（${count} 个${kind === "attachment" ? "附件" : kind === "file" ? "文件" : "图片"}）`,
    close: "关闭暂存区",
    listAriaLabel: "暂存的提示词",
    empty: "暂存区还是空的。",
    /** Explains how to stash a prompt using the supplied shortcut label. */
    shortcutHint: (shortcut: string) => ` 在输入框中输入提示词后按 ${shortcut} 即可暂存。`,
    /** Names the stashed prompt to restore using its display snippet. */
    restoreAriaLabel: (snippet: string) => `恢复暂存的提示词：${snippet}`,
    delete: "删除暂存的提示词",
    emptySnippet: "（空）",
    /** Reports the image count still being saved; English uses singular or plural. */
    savingImagesHint: (count: number) => `正在保存 ${count} 张图片…`,
    /** Reports the dropped image count; English uses singular or plural. */
    droppedImagesCountHint: (count: number) => `${count} 张图片已丢弃`,
  },
  provider: {
    openSettings: "打开provider设置",
    unavailable: "没有可用的provider",
  },
  context: {
    addErrorToast: "无法添加到聊天",
    busyHint: "输入框正忙，请在就绪后重试。",
    wrongEnvironmentToast: "请使用此环境中的对话",
    wrongEnvironmentHint: "Agent只能读取其所在服务器上的对话。",
    /** Combines a context kind display label with its content label. */
    chipAriaLabel: (kind: string, label: string) => `${kind}，${label}`,
    uploadFailed: "上传失败",
    attachAgain: "重新附加",
    /** Names a file attachment and size; previewVideo selects the video preview action. */
    fileAriaLabel: (previewVideo: boolean, name: string, size: string) =>
      `${previewVideo ? "预览视频" : "文件"}附件，${name}，${size}`,
    /** Names a draft file that must be attached again before sending. */
    reattachHint: (name: string) => `${name} 未随此草稿保存。请重新附加后发送。`,
    /** Formats an annotation target count; kind selects its singular name and count selects the English plural. */
    annotationCount: (count: number, kind: "element" | "region" | "drawing" | "style change") =>
      `${count} 个${kind === "element" ? "元素" : kind === "region" ? "区域" : kind === "drawing" ? "绘图" : "样式更改"}`,
    annotationCrop: "带标注的预览截图",
    screenshotUnavailable: "截图不可用",
    unavailableHint: "此上下文已不可用。请移除或重新附加。",
    reviewComment: "审查评论",
    previewAnnotation: "预览标注",
    /** Describes the PR state for display; null selects the generic pull request label. */
    pullRequestKind: (state: "open" | "draft" | "merged" | "closed" | null) =>
      state === null
        ? "拉取请求"
        : state === "open"
          ? "开放的拉取请求"
          : state === "draft"
            ? "草稿拉取请求"
            : state === "merged"
              ? "已合并的拉取请求"
              : "已关闭的拉取请求",
  },
  placeholder: {
    customAnswer: "填写自定义回答",
    expand: "展开输入框",
    chooseOption: "请选择上方的选项",
    ownAnswer: "输入你自己的回答，或留空以使用所选选项",
    enableProvider: "请在设置中启用provider",
    ask: "问点什么…",
    draft: "草稿",
    message: "消息",
    resolveApproval: "请处理此审批请求后继续",
    refinePlan: "添加反馈以完善计划，或留空直接实施",
    chooseProject: "请在上方选择项目以开始对话",
    enableProviderToSend: "请在设置中启用provider后再发送消息",
    full: "问点什么，用 @ 引用文件/文件夹，用 $ 使用技能，或输入 / 调用命令",
    disconnected: "请求修改、发送后续消息或附加图片",
  },
  bannerStack: {
    showOtherNotices: "显示其他通知",
    otherNotices: "其他通知",
    showDetails: "显示通知详情",
    details: "通知详情",
    dismissWarning: "关闭警告",
  },
  feedback: {
    clipboardLabel: "Codex反馈对话ID",
    copyErrorToast: "无法复制对话ID",
    errorHint: "发生错误。",
    copyId: "复制ID",
    dismiss: "关闭反馈通知",
  },
  approval: {
    cancel: "取消",
    decline: "拒绝",
    allowSession: "本次会话始终允许",
    approve: "批准",
    moreOptions: "更多审批选项",
    appAccessTitle: "应用访问审批",
    commandTitle: "命令审批",
    fileReadTitle: "文件读取审批",
    permissionTitle: "应用权限审批",
    fileChangeTitle: "文件修改审批",
    appAccessAriaLabel: "应用访问请求",
    commandAriaLabel: "命令",
    fileReadAriaLabel: "要读取的文件",
    permissionAriaLabel: "权限请求",
    fileChangeAriaLabel: "文件修改",
    processGoneHint: "Provider进程已退出 — 请中断或重新开始运行后再响应。",
  },
  userInput: {
    showQuestion: "显示问题及选项",
    hideQuestion: "隐藏问题及选项",
    dismiss: "不回答并关闭问题",
    selectMultipleHint: "请选择一个或多个选项。",
  },
  planFollowUp: {
    ready: "计划已就绪",
  },
  serverUpdate: {
    serverLabel: "服务器",
    /** Names the server being updated; failed selects the failure wording. */
    title: (failed: boolean, server: string) => `${failed ? "无法更新" : "正在更新"} ${server}`,
    /** Combines the server update title with its stage or failure detail. */
    detailsAriaLabel: (title: string, detail: string) => `${title}：${detail}`,
  },
  tasks: {
    pending: "等待中",
    running: "运行中",
    completed: "已完成",
    title: "任务",
    /** Announces completed and total task counts and the current step; expanded selects the collapse action. */
    progressAriaLabel: (expanded: boolean, completed: number, total: number, step: string) =>
      `${expanded ? "折叠任务" : "任务"}：已完成 ${completed} / ${total}。当前任务：${step}`,
    /** Announces completed and total counts for the task list. */
    listAriaLabel: (completed: number, total: number) =>
      `任务列表。已完成 ${completed} / ${total}。`,
    now: "刚刚",
  },
  usageLimits: {
    toggleAccount: "切换账号标签显示",
    revealAccount: "点击显示账号",
    hideAccount: "点击隐藏账号",
    /** Reports the number of accounts in a usage limits report. */
    accountCount: (count: number) => `${count} 个账号`,
    title: "用量限制",
    dismiss: "关闭用量限制",
    manage: "管理用量",
  },
  contextWindow: {
    /** Describes the token threshold at which automatic compaction starts. */
    compactAtHint: (threshold: number) =>
      `达到 ${threshold.toLocaleString("en-US")} 个token时自动压缩。`,
    /** Names the model whose context compacts automatically. */
    modelAutoCompactHint: (model: string) => `${model} 的上下文会在需要时自动压缩。`,
    autoCompactHint: "上下文会在需要时自动压缩。",
    /** Announces context usage using an already formatted percentage. */
    usedPercentageAriaLabel: (percentage: string) => `上下文窗口已使用 ${percentage}`,
    /** Announces context usage using an already formatted token count. */
    usedTokensAriaLabel: (tokens: string) => `上下文窗口已使用 ${tokens} 个token`,
    title: "上下文窗口",
    usageAriaLabel: "上下文窗口用量",
    totalProcessed: "累计处理",
    cost: "费用",
    compact: "压缩上下文",
  },
  modelPicker: {
    newAriaLabel: "新模型",
    newBadge: "新",
    unavailable: "不可用",
    removeFavorite: "从收藏中移除",
    addFavorite: "添加到收藏",
    /** Names a provider that cannot be selected within the current thread. */
    providerLockedHint: (provider: string) =>
      `${provider} 在此对话中不可用。请新建对话以切换provider。`,
    searchPlaceholder: "搜索模型…",
    legacy: "旧版模型",
    /** Names the provider whose setup can be opened. */
    setupProvider: (provider: string) => `设置 ${provider}`,
    openSetup: "打开provider设置",
    empty: "未找到模型",
    /** Names a provider disabled in settings. */
    disabledHint: (provider: string) => `${provider} — 已在设置中禁用。`,
    limited: "受限",
    notReady: "未就绪",
    /** Combines a provider name and status label with optional provider-reported detail. */
    statusHint: (provider: string, kind: string, message: string | undefined) =>
      message ? `${provider} — ${kind}。${message}` : `${provider} — ${kind}。`,
    providersAriaLabel: "Provider",
    favorites: "收藏",
    /** Marks a provider display name as new. */
    newProviderTooltip: (provider: string) => `${provider} — 新`,
    /** Announces that a provider is new using its display name. */
    newProviderAriaLabel: (provider: string) => `${provider}，新`,
    choose: "选择模型",
    /** Adds an availability suffix to a model display label when unavailable is true. */
    labelWithAvailability: (label: string, unavailable: boolean) =>
      `${label}${unavailable ? "（不可用）" : ""}`,
    chooseMultiple: "选择模型",
    /** Shows the first two ordered model labels and the count of remaining selections. */
    multipleLabel: (labels: string[]) =>
      `${labels.slice(0, 2).join(", ")}${labels.length > 2 ? ` 等另外 ${labels.length - 2} 个` : ""}`,
    /** Reports the model count in the legacy model section. */
    modelCount: (count: number) => `${count} 个模型`,
  },
  secretRequest: {
    save: "安全保存",
    decline: "拒绝",
  },
  traits: {
    agent: "Agent",
    effort: "投入程度",
    reasoningEffort: "推理强度",
    default: "默认",
    ultrathinkBodyHint: "你的提示词中包含“ultrathink”，请删除后再更改此选项。",
    on: "开",
    off: "关",
    fast: "快速",
    normal: "普通",
    ultrafast: "极速",
    ultrathink: "Ultrathink",
    /** Combines a provider trait display label with its enabled state. */
    booleanLabel: (label: string, enabled: boolean) => `${label} ${enabled ? "开" : "关"}`,
    reasoning: "推理",
  },
};
