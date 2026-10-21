/** Desktop snapshot preferences; preserves capture setup and shortcut validation behind N3's settings rows. */
import { t } from "~/i18n";
import { useAtomValue } from "@effect/atom-react";
import {
  isModifierPairShortcut,
  type ClientSettingsPatch,
  type DesktopSnapShotShortcutAvailability,
  type DesktopSnapShotState,
  type DesktopSnapShotSetupAction,
  type SnapShotShortcut,
} from "@t3tools/contracts";
import { PlayIcon } from "lucide-react";
import { settlePromise } from "@t3tools/client-runtime/state/runtime";
import * as Cause from "effect/Cause";
import { useEffect, useRef, useState } from "react";

import { useStableCallback } from "../../hooks/useStableCallback";
import { useClientSettings, updateClientSettings } from "../../hooks/useSettings";
import { getDesktopSnapShotBridge } from "../../lib/desktopSnapShot";
import {
  readSnapShotSetupResume,
  saveSnapShotSetupResume,
  clearSnapShotSetupResume,
} from "../../lib/snapShotSetupResume";
import { sameSnapShotShortcut, snapShotKeybindingConflict } from "../../lib/snapShotShortcut";
import { playSnapShotSound } from "../../lib/snapShotSound";
import { primaryServerKeybindingsAtom } from "../../state/server";
import { commandLabel } from "./KeybindingsSettings.logic";
import {
  snapShotStatus,
  snapShotShortcutStatus,
  snapShotSetupButtonLabel,
  snapShotUnavailableMessage,
  snapShotSoundPatch,
  snapShotFeedbackUnavailableMessage,
  snapShotDescription,
  snapShotAccessibilityUnavailableMessage,
  snapShotSetupComplete,
  type SnapShotSoundSelection,
} from "./SnapShotSettings.logic";
import {
  SettingsUnavailableGroup,
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "../ui/menu";
import { SelectButton } from "../ui/select";
import { Switch } from "../ui/switch";
import { toastManager } from "../ui/toast";
import { SnapShotSetupDialog } from "./SnapShotSetupDialog";
import { useSnapShotShortcutRecorder } from "./useSnapShotShortcutRecorder";
import {
  captureSetupAccessReady,
  captureSetupInitialStep,
  captureSetupShouldDisableOnClose,
  type CaptureSetupStep,
} from "./SnapShotSetupDialog.logic";

const soundOptionRowClassName = "flex items-center justify-between gap-2";

/** Maps a failed capture operation to a localized error, preserving the bridge's diagnostic message. */
function captureSettingsError(title: string, error: unknown) {
  return { title, message: error instanceof Error ? error.message : t.settings.restore.retryHint };
}

/** Availability belongs to the current shortcut candidate; idle and pending checks cannot authorize saving. */
type ShortcutCheck =
  | { readonly status: "idle"; readonly availability: null }
  | {
      readonly status: "checking";
      readonly availability: null;
      readonly shortcut: SnapShotShortcut;
    }
  | {
      readonly status: "checked";
      readonly shortcut: SnapShotShortcut;
      readonly availability: DesktopSnapShotShortcutAvailability;
    };

/**
 * Renders device-local capture settings and the existing permission wizard, with no props.
 * Writes use the client settings hook; bridge failures surface through the wizard or a toast.
 * Registration, permission checks and their retry policy remain owned by the desktop bridge.
 */
export function SnapShotSettings() {
  const settings = useClientSettings((current) => ({
    snapShotAnimations: current.snapShotAnimations,
    snapShotEnabled: current.snapShotEnabled,
    snapShotFlash: current.snapShotFlash,
    snapShotIncludeAccessibility: current.snapShotIncludeAccessibility,
    snapShotPlaySound: current.snapShotPlaySound,
    snapShotShortcut: current.snapShotShortcut,
    snapShotSound: current.snapShotSound,
  }));
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const bridge = getDesktopSnapShotBridge();
  const [state, setState] = useState<DesktopSnapShotState | null>(null);
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupError, setSetupError] = useState<ReturnType<typeof captureSettingsError> | null>(
    null,
  );
  const [wizard, setWizard] = useState<{
    initialStep: CaptureSetupStep;
    wasEnabled: boolean;
  } | null>(null);
  const [candidate, setCandidate] = useState<SnapShotShortcut>(settings.snapShotShortcut);
  const [latestShortcutCheck, setShortcutCheck] = useState<ShortcutCheck>({
    status: "idle",
    availability: null,
  });
  // A check answers for one shortcut; once the candidate moves on (an edit, or hydration
  // resetting it) a late answer for the old one no longer shows.
  const shortcutCheck: ShortcutCheck =
    latestShortcutCheck.status === "idle" ||
    sameSnapShotShortcut(latestShortcutCheck.shortcut, candidate)
      ? latestShortcutCheck
      : { status: "idle", availability: null };
  const shortcutCheckIdRef = useRef(0);
  const stateRequestIdRef = useRef(0);
  const unavailableMessage = snapShotUnavailableMessage(Boolean(bridge));
  const captureAvailable = Boolean(bridge) && state !== null && state.mode !== "unavailable";
  const feedbackUnavailable = snapShotFeedbackUnavailableMessage(state);
  const savedShortcut = settings.snapShotShortcut;
  const managedShortcut = state?.linuxBackend === "niri" || state?.linuxBackend === "hyprland";
  const shortcutChanged = !managedShortcut && !sameSnapShotShortcut(candidate, savedShortcut);
  const displayShortcut = shortcutChanged ? candidate : (state?.shortcut ?? savedShortcut);
  const candidateConflict = shortcutChanged
    ? snapShotKeybindingConflict(candidate, keybindings)
    : null;
  const canSaveShortcut =
    shortcutChanged && candidateConflict === null && shortcutCheck.availability?.available === true;
  const soundSelection = settings.snapShotPlaySound ? settings.snapShotSound : "off";
  const soundLabel =
    soundSelection === "off"
      ? t.settings.connections.status.off
      : soundSelection === "soft-pop"
        ? t.settings.snapShot.whooshDefault
        : t.settings.snapShot.click;

  // Registered as a window focus listener, so it keeps one identity.
  const refreshState = useStableCallback(async () => {
    const requestId = ++stateRequestIdRef.current;
    try {
      if (bridge) {
        const nextState = await bridge.getSnapShotState();
        if (requestId === stateRequestIdRef.current) setState(nextState);
        return nextState;
      }
    } catch (error) {
      if (requestId === stateRequestIdRef.current)
        setSetupError(captureSettingsError(t.settings.snapShot.couldnTCheckCaptureSetup, error));
    }
  });

  const setup = async (action: DesktopSnapShotSetupAction) => {
    if (!bridge?.setupSnapShot || setupBusy) return;
    setSetupBusy(true);
    setSetupError(null);
    const result = await settlePromise(async () => {
      if (
        state?.macPermissions &&
        wizard &&
        (action === "allow-screen-recording" || action === "allow-accessibility")
      ) {
        // macOS can quit the app from its permission prompt.
        saveSnapShotSetupResume(wizard.wasEnabled);
      }
      await bridge.setupSnapShot!(action);
      await refreshState();
    });
    if (result._tag === "Failure") {
      setSetupError(
        captureSettingsError(
          action === "retry-shortcut"
            ? t.settings.snapShot.couldnTOpenShortcutPermissions
            : t.settings.snapShot.couldnTCompleteCaptureSetup,
          Cause.squash(result.cause),
        ),
      );
    }
    setSetupBusy(false);
  };

  // Outside the wizard there is nowhere to show an error inline, so it goes to a toast,
  // once. The error stays in state until the next action clears it.
  const toastedErrorRef = useRef<typeof setupError>(null);
  useEffect(() => {
    if (!setupError || wizard || toastedErrorRef.current === setupError) return;
    toastedErrorRef.current = setupError;
    toastManager.add({
      type: "error",
      title: setupError.title,
      description: setupError.message,
    });
  }, [setupError, wizard]);

  useEffect(() => {
    let cancelled = false;
    void refreshState().then((current) => {
      const resume = readSnapShotSetupResume();
      if (!cancelled && current?.macPermissions && resume) {
        setWizard({ initialStep: "access", wasEnabled: resume.wasEnabled });
      }
    });
    window.addEventListener("focus", refreshState);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refreshState);
    };
  }, [refreshState]);

  useEffect(
    () =>
      bridge?.onSnapShotEvent((event) => {
        if (event.type === "shortcut-changed") void refreshState();
      }),
    [bridge, refreshState],
  );

  // Hydration can hand back an equal shortcut object; only a different shortcut resets the edit.
  const [renderedSavedShortcut, setRenderedSavedShortcut] = useState(savedShortcut);
  if (!sameSnapShotShortcut(renderedSavedShortcut, savedShortcut)) {
    setRenderedSavedShortcut(savedShortcut);
    setCandidate(savedShortcut);
    setShortcutCheck({ status: "idle", availability: null });
  }
  // A check still in flight was for the shortcut being replaced.
  const checkedForSavedShortcutRef = useRef(savedShortcut);
  useEffect(() => {
    if (sameSnapShotShortcut(checkedForSavedShortcutRef.current, savedShortcut)) return;
    checkedForSavedShortcutRef.current = savedShortcut;
    shortcutCheckIdRef.current++;
  }, [savedShortcut]);

  const save = async (patch: ClientSettingsPatch) => {
    setSetupError(null);
    try {
      await updateClientSettings(patch);
      return await refreshState();
    } catch (error) {
      setSetupError(captureSettingsError(t.settings.snapShot.couldnTSaveCaptureSettings, error));
    }
  };

  const saveIncludeAccessibility = async (includeAccessibility: boolean) => {
    try {
      if (includeAccessibility && settings.snapShotEnabled)
        await bridge?.requestSnapShotPermissions(true);
      await save({ snapShotIncludeAccessibility: includeAccessibility });
    } catch (error) {
      setSetupError(captureSettingsError(t.settings.snapShot.couldnTAllowAppTextCapture, error));
    }
  };

  const checkShortcut = async (shortcut: SnapShotShortcut) => {
    const checkId = ++shortcutCheckIdRef.current;
    setCandidate(shortcut);
    const conflict = snapShotKeybindingConflict(shortcut, keybindings);
    if (conflict || !bridge) return;
    setShortcutCheck({ status: "checking", availability: null, shortcut });
    try {
      const availability = await bridge.checkSnapShotShortcut(shortcut);
      if (checkId === shortcutCheckIdRef.current) {
        setShortcutCheck({ status: "checked", availability, shortcut });
      }
    } catch (error) {
      if (checkId !== shortcutCheckIdRef.current) return;
      setShortcutCheck({
        status: "checked",
        shortcut,
        availability: {
          available: false,
          message:
            error instanceof Error ? error.message : t.settings.snapShot.couldNotCheckThisShortcut,
        },
      });
    }
  };

  const {
    recording,
    stopRecording,
    input: shortcutInput,
  } = useSnapShotShortcutRecorder({
    shortcut: displayShortcut,
    shortcutLabel: !shortcutChanged ? state?.shortcutLabel : undefined,
    disabled: setupBusy,
    allowModifierPairs: state?.mode !== "portal",
    onRecord: (shortcut) => void checkShortcut(shortcut),
    onStart: () => {
      shortcutCheckIdRef.current++;
      setShortcutCheck({ status: "idle", availability: null });
    },
    onError: (message) =>
      setShortcutCheck({
        status: "checked",
        shortcut: candidate,
        availability: { available: false, message },
      }),
  });

  const shortcutStatus = recording
    ? t.settings.snapShot.pressYourShortcutEscCancels
    : candidateConflict
      ? t.settings.snapShot.t3CodeAlreadyUsesThisFor(commandLabel(candidateConflict))
      : shortcutCheck.status === "checking"
        ? t.settings.snapShot.checkingShortcut
        : shortcutCheck.availability
          ? shortcutCheck.availability.available
            ? t.settings.snapShot.readyToSave
            : shortcutCheck.availability.message
          : state?.mode === "portal" &&
              !state.shortcutLabel &&
              isModifierPairShortcut(displayShortcut)
            ? t.settings.snapShot.shortcutExampleHint
            : snapShotShortcutStatus(state);

  const openSetup = async (requested: CaptureSetupStep | "resume" = "resume") => {
    if (!state || setupBusy) return;
    stopRecording();
    shortcutCheckIdRef.current++;
    setCandidate(savedShortcut);
    setShortcutCheck({ status: "idle", availability: null });
    setSetupError(null);
    setSetupBusy(true);
    await prepareSetup(requested).finally(() => setSetupBusy(false));
  };

  const prepareSetup = async (requested: CaptureSetupStep | "resume") => {
    let current = await refreshState();
    if (!current) return;
    if (current.macPermissions) requested = "access";
    if (!settings.snapShotEnabled && captureSetupInitialStep(current, requested) !== "access") {
      current = await save({ snapShotEnabled: true });
      if (!current) {
        // A settings write can succeed even if the following status check
        // fails. Keep Finish later available to turn capture back off.
        setWizard({ initialStep: "access", wasEnabled: false });
        return;
      }
    }
    setWizard({
      initialStep: captureSetupInitialStep(current, requested),
      wasEnabled: settings.snapShotEnabled,
    });
  };

  const enableForSetup = async () => {
    if (setupBusy) return false;
    setSetupBusy(true);
    setSetupError(null);
    const verified = await settlePromise(async () => {
      if (state?.macPermissions) {
        saveSnapShotSetupResume(wizard?.wasEnabled ?? settings.snapShotEnabled);
        if (!bridge?.setupSnapShot)
          throw new Error(t.settings.snapShot.restartTCodeFinishCaptureHint);
        await bridge.setupSnapShot("test-mac-capture");
      }
      if (state?.mode === "direct")
        await bridge?.requestSnapShotPermissions(settings.snapShotIncludeAccessibility);
      const nextState =
        settings.snapShotEnabled && !state?.message
          ? await refreshState()
          : await save({ snapShotEnabled: true });
      return nextState !== undefined && captureSetupAccessReady(nextState);
    });
    setSetupBusy(false);
    if (verified._tag === "Success") return verified.value;
    setSetupError(
      captureSettingsError(
        t.settings.snapShot.couldnTVerifyCaptureAccess,
        Cause.squash(verified.cause),
      ),
    );
    return false;
  };

  const closeSetup = async (completed: boolean) => {
    if (!wizard || setupBusy) return;
    setSetupBusy(true);
    const closed = await settlePromise(async () => {
      if (
        settings.snapShotEnabled &&
        captureSetupShouldDisableOnClose(wizard.wasEnabled, completed)
      ) {
        if (!(await save({ snapShotEnabled: false }))) return;
      }
      stopRecording();
      setSetupError(null);
      clearSnapShotSetupResume();
      setWizard(null);
    });
    if (closed._tag === "Failure") {
      setSetupError(
        captureSettingsError(
          t.settings.snapShot.couldnTCloseCaptureSetup,
          Cause.squash(closed.cause),
        ),
      );
    }
    setSetupBusy(false);
  };

  const saveShortcut = async () => {
    if (!canSaveShortcut || setupBusy) return false;
    setSetupBusy(true);
    const saved = await save({ snapShotShortcut: candidate }).finally(() => setSetupBusy(false));
    return Boolean(saved?.shortcutRegistered || saved?.shortcutPending);
  };

  return (
    <SettingsPageContainer>
      <SettingsSection id="snap-shot" title={t.settings.rows.snapShotEnabled.title}>
        <SettingsUnavailableGroup message={unavailableMessage}>
          <SettingsRow
            {...searchableSetting("snap-shot-enabled")}
            description={snapShotDescription(state)}
            status={
              bridge
                ? setupBusy && !wizard
                  ? t.settings.snapShot.updatingCaptureSettings
                  : snapShotStatus(state, settings.snapShotEnabled)
                : undefined
            }
            control={
              <>
                {settings.snapShotEnabled &&
                !snapShotSetupComplete(state, settings.snapShotIncludeAccessibility) ? (
                  <Button
                    size="toolbar"
                    variant="outline"
                    disabled={setupBusy}
                    onClick={() => void openSetup()}
                  >
                    {snapShotSetupButtonLabel(state)}
                  </Button>
                ) : null}
                <Switch
                  checked={settings.snapShotEnabled || Boolean(wizard)}
                  disabled={!captureAvailable || setupBusy}
                  aria-label={t.settings.snapShot.enableSnapshots}
                  onCheckedChange={(checked) => {
                    if (!checked) void save({ snapShotEnabled: false });
                    else if (state?.windows) void save({ snapShotEnabled: true });
                    else void openSetup();
                  }}
                />
              </>
            }
          />
          {settings.snapShotEnabled && captureAvailable ? (
            <>
              <SettingsRow
                {...searchableSetting("snap-shot-accessibility")}
                description={t.settings.snapShot.includeTextControlsAppMakesHint}
                status={snapShotAccessibilityUnavailableMessage(state)}
                control={
                  <Switch
                    checked={
                      !snapShotAccessibilityUnavailableMessage(state) &&
                      settings.snapShotIncludeAccessibility
                    }
                    disabled={
                      !captureAvailable || Boolean(snapShotAccessibilityUnavailableMessage(state))
                    }
                    aria-label={t.settings.snapShot.includeAppTextInSnapshots}
                    onCheckedChange={(checked) => void saveIncludeAccessibility(checked)}
                  />
                }
              />
              <SettingsRow
                {...searchableSetting("snap-shot-shortcut")}
                description={
                  state?.linuxBackend === "picker"
                    ? t.settings.snapShot.windowCaptureAnyAppHint
                    : t.settings.snapShot.captureWindowReUsingWithoutHint
                }
                status={managedShortcut ? undefined : shortcutStatus}
                control={
                  <Switch
                    checked={Boolean(state?.shortcutRegistered)}
                    disabled
                    aria-label={t.settings.rows.snapShotShortcut.title}
                    aria-describedby="snap-shot-shortcut-toggle-hint"
                  />
                }
              >
                {/* N3 draws a toggle, but the contract has no independent shortcut enable flag. */}
                <p
                  id="snap-shot-shortcut-toggle-hint"
                  className="text-secondary-copy text-muted-foreground"
                >
                  {t.settings.snapShot.shortcutToggleUnavailable}
                </p>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {managedShortcut ? (
                    <Button
                      size="toolbar"
                      variant="outline"
                      disabled={setupBusy}
                      onClick={() => void openSetup("shortcut")}
                    >
                      {t.settings.snapShot.changeShortcut}
                    </Button>
                  ) : (
                    <>
                      {shortcutInput}
                      {shortcutChanged ? (
                        <>
                          <Button
                            size="toolbar"
                            disabled={!canSaveShortcut || setupBusy}
                            onClick={() => void saveShortcut()}
                          >
                            {setupBusy ? t.settings.snapShotSetup.saving : t.settings.snapShot.save}
                          </Button>
                          <Button
                            size="toolbar"
                            variant="ghost"
                            disabled={setupBusy}
                            onClick={() => {
                              stopRecording();
                              shortcutCheckIdRef.current++;
                              setCandidate(savedShortcut);
                              setShortcutCheck({ status: "idle", availability: null });
                            }}
                          >
                            {t.settings.actions.cancel}
                          </Button>
                        </>
                      ) : state?.mode === "portal" &&
                        state.shortcutCanRetry !== false &&
                        !isModifierPairShortcut(savedShortcut) ? (
                        <Button
                          size="toolbar"
                          variant="ghost"
                          disabled={setupBusy || state.shortcutPending}
                          onClick={() => void setup("retry-shortcut")}
                        >
                          {t.settings.snapShotSetup.shortcut.permissionTitle}
                        </Button>
                      ) : null}
                    </>
                  )}
                </div>
              </SettingsRow>
              <SettingsRow
                {...searchableSetting("snap-shot-sound")}
                description={t.settings.snapShot.soundPlayedCaptureStartsHint}
                control={
                  <Switch
                    checked={settings.snapShotPlaySound}
                    disabled={!captureAvailable}
                    aria-label={t.settings.rows.snapShotSound.title}
                    onCheckedChange={(checked) => void save({ snapShotPlaySound: checked })}
                  />
                }
              >
                <div className="flex justify-end">
                  <Menu>
                    <MenuTrigger
                      aria-label={t.settings.snapShot.snapshotSound + soundLabel}
                      render={<SelectButton size="settings" />}
                      disabled={!captureAvailable}
                    >
                      {soundSelection === "off" ? (
                        t.settings.connections.status.off
                      ) : soundSelection === "soft-pop" ? (
                        <>
                          {t.settings.snapShot.whoosh}
                          <span className="text-muted-foreground">
                            {t.settings.snapShot.default}
                          </span>
                        </>
                      ) : (
                        t.settings.snapShot.click
                      )}
                    </MenuTrigger>
                    <MenuPopup align="end">
                      <MenuRadioGroup
                        onValueChange={(value) =>
                          void save(snapShotSoundPatch(value as SnapShotSoundSelection))
                        }
                        value={soundSelection}
                      >
                        <MenuRadioItem density="compact" closeOnClick value="off">
                          {t.settings.connections.status.off}
                        </MenuRadioItem>
                        <div className={soundOptionRowClassName}>
                          <MenuRadioItem density="compact" closeOnClick value="soft-pop">
                            {t.settings.snapShot.whoosh}
                            <span className="text-muted-foreground">
                              {t.settings.snapShot.default}
                            </span>
                          </MenuRadioItem>
                          <MenuItem
                            density="compact"
                            aria-label={t.settings.snapShot.playWhoosh}
                            closeOnClick={false}
                            onClick={() => playSnapShotSound("soft-pop")}
                          >
                            <PlayIcon />
                          </MenuItem>
                        </div>
                        <div className={soundOptionRowClassName}>
                          <MenuRadioItem density="compact" closeOnClick value="camera-shutter">
                            {t.settings.snapShot.click}
                          </MenuRadioItem>
                          <MenuItem
                            density="compact"
                            aria-label={t.settings.snapShot.playClick}
                            closeOnClick={false}
                            onClick={() => playSnapShotSound("camera-shutter")}
                          >
                            <PlayIcon />
                          </MenuItem>
                        </div>
                      </MenuRadioGroup>
                    </MenuPopup>
                  </Menu>
                </div>
              </SettingsRow>
              <SettingsRow
                {...searchableSetting("snap-shot-flash")}
                description={t.settings.snapShot.showGentleCueCapturedWindowHint}
                status={feedbackUnavailable}
                control={
                  <Switch
                    checked={!feedbackUnavailable && settings.snapShotFlash}
                    disabled={!captureAvailable || Boolean(feedbackUnavailable)}
                    aria-label={t.settings.snapShot.flashCapturedWindow}
                    onCheckedChange={(checked) => void save({ snapShotFlash: checked })}
                  />
                }
              />
              <SettingsRow
                {...searchableSetting("snap-shot-animations")}
                description={t.settings.snapShot.animateCapturedWindowsDraftHint}
                status={feedbackUnavailable}
                control={
                  <Switch
                    checked={!feedbackUnavailable && settings.snapShotAnimations}
                    disabled={!captureAvailable || Boolean(feedbackUnavailable)}
                    aria-label={t.settings.snapShot.animateSnapshots}
                    onCheckedChange={(checked) => void save({ snapShotAnimations: checked })}
                  />
                }
              />
            </>
          ) : null}
        </SettingsUnavailableGroup>
      </SettingsSection>
      {wizard && state ? (
        <SnapShotSetupDialog
          state={state}
          initialStep={wizard.initialStep}
          wasEnabled={wizard.wasEnabled}
          includeAccessibility={settings.snapShotIncludeAccessibility}
          busy={setupBusy}
          error={setupError?.message ?? null}
          shortcutInput={shortcutInput}
          shortcutStatus={shortcutStatus}
          shortcutChanged={shortcutChanged}
          canSaveShortcut={canSaveShortcut}
          onSaveShortcut={saveShortcut}
          onEnable={enableForSetup}
          onAction={setup}
          onRefresh={refreshState}
          onClose={closeSetup}
          onLeaveStep={stopRecording}
        />
      ) : null}
    </SettingsPageContainer>
  );
}
