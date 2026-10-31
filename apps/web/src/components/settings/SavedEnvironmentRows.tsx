/** Renders saved environments and T3 Connect controls with per-row search targets. */
import { t } from "~/i18n";
import { SessionPermissions } from "./SessionPermissions";
import { ChevronRightIcon, RouteIcon } from "lucide-react";
import { useAtomValue } from "@effect/atom-react";
import { useEffect, useEffectEvent, useState } from "react";
import {
  AuthRelayWriteScope,
  type EnvironmentId,
  connectReachabilityHelpUrl,
  formatConnectReachable,
  resolveEnvironmentMachineKind,
} from "@t3tools/contracts";
import {
  connectionRoutes,
  hasSavedBearerRoute,
  connectionStatusText,
  environmentMcpUrl,
} from "@t3tools/client-runtime/connection";
import * as Option from "effect/Option";
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { cn } from "../../lib/utils";
import { SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";
import { EnvironmentIconMenu } from "./EnvironmentIconPicker";
import { EnvironmentRoutesList } from "./EnvironmentRoutesList";
import {
  ConnectionDiagnosisPanel,
  ConnectionDiagnosisSummary,
  useConnectionDiagnosis,
} from "./ConnectionDiagnosisDetails";
import { usePreparedConnection } from "~/state/session";
import { EnvironmentRow, environmentTransportLabel } from "./EnvironmentRow";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "../ui/menu";
import { Switch } from "../ui/switch";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { Button } from "../ui/button";
import {
  resolveServerConfigVersionMismatch,
  resolveServerSelfUpdateCapability,
  supportsDesktopAppUpdate,
} from "~/versionSkew";
import { hasCloudPublicConfig } from "~/cloud/publicConfig";
import { useT3ConnectAuthPrompt } from "../clerk/useT3ConnectAuthPrompt";
import { useCloudLinkController } from "~/cloud/useCloudLinkController";
import { environmentCatalog } from "~/connection/catalog";
import { readEnvironmentScope } from "~/state/session";
import {
  type EnvironmentPresentation,
  useRelayEnvironmentDiscovery,
  usePrimaryEnvironmentId,
} from "~/state/environments";
import { APP_VERSION } from "~/branding";
import { useAtomCommand } from "../../state/use-atom-command";
import { serverEnvironment } from "~/state/server";
import {
  OutdatedServerUpdateAction,
  ServerUpdateAction,
  ServerUpdateProgress,
} from "../ServerUpdateAction";
import { CloudEnvironmentConnectRows } from "../cloud/CloudEnvironmentConnectList";

type SavedBackendListRowProps = {
  environment: EnvironmentPresentation;
  removingEnvironmentId: EnvironmentId | null;
  onSetEnabled: (environmentId: EnvironmentId, enabled: boolean) => void;
  onRemove: (environment: EnvironmentPresentation) => void;
  onAddRoute: (environment: EnvironmentPresentation) => void;
};

function savedBackendStatus(environment: EnvironmentPresentation): {
  readonly text: string;
  readonly tone: "muted" | "error";
} {
  if (!environment.entry.enabled && environment.connection.phase !== "unsupported")
    return { text: t.settings.connections.status.off, tone: "muted" };
  const { connection } = environment;
  switch (connection.phase) {
    case "connected":
      return { text: t.settings.connections.access.connected, tone: "muted" };
    case "connecting":
      return { text: t.settings.connections.status.connecting, tone: "muted" };
    case "reconnecting":
      return {
        text: connection.error
          ? t.settings.connections.status.reconnectingError(connection.error)
          : t.settings.connections.status.reconnecting,
        tone: "error",
      };
    case "unsupported":
      return { text: t.settings.connections.status.unsupported, tone: "muted" };
    case "error":
      return {
        text: connection.error
          ? t.settings.connections.status.failedError(connection.error)
          : t.settings.connections.status.failed,
        tone: "error",
      };
    case "offline":
      return { text: t.settings.scopeSentence.offline, tone: "muted" };
    case "available":
      return { text: t.settings.connections.status.notConnected, tone: "muted" };
  }
}

/**
 * Keeps unsupported-client diagnoses distinct from a user-disabled backend and exposes route and permission controls.
 * @param props.environment Saved backend identity, routes and current connection state.
 * @param props.removingEnvironmentId Destination currently being removed, or null when idle.
 * @param props.onSetEnabled Parent-owned toggle action; availability is checked before invoking it.
 * @param props.onRemove Parent-owned removal action.
 * @param props.onAddRoute Opens route setup for this backend.
 * @returns A Graphite environment row; action errors and persistence remain owned by the parent.
 */
export function SavedBackendListRow({
  environment,
  removingEnvironmentId,
  onSetEnabled,
  onRemove,
  onAddRoute,
}: SavedBackendListRowProps) {
  const [routesOpen, setRoutesOpen] = useState(false);
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [diagnosisOpen, setDiagnosisOpen] = useState(false);
  const environmentId = environment.environmentId;
  const unsupported = environment.connection.phase === "unsupported";
  const blocked = unsupported && !hasSavedBearerRoute(environment.entry);
  const enabled = environment.entry.enabled && !unsupported;
  const isConnected = environment.connection.phase === "connected";
  const isRemoving = removingEnvironmentId === environmentId;
  const errorTraceId = environment.connection.traceId;
  const { copyToClipboard: copyTraceIdToClipboard } = useCopyToClipboard<{ traceId: string }>({
    target: t.settings.connectionInfoUi.trace,
    onCopy: ({ traceId }) => {
      toastManager.add({
        type: "success",
        title: t.settings.connections.environment.copyTraceToast,
        description: traceId,
      });
    },
    onError: (error) => {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: t.settings.connections.environment.copyTraceError,
          description: error.message,
        }),
      );
    },
  });
  const copyTraceId = (traceId: string) => {
    copyTraceIdToClipboard(traceId, { traceId });
  };
  const { copyToClipboard: copyMcpUrl } = useCopyToClipboard<{ url: string }>({
    target: t.settings.connections.environment.mcpUrlTarget,
    onCopy: ({ url }) => {
      toastManager.add({
        type: "success",
        title: t.settings.connections.environment.copyMcpToast,
        description: t.settings.connections.environment.copyMcpHint(url),
      });
    },
    onError: (error) => {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: t.settings.connections.environment.copyMcpError,
          description: error.message,
        }),
      );
    },
  });
  const versionMismatch = resolveServerConfigVersionMismatch(environment.serverConfig);
  const serverUpdateState = useAtomValue(serverEnvironment.updateStateAtom(environmentId));
  const resumingServerUpdate =
    serverUpdateState.status === "running" && serverUpdateState.stage === "resuming";
  const status = savedBackendStatus(environment);
  const serverVersion = environment.serverConfig?.environment.serverVersion ?? null;
  // Discovery empties its map on every refresh, so hold the last descriptor
  // seen or the glyph would blink back to the generic one each time.
  const relayDiscovery = useRelayEnvironmentDiscovery();
  const discoveredDescriptor = Option.getOrNull(
    relayDiscovery.environments.get(environmentId)?.status ?? Option.none(),
  )?.descriptor;
  const [lastDescriptor, setLastDescriptor] = useState(discoveredDescriptor);
  if (discoveredDescriptor !== undefined && discoveredDescriptor !== lastDescriptor) {
    setLastDescriptor(discoveredDescriptor);
  }
  const discoveredRelayHttpBaseUrl =
    relayDiscovery.environments.get(environmentId)?.environment.endpoint.httpBaseUrl;
  const [lastRelayHttpBaseUrl, setLastRelayHttpBaseUrl] = useState(discoveredRelayHttpBaseUrl);
  if (
    discoveredRelayHttpBaseUrl !== undefined &&
    discoveredRelayHttpBaseUrl !== lastRelayHttpBaseUrl
  ) {
    setLastRelayHttpBaseUrl(discoveredRelayHttpBaseUrl);
  }
  const retryNow = useAtomCommand(environmentCatalog.retryNow);
  const {
    diagnosis: currentDiagnosis,
    state: connectionState,
    relayOnly,
  } = useConnectionDiagnosis(environment);
  const diagnosis = resumingServerUpdate ? null : currentDiagnosis;
  const prepared = usePreparedConnection(environmentId);
  const connectedTarget = isConnected && prepared._tag === "Some" ? prepared.value.target : null;
  const mcpUrl = environmentMcpUrl({
    entry: environment.entry,
    relayHttpBaseUrl: discoveredRelayHttpBaseUrl ?? lastRelayHttpBaseUrl,
    connectedTarget,
  });
  const machineKind = resolveEnvironmentMachineKind(
    environment.serverConfig ??
      (lastDescriptor === undefined ? null : { environment: lastDescriptor }),
  );
  const routeCount = connectionRoutes(environment.entry).length;
  const subtitleText = [
    environmentTransportLabel(environment, connectedTarget),
    // The headline below names the failure in full.
    diagnosis
      ? null
      : resumingServerUpdate
        ? t.settings.connections.status.restarting
        : status.text,
    enabled && versionMismatch ? serverVersion : null,
  ]
    .filter((value): value is string => value !== null)
    .join(" · ");

  const showUpdateAction =
    enabled &&
    isConnected &&
    versionMismatch !== null &&
    (serverUpdateState.status === "idle" || serverUpdateState.status === "failed");

  const statusTooltip = t.settings.connections.environment.statusTooltip(
    unsupported
      ? (environment.connection.error ??
          connectionStatusText(environment.connection, t.chat.workLog.shared.connection))
      : enabled
        ? connectionStatusText(environment.connection, t.chat.workLog.shared.connection)
        : t.settings.connections.environment.switchedOff,
    versionMismatch?.serverVersion ?? null,
    versionMismatch?.clientVersion ?? null,
  );

  return (
    <EnvironmentRow
      kind={machineKind}
      label={environment.label}
      status={isConnected ? t.settings.connections.access.connected : null}
      dimmed={!enabled}
      subtitle={
        <span className="flex min-w-0 items-center gap-1">
          <Tooltip>
            {/* The status can change while the tooltip is open, and base-ui only
                re-measures the popup when the trigger's payload changes. */}
            <TooltipTrigger
              payload={statusTooltip}
              render={
                <span
                  className={cn(
                    "min-w-0 truncate",
                    enabled &&
                      status.tone === "error" &&
                      !resumingServerUpdate &&
                      !diagnosis &&
                      "text-destructive",
                  )}
                />
              }
            >
              {subtitleText}
            </TooltipTrigger>
            <TooltipPopup side="top" className="whitespace-pre-wrap">
              {statusTooltip}
            </TooltipPopup>
          </Tooltip>
          <span aria-hidden className="shrink-0">
            ·
          </span>
          <button
            type="button"
            aria-expanded={routesOpen}
            onClick={() => setRoutesOpen((open) => !open)}
            className="inline-flex shrink-0 items-center gap-0.5 rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
          >
            {routeCount === 1
              ? t.settings.connections.environment.routes
              : t.settings.connections.environment.routeCount(routeCount)}
            <ChevronRightIcon
              aria-hidden
              className={cn(
                "size-3 shrink-0 transition-transform duration-150 motion-reduce:transition-none",
                routesOpen && "rotate-90",
              )}
            />
          </button>
          <span aria-hidden className="shrink-0">
            ·
          </span>
          <button
            type="button"
            aria-expanded={permissionsOpen}
            aria-controls={`remote-permissions-${environmentId}`}
            onClick={() => setPermissionsOpen((open) => !open)}
            className="inline-flex shrink-0 items-center gap-0.5 rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
          >
            {t.settings.merge.permissions}
            <ChevronRightIcon
              aria-hidden
              className={cn(
                "size-3 shrink-0 transition-transform duration-150 motion-reduce:transition-none",
                permissionsOpen && "rotate-90",
              )}
            />
          </button>
        </span>
      }
      below={
        <>
          {diagnosis ? (
            <ConnectionDiagnosisSummary
              diagnosis={diagnosis}
              retryAt={connectionState.phase === "backoff" ? connectionState.retryAt : null}
              attempt={connectionState.attempt}
              expanded={diagnosisOpen}
              onToggle={() => setDiagnosisOpen((open) => !open)}
            />
          ) : null}
          {serverUpdateState.status !== "idle" ? (
            <div className="mt-1 max-w-md">
              <ServerUpdateProgress state={serverUpdateState} />
            </div>
          ) : null}
        </>
      }
      detail={
        <>
          {diagnosis && diagnosisOpen ? (
            <ConnectionDiagnosisPanel
              hostLabel={environment.label}
              diagnosis={diagnosis}
              onRetry={() => void retryNow(environmentId)}
              onAddRoute={relayOnly ? () => onAddRoute(environment) : null}
            />
          ) : null}
          {routesOpen && (
            <EnvironmentRoutesList
              environment={environment}
              onAddRoute={() => onAddRoute(environment)}
            />
          )}
          {permissionsOpen && (
            <div
              id={`remote-permissions-${environmentId}`}
              className="mt-2 border-t border-border/50"
            >
              <SessionPermissions
                environmentId={environmentId}
                connected={isConnected}
                routeContext
              />
            </div>
          )}
        </>
      }
    >
      {unsupported &&
      environment.entry.serverUpdateRequired === true &&
      serverUpdateState.status !== "running" ? (
        <OutdatedServerUpdateAction
          environmentId={environmentId}
          serverLabel={t.settings.connections.environment.serverLabel(environment.label)}
          fromVersion={lastDescriptor?.serverVersion}
          targetVersion={APP_VERSION}
          label={
            serverUpdateState.status === "failed"
              ? t.settings.connections.environment.retryUpdate
              : t.settings.actions.update
          }
        />
      ) : null}
      {showUpdateAction ? (
        <ServerUpdateAction
          environmentId={environmentId}
          serverLabel={t.settings.connections.environment.serverLabel(environment.label)}
          selfUpdate={resolveServerSelfUpdateCapability(environment.serverConfig)}
          installation={environment.serverConfig?.environment.capabilities.serverInstallation}
          desktopAppUpdate={supportsDesktopAppUpdate(environment.serverConfig)}
          targetVersion={versionMismatch.clientVersion}
          label={
            serverUpdateState.status === "failed"
              ? t.settings.connections.environment.retryUpdate
              : t.settings.actions.update
          }
          appearance="icon"
        />
      ) : null}
      <Tooltip>
        <TooltipTrigger
          render={
            <Switch
              size="sm"
              checked={enabled}
              disabled={isRemoving || blocked}
              aria-label={t.settings.connections.environment.switchAriaLabel(
                enabled,
                environment.label,
              )}
              onCheckedChange={(checked) => onSetEnabled(environmentId, checked)}
            />
          }
        />
        <TooltipPopup side="top">
          {blocked
            ? t.settings.connections.status.unsupported
            : enabled
              ? t.settings.connections.environment.switchOff
              : t.settings.connections.environment.switchOn}
        </TooltipPopup>
      </Tooltip>
      <Menu>
        <MenuTrigger
          render={
            <Button
              type="button"
              variant="secondary"
              size="settings-list"
              disabled={isRemoving}
              aria-label={t.settings.connections.environment.actionsAriaLabel(environment.label)}
            />
          }
        >
          {t.settings.actions.edit}
        </MenuTrigger>
        <MenuPopup align="end">
          <EnvironmentIconMenu
            environmentId={environmentId}
            serverConfig={environment.serverConfig}
          />
          <MenuItem onClick={() => setRoutesOpen((open) => !open)}>
            <RouteIcon />
            {routesOpen
              ? t.settings.connections.environment.hideRoutes
              : t.settings.connections.environment.routes}
          </MenuItem>
          {mcpUrl ? (
            <MenuItem onClick={() => copyMcpUrl(mcpUrl, { url: mcpUrl })}>
              {t.settings.connections.environment.copyMcpUrl}
            </MenuItem>
          ) : null}
          {errorTraceId ? (
            <MenuItem onClick={() => copyTraceId(errorTraceId)}>
              {t.settings.connections.environment.copyTraceId}
            </MenuItem>
          ) : null}
          <MenuSeparator />
          <MenuItem variant="destructive" onClick={() => onRemove(environment)}>
            {isRemoving
              ? t.settings.connections.environment.removing
              : t.settings.connections.environment.remove}
          </MenuItem>
        </MenuPopup>
      </Menu>
    </EnvironmentRow>
  );
}

function CloudLinkSwitch({
  checked,
  disabled,
  disabledReason,
  onCheckedChange,
  ariaLabel = t.settings.connections.cloud.enable,
}: {
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly disabledReason: string | null;
  readonly onCheckedChange?: (enabled: boolean) => void;
  readonly ariaLabel?: string;
}) {
  const control = (
    <Switch
      aria-label={ariaLabel}
      checked={checked}
      disabled={disabled}
      {...(onCheckedChange ? { onCheckedChange } : {})}
    />
  );
  return disabledReason ? (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex">{control}</span>} />
      <TooltipPopup side="top">{disabledReason}</TooltipPopup>
    </Tooltip>
  ) : (
    control
  );
}

/** Displays relay controls with their original permission checks; signed-out users use the existing Clerk prompt. */
function ConfiguredCloudLinkRow({ canManageRelay }: { readonly canManageRelay: boolean }) {
  const { openAuthPrompt } = useT3ConnectAuthPrompt();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const {
    isSignedIn,
    linkState: primaryCloudLinkState,
    linkRevoked,
    managedTunnelActive,
    managedTunnelOutOfSync,
    publishAgentActivity,
    holdWebhooksWhileOffline,
    operationError,
    reconcileCloudState,
  } = useCloudLinkController();
  const [isUpdating, setIsUpdating] = useState(false);
  const [isUpdatingPreference, setIsUpdatingPreference] = useState(false);

  const disabledReason = !isSignedIn
    ? t.settings.connections.cloud.signInError
    : !canManageRelay
      ? t.settings.connections.cloud.permissionError
      : null;
  const isBusy = isUpdating || isUpdatingPreference;
  const refreshLinkState = useEffectEvent(primaryCloudLinkState.refresh);
  // The server rechecks reachability when the tunnel's 30 s readiness poll changes.
  // Poll while mounted, so a failed read does not stop later ones.
  useEffect(() => {
    const interval = window.setInterval(() => refreshLinkState(), 30_000);
    return () => window.clearInterval(interval);
  }, []);
  const reachability = managedTunnelActive ? primaryCloudLinkState.data?.reachability : undefined;
  const reachabilityStatus =
    reachability?.status === "reachable" ? (
      formatConnectReachable(reachability)
    ) : reachability?.status === "unreachable" ? (
      <span className="block text-destructive">
        {[
          reachability.reason,
          reachability.hint,
          t.settings.connectionInfoText.fix(reachability.fix),
        ]
          .filter(Boolean)
          .join(" ")}{" "}
        <a
          href={connectReachabilityHelpUrl(reachability.cause)}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          {t.settings.connectionInfoUi.more}
        </a>
      </span>
    ) : null;

  const updateManagedTunnel = async (enabled: boolean) => {
    if (
      primaryEnvironmentId === null ||
      !readEnvironmentScope(primaryEnvironmentId, AuthRelayWriteScope)
    )
      return;
    setIsUpdating(true);
    const ok = await reconcileCloudState({ managedTunnel: enabled, publish: publishAgentActivity });
    if (ok) {
      toastManager.add({
        type: "success",
        title: enabled
          ? t.settings.connections.cloud.linkedToast
          : publishAgentActivity
            ? t.settings.connections.cloud.tunnelDisabledToast
            : t.settings.connections.cloud.unlinkedToast,
        description: enabled
          ? t.settings.connections.cloud.linkedHint
          : publishAgentActivity
            ? t.settings.connections.cloud.tunnelDisabledHint
            : t.settings.connections.cloud.unlinkedHint,
      });
    }
    setIsUpdating(false);
  };

  const updatePublishAgentActivity = async (enabled: boolean) => {
    if (
      primaryEnvironmentId === null ||
      !readEnvironmentScope(primaryEnvironmentId, AuthRelayWriteScope)
    )
      return;
    setIsUpdatingPreference(true);
    const ok = await reconcileCloudState({ managedTunnel: managedTunnelActive, publish: enabled });
    if (ok) {
      toastManager.add({
        type: "success",
        title: enabled
          ? t.settings.connections.cloud.activityEnabledToast
          : t.settings.connections.cloud.activityDisabledToast,
        description: enabled
          ? t.settings.connections.cloud.activityEnabledHint
          : t.settings.connections.cloud.activityDisabledHint,
      });
    }
    setIsUpdatingPreference(false);
  };

  const updateHoldWebhooks = async (enabled: boolean) => {
    setIsUpdatingPreference(true);
    const ok = await reconcileCloudState({
      managedTunnel: managedTunnelActive,
      publish: publishAgentActivity,
      holdWebhooksWhileOffline: enabled,
    });
    if (ok) {
      toastManager.add({
        type: "success",
        title: enabled
          ? t.settings.connections.cloud.webhooksHeldToast
          : t.settings.connections.cloud.webhooksNotHeldToast,
        description: enabled
          ? t.settings.connections.cloud.webhooksHeldHint
          : t.settings.connections.cloud.webhooksNotHeldHint,
      });
    }
    setIsUpdatingPreference(false);
  };

  return (
    <>
      {window.desktopBridge ? (
        <SettingsRow
          title={searchableSetting("t3-connect").title}
          description={
            linkRevoked
              ? t.settings.connections.cloud.removedRelink
              : managedTunnelActive
                ? reachability?.status === "unreachable"
                  ? t.settings.connections.cloud.unreachable
                  : reachability?.status === "reachable"
                    ? t.settings.connections.cloud.availableHint
                    : t.settings.connections.cloud.unchecked
                : managedTunnelOutOfSync
                  ? t.settings.connections.cloud.outOfSync
                  : t.settings.connections.cloud.enableHint
          }
          status={operationError ?? primaryCloudLinkState.error ?? reachabilityStatus}
          control={
            <Tooltip>
              <TooltipTrigger render={<span className="inline-flex" />}>
                {!isSignedIn ? (
                  <Button size="md" variant="secondary" onClick={openAuthPrompt}>
                    {t.settings.sidebarNav.signIn}
                  </Button>
                ) : (
                  <CloudLinkSwitch
                    checked={managedTunnelActive}
                    disabled={
                      !canManageRelay ||
                      !isSignedIn ||
                      primaryCloudLinkState.data === null ||
                      primaryCloudLinkState.isPending ||
                      isBusy
                    }
                    disabledReason={disabledReason}
                    onCheckedChange={(enabled) => void updateManagedTunnel(enabled)}
                  />
                )}
              </TooltipTrigger>
              <TooltipPopup side="top">
                {managedTunnelActive
                  ? t.settings.connections.cloud.availableHint
                  : t.settings.connections.cloud.enableHint}
              </TooltipPopup>
            </Tooltip>
          }
        />
      ) : null}
      {managedTunnelActive ? (
        <SettingsRow
          {...searchableSetting("hold-webhooks-while-offline")}
          description={t.settings.connections.cloud.webhooksDescription}
          control={
            <CloudLinkSwitch
              ariaLabel={t.settings.connections.cloud.webhooksAriaLabel}
              checked={holdWebhooksWhileOffline}
              disabled={!canManageRelay || !isSignedIn || primaryCloudLinkState.isPending || isBusy}
              disabledReason={disabledReason}
              onCheckedChange={(enabled) => void updateHoldWebhooks(enabled)}
            />
          }
        />
      ) : linkRevoked ? (
        <SettingsRow
          title={searchableSetting("t3-connect").title}
          description={t.settings.connections.cloud.removedRelinkCommand}
        />
      ) : null}
      <SettingsRow
        {...searchableSetting("publish-agent-activity")}
        description={t.settings.connections.cloud.activityDescription}
        control={
          <CloudLinkSwitch
            ariaLabel={t.settings.connections.cloud.activityAriaLabel}
            checked={publishAgentActivity}
            disabled={
              !canManageRelay ||
              !isSignedIn ||
              primaryCloudLinkState.data === null ||
              primaryCloudLinkState.isPending ||
              isBusy
            }
            disabledReason={disabledReason}
            onCheckedChange={(enabled) => void updatePublishAgentActivity(enabled)}
          />
        }
      />
    </>
  );
}

/** Preserves the T3 Connect search anchor when relay permissions show an explanation instead of controls. */
export function CloudLinkRow({
  canReadRelay,
  canManageRelay,
}: {
  readonly canReadRelay: boolean;
  readonly canManageRelay: boolean;
}) {
  if (!hasCloudPublicConfig()) return null;
  if (!canReadRelay) {
    return (
      <SettingsRow
        {...searchableSetting("t3-connect")}
        description={t.settings.connections.cloud.permissionsHint}
      />
    );
  }
  return <ConfiguredCloudLinkRow canManageRelay={canManageRelay} />;
}

/** Explains an empty environment list without manufacturing a connected example machine. */
function EmptyRemoteEnvironments({ cloudEnabled = true }: { readonly cloudEnabled?: boolean }) {
  return (
    <div className="rounded-settings-row-surface bg-connections-well px-4 py-4.5 text-center text-secondary-copy-large text-secondary-label shadow-connections-icon">
      <p>{t.settings.connections.environment.empty}</p>
      <p>
        {cloudEnabled
          ? t.settings.connections.environment.emptyCloudHint
          : t.settings.connections.environment.emptyHint}
      </p>
    </div>
  );
}

export function CloudRemoteEnvironmentRows({
  primaryEnvironmentId,
  savedEnvironments,
}: {
  readonly primaryEnvironmentId: EnvironmentId | null;
  readonly savedEnvironments: ReadonlyArray<EnvironmentPresentation>;
}) {
  return hasCloudPublicConfig() ? (
    <CloudEnvironmentConnectRows
      primaryEnvironmentId={primaryEnvironmentId}
      savedEnvironments={savedEnvironments}
      empty={<EmptyRemoteEnvironments />}
    />
  ) : savedEnvironments.length === 0 ? (
    <EmptyRemoteEnvironments cloudEnabled={false} />
  ) : null;
}

// Subscribes on its own so desktop download progress does not re-render the page.
