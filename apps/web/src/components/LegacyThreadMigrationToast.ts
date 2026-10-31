import { t } from "~/i18n";
import { createElement } from "react";
import { ArchiveRestoreIcon } from "lucide-react";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { primaryServerLegacyThreadMigrationAtom } from "../state/server";
import { toastManager } from "./ui/toast";

type MigrationToastId = ReturnType<typeof toastManager.add>;

/** A loading toast for as long as the primary server reports a legacy thread migration running. */
export function startLegacyThreadMigrationToast(): () => void {
  let toastId: MigrationToastId | null = null;

  const unsubscribe = appAtomRegistry.subscribe(
    primaryServerLegacyThreadMigrationAtom,
    (migration) => {
      if (migration?.status === "running") {
        if (toastId !== null) return;
        toastId = toastManager.add({
          type: "loading",
          title: t.app.migration.restoring,
          description: t.app.migration.progress(migration.totalThreadCount),
          data: {
            leadingIcon: createElement(ArchiveRestoreIcon, {
              "aria-hidden": true,
              className: "size-3.75",
            }),
            iconTone: "neutral",
          },
          timeout: 0,
        });
        return;
      }

      if (toastId !== null) {
        toastManager.close(toastId);
        toastId = null;
      }
    },
    { immediate: true },
  );

  return () => {
    unsubscribe();
    if (toastId !== null) toastManager.close(toastId);
  };
}
