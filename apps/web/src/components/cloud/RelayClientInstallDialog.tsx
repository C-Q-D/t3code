/** Localized cloud presentation and existing interaction behavior. */
import { t } from "~/i18n";
import { DownloadIcon } from "lucide-react";
import { useSyncExternalStore } from "react";
import type { RelayClientInstallProgressStage } from "@t3tools/contracts";

import {
  completeRelayClientInstallDialogClose,
  readRelayClientInstallDialogState,
  respondToRelayClientInstallConfirmation,
  subscribeRelayClientInstallDialog,
} from "../../cloud/relayClientInstallDialog";
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
      <DialogPopup className="max-w-md" showCloseButton={isConfirming}>
        <DialogHeader>
          <div className="flex size-9 items-center justify-center rounded-lg border border-border/70 bg-muted/60">
            <DownloadIcon aria-hidden className="size-4.5 text-muted-foreground" />
          </div>
          <DialogTitle>
            {isInstalling ? t.account.cloud.installingRelay : t.account.cloud.installRelay}
          </DialogTitle>
          <DialogDescription>
            {isInstalling ? t.account.cloud.preparingAccess : t.account.cloud.relayRequired}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel scrollFade={false}>
          {isInstalling ? (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-3 text-sm">
                <p aria-live="polite" className="font-medium text-foreground">
                  {activeStep?.label}
                </p>
                <p className="shrink-0 tabular-nums text-muted-foreground">
                  {t.account.cloud.stepProgress(activeStepIndex + 1, installSteps.length)}
                </p>
              </div>
              <progress
                aria-label={t.account.cloud.installProgress}
                className="h-2 w-full appearance-none overflow-hidden rounded-full bg-muted [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary"
                max={installSteps.length}
                value={activeStepIndex + 1}
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t.account.cloud.keepOpen}
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-border/70 bg-muted/35 p-3">
              <p className="text-sm font-medium text-foreground">{t.account.cloud.managedRelay}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {t.account.cloud.installVersion(view.status === "confirming" ? view.version : "")}
              </p>
            </div>
          )}
        </DialogPanel>
        {isConfirming ? (
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => respondToRelayClientInstallConfirmation(false)}
            >
              {t.common.confirm.cancel}
            </Button>
            <Button onClick={() => respondToRelayClientInstallConfirmation(true)}>
              {t.account.cloud.downloadInstall}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogPopup>
    </Dialog>
  );
}
