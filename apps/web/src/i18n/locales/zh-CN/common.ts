/** Shared Chinese UI labels checked at the literal declaration. */
import type { Messages } from "../en";

export const common: Messages["common"] = {
  system: "系统默认",
  resetToDefault: "恢复默认值",
  /** Builds a complete Chinese reset action name from the setting's UI label. */
  resetLabelToDefault: (label) => `将${label}恢复为默认值`,

  threadActions: {
    /** Formats an already localized snooze preset and wake time. */
    snoozePreset: (label, time) => `${label}（${time}）`,
    copy: "复制",
    path: "路径",
    branch: "分支",
    projectSettings: "项目设置",
    discardDraft: "丢弃草稿",
    /** Formats the newThreadOnBranch message from the supplied branch. */
    newThreadOnBranch: (branch) => `在 ${branch} 上新建对话`,
    unpin: "取消对话置顶",
    pin: "置顶对话",
    unsettle: "恢复对话",
    settle: "完结对话",
    wake: "唤醒对话",
    snooze: "暂缓",
    customSnooze: "自定义…",
    rename: "重命名对话",
    regeneratingTitle: "正在重新生成…",
    regenerateTitle: "重新生成标题",
    markUnread: "标为未读",
    showAllProjects: "显示全部项目",
    /** Formats the filterByProject message from the supplied label. */
    filterByProject: (label) => `按 ${label} 筛选`,
    autoSettle: "自动完结行为",
    enabled: "已启用",
    disabled: "已禁用",
    threadId: "对话ID",
    archive: "归档对话",
    delete: "删除",
  },
  threadStatus: {
    states: {
      open: "开放",
      draft: "草稿",
      closed: "已关闭",
      merged: "已合并",
    },
    changeRequest: "变更请求",
    /** Formats a PR/MR status heading with its number and displayed state. */
    pullRequestLead: (shortName, number, stateLabel) => `${shortName} #${number}－${stateLabel}`,
    /** Formats a compact PR/MR status label. */
    pullRequestLabel: (shortName, stateLabel) => `${shortName}${stateLabel}`,
    /** Appends the unmodified PR title to its status heading. */
    pullRequestTooltip: (lead, title) => `${lead}：${title}`,
    stack: "堆叠",
    /** Formats the stackSummary message from the supplied count, label. */
    stackSummary: (count, label) => `${count} 个拉取请求组成的堆叠，${label}`,
    /** Formats the pendingPullRequest message from the supplied number. */
    pendingPullRequest: (number) => `PR #${number}，等待状态`,
    /** Formats the linkedSummary message from the supplied tooltip, otherCount, label. */
    linkedSummary: (tooltip, otherCount, label) =>
      `${tooltip}，另有关联 ${otherCount} 个；总体为${label}`,
    chain: "链",
    terminalRunning: "终端进程正在运行",
    /** Formats the worktreeBranch message from the supplied path, branch. */
    worktreeBranch: (path, branch) => `对话的worktree：${path}（${branch}）`,
    /** Formats the worktree message from the supplied path. */
    worktree: (path) => `worktree：${path}`,
    remote: "远程",
  },
  desktopUpdate: {
    correctArchitecture: "此安装使用的是正确的架构。",
    appleSiliconDownloadHint:
      "此Mac使用Apple芯片，但T3 Code仍在通过Rosetta运行Intel版本。请下载可用更新以切换到原生Apple芯片版本。",
    appleSiliconInstallHint:
      "此Mac使用Apple芯片，但T3 Code仍在通过Rosetta运行Intel版本。请重启以安装已下载的Apple芯片版本。",
    appleSiliconNextUpdateHint:
      "此Mac使用Apple芯片，但T3 Code仍在通过Rosetta运行Intel版本。下次应用更新时会替换为原生Apple芯片版本。",
    /** Formats the availableTooltip message from the supplied version. */
    availableTooltip: (version) => `更新 ${version ?? ""} 可供下载`,
    /** Formats the downloadingTooltip message from the supplied percent. */
    downloadingTooltip: (percent) =>
      `正在下载更新${typeof percent === "number" ? `（${Math.floor(percent)}%）` : ""}`,
    /** Formats the downloadedTooltip message from the supplied version. */
    downloadedTooltip: (version) => `更新 ${version ?? ""} 已下载。点击重启并安装。`,
    /** Formats the downloadError message from the supplied version. */
    downloadError: (version) => `${version} 下载失败。点击重试。`,
    /** Formats the installError message from the supplied version. */
    installError: (version) => `${version} 安装失败。点击重试。`,
    updateError: "更新失败",
    upToDate: "已是最新版本",
    /** Formats the installConfirmation message from the supplied version. */
    installConfirmation: (version) =>
      `要安装更新${version ? ` ${version}` : ""}并重启T3 Code吗？\n\n所有正在运行的任务都会被中断。请确认准备就绪后再继续。`,
    releaseNotesError: "无法打开发行说明",
    readMore: "了解更多",
    downloadedToast: "更新已下载",
    restartHint: "请通过更新按钮重启应用以完成安装。",
  },
  providerUpdate: {
    /** Joins provider display names in their supplied order. */
    providerList: (names) =>
      names.length <= 2
        ? names.join("和")
        : `${names.slice(0, -1).join(", ")} 和 ${names[names.length - 1]}`,
    /** Formats the update result for the number of affected providers. */
    finished: (count) => (count === 1 ? "Provider已更新" : "Provider更新已完成"),
    /** Formats the update result for the number of affected providers. */
    unchanged: (_count) => "Provider仍需更新",
    /** Formats the update result for the number of affected providers. */
    updateError: (_count) => "Provider更新失败",
    /** Formats the update result for the number of affected providers. */
    updating: (_count) => "正在更新provider",
    /** Formats the update result for the number of affected providers. */
    newSessionsHint: (_count) => "新会话将使用更新后的provider。",
    /** Formats the updatedVersion message from the supplied providerName, version. */
    updatedVersion: (providerName, version) => `${providerName} 已更新：${version}`,
    /** Formats the updatedProvider message from the supplied providerName. */
    updatedProvider: (providerName) => `${providerName} 已更新`,
    /** Formats the failedVersion message from the supplied providerName, version. */
    failedVersion: (providerName, version) => `${providerName} ${version} 更新失败`,
    /** Formats the failedProvider message from the supplied providerName. */
    failedProvider: (providerName) => `${providerName} 更新失败`,
    installHint: "立即安装更新，或查看provider设置。",
    /** Formats the settingsHint message from the supplied names. */
    settingsHint: (names) => `可在provider设置中更新 ${names}。`,
    runningHint: "正在运行provider更新命令。",
    /** Formats the unchangedHint message from the supplied names, count. */
    unchangedHint: (names, _count) => `${names} 似乎仍未更新。请在provider设置中查看详情。`,
    updateFallbackError: "Provider更新失败。",
    unfinishedError: "Provider更新未完成。",
    /** Formats the updatedCount message from the supplied count. */
    updatedCount: (count) => `${count} 个Provider已更新`,
    /** Formats the partialFailure message from the supplied failedCount, totalCount. */
    partialFailure: (failedCount, totalCount) =>
      `${totalCount} 个Provider更新中有 ${failedCount} 个失败`,
    /** Formats the updatingNamedProvider message from the supplied providerName. */
    updatingNamedProvider: (providerName) => `正在更新 ${providerName}`,
    /** Formats the updatingCount message from the supplied count. */
    updatingCount: (count) => `正在更新 ${count} 个Provider`,
    /** Formats the progressHint message from the supplied names, count. */
    progressHint: (names, _count) => `${names} 正在更新。`,
    /** Formats the failedCount message from the supplied count. */
    failedCount: (count) => `${count} 个Provider更新失败`,
    /** Formats the unchangedNamedProvider message from the supplied providerName. */
    unchangedNamedProvider: (providerName) => `${providerName} 仍需更新`,
    /** Formats the unchangedCount message from the supplied count. */
    unchangedCount: (count) => `${count} 个Provider仍需更新`,
    /** Formats the reviewUnchangedHint message from the supplied names, count. */
    reviewUnchangedHint: (names, _count) => `${names} 仍然显示为版本过旧。详情请查看Provider设置。`,
    /** Formats the availableProvider message from the supplied providerName, version. */
    availableProvider: (providerName, version) => `有可用更新：${providerName} ${version}`,
    /** Formats the availableCount message from the supplied count. */
    availableCount: (count) => `${count} 个Provider有可用更新`,
    /** Formats the failedHint message from the supplied names. */
    failedHint: (names) => `${names} 更新失败。详情请查看Provider设置。`,
    updatedStatus: "已更新",
    updatingStatus: "正在更新…",
  },
  permissions: {
    operateDeniedError: "此连接无权更改对话或项目。",
  },
  clipboard: {
    /** Formats the copyUnavailableError message from the supplied target. */
    copyUnavailableError: (target) => `复制 ${target} 时，剪贴板API不可用。`,
    /** Formats the copyError message from the supplied target. */
    copyError: (target) => `无法将 ${target} 复制到剪贴板。`,
    /** Formats the readUnavailableError message from the supplied target. */
    readUnavailableError: (target) => `读取 ${target} 时，剪贴板API不可用。`,
    /** Formats the readError message from the supplied target. */
    readError: (target) => `无法从剪贴板读取 ${target}。`,
    text: "文本",
  },
  confirm: {
    title: "确认操作",
    description: "此操作需要你确认。",
    cancel: "取消",
    confirm: "确认",
  },
  timestamp: {
    justNow: "刚刚",
    ago: "前",
    left: "后",
    expired: "已到期",
    soon: "即将到期",
    expiresSoon: "即将到期",
    yesterday: (time) => `昨天 ${time}`,
    tomorrow: (time) => `明天 ${time}`,
    expiresIn: (duration) => `${duration}后到期`,
    seconds: (count) => `${count}秒`,
    minutes: (count) => `${count}分钟`,
    hours: (count) => `${count}小时`,
    days: (count) => `${count}天`,
    tooltip: (time, day, month, year) => `${year}年${month}月${day}日 ${time}`,
  },
};
