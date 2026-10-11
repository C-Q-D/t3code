/** Shared English UI labels; excludes persisted values and protocol strings. */
import type { PullRequestState } from "@t3tools/contracts";

const monthNameFormatter = new Intl.DateTimeFormat("en-US", { month: "long" });

export const common = {
  system: "System default",
  resetToDefault: "Reset to default",
  /** Builds the accessible reset action name for a setting's UI label. */
  resetLabelToDefault: (label: string) => `Reset ${label} to default`,

  threadActions: {
    exportTranscript: "Export conversation",
    /** Formats an already localized snooze preset and wake time. */
    snoozePreset: (label: string, time: string) => `${label} (${time})`,
    copy: "Copy",
    path: "Path",
    branch: "Branch",
    projectSettings: "Project settings",
    discardDraft: "Discard draft",
    /** Formats the newThreadOnBranch message from the supplied branch. */
    newThreadOnBranch: (branch: string) => `New thread on ${branch}`,
    unpin: "Unpin thread",
    pin: "Pin thread",
    unsettle: "Un-settle thread",
    settle: "Settle thread",
    wake: "Wake thread",
    snooze: "Snooze",
    customSnooze: "Custom…",
    rename: "Rename thread",
    regeneratingTitle: "Regenerating…",
    regenerateTitle: "Regenerate title",
    markUnread: "Mark unread",
    showAllProjects: "Show all projects",
    /** Formats the filterByProject message from the supplied label. */
    filterByProject: (label: string) => `Filter by ${label}`,
    autoSettle: "Auto-settle behavior",
    enabled: "Enabled",
    disabled: "Disabled",
    threadId: "Thread ID",
    archive: "Archive thread",
    delete: "Delete",
  },
  threadStatus: {
    states: {
      open: "Open",
      draft: "Draft",
      closed: "Closed",
      merged: "Merged",
    } satisfies Record<PullRequestState | "draft", string>,
    changeRequest: "change request",
    /** Formats a PR/MR status heading with its number and displayed state. */
    pullRequestLead: (shortName: string, number: number, stateLabel: string) =>
      `${shortName} #${number} - ${stateLabel}`,
    /** Formats a compact PR/MR status label. */
    pullRequestLabel: (shortName: string, stateLabel: string) => `${shortName} ${stateLabel}`,
    /** Appends the unmodified PR title to its status heading. */
    pullRequestTooltip: (lead: string, title: string) => `${lead}: ${title}`,
    stack: "stack",
    /** Formats the stackSummary message from the supplied count, label. */
    stackSummary: (count: number, label: string) => `Stack of ${count} pull requests, ${label}`,
    /** Formats the pendingPullRequest message from the supplied number. */
    pendingPullRequest: (number: number) => `PR #${number}, status pending`,
    /** Formats the linkedSummary message from the supplied tooltip, otherCount, label. */
    linkedSummary: (tooltip: string, otherCount: number, label: string) =>
      `${tooltip}, and ${otherCount} more linked; overall ${label}`,
    chain: "chain",
    terminalRunning: "Terminal process running",
    /** Formats the worktreeBranch message from the supplied path, branch. */
    worktreeBranch: (path: string, branch: string) => `Worktree: ${path} (${branch})`,
    /** Formats the worktree message from the supplied path. */
    worktree: (path: string) => `Worktree: ${path}`,
    remote: "Remote",
  },
  desktopUpdate: {
    correctArchitecture: "This install is using the correct architecture.",
    appleSiliconDownloadHint:
      "This Mac has Apple Silicon, but T3 Code is still running the Intel build under Rosetta. Download the available update to switch to the native Apple Silicon build.",
    appleSiliconInstallHint:
      "This Mac has Apple Silicon, but T3 Code is still running the Intel build under Rosetta. Restart to install the downloaded Apple Silicon build.",
    appleSiliconNextUpdateHint:
      "This Mac has Apple Silicon, but T3 Code is still running the Intel build under Rosetta. The next app update will replace it with the native Apple Silicon build.",
    /** Formats the availableTooltip message from the supplied version. */
    availableTooltip: (version: string | null) =>
      `Update ${version ?? "available"} ready to download`,
    /** Formats the downloadingTooltip message from the supplied percent. */
    downloadingTooltip: (percent: number | null) =>
      `Downloading update${typeof percent === "number" ? ` (${Math.floor(percent)}%)` : ""}`,
    /** Formats the downloadedTooltip message from the supplied version. */
    downloadedTooltip: (version: string | null) =>
      `Update ${version ?? "ready"} downloaded. Click to restart and install.`,
    /** Formats the downloadError message from the supplied version. */
    downloadError: (version: string) => `Download failed for ${version}. Click to retry.`,
    /** Formats the installError message from the supplied version. */
    installError: (version: string) => `Install failed for ${version}. Click to retry.`,
    updateError: "Update failed",
    upToDate: "Up to date",
    /** Formats the installConfirmation message from the supplied version. */
    installConfirmation: (version: string | null) =>
      `Install update${version ? ` ${version}` : ""} and restart T3 Code?\n\nAny running tasks will be interrupted. Make sure you're ready before continuing.`,
    releaseNotesError: "Unable to open release notes",
    readMore: "Read more",
    downloadedToast: "Update downloaded",
    restartHint: "Restart the app from the update button to install it.",
  },
  providerUpdate: {
    /** Joins provider display names in their supplied order. */
    providerList: (names: readonly string[]) =>
      names.length <= 2
        ? names.join(" and ")
        : `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`,
    /** Formats the update result for the number of affected providers. */
    finished: (count: number): string =>
      count === 1 ? "Provider updated" : "Provider updates finished",
    /** Formats the update result for the number of affected providers. */
    unchanged: (count: number): string =>
      count === 1 ? "Provider still needs an update" : "Providers still need updates",
    /** Formats the update result for the number of affected providers. */
    updateError: (count: number): string =>
      count === 1 ? "Provider update failed" : "Provider updates failed",
    /** Formats the update result for the number of affected providers. */
    updating: (count: number): string => (count === 1 ? "Updating provider" : "Updating providers"),
    /** Formats the update result for the number of affected providers. */
    newSessionsHint: (count: number): string =>
      count === 1
        ? "New sessions will use the updated provider."
        : "New sessions will use the updated providers.",
    /** Formats the updatedVersion message from the supplied providerName, version. */
    updatedVersion: (providerName: string, version: string) =>
      `${providerName} updated: ${version}`,
    /** Formats the updatedProvider message from the supplied providerName. */
    updatedProvider: (providerName: string) => `${providerName} updated`,
    /** Formats the failedVersion message from the supplied providerName, version. */
    failedVersion: (providerName: string, version: string) =>
      `${providerName} ${version} update failed`,
    /** Formats the failedProvider message from the supplied providerName. */
    failedProvider: (providerName: string) => `${providerName} update failed`,
    installHint: "Install the update now or review provider settings.",
    /** Formats the settingsHint message from the supplied names. */
    settingsHint: (names: string) => `${names} can be updated from provider settings.`,
    runningHint: "Running provider update command.",
    /** Formats the unchangedHint message from the supplied names, count. */
    unchangedHint: (names: string, count: number) =>
      `${names} ${count === 1 ? "still appears" : "still appear"} outdated. Check provider settings for details.`,
    updateFallbackError: "Provider update failed.",
    unfinishedError: "Provider update did not finish.",
    /** Formats the updatedCount message from the supplied count. */
    updatedCount: (count: number) => `${count} providers updated`,
    /** Formats the partialFailure message from the supplied failedCount, totalCount. */
    partialFailure: (failedCount: number, totalCount: number) =>
      `${failedCount} of ${totalCount} provider updates failed`,
    /** Formats the updatingNamedProvider message from the supplied providerName. */
    updatingNamedProvider: (providerName: string) => `Updating ${providerName}`,
    /** Formats the updatingCount message from the supplied count. */
    updatingCount: (count: number) => `Updating ${count} providers`,
    /** Formats the progressHint message from the supplied names, count. */
    progressHint: (names: string, count: number) =>
      count === 1 ? `${names} update in progress.` : `${names} updates are in progress.`,
    /** Formats the failedCount message from the supplied count. */
    failedCount: (count: number) => `${count} provider updates failed`,
    /** Formats the unchangedNamedProvider message from the supplied providerName. */
    unchangedNamedProvider: (providerName: string) => `${providerName} still needs an update`,
    /** Formats the unchangedCount message from the supplied count. */
    unchangedCount: (count: number) => `${count} providers still need updates`,
    /** Formats the reviewUnchangedHint message from the supplied names, count. */
    reviewUnchangedHint: (names: string, count: number) =>
      `${names} ${count === 1 ? "still appears" : "still appear"} outdated. Review provider settings for details.`,
    /** Formats the availableProvider message from the supplied providerName, version. */
    availableProvider: (providerName: string, version: string) =>
      `Update Available: ${providerName} ${version}`,
    /** Formats the availableCount message from the supplied count. */
    availableCount: (count: number) => `Updates Available: ${count} providers`,
    /** Formats the failedHint message from the supplied names. */
    failedHint: (names: string) =>
      `${names} failed to update. Check provider settings for details.`,
    updatedStatus: "Updated",
    updatingStatus: "Updating…",
  },
  permissions: {
    operateDeniedError: "This connection cannot change threads or projects.",
  },
  clipboard: {
    /** Formats the copyUnavailableError message from the supplied target. */
    copyUnavailableError: (target: string) =>
      `Clipboard API is unavailable while copying ${target}.`,
    /** Formats the copyError message from the supplied target. */
    copyError: (target: string) => `Failed to copy ${target} to the clipboard.`,
    /** Formats the readUnavailableError message from the supplied target. */
    readUnavailableError: (target: string) =>
      `Clipboard API is unavailable while reading ${target}.`,
    /** Formats the readError message from the supplied target. */
    readError: (target: string) => `Failed to read ${target} from the clipboard.`,
    text: "text",
  },
  confirm: {
    title: "Confirm action",
    description: "This action requires your confirmation.",
    cancel: "Cancel",
    confirm: "Confirm",
  },
  timestamp: {
    justNow: "just now",
    ago: "ago",
    left: "left",
    expired: "Expired",
    soon: "Soon",
    expiresSoon: "Expires in a moment",
    /** Formats a wall-clock time on the previous calendar day. */
    yesterday: (time: string) => `yesterday at ${time}`,
    /** Formats a wall-clock time on the next calendar day. */
    tomorrow: (time: string) => `tomorrow at ${time}`,
    /** Formats a countdown from its already formatted duration. */
    expiresIn: (duration: string) => `Expires in ${duration}`,
    /** Formats a duration in whole seconds. */
    seconds: (count: number) => `${count}s`,
    /** Formats a duration in whole minutes. */
    minutes: (count: number) => `${count}m`,
    /** Formats a duration in whole hours. */
    hours: (count: number) => `${count}h`,
    /** Formats a duration in whole days. */
    days: (count: number) => `${count}d`,
    /** Formats time and local calendar components; month is one-based. */
    tooltip: (time: string, day: number, month: number, year: number) => {
      const lastTwo = day % 100;
      const suffix =
        lastTwo >= 11 && lastTwo <= 13
          ? "th"
          : day % 10 === 1
            ? "st"
            : day % 10 === 2
              ? "nd"
              : day % 10 === 3
                ? "rd"
                : "th";
      const monthName = monthNameFormatter.format(new Date(2000, month - 1, day));
      return `${time}, ${day}${suffix} ${monthName} ${year}`;
    },
  },
};
