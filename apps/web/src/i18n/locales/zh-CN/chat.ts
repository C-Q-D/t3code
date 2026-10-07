/** Chinese chat messages checked at the literal declaration. */
import type { Messages } from "../en";

export const chat: Messages["chat"] = {
  /** Formats a conversation count without an English plural branch. */
  threadCount: (count) => `${count} 个对话`,

  rightPanel: {
    /** Formats a generated terminal fallback label; caller-supplied session labels bypass it. */
    terminalLabel: (label) => label.replace(/^Terminal (\d+)$/, "终端$1"),
    browserDisabled: "浏览器预览仅在T3 Code桌面应用中可用。",
    terminalDisabled: "终端面板仅在项目对话中可用。",
    filesDisabled: "打开项目后才能使用文件功能。",
    diffDisabled: "差异仅适用于Git仓库中的服务端对话。",
    pullRequestDisabled: "此对话的分支尚无拉取请求。",
    pullRequestsDisabled: "此对话没有关联的拉取请求。",
    deviceDisabled: "设备仅在对话中可用。",
    browserHint: "仅在桌面应用中可用。",
    projectHint: "打开项目后可用。",
    gitHint: "适用于Git仓库。",
    pullRequestHint: "此分支尚无拉取请求。",
    pullRequestsHint: "没有关联的拉取请求。",
    deviceHint: "在对话中可用。",
    unmuteTab: "取消标签页静音",
    muteTab: "静音标签页",
    browser: "浏览器",
    terminal: "终端",
    files: "文件",
    diff: "差异",
    pullRequest: "拉取请求",
    linkedPullRequests: "关联的拉取请求",
    device: "设备",
    deviceDescription: "查看iOS模拟器或Android模拟器。",
    openSurface: "打开面板",
    openBrowserProfile: "在配置中打开浏览器",
    pullRequests: "拉取请求",
    rename: "重命名",
    copyPath: "复制路径",
    close: "关闭",
    closeOthers: "关闭其他标签页",
    closeToRight: "关闭右侧标签页",
    closeAll: "关闭全部标签页",
    /** Formats the closeTab message from the supplied title. */
    closeTab: (title) => `关闭 ${title}`,
    /** Formats the unmuteNamedTab message from the supplied title. */
    unmuteNamedTab: (title) => `取消 ${title} 静音`,
    /** Formats the muteNamedTab message from the supplied title. */
    muteNamedTab: (title) => `静音 ${title}`,
    deviceTabName: "设备标签页名称",
    addSurface: "添加面板",
    scrollTabs: "滚动面板标签页",
    scrollLeft: "向左滚动标签页",
    scrollRight: "向右滚动标签页",
    deviceHost: "设备主机",
  },
  branchToolbar: {
    submodules: {
      recursive: "递归",
      "top-level": "仅顶层",
      none: "跳过",
    },
    thisDevice: "此设备",
    newWorktree: "新建worktree",
    currentCheckout: "当前检出",
    currentWorktree: "当前worktree",
    worktree: "Worktree",
    localCheckout: "本地检出",
    /** Formats the previousWorktreeBranch message from the supplied branch. */
    previousWorktreeBranch: (branch) => `之前的worktree（${branch}）`,
    previousWorktree: "之前的worktree",
    selectRef: "选择ref",
    /** Formats the fromRef message from the supplied ref. */
    fromRef: (ref) => `基于 ${ref}`,
    runOn: "运行于",
    autoBalance: "自动均衡",
    workspace: "工作区",
    genericError: "发生错误。",
    loadingRefs: "正在加载ref…",
    loadingMoreRefs: "正在加载更多ref…",
    /** Formats the showingRefs message from the supplied shownCount, totalCount. */
    showingRefs: (shownCount, totalCount) => `显示 ${shownCount} / ${totalCount} 个ref`,
    branchName: "分支名称",
    branchCopiedToast: "已复制分支名",
    copyBranchError: "复制分支名失败",
    copyBranch: "复制分支名",
    actionUnavailableToast: "操作不可用",
    branchDeniedError: "此连接无法更改对话的分支。",
    switchRefError: "切换ref失败。",
    createRefError: "创建并切换ref失败。",
    /** Formats the checkoutChangeRequest message from the supplied kind. */
    checkoutChangeRequest: (kind) =>
      `检出 ${kind === "gitlab" ? "合并请求" : kind === "unknown" ? "变更请求" : "拉取请求"}`,
    /** Formats the createRef message from the supplied ref. */
    createRef: (ref) => `新建ref "${ref}"`,
    openPullRequest: "打开拉取请求",
    create: "创建",
    copyFullPath: "复制完整路径",
    workspacePath: "工作区路径",
    pathCopiedToast: "已复制路径",
    copyPathError: "复制路径失败",
    modelWorktreeHint: "每个模型都在独立的worktree中启动。",
  },
  header: {
    emptyTitleError: "对话标题不能为空",
    renameError: "重命名对话失败",
    genericError: "发生错误。",
    projectSettings: "项目设置",
    breadcrumb: "对话导航路径",
    /** Formats the newThread message from the supplied projectName. */
    newThread: (projectName) => `在 ${projectName} 中新建对话`,
    threadTitle: "对话标题",
    /** Formats the threadActions message from the supplied title. */
    threadActions: (title) => `${title} 的对话操作`,
  },
};
