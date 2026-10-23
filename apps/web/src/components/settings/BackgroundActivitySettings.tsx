/** Edits the scoped background activity policy and its advanced intervals. */
import { t } from "~/i18n";
import { useScopedSettingsWriteAllowed } from "./useScopedSettings";
import { SettingsIcon } from "lucide-react";
import { useState } from "react";
import { type BackgroundActivityProfile } from "@t3tools/contracts";
import { DEFAULT_UNIFIED_SETTINGS } from "@t3tools/contracts/settings";
import { resolveServerBackgroundActivitySettings } from "@t3tools/shared/backgroundActivitySettings";
import * as Duration from "effect/Duration";
import * as Equal from "effect/Equal";
import {
  useScopedSettings,
  useScopedSettingsMixed,
  useUpdateScopedSettings,
} from "./useScopedSettings";
import { useSettingsScope } from "./SettingsScopeContext";
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
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from "../ui/number-field";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  backgroundActivityOverrideSettings,
  backgroundActivitySharedPolicySettings,
  durationToSeconds,
  normalizeIntervalSeconds,
  PROVIDER_HEALTH_INTERVAL_STEP_SECONDS,
  resolveBackgroundActivityProfileOption,
} from "./SettingsPanels.logic";
import { PolicyTooltip, SettingResetButton, SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

const BACKGROUND_ACTIVITY_PROFILE_LABELS: Record<BackgroundActivityProfile, string> = {
  balanced: t.settings.rows.backgroundActivity.options.balanced,
  performance: t.settings.rows.backgroundActivity.options.performance,
  "battery-saver": t.settings.rows.backgroundActivity.options["battery-saver"],
};

type BackgroundActivityProfileOption = BackgroundActivityProfile | "advanced";

const BACKGROUND_ACTIVITY_PROFILE_OPTION_LABELS = t.settings.rows.backgroundActivity.options;

const BACKGROUND_ACTIVITY_PROFILE_DESCRIPTIONS = t.settings.rows.backgroundActivity.descriptions;

const BACKGROUND_ACTIVITY_BOOLEAN_OVERRIDES: ReadonlyArray<{
  readonly key:
    | "pauseWhenHostLocked"
    | "pauseWhenHostLowPower"
    | "pauseWhenClientLowPower"
    | "pauseWhenOnBattery";
  readonly label: string;
}> = [
  { key: "pauseWhenHostLocked", label: t.settings.backgroundActivity.pauseWhenHostLocked },
  { key: "pauseWhenHostLowPower", label: t.settings.backgroundActivity.pauseWhenHostLowPower },
  { key: "pauseWhenClientLowPower", label: t.settings.backgroundActivity.pauseWhenClientLowPower },
  { key: "pauseWhenOnBattery", label: t.settings.backgroundActivity.pauseWhenOnBattery },
];

function resetBackgroundActivitySettings() {
  return {
    backgroundActivity: DEFAULT_UNIFIED_SETTINGS.backgroundActivity,
  };
}

function backgroundActivityProfileSettings(profile: BackgroundActivityProfile) {
  return {
    backgroundActivity: {
      schemaVersion: 1 as const,
      profile,
      overrides: {},
    },
  };
}

function BackgroundActivityAdvancedDialog({
  open,
  onOpenChange,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const canWriteSettings = useScopedSettingsWriteAllowed();
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const resolvedBackgroundActivity = resolveServerBackgroundActivitySettings(settings);
  const activeProfile = resolvedBackgroundActivity.profile;
  const automaticGitFetchIntervalSeconds = durationToSeconds(
    resolvedBackgroundActivity.automaticGitFetchInterval,
  );
  const providerHealthRefreshIntervalSeconds = durationToSeconds(
    resolvedBackgroundActivity.providerHealthRefreshInterval,
  );
  const hostPowerMonitorActiveIntervalSeconds = durationToSeconds(
    resolvedBackgroundActivity.hostPowerMonitorActiveInterval,
  );
  const hostPowerMonitorIdleIntervalSeconds = durationToSeconds(
    resolvedBackgroundActivity.hostPowerMonitorIdleInterval,
  );

  return (
    <Dialog open={open && canWriteSettings} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t.settings.backgroundActivity.title}</DialogTitle>
          <DialogDescription>{t.settings.backgroundActivity.description}</DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <fieldset
            disabled={!canWriteSettings}
            className="min-w-0 overflow-hidden rounded-xl border bg-card text-card-foreground"
          >
            <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="text-sm font-medium">
                  {t.settings.backgroundActivity.sharedPolicy.title}
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t.settings.backgroundActivity.sharedPolicy.description}
                </p>
              </div>
              <Select
                value={activeProfile}
                onValueChange={(value) => {
                  if (
                    value === "balanced" ||
                    value === "performance" ||
                    value === "battery-saver"
                  ) {
                    updateSettings({
                      backgroundActivity: backgroundActivitySharedPolicySettings(settings, value),
                    });
                  }
                }}
              >
                <SelectTrigger
                  size="sm"
                  className="w-full sm:w-40"
                  aria-label={t.settings.backgroundActivity.sharedPolicy.ariaLabel}
                >
                  <SelectValue>{BACKGROUND_ACTIVITY_PROFILE_LABELS[activeProfile]}</SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem hideIndicator value="balanced">
                    {BACKGROUND_ACTIVITY_PROFILE_LABELS.balanced}
                  </SelectItem>
                  <SelectItem hideIndicator value="performance">
                    {BACKGROUND_ACTIVITY_PROFILE_LABELS.performance}
                  </SelectItem>
                  <SelectItem hideIndicator value="battery-saver">
                    {BACKGROUND_ACTIVITY_PROFILE_LABELS["battery-saver"]}
                  </SelectItem>
                </SelectPopup>
              </Select>
            </div>

            <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="text-sm font-medium">
                  {searchableSetting("git-fetch-interval").title}
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t.settings.rows.gitFetchInterval.description}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <NumberField
                  value={automaticGitFetchIntervalSeconds}
                  min={0}
                  step={5}
                  size="sm"
                  className="w-32"
                  onValueChange={(value) =>
                    updateSettings(
                      backgroundActivityOverrideSettings(
                        settings.backgroundActivity,
                        resolvedBackgroundActivity,
                        {
                          automaticGitFetchInterval: Duration.seconds(
                            normalizeIntervalSeconds(value),
                          ),
                        },
                      ),
                    )
                  }
                >
                  <NumberFieldGroup>
                    <NumberFieldDecrement
                      aria-label={t.settings.rows.gitFetchInterval.decreaseAriaLabel}
                    />
                    <NumberFieldInput aria-label={t.settings.rows.gitFetchInterval.ariaLabel} />
                    <NumberFieldIncrement
                      aria-label={t.settings.rows.gitFetchInterval.increaseAriaLabel}
                    />
                  </NumberFieldGroup>
                </NumberField>
                <span className="text-xs text-muted-foreground">
                  {t.settings.backgroundActivity.seconds}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="text-sm font-medium">
                  {t.settings.backgroundActivity.providerHealth.title}
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t.settings.backgroundActivity.providerHealth.description}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <NumberField
                  value={providerHealthRefreshIntervalSeconds}
                  min={0}
                  step={PROVIDER_HEALTH_INTERVAL_STEP_SECONDS}
                  size="sm"
                  className="w-32"
                  onValueChange={(value) =>
                    updateSettings(
                      backgroundActivityOverrideSettings(
                        settings.backgroundActivity,
                        resolvedBackgroundActivity,
                        {
                          providerHealthRefreshInterval: Duration.seconds(
                            normalizeIntervalSeconds(value),
                          ),
                        },
                      ),
                    )
                  }
                >
                  <NumberFieldGroup>
                    <NumberFieldDecrement
                      aria-label={t.settings.backgroundActivity.providerHealth.decreaseAriaLabel}
                    />
                    <NumberFieldInput
                      aria-label={t.settings.backgroundActivity.providerHealth.ariaLabel}
                    />
                    <NumberFieldIncrement
                      aria-label={t.settings.backgroundActivity.providerHealth.increaseAriaLabel}
                    />
                  </NumberFieldGroup>
                </NumberField>
                <span className="text-xs text-muted-foreground">
                  {t.settings.backgroundActivity.seconds}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="text-sm font-medium">
                  {t.settings.backgroundActivity.activeHostPower.title}
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t.settings.backgroundActivity.activeHostPower.description}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <NumberField
                  value={hostPowerMonitorActiveIntervalSeconds}
                  min={5}
                  step={5}
                  size="sm"
                  className="w-32"
                  onValueChange={(value) =>
                    updateSettings(
                      backgroundActivityOverrideSettings(
                        settings.backgroundActivity,
                        resolvedBackgroundActivity,
                        {
                          hostPowerMonitorActiveInterval: Duration.seconds(
                            normalizeIntervalSeconds(value, 5),
                          ),
                        },
                      ),
                    )
                  }
                >
                  <NumberFieldGroup>
                    <NumberFieldDecrement
                      aria-label={t.settings.backgroundActivity.activeHostPower.decreaseAriaLabel}
                    />
                    <NumberFieldInput
                      aria-label={t.settings.backgroundActivity.activeHostPower.ariaLabel}
                    />
                    <NumberFieldIncrement
                      aria-label={t.settings.backgroundActivity.activeHostPower.increaseAriaLabel}
                    />
                  </NumberFieldGroup>
                </NumberField>
                <span className="text-xs text-muted-foreground">
                  {t.settings.backgroundActivity.seconds}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="text-sm font-medium">
                  {t.settings.backgroundActivity.idleHostPower.title}
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t.settings.backgroundActivity.idleHostPower.description}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <NumberField
                  value={hostPowerMonitorIdleIntervalSeconds}
                  min={5}
                  step={30}
                  size="sm"
                  className="w-32"
                  onValueChange={(value) =>
                    updateSettings(
                      backgroundActivityOverrideSettings(
                        settings.backgroundActivity,
                        resolvedBackgroundActivity,
                        {
                          hostPowerMonitorIdleInterval: Duration.seconds(
                            normalizeIntervalSeconds(value, 5),
                          ),
                        },
                      ),
                    )
                  }
                >
                  <NumberFieldGroup>
                    <NumberFieldDecrement
                      aria-label={t.settings.backgroundActivity.idleHostPower.decreaseAriaLabel}
                    />
                    <NumberFieldInput
                      aria-label={t.settings.backgroundActivity.idleHostPower.ariaLabel}
                    />
                    <NumberFieldIncrement
                      aria-label={t.settings.backgroundActivity.idleHostPower.increaseAriaLabel}
                    />
                  </NumberFieldGroup>
                </NumberField>
                <span className="text-xs text-muted-foreground">
                  {t.settings.backgroundActivity.seconds}
                </span>
              </div>
            </div>

            <div className="grid gap-0 border-t sm:grid-cols-2">
              {BACKGROUND_ACTIVITY_BOOLEAN_OVERRIDES.map(({ key, label }) => (
                <label
                  key={key}
                  className="flex items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0 sm:border-r sm:even:border-r-0"
                >
                  <span className="text-sm font-medium">{label}</span>
                  <Switch
                    checked={resolvedBackgroundActivity[key]}
                    onCheckedChange={(checked) =>
                      updateSettings(
                        backgroundActivityOverrideSettings(
                          settings.backgroundActivity,
                          resolvedBackgroundActivity,
                          {
                            [key]: Boolean(checked),
                          },
                        ),
                      )
                    }
                    aria-label={label}
                  />
                </label>
              ))}
            </div>
          </fieldset>
        </DialogPanel>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={!canWriteSettings}
            onClick={() => updateSettings(resetBackgroundActivitySettings())}
          >
            {t.settings.backgroundActivity.resetAll}
          </Button>
          <Button onClick={() => onOpenChange(false)}>{t.settings.actions.done}</Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

/** Keeps the background policy editor local to its setting row. */
export function BackgroundActivitySettingsRow() {
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const { scope, environment } = useSettingsScope();
  const environmentId = environment?.environmentId ?? null;
  const isEnvironmentScope = scope.environmentIds.length === 1 && environmentId !== null;
  const [backgroundActivityDialogOpen, setBackgroundActivityDialogOpen] = useState(false);
  const resolvedBackgroundActivity = resolveServerBackgroundActivitySettings(settings);
  const activeBackgroundActivityProfile = resolvedBackgroundActivity.profile;
  const backgroundActivityProfileOption = resolveBackgroundActivityProfileOption(settings);
  const mixedBackgroundActivity = useScopedSettingsMixed(["backgroundActivity"]);
  const backgroundActivityDescription =
    backgroundActivityProfileOption === "advanced"
      ? t.settings.rows.backgroundActivity.advancedDescription(
          BACKGROUND_ACTIVITY_PROFILE_OPTION_LABELS[activeBackgroundActivityProfile],
        )
      : BACKGROUND_ACTIVITY_PROFILE_DESCRIPTIONS[resolvedBackgroundActivity.profile];
  const canResetBackgroundActivity = !Equal.equals(
    settings.backgroundActivity,
    DEFAULT_UNIFIED_SETTINGS.backgroundActivity,
  );
  return (
    <SettingsRow
      serverScoped
      settingKeys={["backgroundActivity"]}
      id={searchableSetting("background-activity").id}
      title={
        <span className="inline-flex items-center gap-1.5">
          {searchableSetting("background-activity").title}
          <PolicyTooltip>{t.settings.rows.backgroundActivity.policyTooltip}</PolicyTooltip>
        </span>
      }
      description={backgroundActivityDescription}
      resetAction={
        canResetBackgroundActivity ? (
          <SettingResetButton
            label={t.settings.rows.backgroundActivity.resetLabel}
            onClick={() => updateSettings(resetBackgroundActivitySettings())}
          />
        ) : null
      }
      control={
        <>
          <Select
            value={mixedBackgroundActivity ? null : backgroundActivityProfileOption}
            onValueChange={(value) => {
              if (value === "advanced") {
                if (isEnvironmentScope) setBackgroundActivityDialogOpen(true);
                return;
              }
              if (value === "balanced" || value === "performance" || value === "battery-saver") {
                updateSettings(backgroundActivityProfileSettings(value));
              }
            }}
          >
            <SelectTrigger
              size="settings"
              aria-label={t.settings.rows.backgroundActivity.ariaLabel}
            >
              <SelectValue>
                {(value: BackgroundActivityProfileOption | null) =>
                  value === null
                    ? t.settings.general.mixed
                    : BACKGROUND_ACTIVITY_PROFILE_OPTION_LABELS[value]
                }
              </SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              <SelectItem hideIndicator value="balanced">
                {BACKGROUND_ACTIVITY_PROFILE_OPTION_LABELS.balanced}
              </SelectItem>
              <SelectItem hideIndicator value="performance">
                {BACKGROUND_ACTIVITY_PROFILE_OPTION_LABELS.performance}
              </SelectItem>
              <SelectItem hideIndicator value="battery-saver">
                {BACKGROUND_ACTIVITY_PROFILE_OPTION_LABELS["battery-saver"]}
              </SelectItem>
              <SelectItem hideIndicator value="advanced" disabled={!isEnvironmentScope}>
                {isEnvironmentScope
                  ? BACKGROUND_ACTIVITY_PROFILE_OPTION_LABELS.advanced
                  : t.settings.rows.backgroundActivity.advancedEnvironmentHint(
                      BACKGROUND_ACTIVITY_PROFILE_OPTION_LABELS.advanced,
                    )}
              </SelectItem>
            </SelectPopup>
          </Select>
          {backgroundActivityProfileOption === "advanced" && isEnvironmentScope ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="icon-sm"
                    variant="outline"
                    aria-label={t.settings.rows.backgroundActivity.configureAriaLabel}
                    onClick={() => setBackgroundActivityDialogOpen(true)}
                  >
                    <SettingsIcon className="size-4" />
                  </Button>
                }
              />
              <TooltipPopup side="top">
                {t.settings.rows.backgroundActivity.configureTooltip}
              </TooltipPopup>
            </Tooltip>
          ) : null}
          <BackgroundActivityAdvancedDialog
            open={backgroundActivityDialogOpen && isEnvironmentScope}
            onOpenChange={setBackgroundActivityDialogOpen}
          />
        </>
      }
    />
  );
}
