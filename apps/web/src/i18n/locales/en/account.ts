/** English UI labels for first run, pairing, cloud connections, accounts, connections, desktop-only dialogs, and routes; excludes persisted values and protocol strings. */
export const account = {
  onboarding: {
    connectEnabled: "T3 Connect enabled",
    availableToDevices: "This environment is available to your other devices through T3 Connect.",
    publishesActivity: "This environment publishes agent activity to your mobile clients.",
    setupConnect: "Set up T3 Connect",
    meshHint:
      "Mesh your devices together — publish this environment and connect the rest, all in one place.",
    dontShowAgain: "Don't show this again",
    notNow: "Not now",
    continue: "Continue",
    enabling: "Enabling…",
    done: "Done",
    publish: "Publish",
    connectDevices: "Connect devices",
    publishEnvironment: "Publish this environment",
    publishHint: "Make this environment available to your other devices through T3 Connect.",
    publishActivity: "Publish agent activity",
    activityHint:
      "Send activity from this environment to your mobile clients for push notifications and Live Activities.",
    noOtherEnvironments:
      "No other environments are published to your account yet. Publish one from another device and it will show up here.",
    settingsFailed: "Could not read settings",
    stillConnecting: "Still connecting",
    savedSettingsFailed: "Your saved settings could not be loaded.",
    workspaceUnconfirmed: "T3 Code could not confirm this workspace.",
    retry: "Retry",
    reload: "Reload",
    connect: "Connect",
    agents: "Agents",
    projects: "Projects",
    scanLimit: "Scan limit reached. Some projects or conversations may be missing.",
    partialImport: "Some history was not imported",
    setupFailed: "Could not finish setup",
    saveFailed: "Your settings could not be saved. Try again.",
    setup: "Set up T3 Code",
    connectComputers: "Connect your computers",
    computersHint: "Choose one or more computers. We’ll set up agents and projects on each.",
    computersToSetUp: "Computers to set up",
    connected: "Connected",
    connecting: "Connecting…",
    addComputer: "Add a computer",
    privacyHint:
      "T3 Code collects anonymous usage data to help us improve it. To read more about how your data is used and how to opt out, see our",
    privacyPolicy: "privacy policy",
    loadingSignIn: "Loading sign-in…",
    signIn: "Sign in",
    loadingComputers: "Loading computers…",
    noComputers: "No computers linked yet.",
    runOnComputers: "Run this on each computer you want to connect.",
    keepRunning: "Keep T3 Code running. Select the computers you want to set up above.",
    pairingFailed: "Pairing failed.",
    pairingLink: "Pairing link",
    needPairingLink: "Need a pairing link?",
    pairing: "Pairing...",
    pair: "Pair",
    runOnHost: "Run this on the computer with your code.",
    startCodePrefix: "Start T3 Code first, or run ",
    addFlag: ". Add",
    tailnetSuffix: " to use your tailnet.",
    connectAgents: "Connect your agents",
    agentsHint: "Choose an agent to start coding. You can add more later.",
    computer: "Computer",
    noTerminalPermission: "This connection cannot control terminals.",
    anotherAccount: "Connect another ChatGPT account",
    readyToCode: "Ready to code.",
    ready: "Ready",
    checking: "Checking...",
    disabled: "Disabled",
    install: "Install",
    runPrefix: "Run ",
    terminalSuffix: " in this terminal.",
    reviewCommand: "Review the command, then press Enter to run it.",
    terminalFailed: "Could not open the setup terminal.",
    preparingCommand: "Preparing command...",
    close: "Close",
    noImportPermission: "This connection cannot import projects or thread history.",
    historyFailed: "Could not import thread history.",
    yourProjects: "Your projects",
    lookingForProjects: "Looking for projects from Claude Code and Codex…",
    dontImport: "Do not import projects",
    chooseProjects: "Choose your projects",
    importHint: "Import projects and conversations from your selected computers.",
    selectAll: "Select all",
    selectNone: "Select none",
    scanningProjects: "Looking for projects…",
    checkProjectsFailed: "Could not check projects. ",
    noProjects: "No existing Claude Code or Codex projects found.",
    importing: "Importing…",
    otherFolders: "Other folders",

    /** Formats display text from driver supplied by the caller. */
    installDriver: (driver: string) => `Install ${driver}`,

    /** Formats display text from count supplied by the caller. */
    importedThreads: (count: number) => `Imported ${count} ${count === 1 ? "thread" : "threads"}`,
    /** Formats display text from imported, skipped supplied by the caller. */
    partialThreadImport: (imported: number, skipped: number) =>
      `Imported ${imported} ${imported === 1 ? "thread" : "threads"}. ${skipped} ${skipped === 1 ? "thread" : "threads"} could not be imported.`,
    /** Formats display text from count supplied by the caller. */
    skippedThreads: (count: number) =>
      `${count} ${count === 1 ? "thread could" : "threads could"} not be imported.`,
    /** Formats display text from count supplied by the caller. */
    incompleteHistory: (count: number) =>
      `Imported ${count} ${count === 1 ? "thread" : "threads"}. Some thread history could not be imported.`,
    /** Formats display text from count supplied by the caller. */
    importProjects: (count: number) => `Import ${count} ${count === 1 ? "project" : "projects"}`,
    /** Formats display text from selected, total supplied by the caller. */
    selectedCount: (selected: number, total: number) => `${selected} of ${total} selected`,
  },
  auth: {
    desktopAndTokenHint:
      "Desktop-managed pairing and one-time pairing tokens are both accepted for this environment.",
    readOnly: "Read only",
    readOnlyHint: "Read projects and threads. Cannot start, message or change anything.",
    unreachable: "Could not reach this environment. Try again.",
    signInFailed: "The sign-in could not continue.",
    checkingRequest: "Checking the sign-in request",
    verifyingHint: "One moment while this environment verifies the agent's request.",
    cannotContinue: "This sign-in cannot continue",
    restartSignIn: "Close this page and start the sign-in again from your agent.",
    agentWantsAccess: "This agent wants to use the threads in every project on",
    localApprovalPrefix: "The name is chosen by the agent. Approval returns to ",
    localApprovalSuffix:
      " on the computer that opened this page. Only approve a sign-in you just started.",
    remoteApprovalPrefix: "The name is chosen by the agent. Approval gives access to whoever runs",
    remoteApprovalSuffix: ". Only approve a sign-in you just started there.",
    permissions: "What it may do",
    permissionHint:
      "Beyond read only, it can start, message and stop threads, and none of them can run with more than the mode you pick.",
    pairingCode: "Pairing code",
    pairingCodePlaceholder: "Paste a one-time pairing code",
    createCodePrefix: "Create one in Settings → Connections, or run ",
    createCodeSuffix: " on this machine.",
    approving: "Approving…",
    approve: "Approve",
    denying: "Denying…",
    deny: "Deny",
    agentSignIn: "Agent sign-in",
    pairingEnvironment: "Pairing with this environment",
    validatingPairing: "Validating the pairing link and preparing your session.",
    pairEnvironment: "Pair with this environment",
    pairingToken: "Pairing token",
    tokenPlaceholder: "Paste a one-time token or pairing secret",
    pairing: "Pairing...",
    continue: "Continue",
    reloadApp: "Reload app",
    connectingBackend: "Connecting to this backend.",
    incompleteLink: "This pairing link is missing its backend host or token.",
    tokenSubmitted:
      "This one-time pairing token was already submitted. Request a new pairing link.",
    backendPaired: "Backend paired",
    pairingFailed: "Pairing failed",
    pairingBackend: "Pairing backend",
    hostPrefix: "Host: ",
    verifyBackend:
      "Verify the backend is reachable from this browser, supports CORS for hosted clients, and is served over HTTPS when opening this page from HTTPS.",
    tryAgain: "Try again",
    openApp: "Open app",
    authenticationFailed: "Authentication failed.",
    trustedCredential:
      "This environment expects a trusted pairing credential before the app can connect.",
    enterToken: "Enter a pairing token to start a session with this environment.",
    desktopManagedHint:
      "This environment is desktop-managed. Open it from the desktop app or paste a bootstrap credential if one was issued explicitly.",
    oneTimeTokenHint:
      "This environment accepts one-time pairing tokens. Pairing links can open this page directly, or you can paste the token here.",

    /** Formats display text from name supplied by the caller. */
    connectClient: (name: string) => `Connect ${name}`,
    /** Formats display text from message supplied by the caller. */
    retryPairingHint: (message: string) =>
      `${message} If the backend accepted this one-time token, request a new pairing link before retrying.`,

    /** Formats display text from label supplied by the caller. */
    environmentSaved: (label: string) =>
      (label || "The environment") + " is saved in this browser.",
  },
  clerk: {
    refresh: "Refresh",
    pushDisabled: "Push notifications are disabled on this device.",
    noAlertTypes: "Push notifications are enabled, but no alert types are selected.",
    updateTimeUnavailable: "Update time unavailable",
    on: "On",
    off: "Off",
    pushNotifications: "Push notifications",
    liveActivities: "Live Activities",
    loadingMobile: "Loading mobile clients",
    noMobile: "No mobile clients",
    installMobileHint:
      "Install T3 Code on your phone and sign in to T3 Connect to get push notifications and Live Activities.",
    mobileClients: "Mobile clients",
    mobileHint: "Mobile devices that get notifications from your environments.",
    loadMobileFailed: "Could not load mobile clients",
    tryAgain: "Try again",
    forgetHint: "This forgets its pairing, credentials, and cached threads here.",
    keepAccountHint:
      "It stays on your T3 Connect account and keeps its host space. Deregister it in",
    connectSettings: "T3 Connect settings",
    freeSpaceSuffix: "to free it.",
    removeDevice: "Remove from this device",
    signIn: "Sign in to T3 Connect",
    linkDateUnavailable: "Link date unavailable",
    managedTunnel: "Managed tunnel",
    activityOnly: "Activity publishing only",
    deregister: "Deregister",
    deregistering: "Deregistering…",
    deregisterServer: "Deregister server",
    deregisterHint:
      "T3 Connect access will be revoked, any managed tunnel will be removed, and a host space will become available. Local connections on your devices are not changed.",
    serverDeregistered: "Server deregistered",
    deregisteredHint: "T3 Connect access was revoked and a host space is now available.",
    deregisterError: "Could not deregister the server.",
    deregisterFailed: "Could not deregister server",
    copyTraceId: "Copy trace ID",
    environmentsHint:
      "Environments registered to your account. Connections on this device are managed in Settings.",
    loadEnvironmentsFailed: "Could not load T3 Connect environments",
    loadingEnvironments: "Loading environments…",
    noEnvironments: "No T3 Connect environments",
    linkEnvironmentHint:
      "Link an environment from its local Settings to make it available through T3 Connect.",
    approvals: "approvals",
    inputRequests: "input requests",
    completions: "completions",
    failures: "failures",

    /** Formats display text from types supplied by the caller. */
    alertsEnabled: (types: string) => `Alerts enabled for ${types}.`,
    /** Formats display text from date supplied by the caller. */
    updatedAt: (date: string) => `Updated ${date}`,
    /** Formats display text from date supplied by the caller. */
    linkedAt: (date: string) => `Linked ${date}`,
    /** Formats display text from label supplied by the caller. */
    confirmDeregister: (label: string) => `Confirm deregistration of ${label}`,

    /** Formats display text from label supplied by the caller. */
    removeFromDevice: (label: string | null) => `Remove ${label ?? ""} from this device?`,
    /** Formats display text from label supplied by the caller. */
    removedFromAccount: (label: string) => `“${label}” will be removed from this account.`,
  },
  cloud: {
    configNotConfigured: (key: string) => `${key} is not configured.`,
    adding: "Adding…",
    connecting: "Connecting…",
    reconnecting: "Reconnecting…",
    checkRelayFailed: "Could not check relay client availability.",
    confirmInstallFailed: "Could not confirm relay client installation.",
    installCancelled: "Relay client installation was cancelled.",
    installFailed: "Could not install the relay client.",
    missingFinalStatus: "The relay client install completed without a final status.",
    relayStillUnavailable: "The relay client is still unavailable after installation.",
    wrongEnvironment: "Relay returned credentials for a different environment.",
    wrongProvider: "Relay returned credentials for a different endpoint provider.",
    readLinkFailed: "Could not read environment cloud link state.",
    preferencesFailed: "Could not update environment cloud preferences.",
    unlinkFailed: "Could not unlink the environment from cloud.",
    relayNotConfigured: "T3CODE_RELAY_URL is not configured.",
    proofFailed: "Could not obtain environment link proof.",
    relayAccessFailed: "Could not configure environment relay access.",
    connectStateFailed: "Could not read T3 Connect link state.",
    updateAccessFailed: "Could not update T3 Connect access.",
    updateConnectFailed: "Could not update T3 Connect",
    copyTraceId: "Copy trace ID",
    localNotReady: "Local environment is not ready yet.",
    permissionRequired: "This connection needs permission to view and manage T3 Connect settings.",
    waitForSettings: "Wait until the current T3 Connect settings can be read.",
    signInBeforeEnabling: "Sign in to T3 Connect before enabling this.",
    routeAdded: "T3 Connect route added",
    environmentAdded: "Environment added",
    connectError: "Could not connect the T3 Connect environment.",
    connectFailed: "Could not connect environment",
    offlineHint: "You appear to be offline.",
    loadEnvironmentsFailed: "Could not load T3 Connect environments",
    tryAgain: "Try again",
    savedWithoutConnect: "Saved without T3 Connect",
    notAdded: "Not added",
    available: "Available",
    offline: "Offline",
    unavailable: "Unavailable",
    checking: "Checking…",
    relayOnline: "Relay online",
    relayOffline: "Relay offline",
    checkingRelay: "Checking relay status",
    relayUnavailable: "Relay status unavailable",
    add: "Add",
    unsupportedClient: "Client not supported",
    addRoute: "Add route",
    authorizationRequest: "Authorization request",
    incompleteConnectLink: "This connect link is incomplete",
    missingAuthorization:
      "The link is missing its authorization request. Re-run `t3 connect` in your terminal and open the freshly printed URL.",
    browserAuthorization: "Browser authorization",
    connectingTerminal: "Connecting your terminal",
    redirectingAuthorization: "Redirecting to authorize T3 Connect for your CLI…",
    signInToAuthorize: "Sign in to continue authorizing T3 Connect for your CLI.",
    signIn: "Sign in",
    checkingInstallation: "Checking current installation",
    waitingInstaller: "Waiting for installer",
    downloadingRelay: "Downloading relay client",
    verifyingDownload: "Verifying download",
    installingRelay: "Installing relay client",
    validatingExecutable: "Validating executable",
    activatingInstallation: "Activating installation",
    installRelay: "Install relay client?",
    preparingAccess: "T3 Code is preparing this environment for secure access through T3 Connect.",
    relayRequired:
      "T3 Code needs the relay client to make this environment available through T3 Connect.",
    installProgress: "Relay client installation progress",
    keepOpen: "Keep T3 Code open while the relay client is installed.",
    managedRelay: "Managed relay client",
    downloadInstall: "Download and install",
    connected: "Connected",
    connectionFailed: "Connection failed",
    notConnected: "Not connected",

    /** Formats display text from platform, arch supplied by the caller. */
    unsupportedRelayPlatform: (platform: string, arch: string) =>
      `T3 Code cannot install the relay client automatically on ${platform}-${arch}.`,
    /** Formats display text from url supplied by the caller. */
    linkChallengeFailed: (url: string) => `${url}/v1/client/environment-link-challenges failed`,
    /** Formats display text from url supplied by the caller. */
    linkRequestFailed: (url: string) => `${url}/v1/client/environment-links failed`,
    /** Formats display text from requestedVersion, activeVersion, dialogStatus supplied by the caller. */
    installConflict: (requestedVersion: string, activeVersion: string, dialogStatus: string) =>
      `Cannot confirm relay client installation ${requestedVersion}; installation ${activeVersion} has dialog status ${dialogStatus}.`,
    /** Formats display text from message, traceId supplied by the caller. */
    traceMessage: (message: string, traceId: string) => `${message} Trace ID: ${traceId}`,
    /** Formats display text from label supplied by the caller. */
    fallbackRoute: (label: string) =>
      `${label} falls back to T3 Connect when its other routes are unreachable.`,
    /** Formats display text from label supplied by the caller. */
    connectingNamed: (label: string) => `Connecting to ${label} through T3 Connect.`,
    /** Formats display text from status supplied by the caller. */
    unsupportedStatus: (status: string) => `T3 Connect · ${status} · Client not supported`,
    /** Formats display text from status supplied by the caller. */
    onlineStatus: (status: string) => `T3 Connect · ${status} · Relay online`,
    /** Formats display text from status supplied by the caller. */
    offlineStatus: (status: string) => `T3 Connect · ${status} · Relay offline`,
    /** Formats display text from status supplied by the caller. */
    checkingStatus: (status: string) => `T3 Connect · ${status} · Checking relay status…`,
    /** Formats display text from status supplied by the caller. */
    unavailableStatus: (status: string) => `T3 Connect · ${status} · Relay status unavailable`,

    /** Formats display text from version supplied by the caller. */
    installVersion: (version: string) =>
      `T3 Code will download and install version ${version} locally.`,
    /** Formats display text from step, total supplied by the caller. */
    stepProgress: (step: number, total: number) => `${step} of ${total}`,
  },
  desktop: {
    sshPromptFailed: "SSH password prompt failed.",
    captureTooLarge: "The captured window is too large to attach.",
    removeAttachmentHint: "Remove an attachment, then try this capture again.",
    captureSaveFailed: "The captured window could not be saved to the draft.",
    noProject: "Snapshot taken, but no project is available",
    addProjectHint: "Add a project, then capture the window again.",
    snapshotFailed: "Snapshot failed",
    retryCapture: "Try the capture again.",
    sshExpired: "This SSH password prompt expired. Try connecting again.",
    sshPasswordRequired: "SSH Password Required",
    sshPasswordPrefix: "T3 needs your SSH password to connect to ",
    sshPasswordSuffix:
      ". The password is passed to the local SSH process for this connection attempt and is not saved by T3 Code.",
    expired: "Expired",
    sshKeysHint: "Use SSH keys to avoid repeated password prompts on new SSH sessions.",
    dismiss: "Dismiss",
    continue: "Continue",
    networkUnavailable: "Desktop network access is unavailable.",
    exposureFailed: "Failed to load desktop server exposure state.",
    endpointsFailed: "Failed to load advertised desktop endpoints.",
    sshDiscoveryUnavailable: "Desktop SSH host discovery is unavailable.",
    sshDiscoveryFailed: "Failed to discover SSH hosts.",
    wslUnavailable: "Desktop WSL state is unavailable.",
    wslFailed: "Failed to load WSL state.",

    /** Formats display text from id, message supplied by the caller. */
    captureError: (id: string, message: string) => `Capture ${id}: ${message}`,
  },
  connection: {
    indexedDbUnavailable: "IndexedDB is unavailable in this browser context.",
    indexedDbError: "Unknown IndexedDB error",
    indexedDbReadError: "Unknown IndexedDB read error",
    indexedDbWriteError: "Unknown IndexedDB write error",
    indexedDbRemoveError: "Unknown IndexedDB remove error",
    indexedDbCursorError: "Unknown IndexedDB cursor error",
    secureStorageUnavailable: "Desktop secure storage is unavailable in this system context.",
    /** Formats the catalog operation and diagnostic cause without changing the cause text. */
    catalogFailure: (operation: string, cause: string) =>
      `Could not ${operation} the local connection catalog: ${cause}`,
    /** Formats the persistence operation identifier and diagnostic cause. */
    persistenceFailure: (operation: string, cause: string) =>
      `Could not ${operation.replaceAll("-", " ")}: ${cause}`,

    missingSshCredential: "The SSH environment did not issue a pairing credential.",
    signInConnect: "Sign in to T3 Connect to connect this environment.",
    sessionUnavailable: "The T3 Connect session is unavailable.",
    noSavedEndpoint: "This environment does not have a saved connection endpoint.",
    invalidToken: "Invalid pairing token. Check the token and try again.",
    sessionTimedOut: "Timed out waiting for authenticated session after bootstrap.",
    enterToken: "Enter a pairing token to continue.",
    authenticationFailed: "Authentication failed.",
    readSessionFailed: "Could not read environment session.",
    localDisabled: "The local environment is disabled.",

    /** Formats display text from message supplied by the caller. */
    prepareSshFailed: (message: string) => `Could not prepare the SSH environment: ${message}`,
    /** Formats display text from label supplied by the caller. */
    differentHost: (label: string) =>
      `That host reaches ${label}, a different machine. Add it as its own environment instead.`,
    /** Formats display text from message supplied by the caller. */
    credentialFailed: (message: string) =>
      `Could not load the desktop primary credential: ${message}`,
    /** Formats display text from message supplied by the caller. */
    disconnectSshFailed: (message: string) =>
      `Could not disconnect the SSH environment: ${message}`,
    /** Formats display text from id supplied by the caller. */
    backendNotReady: (id: string) => `Desktop-local backend ${id} is not ready yet.`,
    /** Formats display text from operation, status supplied by the caller. */
    primaryRequestFailed: (operation: string, status: number) =>
      `Primary environment request failed during ${operation} (HTTP ${status}).`,
    /** Formats display text from urlKind, source supplied by the caller. */
    parseTargetFailed: (urlKind: string, source: string) =>
      `Could not parse ${urlKind} for the ${source} primary environment target.`,
    /** Formats display text from source, protocol supplied by the caller. */
    unsupportedProtocol: (source: string, protocol: string) =>
      `The ${source} primary environment target uses unsupported protocol ${protocol}.`,
    /** Formats display text from missing supplied by the caller. */
    missingBootstrap: (missing: string) =>
      `Desktop bootstrap is missing ${missing} for the local environment.`,

    sshDesktopOnly: "SSH environments are only available in the desktop app.",
  },
  routes: {
    notFound: "Page not found",
    home: "Go home",
    somethingWrong: "Something went wrong.",
    tryAgain: "Try again",
    reload: "Reload app",
    errorReport: "Error report",
    copied: "Copied",
    copyError: "Copy error",
    routerError: "An unexpected router error occurred.",
    keybindingsUpdated: "Keybindings updated",
    keybindingsReloaded: "Keybindings configuration reloaded successfully.",
    invalidKeybindings: "Invalid keybindings configuration",
    newThreadFailed: "Couldn’t start a new thread",
    retryDraft: "The project is still available. Try opening the draft again.",
    localOffHint:
      "The local environment is turned off. Connect a remote environment, or turn the local environment back on in Connections.",
    connectCloudHint:
      "Enable T3 Connect on that machine, then open Connections here to sign in with the same account. You can also add the machine using a pairing link.",
    connectPairingHint:
      "Open Connections and add that machine using its pairing link. This app must be able to reach it.",
    connectComputer: "Connect to a computer running T3 Code",
    connectComputerHint:
      "This app connects to T3 Code running on your computer or a server. Start the T3 Code desktop app or command-line server on that machine and keep it running.",
    openConnections: "Open Connections",
    desktopPreview: "Preview is desktop-only",
    desktopPreviewHint: "Open T3 Code in the desktop app to use the in-app preview.",
    connectProviders: "Connect an environment to set up its providers.",
    restoreDefaults: "Restore device defaults",

    /** Formats display text from label supplied by the caller. */
    reconnectProviders: (label: string) => `Reconnect ${label} to set up its providers.`,
    /** Formats display text from title supplied by the caller. */
    chooseSupporting: (title: string) =>
      `${title} requires a supporting environment. Choose one to continue.`,
    /** Formats display text from title supplied by the caller. */
    connectSupporting: (title: string) =>
      `${title} requires a supporting environment. Connect or update an environment to continue.`,
    /** Formats display text from title supplied by the caller. */
    chooseScope: (title: string) =>
      `${title} is not available for the selected target. Choose its owning scope to continue.`,

    /** Formats display text from app supplied by the caller. */
    notFoundHint: (app: string) =>
      `This link doesn't point to a page in ${app}. Go home to choose a project or start a thread.`,
    /** Formats display text from label supplied by the caller. */
    reconnectSettings: (label: string) => `Reconnect ${label} to change its settings.`,
  },
};
