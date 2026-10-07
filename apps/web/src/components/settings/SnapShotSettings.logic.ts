import { t } from "~/i18n";
import type { ClientSettingsPatch, DesktopSnapShotState, SnapShotSound } from "@t3tools/contracts";
import {
  captureSetupBackend,
  captureSetupDesktopName,
  captureSetupAccessReady,
  captureSetupMacPermissionsReady,
} from "./SnapShotSetupDialog.logic";

export function snapShotStatus(state: DesktopSnapShotState | null, enabled: boolean): string {
  if (!state) return t.settings.snapShot.checkingSnapshots;
  if (state.mode === "unavailable")
    return state.message ?? t.settings.snapShot.notSupportedOnThisPlatform;
  if (!enabled) return t.settings.snapShot.turnThisOnToSetUpSnapshots;
  return snapShotSetupSummary(state, enabled);
}

export function snapShotSetupSummary(state: DesktopSnapShotState, enabled: boolean): string {
  if (state.message) return t.settings.snapShot.captureNeedsAttention;
  if (state.linuxBackend === "hyprland" && state.hyprlandHelper?.status !== "ready")
    return state.hyprlandHelper?.status === "error"
      ? t.settings.snapShot.checkCaptureAccessInSetup
      : t.settings.snapShot.installTheCaptureHelperToContinue;
  if (captureSetupBackend(state) === "gnome" && state.gnomeExtension?.status !== "enabled")
    return t.settings.snapShot.setUpActiveWindowSnapshots;
  if (captureSetupBackend(state) === "kde" && state.kdeHelper?.status !== "ready")
    return state.kdeHelper?.status === "error"
      ? t.settings.snapShot.checkCaptureAccessInSetup
      : t.settings.snapShot.installTheCaptureHelperToContinue;
  if (captureSetupBackend(state) === "picker") return t.settings.snapShot.manualCaptureLlWindowEach;
  if (!enabled) return t.settings.snapShot.enableCaptureToContinue;
  if (state.shortcutPending)
    return state.linuxBackend === "hyprland"
      ? t.settings.snapShot.connectingYourShortcut
      : t.settings.snapShot.waitingForShortcutPermission;
  if (state.shortcutVerified) return t.settings.snapShot.readyToCapture;
  if (state.linuxBackend === "niri" && state.shortcutBinding)
    return t.settings.snapShot.shortcutUsageHint;
  if (state.linuxBackend === "hyprland" && state.shortcutActionRegistered)
    return t.settings.snapShot.shortcutUsageHint;
  if (state.shortcutRegistered)
    return state.shortcutLabel
      ? t.settings.snapShot.readyToCapture
      : t.settings.snapShot.shortcutSaved;
  return t.settings.snapShot.finishShortcutSetup;
}

export function snapShotShortcutStatus(state: DesktopSnapShotState | null): string | null {
  if (!state) return null;
  if (state.linuxBackend === "hyprland") return state.shortcutMessage;
  if (state.shortcutPending) return t.settings.snapShot.approveShortcutPermissionPromptContinueHint;
  if (state.shortcutRegistered)
    return state.mode === "portal" ? null : t.settings.snapShot.shortcutSavedHint;
  return state.shortcutMessage;
}

export function snapShotSetupButtonLabel(state: DesktopSnapShotState | null): string {
  if (!state) return t.settings.snapShot.continueSetup;
  if (captureSetupAccessReady(state)) return t.settings.snapShot.manageCapture;
  const desktop = captureSetupDesktopName(state);
  return desktop ? t.settings.snapShot.setUpCapture(desktop) : t.settings.snapShot.continueSetup;
}

// Windows needs no permissions or setup: turning capture on is enough. macOS setup
// has nothing left to manage once permissions and the shortcut are in place; the
// shortcut row stays editable inline. Revoking a permission brings the button back
// as "Continue setup" through the state message.
export function snapShotSetupComplete(
  state: DesktopSnapShotState | null,
  includeAccessibility: boolean,
): boolean {
  if (state?.windows) return true;
  return (
    state?.macPermissions !== undefined &&
    captureSetupAccessReady(state) &&
    captureSetupMacPermissionsReady(state, includeAccessibility) &&
    state.shortcutRegistered
  );
}

export type SnapShotSoundSelection = SnapShotSound | "off";

export function snapShotFeedbackUnavailableMessage(
  state: DesktopSnapShotState | null,
): string | undefined {
  if (state?.mode !== "portal" || state.linuxFeedbackAvailable) return undefined;
  if (state.linuxBackend === "hyprland")
    return state.hyprlandHelper?.status === "ready"
      ? t.settings.snapShot.captureEffectsArenTAvailableHint
      : t.settings.snapShot.installUpdateCaptureHelperEnableHint;
  if (state.linuxBackend === "niri") return t.settings.snapShot.niriEffectsUnavailableHint;
  if (state.linuxBackend === "kde")
    return state.kdeHelper?.status === "ready"
      ? t.settings.snapShot.captureEffectsArenTAvailableHint
      : t.settings.snapShot.installUpdateCaptureHelperEnableHint;
  return state.linuxBackend === "gnome-extension"
    ? t.settings.snapShot.updateGnomeExtensionSignOutHint
    : captureSetupBackend(state) === "gnome"
      ? t.settings.snapShot.finishExtensionSetupEnableEffectsHint
      : t.settings.snapShot.captureEffectsArenTAvailableHint;
}

export function snapShotDescription(state: DesktopSnapShotState | null): string {
  return state?.mode === "portal" && captureSetupBackend(state) === "picker"
    ? t.settings.snapShot.automaticCaptureIsnTAvailableHint
    : t.settings.snapShot.captureWindowAttachCurrentDraftHint;
}

export function snapShotAccessibilityUnavailableMessage(
  state: DesktopSnapShotState | null,
): string | undefined {
  if (state?.mode !== "portal") return undefined;
  if (state.linuxBackend === "picker" || state.linuxBackend === "screenshot-portal")
    return t.settings.snapShot.desktopProvidesScreenshotHint;
  return undefined;
}

export function snapShotUnavailableMessage(hasBridge: boolean): string | undefined {
  if (hasBridge) return undefined;
  return typeof window !== "undefined" && window.desktopBridge
    ? t.settings.snapShot.updateDesktopAppSnapshotsHint
    : t.settings.integrations.desktopOnlyHint;
}

export function snapShotSoundPatch(sound: SnapShotSoundSelection): ClientSettingsPatch {
  return sound === "off"
    ? { snapShotPlaySound: false }
    : { snapShotPlaySound: true, snapShotSound: sound };
}

export function createRecordingRequestTracker() {
  let currentRequest: symbol | null = null;

  return {
    tryBegin() {
      if (currentRequest) return null;
      currentRequest = Symbol();
      return currentRequest;
    },
    clear() {
      currentRequest = null;
    },
    owns(request: symbol) {
      return currentRequest === request;
    },
  };
}
