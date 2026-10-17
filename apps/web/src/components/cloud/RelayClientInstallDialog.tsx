/** Localized cloud presentation and existing interaction behavior. */
import { t } from "~/i18n";
import { CircleCheckIcon, CircleIcon, HourglassIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "~/lib/utils";
import { relayInstallGroup } from "../onboarding/relayInstallPresentation.logic";
import { OnboardingPopup, OnboardingFooter } from "../onboarding/OnboardingSurface";
import { useSyncExternalStore } from "react";
import type { RelayClientInstallProgressStage } from "@t3tools/contracts";

import {
  completeRelayClientInstallDialogClose,
  readRelayClientInstallDialogState,
  respondToRelayClientInstallConfirmation,
  subscribeRelayClientInstallDialog,
} from "../../cloud/relayClientInstallDialog";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
const installSteps: ReadonlyArray<{
  readonly stage: RelayClientInstallProgressStage;
  readonly label: string;
}> = [
  { stage: "checking", label: t.account.cloud.checkingInstallation },
  { stage: "waiting_for_lock", label: t.account.cloud.waitingInstaller },
  { stage: "downloading", label: t.account.cloud.downloadingRelay },
  { stage: "verifying", label: t.account.cloud.verifyingDownload },
  { stage: "installing", label: t.account.cloud.installingRelay },
  { stage: "validating", label: t.account.cloud.validatingExecutable },
  { stage: "activating", label: t.account.cloud.activatingInstallation },
];

/** Renders the active relay installation request and progress; confirmation callbacks resolve the request and an inactive request renders nothing. */
export function RelayClientInstallDialog() {
  const state = useSyncExternalStore(
    subscribeRelayClientInstallDialog,
    readRelayClientInstallDialogState,
    readRelayClientInstallDialogState,
  );
  const view = state.status === "closing" ? state.view : state;
  const isConfirming = view.status === "confirming";
  const isInstalling = view.status === "installing";
  const activeStepIndex = isInstalling
    ? installSteps.findIndex(({ stage }) => stage === view.stage)
    : -1;
  const activeStep = installSteps[activeStepIndex];
  const activeGroup = isInstalling ? relayInstallGroup(view.stage) : -1;
  const groupLabels = [
    t.account.cloud.relayDownload,
    t.account.cloud.relayInstall,
    t.account.cloud.relayStart,
  ];

  return (
    <Dialog
      open={state.status === "confirming" || state.status === "installing"}
      onOpenChange={(open) => {
        if (!open && isConfirming) {
          respondToRelayClientInstallConfirmation(false);
        }
      }}
      onOpenChangeComplete={(open) => {
        if (!open) {
          completeRelayClientInstallDialogClose();
        }
      }}
    >
      <OnboardingPopup>
        <DialogPrimitive.Title className="font-serif text-ov5-prompt-title font-bold">
          {t.account.cloud.installRelay}
        </DialogPrimitive.Title>
        <DialogPrimitive.Description className="sr-only">
          {isInstalling ? t.account.cloud.preparingAccess : t.account.cloud.relayRequired}
        </DialogPrimitive.Description>
        {isInstalling ? (
          <div className="space-y-2">
            {groupLabels.map((label, index) => {
              const active = index === activeGroup;
              const complete = index < activeGroup;
              const Icon = complete ? CircleCheckIcon : active ? HourglassIcon : CircleIcon;
              return (
                <div
                  key={label}
                  className={cn(
                    "flex items-center gap-2.5 text-control",
                    active
                      ? "font-semibold text-foreground"
                      : complete
                        ? "text-foreground"
                        : "text-placeholder",
                  )}
                >
                  <Icon className="size-3.75 shrink-0" />
                  <span>{label}</span>
                  {active ? (
                    <progress
                      className="ov5-install-progress h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-input shadow-well-progress"
                      aria-label={t.account.cloud.installProgress}
                      aria-valuetext={activeStep?.label}
                      max={installSteps.length}
                      value={activeStepIndex + 1}
                    />
                  ) : null}
                </div>
              );
            })}
            <p aria-live="polite" className="text-secondary-copy text-secondary-label">
              {activeStep?.label} ·{" "}
              {t.account.cloud.stepProgress(activeStepIndex + 1, installSteps.length)}
            </p>
            <p className="text-secondary-copy text-secondary-label">{t.account.cloud.keepOpen}</p>
          </div>
        ) : (
          <div className="space-y-2 text-secondary-copy text-secondary-label">
            <p>{t.account.cloud.managedRelay}</p>
            <p>
              {t.account.cloud.installVersion(view.status === "confirming" ? view.version : "")}
            </p>
          </div>
        )}
        <OnboardingFooter>
          <Button
            size="dialog-action"
            variant="outline"
            disabled={!isConfirming}
            onClick={() => respondToRelayClientInstallConfirmation(false)}
          >
            {t.common.confirm.cancel}
          </Button>
          {isConfirming ? (
            <Button
              size="dialog-action"
              onClick={() => respondToRelayClientInstallConfirmation(true)}
            >
              {t.account.cloud.downloadInstall}
            </Button>
          ) : null}
        </OnboardingFooter>
      </OnboardingPopup>
    </Dialog>
  );
}
