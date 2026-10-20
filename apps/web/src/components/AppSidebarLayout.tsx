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
import { useLocation, useNavigate, useParams, useRouterState } from "@tanstack/react-router";

import { createPresenceRegistry } from "../lib/presenceRegistry";
import { isElectron } from "../env";
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
import { resolveThreadRouteRef, resolveThreadRouteTarget } from "../threadRoutes";
import { cn, isMacPlatform } from "../lib/utils";
import { primaryServerKeybindingsAtom } from "../state/server";
import { useEnvironmentIdentificationMode, useLegacySidebarEnabled } from "../hooks/useSettings";
import {
  PanelAnimationSuppressionProvider,
  usePanelAnimationSettings,
  usePanelNavigationSuppression,
} from "../panelAnimations";
import LegacyThreadSidebar from "./LegacySidebar";
import { useThreadVisitedMigration } from "../hooks/useThreadVisitedMigration";
import ThreadSidebar from "./Sidebar";
import { SettingsSidebarNav } from "./settings/SettingsSidebarNav";
import { MainAppLocationTracker } from "./sidebar/mainAppLocation";
import { ProjectRail } from "./sidebar/ProjectRail";
import { useSidebarStageBackdropVariant } from "./SidebarStageBackdrop";
import { useProjects } from "../state/entities";
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

/** Keeps the existing toggle shortcuts and accessibility contract in the shared titlebar. */
function SidebarControl() {
  const usagePageOpen = useLocation({ select: (location) => location.pathname === "/usage" });
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const { toggleSidebar } = useSidebar();
  const environmentIdentificationMode = useEnvironmentIdentificationMode();
  const stageBackdropVariant = useSidebarStageBackdropVariant(
    environmentIdentificationMode === "artwork",
  );
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
        isRichTextBoldShortcut(event) &&
        event.target instanceof HTMLElement &&
        event.target.closest('[data-composer-rich-text="true"]')
      ) {
        // The rich-text composer claims Mod+B for bold; the toggle stays
        // available everywhere else, including the plain-text composer.
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

  return (
    <div
      className="window-titlebar-sidebar-control relative flex size-8 shrink-0 items-center justify-center"
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

// Moves through the app's route history like a browser's back/forward buttons.
function NavigationHistoryShortcuts() {
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const routeThreadRef = useParams({
    strict: false,
    select: (params) => resolveThreadRouteRef(params),
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
      const command = resolveShortcutCommand(event, keybindings, {
        context: {
          terminalFocus: isTerminalFocused(),
          terminalOpen: routeThreadRef
            ? selectThreadTerminalUiState(
                useTerminalUiStateStore.getState().terminalUiStateByThreadKey,
                routeThreadRef,
              ).terminalOpen
            : false,
          previewFocus: isPreviewFocused(),
          previewOpen: routeThreadRef
            ? selectActiveRightPanel(useRightPanelStore.getState().byThreadKey, routeThreadRef) ===
              "preview"
            : false,
          editableFocus: isEditableFocused(event.target),
          modelPickerOpen: isModelPickerOpen(),
        },
      });
      if (command !== "navigation.back" && command !== "navigation.forward") return;

      event.preventDefault();
      event.stopPropagation();
      if (command === "navigation.back") window.history.back();
      else window.history.forward();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [keybindings, routeThreadRef]);

  return null;
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
  const navigate = useNavigate();
  const legacySidebarEnabled = useLegacySidebarEnabled();
  const {
    active: panelAnimationsActive,
    durationMs: panelAnimationDurationMs,
    easing: panelAnimationEasing,
  } = usePanelAnimationSettings();
  // Settings routes show the settings nav in place of whichever thread
  // sidebar is active.
  // Seeds server-side visited tracking from this browser's localStorage the
  useThreadVisitedMigration();
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
  const isMacosDesktop = isElectron && isMacPlatform(navigator.platform);
  const [sidebarWidth, setSidebarWidth] = useState(readInitialThreadSidebarWidth);
  // Subscribed rather than read once: the clamp must track live window size,
  // and a clamped drag ends with an unchanged width, which skips the re-render
  // that would otherwise refresh a render-time snapshot.
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
  const [isWindowFullscreen, setIsWindowFullscreen] = useState(() => {
    const getWindowFullscreenState = window.desktopBridge?.getWindowFullscreenState;
    return isMacosDesktop && typeof getWindowFullscreenState === "function"
      ? getWindowFullscreenState()
      : false;
  });
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

  useEffect(() => {
    if (!isMacosDesktop) return;
    const bridge = window.desktopBridge;
    if (!bridge) return;
    const { getWindowFullscreenState, onWindowFullscreenStateChange } = bridge;
    if (
      typeof getWindowFullscreenState !== "function" ||
      typeof onWindowFullscreenStateChange !== "function"
    ) {
      return;
    }

    const unsubscribe = onWindowFullscreenStateChange(setIsWindowFullscreen);
    setIsWindowFullscreen(getWindowFullscreenState());
    return unsubscribe;
  }, [isMacosDesktop]);

  useEffect(() => {
    const onMenuAction = window.desktopBridge?.onMenuAction;
    if (typeof onMenuAction !== "function") {
      return;
    }

    const unsubscribe = onMenuAction((action) => {
      if (action === "open-settings") {
        const isSettingsRoute = /^\/settings(\/|$)/.test(pathname);
        if (!isSettingsRoute) {
          void navigate({ to: "/settings" });
        }
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [navigate, pathname]);

  return (
    <PanelAnimationSuppressionProvider value={panelAnimationsSuppressed}>
      <div className="window-frame-shell stone-base h-dvh min-h-0">
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
              role="navigation"
              aria-label={isOnSettings ? t.sidebar.chrome.settings : t.sidebar.chrome.threads}
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
              {isOnSettings ? (
                <SettingsSidebarNav pathname={pathname} />
              ) : legacySidebarEnabled ? (
                <LegacyThreadSidebar />
              ) : (
                <ThreadSidebar />
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
            <NavigationHistoryShortcuts />
            <MainAppLocationTracker />
          </FrameWorkspace>
        </OnboardingShell>
      </div>
    </PanelAnimationSuppressionProvider>
  );
}
