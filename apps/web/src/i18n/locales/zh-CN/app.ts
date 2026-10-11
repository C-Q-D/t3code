/** App shell and shared UI messages; excludes protocol and persisted values. */
import type { Messages } from "../en";

export const app: Messages["app"] = {
  desktopWebLinkCouldNotOpen: "无法打开链接",
  quitHoldOverlay: {
    holdOrPressTwice: (shortcut) => `按住${shortcut}或连按两次以退出`,
    pressAgain: (shortcut) => `再按一次${shortcut}以退出`,
  },
  storage: {
    /** Describes the failed storage operation and the affected preference key. */
    failure: (operation, storageKey) =>
      `无法${{ read: "读取", decode: "解码", encode: "编码", update: "更新", write: "写入", remove: "移除", notify: "通知更改" }[operation]}本地存储项 ${storageKey}。`,
  },
  environment: {
    /** Describes the named remote machines; alsoHere indicates a local copy. */
    onMachines: (alsoHere, labels) => `${alsoHere ? "也位于" : "位于"} ${labels}`,
  },
  subagent: {
    worktree: "worktree",
    project: "项目",
    status: {
      idle: "空闲",
      pending: "等待中",
      running: "运行中",
      waiting: "等待中",
      completed: "已完成",
      failed: "失败",
      cancelled: "已取消",
      interrupted: "已中断",
    },
  },
  actions: {
    loading: "正在加载",
    dismiss: "关闭",
    copied: "已复制",
    copyLink: "复制链接",
    retry: "重试",
    import: "导入",
    update: "更新",
    updateAll: "全部更新",
    continue: "继续",
    saving: "正在保存…",
    saveChanges: "保存更改",
    close: "关闭",
  },
  composer: {
    /** Formats the message using path. */
    preview: (path) => `预览 ${path}`,
    /** Formats the message using skillLabel. */
    skill: (skillLabel) => `技能 ${skillLabel}`,
    noSkillDescription: "此技能没有可用说明。",
    viewInstructions: "查看指引",
  },
  snooze: {
    invalidDate: "请选择有效的未来日期和时间。",
    invalidDuration: "请输入大于零的时长。",
    title: "自定义暂缓",
    description: "选择暂缓的对话何时返回收件箱。",
    scheduleType: "计划类型",
    dateAndTime: "日期和时间",
    duration: "时长",
    date: "日期",
    chooseDate: "选择暂缓日期",
    time: "时间",
    snoozeFor: "暂缓时长",
    decreaseDuration: "缩短时长",
    increaseDuration: "延长时长",
    unit: "单位",
    minutes: "分钟",
    hours: "小时",
    days: "天",
  },
  machine: {
    server: "服务器",
    cloudVm: "云虚拟机",
    desktop: "台式机",
    laptop: "笔记本电脑",
    miniPc: "迷你电脑",
    workstation: "工作站",
  },
  keybindings: {
    openError: "无法打开快捷键文件",
    unknownOpenError: "打开文件时发生未知错误。",
    openFile: "打开 keybindings.json",
  },
  migration: {
    restoring: "正在恢复对话…",
    /** Describes the number of threads being migrated. */
    progress: (count) =>
      `正在从上一版本迁移 ${count.toLocaleString()} 个对话。此过程不影响你继续工作。`,
  },
  mobile: {
    nightlyTitle: "Nightly需要测试版移动应用",
    nightlyDescription: "Nightly使用新的编排器。App Store和Google Play上的T3 Code版本无法连接。",
    getBeta: "获取测试版应用",
    title: "移动应用",
    betaDescription: "Nightly需要测试版应用。App Store和Google Play上的版本无法连接。",
    testFlightBeta: "TestFlight测试版",
    scanIphone: "使用iPhone相机扫描。",
    testFlightLink: "TestFlight测试版链接",
    googlePlayBeta: "Google Play测试版",
    googleStepsHint:
      "两个步骤请使用同一个Google账号。加入群组后，步骤2最多可能需要一小时才能生效。",
    joinGroup: "1. 加入群组",
    androidGroupLink: "Android测试版群组链接",
    becomeTester: "2. 成为测试者",
    googlePlayLink: "Google Play测试版链接",
  },
  projects: {
    heroTitle: "我们要做什么？",
    addFirst: "添加项目，开始第一个对话。",
    addOrStart: "添加项目，或直接开始。",
    startWithout: "不创建项目，直接开始",
    open: "打开项目",
    remove: "移除项目",
    publishError: (provider: string) => `无法创建 ${provider} 仓库`,
    /** Formats the message using message. */
    publishRetryHint: (message) => `${message} 请使用Git菜单中的“发布仓库”重试。`,
    published: (provider: string) => `已发布到 ${provider}`,
    createError: "无法创建项目",
    /** Formats the message using name. */
    created: (name) => `已创建 ${name}`,
    /** Formats the message using name. */
    createdWithoutCommit: (name) => `已创建 ${name}，但尚无首次提交`,
    /** Formats the message using message, workspaceRoot. */
    commitErrorHint: (message, workspaceRoot) => `${message} 项目位于 ${workspaceRoot}。`,
    openError: "打开项目失败",
    /** Formats the message using message. */
    sidebarCatchupHint: (message) => `${message} 此客户端同步完成后，项目会出现在侧边栏中。`,
    removeError: "移除项目失败",
    scratchError: "无法在不创建项目的情况下开始",
    desktopTimeout: "项目未出现在桌面应用中。",
  },
  permissions: {
    /** Formats the message using environmentLabel. */
    changed: (environmentLabel) => `${environmentLabel} 的权限已更改`,
    changedHint: "此连接仍使用旧权限，部分操作可能已不可用。请使用包含所需权限的新链接重新配对。",
    openConnections: "打开连接设置",
    allowed: "已允许",
    allow: "允许",
    checkError: "无法检查权限。稍后将自动重试。",
  },
  clone: {
    /** Formats the message using name. */
    cloning: (name) => `正在克隆 ${name}`,
    cancelError: "取消克隆失败",
    /** Formats the message using name. */
    cloned: (name) => `已克隆 ${name}`,
    /** Formats the message using name. */
    cancelled: (name) => `已取消克隆 ${name}`,
    /** Formats the message using name. */
    failed: (name) => `克隆 ${name} 失败`,
    failedDescription: "克隆失败。",
    retryError: "重试克隆失败",
  },
  scripts: {
    /** Asks to delete the action with the supplied display name. */
    confirmDelete: (name) => `要删除操作“${name}”吗？`,
    importError: "导入操作失败。",
    fromFile: "来自 t3.json",
    /** Formats the message using name. */
    editNamed: (name) => `编辑 ${name}`,
    addScript: "添加项目脚本",
    addAction: "添加操作",
    run: "运行",
    projectActions: "项目操作",
    addProjectAction: "添加项目操作…",
    projectScripts: "项目脚本",
    /** Formats the message using name. */
    runNamed: (name) => `运行 ${name}`,
    pairTerminalHint: "请重新配对此客户端，并授予运行终端命令的权限。",
    scriptActions: "脚本操作",
    actions: "操作",
    chooseAction: "选择项目操作",
    play: "运行",
    test: "测试",
    lint: "代码检查",
    configure: "配置",
    build: "构建",
    debug: "调试",
    changeDenied: "此连接无权更改项目操作。",
    keybindingDenied: "此连接无权更改快捷键。",
    nameRequired: "请输入名称。",
    commandRequired: "请输入命令。",
    saveError: "保存操作失败。",
    editTitle: "编辑操作",
    addTitle: "添加操作",
    description: "操作是项目专用命令，可从顶部栏或通过快捷键运行。",
    name: "名称",
    chooseIcon: "选择图标",
    keybinding: "快捷键",
    pressShortcut: "按下快捷键",
    shortcutHintLead: "按下快捷键。使用",
    shortcutHintTail: "清除。快捷键在整个环境中生效。使用同一操作的项目共享其快捷键。",
    command: "命令",
    previewUrl: "预览URL（可选）",
    previewHint: "运行此操作时，在应用内预览中打开此URL。",
    runOnCreate: "创建worktree时自动运行",
    waitBeforeAgent: "等待操作完成后再启动Agent",
    runOnSettle: "对话完结时，在其worktree中运行",
    autoPreview: "运行此操作时自动打开预览",
    saveAction: "保存操作",
    deleteAction: "删除操作",
    invalidKeybinding: "快捷键无效。",
  },
  provider: {
    manageDenied: "此连接无权管理Provider账号。",
    timeout: "更新超时，请重试。",
    disconnected: "此环境未连接，请在重新连接后重试。",
    manageDeniedHint: "此连接无权管理Provider账号。请在Provider设置中查看更新详情。",
  },
  errors: {
    noEnvironment: "未选择环境。",
    resourceMonitorDenied: "此连接无权重启资源监视器。",
    reopenView: "无法重新打开视图",
    openLink: "无法打开链接。",
    openSystemSettings: "无法打开系统设置。",
    loadRefs: "加载引用失败。",
    searchFilesDenied: "此连接无权搜索主机文件。",
    environmentRequest: "环境请求失败。",
  },
  server: {
    downloading: "正在下载…",
    restarting: "正在重启…",
    updateErrorDescription: "服务器更新失败。",
    updateError: "服务器更新失败",
    /** Formats the message using serverLabel. */
    updated: (serverLabel) => `${serverLabel} 已更新`,
    /** Formats the message using version. */
    desktopRelaunched: (version) => `桌面应用已重启至 ${version}。`,
    /** Formats the message using version. */
    reconnected: (version) => `已重新连接至 t3@${version}。`,
    /** Formats the message using serverLabels. */
    confirmDesktopUpdates: (serverLabels) =>
      `要更新 ${serverLabels} 上的T3 Code桌面应用吗？这些应用将在对应设备上关闭并重新启动。`,
    /** Formats the message using serverLabel. */
    namedUpdateError: (serverLabel) => `${serverLabel} 更新失败`,
    updateCommandCopied: "已复制更新命令",
    relaunchCommandCopied: "已复制重启命令",
    /** Formats the message using command, serverLabel. */
    runUpdateHint: (command, serverLabel) =>
      `在 ${serverLabel} 上运行 \`${command}\`，然后按常用选项重启 t3。`,
    /** Formats the message using serverLabel, command. */
    runRelaunchHint: (serverLabel, command) =>
      `停止 ${serverLabel} 上的 t3，然后使用相同子命令和选项运行 \`${command}\` 以重新启动。此操作不会更新已安装的 t3 命令。`,
    copyCommandError: "无法复制更新命令",
    /** Formats the message using serverLabel. */
    confirmDesktopUpdate: (serverLabel) =>
      `要更新运行 ${serverLabel} 的T3 Code桌面应用吗？该应用将在对应设备上关闭并重新启动。`,
    updateDesktopHint: "请更新该设备上的桌面应用，以更新此服务器。",
    copyUpdateCommand: "复制更新命令",
    copyRelaunchCommand: "复制重启命令",
    /** Formats the message using actionLabel, serverLabel. */
    actionForServer: (actionLabel, serverLabel) => `${actionLabel}：${serverLabel}`,
    versionMismatch: "版本不一致。请将客户端和服务器同步到相同的T3 Code版本。",
    updateDesktop: "更新桌面应用",
    updateToSync: "更新以保持同步",
    /** Formats the message using message, hint. */
    mismatchHint: (message, hint) => `${message} 提示：${hint}`,
  },
  requests: {
    /** Describes the waiting request count and the elapsed threshold in seconds. */
    slowDescription: (count, thresholdSeconds) =>
      `${count} 个请求的等待时间已超过 ${thresholdSeconds} 秒。`,
    started: "开始于",
    hide: "隐藏请求",
    show: "显示请求",
    slowTitle: "部分请求响应缓慢",
  },
  thread: {
    thisThread: "此对话",
    /** Formats the message using title. */
    accessibleLabel: (title) => `对话，${title}`,
    open: "打开对话",
    unavailable: "对话已不可用",
    completed: "对话已完成",
    approvalNeeded: "需要批准",
    failed: "对话失败",
    inputNeeded: "需要输入",
    changeDenied: "此连接无权更改对话。",
    archiveActiveError: "Provider运行时无法归档。",
    settleUnsupported: "此环境的服务器尚不支持完结功能。请更新服务器后使用。",
    snoozeUnsupported: "此环境的服务器尚不支持暂缓功能。请更新服务器后使用。",
    snoozeBlocked: "此对话正在等待你处理。请先响应待处理请求，再暂缓对话。",
    autoSettleUnsupported: "此环境的服务器尚不支持为单个对话关闭自动完结。请更新服务器后使用。",
    pinUnsupported: "此环境的服务器尚不支持置顶功能。请更新服务器后使用。",
    pinReorderUnsupported: "此环境的服务器尚不支持调整置顶对话顺序。请更新服务器后使用。",
    reorderUnsupported: "请更新此环境的服务器，以调整活动对话顺序。",
    /** Formats the message using title. */
    confirmUnpin: (title) => `要取消对话“${title}”的置顶吗？`,
    unpinHint: "这会将对话移出置顶区域。",
    deleteNavigationError: "对话已删除，但导航失败",
    undoArchiveError: "撤销归档失败",
    onlyWorktreeThread: "只有此对话关联了该worktree：",
    deleteWorktreeQuestion: "是否同时删除worktree？",
    removeWorktreeDenied: "此连接已无权移除worktree。",
    deleteWorktreeError: "删除worktree失败",
    worktreeRefreshError: "worktree已删除，但Git状态刷新失败",
    /** Formats the message using path, message. */
    removeWorktreeError: (path, message) => `无法移除 ${path}。${message}`,
    undoUnpinError: "撤销取消置顶失败",
    undoSettleError: "撤销完结失败",
    loadingMessages: "正在加载消息...",
    syncingMessages: "正在同步消息...",
  },
  context: {
    /** Formats the message using label. */
    showDetails: (label) => `${label}。显示详情`,
    /** Formats the message using kindLabel, label, title. */
    open: (kindLabel, label, title) => `打开${kindLabel} ${label}：${title}`,
    /** Formats the message using name, size. */
    imageAttachment: (name, size) => `图片附件，${name}，${size}`,
    /** Formats the message using label. */
    unavailable: (label) => `上下文不可用，${label}`,
  },
  clipboard: {
    branchName: "分支名称",
    updateCommand: "更新命令",
    relaunchCommand: "重启命令",
    copied: "已复制！",
    failed: "复制失败",
    copiedError: "已复制错误",
    copyError: "复制错误",
  },
  color: {
    /** Names the saturation and brightness control for the supplied color label. */
    saturationAndBrightness: (label) => `${label}饱和度和亮度`,
    instructions:
      "使用方向键调整当前值。按住 Shift 可加大步长。使用 Home 和 End 设置最小值和最大值。按 Tab 在饱和度与亮度之间切换。",
    saturation: "饱和度",
    brightness: "亮度",
  },
  sidebar: {
    title: "侧边栏",
    description: "显示移动端侧边栏。",
    toggle: "切换侧边栏",
    resize: "调整侧边栏大小",
    dragResize: "拖动以调整侧边栏大小",
  },
  details: {
    show: "显示详情",
    hide: "隐藏详情",
  },
  notifications: {
    dismiss: "关闭通知",
    off: "关闭",
    only: "仅通知",
    soundOnly: "仅声音",
    withSound: "通知和声音",
  },
  wizard: {
    progress: "设置进度",
    /** Formats the message using label, stepNumber, summarySuffix. */
    step: (label, stepNumber, summarySuffix) => `${label}，第 ${stepNumber} 步${summarySuffix}`,
  },
  editor: {
    fallback: "编辑器",
    open: "在编辑器中打开",
    /** Formats the message using editorLabel. */
    openNamed: (editorLabel) => `在 ${editorLabel} 中打开`,
    /** Formats the message using targetPath. */
    noEnvironment: (targetPath) => `无法打开 ${targetPath}，因为未选择环境。`,
    /** Formats the message using targetPath, environmentId. */
    noAvailable: (targetPath, environmentId) =>
      `环境 ${environmentId} 中没有可打开 ${targetPath} 的编辑器。`,
    openDenied: "此连接无权在此环境中打开编辑器。",
  },
  settings: {
    serverRequired:
      "此设置保存在服务器上，但托管应用未指定服务器。请从桌面应用或服务器自己的地址更改。",
    notSaved: "设置未保存",
    permissionDenied: "此连接无权更改这些设置。",
    updateServers: "请更新旧版本服务器以保存此设置。",
  },
  upload: {
    /** Formats the message using status. */
    rejected: (status) => `上传被拒绝（${status}）`,
    failed: "上传失败",
    timeout: "上传超时",
    cancelled: "已取消上传",
    denied: "此连接无权上传附件。",
    expired: "上传的文件已过期。请移除后重新附加。",
    verifyError: "无法验证上传的文件。请在服务器重新连接后重试。",
    unsupportedImage: "不支持此图片类型",
    originalMissing: "原始文件已不可用",
    startError: "无法开始上传",
    disconnected: "未连接",
    retrySingle: "请重试或移除上传失败的附件",
    retryMultiple: "请重试或移除上传失败的附件",
    uploadingSingle: "附件仍在上传",
    uploadingMultiple: "附件仍在上传",
    readDataError: "无法读取图片数据。",
    readImageError: "读取图片失败。",
  },
  boot: {
    loadError: "无法加载T3 Code。",
    reload: "重新加载",
  },
  draft: {
    restoreError: "恢复草稿失败",
    newContent: "草稿已有新内容。",
  },
  colors: {
    gray: "灰色",
    red: "红色",
    orange: "橙色",
    amber: "琥珀色",
    yellow: "黄色",
    lime: "青柠色",
    green: "绿色",
    emerald: "翡翠色",
    teal: "蓝绿色",
    cyan: "青色",
    sky: "天蓝色",
    blue: "蓝色",
    indigo: "靛蓝色",
    violet: "紫罗兰色",
    purple: "紫色",
    fuchsia: "紫红色",
    pink: "粉色",
    rose: "玫瑰色",
  },
  plan: {
    previewUnavailable: "计划预览不可用。",
  },
  themeImport: {
    /** Formats the library read error for the supplied storage key. */
    libraryReadFailed: (storageKey) => `无法从 ${storageKey} 读取主题库。`,
    /** Formats the library write error for the supplied storage key. */
    libraryWriteFailed: (storageKey) => `无法将主题库写入 ${storageKey}。`,
    malformedDetails: "Open VSX 返回的主题详情格式有误。",
    responseTimeout: "Open VSX 响应超时。",
    searchUnavailable: "Open VSX 搜索暂时不可用。",
    responseTooLarge: "Open VSX 返回的响应过大。",
    unreadableResponse: "无法读取 Open VSX 返回的响应。",
    unreadableSearch: "无法读取 Open VSX 返回的搜索结果。",
    detailsUnavailable: "Open VSX 主题详情不可用。",
    detailTooLarge: "Open VSX 返回的详情响应过大。",
    manifestTooLarge: "Open VSX 返回的清单过大。",
    unreadableDetails: "无法读取 Open VSX 返回的主题详情。",
    detailsUnavailableNow: "Open VSX 主题详情暂时不可用。",
    extensionManifest: "扩展清单",
    noZipDirectory: "该扩展包没有 ZIP 目录。",
    invalidZipDirectory: "该扩展包的 ZIP 目录无效。",
    tooManyFiles: "该扩展包的文件过多。",
    unsupportedZip64: "该扩展包包含不支持的 ZIP64 元数据。",
    expandedSizeLimit: "该扩展包解压后的大小超出安全导入限制。",
    unsafeCompressionRatio: "该扩展包的压缩比超出安全范围。",
    downloadFailed: "无法下载该 Open VSX 主题。",
    extensionTooLarge: "该主题扩展过大，无法安全导入。",
    unreadableManifest: "该 Open VSX 扩展没有可读取的清单。",
    extensionManifestTooLarge: "该 Open VSX 扩展清单过大。",
    noColorThemes: "该扩展不含颜色主题。",
    tooManyColorThemes: "该扩展包含的颜色主题过多，无法安全导入。",
    unreadableChecksum: "该 Open VSX 主题没有可读取的校验和。",
    invalidChecksumResponse: "该 Open VSX 校验和响应无效。",
    invalidChecksum: "该 Open VSX 主题的校验和无效。",
    integrityCheckFailed: "该 Open VSX 主题未通过完整性校验。",
    packageOpenFailed: "无法打开该 Open VSX 扩展包。",
    packageMismatch: "该扩展包与所选 Open VSX 主题不匹配。",
    licenseMismatch: "该扩展包与其声明的许可证不匹配。",
    unsafeThemes: "该扩展中有颜色主题无法安全导入。",
    noCompatibleThemes: "该扩展没有兼容的颜色主题。",
    emptyCollection: "主题集合不能为空。",
    invalidCollection: "该主题集合无效。",
    installedThemesChanged: "下载此扩展包期间，已安装的主题发生了变化。请重试。",
    colorsObjectRequired: "主题颜色必须是对象。",
    colorRoleRequired: "请在主题文件中至少添加一个颜色角色。",
    jsonObjectRequired: "主题文件必须包含一个 JSON 对象。",
    nameRequired: "主题文件需要一个名称（不超过 48 个字符）。",
    appearanceRequired: '主题文件的 appearance 必须为 "light" 或 "dark"。',
    colorsRequired: "主题文件需要一个 colors 对象。",
    invalidId: "主题 ID 只能包含小写字母、数字和连字符。",
    collectionMetadataRequired: "主题集合需要有效的 ID 和标签。",
    variantsObjectRequired: "主题变体必须是一个对象。",
    variantNames: '主题变体只能命名为 "light" 或 "dark"。',
    missingEditorBackground: '该 VS Code 主题没有 "editor.background" 颜色，无法据此构建调色板。',
    /** Formats the error using the supplied description. */
    invalidJson: (description) => `${description} 不是有效的 JSON。`,
    /** Formats the error using the supplied description. */
    missingPackageFile: (description) => `扩展包中缺少${description}。`,
    /** Formats the error using the supplied description. */
    unreadableSize: (description) => `无法读取${description}的大小元数据。`,
    /** Formats the error using the supplied description. */
    fileTooLarge: (description) => `${description}过大。`,
    /** Formats the error using the supplied id. */
    reservedId: (id) => `主题 ID "${id}" 为保留名称。`,
    /** Formats the error using the supplied label. */
    alreadyInstalled: (label) => `名为 "${label}" 的主题已安装。`,
    /** Formats the error using the supplied label. */
    notInstalled: (label) => `主题 "${label}" 尚未安装。`,
    /** Formats the error using the supplied role. */
    unsupportedColorRole: (role) => `不支持主题颜色角色 "${role}"。`,
    /** Formats the error using the supplied role. */
    literalColorRequired: (role) =>
      `"${role}" 的颜色必须是 CSS 颜色字面量，例如 oklch(0.62 0.2 280)。`,
    /** Formats the error using the supplied version. */
    unsupportedVersion: (version) => `不支持此主题文件的版本。需要版本 ${version}。`,
    /** Formats the error using the supplied appearance. */
    repeatedAppearance: (appearance) => `主题变体不能重复基础外观 "${appearance}"。`,
  },
};
