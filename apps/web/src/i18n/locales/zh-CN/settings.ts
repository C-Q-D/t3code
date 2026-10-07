/** Chinese settings messages checked at the literal declaration. */
import type { Messages } from "../en";

export const settings: Messages["settings"] = {
  sections: {
    appearanceLanguage: "语言",
    organization: "组织方式",
    behavior: "行为",
    projectsAndThreads: "项目与对话",
    confirmations: "确认操作",
    textGeneration: "文本生成",
    about: "关于",
    diagnostics: "诊断",
  },
  rows: {
    language: {
      title: "语言",
      description: "选择此设备的界面语言。切换后页面会刷新。",
      ariaLabel: "语言",
      reset: "将语言恢复为跟随系统",
      options: {
        system: "跟随系统",
      },
      saveError: "语言设置未保存",
      saveErrorDescription: "浏览器无法保存语言设置，请重试。",
    },
    timeFormat: {
      title: "时间格式",
      description: "系统默认使用浏览器或操作系统的时钟格式。",
      ariaLabel: "时间格式",
      options: {
        twelveHour: "12 小时制",
        twentyFourHour: "24 小时制",
      },
    },
    storageWorktrees: {
      title: "worktree清理",
    },
    storageWorktreesLocation: {
      title: "worktree位置",
    },
    storageArtifacts: {
      title: "产物和日志",
    },
    projectDefaults: {
      title: "项目默认值和覆盖值",
    },
    projectOverview: {
      title: "项目概览",
    },
    defaultModel: {
      title: "默认模型",
    },
    defaultPermissions: {
      title: "权限",
    },
    colorScheme: {
      title: "配色方案",
    },
    theme: {
      title: "主题",
    },
    settingAppearanceContrast: {
      title: "对比度",
    },
    settingGlassOpacity: {
      title: "玻璃不透明度",
    },
    diffColorScheme: {
      title: "差异颜色",
    },
    chatWidth: {
      title: "聊天宽度",
    },
    panelAnimations: {
      title: "面板动画",
    },
    environmentIdentification: {
      title: "环境标识",
    },
    interfaceFont: {
      title: "界面字体",
    },
    promptFont: {
      title: "提示词字体",
    },
    codeFont: {
      title: "代码字体",
    },
    terminalFont: {
      title: "终端字体",
    },
    fontSmoothing: {
      title: "字体平滑",
    },
    wordWrap: {
      title: "自动换行",
    },
    composerContext: {
      title: "输入框上下文",
    },
    projectGrouping: {
      title: "项目分组",
      description: "合并不同环境中的相同仓库。",
      resetLabel: "项目分组",
      ariaLabel: "项目分组",
    },
    projectOrder: {
      title: "项目排序",
      options: {
        updated_at: "最后一条用户消息",
        created_at: "创建时间",
        manual: "手动",
      },
      description: "侧边栏项目选择器和命令面板中的项目顺序。",
      resetLabel: "项目排序",
      ariaLabel: "项目排序",
    },
    snoozeLimitedThreads: {
      title: "稍后处理受限对话",
      description:
        "将因用量限制而停止的对话设为稍后处理，直到报告的配额重置时间。结合自动恢复，可在唤醒时继续。",
      ariaLabel: "稍后处理受限对话",
    },
    autoResumeLimitedThreads: {
      title: "自动恢复受限对话",
      description:
        "在报告的配额重置时间恢复因用量限制而停止的对话。每个对话都可取消计划的继续操作。",
      ariaLabel: "自动恢复受限对话",
    },
    workingShelf: {
      title: "处理中分区（测试版）",
      description: "将工作中和监控中的对话收进“处理中”分区。需要你处理时，它们会返回收件箱顶部。",
      resetLabel: "处理中分区",
      ariaLabel: "处理中分区（测试版）",
    },
    autoSettleInactiveThreads: {
      title: "自动完结不活跃对话",
      description: "侧边栏中超过此时间没有活动的对话会自动完结。",
      resetLabel: "自动完结",
      ariaLabel: "自动完结不活跃对话",
    },
    autoSettleMergedThreads: {
      title: "自动完结已合并对话",
      description: "拉取请求合并时完结对话。已关闭的拉取请求仍会自动完结对话。",
      resetLabel: "合并时自动完结",
      ariaLabel: "自动完结已合并对话",
    },
    daysBeforeAutoSettle: {
      title: "自动完结前的不活跃天数",
      description: "任何新活动都会自动恢复对话。",
    },
    threadNotifications: {
      title: "对话通知",
    },
    inAppNotifications: {
      title: "应用内通知",
      description: "应用处于焦点时，其他对话完成、失败或需要输入或批准时显示提示。",
      ariaLabel: "应用内通知",
    },
    responseStreaming: {
      title: "流式回复",
      options: {
        turn: "等待完整回复",
        paragraph: "显示已完成的段落",
      },
      descriptions: {
        turn: "Agent完成本轮后显示文字。",
        paragraph: "每个段落或代码块完成后立即显示。",
      },
      mixedHint: "所选目标使用不同的流式模式。",
      resetLabel: "流式回复",
      ariaLabel: "流式回复",
    },
    hideWhitespaceChanges: {
      title: "隐藏空白字符更改",
      description: "设置差异面板是否默认忽略仅含空白的更改。",
      resetLabel: "差异空白更改",
      ariaLabel: "默认隐藏空白更改",
    },
    defaultDiffFileState: {
      title: "默认差异文件状态",
      description: "打开差异或拉取请求的“代码”标签页时，默认展开或收起文件。",
      resetLabel: "默认差异文件状态",
      ariaLabel: "默认差异文件状态",
      options: {
        collapsed: "已收起",
        expanded: "已展开",
      },
    },
    diffLayout: {
      title: "差异布局",
      options: {
        stacked: "上下排列",
        split: "左右排列",
      },
      description: "上下排列或左右排列差异。差异工具栏中的开关也可更改此设置。",
      resetLabel: "差异布局",
      ariaLabel: "差异布局",
    },
    proactivePanels: {
      title: "自动打开面板",
      description: "优先打开关联的拉取请求。否则，更改至少3个文件或50行时打开“更改”面板。",
      resetLabel: "自动打开面板",
      ariaLabel: "自动打开面板",
    },
    skillsInSlashMenu: {
      title: "在斜杠菜单中显示技能",
      description: "在 / 命令菜单中包含技能。输入 $ 时始终显示技能。",
      resetLabel: "斜杠菜单中的技能",
      ariaLabel: "在斜杠菜单中显示技能",
    },
    composerRichText: {
      title: "富文本输入框",
      description: "输入时显示格式化Markdown。",
      resetLabel: "富文本输入框",
      ariaLabel: "富文本输入框",
    },
    composerCollapse: {
      title: "滚动时收起输入框",
      description: "滚动已有对话时，将输入框收起为一行。聚焦输入框或开始输入即可再次展开。",
      resetLabel: "滚动时收起输入框",
      ariaLabel: "滚动时收起输入框",
    },
    sendShortcut: {
      title: "发送快捷键",
      description: "选择Enter何时发送提示词或插入换行",
      resetLabel: "发送快捷键",
      ariaLabel: "发送快捷键",
      options: {
        multiline: (modifier: string) => `多行提示词使用 ${modifier} + Enter`,
        always: (modifier: string) => `始终使用 ${modifier} + Enter`,
      },
    },
    followUpBehavior: {
      title: "后续消息行为",
      resetLabel: "后续消息行为",
      ariaLabel: "后续消息行为",
      options: {
        queue: "排队",
        steer: "引导",
      },
      description: (modifier: string, shortcut: string) =>
        "Agent运行时，将后续消息排队或用于引导当前运行。" +
        (shortcut === "mod-enter-multiline"
          ? `单行提示词按 ${modifier} + Enter，多行提示词按 ${modifier} + Shift + Enter，可对单条消息执行相反操作。`
          : `按 ${modifier}${shortcut === "mod-enter" ? " + Shift" : ""} + Enter，可对单条消息执行相反操作。`),
    },
    providerUpdateChecks: {
      title: "Provider更新检查",
      description: "检查已安装ProviderCLI是否有新版本。",
      resetLabel: "Provider更新检查",
      ariaLabel: "检查Provider版本",
    },
    continueThreadsAfterServerUpdate: {
      title: "重启后继续对话",
      description: "在所选环境更新、崩溃或机器重启后，自动恢复中断的对话。",
      unsupportedHint: "所有已连接的所选环境都必须支持重启后继续。",
      resetLabel: "重启后继续对话",
      ariaLabel: "重启后继续对话",
    },
    backgroundActivity: {
      title: "后台活动",
      options: {
        balanced: "均衡",
        performance: "性能优先",
        "battery-saver": "省电",
        advanced: "高级",
      },
      descriptions: {
        balanced: "客户端空闲、主机锁定或低电量模式下暂停探测。",
        performance: "有订阅客户端保持连接时，允许范围内的后台探测。",
        "battery-saver": "主机或客户端使用电池时，也暂停后台探测。",
      },
      policyTooltip:
        "此共享策略在各自间隔到期后，控制Git刷新和Provider健康探测等后台任务是否可运行。",
      resetLabel: "后台活动",
      ariaLabel: "后台活动配置",
      configureAriaLabel: "配置高级后台活动",
      configureTooltip: "配置后台活动",
      advancedDescription: (profile: string) => `使用自定义间隔。 共享策略：${profile}。`,
      advancedEnvironmentHint: (label: string) => `${label}（一个环境）`,
    },
    newThreads: {
      title: "新对话",
    },
    worktreeSubmodules: {
      title: "子模块",
    },
    startFromOrigin: {
      title: "从origin开始",
      description: "基于origin上最新的同名分支创建worktree，而不是基于本地分支。",
      resetLabel: "新worktree从origin开始",
      ariaLabel: "默认从origin创建新worktree",
    },
    addProjectStartsIn: {
      title: "添加项目的起始位置",
      description: "留空时，“添加项目”浏览器从“~/”打开。",
      resetLabel: "添加项目的基础目录",
      ariaLabel: "添加项目的基础目录",
    },
    unpinConfirmation: {
      title: "取消置顶确认",
      description: "取消对话在置顶分区中的置顶前询问。",
      resetLabel: "取消置顶确认",
      ariaLabel: "确认取消对话置顶",
    },
    archiveConfirmation: {
      title: "归档确认",
      description: "归档对话前，需要再次点击内联归档操作。",
      resetLabel: "归档确认",
      ariaLabel: "确认归档对话",
    },
    deleteConfirmation: {
      title: "删除确认",
      description: "删除对话及其聊天历史前询问。",
      resetLabel: "删除确认",
      ariaLabel: "确认删除对话",
    },
    quitConfirmation: {
      title: "退出快捷键",
      options: {
        direct: "直接退出",
        hold: "长按",
        "double-click": "按两次",
      },
      description: "长按模式也支持快速按两次退出。",
      resetLabel: "退出快捷键行为",
      ariaLabel: "退出快捷键行为",
    },
    textGenerationModel: {
      title: "文本生成模型",
      description: "用于连接设备上此Provider的对话标题和其他生成文字。版本控制可覆盖此设置。",
      resetLabel: "文本生成模型",
      connectHint: "连接环境以选择文本生成模型。",
      empty: "没有可用的文本生成Provider。",
      saveError: "文本生成模型未保存",
    },
    privacyPolicy: {
      title: "隐私政策",
      description: "了解我们如何处理你的数据，包括T3 Code收集的匿名用量数据。",
      viewPolicy: "查看政策",
    },
    diagnostics: {
      title: "诊断",
      description: "查看此环境中的进程、资源用量和日志。",
      selectEnvironmentHint: "一次查看一个环境的进程、资源用量和日志。",
      viewDiagnostics: "查看诊断",
    },
    openSourceLicenses: {
      title: "开源许可证",
      description: "T3 Code使用的依赖、资源和可选工具的声明。",
      viewLicenses: "查看许可证",
    },
    legacyPlanMode: {
      title: "计划模式（旧版）",
    },
    legacyContextWindowIndicator: {
      title: "上下文窗口指示器（旧版）",
    },
    legacySidebar: {
      title: "侧边栏（旧版）",
    },
    keybindings: {
      title: "快捷键",
    },
    snapShotEnabled: {
      title: "快照",
    },
    snapShotAccessibility: {
      title: "包含应用文字",
    },
    snapShotShortcut: {
      title: "捕获快捷键",
    },
    snapShotSound: {
      title: "捕获声音",
    },
    snapShotFlash: {
      title: "捕获闪光",
    },
    snapShotAnimations: {
      title: "捕获动画",
    },
    providers: {
      title: "Provider",
    },
    usageProviders: {
      title: "用量Provider",
    },
    cursorKeychainUsage: {
      title: "Cursor账号用量",
    },
    providerHealthCheckInterval: {
      title: "健康检查间隔",
    },
    agentBrowserAccess: {
      title: "Agent浏览器访问",
    },
    deviceHosts: {
      title: "设备主机",
    },
    agentDeviceAccess: {
      title: "Agent设备访问",
    },
    deviceHub: {
      title: "设备中心",
    },
    devicePlatformSupport: {
      title: "模拟器支持",
    },
    browserProfiles: {
      title: "浏览器配置",
    },
    browserDefaultProfile: {
      title: "默认浏览器配置",
    },
    browserDefaultViewport: {
      title: "默认浏览器视口",
    },
    browserDefaultZoom: {
      title: "默认浏览器缩放",
    },
    browserDefaultAppearance: {
      title: "默认浏览器外观",
    },
    browserRecordingFrameRate: {
      title: "浏览器录制帧率",
    },
    browserRecordingKeyPresses: {
      title: "在录制中显示按键",
    },
    browserRecordingMousePresses: {
      title: "在录制中显示鼠标按键",
    },
    browserLinkTarget: {
      title: "打开链接的位置",
    },
    browserAutoShowFloatingPreview: {
      title: "自动显示悬浮预览",
    },
    automaticPull: {
      title: "自动拉取",
    },
    removeAgentCreditsOnMerge: {
      title: "合并时移除Agent署名",
    },
    pullRequestMergeMethod: {
      title: "默认合并方式",
    },
    sourceControl: {
      title: "版本控制",
    },
    gitFetchInterval: {
      title: "Git fetch间隔",
    },
    worktreeBranchNaming: {
      title: "worktree分支命名",
    },
    githubAccounts: {
      title: "GitHub账号和令牌",
    },
    bitbucketCredentials: {
      title: "Bitbucket凭据",
    },
    sourceControlWritingStyle: {
      title: "版本控制文案风格",
    },
    followChangeRequestTemplates: {
      title: "遵循变更请求模板",
    },
    sourceControlWriterModel: {
      title: "版本控制文案生成模型",
    },
    projectActions: {
      title: "操作",
    },
    environmentIcon: {
      title: "环境图标",
    },
    localEnvironment: {
      title: "本地环境",
    },
    networkAccess: {
      title: "网络访问",
    },
    tailscaleHttps: {
      title: "Tailscale HTTPS",
    },
    wslBackend: {
      title: "WSL后端",
    },
    t3Connect: {
      title: "T3 Connect",
    },
    holdWebhooksWhileOffline: {
      title: "离线期间保留Webhook",
    },
    publishAgentActivity: {
      title: "发布Agent活动",
    },
    connectionsEnvironment: {
      title: "此机器",
    },
    remoteEnvironments: {
      title: "环境",
    },
    loadBalancing: {
      title: "负载均衡",
    },
    githubRouting: {
      title: "GitHub共享",
    },
    archive: {
      title: "已归档对话",
    },
  },
  pages: {
    projects: "项目",
    general: "常规",
    appearance: "外观",
    keybindings: "快捷键",
    snapShot: "快照",
    providers: "Provider",
    integrations: "集成",
    scheduledTasks: "定时任务",
    sourceControl: "版本控制",
    storage: "存储",
    connections: "连接",
    archived: "归档",
    diagnostics: "诊断",
    openSourceLicenses: "开源许可证",
  },
  sidebarNav: {
    searchPlaceholder: "搜索",
    searchAriaLabel: "搜索设置",
    clearSearchAriaLabel: "清除设置搜索",
    empty: "未找到设置",
    resultsAriaLabel: "设置搜索结果",
  },
  layout: {
    backgroundPolicyAriaLabel: "后台策略详情",
    environment: "环境",
    override: "覆盖值",
    resetToInherited: "重置为继承值",
    permissionHint: "此连接无权更改环境设置。",
    reconnectHint: "重新连接所选环境以更改此设置。",
    environmentWideHint: "此设置适用于整个环境。请选择环境以更改。",
    mixedHint: "所选环境中的值不一致",
    projectOverrideHint: "此项目已覆盖",
    repositoryInheritanceHint: "继承自仓库的t3.json",
    environmentValueHint: "在环境中设置",
    builtInDefault: "内置默认值",
    inheritedFromHint: (inheritedFrom: string) => `继承自 ${inheritedFrom}`,
    primaryUnavailableHint:
      "此设置保存在服务器上，托管应用未关联服务器。请从桌面应用或服务器自身地址更改。",
  },
  breadcrumb: {
    ariaLabel: "设置面包屑导航",
    title: "设置",
  },
  scopeSentence: {
    applying: "应用于项目",
    on: "环境",
    across: "环境范围",
    environmentAriaLabel: "环境范围",
    unavailableEnvironment: "环境不可用",
    noEnvironments: "没有环境",
    allEnvironments: "全部环境",
    offline: "离线",
    projectAriaLabel: "项目范围",
    unavailableProject: "项目不可用",
    allProjects: "全部项目",
    pickerAriaLabel: (scope: string, label: string) => `${scope}：${label}`,
  },
  scopeNotice: {
    environment: "环境",
    openAllEnvironments: "打开全部环境",
    checkoutLabel: (project: string, environment: string, workspaceRoot: string) =>
      `${project}·${environment}·${workspaceRoot}`,
    environmentLabel: (label: string, address: string) => `${label}·${address}`,
  },
  general: {
    mixed: "多个值",
    appVersionDescription: "应用当前版本。",
  },
};
