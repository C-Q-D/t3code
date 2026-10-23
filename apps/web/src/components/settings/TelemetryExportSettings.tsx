/** Configures and checks environment-scoped OTLP export endpoints. */
import { t } from "~/i18n";
import { useAtomValue } from "@effect/atom-react";
import type { OtlpEndpointCheckResult, OtlpSignal, ServerObservability } from "@t3tools/contracts";
import { useEffect, useEffectEvent, useState } from "react";

import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { ConnectionStatusDot } from "../ConnectionStatusDot";
import { useSettingsScope } from "./SettingsScopeContext";
import { useScopedSettings } from "./useScopedSettings";
import { SettingsSection } from "./settingsLayout";
import { SettingsScopeNotice } from "./SettingsScopeNotice";

const SIGNALS = [
  {
    key: "otlpTracesUrl",
    sourceKey: "otlpTracesSource",
    variableKey: "otlpTracesVariable",
    signal: "traces",
  },
  {
    key: "otlpMetricsUrl",
    sourceKey: "otlpMetricsSource",
    variableKey: "otlpMetricsVariable",
    signal: "metrics",
  },
  {
    key: "otlpLogsUrl",
    sourceKey: "otlpLogsSource",
    variableKey: "otlpLogsVariable",
    signal: "logs",
  },
] as const;

type SignalDescriptor = (typeof SIGNALS)[number];
type SignalKey = SignalDescriptor["key"];

const OVERRIDE_LABELS = t.settings.telemetryOverrides;

/** Reports environment or desktop overrides without replacing the saved editable endpoint. */
function runningOverride(
  running: ServerObservability | undefined,
  { key, sourceKey, variableKey }: SignalDescriptor,
) {
  const url = running?.[key];
  const source = running?.[sourceKey];
  if (url === undefined || (source !== "environment" && source !== "bootstrap")) return undefined;
  return { url, label: OVERRIDE_LABELS[source], variable: running?.[variableKey] };
}

type EndpointCheck = { readonly url: string; readonly result: OtlpEndpointCheckResult | null };

/** Checks the existing HTTP endpoint eligibility rule before sending a connectivity request. */
const isHttpUrl = (url: string) => /^https?:\/\/./i.test(url);

/** Returns the current endpoint check label and indicator color. */
function endpointStatus(url: string, check: EndpointCheck | undefined) {
  if (url === "") return { label: t.settings.merge.telemetryOff, dot: "bg-muted-foreground/40" };
  if (check?.url !== url)
    return { label: t.settings.merge.telemetryUnchecked, dot: "bg-muted-foreground/40" };
  const { result } = check;
  if (result === null) return { label: t.settings.merge.telemetryChecking, dot: "bg-warning" };
  switch (result._tag) {
    case "Accepted":
      return {
        label: t.settings.merge.telemetryConnected(Math.round(result.latencyMs)),
        dot: "bg-success",
      };
    case "Rejected":
      return { label: t.settings.merge.telemetryRejected(result.status), dot: "bg-destructive" };
    case "Unreachable":
      return {
        label: result.timedOut
          ? t.settings.merge.telemetryTimeout
          : t.settings.merge.telemetryUnreachable,
        dot: "bg-destructive",
      };
  }
}

/** Selects a single environment before showing its export editor. */
export function TelemetryExportSettings() {
  const { environment, scope } = useSettingsScope();
  if (scope.kind !== "environment" || !environment) {
    return (
      <SettingsSection title={t.settings.merge.telemetryTitle} id="telemetry-export">
        <SettingsScopeNotice target="environment">
          {t.settings.merge.telemetryChooseEnvironment}
        </SettingsScopeNotice>
      </SettingsSection>
    );
  }
  return <TelemetryExportForm key={environment.environmentId} />;
}

/** Edits saved endpoints and reports independent connectivity checks. */
function TelemetryExportForm() {
  const { environment } = useSettingsScope();
  const saved = useScopedSettings((settings) => settings.observability);
  const [draft, setDraft] = useState<Partial<typeof saved>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const environmentId = environment?.environmentId;
  const canEdit = useAtomValue(
    serverEnvironment.checkOtlpEndpoint.permissionAtom(environmentId ?? null),
  );
  const canCheck =
    canEdit && environment?.serverConfig?.environment.capabilities.otlpEndpointCheck === true;
  const running = environment?.serverConfig?.observability;
  const [checks, setChecks] = useState<Partial<Record<SignalKey, EndpointCheck>>>(() =>
    Object.fromEntries(
      SIGNALS.flatMap((descriptor) => {
        const url = runningOverride(running, descriptor)?.url ?? saved[descriptor.key];
        return isHttpUrl(url) ? [[descriptor.key, { url, result: null }]] : [];
      }),
    ),
  );
  const updateSettings = useAtomCommand(serverEnvironment.updateSettings, { reportFailure: true });
  const checkOtlpEndpoint = useAtomCommand(serverEnvironment.checkOtlpEndpoint);
  const values = { ...saved, ...draft };
  const changedSignals = SIGNALS.filter(({ key }) => values[key].trim() !== saved[key]);
  const changed = changedSignals.length > 0;

  const sendCheck = async (key: SignalKey, signal: OtlpSignal, url: string) => {
    if (!environmentId) return;
    const response = await checkOtlpEndpoint({ environmentId, input: { signal, url } });
    setChecks((previous) => {
      if (previous[key]?.url !== url || previous[key].result !== null) return previous;
      const next = { ...previous };
      if (response._tag === "Success") next[key] = { url, result: response.value };
      else delete next[key];
      return next;
    });
  };

  const checkEndpoint = (key: SignalKey, signal: OtlpSignal, url: string) => {
    if (!isHttpUrl(url)) return;
    setChecks((previous) => ({ ...previous, [key]: { url, result: null } }));
    void sendCheck(key, signal, url);
  };

  const sendPendingChecks = useEffectEvent(() => {
    for (const { key, signal } of SIGNALS) {
      const check = checks[key];
      if (check?.result === null) void sendCheck(key, signal, check.url);
    }
  });
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- State changes only after the response arrives.
    if (canCheck) sendPendingChecks();
  }, [canCheck]);

  return (
    <SettingsSection title={t.settings.merge.telemetryTitle} id="telemetry-export">
      <form
        className="diagnostics-export-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!environment || saving) return;
          setSaving(true);
          setMessage(null);
          const result = await updateSettings({
            environmentId: environment.environmentId,
            input: {
              patch: {
                observability: Object.fromEntries(
                  changedSignals.map(({ key }) => [key, values[key]]),
                ),
              },
            },
          });
          setSaving(false);
          if (result._tag === "Success") {
            setDraft({});
            setMessage(t.settings.merge.telemetrySaved);
          }
        }}
      >
        <p className="text-secondary-copy text-muted-foreground">
          {t.settings.merge.telemetryDescription}
        </p>
        {!canEdit && (
          <p className="text-secondary-copy text-muted-foreground">
            {t.settings.merge.telemetryNoPermission(
              environment?.label ?? t.settings.merge.telemetrySelectedEnvironment,
            )}
          </p>
        )}
        {SIGNALS.map((descriptor) => {
          const { key, signal } = descriptor;
          const override = runningOverride(running, descriptor);
          const url = override?.url ?? values[key].trim();
          const check = canCheck ? endpointStatus(url, checks[key]) : null;
          const status = override
            ? {
                label: check ? `${override.label} · ${check.label}` : override.label,
                dot: check?.dot ?? "bg-muted-foreground/40",
              }
            : check;
          return (
            <div key={key} className="diagnostics-export-row">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5">
                  {status && <ConnectionStatusDot dotClassName={status.dot} />}
                  <Label htmlFor={key}>
                    {t.settings.merge.telemetryEndpoint(
                      signal === "traces"
                        ? t.settings.merge.telemetryTraces
                        : signal === "metrics"
                          ? t.settings.merge.telemetryMetrics
                          : t.settings.merge.telemetryLogs,
                    )}
                  </Label>
                </div>
                {status && (
                  <span className="text-secondary-copy text-muted-foreground">{status.label}</span>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  id={key}
                  size="settings"
                  type="url"
                  pattern="[Hh][Tt][Tt][Pp][Ss]?://.*"
                  title={t.settings.merge.telemetryEndpointHint}
                  placeholder={`http://localhost:4318/v1/${signal}`}
                  value={values[key]}
                  disabled={saving || !canEdit}
                  onChange={(event) => {
                    const value = event.target.value;
                    // Restoring the saved value drops the draft, so a later save can't resend it
                    // over another client's change.
                    setDraft((previous) => {
                      const next = { ...previous, [key]: value };
                      if (value.trim() === saved[key]) delete next[key];
                      return next;
                    });
                    setMessage(null);
                  }}
                />
                {canCheck && (
                  <Button
                    type="button"
                    size="md"
                    variant="outline"
                    disabled={!isHttpUrl(url) || checks[key]?.result === null}
                    onClick={() => void checkEndpoint(key, signal, url)}
                  >
                    {t.settings.merge.telemetryTest}
                  </Button>
                )}
              </div>
              {(saved[key] !== (running?.[key] ?? "") || override?.variable) && (
                <p className="break-all text-secondary-copy text-muted-foreground">
                  {t.settings.merge.telemetryRunning(
                    running?.[key] || t.settings.merge.telemetryDisabled,
                  )}
                  {override?.variable && (
                    <>
                      {" "}
                      from <code className="font-mono">{override.variable}</code>
                    </>
                  )}
                </p>
              )}
            </div>
          );
        })}
        <div className="flex items-center justify-between gap-3">
          <p role="status" className="text-secondary-copy text-muted-foreground">
            {message}
          </p>
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              size="md"
              variant="outline"
              disabled={!changed || saving || !canEdit}
              onClick={() => {
                setDraft({});
                setMessage(null);
                if (!canCheck) return;
                for (const descriptor of SIGNALS) {
                  const { key, signal } = descriptor;
                  if (runningOverride(running, descriptor)) continue;
                  if (checks[key]?.url !== saved[key]) checkEndpoint(key, signal, saved[key]);
                }
              }}
            >
              {t.settings.merge.telemetryDiscard}
            </Button>
            <Button type="submit" size="md" disabled={!changed || saving || !canEdit}>
              {saving ? t.settings.merge.telemetrySaving : t.settings.merge.telemetrySave}
            </Button>
          </div>
        </div>
      </form>
    </SettingsSection>
  );
}
