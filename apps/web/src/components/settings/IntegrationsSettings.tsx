/**
 * Integrations settings compose scoped agent access and device management with
 * device-local browser defaults. Preview defaults apply to manually opened tabs
 * and agent preview_open calls that do not supply their own values.
 */
import { t } from "~/i18n";
import { DeviceHostUpdates } from "../device/DeviceHostUpdates";
import { DeviceToolVersions } from "../device/DeviceToolVersions";
import { useScopedSettings, useUpdateScopedSettings } from "./useScopedSettings";
import { ScopedSwitch } from "./ScopedSwitch";
import { ProjectDefaultsSettings } from "./ProjectDefaultsSettings";
import { DeviceHostsSettings } from "./DeviceHostsSettings";
import { EasDeviceHostsSettings } from "./EasDeviceHostsSettings";
import {
  AuthSettingsWriteScope,
  BrowserImportFailureReason,
  BROWSER_PROFILE_MAX_COUNT,
  type BrowserLinkTarget,
  type BrowserProfile,
  BrowserSearchEngine,
  BROWSER_CUSTOM_SEARCH_URL_MAX_LENGTH,
  type EnvironmentId,
  BROWSER_PROFILE_NAME_MAX_LENGTH,
  BROWSER_RECORDING_FRAME_RATES,
  DEFAULT_BROWSER_AUTO_SHOW_FLOATING_PREVIEW,
  DEFAULT_BROWSER_PROFILE_ID,
  DEFAULT_BROWSER_LINK_TARGET,
  DEFAULT_BROWSER_RECORDING_FRAME_RATE,
  DEFAULT_BROWSER_SEARCH_ENGINE,
  DEFAULT_BROWSER_VIEWPORT,
  DEFAULT_PREVIEW_APPEARANCE,
  DEFAULT_PREVIEW_ZOOM_FACTOR,
  FILL_PREVIEW_VIEWPORT,
  PREVIEW_VIEWPORT_MAX_AREA,
  PREVIEW_VIEWPORT_MAX_DIMENSION,
  PREVIEW_VIEWPORT_MIN_DIMENSION,
  PREVIEW_ZOOM_LEVELS,
  findBrowserProfile,
  isBuiltInBrowserProfileId,
  resolveBrowserProfiles,
  type BrowserImportSource,
  type PreviewAppearancePreference,
  type PreviewViewportSetting,
} from "@t3tools/contracts";
import { isValidSearchUrlTemplate } from "@t3tools/shared/preview";
import { PREVIEW_VIEWPORT_PRESETS } from "@t3tools/shared/previewViewport";
import { MoreVertical, Plus as PlusIcon } from "lucide-react";
import { useRef, useState } from "react";

import { ScreenRotationIcon } from "~/browser/ScreenRotationIcon";
import { AnimatedHeight } from "~/components/AnimatedHeight";
import { resolveEnvironmentOptionLabel } from "~/components/BranchToolbar.logic";
import { previewBridge } from "~/components/preview/previewBridge";
import { cn, randomUUID } from "~/lib/utils";
import { useEnvironments, usePrimaryEnvironment } from "~/state/environments";
import { deviceEnvironment, useDeviceState } from "~/state/device";
import { readEnvironmentScope, useEnvironmentScope } from "~/state/session";
import { useAtomCommand } from "~/state/use-atom-command";
import { formatEnvironmentQueryError } from "~/state/query";
import { previewEnvironment } from "~/state/preview";
import { useServerConfigs } from "~/state/entities";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import {
  AgentDeviceSetupStatus,
  DeviceHubSetupStatus,
  deviceHubReadiness,
  PlatformStatus,
  platformSetupStatus,
  DeviceHostDiagnostics,
} from "~/components/device/DeviceSetup";
import { isElectron } from "../../env";

import { Badge } from "../ui/badge";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "../ui/menu";
import { readLocalApi } from "~/localApi";

import { toastManager } from "../ui/toast";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import { DraftInput } from "../ui/draft-input";
import { NumberField, NumberFieldGroup, NumberFieldInput } from "../ui/number-field";
import {
  Select,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Switch } from "../ui/switch";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  getClientSettings,
  persistClientSettingsUpdate,
  useClientSettings,
  useClientSettingsHydrated,
  useUpdatePrimarySettings,
} from "~/hooks/useSettings";

import {
  SettingsUnavailableGroup,
  SettingResetButton,
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";
import { useSettingsScope } from "./SettingsScopeContext";
import { BrowserImportWizard, type WizardTarget } from "./BrowserImportWizard";
import type { ImportOutcome } from "./browserImportWizard.logic";

const FILL_VALUE = "fill";
const RESPONSIVE_VALUE = "responsive";

type BrowserProfileDataBridge = Pick<
  NonNullable<typeof previewBridge>,
  "clearCookies" | "clearCache"
>;

export interface ServerProfileData {
  readonly environmentIds: ReadonlyArray<EnvironmentId>;
  readonly clear: (environmentId: EnvironmentId, profileId: string) => Promise<void>;
}

export async function clearBrowserProfileData(
  bridge: BrowserProfileDataBridge | null,
  environmentIds: ReadonlyArray<EnvironmentId>,
  profileId: string,
  server?: ServerProfileData,
): Promise<void> {
  const desktopEnvironmentIds = bridge === null ? [] : environmentIds;
  const serverEnvironmentIds = server?.environmentIds ?? [];
  if (desktopEnvironmentIds.length === 0 && serverEnvironmentIds.length === 0) {
    throw new Error(t.settings.integrations.profiles.clearUnavailableError);
  }
  await Promise.all([
    ...desktopEnvironmentIds.flatMap((environmentId) => [
      bridge!.clearCookies(environmentId, profileId),
      bridge!.clearCache(environmentId, profileId),
    ]),
    ...serverEnvironmentIds.map((environmentId) => server!.clear(environmentId, profileId)),
  ]);
}

function browserProfileRemovalAvailable(
  bridgeAvailable: boolean,
  environmentsReady: boolean,
  environmentCount: number,
  serverBrowserCount = 0,
): boolean {
  return (bridgeAvailable || serverBrowserCount > 0) && environmentsReady && environmentCount > 0;
}

const RESPONSIVE_SEED_SIZE = { width: 1280, height: 800 } as const;

const NO_GROUPING: Intl.NumberFormatOptions = { useGrouping: false };

const APPEARANCE_LABELS: Readonly<Record<PreviewAppearancePreference, string>> = {
  system: t.settings.rows.browserDefaultAppearance.options.system,
  light: t.settings.rows.browserDefaultAppearance.options.light,
  dark: t.settings.rows.browserDefaultAppearance.options.dark,
};

const zoomLabel = (zoomFactor: number) => `${Math.round(zoomFactor * 100)}%`;

/**
 * IPC flattens the failure to its message, so the reason token travels inside
 * it. Anything unrecognised reads as a plain read failure rather than leaking
 * the raw message into a toast.
 */
class ProfileLimitReachedError extends Error {
  constructor() {
    super(t.settings.integrations.profiles.limitError);
    this.name = "ProfileLimitReachedError";
  }
}

export const importFailureReason = (cause: unknown): BrowserImportFailureReason => {
  const message = String((cause as { message?: unknown } | undefined)?.message ?? "");
  return (
    BrowserImportFailureReason.literals.find((reason) => message.includes(`failed: ${reason}.`)) ??
    "readFailed"
  );
};

async function importBrowserCookiesIntoTarget(
  bridge: NonNullable<typeof previewBridge>,
  source: BrowserImportSource,
  environmentId: EnvironmentId,
  input: { readonly sourceProfileDirectory: string; readonly target: WizardTarget },
): Promise<ImportOutcome> {
  try {
    const result = await bridge.importBrowserCookies({
      environmentId,
      sourceId: source.id,
      sourceProfileDirectory: input.sourceProfileDirectory,
      targetProfileId: input.target.profileId,
    });
    if (
      input.target.kind === "existing" &&
      !resolveBrowserProfiles(getClientSettings().browserProfiles).some(
        (profile) => profile.id === input.target.profileId,
      )
    ) {
      return { kind: "blocked", reason: "readFailed" };
    }
    let targetName: string;
    if (input.target.kind === "new") {
      if (result.imported > 0) {
        try {
          const persisted = await persistClientSettingsUpdate((current) => {
            const existing = current.browserProfiles.find(
              (profile) => profile.id === input.target.profileId,
            );
            if (existing) return current;
            // The wizard refuses a new target at the cap, but the cap can be
            // reached while the import runs; the updater sees the newest
            // settings, so this is the check that holds.
            if (current.browserProfiles.length >= BROWSER_PROFILE_MAX_COUNT) {
              throw new ProfileLimitReachedError();
            }
            const taken = new Set(
              resolveBrowserProfiles(current.browserProfiles).map((profile) => profile.name),
            );
            let name = source.name;
            for (let index = 2; taken.has(name); index += 1) name = `${source.name} ${index}`;
            return {
              ...current,
              browserProfiles: [
                ...current.browserProfiles,
                { id: input.target.profileId, name, kind: "persistent" as const },
              ],
            };
          });
          targetName =
            persisted.browserProfiles.find((profile) => profile.id === input.target.profileId)
              ?.name ?? source.name;
        } catch (cause) {
          // This target id belongs only to the attempted new profile. Clear
          // its partition so a failed registration cannot strand imported
          // cookies behind a profile that disappears on restart.
          await clearBrowserProfileData(bridge, [environmentId], input.target.profileId).catch(
            () => undefined,
          );
          const reason =
            cause instanceof ProfileLimitReachedError ? "profileLimitReached" : "profileNotSaved";
          throw new Error(`Importing cookies from ${source.id} failed: ${reason}.`, { cause });
        }
      } else {
        targetName = source.name;
      }
    } else {
      targetName = input.target.name;
    }
    return {
      kind: "imported",
      imported: result.imported,
      skipped: result.skipped,
      skippedDomains: result.skippedDomains,
      targetName,
    };
  } catch (cause) {
    return { kind: "blocked", reason: importFailureReason(cause) };
  }
}

const viewportSelectValue = (viewport: PreviewViewportSetting): string => {
  if (viewport._tag === "fill") return FILL_VALUE;
  if (
    viewport._tag === "preset" &&
    PREVIEW_VIEWPORT_PRESETS.some((preset) => preset.id === viewport.presetId)
  ) {
    return viewport.presetId;
  }
  return RESPONSIVE_VALUE;
};

/**
 * The trigger renders this rather than a bare `SelectValue`, which would fall
 * back to printing the raw stored value ("fill") because the options are built
 * inline instead of from an `items` map.
 */
const viewportSelectLabel = (viewport: PreviewViewportSetting): string => {
  const value = viewportSelectValue(viewport);
  if (value === FILL_VALUE) return t.settings.rows.browserDefaultViewport.options.fill;
  if (value === RESPONSIVE_VALUE) return t.settings.rows.browserDefaultViewport.options.responsive;
  return (
    PREVIEW_VIEWPORT_PRESETS.find((preset) => preset.id === value)?.label ??
    t.settings.rows.browserDefaultViewport.options.responsive
  );
};

const isValidDimension = (value: number) =>
  Number.isInteger(value) &&
  value >= PREVIEW_VIEWPORT_MIN_DIMENSION &&
  value <= PREVIEW_VIEWPORT_MAX_DIMENSION;

const rotateViewport = (
  viewport: Exclude<PreviewViewportSetting, { readonly _tag: "fill" }>,
): PreviewViewportSetting => ({
  ...viewport,
  width: viewport.height,
  height: viewport.width,
});

/** Edits viewport defaults; dimension commits retain integer, dimension and area limits. */
function BrowserViewportSetting({ disabled }: { readonly disabled: boolean }) {
  const viewport = useClientSettings((settings) => settings.browserDefaultViewport);
  const updateSettings = useUpdatePrimarySettings();

  const sized = viewport._tag === "fill" ? null : viewport;
  const presentedSize = {
    width: sized?.width ?? RESPONSIVE_SEED_SIZE.width,
    height: sized?.height ?? RESPONSIVE_SEED_SIZE.height,
  };

  const selectViewport = (value: string | null) => {
    if (value === FILL_VALUE) {
      updateSettings({ browserDefaultViewport: FILL_PREVIEW_VIEWPORT });
      return;
    }
    if (value === RESPONSIVE_VALUE) {
      updateSettings({
        browserDefaultViewport: {
          _tag: "freeform",
          width: sized?.width ?? RESPONSIVE_SEED_SIZE.width,
          height: sized?.height ?? RESPONSIVE_SEED_SIZE.height,
        },
      });
      return;
    }
    const preset = PREVIEW_VIEWPORT_PRESETS.find((candidate) => candidate.id === value);
    if (!preset) return;
    updateSettings({
      browserDefaultViewport: {
        _tag: "preset",
        width: preset.width,
        height: preset.height,
        presetId: preset.id,
      },
    });
  };

  // Committed on blur rather than per keystroke: typing "2560" passes through
  // "256", which is a legal dimension, so an onValueChange handler would
  // persist that intermediate size and churn the settings file on every key.
  const commitDimension = (axis: "width" | "height", value: number | null) => {
    if (value === null || !isValidDimension(value)) return;
    const next = { ...presentedSize, [axis]: value };
    if (next.width * next.height > PREVIEW_VIEWPORT_MAX_AREA) return;
    if (sized && next.width === sized.width && next.height === sized.height) return;
    updateSettings({ browserDefaultViewport: { _tag: "freeform", ...next } });
  };

  return (
    <SettingsRow
      {...searchableSetting("browser-default-viewport")}

      resetAction={
        !disabled && viewport._tag !== DEFAULT_BROWSER_VIEWPORT._tag ? (
          <SettingResetButton
            label={t.settings.rows.browserDefaultViewport.resetLabel}
            onClick={() => updateSettings({ browserDefaultViewport: DEFAULT_BROWSER_VIEWPORT })}
          />
        ) : null
      }
      control={
        <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
          <Select
            value={viewportSelectValue(viewport)}
            onValueChange={selectViewport}
            disabled={disabled}
          >
            <SelectTrigger
              size="settings"
              aria-label={t.settings.rows.browserDefaultViewport.title}
            >
              <SelectValue>{viewportSelectLabel(viewport)}</SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              <SelectItem value={FILL_VALUE}>
                {t.settings.rows.browserDefaultViewport.options.fill}
              </SelectItem>
              <SelectItem value={RESPONSIVE_VALUE}>
                {t.settings.rows.browserDefaultViewport.options.responsive}
              </SelectItem>
              <SelectGroup>
                <SelectGroupLabel>
                  {t.settings.rows.browserDefaultViewport.standard}
                </SelectGroupLabel>
                {PREVIEW_VIEWPORT_PRESETS.map((preset) => (
                  <SelectItem key={preset.id} value={preset.id}>
                    <span className="flex w-full items-center justify-between gap-5">
                      <span>{preset.label}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {preset.detail}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectPopup>
          </Select>

          {sized ? (
            <div className="flex min-w-0 items-center gap-1">
              <NumberField
                value={presentedSize.width}
                min={PREVIEW_VIEWPORT_MIN_DIMENSION}
                max={PREVIEW_VIEWPORT_MAX_DIMENSION}
                disabled={disabled}
                format={NO_GROUPING}
                size="sm"
                className="w-20"
                onValueCommitted={(value) => commitDimension("width", value)}
              >
                <NumberFieldGroup>
                  <NumberFieldInput
                    aria-label={t.settings.rows.browserDefaultViewport.widthAriaLabel}
                  />
                </NumberFieldGroup>
              </NumberField>
              <span className="text-xs text-muted-foreground">×</span>
              <NumberField
                value={presentedSize.height}
                min={PREVIEW_VIEWPORT_MIN_DIMENSION}
                max={PREVIEW_VIEWPORT_MAX_DIMENSION}
                disabled={disabled}
                format={NO_GROUPING}
                size="sm"
                className="w-20"
                onValueCommitted={(value) => commitDimension("height", value)}
              >
                <NumberFieldGroup>
                  <NumberFieldInput
                    aria-label={t.settings.rows.browserDefaultViewport.heightAriaLabel}
                  />
                </NumberFieldGroup>
              </NumberField>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      size="icon-sm"
                      variant="ghost-muted"
                      disabled={disabled}
                      aria-label={t.settings.rows.browserDefaultViewport.rotateAriaLabel(
                        presentedSize.height >= presentedSize.width,
                      )}
                      onClick={() =>
                        updateSettings({ browserDefaultViewport: rotateViewport(sized) })
                      }
                    >
                      <ScreenRotationIcon />
                    </Button>
                  }
                />
                <TooltipPopup side="top">
                  {t.settings.rows.browserDefaultViewport.rotate}
                </TooltipPopup>
              </Tooltip>
            </div>
          ) : null}
        </div>
      }
    />
  );
}

/** Edits the device-local zoom using the supported levels; disabled keeps the stored value visible. */
function BrowserZoomSetting({ disabled }: { readonly disabled: boolean }) {
  const zoomFactor = useClientSettings((settings) => settings.browserDefaultZoomFactor);
  const updateSettings = useUpdatePrimarySettings();

  return (
    <SettingsRow
      {...searchableSetting("browser-default-zoom")}

      resetAction={
        !disabled && zoomFactor !== DEFAULT_PREVIEW_ZOOM_FACTOR ? (
          <SettingResetButton
            label={t.settings.rows.browserDefaultZoom.resetLabel}
            onClick={() =>
              updateSettings({ browserDefaultZoomFactor: DEFAULT_PREVIEW_ZOOM_FACTOR })
            }
          />
        ) : null
      }
      control={
        <Select
          disabled={disabled}
          value={String(zoomFactor)}
          onValueChange={(value) => {
            const next = PREVIEW_ZOOM_LEVELS.find((level) => String(level) === value);
            if (next !== undefined) updateSettings({ browserDefaultZoomFactor: next });
          }}
        >
          <SelectTrigger size="settings" aria-label={t.settings.rows.browserDefaultZoom.title}>
            <SelectValue>{zoomLabel(zoomFactor)}</SelectValue>
          </SelectTrigger>
          <SelectPopup align="end" alignItemWithTrigger={false}>
            {PREVIEW_ZOOM_LEVELS.map((level) => (
              <SelectItem hideIndicator key={level} value={String(level)}>
                {zoomLabel(level)}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      }
    />
  );
}

/** Edits the existing appearance preference through O1's single-selection segment; disabled prevents local writes. */
function BrowserAppearanceSetting({ disabled }: { readonly disabled: boolean }) {
  const appearance = useClientSettings((settings) => settings.browserDefaultAppearance);
  const updateSettings = useUpdatePrimarySettings();

  return (
    <SettingsRow
      {...searchableSetting("browser-default-appearance")}

      resetAction={
        !disabled && appearance !== DEFAULT_PREVIEW_APPEARANCE ? (
          <SettingResetButton
            label={t.settings.rows.browserDefaultAppearance.resetLabel}
            onClick={() => updateSettings({ browserDefaultAppearance: DEFAULT_PREVIEW_APPEARANCE })}
          />
        ) : null
      }
      control={
        <ToggleGroup
          size="settings"
          disabled={disabled}
          value={[appearance]}
          aria-label={t.settings.rows.browserDefaultAppearance.title}
          onValueChange={(values) => {
            const value = values[0];
            if (value === "system" || value === "light" || value === "dark") {
              updateSettings({ browserDefaultAppearance: value });
            }
          }}
        >
          {Object.entries(APPEARANCE_LABELS).map(([value, label]) => (
            <ToggleGroupItem key={value} value={value}>
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      }
    />
  );
}

/** Edits key and mouse overlays for future recordings; disabled leaves saved choices visible. */
function BrowserRecordingInputSettings({ disabled }: { readonly disabled: boolean }) {
  const showKeys = useClientSettings((settings) => settings.browserRecordingShowKeyPresses);
  const showMouse = useClientSettings((settings) => settings.browserRecordingShowMousePresses);
  const updateSettings = useUpdatePrimarySettings();
  return (
    <>
      <SettingsRow
        {...searchableSetting("browser-recording-key-presses")}

        control={
          <Switch
            disabled={disabled}
            checked={showKeys}
            aria-label={t.settings.rows.browserRecordingKeyPresses.title}
            onCheckedChange={(checked) =>
              updateSettings({ browserRecordingShowKeyPresses: Boolean(checked) })
            }
          />
        }
      />
      <SettingsRow
        {...searchableSetting("browser-recording-mouse-presses")}

        control={
          <Switch
            disabled={disabled}
            checked={showMouse}
            aria-label={t.settings.rows.browserRecordingMousePresses.title}
            onCheckedChange={(checked) =>
              updateSettings({ browserRecordingShowMousePresses: Boolean(checked) })
            }
          />
        }
      />
    </>
  );
}

/** Edits the supported recording rate and retains the existing default reset. */
function BrowserRecordingFrameRateSetting({ disabled }: { readonly disabled: boolean }) {
  const frameRate = useClientSettings((settings) => settings.browserRecordingFrameRate);
  const updateSettings = useUpdatePrimarySettings();

  return (
    <SettingsRow
      {...searchableSetting("browser-recording-frame-rate")}

      resetAction={
        !disabled && frameRate !== DEFAULT_BROWSER_RECORDING_FRAME_RATE ? (
          <SettingResetButton
            label={t.settings.rows.browserRecordingFrameRate.resetLabel}
            onClick={() =>
              updateSettings({ browserRecordingFrameRate: DEFAULT_BROWSER_RECORDING_FRAME_RATE })
            }
          />
        ) : null
      }
      control={
        <Select
          disabled={disabled}
          value={String(frameRate)}
          onValueChange={(value) => {
            const next = BROWSER_RECORDING_FRAME_RATES.find((rate) => String(rate) === value);
            if (next !== undefined) {
              updateSettings({ browserRecordingFrameRate: next });
            }
          }}
        >
          <SelectTrigger
            size="settings"
            aria-label={t.settings.rows.browserRecordingFrameRate.title}
          >
            <SelectValue>{frameRate} fps</SelectValue>
          </SelectTrigger>
          <SelectPopup align="end" alignItemWithTrigger={false}>
            {BROWSER_RECORDING_FRAME_RATES.map((rate) => (
              <SelectItem hideIndicator key={rate} value={String(rate)}>
                {rate} fps
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      }
    />
  );
}

const LINK_TARGET_LABELS: Readonly<Record<BrowserLinkTarget, string>> = {
  system: t.settings.rows.browserLinkTarget.options.external,
  app: "T3 Code",
};

/** Edits the existing system/app destination; it does not choose a new preview surface. */
function BrowserLinkTargetSetting({ disabled }: { readonly disabled: boolean }) {
  const linkTarget = useClientSettings((settings) => settings.browserLinkTarget);
  const updateSettings = useUpdatePrimarySettings();

  return (
    <SettingsRow
      {...searchableSetting("browser-link-target")}

      resetAction={
        !disabled && linkTarget !== DEFAULT_BROWSER_LINK_TARGET ? (
          <SettingResetButton
            label={t.settings.rows.browserLinkTarget.resetLabel}
            onClick={() => updateSettings({ browserLinkTarget: DEFAULT_BROWSER_LINK_TARGET })}
          />
        ) : null
      }
      control={
        <Select
          disabled={disabled}
          value={linkTarget}
          onValueChange={(value) => {
            if (value === "system" || value === "app") {
              updateSettings({ browserLinkTarget: value });
            }
          }}
        >
          <SelectTrigger size="settings" aria-label={t.settings.rows.browserLinkTarget.title}>
            <SelectValue>{LINK_TARGET_LABELS[linkTarget]}</SelectValue>
          </SelectTrigger>
          <SelectPopup align="end" alignItemWithTrigger={false}>
            {(Object.keys(LINK_TARGET_LABELS) as ReadonlyArray<BrowserLinkTarget>).map((target) => (
              <SelectItem hideIndicator key={target} value={target}>
                {LINK_TARGET_LABELS[target]}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      }
    />
  );
}

const SEARCH_ENGINE_LABELS: Readonly<Record<BrowserSearchEngine, string>> = {
  duckduckgo: "DuckDuckGo",
  google: "Google",
  bing: "Bing",
  brave: "Brave Search",
  kagi: "Kagi",
  ecosia: "Ecosia",
  get custom() {
    return t.settings.browserSearchUi.custom;
  },
};

function BrowserSearchEngineSetting() {
  const engine = useClientSettings((settings) => settings.browserSearchEngine);
  const customUrl = useClientSettings((settings) => settings.browserCustomSearchUrl);
  const updateSettings = useUpdatePrimarySettings();

  return (
    <>
      <SettingsRow
        {...searchableSetting("browser-search-engine")}
        description={t.settings.browserSearchUi.description}
        resetAction={
          engine !== DEFAULT_BROWSER_SEARCH_ENGINE || customUrl !== "" ? (
            <SettingResetButton
              label={t.settings.browserSearchUi.resetLabel}
              onClick={() =>
                updateSettings({
                  browserSearchEngine: DEFAULT_BROWSER_SEARCH_ENGINE,
                  browserCustomSearchUrl: "",
                })
              }
            />
          ) : null
        }
        control={
          <Select
            value={engine}
            onValueChange={(value) => {
              const next = BrowserSearchEngine.literals.find((literal) => literal === value);
              if (next !== undefined) {
                updateSettings({ browserSearchEngine: next });
              }
            }}
          >
            <SelectTrigger
              size="sm"
              className="w-full sm:w-40"
              aria-label={t.settings.browserSearchUi.label}
            >
              <SelectValue>{SEARCH_ENGINE_LABELS[engine]}</SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              {BrowserSearchEngine.literals.map((literal) => (
                <SelectItem hideIndicator key={literal} value={literal}>
                  {SEARCH_ENGINE_LABELS[literal]}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        }
      />
      {engine === "custom" ? (
        <SettingsRow
          title={t.settings.browserSearchUi.customUrl}
          description={t.settings.browserSearchUi.templateHint}
          status={
            isValidSearchUrlTemplate(customUrl) ? undefined : t.settings.browserSearchUi.invalidUrl
          }
          control={
            <DraftInput
              nativeInput
              size="sm"
              className="w-full sm:w-64"
              aria-label={t.settings.browserSearchUi.customUrl}
              placeholder="https://example.com/search?q=%s"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={BROWSER_CUSTOM_SEARCH_URL_MAX_LENGTH}
              value={customUrl}
              onCommit={(next) => updateSettings({ browserCustomSearchUrl: next.trim() })}
            />
          }
        />
      ) : null}
    </>
  );
}

function PullRequestLinksOpenInAppSetting() {
  const openInApp = useClientSettings((settings) => settings.pullRequestLinksOpenInApp);
  const updateSettings = useUpdatePrimarySettings();

  return (
    <SettingsRow
      {...searchableSetting("pull-request-links-open-in-app")}
      description={t.settings.browserSearchUi.prDescription}
      resetAction={
        openInApp ? null : (
          <SettingResetButton
            label={t.settings.browserSearchUi.prResetLabel}
            onClick={() => updateSettings({ pullRequestLinksOpenInApp: true })}
          />
        )
      }
      control={
        <Switch
          checked={openInApp}
          onCheckedChange={(checked) =>
            updateSettings({ pullRequestLinksOpenInApp: Boolean(checked) })
          }
          aria-label={t.settings.browserSearchUi.prLabel}
        />
      }
    />
  );
}

function DeviceIntegrationSettings() {
  const { search, environment: selected } = useSettingsScope();
  const settings = useScopedSettings();
  const connected = selected?.connection.phase === "connected" && selected.serverConfig !== null;
  const environmentId = connected ? selected.environmentId : null;

  return (
    <SettingsSection id="devices" title={t.settings.sections.devices}>
      <DeviceIntegrationControls
        key={`${environmentId}:${JSON.stringify(search)}`}
        environmentId={environmentId}
        enabled={settings.enableDeviceSupport}
        agentAccessEnabled={settings.enableAgentDeviceAccess}
      />
    </SettingsSection>
  );
}

/** Renders O1 device rows for the selected environment; preserves setup, scoped access and platform diagnostics. */
function DeviceIntegrationControls({
  environmentId,
  enabled,
  agentAccessEnabled,
}: {
  environmentId: EnvironmentId | null;
  enabled: boolean;
  agentAccessEnabled: boolean;
}) {
  const canConfigure = useEnvironmentScope(environmentId, AuthSettingsWriteScope);
  const { state, loaded } = useDeviceState(environmentId);
  const { scope, environments, connectedEnvironments } = useSettingsScope();
  const updateSettings = useUpdateScopedSettings();
  const projectScope = scope.kind === "project" || scope.kind === "checkout";
  const anyHubEnabled = connectedEnvironments.some(
    (environment) => environment.serverConfig?.settings.enableDeviceSupport,
  );
  const configure = useAtomCommand(deviceEnvironment.configure, { reportFailure: false });
  const list = useAtomCommand(deviceEnvironment.list, { reportFailure: false });
  const [pending, setPending] = useState<
    "hub" | "check" | "agent" | "update-hub" | "update-agent" | null
  >(null);
  const { ready: hubReady, busy } = deviceHubReadiness(state);
  const localPlatformsUnavailable = state.hosts.some(
    (host) => host.kind === "local" && !host.platforms.some((platform) => platform.available),
  );
  const [platformsRevealed, setPlatformsRevealed] = useState(false);
  if (platformsRevealed && !enabled) setPlatformsRevealed(false);
  if (
    enabled &&
    !platformsRevealed &&
    (hubReady || localPlatformsUnavailable) &&
    pending !== "hub"
  ) {
    setPlatformsRevealed(true);
  }

  const update = async (
    kind: NonNullable<typeof pending>,
    input: { enabled?: boolean; agentAccessEnabled?: boolean },
  ) => {
    if (!environmentId || !readEnvironmentScope(environmentId, AuthSettingsWriteScope)) return;
    setPending(kind);
    const results = await Promise.allSettled(
      environments.map(async (environment) => {
        if (environment.connection.phase !== "connected" || !environment.serverConfig) {
          throw new Error(t.settings.integrations.devices.disconnectedError);
        }
        if (!readEnvironmentScope(environment.environmentId, AuthSettingsWriteScope)) {
          throw new Error(t.settings.integrations.devices.permissionError);
        }
        return configure({
          environmentId: environment.environmentId,
          input: { ...input, ...(input.enabled ? { onboardingCompleted: true } : {}) },
        });
      }),
    );
    setPending(null);
    const failed = environments.filter((_, index) => {
      const result = results[index];
      return result?.status !== "fulfilled" || result.value._tag === "Failure";
    });
    if (failed.length > 0) {
      toastManager.add({
        type: "error",
        title: t.settings.integrations.devices.saveError,
        description: t.settings.integrations.devices.saveErrorHint(
          failed.map((environment) => environment.label).join(", "),
        ),
      });
    }
  };

  const [updateError, setUpdateError] = useState<{ tool: "hub" | "agent"; message: string } | null>(
    null,
  );
  const localTools = state.hosts.find((host) => host.kind === "local")?.tools;
  const versionActions = (tool: "hub" | "agent") => {
    const version = localTools?.[tool];
    const needsUpdate = version && !version.installedVersions.includes(version.requiredVersion);
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {state.supportsToolUpdate && needsUpdate ? (
            <Button
              size="toolbar"
              disabled={!environmentId || pending !== null || busy}
              onClick={() => {
                if (!environmentId) return;
                setUpdateError(null);
                setPending(`update-${tool}`);
                void list({ environmentId, input: { updateTool: tool } })
                  .then((result) => {
                    if (result._tag === "Failure")
                      setUpdateError({ tool, message: formatEnvironmentQueryError(result.cause) });
                  })
                  .finally(() => setPending(null));
              }}
            >
              {pending === `update-${tool}`
                ? t.settings.integrations.devices.updating
                : t.settings.integrations.devices.updateVersion(version.requiredVersion)}
            </Button>
          ) : null}
          {state.supportsToolInspection ? (
            <Button
              size="toolbar"
              variant="outline"
              disabled={!environmentId || pending !== null || busy}
              onClick={() => {
                if (!environmentId) return;
                setPending("check");
                void list({ environmentId, input: { inspectOnly: true } }).finally(() =>
                  setPending(null),
                );
              }}
            >
              {pending === "check"
                ? t.settings.integrations.devices.checking
                : t.settings.integrations.devices.checkVersions}
            </Button>
          ) : null}
        </div>
        {updateError?.tool === tool ? (
          <p role="alert" className="text-xs text-destructive">
            {updateError.message}
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <>
      <DeviceHostsSettings environmentId={environmentId} />
      <SettingsRow
        {...searchableSetting("agent-device-access")}
        serverScoped
        settingKeys={["enableAgentDeviceAccess"]}
        control={
          <>
            <DeviceToolVersions
              action={versionActions("agent")}
              kind="agent"
              tools={state.hosts.find((host) => host.kind === "local")?.tools}
            />
            {pending === "agent" ? <AgentDeviceSetupStatus state={state} pending compact /> : null}
            <ScopedSwitch
              settingKeys={["enableAgentDeviceAccess"]}
              checked={agentAccessEnabled}
              disabled={
                !canConfigure ||
                connectedEnvironments.length === 0 ||
                (!projectScope && (!loaded || !anyHubEnabled || busy)) ||
                pending !== null
              }
              aria-label={t.settings.rows.agentDeviceAccess.title}
              onCheckedChange={(checked) =>
                projectScope
                  ? updateSettings({ enableAgentDeviceAccess: Boolean(checked) })
                  : void update("agent", { agentAccessEnabled: Boolean(checked) })
              }
            />
          </>
        }
      />
      <SettingsRow
        {...searchableSetting("device-hub")}
        serverScoped
        settingKeys={["enableDeviceSupport"]}
        control={
          <>
            <DeviceToolVersions
              action={versionActions("hub")}
              kind="hub"
              tools={state.hosts.find((host) => host.kind === "local")?.tools}
            />
            {pending === "hub" ? <DeviceHubSetupStatus state={state} pending compact /> : null}
            <ScopedSwitch
              settingKeys={["enableDeviceSupport"]}
              checked={enabled}
              disabled={
                !canConfigure ||
                projectScope ||
                !loaded ||
                !environmentId ||
                busy ||
                pending !== null
              }
              aria-label={t.settings.rows.deviceHub.title}
              onCheckedChange={(checked) =>
                void update("hub", {
                  enabled: Boolean(checked),
                  ...(checked ? {} : { agentAccessEnabled: false }),
                })
              }
            />
          </>
        }
      />
      <AnimatedHeight>
        {platformsRevealed ? (
          <SettingsRow
            {...searchableSetting("device-platform-support")}
            description={
              connectedEnvironments.length > 1
                ? t.settings.integrations.devices.environmentHint(
                    connectedEnvironments.find(
                      (environment) => environment.environmentId === environmentId,
                    )?.label,
                  )
                : undefined
            }
            status={
              <div className="space-y-2">
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  <PlatformStatus
                    compact
                    platform="iOS"
                    status={platformSetupStatus(state, "ios")}
                  />
                  <PlatformStatus
                    compact
                    platform={t.settings.integrations.devices.android}
                    status={platformSetupStatus(state, "android")}
                  />
                </div>
                {/* Remote hosts report their own warnings in the device host list below. */}
                <DeviceHostDiagnostics
                  hosts={state.hosts.filter((host) => host.kind === "local")}
                  hostStatuses={state.hostStatuses}
                />
              </div>
            }
            control={
              <Button
                size="toolbar"
                variant="outline"
                disabled={!environmentId || !enabled || busy || pending !== null}
                onClick={() => {
                  if (!environmentId) return;
                  setPending("check");
                  void list({ environmentId, input: {} }).finally(() => setPending(null));
                }}
              >
                {pending === "check"
                  ? t.settings.integrations.devices.checking
                  : t.settings.actions.refresh}
              </Button>
            }
          />
        ) : null}
      </AnimatedHeight>
      {environmentId ? (
        <DeviceHostUpdates
          state={{ ...state, hosts: state.hosts.filter((host) => host.kind === "local") }}
          environmentId={environmentId}
        />
      ) : null}
      {state.supportsEasHosts ? <EasDeviceHostsSettings environmentId={environmentId} /> : null}
    </>
  );
}

/** Edits automatic floating previews and restores the existing default when requested. */
function BrowserAutoShowFloatingPreviewSetting({ disabled }: { readonly disabled: boolean }) {
  const autoShow = useClientSettings((settings) => settings.browserAutoShowFloatingPreview);
  const updateSettings = useUpdatePrimarySettings();

  return (
    <SettingsRow
      {...searchableSetting("browser-auto-show-floating-preview")}

      resetAction={
        !disabled && autoShow !== DEFAULT_BROWSER_AUTO_SHOW_FLOATING_PREVIEW ? (
          <SettingResetButton
            label={t.settings.rows.browserAutoShowFloatingPreview.resetLabel}
            onClick={() =>
              updateSettings({
                browserAutoShowFloatingPreview: DEFAULT_BROWSER_AUTO_SHOW_FLOATING_PREVIEW,
              })
            }
          />
        ) : null
      }
      control={
        <Switch
          disabled={disabled}
          checked={autoShow}
          onCheckedChange={(checked) =>
            updateSettings({ browserAutoShowFloatingPreview: Boolean(checked) })
          }
          aria-label={t.settings.rows.browserAutoShowFloatingPreview.title}
        />
      }
    />
  );
}

/**
 * Keeps local profile operations separate from remote cookie imports and waits for settings hydration before edits.
 * @param props.disabled Prevents mutations when the current environment cannot manage browser data.
 * @returns Profile controls and confirmation dialogs; bridge/command failures are shown in their existing error states.
 */
function BrowserProfilesSetting({ disabled }: { readonly disabled: boolean }) {
  const userProfiles = useClientSettings((settings) => settings.browserProfiles);
  const defaultProfileId = useClientSettings((settings) => settings.browserDefaultProfileId);
  const settingsHydrated = useClientSettingsHydrated();
  const updateSettings = useUpdatePrimarySettings();
  const { environments, isReady: environmentsReady } = useEnvironments();
  const primaryEnvironment = usePrimaryEnvironment();
  const [sources, setSources] = useState<ReadonlyArray<BrowserImportSource> | null>(null);
  const [importSession, setImportSession] = useState<{
    readonly source: BrowserImportSource;
    readonly environmentId: EnvironmentId;
    readonly environmentName: string;
  } | null>(null);
  const [profilePendingRemoval, setProfilePendingRemoval] = useState<BrowserProfile | null>(null);
  const [profilePendingClear, setProfilePendingClear] = useState<BrowserProfile | null>(null);
  const [profileRemovalError, setProfileRemovalError] = useState<string | null>(null);
  const [profileRemovalInFlight, setProfileRemovalInFlight] = useState(false);
  const serverConfigs = useServerConfigs();
  const runClearServerProfile = useAtomCommand(previewEnvironment.clearProfile, {
    reportFailure: false,
  });
  const serverProfileData: ServerProfileData = {
    environmentIds: environments
      .map((environment) => environment.environmentId)
      .filter(
        (environmentId) =>
          serverConfigs.get(environmentId)?.environment.capabilities.serverBrowser === true,
      ),
    clear: async (environmentId, profileId) => {
      const result = await runClearServerProfile({ environmentId, input: { profileId } });
      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
    },
  };
  const removalAvailable = browserProfileRemovalAvailable(
    previewBridge !== null,
    environmentsReady,
    environments.length,
    serverProfileData.environmentIds.length,
  );
  const importInFlightRef = useRef(false);
  const [importInFlight, setImportInFlight] = useState(false);
  const profileWritesDisabled = disabled || !settingsHydrated;

  const profiles = resolveBrowserProfiles(userProfiles);
  const listedProfiles = profiles.filter((profile) => profile.kind !== "incognito");
  const resolvedDefaultId =
    findBrowserProfile(listedProfiles, defaultProfileId)?.id ?? DEFAULT_BROWSER_PROFILE_ID;

  /** Sets a listed persistent profile as the default; ignores disabled, importing or stale selections. */
  const setDefaultProfile = (id: string | null) => {
    if (
      id === null ||
      profileWritesDisabled ||
      importInFlightRef.current ||
      !listedProfiles.some((profile) => profile.id === id)
    )
      return;
    updateSettings({ browserDefaultProfileId: id });
  };

  const createProfile = (baseName: string) => {
    if (!settingsHydrated || importInFlightRef.current) return undefined;
    const currentProfiles = getClientSettings().browserProfiles;
    // Checked against the live settings, not the rendered list: two clicks
    // before a re-render would otherwise both pass the disabled control.
    if (currentProfiles.length >= BROWSER_PROFILE_MAX_COUNT) return undefined;
    const resolvedProfiles = resolveBrowserProfiles(currentProfiles);
    const taken = new Set(resolvedProfiles.map((profile) => profile.name));
    let name = baseName;
    for (let index = 2; taken.has(name); index += 1) name = `${baseName} ${index}`;
    const profile = { id: `profile-${randomUUID()}`, name, kind: "persistent" as const };
    updateSettings({ browserProfiles: [...currentProfiles, profile] });
    return profile;
  };

  const renameProfile = (id: string, next: string) => {
    if (!settingsHydrated || importInFlightRef.current) return;
    const name = next.trim().slice(0, BROWSER_PROFILE_NAME_MAX_LENGTH);
    if (name === "") return;
    const currentProfiles = getClientSettings().browserProfiles;
    updateSettings({
      browserProfiles: currentProfiles.map((profile) =>
        profile.id === id ? { ...profile, name } : profile,
      ),
    });
  };

  const clearProfileData = (id: string, name: string) => {
    if (!settingsHydrated || importInFlightRef.current) return;
    if (!removalAvailable) {
      toastManager.add({
        type: "error",
        title: t.settings.integrations.profiles.clearError(name),
        description: t.settings.integrations.profiles.connectHint,
      });
      return;
    }
    void clearBrowserProfileData(
      previewBridge,
      environments.map((environment) => environment.environmentId),
      id,
      serverProfileData,
    )
      .then(() => {
        toastManager.add({
          type: "success",
          title: t.settings.integrations.profiles.clearedToast(name),
        });
      })
      .catch(() => {
        toastManager.add({
          type: "error",
          title: t.settings.integrations.profiles.clearError(name),
        });
      });
  };

  const removeProfile = async (id: string) => {
    if (!settingsHydrated || importInFlightRef.current) return;
    if (!removalAvailable) {
      setProfileRemovalError(t.settings.integrations.profiles.removeConnectError);
      return;
    }
    setProfileRemovalError(null);
    setProfileRemovalInFlight(true);
    try {
      await clearBrowserProfileData(
        previewBridge,
        environmentsReady ? environments.map((environment) => environment.environmentId) : [],
        id,
        serverProfileData,
      );
    } catch {
      setProfileRemovalError(t.settings.integrations.profiles.removeError);
      setProfileRemovalInFlight(false);
      return;
    }
    const currentSettings = getClientSettings();
    updateSettings({
      browserProfiles: currentSettings.browserProfiles.filter((profile) => profile.id !== id),
      ...(currentSettings.browserDefaultProfileId === id
        ? { browserDefaultProfileId: DEFAULT_BROWSER_PROFILE_ID }
        : {}),
    });
    setProfileRemovalInFlight(false);
    setProfilePendingRemoval(null);
  };

  const importableSources = (sources ?? []).filter(
    (source) =>
      source.unavailable !== "notInstalled" && source.unavailable !== "unsupportedPlatform",
  );

  const loadSources = () => {
    if (!previewBridge) return;
    void previewBridge
      .listBrowserImportSources()
      .then(setSources)
      .catch(() => setSources((previous) => previous ?? []));
  };

  const runWizardImport = async (
    source: BrowserImportSource,
    environmentId: EnvironmentId,
    input: { readonly sourceProfileDirectory: string; readonly target: WizardTarget },
  ): Promise<ImportOutcome> => {
    if (!previewBridge) return { kind: "blocked", reason: "sessionUnavailable" };
    if (!settingsHydrated) return { kind: "blocked", reason: "sessionUnavailable" };
    if (
      input.target.kind === "existing" &&
      !resolveBrowserProfiles(getClientSettings().browserProfiles).some(
        (profile) => profile.id === input.target.profileId,
      )
    ) {
      return { kind: "blocked", reason: "readFailed" };
    }
    if (importInFlightRef.current) return { kind: "blocked", reason: "readFailed" };
    importInFlightRef.current = true;
    setImportInFlight(true);
    return importBrowserCookiesIntoTarget(previewBridge, source, environmentId, input).finally(
      () => {
        importInFlightRef.current = false;
        setImportInFlight(false);
      },
    );
  };

  const refreshImportSource = async (
    sourceId: BrowserImportSource["id"],
  ): Promise<BrowserImportSource | undefined> => {
    if (!previewBridge) return undefined;
    try {
      const latest = await previewBridge.listBrowserImportSources();
      setSources(latest);
      return latest.find((source) => source.id === sourceId);
    } catch {
      return undefined;
    }
  };

  const atProfileLimit = userProfiles.length >= BROWSER_PROFILE_MAX_COUNT;

  return (
    <>
      <SettingsRow
        {...searchableSetting("browser-profiles")}

        control={
          <Menu onOpenChange={(open) => open && loadSources()}>
            <MenuTrigger
              render={
                <Button
                  size="toolbar"
                  variant="outline"
                  disabled={profileWritesDisabled || importInFlight}
                />
              }
            >
              <PlusIcon />
              {t.settings.integrations.profiles.add}
            </MenuTrigger>
            <MenuPopup align="end">
              <MenuItem
                disabled={!settingsHydrated || atProfileLimit}
                onClick={() => createProfile(t.settings.browserImportWizard.newProfile)}
              >
                {t.settings.integrations.profiles.blankProfile}
              </MenuItem>
              {atProfileLimit ? (
                <MenuItem disabled>{t.settings.integrations.profiles.limitHint}</MenuItem>
              ) : null}
              <MenuSeparator />
              <MenuGroup>
                <MenuGroupLabel>{t.settings.integrations.profiles.importLabel}</MenuGroupLabel>
                {sources === null ? (
                  <MenuItem disabled>{t.settings.integrations.profiles.loadingBrowsers}</MenuItem>
                ) : importableSources.length === 0 ? (
                  <MenuItem disabled>{t.settings.integrations.profiles.noBrowsers}</MenuItem>
                ) : (
                  // Every source is a plain row — running, needs-permission and
                  // ready all look the same here. The wizard picks up whatever
                  // state the source is in and walks the user forward from there.
                  <>
                    {importableSources.map((source) => (
                      <MenuItem
                        key={source.id}
                        disabled={!settingsHydrated || primaryEnvironment == null}
                        onClick={() => {
                          if (!settingsHydrated || primaryEnvironment == null) return;
                          setImportSession({
                            source,
                            environmentId: primaryEnvironment.environmentId,
                            environmentName: resolveEnvironmentOptionLabel({
                              isPrimary: true,
                              environmentId: primaryEnvironment.environmentId,
                              runtimeLabel: primaryEnvironment.label,
                            }),
                          });
                        }}
                      >
                        {source.name}
                      </MenuItem>
                    ))}
                    {primaryEnvironment == null ? (
                      <MenuItem disabled>
                        {t.settings.integrations.profiles.importConnectHint}
                      </MenuItem>
                    ) : null}
                  </>
                )}
              </MenuGroup>
            </MenuPopup>
          </Menu>
        }
      >
        {/* Keep profile management inline: O1's compact row must not remove existing actions. */}
        <div className="my-2 overflow-hidden rounded-settings-row-surface bg-input shadow-well-control">
          {listedProfiles.map((profile, index) => {
            const builtIn = isBuiltInBrowserProfileId(profile.id);
            const isDefault = profile.id === resolvedDefaultId;
            return (
              <div
                key={profile.id}
                className={cn(
                  "flex min-h-12 items-center gap-3 px-3.5 py-2.5",
                  index > 0 && "border-t border-settings-divider",
                )}
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  {builtIn ? (
                    // Dimmed here rather than on the table: a wrapper-level dim
                    // stacks with the rename field's and the row menu button's
                    // own, landing them near 0.41 while every other disabled
                    // control in the block sits at 0.64.
                    <span
                      className={cn(
                        "truncate text-sm text-foreground",
                        profileWritesDisabled && "opacity-64",
                      )}
                    >
                      {profile.name}
                    </span>
                  ) : (
                    <DraftInput
                      nativeInput
                      size="settings"
                      className="w-full max-w-56"
                      aria-label={t.settings.integrations.profiles.renameAriaLabel(profile.name)}
                      disabled={profileWritesDisabled || importInFlight}
                      maxLength={BROWSER_PROFILE_NAME_MAX_LENGTH}
                      value={profile.name}
                      onCommit={(next) => renameProfile(profile.id, next)}
                    />
                  )}
                  {/* Dimmed with the rest of the row, whose controls are all disabled. */}
                  {isDefault ? (
                    <span className={cn("flex", profileWritesDisabled && "opacity-64")}>
                      <Badge variant="neutral" size="sm">
                        {t.settings.integrations.profiles.default}
                      </Badge>
                    </span>
                  ) : null}
                </span>
                <Menu>
                  <MenuTrigger
                    render={
                      <Button
                        size="icon-toolbar"
                        variant="ghost-muted"
                        disabled={profileWritesDisabled || importInFlight}
                        aria-label={t.settings.integrations.profiles.actionsAriaLabel(profile.name)}
                      />
                    }
                  >
                    <MoreVertical />
                  </MenuTrigger>
                  <MenuPopup align="end">
                    <MenuItem
                      disabled={!settingsHydrated || isDefault}
                      onClick={() => setDefaultProfile(profile.id)}
                    >
                      {t.settings.integrations.profiles.setDefault}
                    </MenuItem>
                    <MenuItem
                      disabled={!settingsHydrated || !removalAvailable}
                      onClick={() => {
                        // Clearing a server copy closes its open tabs, so it asks first.
                        if (serverProfileData.environmentIds.length > 0) {
                          setProfilePendingClear(profile);
                        } else clearProfileData(profile.id, profile.name);
                      }}
                    >
                      {t.settings.integrations.profiles.clear}
                    </MenuItem>
                    {builtIn ? null : (
                      <MenuItem
                        variant="destructive"
                        disabled={!settingsHydrated || !removalAvailable}
                        onClick={() => {
                          if (settingsHydrated) setProfilePendingRemoval(profile);
                        }}
                      >
                        {t.settings.integrations.profiles.remove}
                      </MenuItem>
                    )}
                    {!removalAvailable ? (
                      <>
                        <MenuSeparator />
                        <MenuItem disabled>
                          {environmentsReady
                            ? t.settings.integrations.profiles.clearConnectHint
                            : t.settings.integrations.profiles.checkingEnvironments}
                        </MenuItem>
                      </>
                    ) : null}
                  </MenuPopup>
                </Menu>
              </div>
            );
          })}
        </div>
        <AlertDialog
          open={profilePendingRemoval !== null}
          onOpenChange={(open) => {
            if (!open && !profileRemovalInFlight) {
              setProfilePendingRemoval(null);
              setProfileRemovalError(null);
            }
          }}
        >
          <AlertDialogPopup>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t.settings.integrations.profiles.removeTitle(profilePendingRemoval?.name ?? "")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t.settings.integrations.profiles.removeDescription}
              </AlertDialogDescription>
              {profileRemovalError ? (
                <p aria-live="polite" className="text-sm text-destructive">
                  {profileRemovalError}
                </p>
              ) : null}
              {!removalAvailable ? (
                <p className="text-sm text-muted-foreground">
                  {t.settings.integrations.profiles.removeConnectHint}
                </p>
              ) : null}
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogClose
                disabled={profileRemovalInFlight}
                render={<Button variant="outline" disabled={profileRemovalInFlight} />}
              >
                {t.settings.actions.cancel}
              </AlertDialogClose>
              <Button
                variant="destructive"
                disabled={profileRemovalInFlight || !settingsHydrated || !removalAvailable}
                onClick={() => {
                  if (profilePendingRemoval && settingsHydrated && removalAvailable) {
                    void removeProfile(profilePendingRemoval.id);
                  }
                }}
              >
                {profileRemovalInFlight
                  ? t.settings.integrations.profiles.removing
                  : t.settings.integrations.profiles.removeProfile}
              </Button>
            </AlertDialogFooter>
          </AlertDialogPopup>
        </AlertDialog>
        <AlertDialog
          open={profilePendingClear !== null}
          onOpenChange={(open) => {
            if (!open) setProfilePendingClear(null);
          }}
        >
          <AlertDialogPopup>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t.settings.integrations.profiles.clearTitle(profilePendingClear?.name ?? "")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t.settings.integrations.profiles.clearDescription}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogClose render={<Button variant="outline" />}>
                {t.settings.actions.cancel}
              </AlertDialogClose>
              <Button
                variant="destructive"
                onClick={() => {
                  if (profilePendingClear)
                    clearProfileData(profilePendingClear.id, profilePendingClear.name);
                  setProfilePendingClear(null);
                }}
              >
                {t.settings.integrations.profiles.clearData}
              </Button>
            </AlertDialogFooter>
          </AlertDialogPopup>
        </AlertDialog>
        {importSession ? (
          <BrowserImportWizard
            source={importSession.source}
            destinationEnvironmentName={importSession.environmentName}
            targetProfiles={listedProfiles.map((profile) => ({
              id: profile.id,
              name: profile.name,
            }))}
            canCreateProfile={settingsHydrated && !atProfileLimit}
            onImport={(input) =>
              runWizardImport(importSession.source, importSession.environmentId, input)
            }
            onRefreshSource={() => refreshImportSource(importSession.source.id)}
            onCheckFullDiskAccess={
              window.desktopBridge?.checkSystemPermission
                ? () => window.desktopBridge!.checkSystemPermission!("full-disk-access")
                : undefined
            }
            onOpenFullDiskAccessSettings={async () => {
              // Rejects outside the desktop shell (and on shells that predate the
              // method), so the one toast covers every way the link can fail.
              await readLocalApi()
                ?.shell.openSystemSettings("full-disk-access")
                .catch(() => {
                  toastManager.add({
                    type: "error",
                    title: t.settings.integrations.profiles.openSettingsError,
                    description: t.settings.integrations.profiles.openSettingsHint,
                  });
                });
            }}
            onClose={() => setImportSession(null)}
          />
        ) : null}
      </SettingsRow>
      <SettingsRow
        id="browser-default-profile"
        title={t.settings.rows.browserDefaultProfile.title}
        resetAction={
          !profileWritesDisabled && resolvedDefaultId !== DEFAULT_BROWSER_PROFILE_ID ? (
            <SettingResetButton
              label={t.settings.rows.browserDefaultProfile.title}
              onClick={() => setDefaultProfile(DEFAULT_BROWSER_PROFILE_ID)}
            />
          ) : null
        }
        control={
          <Select
            value={resolvedDefaultId}
            disabled={profileWritesDisabled || importInFlight}
            onValueChange={setDefaultProfile}
          >
            <SelectTrigger size="settings" aria-label={t.settings.rows.browserDefaultProfile.title}>
              <SelectValue>
                {findBrowserProfile(listedProfiles, resolvedDefaultId)?.name}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              {listedProfiles.map((profile) => (
                <SelectItem key={profile.id} value={profile.id}>
                  {profile.name}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        }
      />
    </>
  );
}

/** Composes O1's five groups while preserving scoped access and device-local preview writes. */
export function IntegrationsSettingsPanel() {
  const previewDefaultsDisabled = !isElectron;
  const previewDefaults = (
    <>
      <SettingsSection id="browser" title={t.settings.integrations.groups.profiles}>
        <BrowserProfilesSetting disabled={previewDefaultsDisabled} />
        <BrowserViewportSetting disabled={previewDefaultsDisabled} />
        <BrowserZoomSetting disabled={previewDefaultsDisabled} />
        <BrowserAppearanceSetting disabled={previewDefaultsDisabled} />
      </SettingsSection>
      <SettingsSection id="browser-recording" title={t.settings.integrations.groups.recording}>
        <BrowserRecordingFrameRateSetting disabled={previewDefaultsDisabled} />
        <BrowserRecordingInputSettings disabled={previewDefaultsDisabled} />
      </SettingsSection>
      <SettingsSection id="browser-links" title={t.settings.integrations.groups.links}>
        <BrowserSearchEngineSetting />
        <PullRequestLinksOpenInAppSetting />
        <BrowserLinkTargetSetting disabled={previewDefaultsDisabled} />
        <BrowserAutoShowFloatingPreviewSetting disabled={previewDefaultsDisabled} />
      </SettingsSection>
    </>
  );

  return (
    <SettingsPageContainer className="settings-integrations">
      {/* Agent access follows the header scope; preview defaults remain device-local. */}
      <ProjectDefaultsSettings category="integrations" />
      <DeviceIntegrationSettings />
      {previewDefaultsDisabled ? (
        <SettingsUnavailableGroup message={t.settings.integrations.desktopOnlyHint}>
          {previewDefaults}
        </SettingsUnavailableGroup>
      ) : (
        previewDefaults
      )}
    </SettingsPageContainer>
  );
}
