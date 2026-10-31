/** Local-day membership and ordered Today shelves; callers own clocks and storage. */
import {
  threadRuntimeIsActive,
  type EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/models";
import {
  sortInboxThreadsByReturn,
  sortWorkingThreadsBySend,
} from "@t3tools/client-runtime/state/thread-inbox";

/** Today selections are separate from project lifecycle tabs and cannot be drop targets. */
export type TodayTab = "working" | "waiting";
export const TODAY_TAB_STORAGE_KEY = "t3code:sidebar-today-tab";

/** Decode a raw Today preference; invalid and missing values open the user's waiting inbox. */
export function readTodayTab(storedValue: string | null | undefined): TodayTab {
  return storedValue === "working" ? "working" : "waiting";
}

/** Return local midnight in epoch milliseconds for the supplied clock value. */
export function startOfLocalDay(now: number): number {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  return midnight.getTime();
}

/** Project shells at `now` (epoch milliseconds) into newest-first working and waiting rows.
 * isWorking uses the caller's shared observation, including exit grace and manual moves.
 * Optional observedReturnAt supplies client return times in milliseconds. No input is mutated;
 * explicit settlement excludes a row regardless of activity, and idle work cannot carry it across days. */
export function buildTodayView<T extends EnvironmentThreadShell>(
  threads: readonly T[],
  now: number,
  observedReturnAt: ((thread: T) => number | undefined) | undefined,
  isWorking: (thread: T) => boolean,
) {
  const midnight = startOfLocalDay(now);
  const working: T[] = [];
  const waiting: T[] = [];
  for (const thread of threads) {
    if (thread.settledOverride === "settled") continue;
    const sentAt =
      thread.latestUserAuthoredMessageAt === undefined
        ? thread.latestUserMessageAt
        : thread.latestUserAuthoredMessageAt;
    // Idle PR watches can live for days; only active runtime or user action survives midnight.
    if (
      !(sentAt !== null && Date.parse(sentAt) >= midnight) &&
      !threadRuntimeIsActive(thread.runtime) &&
      !thread.hasPendingApprovals &&
      !thread.hasPendingUserInput
    )
      continue;
    (isWorking(thread) ? working : waiting).push(thread);
  }
  return {
    working: sortWorkingThreadsBySend(working),
    waiting: sortInboxThreadsByReturn(waiting, observedReturnAt),
  };
}
