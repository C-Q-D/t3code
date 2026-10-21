/** Localized clerk presentation and existing interaction behavior. */
import { t } from "~/i18n";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button, InlineButton } from "../ui/button";
import { useT3ConnectAccountPage } from "./T3ConnectAccountPages";

export function RemoveT3ConnectEnvironmentDialog({
  environmentLabel,
  onCancel,
  onConfirm,
}: {
  readonly environmentLabel: string | null;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  const accountPage = useT3ConnectAccountPage();
  const [shownLabel, setShownLabel] = useState(environmentLabel);
  if (environmentLabel !== null && environmentLabel !== shownLabel) setShownLabel(environmentLabel);
  const openAccountPage = accountPage.open;

  return (
    <>
      <AlertDialog
        open={environmentLabel !== null}
        onOpenChange={(open) => {
          if (!open) onCancel();
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.account.clerk.removeFromDevice(shownLabel)}</AlertDialogTitle>
            <AlertDialogDescription>{t.account.clerk.forgetHint}</AlertDialogDescription>
            <AlertDialogDescription>
              {t.account.clerk.keepAccountHint}{" "}
              {openAccountPage ? (
                <InlineButton
                  onClick={() => {
                    onCancel();
                    openAccountPage();
                  }}
                >
                  {t.account.clerk.connectSettings}
                </InlineButton>
              ) : (
                t.account.clerk.connectSettings
              )}{" "}
              {t.account.clerk.freeSpaceSuffix}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>
              {t.common.confirm.cancel}
            </AlertDialogClose>
            <Button variant="destructive" onClick={onConfirm}>
              {t.account.clerk.removeDevice}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
      {accountPage.portals}
    </>
  );
}
