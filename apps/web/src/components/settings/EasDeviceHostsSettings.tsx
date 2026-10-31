/** Keeps the local EAS host list separate from device-source integrations that this fork does not expose. */
import { t } from "~/i18n";
import { useState } from "react";
import * as Cause from "effect/Cause";
import {
  AuthSettingsWriteScope,
  type EasDeviceHostConfig,
  type EnvironmentId,
} from "@t3tools/contracts";
import { CloudIcon, PlusIcon } from "lucide-react";
import { randomUUID } from "../../lib/utils";
import { serverEnvironment } from "../../state/server";
import { readEnvironmentScope, useEnvironmentScope } from "../../state/session";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";
import {
  easSessionLimits,
  newEasDeviceHost,
  updateEasDeviceHosts,
} from "./easDeviceHostsSettings.logic";
import { EasDeviceHostEditor } from "./EasDeviceHostEditor";
import { useSettingsScope } from "./SettingsScopeContext";
import { SettingsRow } from "./settingsLayout";

/** Surfaces the server cause without losing non-Error failures. */
const failureMessage = (cause: Cause.Cause<unknown>) => {
  const error = Cause.squash(cause);
  return error instanceof Error ? error.message : String(error);
};

/** EAS hosts belong to one environment: its server holds the Expo credential and runs the sessions. */
export function EasDeviceHostsSettings(props: { environmentId: EnvironmentId | null }) {
  const { scope, connectedEnvironments } = useSettingsScope();
  const canConfigure = useEnvironmentScope(props.environmentId, AuthSettingsWriteScope);
  const projectScope = scope.kind === "project" || scope.kind === "checkout";
  const update = useAtomCommand(serverEnvironment.updateSettings, { reportFailure: false });
  const environment = connectedEnvironments.find(
    (candidate) => candidate.environmentId === props.environmentId,
  );
  const hosts = environment?.serverConfig?.settings.easDeviceHosts ?? [];
  const [editing, setEditing] = useState<{ host: EasDeviceHostConfig; isNew: boolean } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const disabled = !canConfigure || projectScope || busy || !props.environmentId;

  const save = async (host: EasDeviceHostConfig, remove: boolean) => {
    if (!props.environmentId || !readEnvironmentScope(props.environmentId, AuthSettingsWriteScope))
      return;
    setBusy(true);
    const result = await update({
      environmentId: props.environmentId,
      input: { patch: { easDeviceHosts: updateEasDeviceHosts(hosts, host, remove) } },
    });
    setBusy(false);
    if (result._tag === "Success") setEditing(null);
    else
      toastManager.add({
        type: "error",
        title: remove ? t.settings.easHostsUi.removeFailed : t.settings.easHostsUi.saveFailed,
        description: failureMessage(result.cause),
      });
  };

  return (
    <SettingsRow
      id="eas-device-hosts"
      title={t.settings.easHostsUi.title}
      serverScoped
      settingKeys={["easDeviceHosts"]}
      description={t.settings.easHostsUi.description}
      control={
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || editing !== null}
          onClick={() => setEditing({ host: newEasDeviceHost(randomUUID()), isNew: true })}
        >
          <PlusIcon className="size-3.5" /> {t.settings.easHostsUi.add}
        </Button>
      }
    >
      <div className="pt-3 pb-2">
        {hosts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.settings.easHostsUi.empty}</p>
        ) : (
          <ul className="divide-y divide-border/40">
            {hosts.map((host) => (
              <li key={host.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate font-medium">
                    <CloudIcon className="size-3.5 shrink-0" /> {host.label}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{easSessionLimits(host)}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={disabled}
                    onClick={() => setEditing({ host, isNew: false })}
                  >
                    {t.settings.actions.edit}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost-destructive"
                    disabled={disabled}
                    onClick={() => void save(host, true)}
                  >
                    {t.settings.deviceHosts.remove}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {editing && props.environmentId ? (
          <EasDeviceHostEditor
            key={editing.host.id}
            environmentId={props.environmentId}
            host={editing.host}
            isNew={editing.isNew}
            busy={busy}
            onSave={(host) => void save(host, false)}
            onClose={() => setEditing(null)}
          />
        ) : null}
      </div>
    </SettingsRow>
  );
}
