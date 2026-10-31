import { t } from "~/i18n";
import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import * as Cause from "effect/Cause";
import * as Option from "effect/Option";
import {
  AuthSettingsWriteScope,
  type DeviceEasAccount,
  type EasDeviceHostConfig,
  type EnvironmentId,
} from "@t3tools/contracts";
import { CloudIcon, PlusIcon, XIcon } from "lucide-react";

import { randomUUID } from "../../lib/utils";
import { deviceEnvironment } from "../../state/device";
import { serverEnvironment } from "../../state/server";
import { readEnvironmentScope, useEnvironmentScope } from "../../state/session";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Spinner } from "../ui/spinner";
import { toastManager } from "../ui/toast";
import {
  easSessionLimits,
  newEasDeviceHost,
  parseEasDeviceHostDraft,
  updateEasDeviceHosts,
} from "./easDeviceHostsSettings.logic";
import { SecretInput } from "./SecretInput";
import { useSettingsScope } from "./SettingsScopeContext";
import { SettingsRow } from "./settingsLayout";

const FROM_THREAD_PROJECT = "thread-project";

/** Reads the current dictionary on each call so labels follow language changes. */
const credentialSources = (): Record<DeviceEasAccount["credentialSource"], string> => ({
  settings: t.settings.easHostsUi.savedToken,
  env: t.settings.easHostsUi.environmentToken,
  "eas-login": t.settings.easHostsUi.serverLogin,
});

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

function EasDeviceHostEditor(props: {
  environmentId: EnvironmentId;
  host: EasDeviceHostConfig;
  isNew: boolean;
  busy: boolean;
  onSave: (host: EasDeviceHostConfig) => void;
  onClose: () => void;
}) {
  const check = useAtomCommand(deviceEnvironment.easAccount, { reportFailure: false });
  const [draft, setDraft] = useState(props.host);
  const tokenId = useId();
  // A saved token arrives redacted; only a replacement or a clear changes it.
  const [token, setToken] = useState<
    { kind: "saved" } | { kind: "new"; value: string } | { kind: "cleared" }
  >(props.host.accessToken ? { kind: "saved" } : { kind: "cleared" });
  const [account, setAccount] = useState<
    | { status: "idle" }
    | { status: "checking" }
    | { status: "signed-in"; account: DeviceEasAccount }
    | { status: "failed"; error: string }
    // The editor checks the account as it opens.
  >({ status: "checking" });
  const next: EasDeviceHostConfig = {
    ...draft,
    label: draft.label.trim(),
    accessToken:
      token.kind === "saved" ? props.host.accessToken : token.kind === "new" ? token.value : "",
  };
  const valid = Option.isSome(parseEasDeviceHostDraft(next));
  // Why Save is off, for the limits the fields' ranges do not show.
  const problem = valid
    ? null
    : draft.maxSessionMinutes > 0 && draft.idleMinutes >= draft.maxSessionMinutes
      ? t.settings.easHostsUi.idleInvalid
      : t.settings.easHostsUi.limitsInvalid;
  const apps = account.status === "signed-in" ? account.account.apps : [];

  // A check answers for the credential it was asked about: a later check or a
  // token edit makes an earlier answer stale.
  const latestCheck = useRef(0);
  const resetAccount = () => {
    latestCheck.current++;
    setAccount({ status: "idle" });
  };
  const requestCheck = async () => {
    const run = ++latestCheck.current;
    const result = await check({
      environmentId: props.environmentId,
      input: {
        ...(token.kind === "saved" && !props.isNew ? { hostId: props.host.id } : {}),
        // A cleared token is sent as empty, so the check does not fall back to
        // the saved one that Save is about to drop.
        ...(token.kind === "new"
          ? { accessToken: token.value }
          : token.kind === "cleared"
            ? { accessToken: "" }
            : {}),
      },
    });
    if (run !== latestCheck.current) return;
    setAccount(
      result._tag === "Success"
        ? { status: "signed-in", account: result.value }
        : { status: "failed", error: failureMessage(result.cause) },
    );
  };
  const checkAccount = () => {
    setAccount({ status: "checking" });
    void requestCheck();
  };

  // Checking on open names the saved project and shows a rejected credential
  // before anything is changed.
  const checkOnOpen = useEffectEvent(() => void requestCheck());
  useEffect(() => {
    checkOnOpen();
  }, []);

  const limit = (
    field: "maxSessionMinutes" | "idleMinutes" | "maxConcurrentSessions",
    label: string,
    max: number,
  ) => (
    <label className="block space-y-1.5">
      <span>{label}</span>
      <Input
        type="number"
        min={1}
        max={max}
        value={draft[field]}
        disabled={props.busy}
        onChange={(event) => {
          const value = Number(event.target.value);
          setDraft((current) => ({ ...current, [field]: value }));
        }}
      />
    </label>
  );

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !props.busy) props.onClose();
      }}
    >
      <DialogPopup showCloseButton={!props.busy}>
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid && !props.busy) props.onSave(next);
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {props.isNew ? t.settings.easHostsUi.add : t.settings.easHostsUi.editHost}
            </DialogTitle>
            <DialogDescription>{t.settings.easHostsUi.credentialsHint}</DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <label className="block space-y-1.5 text-sm">
              <span>{t.settings.easHostsUi.name}</span>
              <Input
                autoFocus
                required
                value={draft.label}
                disabled={props.busy}
                onChange={(event) => {
                  const label = event.target.value;
                  setDraft((current) => ({ ...current, label }));
                }}
              />
            </label>
            <div className="space-y-1.5 text-sm">
              <label htmlFor={tokenId} className="block">
                {t.settings.easHostsUi.token}
              </label>
              <div className="flex items-center gap-2">
                <SecretInput
                  id={tokenId}
                  className="min-w-0 flex-1"
                  configured={token.kind === "saved"}
                  value={token.kind === "new" ? token.value : ""}
                  disabled={props.busy}
                  placeholder={t.settings.easHostsUi.optional}
                  onChange={(event) => {
                    const value = event.target.value;
                    // Emptying the field is not clearing the saved token; the
                    // Clear button is, so a saved token comes back here.
                    setToken(
                      value
                        ? { kind: "new", value }
                        : props.host.accessToken
                          ? { kind: "saved" }
                          : { kind: "cleared" },
                    );
                    resetAccount();
                  }}
                />
                {token.kind !== "cleared" ? (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost-destructive"
                    aria-label={t.settings.easHostsUi.clearToken}
                    onClick={() => {
                      setToken({ kind: "cleared" });
                      resetAccount();
                    }}
                  >
                    <XIcon className="size-3.5" />
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2.5">
              <p role="status" className="min-w-0 text-xs text-muted-foreground">
                {account.status === "signed-in"
                  ? t.settings.easAccountText.signedIn(
                      account.account.signedInAs,
                      credentialSources()[account.account.credentialSource],
                    )
                  : account.status === "failed"
                    ? account.error
                    : account.status === "checking"
                      ? t.settings.easHostsUi.checking
                      : t.settings.easHostsUi.checkFirst}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={props.busy || account.status === "checking"}
                onClick={() => void checkAccount()}
              >
                {account.status === "checking" ? <Spinner size="xs" /> : null}{" "}
                {t.settings.easHostsUi.checkAccount}
              </Button>
            </div>
            <div className="space-y-1.5 text-sm">
              <span>{t.settings.easHostsUi.project}</span>
              <Select
                value={draft.appId ?? FROM_THREAD_PROJECT}
                disabled={props.busy}
                onValueChange={(value) => {
                  if (typeof value !== "string") return;
                  setDraft((current) => {
                    const { appId: _, ...rest } = current;
                    return value === FROM_THREAD_PROJECT ? rest : { ...rest, appId: value };
                  });
                }}
              >
                <SelectTrigger size="sm" aria-label={t.settings.easHostsUi.project}>
                  <SelectValue>
                    {(value: string) =>
                      value === FROM_THREAD_PROJECT
                        ? t.settings.easHostsUi.threadProject
                        : (apps.find((app) => app.id === value)?.fullName ?? value)
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  <SelectItem value={FROM_THREAD_PROJECT}>
                    {t.settings.easHostsUi.threadProject}
                  </SelectItem>
                  {draft.appId && !apps.some((app) => app.id === draft.appId) ? (
                    <SelectItem value={draft.appId}>{draft.appId}</SelectItem>
                  ) : null}
                  {apps.map((app) => (
                    <SelectItem key={app.id} value={app.id}>
                      {app.fullName}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
              <p className="text-xs text-muted-foreground">{t.settings.easHostsUi.billingHint}</p>
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              {limit("maxConcurrentSessions", t.settings.easHostsUi.concurrent, 20)}
              {limit("maxSessionMinutes", t.settings.easHostsUi.sessionMinutes, 115)}
              {limit("idleMinutes", t.settings.easHostsUi.idleMinutes, 60)}
            </div>
            <p className="text-xs text-muted-foreground">
              {t.settings.easHostsUi.durationHint}
              {props.isNew ? null : t.settings.easHostsUi.restartHint}
            </p>
            {problem === null ? null : (
              <p className="text-xs text-destructive" role="alert">
                {problem}
              </p>
            )}
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={props.busy} onClick={props.onClose}>
              {t.settings.actions.cancel}
            </Button>
            <Button type="submit" disabled={props.busy || !valid}>
              {props.busy ? <Spinner size="xs" /> : null} {t.settings.easHostsUi.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
