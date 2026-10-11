/** Derives conversation synchronization state and its visible progress label. */
import { t } from "~/i18n";
import type { EnvironmentThreadStatus } from "@t3tools/client-runtime/state/threads";

export type ThreadSyncPhase = "loading" | "syncing";

export function resolveThreadSyncPhase(input: {
  readonly detailExists: boolean;
  readonly shellExists: boolean;
  readonly status: EnvironmentThreadStatus;
}): ThreadSyncPhase | null {
  if (!input.shellExists) {
    return null;
  }

  switch (input.status) {
    case "empty":
    case "cached":
    case "synchronizing":
      return input.detailExists ? "syncing" : "loading";
    case "deleted":
    case "live":
      return null;
  }
}

/** Returns the message-loading or synchronization label for phase. */
export function threadSyncLabel(phase: ThreadSyncPhase): string {
  return phase === "loading" ? t.app.thread.loadingMessages : t.app.thread.syncingMessages;
}
