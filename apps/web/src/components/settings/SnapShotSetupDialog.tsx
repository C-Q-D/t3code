/** Snapshot permission and shortcut wizard; desktop backend rules own progression and completion. */
import { t } from "~/i18n";
import { PermissionChecklist, PermissionContinueButton } from "../permissions/PermissionChecklist";
import { usePermissionStatus } from "../permissions/usePermissionStatus";
import {
  isModifierPairShortcut,
  type DesktopSnapShotSetupAction,
  type DesktopSnapShotState,
} from "@t3tools/contracts";
import { useState, type ReactNode } from "react";
import { MacAccessibilityIcon, MacScreenRecordingIcon } from "../Icons";
import { CaptureShortcutConfig } from "./CaptureShortcutConfig";
import { Button } from "../ui/button";
import { Dialog, DialogDescription } from "../ui/dialog";
import { WizardPopup, WizardHeader, WizardFooter } from "../ui/wizard";
import { ToggleGroup, Toggle } from "../ui/toggle-group";
import {
  captureSetupAccessReady,
  captureSetupBackend,
  captureSetupCheckMessage,
  captureSetupDesktopName,
  captureSetupInitialStep,
  captureSetupShortcutReady,
  type CaptureSetupStep,
} from "./SnapShotSetupDialog.logic";

const SETUP_STEPS = [
  { id: "access", label: t.settings.snapShotSetup.steps.access },
  { id: "shortcut", label: t.settings.snapShotSetup.steps.shortcut },
] satisfies ReadonlyArray<{ readonly id: CaptureSetupStep; readonly label: string }>;

const GNOME_ACCESS_COPY = t.settings.snapShotSetup.gnome.access;

/**
 * Presents the existing two-step setup in the graphite dialog shell.
 * State and initialStep select the backend flow; wasEnabled controls cancellation rollback.
 * includeAccessibility selects required permissions. busy/error reflect the caller's pending action.
 * Shortcut props carry the shared recorder, validation status and save eligibility.
 * onSaveShortcut/onEnable resolve true only after verification; onAction/onRefresh delegate to
 * the desktop bridge without adding retries or timeouts. onClose receives completion status,
 * and onLeaveStep stops recording before navigation. Errors remain visible in the active step.
 */
export function SnapShotSetupDialog({
  state,
  initialStep,
  wasEnabled,
  includeAccessibility,
  busy: actionBusy,
  error,
  shortcutInput,
  shortcutStatus,
  shortcutChanged,
  canSaveShortcut,
  onSaveShortcut,
  onEnable,
  onAction,
  onRefresh,
  onClose,
  onLeaveStep,
}: {
  state: DesktopSnapShotState;
  initialStep: CaptureSetupStep;
  wasEnabled: boolean;
  includeAccessibility: boolean;
  busy: boolean;
  error: string | null;
  shortcutInput: ReactNode;
  shortcutStatus: string | null | undefined;
  shortcutChanged: boolean;
  canSaveShortcut: boolean;
  onSaveShortcut: () => Promise<boolean>;
  onEnable: () => Promise<boolean>;
  onAction: (action: DesktopSnapShotSetupAction) => Promise<void>;
  onRefresh: () => Promise<DesktopSnapShotState | undefined>;
  onClose: (completed: boolean) => Promise<void>;
  onLeaveStep: () => void;
}) {
  const [step, setStep] = useState(() => captureSetupInitialStep(state, initialStep));
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);
  const [configBusy, setConfigBusy] = useState(false);
  const busy = actionBusy || checking || configBusy;
  const backend = captureSetupBackend(state);
  const configShortcut = backend === "niri" || backend === "hyprland";
  const desktop = captureSetupDesktopName(state);
  const extension = state.gnomeExtension;
  const helper = backend === "hyprland" ? state.hyprlandHelper : state.kdeHelper;
  const helperBackend = backend === "kde" || backend === "hyprland";
  const installHelper = backend === "hyprland" ? "install-hyprland-helper" : "install-kde-helper";
  const removeHelper = backend === "hyprland" ? "remove-hyprland-helper" : "remove-kde-helper";
  const accessReady = captureSetupAccessReady(state);
  const permissionStatus = usePermissionStatus(
    async () => {
      const refreshed = await onRefresh();
      if (!refreshed?.macPermissions) throw new Error(t.settings.snapShotSetup.permissionError);
      return refreshed.macPermissions;
    },
    state.macPermissions ?? { screenRecording: false, accessibility: false },
    Boolean(state.macPermissions) && step === "access" && !busy,
  );
  const macPermissions = state.macPermissions ? permissionStatus.status : undefined;
  const macPermissionsReady =
    !macPermissions ||
    permissionStatus.isReady(
      includeAccessibility ? ["screenRecording", "accessibility"] : ["screenRecording"],
    );
  const shortcutReady = captureSetupShortcutReady(state, shortcutChanged);
  const install = extension?.status === "not-installed" || extension?.status === "update-required";
  const enable = extension?.status === "disabled";
  const changeStep = (next: CaptureSetupStep) => {
    onLeaveStep();
    setChecked(false);
    setStep(next);
  };
  const checkAgain = async () => {
    if (busy) return;
    setChecking(true);
    setChecked(false);
    const refreshed = await onRefresh().finally(() => setChecking(false));
    setChecked(refreshed !== undefined);
  };
  const accessCopy =
    state.message && !macPermissions
      ? {
          title: t.settings.snapShotSetup.checkError.title,
          description: t.settings.snapShotSetup.checkError.description,
        }
      : backend === "gnome" && extension
        ? extension.status === "enabled" && !accessReady
          ? {
              title: t.settings.snapShotSetup.accessCheck.title,
              description: t.settings.snapShotSetup.accessCheck.description,
            }
          : GNOME_ACCESS_COPY[extension.status]
        : helperBackend
          ? helper?.status === "ready"
            ? {
                title: t.settings.snapShotSetup.gnome.access["enabled"].title,
                description: t.settings.snapShotSetup.gnome.access["enabled"].description,
              }
            : helper?.status === "error"
              ? {
                  title: t.settings.snapShotSetup.helper.error.title,
                  description: t.settings.snapShotSetup.helper.error.description,
                }
              : {
                  title:
                    helper?.status === "update-required"
                      ? t.settings.snapShotSetup.helper.updateTitle
                      : t.settings.snapShotSetup.helper.installTitle,
                  description: t.settings.snapShotSetup.helper.description,
                }
          : backend === "niri"
            ? {
                title: t.settings.snapShotSetup.gnome.access["enabled"].title,
                description: t.settings.snapShotSetup.gnome.access["enabled"].description,
              }
            : backend === "picker"
              ? {
                  title: t.settings.snapShotSetup.picker.title,
                  description: t.settings.snapShotSetup.picker.description,
                }
              : {
                  title: t.settings.snapShotSetup.helper.installTitle,
                  description:
                    backend === "portal"
                      ? t.settings.snapShotSetup.access.portalHint
                      : macPermissions
                        ? macPermissionsReady
                          ? t.settings.snapShotSetup.access.macTestHint
                          : t.settings.snapShotSetup.access.macPermissionsHint
                        : t.settings.snapShotSetup.access.allowHint,
                };
  const title = step === "access" ? accessCopy.title : t.settings.snapShotSetup.shortcut.title;
  const description =
    step === "access"
      ? accessCopy.description
      : configShortcut
        ? t.settings.snapShotSetup.shortcut.configHint
        : state.mode === "portal"
          ? t.settings.snapShotSetup.shortcut.modifierPairHint
          : t.settings.snapShotSetup.shortcut.defaultHint;
  const stepIndex = SETUP_STEPS.findIndex(({ id }) => id === step);
  const details = [
    ...new Set(
      [
        error,
        ...(step === "access"
          ? [
              state.message,
              backend === "gnome" &&
              (extension?.status === "error" || extension?.status === "unsupported")
                ? extension.message
                : null,
              helperBackend && helper?.status === "error" ? helper.message : null,
            ]
          : []),
      ].filter((detail) => detail !== null),
    ),
  ];

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) void onClose(false);
      }}
    >
      <WizardPopup showCloseButton={!busy}>
        <WizardHeader
          title={
            desktop
              ? t.settings.snapShotSetup.desktopTitle(desktop)
              : t.settings.snapShotSetup.title
          }
        >
          <ToggleGroup
            size="settings"
            aria-label={t.app.wizard.progress}
            value={[step]}
            onValueChange={(values) => {
              const next = SETUP_STEPS.find((item) => item.id === values[0]);
              if (next && next.id !== step) changeStep(next.id);
            }}
          >
            {SETUP_STEPS.map((item, index) => (
              <Toggle
                key={item.id}
                value={item.id}
                disabled={busy || index > stepIndex}
                aria-current={item.id === step ? "step" : undefined}
                aria-label={t.app.wizard.step(item.label, index + 1, "")}
              >
                <span aria-hidden>{index + 1}</span>
                {item.label}
              </Toggle>
            ))}
          </ToggleGroup>
        </WizardHeader>
        <div className="px-5.5 py-5">
          <div className="space-y-4 text-control">
            <div className="space-y-2" aria-live="polite">
              <h3 className="flex items-center gap-2 font-semibold">{title}</h3>
              <DialogDescription>{description}</DialogDescription>
            </div>
            {step === "access" ? (
              <>
                <p
                  role="status"
                  aria-atomic="true"
                  className={
                    checked && !busy && !error
                      ? "text-secondary-copy text-muted-foreground"
                      : "sr-only"
                  }
                >
                  {checked && !busy && !error ? captureSetupCheckMessage(state) : null}
                </p>
                {macPermissions ? (
                  <PermissionChecklist
                    busy={busy}
                    permissions={[
                      {
                        id: "screenRecording",
                        icon: <MacScreenRecordingIcon className="size-8 shrink-0 drop-shadow-sm" />,
                        title: t.settings.snapShotSetup.permissions.screenRecording.title,
                        description:
                          t.settings.snapShotSetup.permissions.screenRecording.description,
                        granted: macPermissions.screenRecording,
                        onAllow: () => void onAction("allow-screen-recording"),
                      },
                      {
                        id: "accessibility",
                        icon: <MacAccessibilityIcon className="size-8 shrink-0 drop-shadow-sm" />,
                        title: t.settings.snapShotSetup.permissions.accessibility.title,
                        description: includeAccessibility
                          ? t.settings.snapShotSetup.permissions.accessibility.description
                          : t.settings.snapShotSetup.permissions.accessibility.optionalDescription,
                        granted: macPermissions.accessibility,
                        onAllow: () => void onAction("allow-accessibility"),
                      },
                    ]}
                  />
                ) : null}
                {permissionStatus.error && macPermissions ? (
                  <p role="status" className="text-secondary-copy text-muted-foreground">
                    {permissionStatus.error}
                  </p>
                ) : null}
                {helperBackend && helper?.status === "error" ? (
                  <Button
                    size="toolbar"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void onAction(installHelper)}
                  >
                    {t.settings.snapShotSetup.helper.reinstall}
                  </Button>
                ) : null}
              </>
            ) : configShortcut ? (
              <CaptureShortcutConfig
                state={state}
                disabled={actionBusy || checking || !accessReady}
                onBusyChange={setConfigBusy}
                onSaved={onRefresh}
                onComplete={() => onClose(true)}
              />
            ) : (
              <div className="space-y-3">
                {shortcutInput}
                {shortcutStatus ? (
                  <p className="text-secondary-copy text-muted-foreground" role="status">
                    {shortcutStatus}
                  </p>
                ) : null}
                {!shortcutChanged &&
                !state.shortcutRegistered &&
                !state.shortcutPending &&
                state.shortcutCanRetry !== false &&
                !isModifierPairShortcut(state.shortcut) ? (
                  <Button
                    variant="ghost"
                    size="toolbar"
                    disabled={busy}
                    onClick={() => void onAction("retry-shortcut")}
                  >
                    {state.mode === "portal"
                      ? t.settings.snapShotSetup.shortcut.permissionTitle
                      : t.settings.snapShotSetup.retry}
                  </Button>
                ) : null}
              </div>
            )}
            {step === "shortcut" && !accessReady ? (
              <p role="alert" className="text-error">
                {t.settings.snapShotSetup.access.attentionHint}
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="text-error">
                {t.settings.snapShotSetup.stepError}
              </p>
            ) : null}
            {details.length > 0 || (step === "access" && (backend === "gnome" || helperBackend)) ? (
              <details className="text-secondary-copy text-muted-foreground">
                <summary className="cursor-pointer">
                  {t.settings.rows.backgroundActivity.options.advanced}
                </summary>
                <div className="mt-3 space-y-3">
                  {details.map((detail) => (
                    <p key={detail} className="break-words">
                      {detail}
                    </p>
                  ))}
                  {step === "access" && (backend === "gnome" || helperBackend) ? (
                    <p>{t.settings.snapShotSetup.advanced.includedHint}</p>
                  ) : null}
                  {step === "access" && backend === "gnome" && extension?.status === "enabled" ? (
                    <Button
                      size="toolbar"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void onAction("disable-extension")}
                    >
                      {t.settings.snapShotSetup.advanced.disableExtension}
                    </Button>
                  ) : null}
                  {step === "access" && helperBackend && helper?.status !== "not-installed" ? (
                    <Button
                      size="toolbar"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void onAction(removeHelper)}
                    >
                      {t.settings.snapShotSetup.advanced.removeHelper}
                    </Button>
                  ) : null}
                </div>
              </details>
            ) : null}
          </div>
        </div>
        <WizardFooter>
          {step !== "access" ? (
            <Button variant="ghost" disabled={busy} onClick={() => changeStep("access")}>
              {t.settings.actions.back}
            </Button>
          ) : null}
          <Button variant="ghost" disabled={busy} onClick={() => void onClose(false)}>
            {wasEnabled ? t.settings.actions.close : t.settings.snapShotSetup.finishLater}
          </Button>
          {step === "access" ? (
            helperBackend && !accessReady && helper?.status !== "ready" ? (
              <Button
                disabled={busy}
                aria-busy={busy}
                onClick={() =>
                  void (helper?.status === "error" ? checkAgain() : onAction(installHelper))
                }
              >
                {checking
                  ? t.settings.snapShotSetup.checking
                  : busy
                    ? t.settings.snapShotSetup.installing
                    : helper?.status === "error"
                      ? t.settings.snapShotSetup.checkAgain
                      : helper?.status === "update-required"
                        ? t.settings.snapShotSetup.helper.update
                        : t.settings.snapShotSetup.helper.install}
              </Button>
            ) : backend === "gnome" && !accessReady && extension?.status !== "enabled" ? (
              <Button
                disabled={busy}
                aria-busy={checking}
                onClick={() =>
                  void (install
                    ? onAction("install-extension")
                    : enable
                      ? onAction("enable-extension")
                      : checkAgain())
                }
              >
                {checking
                  ? t.settings.snapShotSetup.checking
                  : busy
                    ? install
                      ? t.settings.snapShotSetup.installing
                      : enable
                        ? t.settings.snapShotSetup.enabling
                        : t.settings.snapShotSetup.working
                    : install
                      ? extension?.status === "update-required"
                        ? t.settings.snapShotSetup.gnome.update
                        : t.settings.snapShotSetup.gnome.install
                      : enable
                        ? t.settings.snapShotSetup.gnome.enable
                        : t.settings.snapShotSetup.checkAgain}
              </Button>
            ) : (
              <PermissionContinueButton
                ready={macPermissionsReady}
                busy={busy}
                onClick={async () => {
                  if (await onEnable()) changeStep("shortcut");
                }}
              >
                {busy
                  ? t.settings.snapShotSetup.working
                  : macPermissions
                    ? t.settings.snapShotSetup.access.testAndContinue
                    : backend === "direct"
                      ? t.settings.snapShotSetup.access.allow
                      : !accessReady && !macPermissions
                        ? t.settings.snapShotSetup.retry
                        : t.settings.actions.continue}
              </PermissionContinueButton>
            )
          ) : !configShortcut ? (
            <Button
              disabled={
                busy || !accessReady || (shortcutChanged ? !canSaveShortcut : !shortcutReady)
              }
              onClick={async () => {
                if (!shortcutChanged || (await onSaveShortcut())) await onClose(true);
              }}
            >
              {busy
                ? t.settings.snapShotSetup.saving
                : shortcutChanged
                  ? t.settings.snapShotSetup.saveAndFinish
                  : t.settings.actions.done}
            </Button>
          ) : null}
        </WizardFooter>
      </WizardPopup>
    </Dialog>
  );
}
