/** English settings messages for search, navigation, scope, and panels. */
import type {
  BranchNamingMode,
  SourceControlWritingStyleMode,
  ResponseStreamingMode,
  SidebarProjectSortOrder,
  DiffLayout,
  QuitConfirmationMode,
  BackgroundActivityProfile,
  ChatWidth,
  EnvironmentIdentificationMode,
  ScheduledTask,
  ScheduledTaskWebhookDeliveryOutcome,
  DesktopSnapShotState,
} from "@t3tools/contracts";

import type { ThemeColorRole } from "@t3tools/shared/themePalettes";

export const settings = {
  sourceControlHostFields: {
    bitbucket: {
      accessToken: {
        label: "Access token",
        description:
          "Scoped to one repository, project, or workspace. Create it in that item's Bitbucket settings.",
      },
      email: {
        label: "Atlassian account email",
        description: "With an API token instead of an access token.",
      },
      apiToken: {
        label: "API token",
        description:
          "Reaches every repository your Atlassian account can. Give it read and write access to repositories and pull requests, and read:user:bitbucket.",
      },
    },
  },
  merge: {
    saveHostSettings: (label: string) => `save ${label} settings`,
    hostRemove: "Remove",
    cliInstallFailed: "Could not install t3",
    cliRemoveFailed: "Could not remove t3",
    cliFailure: "Something went wrong.",
    cliDescription: "Run T3 Code's CLI as `t3` from any terminal.",
    cliRemove: "Remove",
    cliInstall: "Install",
    cliShadowed: (path: string) =>
      `Another t3 at ${path} runs first in a new terminal. Remove it to use T3 Code's.`,
    cliInstalled: (path: string) => `Installed at ${path}. Open a new terminal to use it.`,
    cliMissingPath: (path: string) =>
      `Installed at ${path}, which is not on your PATH yet. Add its folder to your PATH to run \`t3\`.`,
    telemetryOff: "Off",
    telemetryUnchecked: "Not checked",
    telemetryChecking: "Checking…",
    telemetryTimeout: "Timed out",
    telemetryUnreachable: "Unreachable",
    telemetrySaved: "Saved. Restart the server to apply.",
    telemetryConnected: (latency: number) => `Connected · ${latency} ms`,
    telemetryRejected: (status: number) => `Rejected · HTTP ${status}`,
    telemetryTitle: "OpenTelemetry export",
    telemetryChooseEnvironment: "Choose one environment to configure its telemetry exports.",
    telemetryDescription:
      "Send traces, metrics, and logs to an OTLP HTTP receiver. Restart the server to apply. Environment variables override these settings.",
    telemetryNoPermission: (environment: string) =>
      `This connection lacks permission to change settings on ${environment}.`,
    telemetrySelectedEnvironment: "the selected environment",
    telemetryEndpoint: (signal: string) => `${signal} endpoint`,
    telemetryTraces: "Traces",
    telemetryMetrics: "Metrics",
    telemetryLogs: "Logs",
    telemetryEndpointHint: "Enter an HTTP or HTTPS endpoint, or leave empty to disable export.",
    telemetryTest: "Test",
    telemetryRunning: (endpoint: string) => `Running: ${endpoint}`,
    telemetryDisabled: "Disabled",
    telemetryDiscard: "Discard",
    telemetrySaving: "Saving…",
    telemetrySave: "Save",
    storageAnyFiles: "Any local files",
    storageUncommitted: "Uncommitted changes",
    storageTracked: "Edited tracked files",
    storageWorktrees: "Worktrees",
    storageRotatedLogs: "Rotated logs",
    storageBrowserArtifacts: "Browser artifacts",
    storageLoadFailed: "Could not load the last run.",
    storageLoadingRun: "Loading last run…",
    storageNotRun: "Cleanup hasn't run yet.",
    storageEnableRule: "Turn on a cleanup rule to use this.",
    storageDeleting: "Deleting…",
    storageDeleteNow: "Delete now",
    storageAnyFilesHint: "Includes ignored files, except node_modules.",
    storageTrackedHint: "Deletes untracked and ignored files, including .env.",
    storageUncommittedHint:
      "Keeps edits and untracked files. Deletes ignored files, including .env.",
    storageMixed: "Mixed",
    storageCleanup: "Cleanup",
    storageLastRun: "Last run",
    storageKeepLocal: "Keep worktrees with local changes",
    storageFiles: (count: number) => `${count.toLocaleString()} ${count === 1 ? "file" : "files"}`,
    storageMoreResults: (count: number) => `${count.toLocaleString()} more results.`,
    storageNothingToClean: "Nothing needed cleanup.",
    storageRunSummary: (time: string, bytes: string, failed: number) =>
      `Last run ${time}. ${bytes} recovered.${failed > 0 ? ` ${failed} ${failed === 1 ? "item" : "items"} couldn't be removed.` : ""}`,
    storageCleanupFailed: (environment: string) => `Cleanup failed on ${environment}`,
    storageRunFailed: (environment: string) => `Could not run cleanup on ${environment}`,
    storageResultCounts: (removed: number, kept: number, failed: number) =>
      `${removed} removed, ${kept} kept${failed > 0 ? `, ${failed} failed` : ""}`,
    hostCredentials: (label: string) => `${label} credentials`,
    search: "Search",
    version: "Version",
    t3Command: "t3 command",

    licenseTimeout: "The license manifest took too long to load.",
    updating: "Updating",
    modelPreferencesShared:
      "Model preferences and custom models are saved on the selected environment and shared across connected devices.",
    selectedEnvironment: "the selected environment",
    primaryEnvironment: "the primary environment",
    saveFailed: "The save failed. Try reconnecting and saving again.",
    modelPreferencesNotSaved: "Model preferences not saved",
    loadModelPreferencesFailed: "Could not load saved model preferences. Try again.",
    favoritesNotSaved: "Favorites not saved",
    startingUpdate: "Starting update",
    storedSecret: "Stored secret, enter a new value to replace",
    notSet: "Not set",
    searchMatches: "Search matches",
    currentMatch: "Current match",
    keepLocalChanges: "Keep worktrees with local changes",
    deleteNow: "Delete now",
    telemetryExport: "OpenTelemetry export",
    permissions: "Permissions",
    activeRoutePermissions:
      "These permissions apply to your active route. Other routes may have different permissions.",
    currentConnectionPermissions: "These permissions apply to this client’s current connection.",
    permissionAllowed: "Allowed",
    permissionNotGranted: "Not granted",
    permissionsNotChecked:
      "Permissions not checked. Connect to this environment to view this session’s permissions.",
    reorderRoutes: "Reorder routes",
    permissionOn: (label: string) =>
      `This connection lacks permission to change settings on ${label}.`,
    couldNotSaveOn: (label: string, message: string) => `Could not save on ${label}: ${message}`,
    savedOn: (labels: string) => `Saved on ${labels}.`,
    updatingProgress: (progress: string) => `Updating · ${progress}`,
  },

  sections: {
    appearanceLanguage: "Language",
    organization: "Organization",
    behavior: "Behavior",
    projectsAndThreads: "Projects & threads",
    confirmations: "Confirmations",
    textGeneration: "Text generation",
    about: "About",
    diagnostics: "Diagnostics",

    appearance: "Colors & themes",
    appearanceInterface: "Interface",
    appearanceMotion: "Motion",
    appearanceTypography: "Typography",
    legacyFeatures: "Legacy features",
    devices: "Devices",
    browser: "Browser",
  },
  rows: {
    language: {
      title: "Language",
      description: "Choose the interface language for this device. Changing it reloads the page.",
      ariaLabel: "Language",
      reset: "Reset language to follow system",
      options: {
        system: "Follow system",
      },
      saveError: "Language not saved",
      saveErrorDescription:
        "Your browser could not save the language preference. Please try again.",
    },
    timeFormat: {
      title: "Time format",
      description: "System default follows your browser or OS clock preference.",
      ariaLabel: "Timestamp format",
      options: {
        twelveHour: "12-hour",
        twentyFourHour: "24-hour",
      },
    },
    storageWorktrees: {
      title: "Worktree cleanup",
    },
    storageWorktreesLocation: {
      title: "Worktree location",
    },
    storageArtifacts: {
      title: "Artifacts and logs",
    },
    projectDefaults: {
      title: "Project defaults and overrides",
    },
    projectOverview: {
      title: "Project overview",
    },
    defaultModel: {
      title: "Default model",
    },
    defaultPermissions: {
      title: "Permissions",
    },
    colorScheme: {
      title: "Color scheme",
    },
    theme: {
      title: "Themes",
    },
    settingAppearanceContrast: {
      title: "Contrast",

      description: "Adjust the contrast of colors and borders across the interface.",
      resetLabel: "contrast",
    },
    settingGlassOpacity: {
      title: "Glass opacity",

      description: "Higher values make menus, dialogs, and the composer more solid.",
      resetLabel: "glass opacity",
    },
    diffColorScheme: {
      title: "Diff colors",

      description: "Choose colors for additions and deletions, including change counts.",
      resetLabel: "diff colors",
      options: {
        blueOrange: "Blue & orange",
        redGreen: "Red & green",
        redGreenDefault: "Red & green (default)",
      },
    },
    chatWidth: {
      title: "Chat width",

      options: {
        comfortable: "Comfortable",
        wide: "Wide",
        full: "Full",
      } satisfies Record<ChatWidth, string>,
      description: "Set how wide messages and the composer can grow on large screens.",
      resetLabel: "chat width",
      comfortableDefaultLabel: "Comfortable (default)",
    },
    panelAnimations: {
      title: "Panel animations",

      description: "Set how fast panels open and close.",
      ariaLabel: "Panel animation duration",
      resetLabel: "panel animations",
    },
    environmentIdentification: {
      title: "Environment identification",

      options: {
        artwork: "Artwork",
        pill: "Version pill",
        none: "None",
      } satisfies Record<EnvironmentIdentificationMode, string>,
      description: "Choose how Dev and Nightly environments are identified.",
      resetLabel: "environment identification",
    },
    interfaceFont: {
      title: "Interface font",

      description: "Everything outside code blocks and the terminal.",
      sizeAriaLabel: "Interface font size",
    },
    promptFont: {
      title: "Prompt font",

      description: "Only the box you write prompts in. Mono works well here.",
      sizeAriaLabel: "Prompt font size",
    },
    codeFont: {
      title: "Code font",

      description: "Code blocks, diffs, and file previews.",
      sizeAriaLabel: "Code font size",
    },
    terminalFont: {
      title: "Terminal font",

      description: "Terminal output, independent from code blocks and diffs.",
      sizeAriaLabel: "Terminal font size",
    },
    fontSmoothing: {
      title: "Font smoothing",

      description: "Use thinner grayscale text smoothing instead of the macOS default.",
      resetLabel: "font smoothing",
    },
    wordWrap: {
      title: "Word wrap",

      description: "Wrap long lines in code blocks, tables, diffs, and file previews by default.",
      resetLabel: "word wrapping",
      ariaLabel: "Wrap code, tables, diffs, and file previews by default",
    },
    composerContext: {
      title: "Composer context",

      description: "Keep branch and worktree controls below the composer after a thread starts.",
      resetLabel: "composer context",
      ariaLabel: "Keep composer context visible in active threads",
    },
    projectGrouping: {
      title: "Project grouping",
      description: "Combine matching repositories across environments.",
      resetLabel: "project grouping",
      ariaLabel: "Project grouping",
    },
    projectOrder: {
      title: "Project order",
      options: {
        updated_at: "Last user message",
        created_at: "Created at",
        manual: "Manual",
      } satisfies Record<SidebarProjectSortOrder, string>,
      description: "Order of projects in the sidebar project picker and command palette.",
      resetLabel: "project order",
      ariaLabel: "Project order",
    },
    snoozeLimitedThreads: {
      title: "Snooze limited threads",
      description:
        "Snooze usage-limit stops until the reported reset time. Combine with auto-resume to continue when they wake.",
      ariaLabel: "Snooze limited threads",
    },
    autoResumeLimitedThreads: {
      title: "Auto-resume limited threads",
      description:
        "Resume usage-limit stops at the reported reset time. Each thread can cancel its scheduled continuation.",
      ariaLabel: "Auto-resume limited threads",
    },
    workingShelf: {
      title: "Working section (beta)",
      description:
        "Fold working and monitoring threads into a Working section. They return to the top of the inbox when they need you.",
      resetLabel: "working section",
      ariaLabel: "Working section (beta)",
    },
    autoSettleInactiveThreads: {
      title: "Auto-settle inactive threads",
      description: "Sidebar threads with no activity for this long settle automatically.",
      resetLabel: "auto-settle",
      ariaLabel: "Auto-settle inactive threads",
    },
    autoSettleMergedThreads: {
      title: "Auto-settle merged threads",
      description:
        "Settle a thread when its pull request merges. Closed pull requests still settle automatically.",
      resetLabel: "auto-settle on merge",
      ariaLabel: "Auto-settle merged threads",
    },
    daysBeforeAutoSettle: {
      title: "Days of inactivity before auto-settle",
      description: "Any new activity un-settles a thread automatically.",
    },
    threadNotifications: {
      title: "Thread notifications",
    },
    inAppNotifications: {
      title: "In-app notifications",
      description:
        "Show a toast when another thread finishes, fails, or needs input or approval while this app has focus.",
      ariaLabel: "In-app notifications",
    },
    responseStreaming: {
      title: "Response streaming",
      options: {
        turn: "Wait for the full response",
        paragraph: "Show finished paragraphs",
      } satisfies Record<ResponseStreamingMode, string>,
      descriptions: {
        turn: "Text appears once the agent finishes its turn.",
        paragraph: "Each paragraph or code block appears as soon as it is complete.",
      } satisfies Record<ResponseStreamingMode, string>,
      mixedHint: "The selected targets use different streaming modes.",
      resetLabel: "response streaming",
      ariaLabel: "Response streaming",
    },
    hideWhitespaceChanges: {
      title: "Hide whitespace changes",
      description: "Set whether the diff panel ignores whitespace-only edits by default.",
      resetLabel: "diff whitespace changes",
      ariaLabel: "Hide whitespace changes by default",
    },
    defaultDiffFileState: {
      title: "Default diff file state",
      description:
        "Start with files expanded or collapsed when opening diffs or a pull request's Code tab.",
      resetLabel: "default diff file state",
      ariaLabel: "Default diff file state",
      options: {
        collapsed: "Collapsed",
        expanded: "Expanded",
      },
    },
    diffLayout: {
      title: "Diff layout",
      options: {
        stacked: "Stacked",
        split: "Split",
      } satisfies Record<DiffLayout, string>,
      description:
        "Show diffs stacked or side by side. The toggle in the diff toolbar changes this too.",
      resetLabel: "diff layout",
      ariaLabel: "Diff layout",
    },
    proactivePanels: {
      title: "Proactive panels",
      description:
        "Open linked pull requests first. Otherwise, open Changes for edits to at least 3 files or 50 lines.",
      resetLabel: "proactive panels",
      ariaLabel: "Proactive panels",
    },
    skillsInSlashMenu: {
      title: "Show skills in slash menu",
      description:
        "Also include skills in the / command menu. Skills always appear when you type $.",
      resetLabel: "skills in slash menu",
      ariaLabel: "Show skills in slash menu",
    },
    composerRichText: {
      title: "Rich text composer",
      description: "Show formatted Markdown as you type.",
      resetLabel: "rich text composer",
      ariaLabel: "Rich text composer",
    },
    composerCollapse: {
      title: "Collapse composer on scroll",
      description:
        "Rest the composer of an existing thread into a single line when you scroll the conversation. Focus the composer or start typing to expand it again.",
      resetLabel: "collapse composer on scroll",
      ariaLabel: "Collapse composer on scroll",
    },
    sendShortcut: {
      title: "Send shortcut",
      description: "Choose when Enter sends a prompt or inserts a new line",
      resetLabel: "send shortcut",
      ariaLabel: "Send shortcut",
      options: {
        multiline: (modifier: string) => `${modifier} + Enter for multiline prompts`,
        always: (modifier: string) => `${modifier} + Enter always`,
      },
    },
    followUpBehavior: {
      title: "Follow-up behavior",
      resetLabel: "follow-up behavior",
      ariaLabel: "Follow-up behavior",
      options: {
        queue: "Queue",
        steer: "Steer",
      },
      description: (modifier: string, shortcut: string) =>
        "Queue follow-ups while the agent runs or steer the current run. " +
        (shortcut === "mod-enter-multiline"
          ? `Press ${modifier} + Enter for single-line prompts or ${modifier} + Shift + Enter for multiline prompts to do the opposite for one message.`
          : `Press ${modifier}${shortcut === "mod-enter" ? " + Shift" : ""} + Enter to do the opposite for one message.`),
    },
    providerUpdateChecks: {
      title: "Provider update checks",
      description: "Check installed provider CLIs for newer available versions.",
      resetLabel: "provider update checks",
      ariaLabel: "Check provider versions",
    },
    continueThreadsAfterServerUpdate: {
      title: "Continue threads after restarts",
      description:
        "Automatically resume interrupted threads after an update, crash, or machine restart on the selected environments.",
      unsupportedHint: "All selected connected environments must support restart continuation.",
      resetLabel: "continue threads after restarts",
      ariaLabel: "Continue threads after restarts",
    },
    backgroundActivity: {
      title: "Background activity",
      options: {
        balanced: "Balanced",
        performance: "Performance",
        "battery-saver": "Battery saver",
        advanced: "Advanced",
      } satisfies Record<BackgroundActivityProfile | "advanced", string>,
      descriptions: {
        balanced: "Pauses probes for idle clients, locked hosts, or low power mode.",
        performance:
          "Allows scoped background probes while any subscribed client remains connected.",
        "battery-saver": "Also pauses background probes when the host or client is on battery.",
      } satisfies Record<BackgroundActivityProfile, string>,
      policyTooltip:
        "This shared policy gates background work such as Git refreshes and provider health probes after their individual intervals elapse.",
      resetLabel: "background activity",
      ariaLabel: "Background activity profile",
      configureAriaLabel: "Configure advanced background activity",
      configureTooltip: "Configure background activity",
      advancedDescription: (profile: string) => `Uses custom intervals. Shared policy: ${profile}.`,
      advancedEnvironmentHint: (label: string) => `${label} (one environment)`,
    },
    newThreads: {
      title: "New threads",
    },
    worktreeSubmodules: {
      title: "Submodules",
    },
    startFromOrigin: {
      title: "Start from origin",
      description:
        "Creates the worktree from the latest matching branch on origin instead of your local branch.",
      resetLabel: "new worktrees start from origin",
      ariaLabel: "Start new worktrees from origin by default",
    },
    addProjectStartsIn: {
      title: "Add project starts in",
      description: 'Leave empty to use "~/" when the Add Project browser opens.',
      resetLabel: "add project base directory",
      ariaLabel: "Add project base directory",
    },
    threadExportDirectory: {
      title: "Conversation export location",
      description:
        "Folder for exported conversation files. Leave empty to use the exports folder in the T3 data directory.",
      resetLabel: "conversation export location",
      ariaLabel: "Conversation export location",
    },
    unpinConfirmation: {
      title: "Unpin confirmation",
      description: "Ask before unpinning a thread from the pinned section.",
      resetLabel: "unpin confirmation",
      ariaLabel: "Confirm thread unpinning",
    },
    archiveConfirmation: {
      title: "Archive confirmation",
      description:
        "Require a second click on the inline archive action before a thread is archived.",
      resetLabel: "archive confirmation",
      ariaLabel: "Confirm thread archiving",
    },
    deleteConfirmation: {
      title: "Delete confirmation",
      description: "Ask before deleting a thread and its chat history.",
      resetLabel: "delete confirmation",
      ariaLabel: "Confirm thread deletion",
    },
    quitConfirmation: {
      title: "Quit shortcut",
      options: {
        direct: "Direct",
        hold: "Hold",
        "double-click": "Double press",
      } satisfies Record<QuitConfirmationMode, string>,
      description: "Hold mode also quits on two quick presses.",
      resetLabel: "quit shortcut behavior",
      ariaLabel: "Quit shortcut behavior",
    },
    textGenerationModel: {
      title: "Text generation model",
      description:
        "Used for thread titles and other generated text on connected devices with this provider. Source control can override it.",
      resetLabel: "text generation model",
      connectHint: "Connect an environment to choose its text generation model.",
      empty: "No text generation providers available.",
      saveError: "Text generation model not saved",
    },
    privacyPolicy: {
      title: "Privacy policy",
      description: "How we handle your data, including the anonymous usage data T3 Code collects.",
      viewPolicy: "View policy",
    },
    diagnostics: {
      title: "Diagnostics",
      description: "Inspect processes, resource use, and logs on this environment.",
      selectEnvironmentHint:
        "Inspect processes, resource use, and logs on one environment at a time.",
      viewDiagnostics: "View diagnostics",
    },
    openSourceLicenses: {
      title: "Open source licenses",
      description: "Notices for dependencies, assets, and optional tools used by T3 Code.",
      viewLicenses: "View licenses",
    },
    legacyPlanMode: {
      title: "Plan mode (legacy)",

      description: "Restore Build/Plan, /plan, /default, and Shift+Tab. Off uses build mode.",
    },
    legacyContextWindowIndicator: {
      title: "Context window indicator (legacy)",

      description: "Shows context window usage as a circular indicator in the composer.",
    },
    legacySidebar: {
      title: "Sidebar (legacy)",

      description: "Restore per-project thread trees instead of the default flat sidebar.",
    },
    keybindings: {
      title: "Keybindings",
    },
    snapShotEnabled: {
      title: "SnapShots",
    },
    snapShotAccessibility: {
      title: "Include app text",
    },
    snapShotShortcut: {
      title: "Capture shortcut",
    },
    snapShotSound: {
      title: "Capture sound",
    },
    snapShotFlash: {
      title: "Capture flash",
    },
    snapShotAnimations: {
      title: "Capture animations",
    },
    providers: {
      title: "Providers",
    },
    usageProviders: {
      title: "Usage providers",
    },
    cursorKeychainUsage: {
      title: "Cursor account usage",
    },
    providerHealthCheckInterval: {
      title: "Health check interval",
    },
    agentBrowserAccess: {
      title: "Agent browser access",
    },
    deviceHosts: {
      title: "Device hosts",
    },
    agentDeviceAccess: {
      title: "Agent device access",
    },
    deviceHub: {
      title: "Device hub",
    },
    devicePlatformSupport: {
      title: "Simulator support",
    },
    browserProfiles: {
      title: "Browser profiles",

      description:
        "Profiles separate cookies and logins. Incognito data is cleared when the app closes.",
    },
    browserDefaultProfile: {
      title: "Default browser profile",
    },
    browserDefaultViewport: {
      title: "Default browser viewport",

      options: {
        fill: "Fill panel",
        responsive: "Responsive",
      },
      description:
        "Tab size for you and agents. Fill fits the panel; other sizes show the device toolbar.",
      resetLabel: "default browser viewport",
      standard: "Standard",
      widthAriaLabel: "Default viewport width",
      heightAriaLabel: "Default viewport height",
      rotate: "Rotate",
      rotateAriaLabel: (landscape: boolean) => `Rotate to ${landscape ? "landscape" : "portrait"}`,
    },
    browserDefaultZoom: {
      title: "Default browser zoom",

      description: "Page zoom applied to new browser tabs.",
      resetLabel: "default browser zoom",
    },
    browserDefaultAppearance: {
      title: "Default browser appearance",

      options: {
        system: "System",
        light: "Light",
        dark: "Dark",
      },
      description: "The color scheme pages are told to prefer. System follows your OS setting.",
      resetLabel: "default browser appearance",
    },
    browserRecordingFrameRate: {
      title: "Browser recording frame rate",

      description: "Maximum recording rate. 30 fps saves CPU and storage; 60 fps is smoother.",
      resetLabel: "browser recording frame rate",
    },
    browserRecordingKeyPresses: {
      title: "Show key presses in recordings",

      description:
        "Show pressed keys and shortcuts in new recordings. Password fields are excluded.",
    },
    browserRecordingMousePresses: {
      title: "Show mouse presses in recordings",

      description: "Highlight mouse presses and held buttons in new recordings.",
    },
    browserLinkTarget: {
      title: "Open links in",

      options: {
        external: "Your default browser",
      },
      description:
        "Where links in the chat and terminal open. Hold ⌘ or Ctrl while clicking a link to open it in your default browser either way.",
      resetLabel: "link target",
    },
    browserAutoShowFloatingPreview: {
      title: "Auto-show floating preview",

      description:
        "Show the floating preview when an agent opens a browser or device unless the agent says otherwise.",
      resetLabel: "auto-show floating preview",
    },
    automaticPull: {
      title: "Automatically pull",
    },
    removeAgentCreditsOnMerge: {
      title: "Remove agent credits when merging",
    },
    pullRequestMergeMethod: {
      title: "Default merge method",
    },
    sourceControl: {
      title: "Source control",
    },
    gitFetchInterval: {
      title: "Git fetch interval",

      description: "Refresh remote branch status in the background.",
      decreaseAriaLabel: "Decrease Git fetch interval",
      ariaLabel: "Git fetch interval in seconds",
      increaseAriaLabel: "Increase Git fetch interval",
    },
    worktreeBranchNaming: {
      title: "Worktree branch naming",
      options: {
        static: "Static prefix",
        semantic: "Semantic prefix",
        custom: "Custom instructions",
      } satisfies Record<BranchNamingMode, string>,
    },
    githubAccounts: {
      title: "GitHub accounts and token",
    },
    sourceControlWritingStyle: {
      title: "Source control writing style",
    },
    followChangeRequestTemplates: {
      title: "Follow change request templates",
    },
    sourceControlWriterModel: {
      title: "Source control writer model",
    },
    projectActions: {
      title: "Actions",
    },
    environmentIcon: {
      title: "Environment icon",
    },
    localEnvironment: {
      title: "Local environment",
    },
    networkAccess: {
      title: "Network access",
    },
    tailscaleHttps: {
      title: "Tailscale HTTPS",
    },
    wslBackend: {
      title: "WSL backend",
    },
    t3Connect: {
      title: "T3 Connect",
    },
    holdWebhooksWhileOffline: {
      title: "Hold webhooks while offline",
    },
    publishAgentActivity: {
      title: "Publish agent activity",
    },
    connectionsEnvironment: {
      title: "This machine",
    },
    remoteEnvironments: {
      title: "Environments",
    },
    loadBalancing: {
      title: "Load balancing",
    },
    githubRouting: {
      title: "GitHub sharing",
    },
    archive: {
      title: "Archived threads",
    },
  },
  pages: {
    projects: "Project",
    general: "General",
    appearance: "Appearance",
    keybindings: "Keybindings",
    snapShot: "SnapShots",
    providers: "Providers",
    integrations: "Integrations",
    scheduledTasks: "Scheduled Tasks",
    sourceControl: "Source Control",
    storage: "Storage",
    connections: "Connections",
    archived: "Archive",
    diagnostics: "Diagnostics",
    openSourceLicenses: "Open source licenses",
  },
  sidebarNav: {
    searchPlaceholder: "Search",
    searchAriaLabel: "Search settings",
    clearSearchAriaLabel: "Clear settings search",
    empty: "No settings found",
    resultsAriaLabel: "Settings search results",
  },
  layout: {
    backgroundPolicyAriaLabel: "Background policy details",
    environment: "environment",
    override: "override",
    resetToInherited: "Reset to inherited value",
    permissionHint: "This connection does not have permission to change environment settings.",
    reconnectHint: "Reconnect the selected environment to change this setting.",
    environmentWideHint: "Environment-wide setting. Select an environment to change it.",
    mixedHint: "Mixed across selected environments",
    projectOverrideHint: "Overridden for this project",
    repositoryInheritanceHint: "Inherited from the repository's t3.json",
    environmentValueHint: "Set on the environment",
    builtInDefault: "Built-in default",
    inheritedFromHint: (inheritedFrom: string) => `Inherited from ${inheritedFrom}`,
    primaryUnavailableHint:
      "This setting is saved on a server, and the hosted app is not anchored to one. Change it from the desktop app or from the server's own address.",
  },
  breadcrumb: {
    ariaLabel: "Settings breadcrumb",
    title: "Settings",
  },
  scopeSentence: {
    applying: "Applying settings for",
    on: "on",
    across: "across",
    environmentAriaLabel: "Environment scope",
    unavailableEnvironment: "Unavailable environment",
    noEnvironments: "No environments",
    allEnvironments: "All environments",
    offline: "Offline",
    projectAriaLabel: "Project scope",
    unavailableProject: "Unavailable project",
    allProjects: "All projects",
    pickerAriaLabel: (scope: string, label: string) => `${scope}: ${label}`,
  },
  scopeNotice: {
    environment: "Environment",
    openAllEnvironments: "Open all environments",
    checkoutLabel: (project: string, environment: string, workspaceRoot: string) =>
      `${project} · ${environment} · ${workspaceRoot}`,
    environmentLabel: (label: string, address: string) => `${label} · ${address}`,
  },
  general: {
    mixed: "Mixed",
    appVersionDescription: "Current version of the application.",
  },

  backgroundActivity: {
    pauseWhenHostLocked: "Pause when host is locked",
    pauseWhenHostLowPower: "Pause on host low power",
    pauseWhenClientLowPower: "Pause on client low power",
    pauseWhenOnBattery: "Pause on battery",
    title: "Background Activity",
    description: "Tune the shared power policy and the background intervals that feed it.",
    sharedPolicy: {
      title: "Shared policy",
      description: "Controls whether background work may run after a subscribed interval fires.",
      ariaLabel: "Shared background policy",
    },
    seconds: "seconds",
    providerHealth: {
      title: "Provider health interval",
      description: "Refresh provider availability, versions, auth state, and model metadata.",
      decreaseAriaLabel: "Decrease provider health interval",
      ariaLabel: "Provider health interval in seconds",
      increaseAriaLabel: "Increase provider health interval",
    },
    activeHostPower: {
      title: "Host power monitor",
      description: "Poll host power state while clients are active.",
      decreaseAriaLabel: "Decrease active host power interval",
      ariaLabel: "Active host power interval in seconds",
      increaseAriaLabel: "Increase active host power interval",
    },
    idleHostPower: {
      title: "Idle host monitor",
      description: "Poll host power state when no foreground client is active.",
      decreaseAriaLabel: "Decrease idle host power interval",
      ariaLabel: "Idle host power interval in seconds",
      increaseAriaLabel: "Increase idle host power interval",
    },
    resetAll: "Reset all",
  },
  about: {
    versionTitle: "Version",
    changeTrackError: "Could not change update track",
    changeTrackErrorDescription: "Update track change failed.",
    downloadError: "Could not download update",
    downloadErrorDescription: "Download failed.",
    confirmError: "Could not confirm update",
    confirmErrorDescription: "Update confirmation failed.",
    installError: "Could not install update",
    installErrorDescription: "Install failed.",
    checkError: "Could not check for updates",
    unavailableHint: "Automatic updates are not available in this build.",
    checkErrorDescription: "Update check failed.",
    download: "Download",
    install: "Install",
    checking: "Checking…",
    downloading: "Downloading…",
    upToDate: "Up to Date",
    checkForUpdates: "Check for Updates",
    updateAvailableHint: "Update available.",
    updateTrack: {
      title: "Update track",
      description: "Use stable releases or nightly builds. Switch back anytime.",
      options: {
        nightly: "Nightly",
        stable: "Stable",
        latest: "Latest",
      },
    },
    hostedTrack: {
      description: "Switches the hosted app release channel.",
    },
  },
  restore: {
    themeLabel: "Theme",
    themeMixLabel: "Theme mix",
    visibleThreadsLabel: "Visible threads",
    projectGroupingLabel: "Project Grouping",
    workingShelfLabel: "Working section",
    diffWhitespaceLabel: "Diff whitespace changes",
    contextWindowLabel: "Context window indicator",
    newThreadModeLabel: "New thread mode",
    startFromOriginLabel: "New worktrees start from origin",
    confirmTitle: "Restore default settings?",
    confirmDescription: (labels: string) => `This will reset: ${labels}.`,
    themeError: "Couldn’t restore theme settings",
    retryHint: "Try again.",
    browserViewportLabel: "Browser viewport",
    browserZoomLabel: "Browser zoom",
    browserAppearanceLabel: "Browser appearance",
    recordingFrameRateLabel: "Recording frame rate",
    recordingKeysLabel: "Recording key presses",
    recordingMouseLabel: "Recording mouse presses",
    floatingPreviewLabel: "Floating preview",
  },
  actions: {
    done: "Done",
    delete: "Delete",
    cancel: "Cancel",
    update: "Update",
    retry: "Retry",
    loading: "Loading…",
    enable: "Enable",
    edit: "Edit",
    runNow: "Run now",
    back: "Back",
    refresh: "Refresh",
    copied: "Copied",
    connect: "Connect",
    disconnect: "Disconnect",
    close: "Close",
    continue: "Continue",
  },
  appearance: {
    monospaceFont: {
      title: "Monospace font",
      description: "Code blocks, diffs, file previews, and the terminal.",
    },
    advancedAriaLabel: "Show advanced typography settings",
    fontFamilyAriaLabel: (title: string) => `${title} family`,
    systemMonospace: "System monospace",
  },
  archive: {
    unarchive: "Unarchive",
    unarchiveError: "Failed to unarchive thread",
    actionErrorDescription: "An error occurred.",
    deleteError: "Failed to delete thread",
    loading: "Loading archived threads",
    loadError: "Could not load archived threads",
    empty: "No archived threads",
    loadingHint: "Checking connected environments.",
    emptyHint: "Archived threads will appear here.",
    actionError: "Archived thread action failed",

    /** Formats archive and creation times already prepared for display. */
    historyHint: (archived: string, created: string) => `Archived ${archived} · Created ${created}`,
  },
  diagnostics: {
    traceMode: {
      local: "Local trace file",
      terminal: "Terminal logs only",
    },
    traceExport: {
      combined: (mode: string, url: string) => `${mode}. Exporting OTEL to ${url}.`,
      separate: (mode: string, tracesUrl: string, metricsUrl: string) =>
        `${mode}. Exporting OTEL traces to ${tracesUrl} and metrics to ${metricsUrl}.`,
      traces: (mode: string, url: string) => `${mode}. Exporting OTEL traces to ${url}.`,
      metrics: (mode: string, url: string) => `${mode}. Exporting OTEL metrics to ${url}.`,
    },
    traces: {
      empty: "No trace records",
      copiedTrace: "Copied trace ID",
      copyTrace: "Copy trace ID",
      copyFullTrace: "Copy full trace ID",
      openLogsError: "Unable to open logs folder.",
      title: "Trace Diagnostics",
      openLogs: "Open logs folder",
      refreshAriaLabel: "Refresh trace diagnostics",
      spans: "Spans",
      failures: "Failures",
      slowSpans: "Slow Spans",
      slowSpanHint: (duration: string) => `Spans with a duration of ${duration} or longer.`,
      slowSpanThresholdHint: "Spans at or above the configured slow-span threshold.",
      parseErrors: "Parse Errors",
      incompleteHint: (message: string) =>
        `Some trace files could not be read, so diagnostics may be incomplete. ${message}`,
      latestFailures: "Latest Failures",
      loadingFailures: "Loading failures...",
      noFailures: "No failed spans found.",
      commonFailures: "Most Common Failures",
      loadingGroups: "Loading failure groups...",
      noGroups: "No repeated failures found.",
      slowestSpans: "Slowest Spans",
      loadingSpans: "Loading slow spans...",
      noSpans: "No spans found.",
      logs: "Span Logs",
      showMessage: "Show full message",
      loadingLogs: "Loading recent logs...",
      noLogs: "No warnings or errors found.",
      topNames: "Top Span Names",
      loadingNames: "Loading span names...",
    },
    detailsAriaLabel: (label: string) => `${label} details`,
    processCategories: {
      subprocess: "Subprocess",
      agent: "Agent",
      process: "Process",
    },
    collapseAriaLabel: (name: string) => `Collapse ${name}`,
    expandAriaLabel: (name: string) => `Expand ${name}`,
    columns: {
      name: "Name",
      cpu: "CPU",
      memory: "Memory",
      command: "Command",
      pid: "PID",
      type: "Type",
      kill: "Kill",
      cpuTime: "CPU Time",
      current: "Current",
      average: "Average",
      peak: "Peak",
      maxMemory: "Max Mem",
      span: "Span",
      cause: "Cause",
      duration: "Duration",
      ended: "Ended",
      count: "Count",
      lastSeen: "Last Seen",
      trace: "Trace",
      time: "Time",
      level: "Level",
      message: "Message",
      max: "Max",
    },
    processes: {
      empty: "No live descendant processes found.",
      title: "Live Processes",
      refreshAriaLabel: "Refresh process diagnostics",
      childCount: "Child Processes",
      cpuHint:
        "Total CPU across live child processes of the current server process. The desktop shell and other parent processes are not included.",
      memoryHint:
        "Total resident memory across live child processes of the current server process. The desktop shell and other parent processes are not included.",
      serverPid: "Server PID",
      loading: "Loading live processes...",
    },
    historyWindows: {
      fiveMinutes: "5m",
      fifteenMinutes: "15m",
      thirtyMinutes: "30m",
      oneHour: "1h",
    },
    cpuTime: {
      seconds: (value: string) => `${value}s`,
      minutes: (value: string) => `${value}m`,
      hours: (value: string) => `${value}h`,
    },
    history: {
      cpuAriaLabel: (average: string, peak: string) => `Average CPU ${average}%, peak CPU ${peak}%`,
      periodAriaLabel: "Process history period",
      title: "Resource History",
      refreshAriaLabel: "Refresh resource history",
      cpuTimeHint:
        "Approximate active CPU time for the T3 server root process and its descendants during the selected window. It grows only while sampled processes use CPU and older samples leave as the window moves.",
      samples: "Samples",
      samplesHint:
        "In-memory process samples retained by the server. This resets when the server restarts.",
      interval: "Interval",
      processes: "Processes",
      loading: "Collecting process resource samples...",
      empty: "No process resource samples found for this window.",
      processAriaLabel: (root: boolean, name: string) =>
        `${root ? "Root" : "Child"} process ${name}`,
      cpuHint: (average: string, peak: string) => `Avg ${average}%, peak ${peak}%`,
    },
    status: {
      checking: "Checking",
      unavailable: "Checked unavailable",
      checked: "Checked",
    },
    signal: {
      killConfirmation: (pid: number) =>
        `Send SIGKILL to process ${pid}? This cannot be handled by the process.`,
      confirmError: "Could not confirm signal",
      sendErrorDescription: (signal: string) => `Failed to send ${signal}.`,
      sendError: (signal: string) => `Could not send ${signal}`,
      exitedToast: "Process already exited",
      exitedHint: "The process is not a child of the T3 Server. It might already have exited.",
    },
    connectHint: "Connect an environment to see diagnostics.",
    accessChecking: "Checking diagnostics access…",

    /** Ends the local trace mode label when no export destination is enabled. */
    traceModeDescription: (mode: string) => `${mode}.`,
  },
  connections: {
    scopes: {
      orchestrationRead: {
        title: "View environment",
        description: "Read threads, status, checkpoints, and configuration.",
      },
      orchestrationOperate: {
        title: "Operate tasks",
        description: "Start, update, and stop tasks.",
      },
      settingsWrite: {
        title: "Change environment settings",
        description: "Edit environment preferences and keybindings.",
      },
      providersManage: {
        title: "Manage providers",
        description: "Configure, install, sign in to, and update providers and usage sources.",
      },
      environmentMaintain: {
        title: "Maintain environment",
        description: "Update the server and control environment processes.",
      },
      previewOperate: {
        title: "Control previews",
        description: "Open browser previews and host browser automation.",
      },
      diagnosticsRead: {
        title: "View diagnostics and usage",
        description: "Read process diagnostics, resource history, and usage totals.",
      },
      terminalRead: {
        title: "View terminals",
        description: "Read existing terminal output and status.",
      },
      terminalOperate: {
        title: "Use terminals",
        description: "Create terminals and send input to running shells.",
      },
      sourceControlWrite: {
        title: "Change source control",
        description: "Commit, push, manage branches and repositories, and change pull requests.",
      },
      filesystemRead: {
        title: "Read files",
        description: "Browse host files, search workspaces, and inspect local changes.",
      },
      filesystemWrite: {
        title: "Write files",
        description: "Edit workspace files and save plans to disk.",
      },
      accessRead: {
        title: "View access",
        description: "Inspect pairing links and authorized clients.",
      },
      accessWrite: {
        title: "Manage access",
        description: "Issue and revoke credentials for other clients.",
      },
      relayRead: {
        title: "View relay",
        description: "Inspect managed relay connectivity.",
      },
      relayWrite: {
        title: "Manage relay",
        description: "Change managed tunnel connectivity.",
      },
    },
    access: {
      showScopesAriaLabel: (label: string, scopeCount: string) => `${label}: show ${scopeCount}`,
      grantedScopes: "Granted scopes",
      revoking: "Revoking…",
      revoke: "Revoke",
      connectedDurationHint: (duration: string) => `Connected for ${duration}`,
      connected: "Connected",
      lastConnectedHint: (timestamp: string) => `Last connected at ${timestamp}`,
      notConnectedHint: "Not connected yet.",
      currentDevice: "This device",
      clientScopesLabel: "Client scopes",
      revokeOthers: "Revoke others",
      empty: "No pairing links or client sessions.",
      revokeLinkErrorDescription: "Failed to revoke pairing link.",
      revokeLinkError: "Could not revoke pairing link",
      revokeClientErrorDescription: "Failed to revoke client access.",
      revokeClientError: "Could not revoke client access",
      revokeOneToast: "Revoked 1 other client",
      revokeToast: (count: number) => `Revoked ${count} clients`,
      revokeOthersHint: "Other paired clients will need a new pairing link before reconnecting.",
      revokeOthersErrorDescription: "Failed to revoke other clients.",
      revokeOthersError: "Could not revoke other clients",
      authorizedClients: "Authorized clients",
      readPermissionHint:
        "This connection can create access links but cannot view authorized clients.",
      scopeCount: (count: number) => `${count} ${count === 1 ? "scope" : "scopes"}`,
      clientCount: (count: number) => `${count} ${count === 1 ? "client" : "clients"}`,
      linkCount: (count: number) => `${count} ${count === 1 ? "pairing link" : "pairing links"}`,
    },
    ssh: {
      hostRequiredError: "SSH host or alias is required.",
      invalidPortError: "SSH port must be between 1 and 65535.",
      connectError: "Failed to connect SSH host.",
      routeAddedHint: (label: string, host: string) =>
        `${label} can now be reached over SSH ${host}.`,
      connectedHint: (host: string) => `${host} is ready over an SSH-managed tunnel.`,
      hostLabel: "SSH host or alias",
      hostPlaceholder: "Search hosts or type devbox",
      loadingHosts: "Loading hosts…",
      usernameLabel: "Username",
      portLabel: "Port",
      title: "SSH",
      description: "Use local SSH config, agent, and tunnels for the backend.",
      noHostsHint: (host: string) => `No hosts match "${host}".`,
    },
    pairing: {
      hostRequiredError: "Enter a backend host.",
      codeRequiredError: "Enter a pairing code.",
      copyHostedLinkToast: "Hosted app link copied",
      copyUrlToast: "Pairing URL copied",
      copyCodeToast: "Pairing code copied",
      copyHostedLinkHint: "Open it in the browser on the device you want to connect.",
      copyUrlHint: "Open it in the client you want to pair to this environment.",
      copyCodeHint: "Paste it into another client to finish pairing.",
      copyHostedLinkError: "Could not copy hosted app link",
      copyUrlError: "Could not copy pairing URL",
      copyCodeError: "Could not copy pairing code",
      clipboardUnavailableError: "Clipboard copy unavailable",
      clipboardUnavailableHint: "Showing the full value instead.",
      linkTitle: "Pairing link",
      createdAtHint: (timestamp: string) => `Link created at ${timestamp}`,
      scopesLabel: "Pairing link scopes",
      createLinkHint: "Create a new link to share from this client.",
      manualHostHint:
        "Copy the token and pair from another client using this backend's reachable host.",
      share: "Share",
      copyCode: "Copy code",
      showLink: "Show link",
      showCode: "Show code",
      hostedLinkTitle: "Hosted app pairing link",
      codeTitle: "Pairing code",
      manualHostedLinkHint:
        "Clipboard copy is unavailable here. Open or manually copy this hosted app link on the device you want to connect.",
      manualUrlHint:
        "Clipboard copy is unavailable here. Open or manually copy this full pairing URL on the device you want to connect.",
      manualCodeHint:
        "Clipboard copy is unavailable here. Manually copy this code into another client.",
      qrAriaLabel: "Pairing link — scan to open on another device",
      copyLink: "Copy link",
      copyCodeOnly: "Copy code only",
      createErrorDescription: "Failed to create pairing URL.",
      createError: "Could not create pairing URL",
      createLink: "Create link",
      createTitle: "Create pairing link",
      createDescription:
        "Generate a one-time link that another device can use to pair with this backend as an authorized client.",
      clientLabel: "Client label (optional)",
      clientPlaceholder: "e.g. Living room iPad",
      permissionsHint: "Limit what the paired client can do.",
      readOnly: "Read only",
      standard: "Standard",
      permissionRequiredHint: "Select at least one permission.",
      accessWarning: "This client can create or revoke access for other devices.",
      creating: "Creating…",
      hostLabel: "Host",
      codePlaceholder: "PAIRCODE",
      pasteUrlHint: "Paste a full pairing URL here to fill both fields automatically.",
      remoteLink: "Remote link",
      remoteDescription: "Enter a backend host and pairing code.",
    },
    endpoints: {
      hostedHint: "Opens the hosted app, no install needed",
      lanHint: "Devices on the same network",
      privateHint: "Devices on your private network",
      publicHint: "Reachable from anywhere",
      loopbackHint: "Clients on this machine",
      ariaLabel: "Endpoint the pairing QR code and URL use",
      title: "Reach this machine via",
      loopbackQrHint:
        "No QR for this endpoint. Another device scanning a loopback link would dial itself; copy the URL for use on this machine instead.",
      setupRequired: "Setup required",
      default: "Default",
      restarting: "Restarting…",
      setup: "Setup",
      disable: "Disable",
      setDefault: "Set as default",
      hide: "Hide",
      reachableAt: "Reachable at",
    },
    status: {
      off: "Off",
      connecting: "Connecting",
      reconnectingError: (error: string) => `Reconnecting: ${error}`,
      reconnecting: "Reconnecting",
      unsupported: "Client not supported",
      failedError: (error: string) => `Connection failed: ${error}`,
      failed: "Connection failed",
      notConnected: "Not connected",
      restarting: "Restarting",
    },
    environment: {
      copyTraceToast: "Trace ID copied",
      copyTraceError: "Could not copy trace ID",
      copyMcpToast: "MCP URL copied",
      copyMcpHint: (url: string) =>
        `Add it to an agent, e.g. claude mcp add --transport http t3 ${url}`,
      copyMcpError: "Could not copy MCP URL",
      routes: "Routes",
      routeCount: (count: number) => `${count} routes`,
      serverLabel: (label: string) => `${label} server`,
      retryUpdate: "Retry update",
      switchOff: "Switch off",
      switchOn: "Switch on",
      actionsAriaLabel: (label: string) => `More actions for ${label}`,
      hideRoutes: "Hide routes",
      copyMcpUrl: "Copy MCP URL",
      copyTraceId: "Copy trace ID",
      removing: "Removing…",
      remove: "Remove from this device…",
      empty: "No saved remote environments",
      emptyCloudHint:
        "Click “Add environment” to pair another environment, or connect one from T3 Connect.",
      emptyHint: "Click “Add environment” to pair another environment.",
      routeAddedToast: "Route added",
      connectedToast: "Environment connected",
      addErrorDescription: "Failed to add backend.",
      addError: "Could not add backend",
      routeAddedHint: (label: string) => `${label} now has another way to connect.`,
      addedToast: "Backend added",
      addedHint: "The environment is saved and will reconnect on app startup.",
      removeErrorDescription: "Failed to remove backend.",
      removeError: "Could not remove backend",
      removeConfirmation: (label: string) =>
        `Remove ${label} from this device?\nThis forgets its pairing, credentials, and cached threads here. Switch it off instead to keep it saved.`,
      adding: "Adding…",
      addRoute: "Add route",
      addEnvironment: "Add environment",
      primary: "Primary environment",
      machineActionsAriaLabel: "More actions for this machine",
      version: "Version",
      primaryServerLabel: (label: string) => `${label} server`,
      server: "server",
      updateVersion: (version: string) => `Update to ${version}`,
      upToDate: "Up to date",
      noSelection: "No environment selected",
      connectHint: "Connect an environment to view its settings and access.",
      addRouteTitle: (label: string) => `Add a route to ${label}`,
      addTitle: "Add Environment",
      addRouteDescription:
        "Pair this machine again over another address, such as its Tailscale name. It joins the existing routes instead of adding a second machine.",
      addDescription: "Pair another environment to this client.",
      switchErrorDescription: (enabled: boolean) =>
        `Failed to switch the backend ${enabled ? "on" : "off"}.`,
      switchError: (enabled: boolean) => `Could not switch backend ${enabled ? "on" : "off"}`,
      switchAriaLabel: (enabled: boolean, label: string) =>
        `${enabled ? "Switch off" : "Switch on"} ${label}`,
      statusTooltip: (status: string, serverVersion: string | null, clientVersion: string | null) =>
        `${status}${serverVersion !== null && clientVersion !== null ? `\nUpdate available: ${serverVersion} → ${clientVersion}` : ""}`,
      switchedOff: "Switched off",
    },
    cloud: {
      enable: "Enable T3 Connect",
      signInError: "Sign in to T3 Connect to manage this environment.",
      permissionError: "Your session does not have permission to manage T3 Connect access.",
      linkedToast: "T3 Connect linked",
      tunnelDisabledToast: "T3 Connect tunnel disabled",
      unlinkedToast: "T3 Connect unlinked",
      linkedHint: "This environment is available through T3 Connect.",
      tunnelDisabledHint: "The managed tunnel was removed. Agent activity publishing stays on.",
      unlinkedHint: "This environment is no longer available through T3 Connect.",
      activityEnabledToast: "Agent activity enabled",
      activityDisabledToast: "Agent activity disabled",
      activityEnabledHint: "This environment publishes agent activity to your mobile clients.",
      activityDisabledHint: "This environment will stop publishing agent activity.",
      webhooksHeldToast: "Webhooks held while offline",
      webhooksNotHeldToast: "Webhooks no longer held",
      webhooksHeldHint:
        "T3 Connect keeps webhook requests for up to 24 hours while this environment is offline.",
      webhooksNotHeldHint:
        "Requests to an offline environment now fail. Anything already held is still delivered.",
      availableHint: "This environment is available to your other devices through T3 Connect.",
      enableHint: "Make this environment available to your other devices through T3 Connect.",
      activityDescription:
        "Send activity to mobile notifications and Live Activities without T3 Connect.",
      activityAriaLabel: "Publish agent activity to mobile clients",
      webhooksDescription:
        "Keep webhook requests for up to 24 hours while this environment is offline, then deliver them. Off: T3 Connect only forwards requests and stores nothing.",
      webhooksAriaLabel: "Hold webhook requests while this environment is offline",
      permissionsHint:
        "To edit these settings, pair this connection with both View relay and Manage relay permissions.",
      addRouteError: "Could not add the route.",
      routeAddedHint: (label: string) =>
        `${label} falls back to T3 Connect when its other routes are unreachable.`,
      fallbackHint: "This machine is on your T3 Connect account. Use it as a fallback route.",
      addRoute: "Add T3 Connect",
    },
    network: {
      updateErrorDescription: "Failed to update network exposure.",
      updateError: "Could not update network access",
      enable: "Enable network access",
      reachableAtHint: (url: string) => `Reachable at ${url}`,
      exposedHostHint: (host: string) => `Exposed on all interfaces. Pairing links use ${host}.`,
      exposedHint: "Exposed on all interfaces.",
      localHint: "Limited to this machine.",
      permissionHint: "This connection cannot view or change network exposure.",
      configuredHint:
        "Remote access is already configured. Change network exposure where the server starts.",
      loopbackHint:
        "Only this machine can connect. Restart with a non-loopback host for remote pairing.",
      unavailableHint: "Network exposure information is unavailable.",
      restartHint:
        "Network exposure changes restart the backend and must be controlled where the server process is launched.",
      enableTitle: "Enable network access?",
      disableTitle: "Disable network access?",
      enableDescription:
        "Let your other devices connect to T3 Code over the network. Pair devices to give them access. T3 Code will restart.",
      disableDescription:
        "Devices connected over your local network will disconnect. Existing tunnels, such as T3 Connect or Tailscale HTTPS, keep working. T3 Code will restart.",
      restartAndEnable: "Restart and enable",
      restartAndDisable: "Restart and disable",
    },
    tailscale: {
      setupErrorDescription: "Failed to configure Tailscale HTTPS.",
      setupError: "Could not set up Tailscale HTTPS",
      disableErrorDescription: "Failed to disable Tailscale HTTPS.",
      disableError: "Could not disable Tailscale HTTPS",
      availableDescription:
        "Use Tailscale Serve to expose this backend through a MagicDNS HTTPS URL.",
      startHint: "Start Tailscale to set up HTTPS access through MagicDNS.",
      enable: "Enable Tailscale HTTPS",
      disableTitle: "Disable Tailscale HTTPS?",
      disableDescription: "T3 Code will restart the local backend without Tailscale Serve.",
      setupTitle: "Set up Tailscale HTTPS?",
      setupDescription:
        "T3 Code will restart the local backend with Tailscale Serve enabled and ask Tailscale to proxy HTTPS traffic to this backend.",
      portLabel: "HTTPS port",
      invalidPortHint: "Enter a port from 1 to 65535.",
      endpointLabel: "HTTPS endpoint",
      pendingEndpoint: "Pending MagicDNS endpoint",
    },
    wsl: {
      updateErrorDescription: "Failed to update WSL backend.",
      updateError: "Could not change WSL backend",
      loadError: "Couldn't load the WSL backend state.",
      retrying: "Retrying…",
      unavailableHint:
        "WSL is unavailable, so Windows is running instead. Turn WSL off to clear this preference.",
      switchToWindows: "Switch to Windows",
      defaultDistro: "Default distro",
      description:
        "Run the selected WSL distro alongside Windows. Projects remain on their current filesystem.",
      defaultDistroSuffix: " (default)",
      onlyTitle: "WSL only",
      onlyDescription: "Run only the WSL backend. T3 Code restarts when this changes.",
      onlyAriaLabel: "Run WSL only",
      switchToWindowsTitle: "Turn off WSL and switch back to Windows?",
      disableTitle: "Disable WSL backend?",
      switchDistroTitle: "Switch WSL distro?",
      enableTitle: "Start the WSL backend",
      onlyTitleConfirmation: "Run only the WSL backend?",
      restoreWindowsTitle: "Re-enable the Windows backend?",
      switchToWindowsDescription:
        "T3 Code will restart on the Windows backend. Threads and projects opened against WSL stay safe inside the distro and become available again when you re-enable WSL.",
      disableDescription:
        "The WSL backend will stop. Threads and projects opened against WSL stay safe inside the distro, but they'll be unavailable in T3 Code until you re-enable WSL.",
      switchDistroDescription:
        "T3 Code will restart the WSL backend on the new distro. Sessions still running on the current distro will be interrupted.",
      enableDescription:
        "Run the WSL backend alongside the Windows one, or stop the Windows backend and use only WSL? You can change this later from Settings.",
      onlyDescriptionConfirmation:
        "T3 Code will restart and start only the WSL backend. Your Windows-side projects won't be accessible until you turn this off again.",
      restoreWindowsDescription:
        "T3 Code will restart and bring the Windows backend back up alongside WSL.",
      applying: "Applying…",
      selectWslOnly: "Use only WSL",
      runBoth: "Run both backends",
      disable: "Disable WSL",
      switchDistro: "Switch distro",
      startError: "WSL backend couldn't start:",
    },
  },
  scheduledTasks: {
    weekdays: {
      sunday: "Sun",
      monday: "Mon",
      tuesday: "Tue",
      wednesday: "Wed",
      thursday: "Thu",
      friday: "Fri",
      saturday: "Sat",
    },
    shortWeekdays: {
      sunday: "Su",
      monday: "Mo",
      tuesday: "Tu",
      wednesday: "We",
      thursday: "Th",
      friday: "Fr",
      saturday: "Sa",
    },
    workspaceOptions: {
      worktree: "Create a new worktree",
      root: "Use the project checkout",
      existing_worktree: "Use a specific checkout",
    } satisfies Record<ScheduledTask["workspaceStrategy"]["type"], string>,
    schedule: {
      webhook: "On webhook",
      intervalMinutes: (minutes: number) => `Every ${minutes} min`,
      intervalSeconds: (seconds: number) => `Every ${seconds} sec`,
      daily: "Daily",
      weekdays: "Weekdays",
      fixedTime: (days: string, time: string) => `${days} at ${time}`,
      unscheduled: "Not scheduled",
      underMinute: "in under a minute",
      inMinutes: (minutes: number) => `in ${minutes}m`,
      inHours: (hours: number) => `in ${hours}h`,
      inDays: (days: number) => `in ${days}d`,
    },
    outcomes: {
      accepted: "Ran",
      dispatch_failed: "Run failed",
      rejected_signature: "Bad signature",
      disabled: "Task paused",
      rate_limited: "Rate limited",
      expired: "Too old",
    } satisfies Record<ScheduledTaskWebhookDeliveryOutcome, string>,
    title: "Scheduled tasks",
    newTask: "New task",
    unavailableScope: "Unavailable selection",
    noEnvironments: "No environments available",
    connectHint: "Connect an environment to manage scheduled tasks.",
    disconnected: "Environment disconnected",
    reconnectHint: (environment: string) => `Reconnect ${environment} to view its scheduled tasks.`,
    loadError: "Could not load scheduled tasks",
    loading: "Loading scheduled tasks…",
    unavailableTask: "Task unavailable",
    unavailableTaskHint: "This task no longer exists or is outside the selected project scope.",
    empty: "No scheduled tasks",
    emptyScopeHint: "No tasks match this environment and project selection.",
    updateError: "Could not update scheduled task",
    paused: "Paused",
    listening: "Listening",
    nextRunHint: (time: string) => `Next run ${time}`,
    enableAriaLabel: (title: string) => `Enable ${title}`,
    actionsAriaLabel: (title: string) => `Actions for ${title}`,
    deliveries: {
      title: "Deliveries",
      description: "Recent requests to this task's webhook URL.",
      loadingDelivery: "Loading delivery…",
      signatureVerified: "Signature verified",
      promptTitle: "Prompt sent to the agent",
      noRunHint: "No run was started for this request.",
      emptyPlaceholders: "Empty placeholders:",
      headers: "Headers",
      query: "Query",
      bodyTruncated: "Body (truncated)",
      body: "Body",
      emptyBody: "(empty)",
      loading: "Loading deliveries…",
      empty: "No requests yet.",
      taskTitle: (title: string) => `Deliveries · ${title}`,
      missingFieldCount: (count: number) => `${count} empty placeholder${count === 1 ? "" : "s"}`,
    },
    webhook: {
      urlHint: "The URL appears after you save.",
      rotateConfirmation: "Rotate this webhook URL?\nThe current URL stops working.",
      rotateNativeConfirmation: "Rotate this webhook URL? The current URL stops working.",
      rotateError: "Could not rotate webhook URL",
      urlTitle: "Webhook URL",
      copied: "Copied",
      copy: "Copy",
      rotate: "Rotate",
      heldHint: "Held for up to 24 hours while this environment is offline. ",
      liveHint: "Forwarded live. Requests fail while this environment is offline. ",
      openConnections: "Change in Connections",
    },
    editor: {
      incompleteError: "Scheduled task is incomplete",
      incompleteHint: "Add a title, prompt, project, and model.",
      ageError: "Invalid age limit",
      ageErrorHint: (max: number) => `Enter whole minutes from 1 to ${max}, or leave it blank.`,
      secretError: "Signing secret is required",
      secretErrorHint: "Enter the signature header and secret.",
      intervalError: "Invalid interval",
      intervalErrorHint: "Enter an interval of at least one minute.",
      checkoutError: "Checkout path is required",
      checkoutErrorHint: "Enter the path of the checkout to run in.",
      saveError: "Could not save scheduled task",
      editTitle: "Edit task",
      description:
        "Run a prompt automatically — on an interval, at a fixed time, or when a webhook is called.",
      reconnectHint: "Reconnect this environment before saving.",
      environmentLabel: "Runs on",
      taskMissingHint: "This scheduled task no longer exists.",
      nameLabel: "Name",
      namePlaceholder: "e.g. Check for Sentry issues",
      projectPlaceholder: "Select a project",
      workspaceLabel: "Workspace",
      baseBranchLabel: "Base branch",
      checkoutLabel: "Checkout path",
      promptLabel: "Prompt",
      promptPlaceholder: "What should the agent do each time this runs?",
      modelLabel: "Model",
      legacyIntervalHint:
        "This task uses a legacy interval below one minute. Saving updates it to at least one minute.",
      scheduleLabel: "Schedule",
      scheduleAriaLabel: "Schedule type",
      fixedSchedule: "At a time",
      intervalSchedule: "Every interval",
      webhookPromptHint:
        "Each request runs the prompt. Use {{body.path}}, {{headers.name}}, {{query.name}}, {{body}} or {{request}} in the prompt; only what it names reaches the agent.",
      maxDeliveryAgeLabel: "Skip requests older than",
      maxDeliveryAgeHint: "minutes, optional",
      maxDeliveryAgePlaceholder: "Run every request",
      requireSignatureLabel: "Require signature",
      requireSignatureHint: "Reject requests without a valid HMAC-SHA256 signature of the body.",
      signatureHeaderLabel: "Header",
      signaturePrefixLabel: "Prefix",
      signaturePrefixPlaceholder: "None",
      signatureEncodingLabel: "Encoding",
      signatureSecretLabel: "Secret",
      signatureSecretUnchanged: "Unchanged",
      signatureSecretPlaceholder: "Shared secret",
      timeLabel: "Run at",
      weekdaysConnector: "on",
      weekdaysAriaLabel: "Days to run",
      intervalLabel: "Run every",
      intervalUnit: "minutes",
      enabledLabel: "Enabled",
      enabledHint: "Disabled tasks stay saved but do not run.",
      save: "Save task",
      create: "Create task",
    },
  },
  resourceTelemetry: {
    historyWindows: {
      fiveMinutes: "5m",
      fifteenMinutes: "15m",
      thirtyMinutes: "30m",
      oneHour: "1h",
    },
    cpuTime: {
      seconds: (value: string) => `${value}s`,
      minutes: (value: string) => `${value}m`,
      hours: (value: string) => `${value}h`,
    },
    categories: {
      server: "Server",
      serverChild: "Backend child",
      provider: "Provider",
      terminal: "Terminal",
      electronMain: "Electron main",
      renderer: "Renderer",
      electronUtility: "Electron utility",
      monitor: "Monitor",
      other: "T3 process",
    },
    ioSemantics: {
      storage: "Storage bytes",
      logical: "Logical bytes",
      all: "All I/O bytes",
    },
    unavailable: "Unavailable",
    unknown: "Unknown",
    waitingSample: "Waiting for sample",
    updated: "Updated",
    labels: {
      cpu: "CPU",
      memory: "Memory",
      read: "Read",
      write: "Write",
      cpuAverage: "CPU average",
      ioReads: "I/O reads",
      ioWrites: "I/O writes",
      cpuAvg: "CPU avg",
      cpuPeak: "CPU peak",
    },
    desktopOnlyHint: "Available when this page runs inside the desktop app.",
    noErrors: "No reported errors",
    desktopOnly: "Desktop only",
    historyPeriodAriaLabel: "Resource history period",
    expandAriaLabel: (name: string) => `Expand ${name}`,
    collapseAriaLabel: (name: string) => `Collapse ${name}`,
    columns: {
      process: "Process",
      category: "Category",
      cpuTime: "CPU Time",
      readRate: "Read/s",
      writeRate: "Write/s",
      readTotal: "Read Total",
      writeTotal: "Write Total",
      pid: "PID",
      kill: "Kill",
      peakCpu: "Peak CPU",
      peakMemory: "Peak Mem",
      samples: "Samples",
      component: "Component",
      operation: "Operation",
      logicalRead: "Logical Read",
      logicalWrite: "Logical Write",
      count: "Count",
      time: "Time",
    },
    processes: {
      waiting: "Waiting for the native process monitor.",
      emptyHistory: "No retained process samples in this window.",
      title: "Live process tree",
      identityLabel: "Identity:",
      identityHint: "PID + start time",
    },
    attribution: {
      empty: "No instrumented application I/O has been recorded yet.",
      title: "Instrumented application I/O",
      subtitle: "Logical bytes by operation",
      description:
        "Native counters identify which process is reading or writing. These application-level counters identify known T3 operations so process spikes can be correlated with specific persistence and logging paths.",
    },
    signal: {
      killConfirmation: (pid: number) =>
        `Send SIGKILL to process ${pid}? This cannot be handled by the process.`,
      confirmError: "Could not confirm signal",
      sendErrorDescription: (signal: string) => `Failed to send ${signal}.`,
      sendError: (signal: string) => `Could not send ${signal}`,
      processErrorDescription: (signal: string, pid: number) =>
        `Failed to send ${signal} to process ${pid}.`,
    },
    monitor: {
      retryError: "Could not restart resource monitor",
      retryErrorDescription: "The resource monitor retry failed.",
      title: "Resource monitor",
      native: "Native",
      refreshAriaLabel: "Refresh resource telemetry",
      refresh: "Refresh telemetry snapshot",
    },
    footprint: {
      title: "T3 system footprint",
      description:
        "Live native counters for the server, providers, terminals, desktop processes, and the monitor itself.",
      sampleInterval: "Sampling every",
      cpu: "Current CPU",
      cpuHint: (time: string) => `${time} observed CPU time`,
      memory: "Resident memory",
      memoryHint: (bytes: string) => `${bytes} combined process peaks`,
      processCount: "Process count",
      processCountHint: (starts: number, exits: number) => `${starts} starts · ${exits} exits`,
      readRate: "Read throughput",
      ioHint: (bytes: string) => `${bytes} observed`,
      writeRate: "Write throughput",
      cpuLimit: "CPU speed limit",
      thermalHint: (state: string) => `${state} thermal state`,
      backend: "Backend + agents",
      desktop: "Desktop",
      monitor: "Monitor overhead",
      ioWriteHint: (bytes: string) => `${bytes} observed`,
      processCountLabel: (count: number) => `${count} ${count === 1 ? "process" : "processes"}`,
    },
    collection: {
      title: "Host & collection",
      retry: "Retry monitor",
    },
    host: {
      title: "Host state",
      powerSource: "Power source",
      battery: "Battery",
      externalPower: "External power",
      lowPower: "Low power mode",
      enabled: "Enabled",
      disabled: "Disabled",
      idle: "Idle",
      session: "Session",
      locked: "Locked",
      unlocked: "Unlocked",
      thermal: "Thermal",
      disconnected: "Desktop host signals not connected",
      disconnectedHint:
        "Power, idle, lock, and thermal state are supplied by the desktop host. Process telemetry remains fully active in this browser session.",
      idleStatus: (label: string, seconds: number | null) =>
        `${label}${seconds === null ? "" : ` · ${Math.round(seconds)}s`}`,
      active: "Active",
      suspended: "Suspended",
    },
    health: {
      title: "Collection health",
      nativeMonitor: "Native process monitor",
      electronMain: "Electron main process",
      collectionTime: "Collection time",
      scan: "Process scan",
      inaccessible: "Inaccessible",
      sidecar: "Sidecar",
      restarts: "Restarts",
      waiting: "Waiting for collector health.",
      retainedProcesses: (retained: number, scanned: number) => `${retained}/${scanned} retained`,
    },
    history: {
      title: "Resource timeline",
      refreshAriaLabel: "Refresh resource history",
    },
    sampleIntervalSeconds: (seconds: number) =>
      `${seconds.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${seconds === 1 ? "second" : "seconds"}`,
  },
  integrations: {
    profiles: {
      clearUnavailableError: "Browser profile data is not available to clear.",
      limitError: "Browser profile limit reached.",
      clearError: (name: string) => `Could not clear ${name}'s data`,
      connectHint: "You're not connected to a server yet.",
      clearedToast: (name: string) => `Cleared ${name}'s cookies and cache`,
      removeConnectError: "Connect to an environment before removing this profile.",
      removeError: "Profile data could not be deleted. Try again.",
      add: "Add profile",
      blankProfile: "Blank profile",
      limitHint: "You’ve reached the profile limit",
      importLabel: "Import from",
      loadingBrowsers: "Looking for browsers…",
      noBrowsers: "No supported browsers found",
      importConnectHint: "Connect to an environment to import cookies",
      renameAriaLabel: (name: string) => `Rename ${name}`,
      default: "Default",
      actionsAriaLabel: (name: string) => `${name} options`,
      setDefault: "Set as default",
      clear: "Clear cookies and cache",
      remove: "Remove profile and data",
      clearConnectHint: "Connect to an environment to clear profile data",
      checkingEnvironments: "Checking environments…",
      removeDescription:
        "Its cookies and logins are deleted. Desktop tabs already open in this profile stay open until you close them; server browser tabs close now.",
      removeConnectHint: "Connect to an environment to remove this profile and its data.",
      removing: "Removing…",
      removeProfile: "Remove profile",
      clearDescription:
        "You are signed out of its sites. Server browser tabs open in this profile close now.",
      clearData: "Clear data",
      openSettingsError: "Could not open System Settings",
      openSettingsHint: "Open Privacy & Security → Full Disk Access manually.",
      removeTitle: (name: string) => `Remove “${name}”?`,
      clearTitle: (name: string) => `Clear “${name}”’s cookies and cache?`,
    },
    devices: {
      disconnectedError: "Environment disconnected",
      permissionError: "This connection cannot change device settings.",
      saveError: "Device settings not saved on all environments",
      saveErrorHint: (labels: string) => `Could not update ${labels}.`,
      updateError: "Update failed. Check this host's network connection and try again.",
      updating: "Updating…",
      updateVersion: (version: string) => `Update to v${version}`,
      checking: "Checking…",
      checkVersions: "Check versions",
      android: "Android",
      environmentHint: (label: string | undefined) =>
        `Status for ${label}. Select an environment to inspect its simulator support.`,
    },
    desktopOnlyHint: "Only available in the desktop app.",
  },
  codexSetup: {
    account: {
      signedInPrefix: "Signed in as",
      emailAriaLabel: "Toggle account email visibility",
      revealEmailTooltip: "Click to reveal email",
      hideEmailTooltip: "Click to hide email",
      subscriptionHint: "Code with your ChatGPT subscription.",
      continueWithChatGpt: "Continue with ChatGPT",
      openSignIn: "Open sign-in page",
      title: "ChatGPT account",
      preparing: "Preparing sign-in.",
      callbackError:
        "Could not finish sign-in on this computer. Try again or paste the redirect URL below.",
      finishing: "Finishing sign-in...",
      continueAsHint: (email: string) => `Continue as ${email} on OpenAI.`,
      finishInBrowserHint: "Finish signing in in your browser.",
      signedInHint: "Signed in with ChatGPT.",
      subscriptionDescription: "Use your ChatGPT subscription.",
      retryConnection: "Retry connection",
      openChatGptSignIn: "Open ChatGPT sign-in",
      signingIn: "Signing in...",
      callbackHint:
        "If sign-in doesn't return to T3 Code, paste the URL from the final localhost page.",
      callbackAriaLabel: "ChatGPT sign-in redirect URL",
      callbackPlaceholder: "Paste the URL from the sign-in tab",
      tryBrowser: "Try sign-in in your browser",
      otherConnections: "Other ways to connect",
      connectWithDesktop: "Use T3 desktop for automatic return",
      troubleHint: "Having trouble signing in?",
      connectedHint: "Connected to ChatGPT.",
      settingUp: "Setting up...",
      reconnect: "Reconnect account",
      switchAccount: "Use a different account",
      change: "Change account",
      browserHint: "Complete sign-in in your browser.",
      sentenceEnd: ".",

      emailSeparator: " ",
    },
    existing: {
      connectedHint: "Connected with your Codex CLI.",
      checkingHint: "Checking your Codex CLI...",
      selectExistingCli: "Use existing CLI",
    },
    ready: "Ready",
    checking: "Checking...",
    setupError: "Codex setup failed. Try again.",
    handoff: {
      finishError: "ChatGPT sign-in could not finish. Try again.",
      interruptedError: "ChatGPT sign-in on the primary environment was interrupted. Try again.",
    },
    runtime: {
      installing: "Installing Codex.",
      checking: "Checking Codex.",
      managedHint: "T3 Code downloads and manages Codex for you.",
      downloading: (downloaded: string, total: string | null) =>
        `Downloading ${downloaded}${total === null ? "" : ` of ${total}`} MB.`,
      installedHint: (local: boolean, version: string | null | undefined) =>
        `${local ? "Using your installed Codex" : "Managed by T3 Code"}${version ? ` · v${version}` : ""}.`,
    },
    statusError: "Could not read setup status. Reconnect and try again.",
    ariaLabel: "Codex setup",
    statusErrorDescription: "Could not read Codex setup status. Reconnect and try again.",
    binaryPath: {
      title: "Binary path",
      description: "Selected by T3 Code.",
      ariaLabel: "Codex binary path",
      errorPlaceholder: "Could not read runtime path",
      emptyPlaceholder: "Not installed",
    },
    homePath: {
      title: "CODEX_HOME path",
      description: "Shared Codex config, sessions, and state.",
      ariaLabel: "Codex home path",
    },
    unavailable: "Unavailable",
    shadowPath: {
      title: "Shadow home path",
      description: "Account-specific home sharing the Codex state above.",
      sharedDescription: "This instance uses the shared Codex home directly.",
      ariaLabel: "Codex shadow home path",
      emptyPlaceholder: "Not used",
    },
  },
  snapShotSetup: {
    steps: {
      access: "Access",
      shortcut: "Shortcut",
    },
    gnome: {
      access: {
        "not-installed": {
          title: "Install the extension",
          description:
            "The T3 Code GNOME extension lets you capture other windows and bring them into your draft. Sign out once after installing.",
        },
        "restart-required": {
          title: "Extension installed",
          description:
            "Save your work, then sign out and back in. Your setup will be waiting here.",
        },
        "update-required": {
          title: "Update the extension",
          description: "Install the update, then sign out and back in.",
        },
        "extensions-disabled": {
          title: "Allow GNOME extensions",
          description: "Open GNOME Extensions and turn on extensions, then check again.",
        },
        disabled: {
          title: "Enable the extension",
          description: "Enable T3 Code SnapShots to start capturing windows.",
        },
        enabled: {
          title: "Capture is ready",
          description: "Next, choose your shortcut.",
        },
        unsupported: {
          title: "Automatic capture isn't available",
          description: "Use Take snapshot from the command palette to choose a window.",
        },
        error: {
          title: "Couldn't set up the extension",
          description: "Check T3 Code SnapShots in GNOME Extensions, then try again.",
        },
      } satisfies Record<
        NonNullable<DesktopSnapShotState["gnomeExtension"]>["status"],
        { title: string; description: string }
      >,
      update: "Update extension",
      install: "Install extension",
      enable: "Enable extension",
    },
    permissionError: "Permission status unavailable",
    checkError: {
      title: "Let's try that again",
      description: "Couldn't check snapshots. Try again to continue.",
    },
    accessCheck: {
      title: "Check capture access",
      description: "The extension isn't ready yet. Try again in a moment.",
    },
    helper: {
      error: {
        title: "Let's fix capture access",
        description: "Try reinstalling the capture helper, then check again.",
      },
      updateTitle: "Update the capture helper",
      installTitle: "Allow snapshots",
      description:
        "T3 Code's capture helper lets you capture other apps and return to your draft. It's included with T3 Code.",
      reinstall: "Reinstall helper",
      update: "Update helper",
      install: "Install helper",
    },
    picker: {
      title: "Choose a window each time",
      description:
        "Your desktop doesn't support automatic capture. You'll choose the window to capture instead.",
    },
    access: {
      portalHint: "Your desktop may ask for permission when you first capture.",
      macTestHint:
        "Test a snapshot of the current window. If macOS asks to bypass its window picker, choose Allow. The test image is discarded.",
      macPermissionsHint: "Allow each permission, then continue.",
      allowHint: "Allow access when prompted to start capturing windows.",
      attentionHint: "Capture needs attention. Go back to check access.",
      testAndContinue: "Test capture and continue",
      allow: "Allow capture",
    },
    shortcut: {
      title: "Choose your shortcut",
      configHint: "Click the shortcut, then press the keys you want.",
      modifierPairHint: "Choose your keys, then approve the permission prompt if asked.",
      defaultHint: "Use both Shift keys, or record a different shortcut.",
      permissionTitle: "Shortcut permissions",
    },
    desktopTitle: (desktop: string) => `Set up snapshots for ${desktop}`,
    title: "Set up snapshots",
    permissions: {
      screenRecording: {
        title: "Screen Recording",
        description: "Capture the window you're using.",
      },
      accessibility: {
        title: "Accessibility",
        description: "Include text and controls from the captured app.",
        optionalDescription: "Optional. Include text and controls from the captured app.",
      },
    },
    retry: "Try again",
    stepError: "Couldn't finish this step. Try again or check Advanced for help.",
    advanced: {
      includedHint: "Included with T3 Code. No download needed.",
      disableExtension: "Disable extension",
      removeHelper: "Remove capture helper",
    },
    finishLater: "Finish later",
    checking: "Checking…",
    installing: "Installing…",
    checkAgain: "Check again",
    enabling: "Enabling…",
    working: "Working…",
    saving: "Saving…",
    saveAndFinish: "Save and finish",
    checkMessages: {
      error: "Still unable to check access. See Advanced for help.",
      pickerReady: "Ready. You'll choose a window each time.",
      restartRequired: "Still waiting for you to sign out and back in.",
      ready: "Ready. Continue to choose your shortcut.",
      notReady: "Not ready yet. Finish the step above.",
    },
  },
  acpRegistrySearchStep: {
    theAcpCouldNotBePrepared: "The ACP could not be prepared.",
    chooseAnAgent: "Choose an agent",
    searchAcpRegistry: "Search ACP Registry",
    searchAgents: "Search agents…",
    enterManually: "Enter manually",
    localAcpCommand: "Local ACP command",
    searchingTheAcpRegistry: "Searching the ACP Registry.",
    refreshingAcpRegistryResults: "Refreshing ACP Registry results.",
    compatibleFound: (
      resultCount: string | number | boolean | null | undefined,
      resultCount1: boolean,
    ) => `${resultCount} compatible ${resultCount1 ? "agent" : "agents"} found.`,
    searchingTheRegistry: "Searching the registry...",
    noCompatibleAgentsFound: "No compatible agents found",
    tryABroaderSearch: "Try a broader search.",
    downloading: "Downloading",
    preparing: "Preparing",
    about: (agentName: string | number | boolean | null | undefined) => `About ${agentName}`,
    agentActionAriaLabel: (
      alreadyAdded: boolean,
      isPreparing: boolean,
      progressLabel: string | number | boolean | null | undefined,
      agentName: string | number | boolean | null | undefined,
    ) => `${alreadyAdded ? "Already added" : isPreparing ? progressLabel : "Add"} ${agentName}`,
    added: "Added",
    add: "Add",
  },
  acpSessionManagement: {
    theAcpOperationFailed: "The ACP operation failed.",
    couldNotListAcpSessions: "Could not list ACP sessions",
    acpSessionImported: "ACP session imported",
    acpSessionAlreadyImported: "ACP session already imported",
    couldNotImportAcpSession: "Could not import ACP session",
    permanentlyDeleteNativeAcpSessionHint: (
      sessionTitle: string | number | boolean | null | undefined,
      sessionSessionId: string | number | boolean | null | undefined,
    ) => `Permanently delete native ACP session "${sessionTitle ?? sessionSessionId}"?`,
    acpSessionDeleted: "ACP session deleted",
    couldNotDeleteAcpSession: "Could not delete ACP session",
    couldNotListAcpProviders: "Could not list ACP providers",
    headersMustJsonObjectStringError: "Headers must be a JSON object with string values.",
    invalidProviderHeaders: "Invalid provider headers",
    headersMustBeValidJson: "Headers must be valid JSON.",
    acpProviderConfigured: "ACP provider configured",
    couldNotConfigureAcpProvider: "Could not configure ACP provider",
    disableAcpProvider: (providerProviderId: string | number | boolean | null | undefined) =>
      `Disable ACP provider "${providerProviderId}"?`,
    acpProviderDisabled: "ACP provider disabled",
    couldNotDisableAcpProvider: "Could not disable ACP provider",
    loggedOutOfAcpAgent: "Logged out of ACP agent",
    couldNotLogOutOfAcpAgent: "Could not log out of ACP agent",
    nativeSessions: "Native sessions",
    resumeAgentOwnedConversationsTHint: "Resume agent-owned conversations as T3 threads.",
    addProjectBeforeImportingSessionsHint: "Add a project before importing sessions.",
    loggingOut: "Logging out",
    logOut: "Log out",
    projectForAcpSessions: "Project for ACP sessions",
    loading: "Loading",
    listSessions: "List sessions",
    imported: "Imported",
    importing: "Importing",
    import: "Import",
    deleting: "Deleting",
    loadMore: "Load more",
    agentProviders: "Agent providers",
    configureNonSecretRoutingHeadersHint: "Configure non-secret routing. Headers are write-only.",
    listProviders: "List providers",
    projectForAcpProviders: "Project for ACP providers",
    configured: "Configured",
    required: " · Required",
    saving: "Saving",
    save: "Save",
    protocol: (providerProviderId: string | number | boolean | null | undefined) =>
      `${providerProviderId} protocol`,
    baseUrl: (providerProviderId: string | number | boolean | null | undefined) =>
      `${providerProviderId} base URL`,
    writeOnlyHeadersJson: (providerProviderId: string | number | boolean | null | undefined) =>
      `${providerProviderId} write-only headers JSON`,
    writeOnlyHeadersJsonEG: 'Write-only headers JSON, e.g. {"Authorization":"Bearer …"}',
  },
  addCodexAccount: {
    addChatGptAccount: "Add ChatGPT account",
    eachAccountOwnCodexInstanceHint:
      "Each account has its own Codex instance and sign-in. Choose the other account on the sign-in page.",
    codexRuntime: "Codex runtime",
    preparingManagedSetup: "Preparing managed setup.",
    accountName: "Account name",
    shownProviderListModelPickerHint: "Shown in the provider list and model picker.",
    eGPersonalOrWork: "e.g. Personal or Work",
    addingAccount: "Adding account…",
  },
  addProviderInstance: {
    identity: "Identity",
    config: "Config",
    signIn: "Sign in",
    instanceIdRequiredError: "Instance ID is required.",
    instanceIdLengthError: "Instance ID must be 64 characters or fewer.",
    instanceIdFormatError:
      "Instance ID must start with a letter and use only letters, digits, '-', or '_'.",
    anInstanceNamedAlreadyExists: (id: string | number | boolean | null | undefined) =>
      `An instance named '${id}' already exists.`,
    executableIsRequired: "Executable is required.",
    selectAcpConfigureOneManuallyHint: "Select an ACP or configure one manually.",
    localAcpCommand: "Local ACP command",
    addInstanceError: "Could not add provider instance",
    theSettingsUpdateFailed: "The settings update failed.",
    instanceAddedToast: "Provider instance added",
    instanceWasAdded: (
      driverOptionLabel: string | number | boolean | null | undefined,
      instanceId: string | number | boolean | null | undefined,
    ) => `${driverOptionLabel} instance '${instanceId}' was added.`,
    addProvider: "Add provider",
    addAccountConfigureProviderHint: (
      environmentLabel: string | number | boolean | null | undefined,
    ) => `Add an account or configure a provider on ${environmentLabel}.`,
    orChooseFromAcpRegistry: "Or choose from ACP Registry",
    enterManually: "Enter manually",
    runAnInstalledAcpExecutableOn: (
      environmentLabel: string | number | boolean | null | undefined,
    ) => `Run an installed ACP executable on ${environmentLabel}.`,
    enterOfficialRegistryIdAnyHint:
      "Enter an official registry ID and any local executable or auth override.",
    searchRegistry: "Search registry",
    openDocumentationFor: (
      selectedAcpName: string | number | boolean | null | undefined,
      selectedAcpId: string | number | boolean | null | undefined,
    ) => `Open documentation for ${selectedAcpName} (${selectedAcpId})`,
    docs: "Docs",
    openSourceFor: (
      selectedAcpName: string | number | boolean | null | undefined,
      selectedAcpId: string | number | boolean | null | undefined,
    ) => `Open source for ${selectedAcpName} (${selectedAcpId})`,
    source: "Source",
    label: "Label",
    shownInTheProviderList: "Shown in the provider list.",
    eGWork: "e.g. Work",
    instanceId: "Instance ID",
    lettersDigitsOr: "Letters, digits, '-', or '_'.",
    accentColor: "Accent color",
    optionalMarkerShownInThePicker: "Optional marker shown in the picker.",
    driverRequiredConfigurationAddInstanceError:
      "This driver has no required configuration. You can add the instance now.",
    configureManually: "Configure manually",
    next: "Next",
    adding: "Adding...",
    continueToSignIn: "Continue to sign-in",
    addInstance: "Add instance",
  },
  addUsageLimitSource: {
    addACliproxyApiHub: "Add a CLIProxyAPI hub",

    hubUrl: "Hub URL",
    managementKey: "Management key",
    labelOptional: "Label (optional)",
    defaultsToTheHubSHostName: "Defaults to the hub's host name",
    addHub: "Add hub",

    description: (environmentLabel: string) =>
      `Show the quota of every account the hub pools, next to the providers on ${environmentLabel}. The key stays on that server.`,
  },
  branchNaming: {
    worktreeBranchesNamedFirstMessageHint:
      "Choose how new worktree branches are named from your first message.",
    branchNaming: "branch naming",
    branchPrefix: "Branch prefix",
    exampleTTProducesTHint:
      "For example, t3 or t3/ produces t3/add-search. Leave empty for no prefix.",
    prefixResetLabel: "branch prefix",
    noPrefix: "No prefix",
    modelChoosesPrefixDescribesWorkHint:
      "The model chooses a prefix that describes the work, such as feat/add-search, fix/login-timeout, or refactor/auth.",
    branchNamingInstructions: "Branch naming instructions",
    appendedNamingPromptModelReturnsHint:
      "Appended to the naming prompt. The model returns the complete branch name; no prefix or suffix is added.",
    instructionsResetLabel: "branch naming instructions",
    mixedEnterInstructionsApplyAllHint:
      "Mixed. Enter instructions to apply to all selected targets.",
    juliusFollowedIssueIdShortHint: "Use julius/ followed by the issue ID and a short description.",
  },
  browserImportWizard: {
    and: (
      domainsSlice01Join: string | number | boolean | null | undefined,
      domainsAt1: string | number | boolean | null | undefined,
    ) => `${domainsSlice01Join} and ${domainsAt1}`,
    andMore: (
      domainsSlice03Join: string | number | boolean | null | undefined,
      domainsLength3: string | number | boolean | null | undefined,
    ) => `${domainsSlice03Join} and ${domainsLength3} more`,
    profileLongerAvailableImportCookiesHint:
      "That profile is no longer available. Choose where to import these cookies.",
    quitToImport: (sourceName: string | number | boolean | null | undefined) =>
      `Quit ${sourceName} to import`,
    openCookiesRsquoTReadHint: (sourceName: string | number | boolean | null | undefined) =>
      `${sourceName} is open, so its cookies can’t be read yet. Quit it, then continue.`,
    iVeQuitIt: "I’ve quit it",
    noCookies: "no cookies",
    cookieCount: (count: string | number | boolean | null | undefined, count1: boolean) =>
      `${count} ${count1 ? "cookie" : "cookies"}`,
    openSystemSettingsTryAllowError: "Could not open System Settings. Try Allow again.",
    letT3CodeReadRsquoSCookies: (sourceName: string | number | boolean | null | undefined) =>
      `Let T3 Code read ${sourceName}’s cookies`,
    importCookiesTCodeNeedsError: (sourceName: string | number | boolean | null | undefined) =>
      `To import cookies from ${sourceName}, T3 Code needs Full Disk Access. Turn it on in System Settings, then come back to finish the import — you can revoke it again once the import is done.`,
    fullDiskAccess: "Full Disk Access",
    readSCookiesForThisImport: (sourceName: string | number | boolean | null | undefined) =>
      `Read ${sourceName}'s cookies for this import.`,
    accessStillRequiredQuitReopenError:
      "Access is still required. Quit and reopen T3 Code if you just allowed it, then retry the import.",
    ifAccessDoesnTUpdateHint:
      "If access doesn't update after you allow it, quit and reopen T3 Code, then retry the import.",
    veReachedProfileLimitExistingHint:
      "You've reached the profile limit. Choose an existing profile to import into.",
    importFrom: (sourceName: string | number | boolean | null | undefined) =>
      `Import from ${sourceName}`,
    chooseWhichCookiesToImportFor: (
      destinationEnvironmentName: string | number | boolean | null | undefined,
    ) => `Choose which cookies to import for ${destinationEnvironmentName}.`,
    from: "From",
    into: "Into",
    newProfile: "New profile",
    createdForTheseCookies: "Created for these cookies",
    existingProfile: "Existing profile",
    import: "Import",
    importingCookies: "Importing cookies",
    thisMayTakeAMoment: "This may take a moment.",
    importing: "Importing…",
    checking: (sourceName: string | number | boolean | null | undefined) =>
      `Checking ${sourceName}`,
    checkingFullDiskAccess: "Checking Full Disk Access.",
    checkingWhetherBrowserClosedHint: "Checking whether the browser has closed.",
    checkingAccess: "Checking access…",
    imported: (cookieResultCountImported: string | number | boolean | null | undefined) =>
      `Imported ${cookieResultCountImported}`,
    skipped: (cookieResultCountSkipped: string | number | boolean | null | undefined) =>
      `Skipped ${cookieResultCountSkipped}`,
    noCookiesFound: "No cookies found",
    addedToForSkipped: (
      targetName: string | number | boolean | null | undefined,
      destinationEnvironmentName: string | number | boolean | null | undefined,
      skipped0: boolean,
      cookieResultCountSkipped: string | number | boolean | null | undefined,
    ) =>
      `Added to ${targetName} for ${destinationEnvironmentName}.${skipped0 ? ` ${cookieResultCountSkipped} skipped.` : ""}`,
    noCookiesWereImportedFor: (
      destinationEnvironmentName: string | number | boolean | null | undefined,
    ) => `No cookies were imported for ${destinationEnvironmentName}.`,
    thereWereNoCookiesToImportFor: (
      destinationEnvironmentName: string | number | boolean | null | undefined,
    ) => `There were no cookies to import for ${destinationEnvironmentName}.`,
    skippedBadge: "Skipped",
    couldnRsquoTImportFrom: (sourceName: string | number | boolean | null | undefined) =>
      `Couldn’t import from ${sourceName}`,
  },
  captureShortcutConfig: {
    couldnTPrepareChangesCheckError: "Couldn't prepare the changes. Check Advanced for help.",
    shortcutSaved: "Shortcut saved",
    shortcutUsageHint: (previewShortcut: string | number | boolean | null | undefined) =>
      `Use ${previewShortcut} from another app.`,
    couldnTSaveShortcutReviewError:
      "Couldn't save your shortcut. Review the changes and try again.",
    pressYourShortcutEscCancels: "Press your shortcut. Esc cancels.",
    savedButShortcutNeedsAttentionError:
      "Saved, but the shortcut needs attention. Check Advanced for help.",
    shortcutRemoved: "Shortcut removed.",
    anotherAppCaptureWindowHint: (previewShortcut: string | number | boolean | null | undefined) =>
      `Use ${previewShortcut} from another app to capture a window.`,
    reviewChangeBelowRemoveShortcutHint: "Review the change below to remove your shortcut.",
    reviewChangeBelowSaveShortcutHint: "Review the change below, then save your shortcut.",
    thereSNoCaptureShortcutToRemove: "There's no capture shortcut to remove.",
    thisShortcutIsAlreadySetUp: "This shortcut is already set up.",
    shortcutChanges: "Shortcut changes",
    changesSavedWeLlKeepHint: "Only these changes will be saved. We'll keep a backup.",
    saveShortcut: "Save shortcut",
    removeShortcut: "Remove shortcut",
    allowTCodeReadDesktopHint:
      "Allow T3 Code to read your desktop settings. You'll review any changes here before saving.",
    preparingChanges: "Preparing changes…",
    reviewChanges: "Review changes",
    updateTCodeFinishSettingHint: "Update T3 Code to finish setting up your shortcut.",
    connectingToYourDesktop: "Connecting to your desktop…",
    restartTCodeFinishConnectingHint: "Restart T3 Code to finish connecting your shortcut.",
    troubleshooting: "Troubleshooting",
    settingsFile: "Settings file",
    tCodeAlsoReadsAnyHint: "T3 Code also reads any files included by this file.",
    linkedToTheLinkWillBeKept: (
      previewResolvedPath: string | number | boolean | null | undefined,
    ) => `Linked to ${previewResolvedPath}. The link will be kept.`,
    chooseADifferentFile: "Choose a different file…",
    openRemoveShortcut: "Remove shortcut…",
    desktopSShortcutSettingsFileHint: "Use your desktop's shortcut settings file.",
    customConfigNiriConfigChangeHint: "A custom --config or NIRI_CONFIG can change its location.",
    omarchyOwnBindingsFileDefaultsHint: "On Omarchy, use your own bindings file, not its defaults.",
    backup: (resultBackupPath: string | number | boolean | null | undefined) =>
      `Backup: ${resultBackupPath}`,
    manualSetup: "Manual setup",
    pasteInsideBindsNiriConfigHint: "Paste this inside binds { … } in your Niri config, then save.",
    addBindingHyprlandConfigSaveHint: "Add this binding to your Hyprland config, then save.",
    changeTheKeysIfNeeded: "Change the keys if needed.",
    copyShortcut: "Copy shortcut",
    turnCaptureOffTCodeHint: (desktop: string | number | boolean | null | undefined) =>
      `Turn capture off in T3 Code to stop it. Remove the shortcut from ${desktop} to free up the keys.`,
    iVeAddedTheShortcut: "I've added the shortcut",
  },
  chatGptAccountPicker: {
    reconnectChatGpt: "Reconnect ChatGPT",
    openAiSignAccountHint: "On OpenAI, sign in with the account you choose here.",
    chatGptAccountToConnect: "ChatGPT account to connect",
  },
  chatGptUsageButton: {
    manageUsage: "Manage usage",
  },
  chatGptWelcomeCoordinator: {
    yourChatGptPlanIsConnected: "Your ChatGPT plan is connected",
    eligibleUsageTCodeUsesHint:
      "Eligible usage in T3 Code uses your ChatGPT plan. Manage your shared usage and any credit settings in ChatGPT.",
    on: (
      nextProviderName: string | number | boolean | null | undefined,
      nextEnvironmentLabel: string | number | boolean | null | undefined,
    ) => `${nextProviderName} on ${nextEnvironmentLabel}`,
  },
  customModelEditor: {
    option: (index1: string | number | boolean | null | undefined) => `Option ${index1}`,
    needsAnId: (position: string | number | boolean | null | undefined) =>
      `${position} needs an id.`,
    idIsUsedTwice: (
      position: string | number | boolean | null | undefined,
      id: string | number | boolean | null | undefined,
    ) => `${position}: id "${id}" is used twice.`,
    needsALabel: (position: string | number | boolean | null | undefined) =>
      `${position} needs a label.`,
    needsAtLeastOneChoice: (position: string | number | boolean | null | undefined) =>
      `${position} needs at least one choice.`,
    hasAChoiceWithoutAValue: (position: string | number | boolean | null | undefined) =>
      `${position} has a choice without a value.`,
    choiceIsUsedTwice: (
      position: string | number | boolean | null | undefined,
      choiceId: string | number | boolean | null | undefined,
    ) => `${position}: choice "${choiceId}" is used twice.`,
    value: "value",
    choiceValue: "Choice value",
    label: "Label",
    choiceLabel: "Choice label",
    defaultChoice: "Default choice",
    removeChoice: "Remove choice",
    optionLabelPrefix: "Option ",
    optionId: "Option id",
    custom: "Custom…",
    optionLabel: "Option label",
    optionType: "Option type",
    toggle: "Toggle",
    choices: "Choices",
    removeOption: (index1: string | number | boolean | null | undefined) =>
      `Remove option ${index1}`,
    addChoice: "Add choice",
    displayName: "Display name",
    optionsShownInTheComposer: "Options shown in the composer",
    copyOptionsFromABuiltInModel: "Copy options from a built-in model",
    copyFrom: "Copy from…",
    customOptionsComposerUsesProviderHint:
      "No custom options. The composer uses the provider's default options.",
    customOption: "Custom option",
    save: "Save",
  },
  deviceHostEditor: {
    addDeviceHost: "Add device host",
    editDeviceHost: "Edit device host",
    connectFrom: (targets0Label: string | number | boolean | null | undefined) =>
      `Connect from ${targets0Label}.`,
    connectFromSelectedEnvironments: (
      targetsLength: string | number | boolean | null | undefined,
    ) => `Connect from ${targetsLength} selected environments.`,
    hostsOnTheSameMachineAreSkipped: "Hosts on the same machine are skipped.",
    sshTarget: "SSH target",
    userHostOrSshAlias: "user@host or SSH alias",
    sshOptions: "SSH options",
    identityFile: "Identity file",
    sshConfigDefault: "SSH config default",
    optionalResolvedSeparatelyEachEnvironmentHint:
      "Optional. Resolved separately on each environment.",
    ofFailed: (
      failed: string | number | boolean | null | undefined,
      targetsLength: string | number | boolean | null | undefined,
    ) => `${failed} of ${targetsLength} failed`,
    connectionChecksPassed: "Connection checks passed",
    checkAccessBeforeSaving: "Check access before saving",
    testConnection: " Test connection",
    checking: " Checking…",
    alreadyAvailableLocally: " Already available locally",
    failed: " Failed",
    connected: " Connected",
    showError: "Show error",
    saveHost: " Save host",
  },
  deviceHosts: {
    multipleHostsMatchSshDestinationHint:
      "Multiple hosts match this SSH destination. Select the environment to edit its hosts.",
    deviceHostsSavedAllEnvironments: "Device hosts not saved on all environments",
    couldNotUpdate: (value: string | number | boolean | null | undefined) =>
      `Could not update ${value}.`,
    addRemoteMachinesSimulatorEmulatorHint:
      "Add remote machines with simulator or emulator runtimes installed, and the selected environments will connect over SSH and set up device tools automatically.",
    addHost: " Add host",
    connectSelectedEnvironmentManageDeviceHint:
      "Connect a selected environment to manage device hosts.",
    ofEnvironmentsFailed: (
      hostLabel: string | number | boolean | null | undefined,
      failedLength: string | number | boolean | null | undefined,
      targetsLength: string | number | boolean | null | undefined,
    ) => `${hostLabel}: ${failedLength} of ${targetsLength} environments failed`,
    connectionChecksPassed: (hostLabel: string | number | boolean | null | undefined) =>
      `${hostLabel}: connection checks passed`,
    couldNotConnectFrom: (
      failedMapTargetTargetLabelJoin: string | number | boolean | null | undefined,
    ) => `Could not connect from ${failedMapTargetTargetLabelJoin}.`,
    connectedAlreadyAvailableLocallyEachHint:
      "Connected or already available locally on each selected environment.",
    noDeviceHosts: "No device hosts.",
    checkingConnection: "Checking connection…",
    installingDeviceSupport: "Installing device support…",
    connecting: "Connecting…",
    iOsAvailable: "iOS available",
    androidAvailable: "Android available",
    alreadyAvailableLocally: "Already available locally",
    options: " options",
    remove: "Remove",
    testConnection: "Test connection",
  },
  environmentIconPicker: {
    connectEnvironmentChangeIconHint: "Connect to this environment to change its icon.",
    environmentSServerTooOldHint:
      "This environment's server is too old to keep an icon. Update it to choose one.",
    sessionEnvironmentChangeSettingsError:
      "Your session on this environment cannot change its settings.",
    icon: "Icon",
    detected: "detected",
    default: "default",
  },
  environmentRoutesList: {
    removeRoute: "Remove route",
    removeRouteConfirmation: (
      connectionRouteLabelRoute: string | number | boolean | null | undefined,
      addressNull: boolean,
      address: string | number | boolean | null | undefined,
    ) =>
      `Remove ${connectionRouteLabelRoute} route?${
        addressNull
          ? ""
          : `
${address}`
      }`,
    routesToPreferredFirst: (environmentLabel: string | number | boolean | null | undefined) =>
      `Routes to ${environmentLabel}, preferred first`,
    reorderPosition: (
      label: string | number | boolean | null | undefined,
      position: string | number | boolean | null | undefined,
    ) => `Reorder ${label}, position ${position}`,
    inUse: "In use",
    foundAutomatically: " · found automatically",
    removeRouteAriaLabel: (label: string | number | boolean | null | undefined) =>
      `Remove ${label} route`,
  },
  environmentRow: {
    via: (connectionRouteLabelActive: string | number | boolean | null | undefined) =>
      `via ${connectionRouteLabelActive}`,
  },
  expandableText: {
    showFullError: "Show full error",
    showLess: "Show less",
  },
  fontFamilyPicker: {
    isnTMonospace: (value: string | number | boolean | null | undefined) =>
      `"${value}" isn't monospace`,
    codeTerminalNeedFixedWidthHint:
      "Code and terminal need a fixed-width font, so the current font was kept.",
    default: "default",
    searchFonts: "Search fonts…",
    noFontsFound: "No fonts found.",
  },
  gitHubAccount: {
    hiddenAccount: "Hidden account",
    saveGitHubAccountSettings: "save GitHub account settings",
    signInWith: "Sign in with ",
    serverHostRescanAccountsHint: " on the server host, then rescan to choose accounts here.",
    chooseWhich: "Choose which ",
    loginEachGitHubHostUsesHint: " login each GitHub host uses, or turn a host off.",
    hideGitHubAccounts: "Hide GitHub accounts",
    revealGitHubAccounts: "Reveal GitHub accounts",
    hostEnabledAriaLabel: (groupHost: string | number | boolean | null | undefined) =>
      `Use GitHub on ${groupHost}`,
    account: "Account",
    gitHubAccountFor: (groupHost: string | number | boolean | null | undefined) =>
      `GitHub account for ${groupHost}`,
    activeGhAccount: "Active gh account",
    accountFallbackLabel: (index1: string | number | boolean | null | undefined) =>
      `Account ${index1}`,
    chosenLoginLongerSignedActiveHint:
      "The chosen login is no longer signed in, so the active gh login is used.",
    activeLoginOption: "Use active login",
    canTBeUsed: "can't be used: ",
    ghReportsThisLoginAsInvalid: "gh reports this login as invalid.",
    serverOverridesAccountChosenUntilHint: (
      groupEnvironmentVariable: string | number | boolean | null | undefined,
    ) =>
      `${groupEnvironmentVariable} is set on the server, so it overrides the account chosen here until it is unset.`,
  },
  gitHubRouting: {
    readPrs: "Read PRs",
    readAndAct: "Read and act",
    readAndActAriaLabel: "read and act",
    readPrsAriaLabel: "read PRs",
    machinesTrustReadPrDataHint:
      "Machines you trust here can read PR data through each other's GitHub access. Enable both machines. Read and act may use broader permissions than the machine that owns them. This applies only to this device.",
    saveGitHubRoutingPermissionError: "Could not save GitHub routing permission",
    gitHubRouting: (environmentLabel: string | number | boolean | null | undefined) =>
      `${environmentLabel} GitHub routing`,
  },
  gitHubToken: {
    saveGitHubToken: "save GitHub token",
    aTokenSavedHereIsUsedBefore: "A token saved here is used before",
    andThe: " and the",
    loginGitHubWorksWithoutGitHubHint:
      " login, so GitHub works without the GitHub CLI. Give it read and write access to pull requests and contents.",
    createAToken: "Create a token",
    token: "Token",
    storedSecretEnterValueReplace: "Stored secret, enter a new value to replace",
    notSet: "Not set",
    tokenSavedServerUsesGhHint: "No token saved; the server uses GH_TOKEN or the gh login.",
    savedFor: (savedHostsJoin: string | number | boolean | null | undefined) =>
      `Saved for ${savedHostsJoin}.`,
    remove: "Remove",
    save: "Save",
  },
  keybindings: {
    commandLabels: {
      sendAlternate: "Composer: Opposite Queue or Steer Action",
      sendBackground: "Composer: Start in Background",
      sendAndNewThread: "Composer: Send and Start New Thread",
      steerQueuedMessage: "Queue: Send First Queued Message as Steer",
      editQueuedMessage: "Queue: Edit Last Queued Message",
      copyReference: "Pull Request: Copy Link or Thread ID",
      reopenClosed: "Reopen Closed Tab",
    },
    commandSegments: {
      sidebar: "Sidebar",
      toggle: "Toggle",
      navigation: "Navigation",
      back: "Back",
      forward: "Forward",
      terminal: "Terminal",
      split: "Split",
      splitVertical: "Split Vertical",
      new: "New",
      close: "Close",
      rightPanel: "Right Panel",
      threadPanel: "Thread Panel",
      toggleMaximized: "Toggle Maximized",
      pullRequest: "Pull Request",
      copyNumber: "Copy Number",
      diff: "Diff",
      preview: "Preview",
      refresh: "Refresh",
      focusUrl: "Focus Url",
      zoomIn: "Zoom In",
      zoomOut: "Zoom Out",
      resetZoom: "Reset Zoom",
      commandPalette: "Command Palette",
      filePicker: "File Picker",
      projectSearch: "Project Search",
      usage: "Usage",
      open: "Open",
      theme: "Theme",
      select: "Select",
      appearance: "Appearance",
      cycle: "Cycle",
      themeEditor: "Theme Editor",
      composer: "Composer",
      stash: "Stash",
      host: "Host",
      cycleHost: "Cycle Host",
      effort: "Effort",
      mode: "Mode",
      workspace: "Workspace",
      previousWorktree: "Previous Worktree",
      branch: "Branch",
      chat: "Chat",
      newLocal: "New Local",
      newWithoutProject: "New Without Project",
      editor: "Editor",
      openFavorite: "Open Favorite",
      modelPicker: "Model Picker",
      previousProvider: "Previous Provider",
      nextProvider: "Next Provider",
      jump: "Jump",
      thread: "Thread",
      stop: "Stop",
      previous: "Previous",
      next: "Next",
      settle: "Settle",
      pin: "Pin",
      undo: "Undo",
    },
    commandSeparator: ": ",
    usageCommand: (label: string) => `Usage: ${label}`,
    usagePeriodCommand: (label: string) => `Usage: Period: ${label}`,
    runScriptCommand: (label: string) => `Run Script: ${label}`,
    clearAllConditions: "Clear all conditions",
    removeCondition: "Remove condition",
    removeGroupAndItsConditions: "Remove group and its conditions",
    conditionSyntaxHint: "Use variables with !, &&, ||, and parentheses.",
    navigation: "Navigation",
    threads: "Threads",
    composer: "Composer",
    previewDiff: "Preview & diff",
    projectScripts: "Project scripts",
    other: "Other",
    searchKeybindings: "Search keybindings",
    unknownCondition: (identifiers0: string | number | boolean | null | undefined) =>
      `Unknown condition: ${identifiers0}`,
    unknownConditions: (identifiersJoin: string | number | boolean | null | undefined) =>
      `Unknown conditions: ${identifiersJoin}`,
    tCodeRecognizeConditionYetHint:
      "T3 Code does not recognize this condition yet. It can still be saved, but it may not match unless the runtime provides it.",
    conflictsWith: (labels0: string | number | boolean | null | undefined) =>
      `Conflicts with ${labels0}.`,
    multipleConflictsHint: (
      labelsSlice03Join: string | number | boolean | null | undefined,
      labelsLength3: boolean,
    ) => `Conflicts with ${labelsSlice03Join}${labelsLength3 ? ", and more" : ""}.`,
    mostRecentMatchingBindingWinsHint: (
      description: string | number | boolean | null | undefined,
    ) => `${description} The most recent matching binding wins when both conditions can apply.`,
    condition: "Condition",
    negate: (conditionIdentifier: string | number | boolean | null | undefined) =>
      `Negate ${conditionIdentifier}`,
    not: "Not",
    negateGroup: "Negate group",
    group: "Group",
    when: "When",
    always: "Always",
    whenExpression: "When expression",
    fixExpressionAboveContinueEditingHint: "Fix the expression above to continue editing visually.",
    saving: "Saving",
    save: "Save",
    editShortcutFor: (
      commandLabelRowCommand: string | number | boolean | null | undefined,
      value: string | number | boolean | null | undefined,
    ) => `Edit shortcut for ${commandLabelRowCommand}: ${value}`,
    keybindingFor: (commandLabelRowCommand: string | number | boolean | null | undefined) =>
      `Keybinding for ${commandLabelRowCommand}`,
    pressShortcut: "Press shortcut",
    unassigned: "Unassigned",
    editWhenClauseFor: (label: string | number | boolean | null | undefined) =>
      `Edit when clause for ${label}`,
    actionsFor: (commandLabelRowCommand: string | number | boolean | null | undefined) =>
      `Actions for ${commandLabelRowCommand}`,
    resetToDefault: "Reset to default",
    remove: "Remove",
    newKeybinding: "new keybinding",
    draftShortcutAriaLabel: (draftCommandLabelText: string | number | boolean | null | undefined) =>
      `Keybinding for ${draftCommandLabelText}`,
    cancelNewKeybinding: "Cancel new keybinding",
    newBindingTitle: "New keybinding",
    browserMayClaimSomeShortcutsHint:
      "The browser may claim some shortcuts first. The desktop app receives them all.",
    unableToOpenKeybindingsFile: "Unable to open keybindings file",
    theKeybindingsFileWasNotOpened: "The keybindings file was not opened.",
    unableToSaveKeybinding: "Unable to save keybinding",
    theKeybindingWasNotSaved: "The keybinding was not saved.",
    unableToRemoveKeybinding: "Unable to remove keybinding",
    theKeybindingWasNotRemoved: "The keybinding was not removed.",
    addKeybinding: "Add keybinding",
    openKeybindingsJson: "Open keybindings.json",
    connectionViewKeybindingsButChangeError:
      "This connection can view keybindings but cannot change them.",
    noKeybindingsMatchYourSearch: "No keybindings match your search.",

    sourceLabels: { Default: "Default", Custom: "Custom", Project: "Project" } satisfies Record<
      "Default" | "Custom" | "Project",
      string
    >,
    booleanOperators: { and: "and", or: "or" } satisfies Record<"and" | "or", string>,
  },
  loadBalancing: {
    prefer: "Prefer",
    normal: "Normal",
    lessOften: "Less often",
    manualOnly: "Manual only",
    automaticallyBalanceLoad: "Automatically balance load",
    threadsSharedProjectsStartMachineHint:
      "New threads in shared projects start on the machine with the most free CPU and memory, weighted by each machine's preference.",
    loadPreference: (environmentLabel: string | number | boolean | null | undefined) =>
      `${environmentLabel} load preference`,
  },
  localEnvironmentSetting: {
    couldnTChangeThisSetting: "Couldn't change this setting.",
    runAgentsComputerTurnOffHint:
      "Run agents on this computer. Turn off to use T3 Code only with remote environments.",
    turnedOffAgentsRunRemoteHint: "Turned off. Agents only run in remote environments.",
    turnOffLocalEnvironment: "Turn off local environment?",
    turnOnLocalEnvironment: "Turn on local environment?",
    tCodeRestartWithoutRunningHint:
      "T3 Code will restart without running a server on this computer. Any agents and terminals running here will stop, and other devices will no longer be able to connect to this computer. Your projects, history, and remote environments are unaffected.",
    tCodeRestartStartRunningHint:
      "T3 Code will restart and start running a server on this computer again.",
    restartAndTurnOff: "Restart and turn off",
    restartAndTurnOn: "Restart and turn on",
  },
  notification: {
    description:
      "System alerts when a thread finishes, fails, or needs input or approval. Applies to this device while T3 Code is open.",
    supportHint:
      "Notifications need a supported browser over HTTPS, or the desktop app. Sound only is still available.",
    permissionHint:
      "Allow notifications in your browser or system settings, then choose this option again. Sound only is still available.",
    unavailableHint:
      "Notifications are unavailable in this browser. Sound only is still available.",
  },
  openSourceLicenses: {
    licenseManifestRequestFailedStatusError: (
      stringResponseStatus: string | number | boolean | null | undefined,
    ) => `The license manifest request failed with status ${stringResponseStatus}.`,
    viewProjectSourceFor: (entryName: string | number | boolean | null | undefined) =>
      `View project source for ${entryName}`,
    projectSource: "Project source",
    notices: (stringTotalCount: string | number | boolean | null | undefined) =>
      `${stringTotalCount} notices`,
    of: (
      stringFilteredCount: string | number | boolean | null | undefined,
      stringTotalCount: string | number | boolean | null | undefined,
    ) => `${stringFilteredCount} of ${stringTotalCount}`,
    searchOpenSourceLicenses: "Search open-source licenses",
    searchLicenses: "Search licenses",
    openSourceNoticesAreUnavailable: "Open-source notices are unavailable",
    theLicenseManifestCouldNotLoad: "The license manifest could not load.",
    thirdPartyNotices: "Third-party notices",
    noLicensesMatchThatSearch: "No licenses match that search.",
    loadingOpenSourceNotices: "Loading open-source notices…",
  },
  panelAnimationsPreview: {
    replayPanelAnimationPreview: "Replay panel animation preview",
  },
  processSignalActions: {
    sendSigint: "Send SIGINT",
    sendSigkill: "Send SIGKILL",
  },
  projectActionsList: {
    noActionsConfigured: "No actions configured.",
    setup: "setup",
    onSettle: "on settle",
    previewDesktopOnly: "preview · desktop only",
    edit: (scriptName: string | number | boolean | null | undefined) => `Edit ${scriptName}`,
  },
  projectActions: {
    failedToImportAction: "Failed to import action.",
    commandsRunProjectSCheckoutHint:
      "Commands that run in this project's checkout or its worktree, with optional shortcuts.",
    importScripts: "Import scripts",
    importFromT3Json: "Import from t3.json",
    addActionsDeclaredCheckoutWithoutHint:
      "Add actions declared by this checkout without editing them first.",
    addAction: "Add action",
    differentActionsAcrossEnvironments: "Different actions across environments",
    oneEnvironmentEditListAddingHint:
      "Choose one environment to edit its list. Adding an action here adds it on every selected environment.",
    t3JsonIsInvalid: "t3.json is invalid",
    tJsonExistsCheckoutButHint:
      "A t3.json exists in this checkout but fails to parse, so every action and icon it declares is ignored. Check the JSON syntax and icon values.",
  },
  projectDefaults: {
    modelUnavailableSelectEnvironmentModelHint: (
      environmentLabel: string | number | boolean | null | undefined,
    ) =>
      `This model is unavailable on ${environmentLabel ?? "a selected environment"}. Select that environment to choose its model separately.`,
    defaultModelNotSaved: "Default model not saved",
    modelForNewThreadsInThisProject: "Model for new threads in this project.",
    defaultModelThreadsProjectsOverrideHint:
      "Default model for new threads. Projects can override it.",
    automatic: "Automatic",
    defaultModel: "default model",
    noProvidersAvailable: "No providers available",
    threadsProjectStartHint: "Where new threads in this project start.",
    threadsStartProjectsTheirTHint:
      "Where new threads start. Projects and their t3.json can override it.",
    defaultWorkspace: "default workspace",
    workspaceAriaLabel: "Default workspace",
    repositories: "Repositories",
    permissionsThreadsProjectHint: "Permissions for new threads in this project.",
    defaultPermissionsThreadsProjectsOverrideHint:
      "Default permissions for new threads. Projects can override them.",
    defaultPermissions: "default permissions",
    permissionsAriaLabel: "Default permissions",
    worktreesProjectPopulateGitSubmodulesHint:
      "How new worktrees in this project populate git submodules.",
    worktreesPopulateGitSubmodulesProjectsHint:
      "How new worktrees populate git submodules. Projects and their t3.json can override it.",
    worktreeSubmodules: "worktree submodules",
    submodulesAriaLabel: "Worktree submodules",
    keepsProjectSDefaultBranchHint:
      "Keeps this project's default branch current when the checkout has no local changes or commits.",
    keepsDefaultBranchCurrentCheckoutHint:
      "Keeps the default branch current when the checkout has no local changes or commits. Projects can override it.",
    defaultAutomaticPull: "default automatic pull",
    resetAutomaticPullToOff: "Reset automatic pull to off",
    automaticPullAriaLabel: "Default automatic pull",
    removeRecognizedAgentCreditLinesHint:
      "Remove recognized agent credit lines from GitHub merge and squash messages, keeping human co-authors. Includes auto-merge. Excludes merge queues, stack merges, and existing commits.",
    agentCreditRemoval: "agent credit removal",
    keepAgentCredits: "Keep agent credits",
    pullRequestsProjectStartMethodHint: "Pull requests in this project start with this method.",
    pullRequestsStartMethodLastHint:
      "Pull requests start with this method. Last selected reuses whatever you chose most recently on this device.",
    defaultMergeMethod: "default merge method",
    resetToLastSelected: "Reset to last selected",
    defaultPullRequestMergeMethod: "Default pull request merge method",
    lastSelected: "Last selected",
    allowAgentsProjectSharedBrowserHint:
      "Allow agents in this project to use the shared browser. Applies when the agent session next starts.",
    allowAgentsSharedBrowserProjectsHint:
      "Allow agents to use the shared browser. Projects can override it.",
    defaultBrowserAccess: "default browser access",
  },
  projectFaviconPicker: {
    searchingProjectFiles: "Searching project files…",
    indexingProjectFiles: "Indexing project files…",
    noMatchingImageFiles: "No matching image files.",
    noImageFilesFound: "No image files found.",
    chooseProjectIcon: "Choose project icon",
    selectIcon: "Select icon",
    couldNotOpenImagePicker: "Could not open image picker",
    openIn: (fileManagerName: string | number | boolean | null | undefined) =>
      `Open in ${fileManagerName}`,
    searchImageFiles: "Search image files…",
  },
  projectIconPicker: {
    chooseProjectIcon: "Choose project icon",
    chooseAnIconEmojiOrMonogram: "Choose an icon, emoji, or monogram.",
    iconType: "Icon type",
    icons: "Icons",
    emoji: "Emoji",
    monogram: "Monogram",
    color: "Color",
    iconColor: "Icon color",
    searchLucideIcons: "Search Lucide icons",
    searchAllLucideIcons: "Search all Lucide icons",
    noIconsFound: "No icons found.",
    letters: "Letters",
    oneOrTwoLettersOrNumbers: "One or two letters or numbers.",
    orPasteAnyEmoji: "Or paste any emoji",
    customEmoji: "Custom emoji",
    pasteAnEmoji: "Paste an emoji",
    saveIcon: "Save icon",
  },
  projectSettings: {
    addProjectSidebarConfigureHint: "Add a project from the sidebar to configure it here.",
    thisProjectIsNoLongerAvailable: "This project is no longer available.",
    checkoutLongerAvailableSelectedProjectHint:
      "This checkout is no longer available in the selected project and environment.",
    connectionChangeProjectsError: (
      deniedEnvironmentLabel: string | number | boolean | null | undefined,
    ) =>
      `This connection cannot change projects in ${deniedEnvironmentLabel ?? "this environment"}.`,
    connectAndTryAgain: (
      unavailableEnvironmentLabel: string | number | boolean | null | undefined,
    ) => `Connect ${unavailableEnvironmentLabel ?? "the selected environment"} and try again.`,
    on: (
      failureTitle: string | number | boolean | null | undefined,
      memberEnvironmentLabel: string | number | boolean | null | undefined,
    ) => `${failureTitle} on ${memberEnvironmentLabel ?? "the current environment"}`,
    projectTitleCannotBeEmpty: "Project title cannot be empty",
    failedToRenameProject: "Failed to rename project",
    failedToUpdateProjectIcon: "Failed to update project icon",
    failedToRemoveProject: "Failed to remove project",
    removeAndDeleteItsThread: (
      targetKind: string | number | boolean | null | undefined,
      targetLabel: string | number | boolean | null | undefined,
      projectThreadsLength: string | number | boolean | null | undefined,
      projectThreadsLength1: boolean,
    ) =>
      `Remove ${targetKind} "${targetLabel}" and delete its ${projectThreadsLength} thread${projectThreadsLength1 ? "" : "s"}?`,
    remove: (
      targetKind: string | number | boolean | null | undefined,
      targetLabel: string | number | boolean | null | undefined,
    ) => `Remove ${targetKind} "${targetLabel}"?`,
    path: (singleMemberWorkspaceRoot: string | number | boolean | null | undefined) =>
      `Path: ${singleMemberWorkspaceRoot}`,
    environment: (singleMemberEnvironmentLabel: string | number | boolean | null | undefined) =>
      `Environment: ${singleMemberEnvironmentLabel}`,
    thisRemovesGroupedProjectEntries: (
      membersLength: string | number | boolean | null | undefined,
    ) => `This removes ${membersLength} grouped project entries.`,
    permanentlyClearsConversationHistoryThreadsHint:
      "This permanently clears conversation history for those threads and any archived threads.",
    permanentlyClearsAnyArchivedConversationHint:
      "This permanently clears any archived conversation history.",
    removesProjectEntriesFilesDiskHint:
      "This removes only the project entries, not the files on disk.",
    otherEntriesGroupedProjectUnaffectedHint:
      "Other entries in this grouped project are unaffected.",
    thisActionCannotBeUndone: "This action cannot be undone.",
    failedToRemove: (memberTitle: string | number | boolean | null | undefined) =>
      `Failed to remove "${memberTitle}"`,
    checkouts: "Checkouts",
    removeCheckout: (memberWorkspaceRoot: string | number | boolean | null | undefined) =>
      `Remove checkout ${memberWorkspaceRoot}`,
    removeAction: "Remove",
    tFindSettingKeepProjectHint:
      "Can't find a setting? Keep this project picked above and hop to any other settings page.",
    sharedSettingsRequirePermissionChangeHint:
      "Shared settings require permission to change every checkout in this group.",
    connectionChangeProjectError: "This connection cannot change this project.",
    sharedNameProjectGroupSidebarHint:
      "The shared name for this project group in the sidebar and thread lists.",
    projectName: "Project name",
    projectIcon: "Project icon",
    automatic: "Automatic",
    iconResetLabel: "project icon",
    chooseAProjectIcon: "Choose a project icon",
    chooseIcon: "Choose icon",
    chooseAProjectIconFile: "Choose a project icon file",
    chooseFile: "Choose file",
    danger: "Danger",
    removeCheckoutAction: "Remove checkout",
    removeThisProjectEverywhere: "Remove this project everywhere",
    removeProject: "Remove project",
    deletesSelectedMachineSCheckoutHint:
      "Deletes the selected machine's checkout entries and their threads. Other machines and files on disk are not touched.",
    deletesAllCheckoutEntriesTheirHint: (
      groupMemberProjectsLength: string | number | boolean | null | undefined,
    ) =>
      `Deletes all ${groupMemberProjectsLength} checkout entries and their threads on every machine. Files on disk are not touched.`,
    deletesProjectEntryThreadsFilesHint:
      "Deletes the project entry and its threads. Files on disk are not touched.",
    removeAllEntries: "Remove all entries",
  },
  projects: {
    projectManageNameIconCheckoutsHint:
      "Choose a project to manage its name, icon, checkouts and actions.",
  },
  providerAccentColorPicker: {
    accentColor: "Accent color",
    accentColorHue: "Accent color hue",
    customHexAccentColor: "Custom hex accent color",
    accentColorFor: (
      normalized: boolean,
      propsDisplayName: string | number | boolean | null | undefined,
    ) => `${normalized ? "Change" : "Add"} accent color for ${propsDisplayName}`,
    changeAccentColor: "Change accent color",
    clearColor: "Clear color",
  },
  providerAuthCallbackCoordinator: {
    chatGptSignInCouldnTFinish: "ChatGPT sign-in couldn't finish",
    returnToTheProviderAndTryAgain: "Return to the provider and try again.",
    reconnectEnvironmentTryAgainHint: "Reconnect to the environment and try again.",
  },
  providerAuthentication: {
    startingSignIn: "Starting sign-in…",
    checkingYourAccount: "Checking your account…",
    completeSignInInTheTerminalBelow: "Complete sign-in in the terminal below.",
    enterYourCredentialsBelow: "Enter your credentials below.",
    signedIn: "Signed in.",
    discoveringSignInMethods: "Discovering sign-in methods…",
    appSignAdvertisedFollowProviderHint:
      "No in-app sign-in advertised. Follow the provider's docs to finish setup.",
    signInOn: (environmentLabel: string | number | boolean | null | undefined) =>
      `Sign in on ${environmentLabel}.`,
    providerSignInFailedTryAgain: "Provider sign-in failed. Try again.",
    openSignPageCopyLinkError:
      "Could not open the sign-in page. Copy the link and open it in your browser.",
    account: "Account",
    signInMethod: "Sign-in method",
    providerDefault: "Provider default",
    openBrowser: "Open browser",
    copySignInLink: "Copy sign-in link",
    providerSignInLink: "Provider sign-in link",
    couldNotCopyTheSignInLink: "Could not copy the sign-in link.",
    openDocs: "Open docs",
    cancelSignIn: "Cancel sign-in",
    retrySignIn: "Retry sign-in",
    signIn: "Sign in",
    signOutStopsRunningThreadsHint: (
      providerDisplayName: string | number | boolean | null | undefined,
      providerDriver: string | number | boolean | null | undefined,
      environmentLabel: string | number | boolean | null | undefined,
    ) =>
      `Sign out of ${providerDisplayName ?? providerDriver} on ${environmentLabel}? This stops running threads that share this sign-in. Thread history is kept.`,
    signOut: "Sign out",
    enterCode: "Enter code",
    inYourBrowser: "in your browser.",
    loadingSignInTerminal: "Loading sign-in terminal…",

    sendInputProviderSignTerminalError: "Could not send input to the provider sign-in terminal.",
    ifFinalLocalhostPageLoadHint:
      "If the final localhost page does not load, paste its full URL here.",

    providerSignTerminalLongerAvailableHint:
      "The provider sign-in terminal is no longer available.",
  },
  providerAuthTerminal: {
    couldNotOpenTheProviderLink: "Could not open the provider link.",
    loadSignTerminalCancelRetryError:
      "Could not load the sign-in terminal. Cancel and retry sign-in.",
    providerSignInTerminal: "Provider sign-in terminal",
  },
  providerDriverMeta: {
    cursorApiKey: "Cursor API key",
    optionalOverridesBrowserSignProviderHint:
      "Optional. Overrides browser sign-in for this provider.",
    pasteApiKey: "Paste API key",
  },
  providerInstanceCard: {
    storedSecretEnterValueReplace: "Stored secret - enter a new value to replace",
    clear: (propsFieldLabel: string | number | boolean | null | undefined) =>
      `Clear ${propsFieldLabel}`,
    variables: "Variables",
    apiKeysBaseUrlsOtherHint: "API keys, base URLs, and other per-instance CLI settings.",
    addVariable: "Add variable",
    environmentVariableName: (index1: string | number | boolean | null | undefined) =>
      `Environment variable name ${index1}`,
    storedSecretPlaceholder: "Stored secret, enter a new value to replace",
    value: "value",
    environmentVariableValue: (index1: string | number | boolean | null | undefined) =>
      `Environment variable value ${index1}`,
    markEnvironmentVariableAsSensitive: (
      variableNameIndex1: string | number | boolean | null | undefined,
    ) => `Mark environment variable ${variableNameIndex1} as sensitive`,
    sensitiveStoredSeparately: "Sensitive, stored separately",
    plainText: "Plain text",
    removeEnvironmentVariable: (variableNameIndex1: string | number | boolean | null | undefined) =>
      `Remove environment variable ${variableNameIndex1}`,
    sensitiveValuesStoredSeparatelyNeverHint:
      "Sensitive values are stored separately and never returned to the app.",
    updateCommandCopied: (providerName: string | number | boolean | null | undefined) =>
      `${providerName} update command copied`,
    runTerminalReadyUpdateHint: "Run it in a terminal when you are ready to update.",
    couldNotCopyUpdateCommand: (providerName: string | number | boolean | null | undefined) =>
      `Could not copy ${providerName} update command`,
    incompatible: "Incompatible",
    unsupported: "Unsupported",
    limitedSupport: "Limited support",
    authenticatedAs: "Authenticated as",
    viewDetails: (versionAdvisoryTitle: string | number | boolean | null | undefined) =>
      `${versionAdvisoryTitle} — view details`,
    updating: "Updating",
    install: (value: string | number | boolean | null | undefined) => `Install ${value}`,
    updateNow: "Update now",
    orUpdateManuallyUsing: "or, update manually using",
    copyUpdateCommand: "Copy update command",
    copyCommand: "Copy command",
    select: (displayName: string | number | boolean | null | undefined) => `Select ${displayName}`,
    enable: (displayName: string | number | boolean | null | undefined) => `Enable ${displayName}`,
    deleteInstance: (instanceId: string | number | boolean | null | undefined) =>
      `Delete instance ${instanceId}`,
    driver: "Driver",
    thisInstanceUses: "This instance uses ",
    availableBuildConfigurationPreservedHint:
      ", which is not available in this build. Its configuration is preserved.",
    displayName: "Display name",
    continueAuthentication: "Continue authentication",
    instanceLabel: "Instance label",
    runtime: "Runtime",
    models: "Models",
    favoritesVisibilityOrderingSavedDeviceHint:
      "Favorites, visibility, and ordering are saved on this device. Custom models are saved on the selected environment.",
  },
  providerModels: {
    fastMode: "Fast mode",
    thinking: "Thinking",
    reasoning: "Reasoning",
    enterAModelSlug: "Enter a model slug.",
    thatModelIsAlreadyBuiltIn: "That model is already built in.",
    modelSlugsMustCharactersLessError: (
      maxCustomModelLength: string | number | boolean | null | undefined,
    ) => `Model slugs must be ${maxCustomModelLength} characters or less.`,
    thatCustomModelIsAlreadySaved: "That custom model is already saved.",
    favorites: (isFavorite: boolean, modelName: string | number | boolean | null | undefined) =>
      `${isFavorite ? "Remove" : "Add"} ${modelName} ${isFavorite ? "from" : "to"} favorites`,
    removeFromFavorites: "Remove from favorites",
    addToFavorites: "Add to favorites",
    moveUp: (modelName: string | number | boolean | null | undefined) => `Move ${modelName} up`,
    moveUpTooltip: "Move up",
    moveDown: (modelName: string | number | boolean | null | undefined) => `Move ${modelName} down`,
    moveDownTooltip: "Move down",
    edit: (modelSlug: string | number | boolean | null | undefined) => `Edit ${modelSlug}`,
    editNameAndOptions: "Edit name and options",
    remove: (modelSlug: string | number | boolean | null | undefined) => `Remove ${modelSlug}`,
    removeCustomModel: "Remove custom model",
    customModelsAlwaysShownPicker: "Custom models are always shown in the picker",
    hiddenFromPicker: "Hidden from picker",
    shownInPicker: "Shown in picker",
    showInTheModelPicker: (modelName: string | number | boolean | null | undefined) =>
      `Show ${modelName} in the model picker`,
    custom: "custom",
    filterModels: "Filter models",
    enableAll: "Enable all",
    disableAll: "Disable all",
    favorite: (
      favoriteCount: string | number | boolean | null | undefined,
      favoriteCount1: boolean,
    ) => ` · ${favoriteCount} favorite${favoriteCount1 ? "" : "s"}`,
    hidden: (hiddenCount: string | number | boolean | null | undefined) =>
      ` · ${hiddenCount} hidden`,
    addCustomModel: "Add custom model",
    noModelsMatch: "No models match.",
    modelsReportedProviderYetHint: "No models reported for this provider yet.",
    favoritesGroup: "Favorites",
    all: "All",
    add: "Add",

    modelCount: (count: number) => `${count} model${count === 1 ? "" : "s"}`,
  },
  providerSettingsForm: {
    executable: "Executable",
    executableNamePathEnvironmentHint: "Executable name or path on this environment.",
    eGDsh: "e.g. dsh",
    arguments: "Arguments",
    oneLiteralArgumentPerRowHint: "One literal argument per row, in launch order.",
    addArgument: "Add argument",
    argument: (index1: string | number | boolean | null | undefined) => `Argument ${index1}`,
    removeArgument: (index1: string | number | boolean | null | undefined) =>
      `Remove argument ${index1}`,
  },
  providerSettings: {
    checked: "Checked ",
    lastCheckedHint: (lastCheckedRelativeValue: string | number | boolean | null | undefined) =>
      `Checked ${lastCheckedRelativeValue}`,
    primaryDevice: "Primary device",
    localDevice: "Local device",
    remoteDevice: "Remote device",
    loadingProviderSettings: "Loading provider settings",
    couldNotConnectToThisDevice: "Could not connect to this device",
    providerSettingsAreUnavailable: "Provider settings are unavailable",
    checkingWhatSessionAllowedChangeHint: "Checking what this session is allowed to change.",
    waitingForSConfiguration: (environmentLabel: string | number | boolean | null | undefined) =>
      `Waiting for ${environmentLabel}'s configuration.`,
    deviceUnavailable: "Device unavailable",
    reconnectDeviceUpProviderSelectHint:
      "Reconnect this device to set up its provider, or select another device.",
    noConnectedDevices: "No connected devices",
    loadingDevices: "Loading devices",
    connectExecutionEnvironmentBeforeConfiguringHint:
      "Connect an execution environment before configuring providers.",
    readingConnectedExecutionEnvironmentsHint: "Reading connected execution environments.",
    authenticationRequestExpired: "Authentication request expired",
    refreshProviderStartAuthenticationFlowHint:
      "Refresh the provider and start the authentication flow again.",
    couldNotContinueAuthentication: "Could not continue authentication",
    theAuthenticationRequestExpired: "The authentication request expired.",
    couldNotUpdate: (
      providerDisplayNamesCandidateDriver: string | number | boolean | null | undefined,
      candidateDriver: string | number | boolean | null | undefined,
    ) => `Could not update ${providerDisplayNamesCandidateDriver ?? candidateDriver}`,
    providerUpdateCommandStartedError: "The provider update command could not be started.",
    couldNotUpdateProviderInstance: "Could not update provider instance",
    theSettingsUpdateFailed: "The settings update failed.",
    couldNotDeleteProviderInstance: "Could not delete provider instance",
    providerDeletedButManagedFiles: "Provider deleted, but managed files remain",
    managedBinaryCleanupFailed: "Managed binary cleanup failed.",
    couldNotResetProviderInstance: "Could not reset provider instance",
    cursorAccount: "Cursor account",
    usingCursorApiKeyRemoveHint:
      "Using CURSOR_API_KEY. Remove it from this provider's environment to use browser sign-in.",
    providerSettings: (resetLabel: string | number | boolean | null | undefined) =>
      `${resetLabel} provider settings`,
    refreshProviderStatus: "Refresh provider status",
    refreshingProviders: "Refreshing providers",
    addProvider: "Add provider",
    limitedPermissions: "Limited permissions",
    sessionViewSProvidersButHint: (
      environmentLabel: string | number | boolean | null | undefined,
    ) => `This session can view ${environmentLabel}'s providers but can't change their settings.`,
    providerInstanceLongerAvailableDeviceHint:
      "This provider instance is no longer available on this device.",
    noProvidersConfigured: "No providers configured.",
    intervalConfiguredSharedBackgroundActivityHint:
      "This interval is configured here, then the shared Background activity policy decides whether provider probes may run when the timer fires. Custom intervals appear as Advanced in General settings.",
    refreshProviderStatusVersionsModelsHint:
      "Refresh provider status, versions, and models in the background. Set to 0 to disable.",
    providerHealthCheckInterval: "provider health check interval",
    decreaseProviderHealthCheckInterval: "Decrease provider health check interval",
    providerHealthCheckIntervalSeconds: "Provider health check interval in seconds",
    increaseProviderHealthCheckInterval: "Increase provider health check interval",
  },
  providerSetup: {
    antigravitySetup: "Antigravity setup",
    deviceThatRunsThisProvider: "Device that runs this provider.",
    enableAntigravity: "Enable Antigravity",
    setupUnavailable: "Setup unavailable",
    providerSetupIsReadOnly: "Provider setup is read-only.",
    updateRequired: "Update required",
    updateEnvironmentManageAntigravityHint: "Update this environment to manage Antigravity.",
    downloadingMbMb: (
      installationDownloadedBytes1000000: string | number | boolean | null | undefined,
      installationTotalBytesNull: boolean,
      installationTotalBytes1000000: string | number | boolean | null | undefined,
    ) =>
      `Downloading ${installationDownloadedBytes1000000} MB${installationTotalBytesNull ? "" : ` of ${installationTotalBytes1000000} MB`}.`,
    extractingAntigravity: "Extracting Antigravity.",
    checkingTheDownloadedRuntime: "Checking the downloaded runtime.",
    installed: "Installed.",
    configuredAntigravityRuntimeUnavailableHint:
      "The configured Antigravity runtime is unavailable.",
    configuredAntigravityRuntimeCheckedHint:
      "The configured Antigravity runtime has not been checked.",
    mbDownload: (value: string | number | boolean | null | undefined) => `${value} MB download.`,
    notInstalled: "Not installed.",
    providerSetupFailed: "Provider setup failed.",
    providerSetupFailedTryAgain: "Provider setup failed. Try again.",
    removeDownloadedAntigravityRuntimeGoogleHint: (
      environmentLabel: string | number | boolean | null | undefined,
    ) =>
      `Remove the downloaded Antigravity runtime from ${environmentLabel}? Google sign-in and thread history are kept.`,
    removingRuntime: "Removing runtime",
    runtime: "Runtime",
    installAndManageAntigravity: "Install and manage Antigravity.",
    usesCustomBinaryPathBelowHint:
      "Uses the custom binary path below. Installation keeps that path.",
    automaticInstallationUnavailableBinaryPathHint:
      "Automatic installation unavailable. Set a binary path or use another environment.",
    antigravityDownload: "Antigravity download",
    cancellingInstallation: "Cancelling installation",
    cancelInstallation: "Cancel installation",
    startingInstallation: "Starting installation",
    updateAntigravity: "Update Antigravity",
    reinstallAntigravity: "Reinstall Antigravity",
    retryInstallation: "Retry installation",
    installManagedRuntime: "Install managed runtime",
    installAntigravity: "Install Antigravity",
    removeDownloadedRuntime: "Remove downloaded runtime",
    retrySetupStatus: "Retry setup status",
  },
  providerStatus: {
    checkingProviderStatus: "Checking provider status",
    waitingServerReportInstallationAuthenticationHint:
      "Waiting for the server to report installation and authentication details.",
    providerInstalledButDisabledSessionsHint:
      "This provider is installed but disabled for new sessions in T3 Code.",
    notFound: "Not found",
    cliNotDetectedOnPath: "CLI not detected on PATH.",
    notAuthenticated: (authLabel: string | number | boolean | null | undefined) =>
      `Not authenticated · ${authLabel}`,
    unauthenticated: "Not authenticated",
    needsAttention: "Needs attention",
    providerInstalledButServerFullyError:
      "The provider is installed, but the server could not fully verify it.",
    theProviderFailedItsStartupChecks: "The provider failed its startup checks.",
    authenticated: (authLabel: string | number | boolean | null | undefined) =>
      `Authenticated · ${authLabel}`,
    authenticatedStatus: "Authenticated",
    available: "Available",
    limitedSupport: "Limited support",
    unsupportedVersion: "Unsupported version",
    knownBrokenVersion: "Known broken version",
    recommendedVersionHint: (recommendation: string | number | boolean | null | undefined) =>
      `Use ${recommendation} for full support.`,
    updateForFullSupport: "Update for full support.",
    updateAvailable: "Update available",
    install: (
      label: string | number | boolean | null | undefined,
      versionLabel: string | number | boolean | null | undefined,
    ) => `${label}: install ${versionLabel}.`,
    installTheLatestProviderVersion: (label: string | number | boolean | null | undefined) =>
      `${label}: install the latest provider version.`,
  },
  providerWizardAuthenticationStep: {
    account: "Account",
    discoveringSignInMethods: "Discovering sign-in methods…",
    appSignAdvertisedFollowProviderHint:
      "No in-app sign-in advertised. Follow the provider's docs to finish setup.",
    signIn: "Sign in",
    openDocs: "Open docs",
    skipForNow: "Skip for now",
  },
  scoped: {
    settingEnvironmentWideOverriddenProjectError:
      "This setting is environment-wide and cannot be overridden by a project.",
    connectSelectedCheckoutsUpdateTheirHint:
      "Connect the selected checkouts, or update their environments, to save a project override.",
    connectToSaveThisSetting: (
      scopeKindEnvironment: boolean,
      scopeLabel: string | number | boolean | null | undefined,
    ) => `Connect ${scopeKindEnvironment ? scopeLabel : "an environment"} to save this setting.`,
    resetCheckoutUnavailableHint:
      "Connect the selected checkouts, or update their environments, to reset this override.",
    connectEnvironmentsResetOverridesHint: "Connect the environments to reset these overrides.",
    settingNotSaved: "Setting not saved",
    connectionChangeSettingsError: "This connection cannot change these settings.",
    settingSavedOnSomeEnvironments: "Setting saved on some environments",
    couldNotUpdate: (
      value: string | number | boolean | null | undefined,
      savedEnvironmentCount0: boolean,
    ) =>
      `Could not update ${value}.${savedEnvironmentCount0 ? " The other selected environments saved the change." : ""}`,
  },
  settingInheritance: {
    repositoryConventions: "Repository conventions",
    conventionalCommits: "Conventional Commits",
    customInstructions: "Custom instructions",
    lastSelected: "Last selected",
    never: "Never",
    automatic: "Automatic",
    inherit: "Inherit",
    notSet: "Not set",
    on: "On",
    dayCount: (value: string | number | boolean | null | undefined, value1: boolean) =>
      `${value} ${value1 ? "day" : "days"}`,
    empty: "Empty",
    itemCount: (valueLength: string | number | boolean | null | undefined, valueLength1: boolean) =>
      `${valueLength} ${valueLength1 ? "item" : "items"}`,
    custom: "Custom",
    project: (
      summary: string | number | boolean | null | undefined,
      overridingProjectsLength: string | number | boolean | null | undefined,
      overridingProjectsLength1: boolean,
    ) =>
      `${summary} · ${overridingProjectsLength} project ${overridingProjectsLength1 ? "override" : "overrides"}`,
    showWhereThisValueComesFrom: (overrideSummary: string | number | boolean | null | undefined) =>
      `${overrideSummary}. Show where this value comes from`,
    overriddenBy: "Overridden by",
    reset: "Reset ",
    it: "it",
    all: "all",

    inherits: "Inherits",
  },
  settingsFontPreviews: {
    frontendDesignFixFlakyTest: "Use $frontend-design to fix the flaky test in ",
    surfaceTestTsAppsWeb:
      "[surface.test.ts](apps/web/src/terminal/ghostty/surface.test.ts) and align the header with ",
    settingsPanelsTsxAppsWebSrcHint:
      "[SettingsPanels.tsx](apps/web/src/components/settings/SettingsPanels.tsx) before shipping.",
    promptFontPreview: "Prompt font preview",
    terminalFontPreview: "Terminal font preview",
  },
  settingsScope: {
    selectProjectOneCheckoutsHint: "Select a project to choose one of its checkouts.",
    environmentLongerAvailableHint: "This environment is no longer available.",
    thisProjectIsNoLongerAvailable: "This project is no longer available.",
    checkoutLongerAvailableSelectedProjectHint:
      "This checkout is no longer available in the selected project and environment.",
    projectCheckoutEnvironmentHint: "This project has no checkout on this environment.",
    checkoutSEnvironmentLongerAvailableHint: "This checkout's environment is no longer available.",
    projectScopeLabel: (
      groupDisplayName: string | number | boolean | null | undefined,
      environmentLabel: string | number | boolean | null | undefined,
    ) => `${groupDisplayName} / ${environmentLabel ?? "All checkouts"}`,
  },
  snapShot: {
    checkingSnapshots: "Checking snapshots…",
    notSupportedOnThisPlatform: "Not supported on this platform.",
    turnThisOnToSetUpSnapshots: "Turn this on to set up snapshots.",
    captureNeedsAttention: "Capture needs attention",
    checkCaptureAccessInSetup: "Check capture access in setup",
    installTheCaptureHelperToContinue: "Install the capture helper to continue",
    setUpActiveWindowSnapshots: "Set up active-window snapshots",
    manualCaptureLlWindowEach: "Manual capture only — you'll choose a window each time",
    enableCaptureToContinue: "Enable capture to continue",
    connectingYourShortcut: "Connecting your shortcut…",
    waitingForShortcutPermission: "Waiting for shortcut permission",
    readyToCapture: "Ready to capture",
    shortcutUsageHint: "Use your shortcut from another app",
    shortcutSaved: "Shortcut saved",
    finishShortcutSetup: "Finish shortcut setup",
    approveShortcutPermissionPromptContinueHint:
      "Approve the shortcut permission prompt to continue.",
    shortcutSavedHint: "Shortcut saved.",
    continueSetup: "Continue setup",
    manageCapture: "Manage capture",
    setUpCapture: (desktop: string | number | boolean | null | undefined) =>
      `Set up ${desktop} capture`,
    captureEffectsArenTAvailableHint: "Capture effects aren't available on this desktop.",
    installUpdateCaptureHelperEnableHint: "Install or update the capture helper to enable effects.",
    niriEffectsUnavailableHint: "Capture effects aren't available on Niri.",
    updateGnomeExtensionSignOutHint:
      "Update the GNOME extension, then sign out and back in to enable effects.",
    finishExtensionSetupEnableEffectsHint: "Finish extension setup to enable effects.",
    automaticCaptureIsnTAvailableHint:
      "Automatic capture isn't available here. Choose a window instead.",
    captureWindowAttachCurrentDraftHint: "Capture a window and attach it to your current draft.",
    desktopProvidesScreenshotHint: "This desktop only provides a screenshot.",
    updateDesktopAppSnapshotsHint: "Update the desktop app to use snapshots.",
    whooshDefault: "Whoosh (Default)",
    click: "Click",
    couldnTCheckCaptureSetup: "Couldn't check capture setup",
    couldnTOpenShortcutPermissions: "Couldn't open shortcut permissions",
    couldnTCompleteCaptureSetup: "Couldn't complete capture setup",
    couldnTSaveCaptureSettings: "Couldn't save capture settings",
    couldnTAllowAppTextCapture: "Couldn't allow app text capture",
    couldNotCheckThisShortcut: "Could not check this shortcut.",
    pressYourShortcutEscCancels: "Press your shortcut. Esc cancels.",
    t3CodeAlreadyUsesThisFor: (
      commandLabelCandidateConflict: string | number | boolean | null | undefined,
    ) => `T3 Code already uses this for "${commandLabelCandidateConflict}".`,
    checkingShortcut: "Checking shortcut…",
    readyToSave: "Ready to save.",
    shortcutExampleHint: "Try a shortcut such as Ctrl+Shift+2.",
    restartTCodeFinishCaptureHint: "Restart T3 Code to finish capture setup.",
    couldnTVerifyCaptureAccess: "Couldn't verify capture access",
    couldnTCloseCaptureSetup: "Couldn't close capture setup",
    updatingCaptureSettings: "Updating capture settings…",
    enableSnapshots: "Enable snapshots",
    includeTextControlsAppMakesHint: "Include text and controls when the app makes them available.",
    includeAppTextInSnapshots: "Include app text in snapshots",
    windowCaptureAnyAppHint: "Choose a window to capture from any app.",
    captureWindowReUsingWithoutHint: "Capture the window you're using without switching apps.",
    changeShortcut: "Change shortcut",
    save: "Save",
    soundPlayedCaptureStartsHint: "Choose the sound played when capture starts.",
    snapshotSound: "Snapshot sound: ",
    whoosh: "Whoosh ",
    default: "(Default)",
    playWhoosh: "Play Whoosh",
    playClick: "Play Click",
    showGentleCueCapturedWindowHint: "Show a gentle cue on the captured window.",
    flashCapturedWindow: "Flash captured window",
    animateCapturedWindowsDraftHint: "Animate captured windows into your draft.",
    animateSnapshots: "Animate snapshots",
  },
  sourceControl: {
    authenticated: "Authenticated",
    notAuthenticated: "Not authenticated",
    statusUnknown: "Status unknown",
    toggleSourceControlAccountVisibility: "Toggle source control account visibility",
    clickToRevealAccount: "Click to reveal account",
    clickToHideAccount: "Click to hide account",
    supportForIsComingSoon: (itemLabel: string | number | boolean | null | undefined) =>
      `Support for ${itemLabel} is coming soon.`,
    notAvailableOnThisServer: (itemInstallHint: string | number | boolean | null | undefined) =>
      `Not available on this server: ${itemInstallHint}`,
    as: "as",
    available: (itemInstallHint: string | number | boolean | null | undefined) =>
      `Available. ${itemInstallHint}`,
    everyHostIsTurnedOff: (itemLabel: string | number | boolean | null | undefined) =>
      `Every ${itemLabel} host is turned off.`,
    authenticatedServerSignConfigureCredentials: (
      itemLabel: string | number | boolean | null | undefined,
    ) =>
      `${itemLabel} is not authenticated on this server. Sign in or configure credentials using the`,
    toolServerHostEnableChangeHint: " tool on the server host to enable change request features.",
    availableStatus: "Available",
    comingSoon: "Coming Soon",
    toggleDetails: (itemLabel: string | number | boolean | null | undefined) =>
      `Toggle ${itemLabel} details`,
    availability: (itemLabel: string | number | boolean | null | undefined) =>
      `${itemLabel} availability`,
    intervalConfiguredGitSharedBackgroundHint:
      "This interval is configured for Git only. The shared Background activity policy still decides whether Git refreshes may run when the timer fires. Custom intervals appear as Advanced in General settings.",
    fetchInterval: "fetch interval",
    refreshRemoteBranchesBackgroundAvoidHint:
      "Refresh remote branches in the background. Set to 0 to avoid automatic Git prompts.",
    decreaseFetchInterval: "Decrease fetch interval",
    automaticGitFetchIntervalInSeconds: "Automatic Git fetch interval in seconds",
    increaseFetchInterval: "Increase fetch interval",
    serverEnvironment: "Server environment",
    couldNotScanTheServerEnvironment: "Could not scan the server environment",
    nothingDetectedYet: "Nothing detected yet",
    installGitServerAddOptionalError:
      "Install Git on the server, add optional hosting integrations or credentials your workspace needs, then rescan.",
    scan: "Scan",
    rescanServerEnvironment: "Rescan server environment",
    rescanGitAndHostingIntegrations: "Rescan Git and hosting integrations",
    connectEnvironmentInspectVersionControlHint:
      "Connect an environment to inspect its version control tools and hosting integrations.",
    versionControl: (environmentSuffix: string | number | boolean | null | undefined) =>
      `Version Control${environmentSuffix}`,
    sourceControlProviders: "Source Control Providers",
    providersSectionTitle: (environmentSuffix: string | number | boolean | null | undefined) =>
      `Source Control Providers${environmentSuffix}`,

    verificationError: (label: string) => `Could not verify ${label}.`,
  },
  sourceControlWriting: {
    sourceControlWritingStyle: "source control writing style",
    customSourceControlInstructionsAll:
      "Custom source control instructions for all selected environments",
    writeInstructionsEachSelectedEnvironmentHint:
      "Write the instructions each selected environment should use.",
    applyInstructionsToAll: "Apply instructions to all",
    writeCustomInstructionsForAll: "Write custom instructions for all",
    keepTitlesConciseShortBulletHint:
      "Keep titles concise. Use short bullet points in descriptions.",
    customSourceControlWritingInstructions: "Custom source control writing instructions",
    repositorySTemplateChangeRequestHint:
      "Use the repository's template for change request descriptions when available.",
    changeRequestTemplates: "change request templates",
    modelSourceControlTextBranchHint:
      "Model for source control text and branch or bookmark names. Off uses the environment's text generation model.",
    connectEnvironmentSourceControlWriterHint:
      "Connect an environment to choose its source control writer model.",
    sourceControlWriterModelNotSaved: "Source control writer model not saved",
    separateSourceControlWriterModel: "Use a separate source control writer model",

    modeOptions: {
      repo_conventions: {
        label: "Repository conventions",
        description:
          "In each project, matches recent change descriptions and change request titles.",
      },
      conventional_commits: {
        label: "Conventional Commits",
        description: "Use Conventional Commit prefixes and keep change request text concise.",
      },
      custom: {
        label: "Custom instructions",
        description:
          "Use your instructions for change descriptions and change requests in every project.",
      },
    } satisfies Record<SourceControlWritingStyleMode, { label: string; description: string }>,
  },
  storage: {
    folderWorktreesCreatedAnyDriveHint:
      "Folder where new worktrees are created, on any drive, such as D:\\worktrees or ~/worktrees. Existing worktrees stay where they are. Leave empty to use the T3 home folder.",
    worktreeLocation: "worktree location",
    decrease: (label: string | number | boolean | null | undefined) => `Decrease ${label}`,
    inDays: (label: string | number | boolean | null | undefined) => `${label} in days`,
    days: "days",
    increase: (label: string | number | boolean | null | undefined) => `Increase ${label}`,
    mixedAcrossSelectedMachines: "Mixed across selected machines",
    updateSelectedMachinesConfigureProjectHint:
      "Update the selected machines to configure project worktree cleanup.",
    updateSelectedEnvironmentsStorageCleanupHint:
      "Update the selected environments to use storage cleanup, or choose a machine that supports it.",
    worktrees: "Worktrees",
    automaticWorktreeCleanup: "Automatic worktree cleanup",
    keepProjectSWorktreesUntilHint: "Keep this project's worktrees until you delete them manually.",
    projectCleanupRulesHint: "Use these rules for this project.",
    eachMachineSWorktreeCleanupHint: "Use each machine's worktree cleanup settings.",
    inherit: "Inherit",
    custom: "Custom",
    deleteWorktreesWithDeletedThreads: "Delete worktrees with deleted threads",
    removeUnusedWorktreesActiveArchivedHint:
      "Remove unused worktrees when active or archived threads are deleted. Worktrees with local changes are kept.",
    deleteInactiveWorktrees: "Delete inactive worktrees",
    removeWorktreesAfterTheirThreadsHint:
      "Remove worktrees after their threads have been inactive for this many days. Branches and thread history are kept.",
    deleteMergedWorktrees: "Delete merged worktrees",
    removeWorktreesWhosePullRequestHint:
      "Remove worktrees whose pull request is merged and whose commits are included in the default branch.",
    deleteUnchangedWorktrees: "Delete unchanged worktrees",
    removeWorktreesCommitsBeyondDefaultHint:
      "Remove worktrees with no commits beyond the default branch.",
    deleteOldBrowserArtifacts: "Delete old browser artifacts",
    deleteSavedBrowserCapturesAfterHint:
      "Delete saved browser captures after this many days. Older capture links will no longer open.",
    deleteOldRotatedLogs: "Delete old rotated logs",
    deleteInactiveRotatedLogFilesHint:
      "Delete inactive rotated log files after this many days. Current logs are kept.",
  },
  themeColorPicker: {
    chooseAColor: "Choose a color",
    hue: (label: string | number | boolean | null | undefined) => `${label} hue`,
    pickerHexValue: (label: string | number | boolean | null | undefined) =>
      `${label} picker hex value`,
    pickerRgbValue: (label: string | number | boolean | null | undefined) =>
      `${label} picker RGB value`,
    chooseColor: (label: string | number | boolean | null | undefined) => `Choose ${label} color`,
    usage: (selected: boolean, label: string | number | boolean | null | undefined) =>
      `${selected ? "Hide" : "Show"} ${label} usage`,
    whereIsUsed: (selected: boolean, label: string | number | boolean | null | undefined) =>
      `${selected ? "Hide" : "Show"} where ${label} is used`,
    hexValue: (label: string | number | boolean | null | undefined) => `${label} hex value`,

    roleLabels: {
      canvas: "Background",
      chrome: "Chrome",
      toolbar: "Toolbar background",
      toolbarForeground: "Toolbar text",
      toolbarBorder: "Toolbar border",
      toolbarControl: "Toolbar control",
      toolbarControlForeground: "Toolbar control text",
      toolbarControlHover: "Toolbar control hover",
      surface: "Surface",
      surfaceRaised: "Surface Raised",
      surfaceOverlay: "Surface Overlay",
      text: "Text",
      textMuted: "Text Muted",
      border: "Border",
      input: "Input",
      focus: "Focus",
      accent: "Accent color",
      accentForeground: "Accent Foreground",
      secondary: "Secondary",
      secondaryForeground: "Secondary Foreground",
      muted: "Muted",
      mutedForeground: "Muted Foreground",
      placeholder: "Placeholder",
      secondaryLabel: "Secondary Label",
      iconMuted: "Icon Muted",
      error: "Error",
      errorForeground: "Error text",
      errorSurface: "Error background",
      warning: "Warning",
      warningForeground: "Warning text",
      warningSurface: "Warning background",
      update: "Update",
      updateForeground: "Update text",
      updateSurface: "Update background",
      accentSurface: "Accent Surface",
      accentSurfaceForeground: "Accent Surface Foreground",
      messageSurface: "Message Surface",
      messageForeground: "Message Foreground",
      messageAction: "Message Action",
      messageActionForeground: "Message Action Foreground",
      messageActionHover: "Message Action Hover",
      codeBackground: "Code Background",
      codeForeground: "Code Foreground",
      sidebar: "Sidebar",
      sidebarForeground: "Sidebar Foreground",
      sidebarMutedForeground: "Sidebar Muted Foreground",
      sidebarControlSurface: "Sidebar Control Surface",
      sidebarRowHover: "Sidebar Row Hover",
      sidebarRowActive: "Sidebar Row Active",
      sidebarRowSelected: "Sidebar Row Selected",
      sidebarBorder: "Sidebar Border",
      terminalBackground: "Terminal Background",
      terminalForeground: "Terminal Foreground",
      terminalCursor: "Terminal Cursor",
      terminalSelection: "Terminal Selection",
      terminalScrollbar: "Terminal Scrollbar",
      searchMatchActiveBackground: "Current search match background",
      searchMatchActiveForeground: "Current search match text",
      searchMatchBackground: "Search match background",
      searchMatchForeground: "Search match text",
      terminalScrollbarHover: "Terminal Scrollbar Hover",
    } satisfies Record<ThemeColorRole, string>,
  },
  themeEditorHost: {
    couldNotSaveYourTheme: "Could not save your theme",
    browserStorageUnavailableChangeKeptHint:
      "Browser storage is unavailable, so the change was not kept.",
    updated: (savedThemeLabel: string | number | boolean | null | undefined) =>
      `${savedThemeLabel} updated`,
    itsPaletteWasAdded: (mergedAppearance: string | number | boolean | null | undefined) =>
      `Its ${mergedAppearance} palette was added.`,
    saved: (savedThemeLabel: string | number | boolean | null | undefined) =>
      `${savedThemeLabel} saved`,
    yourChangesAreNowActive: "Your changes are now active.",
    yourChangesAreSaved: "Your changes are saved.",
    created: (savedThemeLabel: string | number | boolean | null | undefined) =>
      `${savedThemeLabel} created`,
    itSNowActive: "It’s now active.",
  },
  themeEditor: {
    foundation: "Foundation",
    background: "Background",
    surface: "Surface",
    raisedSurface: "Raised surface",
    overlay: "Overlay",
    text: "Text",
    mutedText: "Muted text",
    border: "Border",
    input: "Input",
    brandContent: "Brand & content",
    subtleSurface: "Subtle surface",
    highlightSurface: "Highlight surface",
    accent: "Accent",
    action: "Action",
    messageSurface: "Message surface",
    codeSurface: "Code surface",
    context: "Context",
    sidebarBackground: "Sidebar background",
    sidebarControls: "Sidebar controls",
    sidebarSelection: "Sidebar selection",
    terminalBackground: "Terminal background",
    status: "Status",
    error: "Error",
    warning: "Warning",
    paletteCreateThemeSameNameHint: (
      editingThemeLabel: string | number | boolean | null | undefined,
      appearance: string | number | boolean | null | undefined,
    ) =>
      `“${editingThemeLabel}” has no ${appearance} palette. Create a theme with the same name to add one.`,
    alreadyHasAPalette: (
      mergeTargetLabel: string | number | boolean | null | undefined,
      appearance: string | number | boolean | null | undefined,
    ) => `“${mergeTargetLabel}” already has a ${appearance} palette.`,
    nameYourThemeFirst: "Name your theme first.",
    alreadyPalettePickAnotherNameHint: (
      mergeTargetLabel: string | number | boolean | null | undefined,
      collision: string | number | boolean | null | undefined,
    ) => `“${mergeTargetLabel}” already has a ${collision} palette. Pick another name.`,
    alreadyLightDarkPalettesPickHint: (
      mergeTargetLabel: string | number | boolean | null | undefined,
    ) => `“${mergeTargetLabel}” already has light and dark palettes. Pick another name.`,
    themeSavedButMadeActiveError: "Theme saved, but it could not be made active. Try again.",
    couldNotSaveTheTheme: "Could not save the theme.",
    couldNotCreateTheTheme: "Could not create the theme.",
    themeName: "Theme name",
    eGAurora: "e.g. Aurora",
    themeAppearance: "Theme appearance",
    colors: "Colors",
    twoColorsRestDerived: "Two colors, rest derived",
    filterColors: "Filter colors",
    advancedColorsAriaLabel: "Use advanced theme colors",
    noMatches: "No matches.",
    editTheme: "Edit theme",
    createTheme: "Create theme",
    selectAnElementEscToCancel: "Select an element · Esc to cancel",
    colorUsageHint: (
      isAdvanced: boolean,
      value: string | number | boolean | null | undefined,
      getThemeRoleLabelSelectedRole: string | number | boolean | null | undefined,
      usageCount: string | number | boolean | null | undefined,
      usageCount1: boolean,
    ) =>
      `${isAdvanced ? (value ?? getThemeRoleLabelSelectedRole) : getThemeRoleLabelSelectedRole} · ${usageCount ?? 0} ${usageCount1 ? "use" : "uses"}`,
    selectAColorBelow: "Select a color below",
    cancelInspectingAppColors: "Cancel inspecting app colors",
    inspectAppColors: "Inspect app colors",
    inspect: "Inspect",
    cancelAndClearTheSelection: "Cancel and clear the selection",
    pickAColorFromTheApp: "Pick a color from the app",
    expandTheThemeEditor: "Expand the theme editor",
    minimizeTheThemeEditor: "Minimize the theme editor",
    closeTheThemeEditor: "Close the theme editor",
    mergeInto: (mergeTargetLabel: string | number | boolean | null | undefined) =>
      `Merge into “${mergeTargetLabel}”`,
    saveChanges: "Save changes",
    addPalette: (activeAppearance: string | number | boolean | null | undefined) =>
      `Add ${activeAppearance} palette`,
  },
  themeImport: {
    bytes: (bytes: string | number | boolean | null | undefined) => `${bytes} bytes`,
    fileThemeFilesFewKbHint: (
      formatByteSizeBytes: string | number | boolean | null | undefined,
      formatByteSizeMaxThemeFileBytes: string | number | boolean | null | undefined,
    ) =>
      `That file is ${formatByteSizeBytes}. Theme files are only a few KB, so this one was not read (limit ${formatByteSizeMaxThemeFileBytes}).`,
    themeJson: "Theme JSON",
    readFilePasteJsonBelowError: "Could not read that file. Paste the JSON below instead.",
    tooLarge: (fileName: string | number | boolean | null | undefined) => `${fileName}: too large`,
    fileReadError: (
      fileName: string | number | boolean | null | undefined,
      causeInstanceofError: boolean,
      causeMessage: string | number | boolean | null | undefined,
    ) => `${fileName}: ${causeInstanceofError ? causeMessage : "not a theme file"}`,
    installError: (
      themeLabel: string | number | boolean | null | undefined,
      causeInstanceofError: boolean,
      causeMessage: string | number | boolean | null | undefined,
    ) => `${themeLabel}: ${causeInstanceofError ? causeMessage : "could not install"}`,
    tooManyCopiesOf: (themeLabel: string | number | boolean | null | undefined) =>
      `Too many copies of "${themeLabel}".`,
    conflictError: (
      themeLabel: string | number | boolean | null | undefined,
      causeInstanceofError: boolean,
      causeMessage: string | number | boolean | null | undefined,
    ) => `${themeLabel}: ${causeInstanceofError ? causeMessage : "failed"}`,
    themeAddedButSelectedTryError: "Theme added, but it could not be selected. Try again.",
    thatThemeFileIsInvalid: "That theme file is invalid.",
    addATheme: "Add a theme",
    orImportAFile: "or import a file",
    chooseFiles: "Choose files",
    reading: "Reading…",
    alreadyInstalled: "Already installed",
    updateExisting: "Update existing",
    keepBoth: "Keep both",
    themeFile: "Theme file",
    dropT3CodeOrVsCodeJsonFiles: "Drop T3 Code or VS Code .json files",
    addTheme: "Add theme",
  },
  themePreviewCircles: {
    applyMode: (
      label: string | number | boolean | null | undefined,
      mode: string | number | boolean | null | undefined,
    ) => `Use ${label} ${mode} mode`,
    applyLightModeOnly: "Use for light mode only",
    applyDarkModeOnly: "Use for dark mode only",
  },
  themeSearch: {
    mostDownloaded: "Most downloaded",
    bestRated: "Best rated",
    newest: "Newest",
    mostRelevant: "Most relevant",
    openVsxSearchFailed: "Open VSX search failed.",
    installedThemesCouldNotBeRead: "Installed themes could not be read.",
    thatThemeCouldNotBeAdded: "That theme could not be added.",
    searchCommunityThemes: "Search community themes",
    findOpenSourceThemesFromOpenVsx: "Find open-source themes from Open VSX.",
    searchOpenVsxThemes: "Search Open VSX themes",
    searchThemes: "Search themes...",
    popular: "Popular",
    sort: "Sort",
    sortThemes: "Sort themes",
    searchingThemes: "Searching themes...",
    supportedFound: (
      resultsLength: string | number | boolean | null | undefined,
      resultsLength1: boolean,
    ) => `${resultsLength} supported ${resultsLength1 ? "theme" : "themes"} found.`,
    searchingSuffix: " Searching themes...",
    noSupportedOpenSourceThemesFound: "No supported open-source themes found",
    tryABroaderSearch: "Try a broader search.",
    updating: "Updating",
    installing: "Installing",
    downloads: "downloads",
    communityColorThemeEditorHint: "A community color theme for your editor.",
    viewSourceFor: (extensionName: string | number | boolean | null | undefined) =>
      `View source for ${extensionName}`,
    update: (pendingUpdateName: string | number | boolean | null | undefined) =>
      `Update “${pendingUpdateName}”?`,
    replacesInstalledVariantsIncludingAnyHint:
      "This replaces its installed variants, including any local edits. Variants no longer in the extension will be removed.",
    updateTheme: "Update theme",
  },
  theme: {
    lightAndDarkThemeVariants: "Light and dark theme variants",
    chooseVariantOptionsCurrently: (
      mode: string | number | boolean | null | undefined,
      optionsLength: string | number | boolean | null | undefined,
      selectedOptionLabel: string | number | boolean | null | undefined,
    ) => `Choose ${mode} variant, ${optionsLength} options, currently ${selectedOptionLabel}`,
    applyVariantAriaLabel: (
      mode: string | number | boolean | null | undefined,
      selectedOptionLabel: string | number | boolean | null | undefined,
    ) => `Use ${mode} variant, currently ${selectedOptionLabel}`,
    applyVariantTooltip: (
      optionLabel: string | number | boolean | null | undefined,
      mode: string | number | boolean | null | undefined,
    ) => `Use ${optionLabel} for ${mode} mode`,
    variantAriaLabel: (
      optionLabel: string | number | boolean | null | undefined,
      mode: string | number | boolean | null | undefined,
      optionIsActive: boolean,
    ) => `Use ${optionLabel} for ${mode} mode${optionIsActive ? ", currently active" : ""}`,
    applyThemeAriaLabel: (
      variantNavigation: boolean,
      variantNavigationCollectionLabel: string | number | boolean | null | undefined,
      themeLabel: string | number | boolean | null | undefined,
      isActive: boolean,
    ) =>
      `Use ${variantNavigation ? `${variantNavigationCollectionLabel}, ${themeLabel} variant` : `${themeLabel} theme`}${isActive ? ", currently active" : ""}`,
    duplicate: (themeLabel: string | number | boolean | null | undefined) =>
      `Duplicate ${themeLabel}`,
    duplicateTheme: "Duplicate theme",
    edit: (themeLabel: string | number | boolean | null | undefined) => `Edit ${themeLabel}`,
    editTheme: "Edit theme",
    export: (themeLabel: string | number | boolean | null | undefined) => `Export ${themeLabel}`,
    exportThemeFile: "Export theme file",
    removeThemesFrom: (
      variantNavigationCollectionLabel: string | number | boolean | null | undefined,
    ) => `Remove themes from ${variantNavigationCollectionLabel}`,
    remove: (themeLabel: string | number | boolean | null | undefined) => `Remove ${themeLabel}`,
    removeThemes: "Remove themes",
    removeTheme: "Remove theme",
    firstVariantsLightDark: "Use the first variants for light and dark",
    applyBothModes: "Use for both light and dark",
    applySingleMode: (cardModes0: string | number | boolean | null | undefined) =>
      `Use for ${cardModes0} mode only`,
    couldnTSaveThemeSelection: "Couldn’t save theme selection",
    couldnTRemoveTheme: "Couldn’t remove theme",
    appearanceMode: "Appearance mode",
    followTheSystemAppearance: "Follow the system appearance",
    applyMode: (mode: string | number | boolean | null | undefined) => `Use ${mode} mode`,
    createTheme: "Create theme",
    addTheme: "Add theme",
    themes: (
      importedThemesLength: string | number | boolean | null | undefined,
      verb: string | number | boolean | null | undefined,
    ) => `${importedThemesLength} themes ${verb}`,
    added: (importedThemeLabel: string | number | boolean | null | undefined) =>
      `${importedThemeLabel} added`,
    itSNowYourTheme: (modes0: string | number | boolean | null | undefined) =>
      `It’s now your ${modes0} theme.`,
    itSNowActive: "It’s now active.",
    removeCollectionConfirmation: (
      removeDialogCollectionLabel: string | number | boolean | null | undefined,
    ) => `Remove themes from “${removeDialogCollectionLabel}”?`,
    removeThemeConfirmation: (
      removeDialogThemeLabel: string | number | boolean | null | undefined,
    ) => `Remove “${removeDialogThemeLabel}”?`,
    selectVariantsWantRemoveRestoreHint:
      "Select the variants you want to remove. You can restore them by importing the extension again.",
    bringBackAnytimeImportingJsonHint: "You can bring it back anytime by importing its JSON file.",
    removeSelected: (
      themeIdsToRemoveLength0: boolean,
      themeIdsToRemoveLength: string | number | boolean | null | undefined,
    ) => `Remove selected${themeIdsToRemoveLength0 ? ` (${themeIdsToRemoveLength})` : ""}`,
  },
  usageProvider: {
    updateCursorAccountUsage: "update Cursor account usage",
    addHub: "Add hub",
    readExistingCursorCliLoginHint:
      "Read your existing Cursor CLI login from macOS Keychain to show account history and monthly limits. macOS may ask you to allow access.",
    noHubsConfigured: "No hubs configured.",
    cliProxy: "CLI Proxy",
    disabled: " · Disabled",
    remove: "Remove",
    removeHubConfirmation: (label: string | number | boolean | null | undefined) =>
      `Remove ${label}?`,
    hubSManagementKeyDeletedHint:
      "The hub's management key is deleted from this server. Its accounts leave the Limits view; the hub itself is untouched. Add it again with the URL and key to bring them back.",
    removeHub: "Remove hub",
  },
  hostConnectionChecks: {
    connectionTestDeviceHostsError: "This connection cannot test device hosts.",
  },
  projectScript: {
    failedToSaveProjectActions: "Failed to save project actions",
    availableMachineAnotherActionChangeHint:
      "No available machine, or another action change is saving.",
    actionsNotSaved: "Actions not saved",
    connectionChangeEnvironmentSettingsError: "This connection cannot change environment settings.",
  },
  scopedModelAvailability: {
    modelUnavailableSelectEnvironmentModelHint: (
      environmentLabel: string | number | boolean | null | undefined,
    ) =>
      `This model is unavailable on ${environmentLabel ?? "a selected environment"}. Select that environment to choose its model separately.`,
  },
  snapShotShortcutRecorder: {
    couldNotStartShortcutRecording: "Could not start shortcut recording.",
    addLetterNumberFunctionKeyHint: "Add a letter, number, or function key to your shortcut.",
    recordSnapshotShortcutCurrently: (value: string | number | boolean | null | undefined) =>
      `Record snapshot shortcut, currently ${value}`,
    changeSnapshotShortcut: "Change snapshot shortcut",
    pressShortcut: "Press shortcut…",
    changeShortcut: "Change shortcut",
    chooseShortcut: "Choose shortcut",
  },
  customModelPreset: { fastMode: "Fast Mode", speed: "Speed" },
};
