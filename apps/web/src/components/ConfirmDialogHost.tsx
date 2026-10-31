/** Displays queued client confirmations and localized controls; message content belongs to the caller. */
import { t } from "~/i18n";
import { useSyncExternalStore } from "react";

import {
  completeConfirmDialogClose,
  readConfirmDialogState,
  respondToConfirmDialog,
  subscribeConfirmDialogHost,
} from "../confirmDialog";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Button } from "./ui/button";
import { resolveConfirmDialogCopy } from "./ConfirmDialogHost.logic";

/** Resolves user responses before closing the dialog and advances the queue after it closes. */
export function ConfirmDialogHost() {
  const state = useSyncExternalStore(
    subscribeConfirmDialogHost,
    readConfirmDialogState,
    readConfirmDialogState,
  );

  const copy = resolveConfirmDialogCopy(state.status === "idle" ? "" : state.message);
  const confirmVariant = state.status === "idle" ? "default" : state.variant;
  const onCancel = () => respondToConfirmDialog(false);
  const onConfirm = () => respondToConfirmDialog(true);

  return (
    <AlertDialog
      open={state.status === "confirming"}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      onOpenChangeComplete={(open) => {
        if (!open) completeConfirmDialogClose();
      }}
    >
      <AlertDialogPopup size="wide">
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          {copy.description ? (
            <AlertDialogDescription variant="confirmation" className="whitespace-pre-line">
              {copy.description}
            </AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" size="dialog-action" />}>
            {t.common.confirm.cancel}
          </AlertDialogClose>
          <Button variant={confirmVariant} size="dialog-action-wide" onClick={onConfirm}>
            {(state.status !== "idle" && state.confirmLabel) || t.common.confirm.confirm}
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
