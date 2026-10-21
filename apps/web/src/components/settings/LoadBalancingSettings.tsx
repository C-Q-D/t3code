/** Presents client load balancing and per-environment preferences without changing their stored values. */
import { t } from "~/i18n";
import { resolveEnvironmentMachineKind } from "@t3tools/contracts";

import {
  useClientSettings,
  useClientSettingsHydrated,
  updateClientSettings,
} from "~/hooks/useSettings";
import type { EnvironmentPresentation } from "~/state/environments";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { EnvironmentRow, environmentTransportLabel } from "./EnvironmentRow";
import { SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

const preferences = [
  { value: 100, label: t.settings.loadBalancing.prefer },
  { value: 50, label: t.settings.loadBalancing.normal },
  { value: 25, label: t.settings.loadBalancing.lessOften },
  { value: 0, label: t.settings.loadBalancing.manualOnly },
];

type LoadPreference = (typeof preferences)[number]["value"];

function loadPreferenceForWeight(weight: number | undefined): LoadPreference {
  if (weight === undefined || weight === 50) return 50;
  if (weight === 0) return 0;
  return weight < 50 ? 25 : 100;
}

/** Returns the localized label for a normalized load preference. */
function preferenceLabel(preference: LoadPreference): string {
  return preferences.find((entry) => entry.value === preference)!.label;
}

/**
 * Summarizes machines whose weight differs from Normal in environment order.
 * Returns null when every machine uses the default preference.
 */
export function summarizeLoadPreferences(
  environments: ReadonlyArray<Pick<EnvironmentPresentation, "environmentId" | "label">>,
  weights: Readonly<Record<string, number>>,
): string | null {
  const parts = environments.flatMap((environment) => {
    const preference = loadPreferenceForWeight(weights[environment.environmentId]);
    return preference === 50
      ? []
      : [`${environment.label} ${preferenceLabel(preference).toLowerCase()}`];
  });
  return parts.length === 0 ? null : parts.join(" · ");
}

/**
 * Shows the P2 balancing row and its per-machine preferences inside the environment card.
 * environments contains enabled machines; fewer than two hides the row as before.
 * Controls retain hydration guards and write only the existing client settings.
 */
export function LoadBalancingSettings({
  environments,
}: {
  environments: ReadonlyArray<EnvironmentPresentation>;
}) {
  const settings = useClientSettings((current) => ({
    loadBalancingEnabled: current.loadBalancingEnabled,
    loadBalancingWeights: current.loadBalancingWeights,
  }));
  const settingsHydrated = useClientSettingsHydrated();

  if (environments.length < 2) return null;

  const { id, title } = searchableSetting("load-balancing");
  return (
    <SettingsRow
      id={id}
      title={title}
      status={
        settings.loadBalancingEnabled
          ? summarizeLoadPreferences(environments, settings.loadBalancingWeights)
          : t.settings.connections.status.off
      }
      control={
        <Select
          value={settings.loadBalancingEnabled ? "automatic" : "off"}
          disabled={!settingsHydrated}
          onValueChange={(value) => {
            if (value !== "automatic" && value !== "off") return;
            updateClientSettings({ loadBalancingEnabled: value === "automatic" });
          }}
        >
          <SelectTrigger
            size="settings"
            aria-label={t.settings.loadBalancing.automaticallyBalanceLoad}
          >
            <SelectValue>
              {settings.loadBalancingEnabled
                ? t.settings.connections.groups.automaticBalancing
                : t.settings.connections.status.off}
            </SelectValue>
          </SelectTrigger>
          <SelectPopup align="end" alignItemWithTrigger={false}>
            <SelectItem value="automatic">
              {t.settings.connections.groups.automaticBalancing}
            </SelectItem>
            <SelectItem value="off">{t.settings.connections.status.off}</SelectItem>
          </SelectPopup>
        </Select>
      }
    >
      <p className="text-secondary-copy-medium text-secondary-label">
        {t.settings.loadBalancing.threadsSharedProjectsStartMachineHint}
      </p>
      <div className="space-y-0.5">
        {environments.map((environment) => (
          <EnvironmentRow
            key={environment.environmentId}
            kind={resolveEnvironmentMachineKind(environment.serverConfig)}
            label={environment.label}
            subtitle={environmentTransportLabel(environment)}
          >
            <Select
              items={preferences}
              value={loadPreferenceForWeight(
                settings.loadBalancingWeights[environment.environmentId],
              )}
              disabled={!settingsHydrated || !settings.loadBalancingEnabled}
              onValueChange={(value) => {
                if (value === null) return;
                updateClientSettings({
                  loadBalancingWeights: {
                    ...settings.loadBalancingWeights,
                    [environment.environmentId]: value,
                  },
                });
              }}
            >
              <SelectTrigger
                size="settings"
                aria-label={t.settings.loadBalancing.loadPreference(environment.label)}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                {preferences.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </EnvironmentRow>
        ))}
      </div>
    </SettingsRow>
  );
}
