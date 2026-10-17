/** Displays keybinding configuration warnings and opens their source file in an authorized editor. */
import { t } from "~/i18n";
import {
  AuthOrchestrationOperateScope,
  type EditorId,
  type EnvironmentId,
} from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";

import { useOpenInPreferredEditor } from "../editorPreferences";
import { useEnvironmentScope } from "../state/session";
import { KeyboardIcon } from "lucide-react";
import { stackedThreadToast, toastManager } from "./ui/toast";

/** Shows the supplied configuration message and opens configPath in an available editor on environmentId; failures produce a toast. */
export function KeybindingsConfigWarning({
  message,
  environmentId,
  configPath,
  availableEditors,
}: {
  message: string;
  environmentId: EnvironmentId | null;
  configPath: string | null;
  availableEditors: readonly EditorId[];
}) {
  const canOpenEditor = useEnvironmentScope(environmentId, AuthOrchestrationOperateScope);
  const openInEditor = useOpenInPreferredEditor(environmentId, availableEditors);

  return (
    <span className="ov4-keybindings-warning flex items-start gap-2.5 py-3 pl-3 pr-2 text-shadow-none">
      <KeyboardIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <strong className="text-control font-bold text-ov4-warning-title">
          {t.app.keybindings.invalidTitle}
        </strong>
        <span className="whitespace-normal break-words text-secondary-copy-medium text-ov4-warning-copy">
          {message}
        </span>
      </span>
      <button
        type="button"
        className="h-7 shrink-0 cursor-pointer rounded-full bg-primary-foreground px-2.5 text-secondary-copy font-extrabold text-primary outline-none focus-visible:inset-shadow-focus disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!canOpenEditor || !configPath || availableEditors.length === 0}
        onClick={async () => {
          if (!configPath) return;
          const result = await openInEditor(configPath);
          if (result._tag === "Success") return;
          const error = squashAtomCommandFailure(result);
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: t.app.keybindings.openError,
              description:
                error instanceof Error ? error.message : t.app.keybindings.unknownOpenError,
            }),
          );
        }}
      >
        {t.app.keybindings.openSettings}
      </button>
    </span>
  );
}
