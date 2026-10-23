/** Selects the provider turn that supplies composer cache metadata on both clients and servers. */
import * as DateTime from "effect/DateTime";

/**
 * Finds the most recent completed turn within the active provider thread.
 * @param turns Projection turns in their existing order; unfinished turns are ignored.
 * @param activeProviderThreadId Current provider thread ID, or null when none is active.
 * @returns The original turn, or undefined when no completed turn matches. Equal completion
 * timestamps retain the first matching turn, preserving the server's stable tie behavior.
 */
export function latestCompletedComposerProviderTurn<
  T extends { readonly providerThreadId: string; readonly completedAt: DateTime.Utc | null },
>(turns: ReadonlyArray<T>, activeProviderThreadId: string | null): T | undefined {
  let latest: T | undefined;
  let latestMillis = -Infinity;
  for (const turn of turns) {
    if (turn.providerThreadId !== activeProviderThreadId || turn.completedAt === null) continue;
    const completedMillis = DateTime.toEpochMillis(turn.completedAt);
    if (latest === undefined || completedMillis > latestMillis) {
      latest = turn;
      latestMillis = completedMillis;
    }
  }
  return latest;
}
