/** English settings messages for search, navigation, scope, and panels. */
import type {
  ResponseStreamingMode,
  SidebarProjectSortOrder,
  DiffLayout,
  QuitConfirmationMode,
  BackgroundActivityProfile,
} from "@t3tools/contracts";

export const settings = {
  sections: {
    appearanceLanguage: "Language",
    organization: "Organization",
    behavior: "Behavior",
    projectsAndThreads: "Projects & threads",
    confirmations: "Confirmations",
    textGeneration: "Text generation",
    about: "About",
    diagnostics: "Diagnostics",
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
    },
    settingGlassOpacity: {
      title: "Glass opacity",
    },
    diffColorScheme: {
      title: "Diff colors",
    },
    chatWidth: {
      title: "Chat width",
    },
    panelAnimations: {
      title: "Panel animations",
    },
    environmentIdentification: {
      title: "Environment identification",
    },
    interfaceFont: {
      title: "Interface font",
    },
    promptFont: {
      title: "Prompt font",
    },
    codeFont: {
      title: "Code font",
    },
    terminalFont: {
      title: "Terminal font",
    },
    fontSmoothing: {
      title: "Font smoothing",
    },
    wordWrap: {
      title: "Word wrap",
    },
    composerContext: {
      title: "Composer context",
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
    },
    legacyContextWindowIndicator: {
      title: "Context window indicator (legacy)",
    },
    legacySidebar: {
      title: "Sidebar (legacy)",
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
    },
    browserDefaultProfile: {
      title: "Default browser profile",
    },
    browserDefaultViewport: {
      title: "Default browser viewport",
    },
    browserDefaultZoom: {
      title: "Default browser zoom",
    },
    browserDefaultAppearance: {
      title: "Default browser appearance",
    },
    browserRecordingFrameRate: {
      title: "Browser recording frame rate",
    },
    browserRecordingKeyPresses: {
      title: "Show key presses in recordings",
    },
    browserRecordingMousePresses: {
      title: "Show mouse presses in recordings",
    },
    browserLinkTarget: {
      title: "Open links in",
    },
    browserAutoShowFloatingPreview: {
      title: "Auto-show floating preview",
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
    },
    worktreeBranchNaming: {
      title: "Worktree branch naming",
    },
    githubAccounts: {
      title: "GitHub accounts and token",
    },
    bitbucketCredentials: {
      title: "Bitbucket credentials",
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
};
