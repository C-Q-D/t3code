/** Shows clipboard success and failure feedback anchored to a triggering element. */
import { t } from "~/i18n";
import type { RefObject } from "react";
import { anchoredToastManager } from "./toast";

export const ANCHORED_COPY_TOAST_TIMEOUT_MS = 1000;

/** Shows a short copy-success toast anchored to the element referenced by ref. */
export function showAnchoredCopySuccessToast(ref: RefObject<HTMLButtonElement | null>) {
  if (!ref.current) return;
  anchoredToastManager.add({
    data: {
      tooltipStyle: true,
    },
    positionerProps: {
      anchor: ref.current,
    },
    timeout: ANCHORED_COPY_TOAST_TIMEOUT_MS,
    title: t.app.clipboard.copied,
  });
}

/** Shows the supplied clipboard error in a toast anchored to ref, with a localized failure title. */
export function showAnchoredCopyErrorToast(ref: RefObject<HTMLButtonElement | null>, error: Error) {
  if (!ref.current) return;
  anchoredToastManager.add({
    data: {
      tooltipStyle: true,
    },
    positionerProps: {
      anchor: ref.current,
    },
    timeout: ANCHORED_COPY_TOAST_TIMEOUT_MS,
    title: t.app.clipboard.failed,
    description: error.message,
  });
}
