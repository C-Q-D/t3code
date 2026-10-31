/** Localized routes presentation and existing interaction behavior. */
import { t } from "~/i18n";
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

import { APP_DISPLAY_NAME, APP_VERSION } from "../branding";
import { AppSidebarLayout } from "../components/AppSidebarLayout";
import { PixelIconSprites } from "../components/icons/PixelIconSprites";
import { CommandPalette } from "../components/CommandPalette";
import { CustomSnoozeDialogHost } from "../components/CustomSnoozeDialog";
import { ConfirmDialogHost } from "../components/ConfirmDialogHost";
import { DevReplayHost } from "../components/DevReplayHost";
import { FirstRunGate } from "../components/onboarding/FirstRunGate";
import { ConnectOnboardingDialog } from "../components/cloud/ConnectOnboardingDialog";
import { RelayClientInstallDialog } from "../components/cloud/RelayClientInstallDialog";
import { SshPasswordPromptDialog } from "../components/desktop/SshPasswordPromptDialog";
import { SnapShotCoordinator } from "../components/desktop/SnapShotCoordinator";
import { DesktopAppActivationCoordinator } from "../components/desktop/DesktopAppActivationCoordinator";
import { DesktopWebLinkCoordinator } from "../components/desktop/DesktopWebLinkCoordinator";
import { RunningThreadKeepAlive } from "../components/desktop/RunningThreadKeepAlive";
import { ReopenClosedViewShortcut } from "../components/ReopenClosedViewShortcut";
import { ProjectCloneToastCoordinator } from "../components/ProjectCloneToastCoordinator";
import { ChatGptWelcomeCoordinator } from "../components/settings/ChatGptWelcomeCoordinator";
import { ThemeEditorHost } from "../components/settings/ThemeEditorHost";
import { useCopyToClipboard } from "../hooks/useCopyToClipboard";
import { AnchoredToastProvider, ToastProvider } from "../components/ui/toast";
import { isElectron } from "../env";
import { useClientSettings } from "../hooks/useSettings";
import {
  deriveLogicalProjectKeyFromSettings,
  derivePhysicalProjectKeyFromPath,
  selectProjectGroupingSettings,
} from "@t3tools/client-runtime/state/project-grouping";
import { useUiStateStore } from "../uiStateStore";
import { configureClientTracing } from "../observability/clientTracing";
import { resolveInitialServerAuthGateState } from "../environments/primary";
import { hasHostedPairingRequest, isHostedStaticApp } from "../hostedPairing";
import { useHostedPromptLinkLanding } from "../components/promptLinks/HostedPromptLinkLanding";
import { isLocalEnvironmentDisabled } from "../localEnvironment";
import { useAtomValue } from "@effect/atom-react";
import { primaryServerConfigAtom, primaryServerWelcomeAtom } from "../state/server";
import { readProject } from "../state/entities";

import { getDesktopSnapShotBridge } from "../lib/desktopSnapShot";
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
    if (authGateState.status === "authenticated") {
      // Idempotent, so every navigation can ask for it.
      void configureClientTracing();
    }
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
  // Above every branch: app services raise toasts for the whole page, so the surface they write to
  // must not unmount when the root switches branches (for example /welcome to the app shell).
  return (
    <ToastProvider position="bottom-right" stack="stone">
      <AnchoredToastProvider>
        <RootRouteBranch />
      </AnchoredToastProvider>
    </ToastProvider>
  );
}

/** Keeps shell-less authentication routes outside the workspace while sharing one toast provider. */
function RootRouteBranch() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const { authGateState } = Route.useRouteContext();
  const primaryEnvironmentAuthenticated = authGateState.status === "authenticated";
  // A sync IPC read; the setting only changes across a relaunch.
  const [localEnvironmentDisabled] = useState(isLocalEnvironmentDisabled);
  // Once true, stays true: a visit to /welcome means the bootstrap already chose a route.
  const [returningFromWelcome, setReturningFromWelcome] = useState(pathname === "/welcome");
  if (pathname === "/welcome" && !returningFromWelcome) setReturningFromWelcome(true);
  const hostedPromptLinkLanding = useHostedPromptLinkLanding(
    authGateState.status === "hosted-static",
  );

  if (pathname === "/pair" || pathname === "/connect" || pathname === "/connect-agent") {
    return <Outlet />;
  }

  // Handle links before onboarding redirects lose them.
  if (hostedPromptLinkLanding !== null) {
    return hostedPromptLinkLanding;
  }

  if (pathname === "/welcome") {
    return (
      <>
        <CustomSnoozeDialogHost />
        <CommandPalette>
          <AppSidebarLayout>
            <Outlet />
          </AppSidebarLayout>
        </CommandPalette>
      </>
    );
  }

  if (authGateState.status !== "authenticated" && authGateState.status !== "hosted-static") {
    return <Outlet />;
  }

  const appShell = (
    <CommandPalette>
      <AppSidebarLayout>
        <Outlet />
      </AppSidebarLayout>
    </CommandPalette>
  );

  return (
    <>
      <ChatGptWelcomeCoordinator />
      <FirstRunGate
        enabled={primaryEnvironmentAuthenticated}
        hostedStatic={authGateState.status === "hosted-static"}
      >
        {primaryEnvironmentAuthenticated ? <DesktopAppActivationCoordinator /> : null}
        {primaryEnvironmentAuthenticated || localEnvironmentDisabled ? (
          <DesktopWebLinkCoordinator />
        ) : null}
        {isElectron ? <RunningThreadKeepAlive /> : null}
        <RelayClientInstallDialog />
        <ConnectOnboardingDialog />
        <SshPasswordPromptDialog />
        <SnapShotCoordinator />
        <ReopenClosedViewShortcut />
        <ConfirmDialogHost />
        <CustomSnoozeDialogHost />
        <ProjectCloneToastCoordinator />
        {import.meta.env.DEV && primaryEnvironmentAuthenticated ? <DevReplayHost /> : null}
        {primaryEnvironmentAuthenticated ? (
          <EventRouter skipInitialBootstrapNavigation={returningFromWelcome} />
        ) : null}
        {appShell}
        {/* Keep the theme editor above the router so drafts survive navigation. */}
        <ThemeEditorHost />
      </FirstRunGate>
    </>
  );
}

/** Offers recovery and a credential-free diagnostic report without depending on the failed app subtree. */
function RootRouteErrorView({ error }: ErrorComponentProps) {
  const router = useRouter();
  const [reportOpen, setReportOpen] = useState(true);
  const [occurredAt] = useState(() => new Date().toISOString());
  // Desktop uses hash history: use the router pathname to omit query credentials.
  const pathname = useLocation({ select: (location) => location.pathname });
  const report = errorReport(error, pathname, `${APP_DISPLAY_NAME} ${APP_VERSION}`, occurredAt);

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

function EventRouter({
  skipInitialBootstrapNavigation,
}: {
  readonly skipInitialBootstrapNavigation: boolean;
}) {
  const navigate = useNavigate();
  const pathname = useLocation({ select: (loc) => loc.pathname });
  const projectGroupingSettings = useClientSettings(selectProjectGroupingSettings);
  const serverConfig = useAtomValue(primaryServerConfigAtom);
  const serverWelcome = useAtomValue(primaryServerWelcomeAtom);
  const readPathname = useEffectEvent(() => pathname);
  const handledBootstrapThreadIdRef = useRef<string | null>(null);
  const skipInitialBootstrapNavigationRef = useRef(skipInitialBootstrapNavigation);

  const handleWelcome = useEffectEvent((payload: ServerLifecycleWelcomePayload | null) => {
    if (!payload) return;

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

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- expands the bootstrap project in the UI store and navigates the router on a server welcome
  useEffect(() => {
    handleWelcome(serverWelcome);
  }, [serverWelcome]);

  return null;
}
