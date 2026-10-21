/** Localized routes presentation and existing interaction behavior. */
import { t } from "~/i18n";
import { PermissionUpdateNotice } from "../components/PermissionUpdateNotice";
import { type ServerLifecycleWelcomePayload } from "@t3tools/contracts";
import { scopedProjectKey, scopeProjectRef } from "@t3tools/client-runtime/environment";
import {
  Outlet,
  Link,
  redirect,
  createRootRoute,
  type ErrorComponentProps,
  useLocation,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { errorReport } from "./-rootErrorReport.logic";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { APP_BASE_NAME, APP_DISPLAY_NAME, APP_STAGE_LABEL, APP_VERSION } from "../branding";
import { resolveServerBackedAppDisplayName } from "../branding.logic";
import { AppSidebarLayout } from "../components/AppSidebarLayout";
import { PixelIconSprites } from "../components/icons/PixelIconSprites";
import { CommandPalette } from "../components/CommandPalette";
import { CustomSnoozeDialogHost } from "../components/CustomSnoozeDialog";
import { AddProjectToMachineDialogHost } from "../components/AddProjectToMachineDialog";
import { ConfirmDialogHost } from "../components/ConfirmDialogHost";
import { KeybindingsConfigWarning } from "../components/KeybindingsConfigWarning";
import { FirstRunGate } from "../components/onboarding/FirstRunGate";
import { ConnectOnboardingDialog } from "../components/cloud/ConnectOnboardingDialog";
import { RelayClientInstallDialog } from "../components/cloud/RelayClientInstallDialog";
import { SshPasswordPromptDialog } from "../components/desktop/SshPasswordPromptDialog";
import { SnapShotCoordinator } from "../components/desktop/SnapShotCoordinator";
import { DesktopAppActivationCoordinator } from "../components/desktop/DesktopAppActivationCoordinator";
import { DesktopWebLinkCoordinator } from "../components/desktop/DesktopWebLinkCoordinator";
import { RunningThreadKeepAlive } from "../components/desktop/RunningThreadKeepAlive";
import { ProviderUpdateLaunchNotification } from "../components/ProviderUpdateLaunchNotification";
import { DesktopUpdateLaunchNotice } from "../components/sidebar/updateEverythingRun";
import { LegacyThreadMigrationToast } from "../components/LegacyThreadMigrationToast";
import { ThreadNotificationCoordinator } from "../components/ThreadNotificationCoordinator";
import { ReopenClosedViewShortcut } from "../components/ReopenClosedViewShortcut";
import { ProjectCloneToastCoordinator } from "../components/ProjectCloneToastCoordinator";
import { PullRequestGuideRunCoordinator } from "../components/pullRequest/guide/PullRequestGuideRunCoordinator";
import { HostFreezeToastCoordinator } from "../components/HostFreezeToastCoordinator";
import { SlowRpcRequestToastCoordinator } from "../components/SlowRpcRequestToastCoordinator";
import { ChatGptWelcomeCoordinator } from "../components/settings/ChatGptWelcomeCoordinator";
import { ProviderAuthCallbackCoordinator } from "../components/settings/ProviderAuthCallbackCoordinator";
import { ThemeEditorHost } from "../components/settings/ThemeEditorHost";
import { useCopyToClipboard } from "../hooks/useCopyToClipboard";
import { useDefaultThemeAdoption } from "../hooks/useDefaultTheme";
import { useEnvironmentThemeSync } from "../hooks/useEnvironmentTheme";
import {
  AnchoredToastProvider,
  stackedThreadToast,
  ToastProvider,
  toastManager,
} from "../components/ui/toast";
import { isElectron } from "../env";
import { useBackgroundImage } from "../hooks/useBackgroundImage";
import { applyAppearanceFontVariables } from "~/appearanceFonts";
import { applyAppearanceContrast } from "~/appearanceContrast";
import { useClientSettings } from "../hooks/useSettings";
import {
  deriveLogicalProjectKeyFromSettings,
  derivePhysicalProjectKeyFromPath,
  selectProjectGroupingSettings,
} from "../logicalProject";
import { useUiStateStore } from "../uiStateStore";
import { syncBrowserChromeTheme } from "../hooks/useTheme";
import { configureClientTracing } from "../observability/clientTracing";
import { resolveInitialServerAuthGateState } from "../environments/primary";
import { hasHostedPairingRequest, isHostedStaticApp } from "../hostedPairing";
import { useHostedPromptLinkLanding } from "../components/promptLinks/HostedPromptLinkLanding";
import { isLocalEnvironmentDisabled } from "../localEnvironment";
import { useAtomValue } from "@effect/atom-react";
import { useEnvironments, usePrimaryEnvironment } from "../state/environments";
import {
  primaryServerConfigAtom,
  primaryServerConfigEventAtom,
  primaryServerWelcomeAtom,
} from "../state/server";
import { readProject, setActiveEnvironmentId, useActiveEnvironmentId } from "../state/entities";
import {
  createKeybindingsUpdateToastController,
  type KeybindingsUpdateToastController,
} from "../components/KeybindingsUpdateToast.logic";

import { getDesktopSnapShotBridge } from "../lib/desktopSnapShot";
import { installDesktopPasteAsText } from "../lib/desktopPasteAsText";
import { shouldResumeSnapShotSetupOnStartup } from "../lib/snapShotSetupResume";

export const Route = createRootRoute({
  beforeLoad: async ({ location }) => {
    if (location.pathname === "/pair" && hasHostedPairingRequest(new URL(window.location.href))) {
      return {
        authGateState: {
          status: "hosted-pairing",
        } as const,
      };
    }

    if (isLocalEnvironmentDisabled() || isHostedStaticApp(new URL(window.location.href))) {
      return {
        authGateState: {
          status: "hosted-static",
        } as const,
      };
    }

    const authGateState = await resolveInitialServerAuthGateState();
    if (
      authGateState.status === "authenticated" &&
      getDesktopSnapShotBridge() &&
      shouldResumeSnapShotSetupOnStartup() &&
      location.pathname !== "/settings/snap-shot"
    ) {
      throw redirect({ to: "/settings/snap-shot", replace: true });
    }
    return {
      authGateState,
    };
  },
  component: () => (
    <>
      <PixelIconSprites />
      <RootRouteView />
    </>
  ),
  errorComponent: RootRouteErrorView,
  notFoundComponent: RootRouteNotFoundView,
  head: () => ({
    meta: [{ name: "title", content: APP_DISPLAY_NAME }],
  }),
});

/** Renders localized missing-route guidance and a home link without changing the current router state during render. */
function RootRouteNotFoundView() {
  return (
    <main className="ov3-route-page stone-base">
      <section className="ov3-error-card dialog-glass max-w-110">
        <span className="font-mono text-secondary-copy-large text-placeholder">404</span>
        <h1 className="font-serif text-ov3-error-title font-bold">{t.account.routes.notFound}</h1>
        <p className="text-body leading-ov3-hint text-code-foreground">
          {t.account.routes.notFoundHint(APP_DISPLAY_NAME)}
        </p>
        <div className="mt-1.5 self-start">
          <Link to="/" replace className="ov3-action ov3-action-primary gap-1.5 pr-4 pl-3">
            <ArrowLeftIcon className="size-3.75" aria-hidden="true" />
            {t.account.routes.home}
          </Link>
        </div>
      </section>
    </main>
  );
}

/** Composes authentication gates, application surfaces, and shared notification providers. */
function RootRouteView() {
  useEffect(() => installDesktopPasteAsText(window.desktopBridge, window), []);
  const pathname = useLocation({ select: (location) => location.pathname });
  const { authGateState } = Route.useRouteContext();
  const primaryEnvironmentAuthenticated = authGateState.status === "authenticated";
  // Once true, stays true: a visit to /welcome means the bootstrap already chose a route.
  const [returningFromWelcome, setReturningFromWelcome] = useState(pathname === "/welcome");
  if (pathname === "/welcome" && !returningFromWelcome) setReturningFromWelcome(true);
  const hostedPromptLinkLanding = useHostedPromptLinkLanding(
    authGateState.status === "hosted-static",
  );

  if (pathname === "/pair" || pathname === "/connect" || pathname === "/connect-agent") {
    return (
      <>
        <DocumentTitleSync />
        <BrowserChromeThemeSync key={pathname} />
        <Outlet />
      </>
    );
  }

  // Ahead of first-run onboarding, which would otherwise send a new visitor to the welcome
  // wizard and lose the link.
  if (hostedPromptLinkLanding !== null) {
    return (
      <>
        <DocumentTitleSync />
        <BrowserChromeThemeSync key={pathname} />
        {hostedPromptLinkLanding}
      </>
    );
  }

  if (pathname === "/welcome") {
    return (
      <ToastProvider position="bottom-right" stack="stone">
        <AnchoredToastProvider>
          <DocumentTitleSync />
          <BrowserChromeThemeSync key={pathname} />
          <ContrastAppearanceSync />
          <EnvironmentThemeSync />
          <GlassAppearanceSync />
          <FontAppearanceSync />
          <ProviderAuthCallbackCoordinator />
          <CustomSnoozeDialogHost />
          <CommandPalette>
            <AppSidebarLayout>
              <Outlet />
            </AppSidebarLayout>
          </CommandPalette>
        </AnchoredToastProvider>
      </ToastProvider>
    );
  }

  if (authGateState.status !== "authenticated" && authGateState.status !== "hosted-static") {
    return (
      <>
        <DocumentTitleSync />
        <BrowserChromeThemeSync key={pathname} />
        <Outlet />
      </>
    );
  }

  const appShell = (
    <CommandPalette>
      <AppSidebarLayout>
        <Outlet />
      </AppSidebarLayout>
    </CommandPalette>
  );

  return (
    <ToastProvider position="bottom-right" stack="stone">
      <AnchoredToastProvider>
        <DocumentTitleSync />
        <BrowserChromeThemeSync key={pathname} />
        <ContrastAppearanceSync />
        <EnvironmentThemeSync />
        <GlassAppearanceSync />
        <FontAppearanceSync />
        <ProviderAuthCallbackCoordinator />
        <ChatGptWelcomeCoordinator />
        <FirstRunGate
          enabled={primaryEnvironmentAuthenticated}
          hostedStatic={authGateState.status === "hosted-static"}
        >
          {primaryEnvironmentAuthenticated ? <AuthenticatedTracingBootstrap /> : null}
          {primaryEnvironmentAuthenticated ? <DesktopAppActivationCoordinator /> : null}
          {primaryEnvironmentAuthenticated ? <DesktopWebLinkCoordinator /> : null}
          {isElectron ? <RunningThreadKeepAlive /> : null}
          <RelayClientInstallDialog />
          <ConnectOnboardingDialog />
          <SshPasswordPromptDialog />
          <SnapShotCoordinator />
          <ThreadNotificationCoordinator />
          <ReopenClosedViewShortcut />
          <ConfirmDialogHost />
          <CustomSnoozeDialogHost />
          <SlowRpcRequestToastCoordinator />
          <HostFreezeToastCoordinator />
          <PermissionUpdateNotice />
          {primaryEnvironmentAuthenticated ? <LegacyThreadMigrationToast /> : null}
          <ProjectCloneToastCoordinator />
          <AddProjectToMachineDialogHost />
          <PullRequestGuideRunCoordinator />
          <HostedStaticEnvironmentBootstrap />
          {primaryEnvironmentAuthenticated ? (
            <EventRouter skipInitialBootstrapNavigation={returningFromWelcome} />
          ) : null}
          {primaryEnvironmentAuthenticated ? <ProviderUpdateLaunchNotification /> : null}
          {isElectron ? <DesktopUpdateLaunchNotice /> : null}
          {appShell}
          {/* Above the router: a theme draft is judged by walking the app, so the
              editor has to survive navigation away from settings. */}
          <ThemeEditorHost />
        </FirstRunGate>
      </AnchoredToastProvider>
    </ToastProvider>
  );
}

function EnvironmentThemeSync() {
  useEnvironmentThemeSync();
  // Ordered after the palette sync so a first-run client adopting the
  // environment's own theme finds it already in the library.
  useDefaultThemeAdoption();
  return null;
}

function ContrastAppearanceSync() {
  const appearanceContrast = useClientSettings((settings) => settings.appearanceContrast);
  const diffColorScheme = useClientSettings((settings) => settings.diffColorScheme);

  useEffect(() => {
    document.documentElement.dataset.diffColorScheme = diffColorScheme;
  }, [diffColorScheme]);

  const chatWidth = useClientSettings((settings) => settings.chatWidth);
  useEffect(() => {
    document.documentElement.dataset.chatWidth = chatWidth;
  }, [chatWidth]);

  useEffect(() => {
    applyAppearanceContrast(document.documentElement, appearanceContrast);
  }, [appearanceContrast]);

  return null;
}

/** Applies appearance variables without reducing the opacity of text or child controls. */
function GlassAppearanceSync() {
  const glassOpacity = useClientSettings((settings) => settings.glassOpacity);
  const { url, load } = useBackgroundImage();

  useEffect(() => {
    void load().catch((error: unknown) => {
      console.error("Failed to load desktop background image", error);
    });
  }, [load]);

  useEffect(() => {
    // JSON string quoting keeps bundled data URLs and native relative URLs valid CSS strings.
    document.documentElement.style.setProperty(
      "--stone-background-image",
      `url(${JSON.stringify(url)})`,
    );
  }, [url]);

  useEffect(() => {
    const style = document.documentElement.style;
    style.setProperty("--glass-opacity", `${glassOpacity}%`);
    if (glassOpacity === 100) {
      style.setProperty("--glass-blur", "0px");
    } else {
      style.removeProperty("--glass-blur");
    }
  }, [glassOpacity]);

  return null;
}

function FontAppearanceSync() {
  const fontFamilySans = useClientSettings((settings) => settings.fontFamilySans);
  const fontFamilyCode = useClientSettings((settings) => settings.fontFamilyCode);
  const fontFamilyComposer = useClientSettings((settings) => settings.fontFamilyComposer);
  const fontSizeInterface = useClientSettings((settings) => settings.fontSizeInterface);
  const fontSizePrompt = useClientSettings((settings) => settings.fontSizePrompt);
  const fontSizeCode = useClientSettings((settings) => settings.fontSizeCode);
  const fontSmoothing = useClientSettings((settings) => settings.fontSmoothing);

  useEffect(() => {
    applyAppearanceFontVariables(document.documentElement, {
      sans: fontFamilySans,
      code: fontFamilyCode,
      composer: fontFamilyComposer,
      sizeInterface: fontSizeInterface,
      sizePrompt: fontSizePrompt,
      sizeCode: fontSizeCode,
      smoothing: fontSmoothing,
    });
  }, [
    fontFamilyCode,
    fontFamilyComposer,
    fontFamilySans,
    fontSizeCode,
    fontSizeInterface,
    fontSizePrompt,
    fontSmoothing,
  ]);

  return null;
}

/** Keyed by pathname: each route paints its own surface, which the browser chrome samples. */
function BrowserChromeThemeSync() {
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      syncBrowserChromeTheme();
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}

function DocumentTitleSync() {
  const primaryServerVersion =
    useAtomValue(primaryServerConfigAtom)?.environment.serverVersion ?? null;
  const title = resolveServerBackedAppDisplayName({
    baseName: APP_BASE_NAME,
    fallbackDisplayName: APP_DISPLAY_NAME,
    fallbackStageLabel: APP_STAGE_LABEL,
    primaryServerVersion,
  });

  useEffect(() => {
    document.title = title;
  }, [title]);

  return null;
}

function HostedStaticEnvironmentBootstrap() {
  const { environments } = useEnvironments();
  const activeEnvironmentId = useActiveEnvironmentId();

  useEffect(() => {
    if (
      environments.some(
        (environment) => environment.entry.target._tag === "PrimaryConnectionTarget",
      )
    ) {
      return;
    }

    if (activeEnvironmentId) {
      return;
    }

    const firstSavedEnvironment = environments[0];
    if (!firstSavedEnvironment) {
      return;
    }

    setActiveEnvironmentId(firstSavedEnvironment.environmentId);
  }, [activeEnvironmentId, environments]);

  return null;
}

/** Renders recovery controls using only router state and local React state, outside the failing app providers. */
function RootRouteErrorView({ error }: ErrorComponentProps) {
  const router = useRouter();
  const [reportOpen, setReportOpen] = useState(true);
  // Desktop uses hash history: use the router pathname to omit query credentials.
  const pathname = useLocation({ select: (location) => location.pathname });
  const report = errorReport(
    error,
    pathname,
    `${APP_DISPLAY_NAME} ${APP_VERSION}`,
    new Date().toISOString(),
  );

  return (
    <main className="ov3-route-page stone-base">
      <section className="ov3-error-card dialog-glass max-w-115">
        <span className="flex size-10 items-center justify-center rounded-compact-row bg-error-surface">
          <TriangleAlertIcon className="size-4.75" aria-hidden="true" />
        </span>
        <h1 className="font-serif text-ov3-error-title font-bold">
          {t.account.routes.somethingWrong}
        </h1>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="ov3-action ov3-action-primary px-4.5"
            onClick={() => void router.invalidate()}
          >
            {t.account.routes.tryAgain}
          </button>
          <button
            type="button"
            className="ov3-action ov3-action-outline px-4"
            onClick={() => window.location.reload()}
          >
            {t.account.routes.reload}
          </button>
        </div>
        <div className="overflow-hidden rounded-ov3-report bg-ov3-report shadow-well-pressed">
          <div className="flex h-9.5 items-center gap-2 pr-1.5 pl-3">
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 self-stretch text-left text-secondary-copy-large font-semibold outline-none focus-visible:inset-shadow-focus"
              aria-expanded={reportOpen}
              aria-controls="ov3-error-report"
              onClick={() => setReportOpen(!reportOpen)}
            >
              <ChevronDownIcon
                className={reportOpen ? "size-3.5" : "size-3.5 -rotate-90"}
                aria-hidden="true"
              />
              {t.account.routes.errorReport}
            </button>
            <CopyErrorButton report={report} />
          </div>
          <pre
            id="ov3-error-report"
            hidden={!reportOpen}
            className="max-h-64 overflow-auto px-3.5 pb-3 font-mono text-meta-large leading-ov3-report whitespace-pre text-secondary-label text-shadow-none"
          >
            {report}
          </pre>
        </div>
      </section>
    </main>
  );
}

/** Copies the supplied full report; the context-free clipboard hook clears its confirmation timer on unmount. */
function CopyErrorButton({ report }: { report: string }) {
  const { copyToClipboard, isCopied } = useCopyToClipboard({ target: "error-report" });
  const Icon = isCopied ? CheckIcon : CopyIcon;

  return (
    <button type="button" className="ov3-copy-action" onClick={() => copyToClipboard(report)}>
      <Icon className="size-3" aria-hidden="true" />
      <span aria-live="polite">
        {isCopied ? t.account.routes.copied : t.account.routes.copyError}
      </span>
    </button>
  );
}

function AuthenticatedTracingBootstrap() {
  useEffect(() => {
    void configureClientTracing();
  }, []);

  return null;
}

/** Subscribes to the supplied environment's server events and reports settings/keybinding changes; cleans up subscriptions on unmount. */
function EventRouter({
  skipInitialBootstrapNavigation,
}: {
  readonly skipInitialBootstrapNavigation: boolean;
}) {
  const navigate = useNavigate();
  const pathname = useLocation({ select: (loc) => loc.pathname });
  const projectGroupingSettings = useClientSettings(selectProjectGroupingSettings);
  const primaryEnvironment = usePrimaryEnvironment();
  const serverConfig = useAtomValue(primaryServerConfigAtom);
  const serverConfigEvent = useAtomValue(primaryServerConfigEventAtom);
  const serverWelcome = useAtomValue(primaryServerWelcomeAtom);
  const readPathname = useEffectEvent(() => pathname);
  const handledBootstrapThreadIdRef = useRef<string | null>(null);
  const skipInitialBootstrapNavigationRef = useRef(skipInitialBootstrapNavigation);
  const handledConfigEventRef = useRef(serverConfigEvent);
  const [keybindingsToastController] = useState<KeybindingsUpdateToastController>(() =>
    createKeybindingsUpdateToastController({}),
  );

  const handleWelcome = useEffectEvent((payload: ServerLifecycleWelcomePayload | null) => {
    if (!payload) return;

    setActiveEnvironmentId(payload.environment.environmentId);
    void (async () => {
      if (!payload.bootstrapProjectId || !payload.bootstrapThreadId) {
        return;
      }
      const bootstrapProject = readProject(
        scopeProjectRef(payload.environment.environmentId, payload.bootstrapProjectId),
      );
      const bootstrapProjectKey =
        (bootstrapProject
          ? deriveLogicalProjectKeyFromSettings(bootstrapProject, projectGroupingSettings)
          : null) ??
        (serverConfig?.cwd
          ? derivePhysicalProjectKeyFromPath(payload.environment.environmentId, serverConfig.cwd)
          : null) ??
        scopedProjectKey(
          scopeProjectRef(payload.environment.environmentId, payload.bootstrapProjectId),
        );
      useUiStateStore.getState().setProjectExpanded(bootstrapProjectKey, true);

      if (readPathname() !== "/") {
        return;
      }
      if (skipInitialBootstrapNavigationRef.current) {
        skipInitialBootstrapNavigationRef.current = false;
        handledBootstrapThreadIdRef.current = payload.bootstrapThreadId;
        return;
      }
      if (handledBootstrapThreadIdRef.current === payload.bootstrapThreadId) {
        return;
      }
      await navigate({
        to: "/$environmentId/$threadId",
        params: {
          environmentId: payload.environment.environmentId,
          threadId: payload.bootstrapThreadId,
        },
        replace: true,
      });
      handledBootstrapThreadIdRef.current = payload.bootstrapThreadId;
    })().catch(() => undefined);
  });

  const handleServerConfigUpdated = useEffectEvent(() => {
    const decision = keybindingsToastController.handle(serverConfigEvent);
    if (!decision) {
      return;
    }

    if (decision._tag === "Success") {
      toastManager.add({
        type: "success",
        title: t.account.routes.keybindingsUpdated,
        description: t.account.routes.keybindingsReloaded,
      });
      return;
    }

    toastManager.add(
      stackedThreadToast({
        type: "warning",
        title: t.account.routes.invalidKeybindings,
        data: { appearance: "keybindings-warning" },
        description: (
          <KeybindingsConfigWarning
            message={decision.message}
            environmentId={primaryEnvironment?.environmentId ?? null}
            configPath={serverConfig?.keybindingsConfigPath ?? null}
            availableEditors={serverConfig?.availableEditors ?? []}
          />
        ),
      }),
    );
  });

  useEffect(() => {
    if (!serverConfig) {
      return;
    }

    setActiveEnvironmentId(serverConfig.environment.environmentId);
  }, [serverConfig]);

  useEffect(() => {
    handleWelcome(serverWelcome);
  }, [serverWelcome]);

  useEffect(() => {
    if (serverConfigEvent === null || handledConfigEventRef.current === serverConfigEvent) {
      return;
    }
    handledConfigEventRef.current = serverConfigEvent;
    handleServerConfigUpdated();
  }, [serverConfigEvent]);

  return null;
}
