/** Localized terminal presentation and existing interaction behavior. */
import { t } from "~/i18n";
import { readLocalApi } from "~/localApi";

let pendingConfirmations = 0;

export function isTerminalCloseConfirmPending(): boolean {
  return pendingConfirmations > 0;
}

export async function confirmTerminalClose(
  labels: readonly [string, ...string[]],
): Promise<boolean> {
  const localApi = readLocalApi();
  if (!localApi) return true;
  pendingConfirmations += 1;
  try {
    return await localApi.dialogs.confirm(
      labels.length === 1
        ? [t.tools.terminal.confirmClose(labels[0]), t.tools.terminal.stopProcessHint].join("\n")
        : [
            t.tools.terminal.confirmCloseMany(labels.length),
            t.tools.terminal.stopProcessesHint(labels.map((label) => `"${label}"`).join(", ")),
          ].join("\n"),
      { variant: "destructive" },
    );
  } catch {
    return false;
  } finally {
    pendingConfirmations -= 1;
  }
}
