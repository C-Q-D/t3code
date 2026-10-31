/** Composes the shared titlebar and stone workspace grid; routes own their inner panels. */
import { t } from "~/i18n";
import { useAtomValue } from "@effect/atom-react";
import * as Schema from "effect/Schema";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ComponentProps,
  type ReactNode,
} from "react";
import {
  useLocation,
  useRouter,
  useParams,
  useRouterState,
  type AnyRouter,
} from "@tanstack/react-router";

import { moveWorkspaceFocus, workspaceAreaProps } from "../lib/workspaceFocus";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { registerCommands, registerMenuAction } from "../shortcuts/dispatcher";
import { resolveThreadRouteRef } from "../threadRoutes";
import { createPresenceRegistry } from "../lib/presenceRegistry";
import { useDesktopWindowState } from "./frame/DesktopWindowHost";
import { runWindowAction } from "./frame/WindowsWindowControls";
import { isWindowsPlatform } from "../lib/utils";
import { isCommandPaletteOpen } from "../commandPaletteBus";
import { isElectron } from "../env";
import {
  releaseThreadUndoShortcut,
  threadUndoClaimsShortcut,
  undoLatestThreadAction,
} from "../hooks/showThreadUndoNotice";
import { getLocalStorageItem, removeLocalStorageItem } from "../hooks/useLocalStorage";
import {
  isRichTextBoldShortcut,
  resolveShortcutCommand,
  shortcutLabelForCommand,
} from "../keybindings";
import { isEditableFocused } from "../lib/editableFocus";
import { isPreviewFocused } from "../lib/previewFocus";
import { isTerminalFocused } from "../lib/terminalFocus";
import { isModelPickerOpen } from "../modelPickerVisibility";
import {
  selectActiveRightPanel,
  selectThreadRightPanelState,
  useRightPanelStore,
} from "../rightPanelStore";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { useComposerDraftStore } from "../composerDraftStore";
import {
  resolveRightPanelSidebarAction,
  shouldUseRightPanelSheet,
  shouldUseDiscussionPanelSheet,
} from "../rightPanelLayout";
import { selectThreadTerminalUiState, useTerminalUiStateStore } from "../terminalUiStateStore";

import { resolveThreadRouteTarget } from "../threadRoutes";
import { cn, isMacPlatform } from "../lib/utils";
import { primaryServerKeybindingsAtom } from "../state/server";
import { useEnvironmentIdentificationMode } from "../hooks/useSettings";
import {
  PanelAnimationSuppressionProvider,
  usePanelAnimationSettings,
  usePanelNavigationSuppression,
} from "../panelAnimations";
import { useProjects } from "../state/entities";
import { BackgroundThreadAnnouncer } from "./BackgroundThreadAnnouncer";
import { HistorySwipeNavigation } from "./HistorySwipeNavigation";
import ThreadSidebar from "./Sidebar";
import { SettingsSidebarNav } from "./settings/SettingsSidebarNav";
import { WebPagesSidebar } from "../webPages/WebPagesSidebar";
import { isWebPagesPage, isAppModalPage } from "./sidebar/mainAppLocation";
import { ProjectRail } from "./sidebar/ProjectRail";
import type { SidebarRouteReveal } from "./sidebar/routeReveal";
import { useSidebarStageBackdropVariant } from "./SidebarStageBackdrop";
import {
  clampThreadSidebarWidth,
  resolveThreadSidebarMinimumWidth,
  THREAD_SIDEBAR_WIDTH_STORAGE_KEY,
} from "./threadSidebarWidth";
import { Sidebar, SidebarProvider, SidebarRail, SidebarTrigger, useSidebar } from "./ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";
import { WindowTitlebar } from "./frame/WindowTitlebar";
import {
  TitlebarSlotProvider,
  TitlebarSlotOutlet,
  useTitlebarPanelLayout,
} from "./frame/titlebarSlot";
import { Slab } from "./ui/slab";
import {
  resolveFrameGeometry,
  resolveFrameInitialSidebarWidth,
  resolveFrameSidebarMaximumWidth,
} from "./frame/frameGeometry";

const MACOS_TRAFFIC_LIGHTS_LEFT_INSET = "var(--desktop-window-controls-inset, 90px)";

/** Welcome routes register with the shell that owns their titlebar controls. */
export const OnboardingRouteRegistry = createPresenceRegistry<"onboarding">();

/** Holds onboarding presence next to the shell element, outside the layout's route state. */
function OnboardingShell({ children, ...props }: ComponentProps<typeof SidebarProvider>) {
  const { counts, onChange } = OnboardingRouteRegistry.usePresence();
  return (
    <OnboardingRouteRegistry.Provider onChange={onChange}>
      <SidebarProvider
        {...props}
        data-onboarding-route={(counts.onboarding ?? 0) > 0 ? "true" : "false"}
      >
        {children}
      </SidebarProvider>
    </OnboardingRouteRegistry.Provider>
  );
}
/** ChatView registers its mounted workspace with the nearest main slab. */
export const ChatWorkspaceRegistry = createPresenceRegistry<"workspace">();

/** Keeps route mount counts local while preserving the same slab across route transitions. */
function MainSlab({ children, chatOwnsSlabs }: { children: ReactNode; chatOwnsSlabs: boolean }) {
  const { counts, onChange } = ChatWorkspaceRegistry.usePresence();
  return (
    <ChatWorkspaceRegistry.Provider onChange={onChange}>
      <Slab
        tone={chatOwnsSlabs ? null : "card"}
        radius={chatOwnsSlabs ? null : "slab"}
        elevation={chatOwnsSlabs ? null : "slab-frame"}
        glow={!chatOwnsSlabs}
        className={cn(
          "relative flex min-h-0 min-w-0 flex-1 flex-col",
          !chatOwnsSlabs && "overflow-hidden",
        )}
        render={<div className={chatOwnsSlabs ? undefined : "stone-frame-card"} />}
        data-chat-workspace-mounted={(counts.workspace ?? 0) > 0 ? "true" : "false"}
        data-frame-main={chatOwnsSlabs ? "chat" : ""}
      >
        {children}
      </Slab>
    </ChatWorkspaceRegistry.Provider>
  );
}

/** Exposes the sidebar's inline layout; mobile drawer state never reserves a grid track. */
function FrameWorkspace({ children }: { children: ReactNode }) {
  const { isMobile, state } = useSidebar();
  return (
    <div
      className="window-frame-workspace grid min-h-0 min-w-0"
      data-sidebar-inline={!isMobile ? "true" : "false"}
      data-sidebar-collapsed={state === "collapsed" ? "true" : "false"}
    >
      {children}
    </div>
  );
}

/**
 * Owns the temporary sidebar session above keyed ChatViews so switching an open
 * panel between conversations does not capture its already-collapsed state.
 * The original visibility wins on close, even after manual changes while open.
 */
function RightPanelSidebarVisibility({ sheet }: { sheet: boolean }) {
  const target = useParams({ strict: false, select: (params) => resolveThreadRouteTarget(params) });
  const draft = useComposerDraftStore((state) =>
    target?.kind === "draft" ? state.getDraftSession(target.draftId) : null,
  );
  const threadRef =
    target?.kind === "server"
      ? target.threadRef
      : draft
        ? (draft.promotedTo ?? scopeThreadRef(draft.environmentId, draft.threadId))
        : null;
  const panelOpen = useRightPanelStore(
    (state) => selectThreadRightPanelState(state.byThreadKey, threadRef).isOpen,
  );
  const sidebar = useSidebar();
  const snapshotActive = useRef(false);

  useLayoutEffect(() => {
    const action = resolveRightPanelSidebarAction({
      snapshotActive: snapshotActive.current,
      panelOpen,
      sheet,
    });
    if (action === "capture-and-collapse") {
      snapshotActive.current = true;
      sidebar.saveSidebarState();
      sidebar.setOpenTemporarily(false);
    } else if (action === "restore") {
      snapshotActive.current = false;
      sidebar.restoreSidebarState();
    }
  }, [panelOpen, sheet, sidebar]);
  return null;
}

function subscribeToViewportWidth(onChange: () => void): () => void {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

function readViewportWidth(): number {
  return window.innerWidth;
}

/** Reads the CSS frame contract so resize limits reserve the project rail and gutters. */
function readFrameGeometry() {
  const styles = getComputedStyle(document.documentElement);
  const pixels = (name: string) => Number.parseFloat(styles.getPropertyValue(name));
  return resolveFrameGeometry({
    sidebarWidth: pixels("--frame-sidebar-width"),
    projectbarWidth: pixels("--frame-projectbar-width"),
    paddingInline: pixels("--frame-padding-inline"),
    slabGap: pixels("--frame-slab-gap"),
  });
}

/** Restores a user's drag width, or the frame's design width when no preference exists. */
function readInitialThreadSidebarWidth(): number {
  const frame = readFrameGeometry();
  try {
    return resolveFrameInitialSidebarWidth(
      getLocalStorageItem(THREAD_SIDEBAR_WIDTH_STORAGE_KEY, Schema.Finite),
      window.innerWidth,
      frame,
    );
  } catch (error) {
    console.error("Could not read persisted thread sidebar width.", error);
    return resolveFrameInitialSidebarWidth(null, window.innerWidth, frame);
  }
}

/** Reads the current router location at keypress time so usage-specific bindings cannot become stale. */
function readUsagePageOpen(router: AnyRouter) {
  return router.state.location.pathname === "/usage";
}

/** Keeps shell shortcuts out of the settings control that is recording a new binding. */
function isKeybindingCaptureTarget(event: KeyboardEvent) {
  return event.target instanceof HTMLElement && event.target.closest("[data-keybinding-capture]");
}

/** Builds shortcut context from the current thread and its panel stores; non-thread routes have no panels. */
function readRoutePanelsOpen(router: AnyRouter) {
  const routeThreadRef = resolveThreadRouteRef(router.state.matches.at(-1)?.params ?? {});
  if (!routeThreadRef) return { terminalOpen: false, previewOpen: false };
  return {
    terminalOpen: selectThreadTerminalUiState(
      useTerminalUiStateStore.getState().terminalUiStateByThreadKey,
      routeThreadRef,
    ).terminalOpen,
    previewOpen:
      selectActiveRightPanel(useRightPanelStore.getState().byThreadKey, routeThreadRef) ===
      "preview",
  };
}

/** Registers back and forward against live router context; returns the disposer for the shell lifetime. */
export function registerNavigationHistoryCommands(router: AnyRouter): () => void {
  return registerCommands(
    {
      "navigation.back": (event) => {
        event.preventDefault();
        event.stopPropagation();
        window.history.back();
      },
      "navigation.forward": (event) => {
        event.preventDefault();
        event.stopPropagation();
        window.history.forward();
      },
    },
    {
      when: (event) => !isKeybindingCaptureTarget(event),
      context: () => ({
        ...readRoutePanelsOpen(router),
        usagePageOpen: readUsagePageOpen(router),
      }),
    },
  );
}

// Capture phase, so F6 also leaves widgets that swallow keys, such as the terminal.
/** Registers F6 traversal and desktop menu forwarding; capture lets focus leave terminal widgets. Returns cleanup. */
function registerWorkspaceFocusCommands(router: AnyRouter): () => void {
  const move = (direction: 1 | -1) => (event: KeyboardEvent) => {
    if (event.isComposing) return false;
    // Inside a dialog the move is refused, but the key is still consumed.
    event.preventDefault();
    event.stopPropagation();
    moveWorkspaceFocus(direction);
  };
  const disposers = [
    registerCommands(
      { "workspace.focusNext": move(1), "workspace.focusPrevious": move(-1) },
      {
        capture: true,
        when: (event) => !isKeybindingCaptureTarget(event),
        context: () => readRoutePanelsOpen(router),
      },
    ),
    // A focused desktop browser forwards the keys; its renderer focus is stale.
    registerMenuAction("workspace.focusNext", () => moveWorkspaceFocus(1, "panel")),
    registerMenuAction("workspace.focusPrevious", () => moveWorkspaceFocus(-1, "panel")),
  ];
  return () => {
    for (const dispose of disposers) dispose();
  };
}

// Escape leaves the pull requests page when no scope (a selection, a dialog,
// a drag) claimed it, so it observes after every other scope.
/** Leaves the pull-request page only after other shortcut scopes decline Escape; returns cleanup. */
function registerPullRequestsEscapeCommand(router: AnyRouter): () => void {
  return registerCommands(
    {},
    {
      observe: (event, consumed) => {
        if (consumed || event.repeat || event.isComposing || event.key !== "Escape") return;
        if (router.state.location.pathname !== "/pull-requests") return;
        event.preventDefault();
        const activeElement = document.activeElement;
        if (activeElement instanceof HTMLElement) activeElement.blur();
        if (router.state.location.state.__TSR_index !== 0) {
          window.history.back();
          return;
        }
        void router.navigate({ to: "/" });
      },
    },
  );
}

const MODIFIER_KEYS = new Set(["Alt", "Control", "Meta", "Shift"]);

// A held key undoes once. Module state: undoing an archive navigates, and the
// hold must survive whatever that re-renders.
let heldUndoKey: string | null = null;

// Undoes the thread actions in the sidebar's notice. Settings and Usage own
// mod+z while open. Captured so mod+z reaches it before the composer's own
// undo handler consumes the key.
/** Owns held-key suppression and input invalidation for sidebar undo. The visibility reader preserves editor undo when the sidebar is hidden; returns cleanup. */
function registerThreadUndoCommands(
  router: AnyRouter,
  readSidebarVisible: () => boolean,
): () => void {
  const threadSidebarShown = () =>
    !isAppModalPage(router.state.location.pathname) &&
    !isWebPagesPage(router.state.location.pathname);
  const unregister = registerCommands(
    {},
    {
      capture: true,
      when: threadSidebarShown,
      onKeyDown: (event) => {
        // Cancel a held key's repeats so they cannot fall through to the
        // editor's own undo, even after the last notice is gone.
        if (event.repeat) {
          if (event.code !== heldUndoKey) return false;
          event.preventDefault();
          event.stopPropagation();
          return true;
        }
        // A modifier tapped mid-hold leaves the held key repeating.
        if (!MODIFIER_KEYS.has(event.key)) heldUndoKey = null;
        const command = resolveShortcutCommand(
          event,
          appAtomRegistry.get(primaryServerKeybindingsAtom),
          {
            context: {
              terminalFocus: isTerminalFocused(),
              previewFocus: isPreviewFocused(),
              ...readRoutePanelsOpen(router),
              // A collapsed sidebar hides the notice, so text fields keep their own undo.
              editableFocus:
                isEditableFocused(event.target) &&
                !(readSidebarVisible() && threadUndoClaimsShortcut()),
              modelPickerOpen: isModelPickerOpen(),
            },
          },
        );
        if (command !== "thread.undo") {
          if (!MODIFIER_KEYS.has(event.key)) releaseThreadUndoShortcut();
          return false;
        }
        if (isCommandPaletteOpen() || isModelPickerOpen()) return false;
        if (!undoLatestThreadAction()) return false;
        heldUndoKey = event.code;
        event.preventDefault();
        event.stopPropagation();
        return true;
      },
    },
  );
  // Pastes from a menu, dictation and drops edit text without a keypress.
  const onInput = () => {
    if (threadSidebarShown()) releaseThreadUndoShortcut();
  };
  window.addEventListener("input", onInput, true);
  return () => {
    unregister();
    window.removeEventListener("input", onInput, true);
  };
}

/** Keyboard and menu commands that live as long as the app shell. */
function registerAppShellCommands(router: AnyRouter, shellElement: Element): () => void {
  // The provider mirrors the visibility it renders onto its wrapper, so the
  // committed state is readable when a key arrives.
  const readSidebarVisible = () =>
    shellElement.closest('[data-slot="sidebar-wrapper"]')?.getAttribute("data-sidebar-state") ===
    "expanded";
  const disposers = [
    registerThreadUndoCommands(router, readSidebarVisible),
    registerNavigationHistoryCommands(router),
    registerWorkspaceFocusCommands(router),
    registerPullRequestsEscapeCommand(router),
    registerMenuAction("open-settings", () => {
      if (!/^\/settings(\/|$)/.test(router.state.location.pathname))
        void router.navigate({ to: "/settings" });
    }),
  ];
  return () => {
    for (const dispose of disposers) dispose();
  };
}

/** Keeps the localized toggle in the frame while owning shell command registration for its mounted lifetime. */
function SidebarControl() {
  const router = useRouter();
  const usagePageOpen = useLocation({ select: (location) => location.pathname === "/usage" });
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const { toggleSidebar } = useSidebar();
  const environmentIdentificationMode = useEnvironmentIdentificationMode();
  const stageBackdropVariant = useSidebarStageBackdropVariant(environmentIdentificationMode);
  const shortcutLabel = shortcutLabelForCommand(keybindings, "sidebar.toggle", {
    context: { usagePageOpen },
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("[data-keybinding-capture]")
      ) {
        return;
      }
      if (
        isRichTextBoldShortcut(event, window.getSelection()) &&
        event.target instanceof HTMLElement &&
        event.target.closest('[data-composer-rich-text="true"]')
      ) {
        // The rich-text composer claims Mod+B only to bold selected text;
        // the toggle stays available everywhere else.
        return;
      }
      if (
        resolveShortcutCommand(event, keybindings, { context: { usagePageOpen } }) !==
        "sidebar.toggle"
      )
        return;

      event.preventDefault();
      event.stopPropagation();
      toggleSidebar();
    };

    // Capture before focused editors consume commands such as Mod+B for rich-text formatting.
    window.addEventListener("keydown", onKeyDown, true);
    // A focused desktop browser page forwards the chord as a menu action.
    const unsubscribe = window.desktopBridge?.onMenuAction((action) => {
      if (action === "sidebar.toggle") toggleSidebar();
    });
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      unsubscribe?.();
    };
  }, [keybindings, toggleSidebar, usagePageOpen]);

  // The control lives as long as the shell, so it carries the shell's commands. Created
  // once so re-renders never re-register them.
  const [appShellCommandsRef] = useState(
    () => (node: HTMLDivElement | null) =>
      node === null ? undefined : registerAppShellCommands(router, node),
  );

  return (
    <div
      className="window-titlebar-sidebar-control relative flex size-8 shrink-0 items-center justify-center"
      ref={appShellCommandsRef}
      data-sidebar-control=""
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <SidebarTrigger
              // Over the stage artwork the trigger is a control on imagery, like the media
              // viewer's arrows; that variant positions itself, so the layout is reset here.
              variant={stageBackdropVariant ? "media-navigation" : "ghost"}
              className={stageBackdropVariant ? "relative top-auto translate-y-0" : undefined}
              aria-label={t.sidebar.layout.toggleSidebarAriaLabel}
            />
          }
        />
        <TooltipPopup side="bottom">
          {t.sidebar.layout.toggleSidebarTooltip(shortcutLabel)}
        </TooltipPopup>
      </Tooltip>
    </div>
  );
}

// Settings swaps the thread sidebar out of the tree. Keep the lightweight
// project projection subscribed so returning to a draft never renders the
// zero-project state while the environment snapshot reconnects.
function ProjectProjectionRetention() {
  useProjects();
  return null;
}

/**
 * Wraps workspace routes with the shared titlebar and route-specific sidebar.
 * children supplies the route content; page roots must take their height from
 * the parent workspace, which receives the space below the titlebar.
 * Mount within the app router and environment providers for navigation and shortcuts.
 */
/** Frames routes with shared chrome; chat owns its slabs and discussion can portal a sibling panel. */
export function AppSidebarLayout({ children }: { children: ReactNode }) {
  return (
    <TitlebarSlotProvider>
      <AppShell>{children}</AppShell>
    </TitlebarSlotProvider>
  );
}

/** Reads route panel ownership below the titlebar provider and lays out the shared shell. */
function AppShell({ children }: { children: ReactNode }) {
  const { active: titlebarPanelActive } = useTitlebarPanelLayout();
  const sidebarArea = workspaceAreaProps("sidebar", 0, "Threads");
  const [sidebarRouteReveal] = useState<SidebarRouteReveal>(() => ({
    observedKey: null,
    pendingKey: null,
  }));
  const {
    active: panelAnimationsActive,
    durationMs: panelAnimationDurationMs,
    easing: panelAnimationEasing,
  } = usePanelAnimationSettings();
  // Wait for the outlet's transition to finish before replacing navigation.
  // The requested URL and matches can advance while settings is still mounted;
  // measuring the thread sidebar then would also lay out that outgoing page.
  const pathname = useRouterState({
    select: (state) => (state.resolvedLocation ?? state.location).pathname,
  });
  const chatOwnsSlabs = useParams({
    strict: false,
    select: (params) => resolveThreadRouteTarget(params) !== null,
  });
  const panelAnimationsSuppressed = usePanelNavigationSuppression(pathname);
  const routePanelAnimationsActive = panelAnimationsActive && !panelAnimationsSuppressed;
  const isOnSettings = pathname === "/settings" || pathname.startsWith("/settings/");
  const isOnWebPages = isWebPagesPage(pathname);
  const isWindowsDesktop = isElectron && isWindowsPlatform(navigator.platform);
  const isMacosDesktop = isElectron && isMacPlatform(navigator.platform);
  const [sidebarWidth, setSidebarWidth] = useState(readInitialThreadSidebarWidth);
  // A clamped drag may not change width, so viewport changes need a separate subscription.
  const viewportWidth = useSyncExternalStore(subscribeToViewportWidth, readViewportWidth);
  const [titlebarLeadingWidth, setTitlebarLeadingWidth] = useState(0);
  const [frame] = useState(readFrameGeometry);
  const sidebarMinimumWidth = resolveThreadSidebarMinimumWidth(titlebarLeadingWidth);
  const sidebarMaximumWidth = resolveFrameSidebarMaximumWidth(
    viewportWidth,
    sidebarMinimumWidth,
    frame,
  );
  const resetSidebarWidth = () => {
    try {
      removeLocalStorageItem(THREAD_SIDEBAR_WIDTH_STORAGE_KEY);
    } catch (error) {
      console.error("Could not clear persisted thread sidebar width.", error);
    }
    setSidebarWidth(resolveFrameInitialSidebarWidth(null, viewportWidth, frame));
  };
  const { fullscreen: isWindowFullscreen } = useDesktopWindowState();
  const windowControlsInsetStyle = (
    isMacosDesktop && !isWindowFullscreen
      ? { "--workspace-controls-left": MACOS_TRAFFIC_LIGHTS_LEFT_INSET }
      : {}
  ) as CSSProperties;
  const sidebarProviderStyle = {
    "--sidebar-width": `${clampThreadSidebarWidth(sidebarWidth, sidebarMinimumWidth, sidebarMaximumWidth)}px`,
    "--panel-animation-duration": `${panelAnimationDurationMs}ms`,
    "--panel-animation-easing": panelAnimationEasing,
    ...windowControlsInsetStyle,
  } as CSSProperties;

  return (
    <PanelAnimationSuppressionProvider value={panelAnimationsSuppressed}>
      <div
        className={cn("window-frame-shell stone-base h-dvh min-h-0", isWindowsDesktop && "wco")}
        onDoubleClick={
          isWindowsDesktop
            ? (event) => {
                // Native drag regions retain OS handling; this covers DOM-delivered doubles.
                const target = event.target;
                if (!(target instanceof Element) || !target.closest("[data-window-titlebar]"))
                  return;
                if (target.closest(".no-drag, button, a, input, select, textarea, [role=button]"))
                  return;
                void runWindowAction("toggle-maximize");
              }
            : undefined
        }
      >
        <OnboardingShell
          className="grid! h-full! min-h-0! grid-cols-[minmax(0,1fr)] grid-rows-[var(--workspace-topbar-height)_minmax(0,1fr)]"
          data-app-shell=""
          data-titlebar-panel={titlebarPanelActive ? "true" : "false"}
          data-panel-animations={routePanelAnimationsActive ? "true" : "false"}
          defaultOpen
          style={sidebarProviderStyle}
        >
          <RightPanelSidebarVisibility sheet={shouldUseRightPanelSheet(viewportWidth)} />
          <WindowTitlebar
            sidebarControl={<SidebarControl />}
            onLeadingWidthChange={setTitlebarLeadingWidth}
          />
          {/* Bound route heights to the space left by the titlebar, not their content. */}
          <FrameWorkspace>
            <ProjectProjectionRetention />
            <div className="window-frame-projectbar" data-frame-projectbar="">
              <ProjectRail />
            </div>
            <Sidebar
              side="left"
              variant="frame"
              collapsible="offcanvas"
              data-app-sidebar=""
              {...sidebarArea}
              role="navigation"
              aria-label={
                isOnWebPages
                  ? t.webPages.title
                  : isOnSettings
                    ? t.sidebar.chrome.settings
                    : t.sidebar.chrome.threads
              }
              resizable={{
                maxWidth: sidebarMaximumWidth,
                minWidth: sidebarMinimumWidth,
                shouldAcceptWidth: ({ currentWidth, nextWidth, wrapper }) =>
                  nextWidth <= currentWidth ||
                  nextWidth <=
                    resolveFrameSidebarMaximumWidth(
                      wrapper.clientWidth,
                      sidebarMinimumWidth,
                      frame,
                    ),
                storageKey: THREAD_SIDEBAR_WIDTH_STORAGE_KEY,
                onResize: setSidebarWidth,
              }}
              // The narrow-window sidebar is a sheet, portaled outside the provider's styles.
              style={windowControlsInsetStyle}
            >
              {isOnWebPages ? (
                <WebPagesSidebar />
              ) : isOnSettings ? (
                <SettingsSidebarNav pathname={pathname} />
              ) : (
                <ThreadSidebar routeReveal={sidebarRouteReveal} />
              )}
              <SidebarRail onDoubleClick={resetSidebarWidth} />
            </Sidebar>
            <div
              className="window-frame-main flex min-h-0 min-w-0 flex-col"
              data-titlebar-panel={titlebarPanelActive ? "true" : "false"}
            >
              {/* Keep the outlet under one component type across navigation;
                    changing div/Slab would remount the route subtree. Chat owns
                    its surfaces, so its enclosing slab has no visual variants. */}
              <MainSlab chatOwnsSlabs={chatOwnsSlabs}>{children}</MainSlab>
              {pathname.startsWith("/discussions/") &&
              !shouldUseDiscussionPanelSheet(viewportWidth) ? (
                <TitlebarSlotOutlet name="panel" />
              ) : null}
            </div>
            <BackgroundThreadAnnouncer />
            {isElectron ? <HistorySwipeNavigation /> : null}
          </FrameWorkspace>
        </OnboardingShell>
      </div>
    </PanelAnimationSuppressionProvider>
  );
}
