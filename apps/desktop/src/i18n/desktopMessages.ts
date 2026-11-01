/** Native-shell messages only; protocol values, user content and diagnostic errors stay unchanged. */
import type { UiLocalePreference } from "@t3tools/contracts";
import type { MenuItemConstructorOptions } from "electron";
import type { MacPermission } from "../permissions/MacPermission.ts";

/** Languages bundled in the desktop shell. */
export type UiLocale = Exclude<UiLocalePreference, "system">;
type MenuRole = NonNullable<MenuItemConstructorOptions["role"]>;

const en = {
  menu: {
    file: "File",
    edit: "Edit",
    view: "View",
    speech: "Speech",
    settings: "Settings...",
    checkForUpdates: "Check for Updates...",
    pasteAsText: "Paste as Text",
    reload: "Reload",
    forceReload: "Force Reload",
    toggleDevTools: "Toggle Developer Tools",
    actualSize: "Actual Size",
    zoomIn: "Zoom In",
    zoomOut: "Zoom Out",
    // Brand the application roles on macOS; Electron supplies other platform defaults.
    roleLabels: (appName: string, platform: string): Readonly<Partial<Record<MenuRole, string>>> =>
      platform === "darwin"
        ? { about: `About ${appName}`, hide: `Hide ${appName}`, quit: `Quit ${appName}` }
        : {},
  },
  preview: {
    clipboardAllow: "Allow",
    clipboardBlock: "Block",
    clipboardRead: (origin: string) =>
      `${origin} wants to see text and images copied to the clipboard`,
    open: "Open",
    cancel: "Cancel",
    openLink: (protocol: string) => `Open this ${protocol} link?`,
    externalApplicationDetail: (url: string) =>
      `A page in the browser wants to open another application:\n\n${url}`,
    choosePasskey: "Choose a passkey",
    unnamedPasskey: "Unnamed passkey",
  },
  updates: {
    wslRemoteSwitch:
      "This desktop app also runs WSL backends, whose databases a remote switch cannot check. Switch it on that machine.",
    noBuild: (version: string) => `The desktop app found no build of ${version}.`,
    upToDateTitle: "You're up to date!",
    upToDateMessage: (version: string) =>
      `T3 Code ${version} is currently the newest version available.`,
    failedTitle: "Update check failed",
    failedMessage: "Could not check for updates.",
    unknownError: "An unknown error occurred. Please try again later.",
    unavailableTitle: "Updates unavailable",
    unavailableMessage: "Automatic updates are not available right now.",
    ok: "OK",
  },
  startup: {
    recoveryTitle: "T3 Code could not start",
    checking: "Checking for a newer version…",
    updateAvailable: (version: string) => `Version ${version} is available. It can contain a fix.`,
    updateTo: (version: string) => `Update to ${version}`,
    downloading: (version: string, percent: number | null) =>
      `Downloading ${version}${percent === null ? "" : ` (${Math.floor(percent / 10) * 10}%)`}. T3 Code restarts when the download is done.`,
    reinstall: (version: string) =>
      `Version ${version} started correctly on this computer. Download it and install it to go back.`,
    download: (version: string) => `Download ${version}`,
    releasesHint: "Get a different version from the releases page.",
    releases: "Open releases",
    copyDetails: "Copy details",
    quit: "Quit",
    noOutput: "The server wrote no output.",
    retryHint: (version: string, logDir: string) =>
      `Version ${version}. T3 Code tries again in the background. Logs: ${logDir}`,
    failedTitle: "T3 Code failed to start",
    stage: (stage: string) => `Stage: ${stage}`,
    connecting: "Connecting to WSL…",
  },
  wsl: {
    dependenciesFailed:
      'WSL server dependencies could not be loaded (for example "node-pty"). The native packages the server needs are not unpacked where the WSL distro\'s Node can read them. This is a packaging problem with this build. Please report it.',
    unavailableTitle: "WSL backend is still unavailable",
    unavailableDetail:
      "T3 Code will use the Windows backend for this launch and retry WSL the next time the app starts.",
    failedTitle: "WSL backend couldn't start",
    failedDetail:
      "Falling back to the Windows backend so T3 Code can open. Re-enable the WSL backend from Settings > Connections once the WSL distro is fixed.",
  },
  contextMenu: { noSuggestions: "No suggestions", copyLink: "Copy Link", copyImage: "Copy Image" },
  filters: { images: "Images", json: "JSON", desktopConfig: "Desktop config" },
  permission: {
    title: (permission: MacPermission) =>
      `Set up ${{ "screen-recording": "Screen Recording", accessibility: "Accessibility", "full-disk-access": "Full Disk Access" }[permission]}`,
    close: "Close permission helper",
    drag: "↑ Drag T3 Code into the list above",
    app: "Drag T3 Code to System Settings, or click to reveal in Finder",
  },
};

/** Both dictionaries have identical keys and interpolation contracts. */
export type DesktopMessages = typeof en;
const zhCN: DesktopMessages = {
  menu: {
    file: "文件",
    edit: "编辑",
    view: "视图",
    speech: "朗读",
    settings: "设置…",
    checkForUpdates: "检查更新…",
    pasteAsText: "粘贴为纯文本",
    reload: "重新加载",
    forceReload: "强制重新加载",
    toggleDevTools: "切换开发者工具",
    actualSize: "实际大小",
    zoomIn: "放大",
    zoomOut: "缩小",
    roleLabels: (appName, platform) => ({
      about: `关于 ${appName}`,
      services: "服务",
      hide: `隐藏 ${appName}`,
      hideOthers: "隐藏其他",
      unhide: "全部显示",
      quit: platform === "darwin" ? `退出 ${appName}` : "退出",
      close: "关闭窗口",
      undo: "撤销",
      redo: "重做",
      cut: "剪切",
      copy: "复制",
      paste: "粘贴",
      delete: "删除",
      selectAll: "全选",
      startSpeaking: "开始朗读",
      stopSpeaking: "停止朗读",
      reload: "重新加载",
      forceReload: "强制重新加载",
      toggleDevTools: "切换开发者工具",
      togglefullscreen: "切换全屏",
      windowMenu: "窗口",
      help: "帮助",
      minimize: "最小化",
      zoom: "缩放",
      front: "全部前置",
    }),
  },
  preview: {
    clipboardAllow: "允许",
    clipboardBlock: "阻止",
    clipboardRead: (origin) => `${origin} 想要查看剪贴板中的文字和图片`,
    open: "打开",
    cancel: "取消",
    openLink: (protocol) => `打开此 ${protocol} 链接？`,
    externalApplicationDetail: (url) => `浏览器中的页面想要打开其他应用程序：\n\n${url}`,
    choosePasskey: "选择通行密钥",
    unnamedPasskey: "未命名的通行密钥",
  },
  updates: {
    wslRemoteSwitch: "此桌面应用还运行着 WSL 后端，远程切换无法检查其数据库。请在该计算机上切换。",
    noBuild: (version) => `桌面应用未找到 ${version} 的构建版本。`,
    upToDateTitle: "已是最新版本",
    upToDateMessage: (version) => `T3 Code ${version} 已是当前最新版本。`,
    failedTitle: "检查更新失败",
    failedMessage: "无法检查更新。",
    unknownError: "发生未知错误，请稍后重试。",
    unavailableTitle: "更新不可用",
    unavailableMessage: "自动更新目前不可用。",
    ok: "确定",
  },
  startup: {
    recoveryTitle: "T3 Code 无法启动",
    checking: "正在检查更新版本…",
    updateAvailable: (version) => `版本 ${version} 已可用，可能包含修复。`,
    updateTo: (version) => `更新至 ${version}`,
    downloading: (version, percent) =>
      `正在下载 ${version}${percent === null ? "" : `（${Math.floor(percent / 10) * 10}%）`}。下载完成后，T3 Code 将重新启动。`,
    reinstall: (version) => `版本 ${version} 曾在此计算机上正常启动。下载并安装该版本即可回退。`,
    download: (version) => `下载 ${version}`,
    releasesHint: "从发布页面获取其他版本。",
    releases: "打开发布页面",
    copyDetails: "复制详情",
    quit: "退出",
    noOutput: "服务端没有输出。",
    retryHint: (version, logDir) => `版本 ${version}。T3 Code 正在后台重试。日志：${logDir}`,
    failedTitle: "T3 Code 启动失败",
    stage: (stage) => `阶段：${stage}`,
    connecting: "正在连接 WSL…",
  },
  wsl: {
    dependenciesFailed:
      '无法加载 WSL 服务端依赖（例如 "node-pty"）。服务端所需的原生包未解压到 WSL 发行版的 Node 可以读取的位置。这是此版本的打包问题，请报告此问题。',
    unavailableTitle: "WSL 后端仍不可用",
    unavailableDetail: "本次启动将使用 Windows 后端，下次启动应用时会重试 WSL。",
    failedTitle: "WSL 后端无法启动",
    failedDetail:
      "正在回退到 Windows 后端以打开 T3 Code。修复 WSL 发行版后，请在“设置 > 连接”中重新启用 WSL 后端。",
  },
  contextMenu: { noSuggestions: "无建议", copyLink: "复制链接", copyImage: "复制图片" },
  filters: { images: "图片", json: "JSON", desktopConfig: "桌面配置" },
  permission: {
    title: (permission) =>
      `设置${{ "screen-recording": "屏幕录制", accessibility: "辅助功能", "full-disk-access": "完全磁盘访问权限" }[permission]}`,
    close: "关闭权限提示",
    drag: "↑ 将 T3 Code 拖入上方列表",
    app: "将 T3 Code 拖到系统设置，或点击以在访达中显示",
  },
};

/** Returns messages for the resolved bundled language. */
export function desktopMessages(locale: UiLocale): DesktopMessages {
  return locale === "zh-CN" ? zhCN : en;
}

/** Adds translated labels without changing a role's native behavior or English defaults. */
export function localizedRole(
  role: MenuRole,
  labels: Readonly<Partial<Record<MenuRole, string>>>,
): MenuItemConstructorOptions {
  return labels[role] === undefined ? { role } : { role, label: labels[role] };
}
