/** Renders scoped appearance controls, theme choices, and typography settings. */
import { BackgroundImageSetting } from "./BackgroundImageSetting";
import { t } from "~/i18n";
import { usePhysicsMotion } from "~/hooks/usePhysicsMotion";
import type { CSSProperties } from "react";
import { useState } from "react";
import {
  DEFAULT_ENVIRONMENT_IDENTIFICATION_MODE,
  DEFAULT_UNIFIED_SETTINGS,
  type EnvironmentIdentificationMode,
  MAX_APPEARANCE_CONTRAST,
  MAX_GLASS_OPACITY,
  MAX_PANEL_ANIMATION_DURATION_MS,
  MIN_APPEARANCE_CONTRAST,
  MIN_GLASS_OPACITY,
  MIN_PANEL_ANIMATION_DURATION_MS,
} from "@t3tools/contracts/settings";
import {
  resolveSidebarStageBackdropVariant,
  type SidebarStageBackdropVariant,
  useEnvironmentStageLabel,
} from "../SidebarStageBackdrop";
import { isElectron } from "../../env";
import { useCustomThemes } from "../../hooks/useCustomThemes";
import { useTheme } from "../../hooks/useTheme";
import { useScopedSettings, useUpdateScopedSettings } from "./useScopedSettings";
import { Switch } from "../ui/switch";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { ThemeLibrary } from "./ThemeSettings";
import {
  SettingResetButton,
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";
import { PanelAnimationsPreview } from "./PanelAnimationsPreview";
import { ThreadDetailsItemsRow } from "./ThreadDetailsItemsRow";
import { TypographySection } from "./TypographySettings";

const ENVIRONMENT_IDENTIFICATION_LABELS = t.settings.rows.environmentIdentification.options;

/** Lists channel-aware artwork choices; Latest also offers fixed Dev and Nightly artwork. */
function environmentIdentificationOptions(
  stageVariant: SidebarStageBackdropVariant | null,
): ReadonlyArray<readonly [EnvironmentIdentificationMode, string]> {
  if (stageVariant === "dev") {
    return [
      ["artwork", "Dev artwork"],
      ["nightly-artwork", "Nightly artwork"],
      ["pill", ENVIRONMENT_IDENTIFICATION_LABELS.pill],
      ["none", ENVIRONMENT_IDENTIFICATION_LABELS.none],
    ];
  }
  if (stageVariant === "nightly") {
    return [
      ["artwork", "Nightly artwork"],
      ["dev-artwork", "Dev artwork"],
      ["pill", ENVIRONMENT_IDENTIFICATION_LABELS.pill],
      ["none", ENVIRONMENT_IDENTIFICATION_LABELS.none],
    ];
  }
  return [
    ["artwork", ENVIRONMENT_IDENTIFICATION_LABELS.none],
    ["nightly-artwork", "Nightly artwork"],
    ["dev-artwork", "Dev artwork"],
  ];
}

/** M3 appearance groups preserve scoped setting writes, reset actions, and search destinations. */
export function AppearanceSettingsPanel() {
  const {
    appearanceMode,
    refreshTheme,
    resolvedTheme,
    setAppearanceMode,
    setTheme,
    setThemeHalf,
    theme,
    themeHalves,
  } = useTheme();
  const customThemes = useCustomThemes();
  const [isImportThemeOpen, setIsImportThemeOpen] = useState(false);
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const environmentStageLabel = useEnvironmentStageLabel();
  const environmentStageVariant = resolveSidebarStageBackdropVariant(environmentStageLabel);
  const environmentIdentificationOptionList =
    environmentIdentificationOptions(environmentStageVariant);
  const glassOpacityRatio =
    (settings.glassOpacity - MIN_GLASS_OPACITY) / (MAX_GLASS_OPACITY - MIN_GLASS_OPACITY);
  const glassOpacitySliderStyle = {
    "--settings-slider-progress": `${glassOpacityRatio * 100}%`,
    "--settings-slider-fill-offset": `${0.5 - glassOpacityRatio}rem`,
  } as CSSProperties;
  const appearanceContrastRatio =
    (settings.appearanceContrast - MIN_APPEARANCE_CONTRAST) /
    (MAX_APPEARANCE_CONTRAST - MIN_APPEARANCE_CONTRAST);
  const appearanceContrastSliderStyle = {
    "--settings-slider-progress": `${appearanceContrastRatio * 100}%`,
    "--settings-slider-fill-offset": `${0.5 - appearanceContrastRatio}rem`,
  } as CSSProperties;
  const panelAnimationDurationRatio =
    (settings.panelAnimationDurationMs - MIN_PANEL_ANIMATION_DURATION_MS) /
    (MAX_PANEL_ANIMATION_DURATION_MS - MIN_PANEL_ANIMATION_DURATION_MS);
  const { enabled: physicsMotionEnabled } = usePhysicsMotion();
  const panelAnimationDurationSliderStyle = {
    "--settings-slider-progress": `${panelAnimationDurationRatio * 100}%`,
    "--settings-slider-fill-offset": `${0.5 - panelAnimationDurationRatio}rem`,
  } as CSSProperties;

  return (
    <SettingsPageContainer>
      <SettingsSection id="appearance" title={t.settings.sections.appearance}>
        <ThemeLibrary
          appearanceMode={appearanceMode}
          customThemes={customThemes}
          initialAppearance={resolvedTheme}
          refreshTheme={refreshTheme}
          isImportOpen={isImportThemeOpen}
          setAppearanceMode={setAppearanceMode}
          setTheme={setTheme}
          setThemeHalf={setThemeHalf}
          theme={theme}
          themeHalves={themeHalves}
          onImportOpenChange={setIsImportThemeOpen}
        />
        <SettingsRow
          {...searchableSetting("setting-appearance-contrast")}
          description={t.settings.rows.settingAppearanceContrast.description}
          resetAction={
            settings.appearanceContrast !== DEFAULT_UNIFIED_SETTINGS.appearanceContrast ? (
              <SettingResetButton
                label={t.settings.rows.settingAppearanceContrast.resetLabel}
                onClick={() =>
                  updateSettings({
                    appearanceContrast: DEFAULT_UNIFIED_SETTINGS.appearanceContrast,
                  })
                }
              />
            ) : null
          }
          control={
            <div className="flex w-50 max-w-full items-center gap-2.5">
              <output
                className="order-last w-9 shrink-0 text-right font-mono text-secondary-copy tabular-nums text-secondary-label"
                htmlFor="appearance-contrast"
              >
                {settings.appearanceContrast}%
              </output>
              <input
                aria-label={t.settings.rows.settingAppearanceContrast.title}
                className="settings-slider settings-appearance-slider min-w-0 flex-1"
                id="appearance-contrast"
                max={MAX_APPEARANCE_CONTRAST}
                min={MIN_APPEARANCE_CONTRAST}
                onChange={(event) => {
                  const appearanceContrast = Number(event.currentTarget.value);
                  if (
                    Number.isInteger(appearanceContrast) &&
                    appearanceContrast >= MIN_APPEARANCE_CONTRAST &&
                    appearanceContrast <= MAX_APPEARANCE_CONTRAST
                  ) {
                    updateSettings({ appearanceContrast });
                  }
                }}
                step={5}
                style={appearanceContrastSliderStyle}
                type="range"
                value={settings.appearanceContrast}
              />
            </div>
          }
        />

        <SettingsRow
          {...searchableSetting("setting-glass-opacity")}
          description={t.settings.rows.settingGlassOpacity.description}
          resetAction={
            settings.glassOpacity !== DEFAULT_UNIFIED_SETTINGS.glassOpacity ? (
              <SettingResetButton
                label={t.settings.rows.settingGlassOpacity.resetLabel}
                onClick={() =>
                  updateSettings({ glassOpacity: DEFAULT_UNIFIED_SETTINGS.glassOpacity })
                }
              />
            ) : null
          }
          control={
            <div className="flex w-50 max-w-full items-center gap-2.5">
              <output
                className="order-last w-9 shrink-0 text-right font-mono text-secondary-copy tabular-nums text-secondary-label"
                htmlFor="glass-opacity"
              >
                {settings.glassOpacity}%
              </output>
              <input
                aria-label={t.settings.rows.settingGlassOpacity.title}
                className="settings-slider settings-appearance-slider min-w-0 flex-1"
                id="glass-opacity"
                max={MAX_GLASS_OPACITY}
                min={MIN_GLASS_OPACITY}
                onChange={(event) => {
                  const glassOpacity = Number(event.currentTarget.value);
                  if (
                    Number.isInteger(glassOpacity) &&
                    glassOpacity >= MIN_GLASS_OPACITY &&
                    glassOpacity <= MAX_GLASS_OPACITY
                  ) {
                    updateSettings({ glassOpacity });
                  }
                }}
                step={5}
                style={glassOpacitySliderStyle}
                type="range"
                value={settings.glassOpacity}
              />
            </div>
          }
        />

        {isElectron ? <BackgroundImageSetting /> : null}

        <SettingsRow
          {...searchableSetting("diff-color-scheme")}
          description={t.settings.rows.diffColorScheme.description}
          resetAction={
            settings.diffColorScheme !== DEFAULT_UNIFIED_SETTINGS.diffColorScheme ? (
              <SettingResetButton
                label={t.settings.rows.diffColorScheme.resetLabel}
                onClick={() =>
                  updateSettings({ diffColorScheme: DEFAULT_UNIFIED_SETTINGS.diffColorScheme })
                }
              />
            ) : null
          }
          control={
            <ToggleGroup
              size="settings"
              value={[settings.diffColorScheme]}
              aria-label={t.settings.rows.diffColorScheme.title}
              onValueChange={(values) => {
                const value = values[0];
                if (value === "blue-orange" || value === "red-green") {
                  updateSettings({ diffColorScheme: value });
                }
              }}
            >
              <ToggleGroupItem value="blue-orange">
                {t.settings.rows.diffColorScheme.options.blueOrange}
              </ToggleGroupItem>
              <ToggleGroupItem value="red-green">
                {t.settings.rows.diffColorScheme.options.redGreenDefault}
              </ToggleGroupItem>
            </ToggleGroup>
          }
        />
      </SettingsSection>
      <SettingsSection id="appearance-interface" title={t.settings.sections.appearanceInterface}>
        <ThreadDetailsItemsRow />
        <SettingsRow
          {...searchableSetting("chat-width")}
          description={t.settings.rows.chatWidth.description}
          resetAction={
            settings.chatWidth !== DEFAULT_UNIFIED_SETTINGS.chatWidth ? (
              <SettingResetButton
                label={t.settings.rows.chatWidth.resetLabel}
                onClick={() => updateSettings({ chatWidth: DEFAULT_UNIFIED_SETTINGS.chatWidth })}
              />
            ) : null
          }
          control={
            <ToggleGroup
              size="settings"
              value={[settings.chatWidth]}
              aria-label={t.settings.rows.chatWidth.title}
              onValueChange={(values) => {
                const value = values[0];
                if (value === "comfortable" || value === "wide" || value === "full") {
                  updateSettings({ chatWidth: value });
                }
              }}
            >
              <ToggleGroupItem value="comfortable">
                {t.settings.rows.chatWidth.comfortableDefaultLabel}
              </ToggleGroupItem>
              <ToggleGroupItem value="wide">
                {t.settings.rows.chatWidth.options.wide}
              </ToggleGroupItem>
              <ToggleGroupItem value="full">
                {t.settings.rows.chatWidth.options.full}
              </ToggleGroupItem>
            </ToggleGroup>
          }
        />
        <SettingsRow
          {...searchableSetting("environment-identification")}
          description={t.settings.rows.environmentIdentification.description}
          resetAction={
            settings.environmentIdentificationMode !== DEFAULT_ENVIRONMENT_IDENTIFICATION_MODE ? (
              <SettingResetButton
                label={t.settings.rows.environmentIdentification.resetLabel}
                onClick={() =>
                  updateSettings({
                    environmentIdentificationMode: DEFAULT_ENVIRONMENT_IDENTIFICATION_MODE,
                  })
                }
              />
            ) : null
          }
          control={
            <ToggleGroup
              size="settings"
              value={[settings.environmentIdentificationMode]}
              aria-label={t.settings.rows.environmentIdentification.title}
              onValueChange={(values) => {
                const value = values[0];
                const option = environmentIdentificationOptionList.find(
                  ([optionValue]) => optionValue === value,
                );
                if (option) {
                  updateSettings({ environmentIdentificationMode: option[0] });
                }
              }}
            >
              {environmentIdentificationOptionList.map(([value, label]) => (
                <ToggleGroupItem key={value} value={value}>
                  {label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          }
        />

        <SettingsRow
          {...searchableSetting("composer-context")}
          description={t.settings.rows.composerContext.description}
          resetAction={
            settings.persistComposerContextStrip !==
            DEFAULT_UNIFIED_SETTINGS.persistComposerContextStrip ? (
              <SettingResetButton
                label={t.settings.rows.composerContext.resetLabel}
                onClick={() =>
                  updateSettings({
                    persistComposerContextStrip:
                      DEFAULT_UNIFIED_SETTINGS.persistComposerContextStrip,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.persistComposerContextStrip}
              onCheckedChange={(checked) =>
                updateSettings({ persistComposerContextStrip: Boolean(checked) })
              }
              aria-label={t.settings.rows.composerContext.ariaLabel}
            />
          }
        />
      </SettingsSection>
      <SettingsSection id="motion" title={t.settings.sections.appearanceMotion}>
        <SettingsRow
          {...searchableSetting("physics-motion")}
          description={t.settings.rows.physicsMotion.description}
          control={
            <ToggleGroup
              size="settings"
              value={[settings.physicsMotion]}
              aria-label={t.settings.rows.physicsMotion.ariaLabel}
              onValueChange={(values) => {
                const physicsMotion = values[0];
                if (
                  physicsMotion === "on" ||
                  physicsMotion === "system" ||
                  physicsMotion === "off"
                ) {
                  updateSettings({ physicsMotion });
                }
              }}
            >
              <ToggleGroupItem value="on">{t.settings.rows.physicsMotion.on}</ToggleGroupItem>
              <ToggleGroupItem value="system">
                {t.settings.rows.physicsMotion.system}
              </ToggleGroupItem>
              <ToggleGroupItem value="off">{t.settings.rows.physicsMotion.off}</ToggleGroupItem>
            </ToggleGroup>
          }
          resetAction={
            settings.physicsMotion !== DEFAULT_UNIFIED_SETTINGS.physicsMotion ? (
              <SettingResetButton
                label={t.settings.rows.physicsMotion.resetLabel}
                onClick={() =>
                  updateSettings({ physicsMotion: DEFAULT_UNIFIED_SETTINGS.physicsMotion })
                }
              />
            ) : null
          }
        />
        <SettingsRow
          {...searchableSetting("math-rendering")}
          description={t.settings.conversationRenderingUi.mathHint}
          resetAction={
            settings.mathRenderingEnabled !== DEFAULT_UNIFIED_SETTINGS.mathRenderingEnabled ? (
              <SettingResetButton
                label={t.settings.conversationRenderingUi.mathReset}
                onClick={() =>
                  updateSettings({
                    mathRenderingEnabled: DEFAULT_UNIFIED_SETTINGS.mathRenderingEnabled,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.mathRenderingEnabled}
              onCheckedChange={(checked) =>
                updateSettings({ mathRenderingEnabled: Boolean(checked) })
              }
              aria-label={t.settings.conversationRenderingUi.math}
            />
          }
        />
        <SettingsRow
          {...searchableSetting("panel-animations")}
          description={
            physicsMotionEnabled
              ? t.settings.rows.panelAnimations.overriddenByPhysics
              : t.settings.rows.panelAnimations.description
          }
          controlLayout="full"
          control={
            <div className="flex w-full flex-wrap items-center gap-4">
              <div className="min-w-40 flex-1">
                <PanelAnimationsPreview durationMs={settings.panelAnimationDurationMs} />
              </div>
              <div className="flex w-full items-center gap-2.5">
                <output
                  className="order-last w-16 shrink-0 text-right font-mono text-secondary-copy tabular-nums text-secondary-label"
                  htmlFor="panel-animation-duration"
                >
                  {settings.panelAnimationDurationMs} ms
                </output>
                <input
                  aria-label={t.settings.rows.panelAnimations.ariaLabel}
                  className="settings-slider settings-appearance-slider min-w-0 flex-1 disabled:cursor-not-allowed disabled:opacity-50 disabled:grayscale"
                  disabled={physicsMotionEnabled}
                  id="panel-animation-duration"
                  max={MAX_PANEL_ANIMATION_DURATION_MS}
                  min={MIN_PANEL_ANIMATION_DURATION_MS}
                  onChange={(event) => {
                    const panelAnimationDurationMs = Number(event.currentTarget.value);
                    if (
                      Number.isInteger(panelAnimationDurationMs) &&
                      panelAnimationDurationMs >= MIN_PANEL_ANIMATION_DURATION_MS &&
                      panelAnimationDurationMs <= MAX_PANEL_ANIMATION_DURATION_MS
                    ) {
                      updateSettings({ panelAnimationDurationMs });
                    }
                  }}
                  step={25}
                  style={panelAnimationDurationSliderStyle}
                  type="range"
                  value={settings.panelAnimationDurationMs}
                />
              </div>
            </div>
          }
          resetAction={
            settings.panelAnimationDurationMs !==
            DEFAULT_UNIFIED_SETTINGS.panelAnimationDurationMs ? (
              <SettingResetButton
                label={t.settings.rows.panelAnimations.resetLabel}
                onClick={() =>
                  updateSettings({
                    panelAnimationDurationMs: DEFAULT_UNIFIED_SETTINGS.panelAnimationDurationMs,
                  })
                }
              />
            ) : null
          }
        />
      </SettingsSection>

      <TypographySection />
    </SettingsPageContainer>
  );
}
