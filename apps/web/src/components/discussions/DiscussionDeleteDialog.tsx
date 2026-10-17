/** Owns the local deletion confirmation; navigation is only performed by a successful page command. */
import { t } from "~/i18n";
import {
  AlertDialog,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogDescription,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
/**
 * Confirms deletion without changing the page command or its navigation behavior.
 * @param props.pending Disables both actions and dismissal while deletion is queued.
 * @param props.onClose Cancels locally without deleting records.
 * @param props.onSubmit Page-owned deletion; the page handles errors and navigation.
 * @returns H5 alert dialog; no persistence or retry is owned here.
 */
export function DiscussionDeleteDialog({
  pending,
  onClose,
  onSubmit,
}: {
  pending: boolean;
  onClose: () => void;
  onSubmit: () => Promise<void>;
}) {
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <AlertDialogPopup size="compact" bottomStickOnMobile={false}>
        <div className="flex flex-col gap-2.5 p-6">
          <AlertDialogTitle size="lg">{t.discussions.page.deleteTitle}</AlertDialogTitle>
          <AlertDialogDescription variant="confirmation">
            {t.discussions.page.deleteDescription}
          </AlertDialogDescription>
          <div data-slot="alert-dialog-footer" className="mt-2.5 flex justify-end gap-2">
            <Button
              variant="dialog-secondary"
              size="dialog-action"
              disabled={pending}
              onClick={onClose}
            >
              {t.discussions.page.cancel}
            </Button>
            <Button
              variant="danger-key"
              size="dialog-action-wide"
              disabled={pending}
              onClick={() => void onSubmit()}
            >
              {t.discussions.page.delete}
            </Button>
          </div>
        </div>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
