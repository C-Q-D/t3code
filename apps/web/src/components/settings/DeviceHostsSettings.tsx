/** Manages scoped SSH device hosts and their live connection states; local host selection is not supported here. */
import { t } from "~/i18n";
import { DeviceToolVersions } from "../device/DeviceToolVersions";
import { DeviceHostAvailability } from "../device/DeviceHostAvailability";
import { useAtomValue } from "@effect/atom-react";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/reactivity";
import { AuthSettingsWriteScope } from "@t3tools/contracts";
import { readEnvironmentScope, useEnvironmentScope } from "../../state/session";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { AppleIcon, AndroidIcon } from "../Icons";
import { Spinner } from "../ui/spinner";
import type { EnvironmentId, SshDeviceHostConfig } from "@t3tools/contracts";
import { randomUUID } from "../../lib/utils";
import { useState } from "react";
import { deviceEnvironment } from "../../state/device";
import { environmentAtomList, environmentIdsKey } from "../../state/environmentAtomList";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button, InlineButton } from "../ui/button";
import {
  CheckIcon,
  ChevronDownIcon,
  CircleIcon,
  MoreVertical,
  PlusIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "../ui/collapsible";
import { Menu, MenuTrigger, MenuPopup, MenuItem } from "../ui/menu";
import { SettingsRow } from "./settingsLayout";

import { useSettingsScope } from "./SettingsScopeContext";
import { toastManager } from "../ui/toast";
import {
  groupDeviceHosts,
  updateDeviceHosts,
  type DeviceHostEnvironment,
  type DeviceHostGroup,
} from "./deviceHostsSettings.logic";
import { FoldedSettingsSection } from "./FoldedSettingsSection";
import { DeviceHostEditor } from "./DeviceHostEditor";
import { useHostConnectionChecks } from "./useHostConnectionChecks";
import { deviceHostConnectionKey } from "./deviceHostConnectionChecks";
import { settingsScopeEnvironmentLabel, settingsScopeEnvironmentLabels } from "./settingsScopeAxis";
import { DeviceHostDiagnostics } from "../device/DeviceSetup";

/** Edits hosts for the selected environment scope; project scopes remain read-only. */
export function DeviceHostsSettings(props: { environmentId: EnvironmentId | null }) {
  const { scope, environments, connectedEnvironments } = useSettingsScope();
  const canConfigure = useEnvironmentScope(props.environmentId, AuthSettingsWriteScope);
  const projectScope = scope.kind === "project" || scope.kind === "checkout";
  const update = useAtomCommand(serverEnvironment.updateSettings, { reportFailure: false });
  const [editing, setEditing] = useState<SshDeviceHostConfig | null>(null);
  const [originalHost, setOriginalHost] = useState<SshDeviceHostConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const targets = environments.map((environment) => ({
    environmentId: environment.environmentId,
    label: settingsScopeEnvironmentLabel(environment, environments),
    connected: environment.connection.phase === "connected",
  }));
  const { checks, testConnection } = useHostConnectionChecks(targets);
  const hostEnvironments = connectedEnvironments.map((environment) => ({
    environmentId: environment.environmentId,
    label: environment.label,
    labels: settingsScopeEnvironmentLabels(environment, connectedEnvironments),
    hosts: environment.serverConfig?.settings.deviceHosts ?? [],
  }));
  const groupedHosts = groupDeviceHosts(hostEnvironments);
  const save = async (host: SshDeviceHostConfig, remove = false, original = host) => {
    if (!props.environmentId || projectScope) return;
    setBusy(true);
    const results = await Promise.allSettled(
      environments.map(async (environment) => {
        if (environment.connection.phase !== "connected" || !environment.serverConfig) {
          throw new Error(t.settings.scheduledTasks.disconnected);
        }
        if (!readEnvironmentScope(environment.environmentId, AuthSettingsWriteScope)) {
          throw new Error(t.settings.integrations.devices.permissionError);
        }
        return update({
          environmentId: environment.environmentId,
          input: {
            patch: {
              deviceHosts: updateDeviceHosts(
                environment.serverConfig.settings.deviceHosts,
                host,
                remove,
                original,
              ),
            },
          },
        });
      }),
    );
    setBusy(false);
    const failed = environments.filter((_, index) => {
      const result = results[index];
      return result?.status !== "fulfilled" || result.value._tag === "Failure";
    });
    if (failed.length === 0) {
      setEditing(null);
    } else {
      toastManager.add({
        type: "error",
        title: t.settings.deviceHosts.deviceHostsSavedAllEnvironments,
        description: t.settings.deviceHosts.couldNotUpdate(
          failed.map((environment) => environment.label).join(", "),
        ),
      });
    }
  };
  const listActions = {
    busy: !canConfigure || projectScope || busy,
    checks,
    testConnection: async (host: SshDeviceHostConfig) => {
      const results = await testConnection(host);
      if (!results) return;
      const failed = targets.filter((target) => results[target.environmentId]?.status === "failed");
      toastManager.add({
        type: failed.length ? "error" : "success",
        title: failed.length
          ? t.settings.deviceHosts.ofEnvironmentsFailed(host.label, failed.length, targets.length)
          : t.settings.deviceHosts.connectionChecksPassed(host.label),
        description: failed.length
          ? t.settings.deviceHosts.couldNotConnectFrom(
              failed.map((target) => target.label).join(", "),
            )
          : t.settings.deviceHosts.connectedAlreadyAvailableLocallyEachHint,
      });
      return results;
    },
    onEdit: (host: SshDeviceHostConfig) => {
      setOriginalHost(host);
      setEditing(host);
    },
    onRemove: (host: SshDeviceHostConfig) => void save(host, true),
  };
  return (
    <SettingsRow
      id="device-hosts"
      title={t.settings.rows.deviceHosts.title}
      serverScoped
      settingKeys={["deviceHosts"]}
      control={
        <Button
          size="toolbar"
          variant="outline"
          disabled={
            !canConfigure || projectScope || busy || !props.environmentId || editing !== null
          }
          onClick={() => {
            setOriginalHost(null);
            setEditing({ kind: "ssh", id: randomUUID(), label: "", target: "" });
          }}
        >
          <PlusIcon className="size-3.5" /> {t.settings.deviceHosts.addHost}
        </Button>
      }
    >
      <div className="pt-3 pb-2">
        {!props.environmentId ? (
          <p className="text-sm text-muted-foreground">
            {t.settings.deviceHosts.connectSelectedEnvironmentManageDeviceHint}
          </p>
        ) : (
          <>
            {hostEnvironments.length > 1 && groupedHosts === null ? (
              <div className="space-y-2">
                {hostEnvironments.map((environment) => (
                  <FoldedSettingsSection
                    key={environment.environmentId}
                    id={`device-hosts-${environment.environmentId}`}
                    title={
                      <>
                        <span className="block max-w-64 truncate">
                          {environment.labels.primary}
                        </span>
                        {environment.labels.secondary ? (
                          <span className="block max-w-64 truncate text-xs font-normal text-muted-foreground">
                            {environment.labels.secondary}
                          </span>
                        ) : null}
                      </>
                    }
                    summary={
                      summarizeLabels(environment.hosts.map((host) => host.label)) ||
                      t.settings.deviceHosts.noDeviceHosts
                    }
                  >
                    <div className="px-3 sm:px-4 [&>div:first-child]:border-t-0">
                      <DeviceHostList environments={[environment]} {...listActions} />
                    </div>
                  </FoldedSettingsSection>
                ))}
              </div>
            ) : (
              <DeviceHostList
                environments={hostEnvironments}
                groups={groupedHosts ?? undefined}
                compact={hostEnvironments.length > 1}
                {...listActions}
              />
            )}
            {editing ? (
              <DeviceHostEditor
                key={editing.id}
                host={editing}
                isNew={originalHost === null}
                targets={targets}
                busy={busy}
                onSave={(host) => void save(host, false, originalHost ?? host)}
                onClose={() => setEditing(null)}
              />
            ) : null}
          </>
        )}
      </div>
    </SettingsRow>
  );
}

const deviceHostStatesAtom = environmentAtomList("web-device-host-states", (environmentId) =>
  deviceEnvironment.state({ environmentId, input: {} }),
);

/** Renders configured hosts with connection progress, platform availability and existing retry actions. */
function DeviceHostList({
  environments,
  groups,
  compact = false,
  busy,
  onEdit,
  onRemove,
  checks,
  testConnection,
}: {
  environments: ReadonlyArray<DeviceHostEnvironment>;
  groups?: ReadonlyArray<DeviceHostGroup> | undefined;
  compact?: boolean;
  busy: boolean;
  onEdit: (host: SshDeviceHostConfig) => void;
  onRemove: (host: SshDeviceHostConfig) => void;
  checks: ReturnType<typeof useHostConnectionChecks>["checks"];
  testConnection: ReturnType<typeof useHostConnectionChecks>["testConnection"];
}) {
  const { environments: scopeEnvironments } = useSettingsScope();
  const environmentLabels = new Map(
    scopeEnvironments.map((environment) => [
      environment.environmentId,
      settingsScopeEnvironmentLabels(environment, scopeEnvironments),
    ]),
  );
  const environmentIds = environments.map(({ environmentId }) => environmentId);
  const results = useAtomValue(deviceHostStatesAtom(environmentIdsKey(environmentIds)));
  const states = new Map(
    environmentIds.map(
      (environmentId, index) =>
        [environmentId, Option.getOrUndefined(AsyncResult.value(results[index]!))] as const,
    ),
  );
  const retry = useAtomCommand(deviceEnvironment.list);
  const [retrying, setRetrying] = useState<string | null>(null);
  const retryHost = (environmentId: EnvironmentId, hostId: string, key = hostId) => {
    setRetrying(key);
    void retry({ environmentId, input: { retryHostId: hostId } }).finally(() => setRetrying(null));
  };
  const rows =
    groups ??
    environments.flatMap((environment) =>
      environment.hosts.map((host) => ({
        host,
        members: [{ environmentId: environment.environmentId, label: environment.label, host }],
      })),
    );
  return (
    <>
      {rows.length === 0 ? (
        <p className="rounded-settings-row-surface bg-input px-4 py-4.5 text-center text-control leading-relaxed text-secondary-label shadow-well-control">
          {t.settings.deviceHosts.noDeviceHosts}
        </p>
      ) : null}
      {rows.map(({ host, members }) => {
        const hostChecks = checks[deviceHostConnectionKey(host)];
        const checkedMembers = scopeEnvironments.flatMap((environment) =>
          hostChecks?.[environment.environmentId] &&
          !members.some((member) => member.environmentId === environment.environmentId)
            ? [{ environmentId: environment.environmentId, label: environment.label, host }]
            : [],
        );
        const results = [...members, ...checkedMembers].map((member) => {
          const state = states.get(member.environmentId);
          const status = state?.hostStatuses[member.host.id];
          const check = hostChecks?.[member.environmentId];
          const summary = state?.hosts.find((value) => value.id === member.host.id);
          const label = environmentLabels.get(member.environmentId)?.primary ?? member.label;
          const address = environmentLabels.get(member.environmentId)?.secondary;
          const error =
            check?.status === "failed"
              ? check.error
              : check?.status === "local"
                ? undefined
                : status?.status === "failed"
                  ? status.detail
                  : undefined;
          return {
            ...member,
            label,
            address,
            name: [label, address].filter(Boolean).join(" · "),
            state,
            status,
            check,
            summary,
            error,
            versions: (
              <DeviceToolVersions
                owner={label}
                error={summary?.toolInspectionError}
                tools={summary?.tools ?? (check?.status === "connected" ? check.tools : undefined)}
              />
            ),
          };
        });
        const first = results[0];
        if (!first) return null;
        const { environmentId, status, check, summary, error } = first;
        const platforms =
          (check?.status === "connected" ? check.platforms : undefined) ?? summary?.platforms ?? [];
        const progress =
          check?.status === "pending"
            ? t.settings.deviceHosts.checkingConnection
            : status?.status === "installing"
              ? t.settings.deviceHosts.installingDeviceSupport
              : status?.status === "starting"
                ? t.settings.deviceHosts.connecting
                : null;
        const failed = results.filter(
          (result) =>
            result.check?.status === "failed" ||
            (result.check?.status !== "local" && result.status?.status === "failed"),
        );
        const pending = results.some(
          (result) =>
            result.check?.status === "pending" ||
            result.status?.status === "installing" ||
            result.status?.status === "starting",
        );
        const ready = results.every(
          (result) =>
            result.check?.status === "connected" ||
            result.check?.status === "local" ||
            result.status?.status === "ready",
        );
        const retryable = results.filter(
          (result) =>
            result.status?.status === "failed" &&
            result.state?.supportsHostRetry &&
            result.state.hostStatus !== "disabled",
        );
        const canRetry = !compact && retryable.includes(first);
        const indicators = compact
          ? [
              {
                key: "connection",
                label: failed.length
                  ? t.settings.connections.status.failed
                  : pending
                    ? t.settings.deviceHostsUi.checking
                    : ready
                      ? t.settings.hostCheckStatusUi.connected
                      : t.settings.deviceHostsUi.unchecked,
                warning: failed.length > 0,
                icon: failed.length ? (
                  <TriangleAlertIcon className="size-3.5" />
                ) : pending ? (
                  <Spinner size="xs" />
                ) : ready ? (
                  <CheckIcon className="size-3.5" />
                ) : (
                  <CircleIcon className="size-3.5" />
                ),
                detail: failed.length ? (
                  <div className="space-y-1">
                    {failed.map((result) => (
                      <p key={result.environmentId}>
                        {result.name}: {result.error || t.settings.connections.status.failed}
                      </p>
                    ))}
                  </div>
                ) : pending ? (
                  t.settings.deviceHostsUi.checkingProgress
                ) : ready ? (
                  t.settings.deviceHostsUi.available
                ) : (
                  t.settings.deviceHostsUi.test
                ),
              },
            ]
          : platforms
              .filter((platform) => platform.available)
              .map((platform) => ({
                key: platform.platform,
                label:
                  platform.platform === "ios"
                    ? t.settings.deviceHosts.iOsAvailable
                    : t.settings.deviceHosts.androidAvailable,
                warning: false,
                icon:
                  platform.platform === "ios" ? (
                    // The Apple mark is bottom-heavy; lift it so it does not dip under the label.
                    <AppleIcon className="size-3.5 -translate-y-px" />
                  ) : (
                    <AndroidIcon className="size-3.5" />
                  ),
              }));
        return (
          <div
            key={host.id}
            className="flex min-h-12 items-center gap-3 border-t border-settings-divider px-3.5 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <p className="truncate text-sm font-medium">{host.label}</p>
                {indicators.map((indicator) => (
                  <Tooltip key={indicator.key}>
                    <TooltipTrigger
                      render={
                        <span
                          tabIndex={0}
                          role="img"
                          aria-label={indicator.label}
                          className={
                            indicator.warning
                              ? "shrink-0 text-warning"
                              : "shrink-0 text-muted-foreground"
                          }
                        />
                      }
                    >
                      {indicator.icon}
                    </TooltipTrigger>
                    <TooltipPopup>
                      {"detail" in indicator ? indicator.detail : indicator.label}
                    </TooltipPopup>
                  </Tooltip>
                ))}
              </div>
              <p className="truncate text-xs text-muted-foreground">{host.target}</p>
              {results
                .filter(
                  (result) =>
                    result.status?.status === "ready" && result.status.androidDiscoveryIncomplete,
                )
                .map((result) => (
                  <p key={result.environmentId} role="status" className="mt-1 text-xs text-warning">
                    {compact ? `${result.label}: ` : ""}
                    {result.status?.detail ?? t.settings.deviceHostsUi.androidWarning}
                  </p>
                ))}
              {compact ? (
                <Collapsible>
                  <div className="min-w-0 text-xs [--inline-button-white-space:normal]">
                    <CollapsibleTrigger
                      aria-label={t.settings.connectionStateText.machineDetails(host.label)}
                      render={<InlineButton tone="muted" />}
                    >
                      <span className="line-clamp-1 break-all text-left">
                        {summarizeLabels(results.map((result) => result.name))}
                      </span>
                      <ChevronDownIcon className="size-3 shrink-0" />
                    </CollapsibleTrigger>
                  </div>
                  <CollapsiblePanel>
                    <div className="mt-2 space-y-2">
                      {results.map((result) => (
                        <div key={result.environmentId}>
                          <p className="text-xs text-muted-foreground">{result.label}</p>
                          {result.address ? (
                            <p className="truncate text-xs text-muted-foreground">
                              {result.address}
                            </p>
                          ) : null}
                          {result.error ? (
                            <p role="status" className="text-xs text-destructive">
                              {result.error}
                            </p>
                          ) : null}
                          {result.state ? (
                            <DeviceHostDiagnostics
                              hosts={[result.host]}
                              hostStatuses={result.state.hostStatuses}
                            />
                          ) : null}
                          {result.versions}
                          {result.check?.status === "local" ? (
                            <p className="text-xs text-muted-foreground">
                              {t.settings.deviceHosts.alreadyAvailableLocally}
                            </p>
                          ) : (
                            <DeviceHostAvailability
                              platforms={
                                (result.check?.status === "connected"
                                  ? result.check.platforms
                                  : result.summary?.platforms) ?? []
                              }
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </CollapsiblePanel>
                </Collapsible>
              ) : (
                first.versions
              )}
              {!compact && check?.status === "local" ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t.settings.deviceHosts.alreadyAvailableLocally}
                </p>
              ) : null}
              {!compact && error ? (
                <div className="mt-1" role="status">
                  <details className="text-xs text-destructive">
                    <summary>{t.settings.connections.status.failed}</summary>
                    <p className="mt-1 whitespace-pre-wrap break-words">{error}</p>
                  </details>
                </div>
              ) : null}
              {!compact
                ? results.map((result) =>
                    result.state ? (
                      <DeviceHostDiagnostics
                        key={result.environmentId}
                        className="mt-1"
                        hosts={[result.host]}
                        hostStatuses={result.state.hostStatuses}
                      />
                    ) : null,
                  )
                : null}
            </div>
            {!compact && progress ? (
              <span
                role="status"
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                <Spinner size="xs" />
                {progress}
              </span>
            ) : null}
            <Menu>
              <MenuTrigger
                render={
                  <Button
                    size="icon-toolbar"
                    variant="ghost-muted"
                    disabled={busy}
                    aria-label={host.label + t.settings.deviceHosts.options}
                  />
                }
              >
                <MoreVertical />
              </MenuTrigger>
              <MenuPopup align="end">
                <MenuItem
                  onClick={() => {
                    onEdit(host);
                  }}
                >
                  {t.settings.actions.edit}
                </MenuItem>
                <MenuItem variant="destructive" onClick={() => onRemove(host)}>
                  {t.settings.deviceHosts.remove}
                </MenuItem>
                {compact
                  ? retryable.map((result) => (
                      <MenuItem
                        key={result.environmentId}
                        disabled={retrying !== null}
                        onClick={() =>
                          retryHost(result.environmentId, result.host.id, result.environmentId)
                        }
                      >
                        {retrying === result.environmentId
                          ? t.settings.hostCheckStatusUi.retrying
                          : t.settings.actions.retry}{" "}
                        {t.settings.deviceHostsUi.from} {result.label}
                        {result.address ? ` (${result.address})` : null}
                      </MenuItem>
                    ))
                  : null}
              </MenuPopup>
            </Menu>
            <Button
              size="toolbar"
              variant="outline"
              disabled={
                busy || (canRetry ? retrying !== null : compact ? pending : progress !== null)
              }
              onClick={() => {
                if (canRetry) retryHost(environmentId, host.id);
                else void testConnection(host);
              }}
            >
              {canRetry
                ? retrying === host.id
                  ? t.settings.connections.wsl.retrying
                  : t.settings.actions.retry
                : t.settings.deviceHosts.testConnection}
            </Button>
          </div>
        );
      })}
    </>
  );
}

function summarizeLabels(labels: ReadonlyArray<string>) {
  return `${labels.slice(0, 2).join(", ")}${labels.length > 2 ? ` +${labels.length - 2}` : ""}`;
}
