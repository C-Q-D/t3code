/** Owns settings window chrome and the single scrollable page shell; child routes own settings content. */
import { workspaceAreaProps } from "../lib/workspaceFocus";
import { t } from "~/i18n";
import { Outlet, createFileRoute, redirect, useLocation } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area";
import { Columns3Icon, PanelBottomIcon, PanelRightIcon } from "lucide-react";
import { Button } from "../components/ui/button";
import { ScrollBar } from "../components/ui/scroll-area";
import { useSettingsRestore } from "../components/settings/SettingsPanels";

import { SettingsBreadcrumb, SettingsPageHeading } from "../components/settings/SettingsBreadcrumb";
import { useTitlebarSlot } from "../components/frame/titlebarSlot";
import { Kbd } from "../components/ui/kbd";
import { useNavigateToMainApp } from "../components/sidebar/mainAppLocation";
import { useEscapeToGoBack } from "../hooks/useNavigateBack";
import {
  SettingsScopeProvider,
  useSettingsScope,
} from "../components/settings/SettingsScopeContext";
import { useEnvironments } from "../state/environments";
import {
  SettingsScopeNotice,
  SettingsProjectScopeNotice,
} from "../components/settings/SettingsScopeNotice";
import {
  SETTINGS_DEVICE_ONLY_PATHS,
  SettingsScopeSentence,
} from "../components/settings/SettingsScopeSentence";
import { SettingsPageContainer } from "../components/settings/settingsLayout";
import {
  retainSettingsScope,
  validateSettingsRouteSearch,
} from "../components/settings/settingsScopeNavigation";
import {
  getSettingsSearchTargetScope,
  movedSettingsPath,
  getThreadAutoSettlementSearchAvailability,
  isSettingsSearchScopeAvailable,
} from "../components/settings/settingsSearch";

/** Renders a restore action for the supplied changed settings and restoreDefaults callback; no changes disables the action. */
function RestoreDeviceDefaultsButton({ onRestored }: { onRestored: () => void }) {
  const { changedSettingLabels, restoreDefaults } = useSettingsRestore(onRestored);
  return (
    <Button
      size="toolbar"
      variant="outline"
      disabled={changedSettingLabels.length === 0}
      onClick={() => void restoreDefaults()}
    >
      {t.settings.pageShell.restoreDeviceDefaults}
    </Button>
  );
}

/** Displays the design's panel controls without thread actions on settings pages (exception c-1). */
function SettingsTitlebarActions() {
  return (
    <div
      role="group"
      aria-label={t.settings.pageShell.panelControls}
      className="mr-3 flex gap-1 rounded-settings-toolbar-tray bg-settings-toolbar-well p-0.75 shadow-settings-search"
    >
      <button
        type="button"
        disabled
        aria-label={t.chat.panelLayout.toggleThreadDetailsPanel}
        className="flex h-7 w-7.5 items-center justify-center rounded-settings-toolbar-key bg-surface-raised shadow-settings-toolbar-key-elevation"
      >
        <PanelRightIcon aria-hidden="true" className="size-4" strokeWidth={1.75} />
      </button>
      <button
        type="button"
        disabled
        aria-label={t.chat.panelLayout.toggleTerminalDrawer}
        className="flex h-7 w-7.5 items-center justify-center rounded-settings-toolbar-key"
      >
        <PanelBottomIcon aria-hidden="true" className="size-4" strokeWidth={1.75} />
      </button>
      <button
        type="button"
        disabled
        aria-label={t.chat.panelLayout.toggleRightPanel}
        className="flex h-7 w-7.5 items-center justify-center rounded-settings-toolbar-key"
      >
        <Columns3Icon aria-hidden="true" className="size-4" strokeWidth={1.75} />
      </button>
    </div>
  );
}

/** Renders children only when the supplied settings scope supports the selected target; otherwise explains reconnection or scope selection. */
function SettingsScopeBoundary({ pathname, children }: { pathname: string; children: ReactNode }) {
  const { scope, connectedEnvironments } = useSettingsScope();
  const { environments } = useEnvironments();
  const hash = useLocation({ select: (location) => location.hash });
  const searchTarget = getSettingsSearchTargetScope(hash);
  const autoSettlementAvailability = searchTarget?.requiresThreadAutoSettlement
    ? getThreadAutoSettlementSearchAvailability(environments, scope)
    : null;
  if (
    scope.kind !== "unavailable" &&
    searchTarget &&
    autoSettlementAvailability &&
    !autoSettlementAvailability.isTargetAvailable
  ) {
    return (
      <SettingsScopeNotice
        target="environment"
        targetId={hash}
        eligibleEnvironmentIds={autoSettlementAvailability.eligibleEnvironmentIds}
      >
        {autoSettlementAvailability.eligibleEnvironmentIds.length > 0
          ? t.account.routes.chooseSupporting(searchTarget.title)
          : t.account.routes.connectSupporting(searchTarget.title)}
      </SettingsScopeNotice>
    );
  }
  if (
    scope.kind !== "unavailable" &&
    searchTarget &&
    !isSettingsSearchScopeAvailable(searchTarget.scope, scope.kind)
  ) {
    const target =
      searchTarget.scope === "environment" ||
      searchTarget.scope === "project" ||
      searchTarget.scope === "checkout"
        ? searchTarget.scope
        : "all";
    return (
      <SettingsScopeNotice target={target} targetId={hash}>
        {t.account.routes.chooseScope(searchTarget.title)}
      </SettingsScopeNotice>
    );
  }
  if (SETTINGS_DEVICE_ONLY_PATHS.has(pathname) || pathname === "/settings/projects") {
    return children;
  }
  if (scope.kind === "unavailable")
    return (
      <SettingsPageContainer>
        <p className="text-sm text-muted-foreground">{scope.message}</p>
      </SettingsPageContainer>
    );
  if (scope.kind === "environment" && connectedEnvironments.length === 0) {
    return (
      <SettingsPageContainer>
        <p className="text-sm text-muted-foreground">
          {t.account.routes.reconnectSettings(scope.label)}
        </p>
      </SettingsPageContainer>
    );
  }
  return children;
}

/**
 * Renders the titlebar portals, scrollable settings header and scoped child route.
 * Mount under SettingsScopeProvider and TitlebarSlotProvider within AppSidebarLayout.
 * Height comes from the parent workspace; Escape uses the existing main-app return location.
 */
function SettingsContentLayout() {
  const location = useLocation();
  const navigateToMainApp = useNavigateToMainApp();
  useEscapeToGoBack(navigateToMainApp);
  const { search, environment } = useSettingsScope();
  const contentScopeKey =
    location.pathname === "/settings/diagnostics" || location.pathname === "/settings/providers"
      ? environment?.environmentId
      : JSON.stringify(search);
  const [restoreSignal, setRestoreSignal] = useState(0);
  const titlebar = useTitlebarSlot({
    breadcrumb: <SettingsBreadcrumb pathname={location.pathname} />,
    actions: <SettingsTitlebarActions />,
  });

  return (
    <main
      {...workspaceAreaProps("settings", 1, t.settings.navigationAdditions.content)}
      className="settings-page-shell flex h-full min-h-0 min-w-0 flex-col text-control leading-normal text-foreground text-shadow-stone"
    >
      {titlebar}
      {/* Reset scroll before the new category's target refs run. Keep hash changes
          out of this identity so clearing a handled search target preserves its scroll. */}
      <ScrollAreaPrimitive.Root
        key={location.pathname}
        className="relative min-h-0 flex-1 overflow-hidden"
      >
        {/* Keep the search marker on the viewport; Base UI owns overflow measurements. */}
        <ScrollAreaPrimitive.Viewport
          className="settings-page-viewport scrollbar-gutter-both h-full outline-none"
          tabIndex={-1}
          data-settings-page-scroll
        >
          <ScrollAreaPrimitive.Content>
            <header className="mx-auto flex w-full max-w-205 flex-col gap-2.5 px-7 pt-5.5">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => void navigateToMainApp()}
                  className="flex cursor-pointer items-center gap-1.5 rounded-menu-row text-secondary-copy leading-normal text-muted-foreground outline-none hover:text-foreground focus-visible:inset-shadow-focus"
                >
                  <Kbd size="compact">Esc</Kbd>
                  {t.settings.pageShell.returnToConversation}
                </button>
              </div>
              <div className="flex items-center gap-3">
                <SettingsPageHeading pathname={location.pathname} />
                {location.pathname === "/settings/general" ? (
                  <div className="ms-auto flex shrink-0 items-center">
                    <RestoreDeviceDefaultsButton
                      onRestored={() => setRestoreSignal((value) => value + 1)}
                    />
                  </div>
                ) : null}
              </div>
              <SettingsScopeSentence />
              <SettingsProjectScopeNotice />
            </header>
            <div key={`${contentScopeKey}:${restoreSignal}`}>
              <SettingsScopeBoundary pathname={location.pathname}>
                <Outlet />
              </SettingsScopeBoundary>
            </div>
          </ScrollAreaPrimitive.Content>
        </ScrollAreaPrimitive.Viewport>
        <ScrollBar orientation="vertical" />
        <ScrollBar orientation="horizontal" />
        <ScrollAreaPrimitive.Corner />
      </ScrollAreaPrimitive.Root>
    </main>
  );
}

function SettingsRouteLayout() {
  const rawSearch = Route.useSearch();
  const navigate = Route.useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });
  return (
    <SettingsScopeProvider
      search={rawSearch}
      singleEnvironment={pathname === "/settings/providers"}
      onChange={(next) => {
        // Send every axis so the retain middleware sees an explicit target
        // even when the choice is "all", which is the absence of a key.
        void navigate({
          to: pathname,
          search: () => ({
            project: next.project,
            machine: next.machine,
            checkout: next.checkout,
          }),
          hash: "",
          resetScroll: false,
        });
      }}
    >
      <SettingsContentLayout />
    </SettingsScopeProvider>
  );
}

export const Route = createFileRoute("/settings")({
  validateSearch: validateSettingsRouteSearch,
  search: { middlewares: [retainSettingsScope] },
  beforeLoad: async ({ context, location }) => {
    if (
      context.authGateState.status !== "authenticated" &&
      context.authGateState.status !== "hosted-static"
    ) {
      throw redirect({ to: "/pair", replace: true });
    }

    const moved = movedSettingsPath(location.pathname, location.hash);
    if (moved) {
      throw redirect({ to: moved, search: location.search, hash: location.hash, replace: true });
    }

    if (location.pathname === "/settings") {
      throw redirect({ to: "/settings/general", replace: true });
    }
  },
  component: SettingsRouteLayout,
});
