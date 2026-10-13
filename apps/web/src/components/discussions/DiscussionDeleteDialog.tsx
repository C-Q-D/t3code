/** Owns the local deletion confirmation; navigation is only performed by a successful page command. */
import { t } from "~/i18n";
import {
  AlertDialog,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
/** Prevents dismissal while the shared header queue is submitting deletion. */
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
      <AlertDialogPopup className="w-100" bottomStickOnMobile={false}>
        <div className="flex flex-col gap-2 p-5">
          <AlertDialogTitle>{t.discussions.page.deleteTitle}</AlertDialogTitle>
          <AlertDialogDescription>{t.discussions.page.deleteDescription}</AlertDialogDescription>
        </div>
        <AlertDialogFooter>
          <Button variant="outline" disabled={pending} onClick={onClose}>
            {t.discussions.page.cancel}
          </Button>
          <Button variant="destructive" disabled={pending} onClick={() => void onSubmit()}>
            {t.discussions.page.delete}
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
