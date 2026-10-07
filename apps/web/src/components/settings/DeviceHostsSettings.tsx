import { t } from "~/i18n";
import { DeviceToolVersions } from "../device/DeviceToolVersions";
import { AuthSettingsWriteScope } from "@t3tools/contracts";
import { readEnvironmentScope, useEnvironmentScope } from "../../state/session";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { AppleIcon, AndroidIcon } from "../Icons";
import { Spinner } from "../ui/spinner";
import type { EnvironmentId, SshDeviceHostConfig } from "@t3tools/contracts";
import { randomUUID } from "../../lib/utils";
import { useState } from "react";
import { deviceEnvironment, useDeviceState } from "../../state/device";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { MoreVertical, PlusIcon } from "lucide-react";
import { Menu, MenuTrigger, MenuPopup, MenuItem } from "../ui/menu";
import { SettingsRow } from "./settingsLayout";

import { useSettingsScope } from "./SettingsScopeContext";
import { toastManager } from "../ui/toast";
import { updateDeviceHosts } from "./deviceHostsSettings.logic";
import { DeviceHostEditor } from "./DeviceHostEditor";
import { useHostConnectionChecks } from "./useHostConnectionChecks";
import { deviceHostConnectionKey } from "./deviceHostConnectionChecks";

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
    label: environment.label,
    connected: environment.connection.phase === "connected",
  }));
  const { checks, testConnection } = useHostConnectionChecks(targets);
  const save = async (host: SshDeviceHostConfig, remove = false, original = host) => {
    if (!props.environmentId || projectScope) return;
    setBusy(true);
    try {
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
    } finally {
      setBusy(false);
    }
  };
  return (
    <SettingsRow
      id="device-hosts"
      title={t.settings.rows.deviceHosts.title}
      serverScoped
      settingKeys={["deviceHosts"]}
      description={t.settings.deviceHosts.addRemoteMachinesSimulatorEmulatorHint}
      control={
        <Button
          size="sm"
          variant="outline"
          disabled={
            !canConfigure || projectScope || busy || !props.environmentId || editing !== null
          }
          onClick={() => {
            setOriginalHost(null);
            setEditing({ id: randomUUID(), label: "", target: "" });
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
            {connectedEnvironments.map((environment) => (
              <div key={environment.environmentId}>
                {connectedEnvironments.length > 1 ? (
                  <p className="pt-3 pb-1 text-xs font-medium text-muted-foreground">
                    {environment.label}
                  </p>
                ) : null}
                <DeviceHostList
                  environmentLabel={environment.label}
                  environmentId={environment.environmentId}
                  hosts={environment.serverConfig?.settings.deviceHosts ?? []}
                  busy={!canConfigure || projectScope || busy}
                  checks={checks}
                  testConnection={async (host) => {
                    const results = await testConnection(host);
                    if (!results) return;
                    const failed = targets.filter(
                      (target) => results[target.environmentId]?.status === "failed",
                    );
                    toastManager.add({
                      type: failed.length ? "error" : "success",
                      title: failed.length
                        ? t.settings.deviceHosts.ofEnvironmentsFailed(
                            host.label,
                            failed.length,
                            targets.length,
                          )
                        : t.settings.deviceHosts.connectionChecksPassed(host.label),
                      description: failed.length
                        ? t.settings.deviceHosts.couldNotConnectFrom(
                            failed.map((target) => target.label).join(", "),
                          )
                        : t.settings.deviceHosts.connectedAlreadyAvailableLocallyEachHint,
                    });
                    return results;
                  }}
                  onEdit={(host) => {
                    setOriginalHost(host);
                    setEditing(host);
                  }}
                  onRemove={(host) => void save(host, true)}
                />
              </div>
            ))}
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

function DeviceHostList({
  environmentLabel,
  environmentId,
  hosts,
  busy,
  onEdit,
  onRemove,
  checks,
  testConnection,
}: {
  environmentLabel: string;
  environmentId: EnvironmentId;
  hosts: ReadonlyArray<SshDeviceHostConfig>;
  busy: boolean;
  onEdit: (host: SshDeviceHostConfig) => void;
  onRemove: (host: SshDeviceHostConfig) => void;
  checks: ReturnType<typeof useHostConnectionChecks>["checks"];
  testConnection: ReturnType<typeof useHostConnectionChecks>["testConnection"];
}) {
  const { state } = useDeviceState(environmentId);
  const retry = useAtomCommand(deviceEnvironment.list);
  const [retrying, setRetrying] = useState<string | null>(null);
  return (
    <>
      {hosts.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">{t.settings.deviceHosts.noDeviceHosts}</p>
      ) : null}
      {hosts.map((host) => {
        const status = state.hostStatuses[host.id];
        const check = checks[deviceHostConnectionKey(host)]?.[environmentId];
        const platforms =
          (check?.status === "connected" ? check.platforms : undefined) ??
          state.hosts.find((value) => value.id === host.id)?.platforms ??
          [];
        const progress =
          check?.status === "pending"
            ? t.settings.deviceHosts.checkingConnection
            : status?.status === "installing"
              ? t.settings.deviceHosts.installingDeviceSupport
              : status?.status === "starting"
                ? t.settings.deviceHosts.connecting
                : null;
        const error =
          check?.status === "failed"
            ? check.error
            : check?.status === "local"
              ? undefined
              : status?.status === "failed"
                ? status.detail
                : undefined;
        return (
          <div key={host.id} className="flex items-center gap-2 border-t border-border/50 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <p className="truncate text-sm font-medium">{host.label}</p>
                {platforms
                  .filter((platform) => platform.available)
                  .map((platform) => (
                    <Tooltip key={platform.platform}>
                      <TooltipTrigger
                        render={
                          <span
                            tabIndex={0}
                            role="img"
                            aria-label={
                              platform.platform === "ios"
                                ? t.settings.deviceHosts.iOsAvailable
                                : t.settings.deviceHosts.androidAvailable
                            }
                            className="shrink-0 text-muted-foreground"
                          />
                        }
                      >
                        {platform.platform === "ios" ? (
                          // The Apple mark is bottom-heavy; lift it so it does not dip under the label.
                          <AppleIcon className="size-3.5 -translate-y-px" />
                        ) : (
                          <AndroidIcon className="size-3.5" />
                        )}
                      </TooltipTrigger>
                      <TooltipPopup>
                        {platform.platform === "ios"
                          ? t.settings.deviceHosts.iOsAvailable
                          : t.settings.deviceHosts.androidAvailable}
                      </TooltipPopup>
                    </Tooltip>
                  ))}
              </div>
              <p className="truncate text-xs text-muted-foreground">{host.target}</p>
              <DeviceToolVersions
                owner={environmentLabel}
                error={state.hosts.find((value) => value.id === host.id)?.toolInspectionError}
                tools={
                  state.hosts.find((value) => value.id === host.id)?.tools ??
                  (check?.status === "connected" ? check.tools : undefined)
                }
              />
              {check?.status === "local" ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t.settings.deviceHosts.alreadyAvailableLocally}
                </p>
              ) : null}
              {error ? (
                <div className="mt-1" role="status">
                  <details className="text-xs text-destructive">
                    <summary>{t.settings.connections.status.failed}</summary>
                    <p className="mt-1 whitespace-pre-wrap break-words">{error}</p>
                  </details>
                </div>
              ) : null}
            </div>
            {progress ? (
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
                    size="icon-sm"
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
              </MenuPopup>
            </Menu>
            {status?.status === "failed" &&
            state.supportsHostRetry &&
            state.hostStatus !== "disabled" ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy || retrying !== null}
                onClick={() => {
                  setRetrying(host.id);
                  void retry({ environmentId, input: { retryHostId: host.id } }).finally(() =>
                    setRetrying(null),
                  );
                }}
              >
                {retrying === host.id
                  ? t.settings.connections.wsl.retrying
                  : t.settings.actions.retry}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={busy || progress !== null}
                onClick={() => void testConnection(host)}
              >
                {t.settings.deviceHosts.testConnection}
              </Button>
            )}
          </div>
        );
      })}
    </>
  );
}
