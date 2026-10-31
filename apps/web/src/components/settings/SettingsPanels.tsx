/** Renders general settings and restores scoped defaults through the existing settings commands. */
import { AboutVersionTitle } from "./AboutVersionTitle";
import { SnoozePresetsRow } from "./SnoozePresetsSettings";
import { SettingsGroup } from "./SettingsGroup";
import { LanguageSetting } from "./LanguageSetting";
import { t } from "~/i18n";
import { SNOOZE_UI_ENABLED } from "~/snoozeUi";
import { AutoSettleDaysInput } from "./AutoSettleDaysInput";
import { NotificationSettings } from "./NotificationSettings";
import { PRIVACY_POLICY_URL } from "../../legalLinks";
import { CheckIcon, ChevronRightIcon, FolderOpenIcon } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  type DesktopUpdateChannel,
  ProviderDriverKind,
  type ProviderInstanceId,
} from "@t3tools/contracts";
import {
  DEFAULT_UNIFIED_SETTINGS,
  type ResponseStreamingMode,
  SidebarProjectSortOrder,
} from "@t3tools/contracts/settings";
import { createModelSelection } from "@t3tools/shared/model";
import * as Equal from "effect/Equal";
import * as Schema from "effect/Schema";
import { HOSTED_APP_CHANNEL, HOSTED_APP_CHANNEL_LABEL } from "../../branding";
import { CliCommandSettingsRow } from "./CliCommandSettingsRow";
import { MobileAppSettingsRow } from "./MobileAppSettingsRow";
import {
  canCheckForUpdate,
  getDesktopUpdateButtonTooltip,
  getDesktopUpdateDisabledReason,
  getDesktopUpdateInstallConfirmationMessage,
  isDesktopUpdateButtonDisabled,
  resolveDesktopUpdateButtonAction,
} from "../../components/desktopUpdate.logic";
import { ProviderModelPicker } from "../chat/ProviderModelPicker";
import { TraitsPicker } from "../chat/TraitsPicker";
import { isElectron } from "../../env";
import { buildHostedChannelSelectionUrl, type HostedAppChannel } from "../../hostedPairing";
import {
  readAppearanceModePreference,
  readThemeHalves,
  readThemePreference,
  useTheme,
} from "../../hooks/useTheme";
import {
  useScopedSettings,
  useScopedSettingsMixed,
  useUpdateScopedSettings,
} from "./useScopedSettings";
import { useScopedModelDisabledReason } from "./useScopedModelAvailability";
import { useSettingsScope } from "./SettingsScopeContext";
import {
  DefaultModelSetting,
  DefaultPermissionsSetting,
  DefaultWorkspaceSetting,
  DefaultSubmodulesSetting,
} from "./ProjectDefaultsSettings";
import { useDesktopUpdateState } from "../../state/desktopUpdate";
import {
  getCustomModelOptionsByInstance,
  resolveAppModelSelectionState,
  selectsPlanAgent,
} from "../../modelSelection";
import { providerInstanceEntriesFor } from "../../providerInstances";
import { ensureLocalApi, readLocalApi } from "../../localApi";
import { isMacPlatform } from "../../lib/utils";
import { useEnvironmentProviders } from "../../state/environments";
import { EMPTY_SERVER_PROVIDERS } from "../../state/server";
import { Button } from "../ui/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "../ui/collapsible";
import { DraftInput } from "../ui/draft-input";
import { resolvePickedFolderPath } from "./GeneralPathInput.logic";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { Kbd } from "../ui/kbd";
import { ScopedSwitch } from "./ScopedSwitch";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  getChangedBrowserSettingLabels,
  getChangedTypographySettingLabels,
  hasChangedBackgroundActivitySettings,
  rememberEnabledProjectGroupingMode,
} from "./SettingsPanels.logic";
import {
  SETTINGS_PICKER_TRIGGER_CLASSNAME,
  SettingResetButton,
  SettingsPageContainer,
  SettingsSearchTarget,
  SettingsRow,
  SettingsSection,
  useSettingsSearchTarget,
  useSettingsSearchTargetId,
} from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";
import { IDLE_COMPACTION_MODES, globalIdleCompaction } from "@t3tools/contracts";
import { scopedIdleCompaction } from "./scopedSettings";
import { ThreadTitleInstructionsSettings } from "./ThreadTitleInstructionsSettings";
import { BackgroundActivitySettingsRow } from "./BackgroundActivitySettings";

const RESPONSE_STREAMING_MODE_LABELS = t.settings.rows.responseStreaming.options;

const RESPONSE_STREAMING_MODE_DESCRIPTIONS = t.settings.rows.responseStreaming.descriptions;

const SIDEBAR_PROJECT_SORT_ORDER_LABELS = t.settings.rows.projectOrder.options;

const isSidebarProjectSortOrder = Schema.is(SidebarProjectSortOrder);

const TIMESTAMP_FORMAT_LABELS = {
  locale: t.common.system,
  "12-hour": t.settings.rows.timeFormat.options.twelveHour,
  "24-hour": t.settings.rows.timeFormat.options.twentyFourHour,
};

const DIFF_LAYOUT_LABELS = t.settings.rows.diffLayout.options;

const QUIT_CONFIRMATION_MODE_LABELS = t.settings.rows.quitConfirmation.options;

const DEFAULT_DRIVER_KIND = ProviderDriverKind.make("codex");

/** Shows version/update actions; desktop channel selection preserves the bridge's save/error lifecycle. */
function AboutVersionSection() {
  const updateState = useDesktopUpdateState();
  const [isChangingUpdateChannel, setIsChangingUpdateChannel] = useState(false);
  const [isUpdateActionPending, setIsUpdateActionPending] = useState(false);

  const hasDesktopBridge = typeof window !== "undefined" && Boolean(window.desktopBridge);
  const selectedUpdateChannel = updateState?.channel ?? "latest";
  const selectedHostedAppChannel = hasDesktopBridge ? null : HOSTED_APP_CHANNEL;

  const handleUpdateChannelChange = (channel: DesktopUpdateChannel) => {
    const bridge = window.desktopBridge;
    if (
      !bridge ||
      typeof bridge.setUpdateChannel !== "function" ||
      channel === selectedUpdateChannel
    ) {
      return;
    }

    setIsChangingUpdateChannel(true);
    void bridge
      .setUpdateChannel(channel)
      .catch((error: unknown) => {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: t.settings.about.changeTrackError,
            description:
              error instanceof Error ? error.message : t.settings.about.changeTrackErrorDescription,
          }),
        );
      })
      .finally(() => {
        setIsChangingUpdateChannel(false);
      });
  };

  const handleButtonClick = async () => {
    const bridge = window.desktopBridge;
    if (!bridge) return;

    const action = updateState ? resolveDesktopUpdateButtonAction(updateState) : "none";

    if (action === "download") {
      void bridge.downloadUpdate().catch((error: unknown) => {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: t.settings.about.downloadError,
            description:
              error instanceof Error ? error.message : t.settings.about.downloadErrorDescription,
          }),
        );
      });
      return;
    }

    if (action === "install") {
      if (isUpdateActionPending) return;
      setIsUpdateActionPending(true);
      let confirmed = false;
      try {
        confirmed = await ensureLocalApi().dialogs.confirm(
          getDesktopUpdateInstallConfirmationMessage(
            updateState ?? { availableVersion: null, downloadedVersion: null },
          ),
        );
      } catch (error) {
        setIsUpdateActionPending(false);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: t.settings.about.confirmError,
            description:
              error instanceof Error ? error.message : t.settings.about.confirmErrorDescription,
          }),
        );
        return;
      }
      if (!confirmed) {
        setIsUpdateActionPending(false);
        return;
      }
      void bridge
        .installUpdate()
        .catch((error: unknown) => {
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: t.settings.about.installError,
              description:
                error instanceof Error ? error.message : t.settings.about.installErrorDescription,
            }),
          );
        })
        .finally(() => setIsUpdateActionPending(false));
      return;
    }

    if (typeof bridge.checkForUpdate !== "function") return;
    void bridge
      .checkForUpdate()
      .then((result) => {
        if (!result.checked) {
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: t.settings.about.checkError,
              description: result.state.message ?? t.settings.about.unavailableHint,
            }),
          );
        }
      })
      .catch((error: unknown) => {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: t.settings.about.checkError,
            description:
              error instanceof Error ? error.message : t.settings.about.checkErrorDescription,
          }),
        );
      });
  };

  const action = updateState ? resolveDesktopUpdateButtonAction(updateState) : "none";
  const buttonTooltip = updateState ? getDesktopUpdateButtonTooltip(updateState) : null;
  const buttonDisabled =
    action === "none"
      ? !canCheckForUpdate(updateState)
      : isDesktopUpdateButtonDisabled(updateState);

  const actionLabel: Record<string, string> = {
    download: t.settings.about.download,
    install: t.settings.about.install,
  };
  const statusLabel: Record<string, string> = {
    checking: t.settings.about.checking,
    downloading: t.settings.about.downloading,
    "up-to-date": t.settings.about.upToDate,
  };
  const buttonLabel =
    actionLabel[action] ??
    statusLabel[updateState?.status ?? ""] ??
    t.settings.about.checkForUpdates;
  const description =
    action === "download" || action === "install"
      ? t.settings.about.updateAvailableHint
      : (getDesktopUpdateDisabledReason(updateState) ?? t.settings.general.appVersionDescription);

  return (
    <>
      <SettingsRow
        id={searchableSetting("app-version").id}
        title={<AboutVersionTitle />}
        description={description}
        control={
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="md"
                  variant="outline"
                  disabled={buttonDisabled || isUpdateActionPending}
                  onClick={handleButtonClick}
                >
                  {buttonLabel}
                </Button>
              }
            />
            {buttonTooltip ? <TooltipPopup>{buttonTooltip}</TooltipPopup> : null}
          </Tooltip>
        }
      />
      {hasDesktopBridge ? (
        <SettingsRow
          {...searchableSetting("update-track")}
          description={t.settings.about.updateTrack.description}
          control={
            <ToggleGroup
              size="settings"
              value={[selectedUpdateChannel]}
              onValueChange={(values) => {
                const value = values[0];
                if (value === "latest" || value === "nightly") handleUpdateChannelChange(value);
              }}
              aria-label={t.settings.about.updateTrack.title}
              disabled={isChangingUpdateChannel}
            >
              <ToggleGroupItem value="latest">
                {t.settings.about.updateTrack.options.stable}
              </ToggleGroupItem>
              <ToggleGroupItem value="nightly">
                {t.settings.about.updateTrack.options.nightly}
              </ToggleGroupItem>
            </ToggleGroup>
          }
        />
      ) : selectedHostedAppChannel ? (
        <SettingsRow
          {...searchableSetting("update-track")}
          description={t.settings.about.hostedTrack.description}
          control={
            <Select
              value={selectedHostedAppChannel}
              onValueChange={(value) => {
                if (value === selectedHostedAppChannel) return;
                window.location.assign(
                  buildHostedChannelSelectionUrl({ channel: value as HostedAppChannel }),
                );
              }}
            >
              <SelectTrigger size="settings" aria-label={t.settings.about.updateTrack.title}>
                <SelectValue>{HOSTED_APP_CHANNEL_LABEL}</SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem hideIndicator value="latest">
                  {t.settings.about.updateTrack.options.latest}
                </SelectItem>
                <SelectItem hideIndicator value="nightly">
                  {t.settings.about.updateTrack.options.nightly}
                </SelectItem>
              </SelectPopup>
            </Select>
          }
        />
      ) : null}
      {hasDesktopBridge ? <CliCommandSettingsRow /> : null}
    </>
  );
}

/**
 * Tracks changed settings and restores defaults through the selected settings scope.
 * @param onRestored Optional notification after requesting the reset, not a persistence receipt.
 * @returns Changed labels and a reset callback; server rows, including export location, use server defaults.
 */
export function useSettingsRestore(onRestored?: () => void) {
  const {
    theme,
    setTheme,
    followSystem,
    setFollowSystem,
    setThemeHalf,
    clearThemeHalves,
    themeHalves,
  } = useTheme();
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();

  const isTextGenerationModelDirty = !Equal.equals(
    settings.textGenerationModelSelection ?? null,
    DEFAULT_UNIFIED_SETTINGS.textGenerationModelSelection ?? null,
  );
  const isBackgroundActivityDirty = hasChangedBackgroundActivitySettings(settings);

  const changedSettingLabels = [
    ...(theme !== "system" ? [t.settings.restore.themeLabel] : []),
    ...(!followSystem ? [t.settings.rows.language.options.system] : []),
    ...(themeHalves !== null ? [t.settings.restore.themeMixLabel] : []),
    ...(settings.appearanceContrast !== DEFAULT_UNIFIED_SETTINGS.appearanceContrast
      ? [t.settings.rows.settingAppearanceContrast.title]
      : []),
    ...(settings.glassOpacity !== DEFAULT_UNIFIED_SETTINGS.glassOpacity
      ? [t.settings.rows.settingGlassOpacity.title]
      : []),
    ...(settings.diffColorScheme !== DEFAULT_UNIFIED_SETTINGS.diffColorScheme
      ? [t.settings.rows.diffColorScheme.title]
      : []),
    ...(settings.chatWidth !== DEFAULT_UNIFIED_SETTINGS.chatWidth
      ? [t.settings.rows.chatWidth.title]
      : []),
    ...(settings.panelAnimationDurationMs !== DEFAULT_UNIFIED_SETTINGS.panelAnimationDurationMs
      ? [t.settings.rows.panelAnimations.title]
      : []),
    ...(settings.physicsMotion !== DEFAULT_UNIFIED_SETTINGS.physicsMotion
      ? [t.settings.rows.physicsMotion.title]
      : []),
    ...(settings.environmentIdentificationMode !==
    DEFAULT_UNIFIED_SETTINGS.environmentIdentificationMode
      ? [t.settings.rows.environmentIdentification.title]
      : []),
    ...(settings.timestampFormat !== DEFAULT_UNIFIED_SETTINGS.timestampFormat
      ? [t.settings.rows.timeFormat.title]
      : []),
    ...(settings.notificationMode !== DEFAULT_UNIFIED_SETTINGS.notificationMode
      ? [t.settings.rows.threadNotifications.title]
      : []),
    ...(settings.inAppNotificationsEnabled !== DEFAULT_UNIFIED_SETTINGS.inAppNotificationsEnabled
      ? [t.settings.rows.inAppNotifications.title]
      : []),
    ...(settings.sidebarProjectGroupingMode !== DEFAULT_UNIFIED_SETTINGS.sidebarProjectGroupingMode
      ? [t.settings.restore.projectGroupingLabel]
      : []),
    ...(settings.sidebarProjectSortOrder !== DEFAULT_UNIFIED_SETTINGS.sidebarProjectSortOrder
      ? [t.settings.rows.projectOrder.title]
      : []),
    ...(settings.sidebarWorkingShelfEnabled !== DEFAULT_UNIFIED_SETTINGS.sidebarWorkingShelfEnabled
      ? [t.settings.restore.workingShelfLabel]
      : []),
    ...(settings.sidebarAutoSettleAfterDays !== DEFAULT_UNIFIED_SETTINGS.sidebarAutoSettleAfterDays
      ? [t.settings.rows.autoSettleInactiveThreads.title]
      : []),
    ...(settings.sidebarAutoSettleOnMerge !== DEFAULT_UNIFIED_SETTINGS.sidebarAutoSettleOnMerge
      ? [t.settings.rows.autoSettleMergedThreads.title]
      : []),
    ...(settings.autoResumeLimitedThreads !== DEFAULT_UNIFIED_SETTINGS.autoResumeLimitedThreads
      ? [t.settings.rows.autoResumeLimitedThreads.title]
      : []),
    ...(SNOOZE_UI_ENABLED &&
    settings.snoozeLimitedThreads !== DEFAULT_UNIFIED_SETTINGS.snoozeLimitedThreads
      ? [t.settings.rows.snoozeLimitedThreads.title]
      : []),
    ...(SNOOZE_UI_ENABLED &&
    !Equal.equals(settings.snoozePresets, DEFAULT_UNIFIED_SETTINGS.snoozePresets)
      ? ["Snooze options"]
      : []),
    ...(settings.wordWrap !== DEFAULT_UNIFIED_SETTINGS.wordWrap
      ? [t.settings.rows.wordWrap.title]
      : []),
    ...(settings.persistComposerContextStrip !==
    DEFAULT_UNIFIED_SETTINGS.persistComposerContextStrip
      ? [t.settings.rows.composerContext.title]
      : []),
    ...getChangedTypographySettingLabels(settings),
    ...(settings.diffFilesCollapsed !== DEFAULT_UNIFIED_SETTINGS.diffFilesCollapsed
      ? [t.settings.rows.defaultDiffFileState.title]
      : []),
    ...(settings.diffIgnoreWhitespace !== DEFAULT_UNIFIED_SETTINGS.diffIgnoreWhitespace
      ? [t.settings.restore.diffWhitespaceLabel]
      : []),
    ...(settings.diffLayout !== DEFAULT_UNIFIED_SETTINGS.diffLayout
      ? [t.settings.rows.diffLayout.title]
      : []),
    ...(settings.proactivePanelsEnabled !== DEFAULT_UNIFIED_SETTINGS.proactivePanelsEnabled
      ? [t.settings.rows.proactivePanels.title]
      : []),
    ...(settings.showSkillsInSlashMenu !== DEFAULT_UNIFIED_SETTINGS.showSkillsInSlashMenu
      ? [t.settings.rows.skillsInSlashMenu.title]
      : []),
    ...(settings.composerCollapseOnScroll !== DEFAULT_UNIFIED_SETTINGS.composerCollapseOnScroll
      ? [t.settings.rows.composerCollapse.title]
      : []),
    ...(settings.composerRichTextEnabled !== DEFAULT_UNIFIED_SETTINGS.composerRichTextEnabled
      ? [t.settings.rows.composerRichText.title]
      : []),
    ...(settings.composerSuggestionsEnabled !== DEFAULT_UNIFIED_SETTINGS.composerSuggestionsEnabled
      ? [t.settings.rows.composerSuggestions.title]
      : []),
    ...(settings.composerPromptOptimizeEnabled !==
    DEFAULT_UNIFIED_SETTINGS.composerPromptOptimizeEnabled
      ? [t.settings.rows.composerPromptOptimize.title]
      : []),
    ...(settings.sendShortcut !== DEFAULT_UNIFIED_SETTINGS.sendShortcut
      ? [t.settings.rows.sendShortcut.title]
      : []),
    ...(settings.followUpBehavior !== DEFAULT_UNIFIED_SETTINGS.followUpBehavior
      ? [t.settings.rows.followUpBehavior.title]
      : []),
    ...(settings.contextWindowMeterEnabled !== DEFAULT_UNIFIED_SETTINGS.contextWindowMeterEnabled
      ? [t.settings.restore.contextWindowLabel]
      : []),
    ...(settings.responseStreamingMode !== DEFAULT_UNIFIED_SETTINGS.responseStreamingMode
      ? [t.settings.rows.responseStreaming.title]
      : []),
    ...(settings.enableProviderUpdateChecks !== DEFAULT_UNIFIED_SETTINGS.enableProviderUpdateChecks
      ? [t.settings.rows.providerUpdateChecks.title]
      : []),
    ...(settings.continueThreadsAfterServerUpdate !==
    DEFAULT_UNIFIED_SETTINGS.continueThreadsAfterServerUpdate
      ? [t.settings.rows.continueThreadsAfterServerUpdate.title]
      : []),
    ...(isBackgroundActivityDirty ? [t.settings.rows.backgroundActivity.title] : []),
    ...(settings.defaultThreadEnvMode !== DEFAULT_UNIFIED_SETTINGS.defaultThreadEnvMode
      ? [t.settings.restore.newThreadModeLabel]
      : []),
    ...(settings.newWorktreesStartFromOrigin !==
    DEFAULT_UNIFIED_SETTINGS.newWorktreesStartFromOrigin
      ? [t.settings.restore.startFromOriginLabel]
      : []),
    ...(settings.addProjectBaseDirectory !== DEFAULT_UNIFIED_SETTINGS.addProjectBaseDirectory
      ? [t.settings.rows.addProjectStartsIn.ariaLabel]
      : []),
    ...(settings.threadExportDirectory !== DEFAULT_UNIFIED_SETTINGS.threadExportDirectory
      ? [t.settings.rows.threadExportDirectory.ariaLabel]
      : []),
    ...(settings.confirmThreadUnpin !== DEFAULT_UNIFIED_SETTINGS.confirmThreadUnpin
      ? [t.settings.rows.unpinConfirmation.title]
      : []),
    ...(settings.confirmThreadArchive !== DEFAULT_UNIFIED_SETTINGS.confirmThreadArchive
      ? [t.settings.rows.archiveConfirmation.title]
      : []),
    ...(settings.confirmThreadDelete !== DEFAULT_UNIFIED_SETTINGS.confirmThreadDelete
      ? [t.settings.rows.deleteConfirmation.title]
      : []),
    ...(settings.confirmQuit !== DEFAULT_UNIFIED_SETTINGS.confirmQuit
      ? [t.settings.rows.quitConfirmation.title]
      : []),
    ...(isTextGenerationModelDirty ? [t.settings.rows.textGenerationModel.title] : []),
    ...(settings.threadTitleInstructions !== DEFAULT_UNIFIED_SETTINGS.threadTitleInstructions
      ? [t.settings.threadTitleInstructions.title]
      : []),
    ...(globalIdleCompaction(settings) !== globalIdleCompaction(DEFAULT_UNIFIED_SETTINGS)
      ? [t.settings.conversationRenderingUi.compact]
      : []),
    ...getChangedBrowserSettingLabels(settings),
    ...(settings.enableAgentBrowserAccess !== DEFAULT_UNIFIED_SETTINGS.enableAgentBrowserAccess
      ? [t.settings.rows.agentBrowserAccess.title]
      : []),
    ...(settings.mathRenderingEnabled !== DEFAULT_UNIFIED_SETTINGS.mathRenderingEnabled
      ? [t.settings.conversationRenderingUi.math]
      : []),
    ...(settings.sidebarAutoSettleKeepPullRequests !==
    DEFAULT_UNIFIED_SETTINGS.sidebarAutoSettleKeepPullRequests
      ? [t.settings.conversationRenderingUi.keepPr]
      : []),
  ];

  const restoreDefaults = async () => {
    if (changedSettingLabels.length === 0) return;
    const api = readLocalApi();
    const confirmed = await (api ?? ensureLocalApi()).dialogs.confirm(
      [
        t.settings.restore.confirmTitle,
        t.settings.restore.confirmDescription(changedSettingLabels.join(", ")),
      ].join("\n"),
      { variant: "destructive" },
    );
    if (!confirmed) return;

    // Only touch the theme keys that are actually dirty, so a theme-storage
    // failure cannot block restoring unrelated settings. Preferences are
    // re-read after the confirmation dialog: they may have changed (another
    // tab, an OS flip) while it was open, and rollback must restore the live
    // values rather than the ones captured at render time.
    let previousTheme = theme;
    try {
      previousTheme = readThemePreference();
    } catch {}
    const liveHalves = readThemeHalves();
    const needsThemeReset = previousTheme !== "system";
    const needsMixReset = liveHalves !== null;
    const needsFollowSystemReset = readAppearanceModePreference(previousTheme) !== "system";
    const notifyThemeRestoreFailure = () => {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: t.settings.restore.themeError,
          description: t.settings.restore.retryHint,
        }),
      );
    };
    // Rollback restores the base preference first (which clears any mix) and
    // then re-applies the captured mix on top, so no failure path can leave
    // the pair of keys half-restored.
    const previousHalves = liveHalves;
    const rollbackThemeState = () => {
      if (needsThemeReset) setTheme(previousTheme);
      if (previousHalves?.light) setThemeHalf("light", previousHalves.light);
      if (previousHalves?.dark) setThemeHalf("dark", previousHalves.dark);
    };
    if (needsThemeReset && !setTheme("system")) {
      notifyThemeRestoreFailure();
      return;
    }
    if (needsMixReset && !clearThemeHalves()) {
      rollbackThemeState();
      notifyThemeRestoreFailure();
      return;
    }
    if (needsFollowSystemReset && !setFollowSystem(true)) {
      rollbackThemeState();
      notifyThemeRestoreFailure();
      return;
    }
    updateSettings({
      appearanceContrast: DEFAULT_UNIFIED_SETTINGS.appearanceContrast,
      diffColorScheme: DEFAULT_UNIFIED_SETTINGS.diffColorScheme,
      chatWidth: DEFAULT_UNIFIED_SETTINGS.chatWidth,
      mathRenderingEnabled: DEFAULT_UNIFIED_SETTINGS.mathRenderingEnabled,
      timestampFormat: DEFAULT_UNIFIED_SETTINGS.timestampFormat,
      notificationMode: DEFAULT_UNIFIED_SETTINGS.notificationMode,
      inAppNotificationsEnabled: DEFAULT_UNIFIED_SETTINGS.inAppNotificationsEnabled,
      wordWrap: DEFAULT_UNIFIED_SETTINGS.wordWrap,
      persistComposerContextStrip: DEFAULT_UNIFIED_SETTINGS.persistComposerContextStrip,
      diffFilesCollapsed: DEFAULT_UNIFIED_SETTINGS.diffFilesCollapsed,
      diffIgnoreWhitespace: DEFAULT_UNIFIED_SETTINGS.diffIgnoreWhitespace,
      diffLayout: DEFAULT_UNIFIED_SETTINGS.diffLayout,
      proactivePanelsEnabled: DEFAULT_UNIFIED_SETTINGS.proactivePanelsEnabled,
      showSkillsInSlashMenu: DEFAULT_UNIFIED_SETTINGS.showSkillsInSlashMenu,
      composerCollapseOnScroll: DEFAULT_UNIFIED_SETTINGS.composerCollapseOnScroll,
      composerRichTextEnabled: DEFAULT_UNIFIED_SETTINGS.composerRichTextEnabled,
      composerSuggestionsEnabled: DEFAULT_UNIFIED_SETTINGS.composerSuggestionsEnabled,
      composerPromptOptimizeEnabled: DEFAULT_UNIFIED_SETTINGS.composerPromptOptimizeEnabled,
      sendShortcut: DEFAULT_UNIFIED_SETTINGS.sendShortcut,
      followUpBehavior: DEFAULT_UNIFIED_SETTINGS.followUpBehavior,
      contextWindowMeterEnabled: DEFAULT_UNIFIED_SETTINGS.contextWindowMeterEnabled,
      environmentIdentificationMode: DEFAULT_UNIFIED_SETTINGS.environmentIdentificationMode,
      glassOpacity: DEFAULT_UNIFIED_SETTINGS.glassOpacity,
      panelAnimationDurationMs: DEFAULT_UNIFIED_SETTINGS.panelAnimationDurationMs,
      physicsMotion: DEFAULT_UNIFIED_SETTINGS.physicsMotion,
      sidebarProjectGroupingMode: DEFAULT_UNIFIED_SETTINGS.sidebarProjectGroupingMode,
      sidebarProjectSortOrder: DEFAULT_UNIFIED_SETTINGS.sidebarProjectSortOrder,
      sidebarWorkingShelfEnabled: DEFAULT_UNIFIED_SETTINGS.sidebarWorkingShelfEnabled,
      sidebarAutoSettleAfterDays: DEFAULT_UNIFIED_SETTINGS.sidebarAutoSettleAfterDays,
      sidebarAutoSettleKeepPullRequests: DEFAULT_UNIFIED_SETTINGS.sidebarAutoSettleKeepPullRequests,
      sidebarAutoSettleOnMerge: DEFAULT_UNIFIED_SETTINGS.sidebarAutoSettleOnMerge,
      autoResumeLimitedThreads: DEFAULT_UNIFIED_SETTINGS.autoResumeLimitedThreads,
      // Hidden controls must not be silently reset by the visible settings confirmation.
      ...(SNOOZE_UI_ENABLED
        ? {
            snoozeLimitedThreads: DEFAULT_UNIFIED_SETTINGS.snoozeLimitedThreads,
            snoozePresets: DEFAULT_UNIFIED_SETTINGS.snoozePresets,
          }
        : {}),
      responseStreamingMode: DEFAULT_UNIFIED_SETTINGS.responseStreamingMode,
      enableProviderUpdateChecks: DEFAULT_UNIFIED_SETTINGS.enableProviderUpdateChecks,
      continueThreadsAfterServerUpdate: DEFAULT_UNIFIED_SETTINGS.continueThreadsAfterServerUpdate,
      backgroundActivity: DEFAULT_UNIFIED_SETTINGS.backgroundActivity,
      backgroundActivityProfile: DEFAULT_UNIFIED_SETTINGS.backgroundActivityProfile,
      automaticGitFetchInterval: DEFAULT_UNIFIED_SETTINGS.automaticGitFetchInterval,
      providerHealthRefreshInterval: DEFAULT_UNIFIED_SETTINGS.providerHealthRefreshInterval,
      defaultThreadEnvMode: DEFAULT_UNIFIED_SETTINGS.defaultThreadEnvMode,
      newWorktreesStartFromOrigin: DEFAULT_UNIFIED_SETTINGS.newWorktreesStartFromOrigin,
      addProjectBaseDirectory: DEFAULT_UNIFIED_SETTINGS.addProjectBaseDirectory,
      threadExportDirectory: DEFAULT_UNIFIED_SETTINGS.threadExportDirectory,
      confirmThreadArchive: DEFAULT_UNIFIED_SETTINGS.confirmThreadArchive,
      confirmThreadDelete: DEFAULT_UNIFIED_SETTINGS.confirmThreadDelete,
      confirmThreadUnpin: DEFAULT_UNIFIED_SETTINGS.confirmThreadUnpin,
      confirmQuit: DEFAULT_UNIFIED_SETTINGS.confirmQuit,
      textGenerationModelSelection: DEFAULT_UNIFIED_SETTINGS.textGenerationModelSelection,
      threadTitleInstructions: DEFAULT_UNIFIED_SETTINGS.threadTitleInstructions,
      idleCompaction: globalIdleCompaction(DEFAULT_UNIFIED_SETTINGS),
      fontFamilySans: DEFAULT_UNIFIED_SETTINGS.fontFamilySans,
      fontFamilyComposer: DEFAULT_UNIFIED_SETTINGS.fontFamilyComposer,
      fontFamilyCode: DEFAULT_UNIFIED_SETTINGS.fontFamilyCode,
      fontFamilyTerminal: DEFAULT_UNIFIED_SETTINGS.fontFamilyTerminal,
      fontSizeInterface: DEFAULT_UNIFIED_SETTINGS.fontSizeInterface,
      fontSizePrompt: DEFAULT_UNIFIED_SETTINGS.fontSizePrompt,
      fontSizeCode: DEFAULT_UNIFIED_SETTINGS.fontSizeCode,
      fontSizeTerminal: DEFAULT_UNIFIED_SETTINGS.fontSizeTerminal,
      browserDefaultViewport: DEFAULT_UNIFIED_SETTINGS.browserDefaultViewport,
      browserDefaultZoomFactor: DEFAULT_UNIFIED_SETTINGS.browserDefaultZoomFactor,
      browserDefaultAppearance: DEFAULT_UNIFIED_SETTINGS.browserDefaultAppearance,
      browserRecordingFrameRate: DEFAULT_UNIFIED_SETTINGS.browserRecordingFrameRate,
      browserRecordingShowKeyPresses: DEFAULT_UNIFIED_SETTINGS.browserRecordingShowKeyPresses,
      browserRecordingShowMousePresses: DEFAULT_UNIFIED_SETTINGS.browserRecordingShowMousePresses,
      browserLinkTarget: DEFAULT_UNIFIED_SETTINGS.browserLinkTarget,
      browserSearchEngine: DEFAULT_UNIFIED_SETTINGS.browserSearchEngine,
      browserCustomSearchUrl: DEFAULT_UNIFIED_SETTINGS.browserCustomSearchUrl,
      browserAutoShowFloatingPreview: DEFAULT_UNIFIED_SETTINGS.browserAutoShowFloatingPreview,
      pullRequestLinksOpenInApp: DEFAULT_UNIFIED_SETTINGS.pullRequestLinksOpenInApp,
      enableAgentBrowserAccess: DEFAULT_UNIFIED_SETTINGS.enableAgentBrowserAccess,
    });
    onRestored?.();
  };

  return {
    changedSettingLabels,
    restoreDefaults,
  };
}

const AUTO_SETTLE_DEFAULT_DAYS = DEFAULT_UNIFIED_SETTINGS.sidebarAutoSettleAfterDays ?? 3;

// The legacy rows sit behind the fold, so a settings-search jump has to
// expand the section before its target can mount and scroll.

const LEGACY_FEATURE_TARGET_IDS: ReadonlySet<string> = new Set([
  "legacy-plan-mode",
  "legacy-context-window-indicator",
]);

/**
 * Retired features kept only for users who still depend on them. Collapsible
 * on demand; initially expanded to match M2. A settings-search jump to one
 * of the rows unfolds a section the user has collapsed.
 */
function LegacyFeaturesSection() {
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const [open, setOpen] = useState(true);
  const searchTargetId = useSettingsSearchTargetId();
  const targetRef = useSettingsSearchTarget<HTMLElement>("legacy-features");
  const [seenSearchTargetId, setSeenSearchTargetId] = useState<string | null>(null);
  if (seenSearchTargetId !== searchTargetId) {
    setSeenSearchTargetId(searchTargetId);
    if (searchTargetId !== null && LEGACY_FEATURE_TARGET_IDS.has(searchTargetId)) {
      setOpen(true);
    }
  }

  return (
    <section id="legacy-features" ref={targetRef} tabIndex={-1} className="space-y-2">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="group flex min-h-7 w-full items-center gap-2 px-1">
          <h2 className="font-serif text-plan-title leading-normal font-bold text-foreground">
            {t.settings.sections.legacyFeatures}
          </h2>
          <ChevronRightIcon className="size-4 text-muted-foreground transition-transform duration-200 group-data-panel-open:rotate-90" />
        </CollapsibleTrigger>
        <CollapsiblePanel surface="card">
          <SettingsGroup>
            <SettingsRow
              {...searchableSetting("legacy-plan-mode")}
              description={t.settings.rows.legacyPlanMode.description}
              control={
                <Switch
                  checked={settings.planModeEnabled}
                  onCheckedChange={(checked) => {
                    updateSettings({ planModeEnabled: Boolean(checked) });
                  }}
                  aria-label={t.settings.rows.legacyPlanMode.title}
                />
              }
            />
            <SettingsRow
              {...searchableSetting("legacy-context-window-indicator")}
              description={t.settings.rows.legacyContextWindowIndicator.description}
              control={
                <Switch
                  checked={settings.contextWindowMeterEnabled}
                  onCheckedChange={(checked) =>
                    updateSettings({ contextWindowMeterEnabled: Boolean(checked) })
                  }
                  aria-label={t.settings.rows.legacyContextWindowIndicator.title}
                />
              }
            />
          </SettingsGroup>
        </CollapsiblePanel>
      </Collapsible>
    </section>
  );
}

/**
 * Composes M2's path well around the existing commit-on-blur input.
 * @param props.value Persisted path, or an empty draft for mixed targets.
 * @param props.onCommit Existing scoped path writer, shared by manual commits and folder selection.
 * @param props.placeholder Existing empty/mixed hint; no path is inferred locally.
 * @param props.label Accessible setting name for the input.
 * @returns An editable path with native browsing when the desktop bridge supports it; cancellation does not commit.
 */
function GeneralPathInput({
  value,
  onCommit,
  placeholder,
  label,
}: {
  value: string;
  onCommit: (next: string) => void;
  placeholder: string;
  label: string;
}) {
  const [isPickingFolder, setIsPickingFolder] = useState(false);
  const canPickFolder =
    typeof window !== "undefined" && typeof window.desktopBridge?.pickFolder === "function";

  /** Waits for the user's native dialog without timeout or retry; failures leave the saved path intact. */
  async function pickFolder() {
    const api = readLocalApi();
    if (!canPickFolder || isPickingFolder || !api) return;

    setIsPickingFolder(true);
    let pickedPath: string | null;
    try {
      pickedPath = await api.dialogs.pickFolder({ initialPath: value });
    } catch {
      setIsPickingFolder(false);
      toastManager.add({ type: "error", title: t.settings.general.folderPickerError });
      return;
    }
    setIsPickingFolder(false);
    const path = resolvePickedFolderPath(pickedPath);
    if (path !== null) onCommit(path);
  }

  return (
    <div className="flex h-8 w-65 max-w-full items-center gap-2 rounded-card-row bg-input pr-1.5 shadow-well-track focus-within:inset-shadow-focus">
      <DraftInput
        unstyled
        size="settings"
        font="mono"
        className="min-w-0 flex-1"
        value={value}
        onCommit={onCommit}
        placeholder={placeholder}
        spellCheck={false}
        aria-label={label}
      />
      <Button
        size="icon-xs"
        variant="secondary"
        disabled={!canPickFolder || isPickingFolder}
        aria-busy={isPickingFolder}
        onClick={() => void pickFolder()}
        aria-label={t.settings.general.browseFolder}
      >
        <FolderOpenIcon aria-hidden />
      </Button>
    </div>
  );
}

/**
 * Renders general settings for targets selected by the enclosing settings scope, with no props.
 * Server rows persist via the scoped settings command; mixed targets show an empty draft.
 * Export location is an environment setting: empty means stateDir/exports on the destination server.
 * @returns Existing settings rows and controls; mutation failures are handled by the settings command.
 */
export function GeneralSettingsPanel() {
  const modifierLabel = isMacPlatform(navigator.platform) ? "⌘" : "Ctrl";
  const sendShortcutOptions = [
    { value: "enter", label: "Enter" },
    {
      value: "mod-enter-multiline",
      label: t.settings.rows.sendShortcut.options.multiline(modifierLabel),
    },
    { value: "mod-enter", label: t.settings.rows.sendShortcut.options.always(modifierLabel) },
  ] satisfies ReadonlyArray<{
    value: typeof DEFAULT_UNIFIED_SETTINGS.sendShortcut;
    label: string;
  }>;
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const navigate = useNavigate();
  const { scope, environment, connectedEnvironments, target, targets } = useSettingsScope();
  const idleCompaction = scopedIdleCompaction(targets.length > 0 ? targets : [{ settings }]);
  const environmentId = environment?.environmentId ?? null;
  const isEnvironmentScope = scope.environmentIds.length === 1 && environmentId !== null;
  const hasServerTargets = connectedEnvironments.length > 0;
  const mixedResponseStreamingMode = useScopedSettingsMixed(["responseStreamingMode"]);
  const providersByEnvironment = useEnvironmentProviders();
  const serverProviders =
    (environment?.serverConfig
      ? providersByEnvironment.get(environment.environmentId)
      : undefined) ?? EMPTY_SERVER_PROVIDERS;
  const supportsAutoSettlement =
    connectedEnvironments.length > 0 &&
    connectedEnvironments.every(
      (target) => target.serverConfig?.environment.capabilities.threadAutoSettlement === true,
    );
  const supportsAutoSettlementScope = connectedEnvironments.every(
    (target) => target.serverConfig?.environment.capabilities.threadAutoSettlementScope === true,
  );
  const supportsRestartContinuation =
    connectedEnvironments.length > 0 &&
    connectedEnvironments.every(
      (target) => target.serverConfig?.environment.capabilities.threadRestartContinuation === true,
    );

  const textGenerationProviders = serverProviders.filter(
    (provider) => provider.supportsTextGeneration !== false,
  );
  const textGenerationModelSelection = resolveAppModelSelectionState(
    settings,
    textGenerationProviders,
  );
  const textGenInstanceId = textGenerationModelSelection.instanceId;
  const textGenModel = textGenerationModelSelection.model;
  const textGenModelOptions = textGenerationModelSelection.options;
  const textGenerationModelInstanceEntries = providerInstanceEntriesFor(
    textGenerationProviders,
    settings,
    target?.projectId ?? null,
  );
  const hasTextGenerationProvider = textGenerationModelInstanceEntries.some(
    (entry) => entry.enabled && entry.isAvailable,
  );
  const textGenInstanceEntry = textGenerationModelInstanceEntries.find(
    (entry) => entry.instanceId === textGenInstanceId,
  );
  const textGenProvider: ProviderDriverKind =
    textGenInstanceEntry?.driverKind ?? DEFAULT_DRIVER_KIND;
  const textGenerationModelOptionsByInstance = getCustomModelOptionsByInstance(
    settings,
    textGenerationProviders,
    textGenInstanceId,
    textGenModel,
  );
  const isTextGenerationModelDirty = !Equal.equals(
    settings.textGenerationModelSelection ?? null,
    DEFAULT_UNIFIED_SETTINGS.textGenerationModelSelection ?? null,
  );
  const textGenerationModelDisabledReason = useScopedModelDisabledReason(
    settings,
    textGenerationModelInstanceEntries,
  );
  const mixedAddProjectBaseDirectory = useScopedSettingsMixed(["addProjectBaseDirectory"]);
  const mixedThreadExportDirectory = useScopedSettingsMixed(["threadExportDirectory"]);
  const mixedTextGenerationModel = useScopedSettingsMixed(["textGenerationModelSelection"]);

  return (
    <SettingsPageContainer>
      <LanguageSetting size="settings" />
      <SettingsSection id="organization" title={t.settings.sections.organization}>
        <SettingsRow
          {...searchableSetting("project-grouping")}
          description={t.settings.rows.projectGrouping.description}
          resetAction={
            settings.sidebarProjectGroupingMode !==
            DEFAULT_UNIFIED_SETTINGS.sidebarProjectGroupingMode ? (
              <SettingResetButton
                label={t.settings.rows.projectGrouping.resetLabel}
                onClick={() =>
                  updateSettings({
                    sidebarProjectGroupingMode: DEFAULT_UNIFIED_SETTINGS.sidebarProjectGroupingMode,
                  })
                }
              />
            ) : null
          }
          control={
            <Select
              value={settings.sidebarProjectGroupingMode}
              onValueChange={(value) => {
                if (value !== "repository" && value !== "repository_path" && value !== "separate")
                  return;
                if (value === "separate") {
                  rememberEnabledProjectGroupingMode(settings.sidebarProjectGroupingMode);
                } else {
                  rememberEnabledProjectGroupingMode(value);
                }
                updateSettings({ sidebarProjectGroupingMode: value });
              }}
            >
              <SelectTrigger size="settings" aria-label={t.settings.rows.projectGrouping.ariaLabel}>
                <SelectValue>
                  {settings.sidebarProjectGroupingMode === "repository"
                    ? t.sidebar.grouping.repository
                    : settings.sidebarProjectGroupingMode === "repository_path"
                      ? t.sidebar.grouping.repositoryPath
                      : t.sidebar.grouping.separate}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem hideIndicator value="repository">
                  {t.sidebar.grouping.repository}
                </SelectItem>
                <SelectItem hideIndicator value="repository_path">
                  {t.sidebar.grouping.repositoryPath}
                </SelectItem>
                <SelectItem hideIndicator value="separate">
                  {t.sidebar.grouping.separate}
                </SelectItem>
              </SelectPopup>
            </Select>
          }
        />
        <SettingsRow
          {...searchableSetting("project-order")}
          description={t.settings.rows.projectOrder.description}
          resetAction={
            settings.sidebarProjectSortOrder !==
            DEFAULT_UNIFIED_SETTINGS.sidebarProjectSortOrder ? (
              <SettingResetButton
                label={t.settings.rows.projectOrder.resetLabel}
                onClick={() =>
                  updateSettings({
                    sidebarProjectSortOrder: DEFAULT_UNIFIED_SETTINGS.sidebarProjectSortOrder,
                  })
                }
              />
            ) : null
          }
          control={
            <Select
              value={settings.sidebarProjectSortOrder}
              onValueChange={(value) => {
                if (isSidebarProjectSortOrder(value)) {
                  updateSettings({ sidebarProjectSortOrder: value });
                }
              }}
            >
              <SelectTrigger size="settings" aria-label={t.settings.rows.projectOrder.ariaLabel}>
                <SelectValue>
                  {SIDEBAR_PROJECT_SORT_ORDER_LABELS[settings.sidebarProjectSortOrder]}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                {SidebarProjectSortOrder.literals.map((sortOrder) => (
                  <SelectItem hideIndicator key={sortOrder} value={sortOrder}>
                    {SIDEBAR_PROJECT_SORT_ORDER_LABELS[sortOrder]}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          }
        />
      </SettingsSection>

      <SettingsSection id="behavior" title={t.settings.sections.behavior}>
        <SettingsSearchTarget id="project-defaults">
          <DefaultModelSetting title={t.settings.rows.defaultModel.title} />
          <DefaultPermissionsSetting controlSize="settings" />
        </SettingsSearchTarget>
        {SNOOZE_UI_ENABLED ? (
          <SettingsRow
            serverScoped
            {...searchableSetting("snooze-limited-threads")}
            description={t.settings.rows.snoozeLimitedThreads.description}
            settingKeys={["snoozeLimitedThreads"]}
            control={
              <ScopedSwitch
                settingKeys={["snoozeLimitedThreads"]}
                checked={settings.snoozeLimitedThreads}
                onCheckedChange={(checked) =>
                  updateSettings({ snoozeLimitedThreads: Boolean(checked) })
                }
                aria-label={t.settings.rows.snoozeLimitedThreads.ariaLabel}
              />
            }
          />
        ) : null}

        <SettingsRow
          serverScoped
          {...searchableSetting("auto-resume-limited-threads")}
          description={t.settings.rows.autoResumeLimitedThreads.description}
          settingKeys={["autoResumeLimitedThreads"]}
          control={
            <ScopedSwitch
              settingKeys={["autoResumeLimitedThreads"]}
              checked={settings.autoResumeLimitedThreads}
              onCheckedChange={(checked) =>
                updateSettings({ autoResumeLimitedThreads: Boolean(checked) })
              }
              aria-label={t.settings.rows.autoResumeLimitedThreads.ariaLabel}
            />
          }
        />
        <SettingsRow
          {...searchableSetting("working-shelf")}
          description={t.settings.rows.workingShelf.description}
          resetAction={
            settings.sidebarWorkingShelfEnabled !==
            DEFAULT_UNIFIED_SETTINGS.sidebarWorkingShelfEnabled ? (
              <SettingResetButton
                label={t.settings.rows.workingShelf.resetLabel}
                onClick={() =>
                  updateSettings({
                    sidebarWorkingShelfEnabled: DEFAULT_UNIFIED_SETTINGS.sidebarWorkingShelfEnabled,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.sidebarWorkingShelfEnabled}
              onCheckedChange={(checked) =>
                updateSettings({ sidebarWorkingShelfEnabled: Boolean(checked) })
              }
              aria-label={t.settings.rows.workingShelf.ariaLabel}
            />
          }
        />

        <SettingsRow
          serverScoped
          settingKeys={["idleCompaction", "compactIdleThreads"]}
          mixed={idleCompaction.mixed}
          {...searchableSetting("compact-idle-threads")}
          description={t.settings.conversationRenderingUi.compactHint}
          resetAction={
            globalIdleCompaction(settings) !== globalIdleCompaction(DEFAULT_UNIFIED_SETTINGS) ? (
              <SettingResetButton
                label={t.settings.conversationRenderingUi.compactReset}
                onClick={() =>
                  updateSettings({ idleCompaction: globalIdleCompaction(DEFAULT_UNIFIED_SETTINGS) })
                }
              />
            ) : null
          }
          control={
            <Select
              value={idleCompaction.mixed ? null : globalIdleCompaction(settings)}
              onValueChange={(value) => {
                const mode = IDLE_COMPACTION_MODES.find((candidate) => candidate.value === value);
                if (mode) updateSettings({ idleCompaction: mode.value });
              }}
            >
              <SelectTrigger
                size="settings"
                aria-label={t.settings.conversationRenderingUi.compact}
              >
                <SelectValue>
                  {(value: string | null) => {
                    if (value === null) return t.settings.general.mixed;
                    const mode = IDLE_COMPACTION_MODES.find((mode) => mode.value === value);
                    return mode ? t.settings.idleCompactionModes[mode.value] : undefined;
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                {IDLE_COMPACTION_MODES.map((mode) => (
                  <SelectItem
                    hideIndicator
                    key={mode.value}
                    value={mode.value}
                    // A server from before modes has only the on/off switch, so it cannot store "Never".
                    disabled={mode.value === "off" && !idleCompaction.neverAvailable}
                  >
                    {t.settings.idleCompactionModes[mode.value]}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          }
        />

        {supportsAutoSettlement ? (
          <>
            <SettingsRow
              serverScoped
              settingKeys={["sidebarAutoSettleAfterDays"]}
              {...searchableSetting("auto-settle-inactive-threads")}
              description={t.settings.rows.autoSettleInactiveThreads.description}
              resetAction={
                settings.sidebarAutoSettleAfterDays !==
                DEFAULT_UNIFIED_SETTINGS.sidebarAutoSettleAfterDays ? (
                  <SettingResetButton
                    label={t.settings.rows.autoSettleInactiveThreads.resetLabel}
                    onClick={() =>
                      updateSettings({
                        sidebarAutoSettleAfterDays:
                          DEFAULT_UNIFIED_SETTINGS.sidebarAutoSettleAfterDays,
                      })
                    }
                  />
                ) : null
              }
              control={
                <ScopedSwitch
                  settingKeys={["sidebarAutoSettleAfterDays"]}
                  checked={settings.sidebarAutoSettleAfterDays !== null}
                  onCheckedChange={(checked) =>
                    updateSettings({
                      sidebarAutoSettleAfterDays: checked ? AUTO_SETTLE_DEFAULT_DAYS : null,
                    })
                  }
                  aria-label={t.settings.rows.autoSettleInactiveThreads.ariaLabel}
                />
              }
            />
            {settings.sidebarAutoSettleAfterDays !== null ? (
              <SettingsRow
                serverScoped
                settingKeys={["sidebarAutoSettleAfterDays"]}
                {...searchableSetting("days-before-auto-settle")}
                description={t.settings.rows.daysBeforeAutoSettle.description}
                control={
                  <AutoSettleDaysInput
                    value={settings.sidebarAutoSettleAfterDays}
                    onCommit={(days) => updateSettings({ sidebarAutoSettleAfterDays: days })}
                  />
                }
              />
            ) : null}
            <SettingsRow
              serverScoped
              settingKeys={["sidebarAutoSettleOnMerge"]}
              {...searchableSetting("auto-settle-merged-threads")}
              description={t.settings.rows.autoSettleMergedThreads.description}
              resetAction={
                settings.sidebarAutoSettleOnMerge !==
                DEFAULT_UNIFIED_SETTINGS.sidebarAutoSettleOnMerge ? (
                  <SettingResetButton
                    label={t.settings.rows.autoSettleMergedThreads.resetLabel}
                    onClick={() =>
                      updateSettings({
                        sidebarAutoSettleOnMerge: DEFAULT_UNIFIED_SETTINGS.sidebarAutoSettleOnMerge,
                      })
                    }
                  />
                ) : null
              }
              control={
                <ScopedSwitch
                  settingKeys={["sidebarAutoSettleOnMerge"]}
                  checked={settings.sidebarAutoSettleOnMerge}
                  onCheckedChange={(checked) =>
                    updateSettings({ sidebarAutoSettleOnMerge: Boolean(checked) })
                  }
                  aria-label={t.settings.rows.autoSettleMergedThreads.ariaLabel}
                />
              }
            />
            {settings.sidebarAutoSettleAfterDays !== null && supportsAutoSettlementScope ? (
              <SettingsRow
                serverScoped
                settingKeys={["sidebarAutoSettleKeepPullRequests"]}
                id="keep-threads-with-pull-requests"
                title={t.settings.conversationRenderingUi.keepPr}
                description={t.settings.conversationRenderingUi.keepPrHint}
                control={
                  <ScopedSwitch
                    settingKeys={["sidebarAutoSettleKeepPullRequests"]}
                    checked={settings.sidebarAutoSettleKeepPullRequests}
                    onCheckedChange={(checked) =>
                      updateSettings({ sidebarAutoSettleKeepPullRequests: checked })
                    }
                    aria-label={t.settings.conversationRenderingUi.keepPr}
                  />
                }
              />
            ) : null}
          </>
        ) : null}
        {SNOOZE_UI_ENABLED ? <SnoozePresetsRow /> : null}
        <NotificationSettings />
        <SettingsRow
          {...searchableSetting("in-app-notifications")}
          description={t.settings.rows.inAppNotifications.description}
          control={
            <Switch
              checked={settings.inAppNotificationsEnabled}
              onCheckedChange={(checked) => updateSettings({ inAppNotificationsEnabled: checked })}
              aria-label={t.settings.rows.inAppNotifications.ariaLabel}
            />
          }
        />
        <SettingsRow
          {...searchableSetting("time-format")}
          description={t.settings.rows.timeFormat.description}
          resetAction={
            settings.timestampFormat !== DEFAULT_UNIFIED_SETTINGS.timestampFormat ? (
              <SettingResetButton
                label={t.settings.rows.timeFormat.title}
                onClick={() =>
                  updateSettings({
                    timestampFormat: DEFAULT_UNIFIED_SETTINGS.timestampFormat,
                  })
                }
              />
            ) : null
          }
          control={
            <ToggleGroup
              size="settings"
              value={[settings.timestampFormat]}
              onValueChange={(values) => {
                const value = values[0];
                if (value === "locale" || value === "12-hour" || value === "24-hour") {
                  updateSettings({ timestampFormat: value });
                }
              }}
              aria-label={t.settings.rows.timeFormat.ariaLabel}
            >
              {(["locale", "12-hour", "24-hour"] as const).map((value) => (
                <ToggleGroupItem key={value} value={value}>
                  {TIMESTAMP_FORMAT_LABELS[value]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          }
        />
        <SettingsRow
          serverScoped
          settingKeys={["responseStreamingMode"]}
          {...searchableSetting("response-streaming")}
          description={
            mixedResponseStreamingMode
              ? t.settings.rows.responseStreaming.mixedHint
              : RESPONSE_STREAMING_MODE_DESCRIPTIONS[settings.responseStreamingMode]
          }
          resetAction={
            settings.responseStreamingMode !== DEFAULT_UNIFIED_SETTINGS.responseStreamingMode ? (
              <SettingResetButton
                label={t.settings.rows.responseStreaming.resetLabel}
                onClick={() =>
                  updateSettings({
                    responseStreamingMode: DEFAULT_UNIFIED_SETTINGS.responseStreamingMode,
                  })
                }
              />
            ) : null
          }
          control={
            <Select
              value={mixedResponseStreamingMode ? null : settings.responseStreamingMode}
              onValueChange={(value) => {
                if (value === "turn" || value === "paragraph") {
                  updateSettings({ responseStreamingMode: value });
                }
              }}
            >
              <SelectTrigger
                size="settings"
                aria-label={t.settings.rows.responseStreaming.ariaLabel}
              >
                <SelectValue>
                  {(value: ResponseStreamingMode | null) =>
                    value === null
                      ? t.settings.general.mixed
                      : RESPONSE_STREAMING_MODE_LABELS[value]
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem hideIndicator value="turn">
                  {RESPONSE_STREAMING_MODE_LABELS.turn}
                </SelectItem>
                <SelectItem hideIndicator value="paragraph">
                  {RESPONSE_STREAMING_MODE_LABELS.paragraph}
                </SelectItem>
              </SelectPopup>
            </Select>
          }
        />
        <SettingsRow
          {...searchableSetting("hide-whitespace-changes")}
          description={t.settings.rows.hideWhitespaceChanges.description}
          resetAction={
            settings.diffIgnoreWhitespace !== DEFAULT_UNIFIED_SETTINGS.diffIgnoreWhitespace ? (
              <SettingResetButton
                label={t.settings.rows.hideWhitespaceChanges.resetLabel}
                onClick={() =>
                  updateSettings({
                    diffIgnoreWhitespace: DEFAULT_UNIFIED_SETTINGS.diffIgnoreWhitespace,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.diffIgnoreWhitespace}
              onCheckedChange={(checked) =>
                updateSettings({ diffIgnoreWhitespace: Boolean(checked) })
              }
              aria-label={t.settings.rows.hideWhitespaceChanges.ariaLabel}
            />
          }
        />
        <SettingsRow
          {...searchableSetting("default-diff-file-state")}
          description={t.settings.rows.defaultDiffFileState.description}
          resetAction={
            settings.diffFilesCollapsed !== DEFAULT_UNIFIED_SETTINGS.diffFilesCollapsed ? (
              <SettingResetButton
                label={t.settings.rows.defaultDiffFileState.resetLabel}
                onClick={() =>
                  updateSettings({
                    diffFilesCollapsed: DEFAULT_UNIFIED_SETTINGS.diffFilesCollapsed,
                  })
                }
              />
            ) : null
          }
          control={
            <Select
              value={settings.diffFilesCollapsed ? "collapsed" : "expanded"}
              onValueChange={(value) => {
                if (value === "expanded" || value === "collapsed") {
                  updateSettings({ diffFilesCollapsed: value === "collapsed" });
                }
              }}
            >
              <SelectTrigger
                size="settings"
                aria-label={t.settings.rows.defaultDiffFileState.ariaLabel}
              >
                <SelectValue>
                  {settings.diffFilesCollapsed
                    ? t.settings.rows.defaultDiffFileState.options.collapsed
                    : t.settings.rows.defaultDiffFileState.options.expanded}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem hideIndicator value="expanded">
                  {t.settings.rows.defaultDiffFileState.options.expanded}
                </SelectItem>
                <SelectItem hideIndicator value="collapsed">
                  {t.settings.rows.defaultDiffFileState.options.collapsed}
                </SelectItem>
              </SelectPopup>
            </Select>
          }
        />
        <SettingsRow
          {...searchableSetting("diff-layout")}
          description={t.settings.rows.diffLayout.description}
          resetAction={
            settings.diffLayout !== DEFAULT_UNIFIED_SETTINGS.diffLayout ? (
              <SettingResetButton
                label={t.settings.rows.diffLayout.resetLabel}
                onClick={() => updateSettings({ diffLayout: DEFAULT_UNIFIED_SETTINGS.diffLayout })}
              />
            ) : null
          }
          control={
            <ToggleGroup
              size="settings"
              value={[settings.diffLayout]}
              onValueChange={(values) => {
                const value = values[0];
                if (value === "stacked" || value === "split") {
                  updateSettings({ diffLayout: value });
                }
              }}
              aria-label={t.settings.rows.diffLayout.ariaLabel}
            >
              {(["stacked", "split"] as const).map((value) => (
                <ToggleGroupItem key={value} value={value}>
                  {DIFF_LAYOUT_LABELS[value]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          }
        />

        <SettingsRow
          {...searchableSetting("proactive-panels")}
          description={t.settings.rows.proactivePanels.description}
          resetAction={
            settings.proactivePanelsEnabled !== DEFAULT_UNIFIED_SETTINGS.proactivePanelsEnabled ? (
              <SettingResetButton
                label={t.settings.rows.proactivePanels.resetLabel}
                onClick={() =>
                  updateSettings({
                    proactivePanelsEnabled: DEFAULT_UNIFIED_SETTINGS.proactivePanelsEnabled,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.proactivePanelsEnabled}
              onCheckedChange={(checked) =>
                updateSettings({ proactivePanelsEnabled: Boolean(checked) })
              }
              aria-label={t.settings.rows.proactivePanels.ariaLabel}
            />
          }
        />

        <SettingsRow
          {...searchableSetting("skills-in-slash-menu")}
          description={t.settings.rows.skillsInSlashMenu.description}
          resetAction={
            settings.showSkillsInSlashMenu !== DEFAULT_UNIFIED_SETTINGS.showSkillsInSlashMenu ? (
              <SettingResetButton
                label={t.settings.rows.skillsInSlashMenu.resetLabel}
                onClick={() =>
                  updateSettings({
                    showSkillsInSlashMenu: DEFAULT_UNIFIED_SETTINGS.showSkillsInSlashMenu,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.showSkillsInSlashMenu}
              onCheckedChange={(checked) =>
                updateSettings({ showSkillsInSlashMenu: Boolean(checked) })
              }
              aria-label={t.settings.rows.skillsInSlashMenu.ariaLabel}
            />
          }
        />

        <SettingsRow
          {...searchableSetting("composer-rich-text")}
          description={t.settings.rows.composerRichText.description}
          resetAction={
            settings.composerRichTextEnabled !==
            DEFAULT_UNIFIED_SETTINGS.composerRichTextEnabled ? (
              <SettingResetButton
                label={t.settings.rows.composerRichText.resetLabel}
                onClick={() =>
                  updateSettings({
                    composerRichTextEnabled: DEFAULT_UNIFIED_SETTINGS.composerRichTextEnabled,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.composerRichTextEnabled}
              onCheckedChange={(checked) =>
                updateSettings({ composerRichTextEnabled: Boolean(checked) })
              }
              aria-label={t.settings.rows.composerRichText.ariaLabel}
            />
          }
        />

        <SettingsRow
          {...searchableSetting("composer-suggestions")}
          description={t.settings.rows.composerSuggestions.description}
          resetAction={
            settings.composerSuggestionsEnabled !==
            DEFAULT_UNIFIED_SETTINGS.composerSuggestionsEnabled ? (
              <SettingResetButton
                label={t.settings.rows.composerSuggestions.resetLabel}
                onClick={() =>
                  updateSettings({
                    composerSuggestionsEnabled: DEFAULT_UNIFIED_SETTINGS.composerSuggestionsEnabled,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.composerSuggestionsEnabled}
              onCheckedChange={(checked) =>
                updateSettings({ composerSuggestionsEnabled: Boolean(checked) })
              }
              aria-label={t.settings.rows.composerSuggestions.ariaLabel}
            />
          }
        />
        <SettingsRow
          {...searchableSetting("composer-prompt-optimize")}
          description={t.settings.rows.composerPromptOptimize.description}
          resetAction={
            settings.composerPromptOptimizeEnabled !==
            DEFAULT_UNIFIED_SETTINGS.composerPromptOptimizeEnabled ? (
              <SettingResetButton
                label={t.settings.rows.composerPromptOptimize.resetLabel}
                onClick={() =>
                  updateSettings({
                    composerPromptOptimizeEnabled:
                      DEFAULT_UNIFIED_SETTINGS.composerPromptOptimizeEnabled,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.composerPromptOptimizeEnabled}
              onCheckedChange={(checked) =>
                updateSettings({ composerPromptOptimizeEnabled: Boolean(checked) })
              }
              aria-label={t.settings.rows.composerPromptOptimize.ariaLabel}
            />
          }
        />

        <SettingsRow
          {...searchableSetting("composer-collapse")}
          description={t.settings.rows.composerCollapse.description}
          resetAction={
            settings.composerCollapseOnScroll !==
            DEFAULT_UNIFIED_SETTINGS.composerCollapseOnScroll ? (
              <SettingResetButton
                label={t.settings.rows.composerCollapse.resetLabel}
                onClick={() =>
                  updateSettings({
                    composerCollapseOnScroll: DEFAULT_UNIFIED_SETTINGS.composerCollapseOnScroll,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.composerCollapseOnScroll}
              onCheckedChange={(checked) =>
                updateSettings({ composerCollapseOnScroll: Boolean(checked) })
              }
              aria-label={t.settings.rows.composerCollapse.ariaLabel}
            />
          }
        />

        <SettingsRow
          {...searchableSetting("send-shortcut")}
          description={t.settings.rows.sendShortcut.description}
          resetAction={
            settings.sendShortcut !== DEFAULT_UNIFIED_SETTINGS.sendShortcut ? (
              <SettingResetButton
                label={t.settings.rows.sendShortcut.resetLabel}
                onClick={() =>
                  updateSettings({ sendShortcut: DEFAULT_UNIFIED_SETTINGS.sendShortcut })
                }
              />
            ) : null
          }
          control={
            <Select
              value={settings.sendShortcut}
              onValueChange={(value) => {
                const option = sendShortcutOptions.find((option) => option.value === value);
                if (option) updateSettings({ sendShortcut: option.value });
              }}
            >
              <SelectTrigger
                variant="keycap"
                size="shortcut"
                icon={false}
                aria-label={t.settings.rows.sendShortcut.ariaLabel}
              >
                <SelectValue>
                  <Kbd>
                    {
                      sendShortcutOptions.find((option) => option.value === settings.sendShortcut)
                        ?.label
                    }
                  </Kbd>
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                {sendShortcutOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <span className="flex items-center justify-between gap-4">
                      {option.label}
                      {settings.sendShortcut === option.value && <CheckIcon aria-hidden="true" />}
                    </span>
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          }
        />

        <SettingsRow
          {...searchableSetting("follow-up-behavior")}
          description={t.settings.rows.followUpBehavior.description(
            modifierLabel,
            settings.sendShortcut,
          )}
          resetAction={
            settings.followUpBehavior !== DEFAULT_UNIFIED_SETTINGS.followUpBehavior ? (
              <SettingResetButton
                label={t.settings.rows.followUpBehavior.resetLabel}
                onClick={() =>
                  updateSettings({
                    followUpBehavior: DEFAULT_UNIFIED_SETTINGS.followUpBehavior,
                  })
                }
              />
            ) : null
          }
          control={
            <Select
              value={settings.followUpBehavior}
              onValueChange={(value) => {
                if (value === "queue" || value === "steer") {
                  updateSettings({ followUpBehavior: value });
                }
              }}
            >
              <SelectTrigger
                size="settings"
                aria-label={t.settings.rows.followUpBehavior.ariaLabel}
              >
                <SelectValue>
                  {settings.followUpBehavior === "queue"
                    ? t.settings.rows.followUpBehavior.options.queue
                    : t.settings.rows.followUpBehavior.options.steer}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem value="queue">
                  {t.settings.rows.followUpBehavior.options.queue}
                </SelectItem>
                <SelectItem value="steer">
                  {t.settings.rows.followUpBehavior.options.steer}
                </SelectItem>
              </SelectPopup>
            </Select>
          }
        />

        <SettingsRow
          serverScoped
          settingKeys={["enableProviderUpdateChecks"]}
          {...searchableSetting("provider-update-checks")}
          description={t.settings.rows.providerUpdateChecks.description}
          resetAction={
            settings.enableProviderUpdateChecks !==
            DEFAULT_UNIFIED_SETTINGS.enableProviderUpdateChecks ? (
              <SettingResetButton
                label={t.settings.rows.providerUpdateChecks.resetLabel}
                onClick={() =>
                  updateSettings({
                    enableProviderUpdateChecks: DEFAULT_UNIFIED_SETTINGS.enableProviderUpdateChecks,
                  })
                }
              />
            ) : null
          }
          control={
            <ScopedSwitch
              settingKeys={["enableProviderUpdateChecks"]}
              checked={settings.enableProviderUpdateChecks}
              onCheckedChange={(checked) =>
                updateSettings({ enableProviderUpdateChecks: Boolean(checked) })
              }
              aria-label={t.settings.rows.providerUpdateChecks.ariaLabel}
            />
          }
        />

        <SettingsRow
          {...searchableSetting("continue-threads-after-server-update")}
          serverScoped
          settingKeys={["continueThreadsAfterServerUpdate"]}
          description={t.settings.rows.continueThreadsAfterServerUpdate.description}
          status={
            !supportsRestartContinuation
              ? t.settings.rows.continueThreadsAfterServerUpdate.unsupportedHint
              : undefined
          }
          resetAction={
            supportsRestartContinuation &&
            settings.continueThreadsAfterServerUpdate !==
              DEFAULT_UNIFIED_SETTINGS.continueThreadsAfterServerUpdate ? (
              <SettingResetButton
                label={t.settings.rows.continueThreadsAfterServerUpdate.resetLabel}
                onClick={() =>
                  updateSettings({
                    continueThreadsAfterServerUpdate:
                      DEFAULT_UNIFIED_SETTINGS.continueThreadsAfterServerUpdate,
                  })
                }
              />
            ) : null
          }
          control={
            <ScopedSwitch
              settingKeys={["continueThreadsAfterServerUpdate"]}
              checked={settings.continueThreadsAfterServerUpdate}
              disabled={!supportsRestartContinuation}
              onCheckedChange={(checked) =>
                updateSettings({ continueThreadsAfterServerUpdate: Boolean(checked) })
              }
              aria-label={t.settings.rows.continueThreadsAfterServerUpdate.ariaLabel}
            />
          }
        />

        <BackgroundActivitySettingsRow />
      </SettingsSection>

      <SettingsSection id="projects-and-threads" title={t.settings.sections.projectsAndThreads}>
        <DefaultWorkspaceSetting title={t.settings.rows.newThreads.title} controlSize="settings" />
        <DefaultSubmodulesSetting controlSize="settings" />
        <SettingsRow
          serverScoped
          settingKeys={["newWorktreesStartFromOrigin"]}
          {...searchableSetting("start-from-origin")}
          description={t.settings.rows.startFromOrigin.description}
          resetAction={
            settings.newWorktreesStartFromOrigin !==
            DEFAULT_UNIFIED_SETTINGS.newWorktreesStartFromOrigin ? (
              <SettingResetButton
                label={t.settings.rows.startFromOrigin.resetLabel}
                onClick={() =>
                  updateSettings({
                    newWorktreesStartFromOrigin:
                      DEFAULT_UNIFIED_SETTINGS.newWorktreesStartFromOrigin,
                  })
                }
              />
            ) : null
          }
          control={
            <ScopedSwitch
              settingKeys={["newWorktreesStartFromOrigin"]}
              checked={settings.newWorktreesStartFromOrigin}
              onCheckedChange={(checked) =>
                updateSettings({ newWorktreesStartFromOrigin: Boolean(checked) })
              }
              aria-label={t.settings.rows.startFromOrigin.ariaLabel}
            />
          }
        />
        <SettingsRow
          serverScoped
          settingKeys={["addProjectBaseDirectory"]}
          {...searchableSetting("add-project-starts-in")}
          description={t.settings.rows.addProjectStartsIn.description}
          resetAction={
            settings.addProjectBaseDirectory !==
            DEFAULT_UNIFIED_SETTINGS.addProjectBaseDirectory ? (
              <SettingResetButton
                label={t.settings.rows.addProjectStartsIn.resetLabel}
                onClick={() =>
                  updateSettings({
                    addProjectBaseDirectory: DEFAULT_UNIFIED_SETTINGS.addProjectBaseDirectory,
                  })
                }
              />
            ) : null
          }
          control={
            <GeneralPathInput
              value={mixedAddProjectBaseDirectory ? "" : settings.addProjectBaseDirectory}
              onCommit={(next) => updateSettings({ addProjectBaseDirectory: next })}
              placeholder={mixedAddProjectBaseDirectory ? t.settings.general.mixed : "~/"}
              label={t.settings.rows.addProjectStartsIn.ariaLabel}
            />
          }
        />
        <SettingsRow
          serverScoped
          settingKeys={["threadExportDirectory"]}
          {...searchableSetting("thread-export-directory")}
          description={t.settings.rows.threadExportDirectory.description}
          resetAction={
            settings.threadExportDirectory !== DEFAULT_UNIFIED_SETTINGS.threadExportDirectory ? (
              <SettingResetButton
                label={t.settings.rows.threadExportDirectory.resetLabel}
                onClick={() =>
                  updateSettings({
                    threadExportDirectory: DEFAULT_UNIFIED_SETTINGS.threadExportDirectory,
                  })
                }
              />
            ) : null
          }
          control={
            <GeneralPathInput
              value={mixedThreadExportDirectory ? "" : settings.threadExportDirectory}
              onCommit={(next) => updateSettings({ threadExportDirectory: next })}
              placeholder={mixedThreadExportDirectory ? t.settings.general.mixed : ""}
              label={t.settings.rows.threadExportDirectory.ariaLabel}
            />
          }
        />
      </SettingsSection>

      <SettingsSection id="confirmations" title={t.settings.sections.confirmations}>
        <SettingsRow
          {...searchableSetting("unpin-confirmation")}
          description={t.settings.rows.unpinConfirmation.description}
          resetAction={
            settings.confirmThreadUnpin !== DEFAULT_UNIFIED_SETTINGS.confirmThreadUnpin ? (
              <SettingResetButton
                label={t.settings.rows.unpinConfirmation.resetLabel}
                onClick={() =>
                  updateSettings({
                    confirmThreadUnpin: DEFAULT_UNIFIED_SETTINGS.confirmThreadUnpin,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.confirmThreadUnpin}
              onCheckedChange={(checked) =>
                updateSettings({ confirmThreadUnpin: Boolean(checked) })
              }
              aria-label={t.settings.rows.unpinConfirmation.ariaLabel}
            />
          }
        />

        <SettingsRow
          {...searchableSetting("archive-confirmation")}
          description={t.settings.rows.archiveConfirmation.description}
          resetAction={
            settings.confirmThreadArchive !== DEFAULT_UNIFIED_SETTINGS.confirmThreadArchive ? (
              <SettingResetButton
                label={t.settings.rows.archiveConfirmation.resetLabel}
                onClick={() =>
                  updateSettings({
                    confirmThreadArchive: DEFAULT_UNIFIED_SETTINGS.confirmThreadArchive,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.confirmThreadArchive}
              onCheckedChange={(checked) =>
                updateSettings({ confirmThreadArchive: Boolean(checked) })
              }
              aria-label={t.settings.rows.archiveConfirmation.ariaLabel}
            />
          }
        />

        <SettingsRow
          {...searchableSetting("delete-confirmation")}
          description={t.settings.rows.deleteConfirmation.description}
          resetAction={
            settings.confirmThreadDelete !== DEFAULT_UNIFIED_SETTINGS.confirmThreadDelete ? (
              <SettingResetButton
                label={t.settings.rows.deleteConfirmation.resetLabel}
                onClick={() =>
                  updateSettings({
                    confirmThreadDelete: DEFAULT_UNIFIED_SETTINGS.confirmThreadDelete,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.confirmThreadDelete}
              onCheckedChange={(checked) =>
                updateSettings({ confirmThreadDelete: Boolean(checked) })
              }
              aria-label={t.settings.rows.deleteConfirmation.ariaLabel}
            />
          }
        />

        {isElectron ? (
          <SettingsRow
            {...searchableSetting("quit-confirmation")}
            description={t.settings.rows.quitConfirmation.description}
            resetAction={
              settings.confirmQuit !== DEFAULT_UNIFIED_SETTINGS.confirmQuit ? (
                <SettingResetButton
                  label={t.settings.rows.quitConfirmation.resetLabel}
                  onClick={() =>
                    updateSettings({ confirmQuit: DEFAULT_UNIFIED_SETTINGS.confirmQuit })
                  }
                />
              ) : null
            }
            control={
              <Select
                value={settings.confirmQuit}
                onValueChange={(value) => {
                  if (value === "direct" || value === "hold" || value === "double-click") {
                    updateSettings({ confirmQuit: value });
                  }
                }}
              >
                <SelectTrigger
                  size="settings"
                  aria-label={t.settings.rows.quitConfirmation.ariaLabel}
                >
                  <SelectValue>{QUIT_CONFIRMATION_MODE_LABELS[settings.confirmQuit]}</SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  {Object.entries(QUIT_CONFIRMATION_MODE_LABELS).map(([value, label]) => (
                    <SelectItem hideIndicator key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            }
          />
        ) : null}
      </SettingsSection>

      <SettingsSection id="text-generation" title={t.settings.sections.textGeneration}>
        <SettingsRow
          serverScoped
          settingKeys={["textGenerationModelSelection"]}
          {...searchableSetting("text-generation-model")}
          description={t.settings.rows.textGenerationModel.description}
          resetAction={
            hasServerTargets && isTextGenerationModelDirty ? (
              <SettingResetButton
                label={t.settings.rows.textGenerationModel.resetLabel}
                onClick={() =>
                  updateSettings({
                    textGenerationModelSelection:
                      DEFAULT_UNIFIED_SETTINGS.textGenerationModelSelection,
                  })
                }
              />
            ) : null
          }
          control={
            !hasServerTargets ? (
              <span className="text-sm text-muted-foreground">
                {t.settings.rows.textGenerationModel.connectHint}
              </span>
            ) : !hasTextGenerationProvider ? (
              <span className="text-sm text-muted-foreground">
                {t.settings.rows.textGenerationModel.empty}
              </span>
            ) : (
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <ProviderModelPicker
                  environmentId={environmentId}
                  activeInstanceId={textGenInstanceId}
                  model={textGenModel}
                  lockedProvider={null}
                  instanceEntries={textGenerationModelInstanceEntries}
                  modelOptionsByInstance={textGenerationModelOptionsByInstance}
                  triggerClassName={SETTINGS_PICKER_TRIGGER_CLASSNAME}
                  {...(mixedTextGenerationModel ? { triggerLabel: t.settings.general.mixed } : {})}
                  getModelDisabledReason={textGenerationModelDisabledReason}
                  {...(environmentId
                    ? {
                        onOpenProviderSetup: (instanceId: ProviderInstanceId) => {
                          void navigate({
                            to: "/settings/providers",
                            search: { environmentId, instanceId },
                          });
                        },
                      }
                    : {})}
                  onInstanceModelChange={(instanceId, model) => {
                    const reason = textGenerationModelDisabledReason(instanceId, model);
                    if (reason) {
                      toastManager.add({
                        type: "error",
                        title: t.settings.rows.textGenerationModel.saveError,
                        description: reason,
                      });
                      return;
                    }
                    updateSettings({
                      textGenerationModelSelection: resolveAppModelSelectionState(
                        {
                          ...settings,
                          textGenerationModelSelection: createModelSelection(instanceId, model),
                        },
                        textGenerationProviders,
                      ),
                    });
                  }}
                />
                {textGenInstanceEntry ? (
                  <TraitsPicker
                    provider={textGenProvider}
                    models={textGenInstanceEntry?.models ?? []}
                    model={textGenModel}
                    modelOptions={textGenModelOptions}
                    allowPromptInjectedEffort={false}
                    planModeEnabled={
                      settings.planModeEnabled || selectsPlanAgent(textGenModelOptions)
                    }
                    triggerClassName={SETTINGS_PICKER_TRIGGER_CLASSNAME}
                    onModelOptionsChange={(nextOptions) => {
                      updateSettings({
                        textGenerationModelSelection: resolveAppModelSelectionState(
                          {
                            ...settings,
                            textGenerationModelSelection: createModelSelection(
                              textGenInstanceId,
                              textGenModel,
                              nextOptions,
                            ),
                          },
                          textGenerationProviders,
                        ),
                      });
                    }}
                  />
                ) : null}
              </div>
            )
          }
        />
        <ThreadTitleInstructionsSettings />
      </SettingsSection>

      <SettingsSection id="about" title={t.settings.sections.about}>
        {isElectron || HOSTED_APP_CHANNEL ? (
          <AboutVersionSection />
        ) : (
          <>
            <SettingsRow
              id={searchableSetting("app-version").id}
              title={<AboutVersionTitle />}
              description={t.settings.general.appVersionDescription}
            />
          </>
        )}
        <MobileAppSettingsRow />
        <SettingsRow
          {...searchableSetting("privacy-policy")}
          description={t.settings.rows.privacyPolicy.description}
          control={
            <Button
              render={<a href={PRIVACY_POLICY_URL} target="_blank" rel="noreferrer noopener" />}
              size="icon-toolbar"
              variant="ghost-muted"
              aria-label={t.settings.rows.privacyPolicy.viewPolicy}
            >
              <ChevronRightIcon aria-hidden />
            </Button>
          }
        />
        <SettingsRow
          {...searchableSetting("open-source-licenses")}
          description={t.settings.rows.openSourceLicenses.description}
          control={
            <Button
              render={<Link to="/settings/open-source-licenses" />}
              size="icon-toolbar"
              variant="ghost-muted"
              aria-label={t.settings.rows.openSourceLicenses.viewLicenses}
            >
              <ChevronRightIcon aria-hidden />
            </Button>
          }
        />
      </SettingsSection>
      <SettingsSection title={t.settings.sections.diagnostics}>
        <SettingsRow
          {...searchableSetting("diagnostics")}
          description={
            isEnvironmentScope
              ? t.settings.rows.diagnostics.description
              : t.settings.rows.diagnostics.selectEnvironmentHint
          }
          control={
            <Button
              render={
                <Link to="/settings/diagnostics" search={{ machine: environmentId ?? undefined }} />
              }
              size="icon-toolbar"
              variant="ghost-muted"
              aria-label={t.settings.rows.diagnostics.viewDiagnostics}
            >
              <ChevronRightIcon aria-hidden />
            </Button>
          }
        />
      </SettingsSection>

      <LegacyFeaturesSection />
    </SettingsPageContainer>
  );
}
