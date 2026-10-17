/** Mirrors server lifecycle restrictions for starting a thread pull-request watch. */
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";

/**
 * Decide whether a persisted thread can start watching; stopping has no lifecycle restriction.
 * @param thread - Current thread lifecycle and lineage, or null while unavailable.
 * @returns True for an active, unarchived root/delegated-task thread. Native and MCP subagents
 * both use the subagent relationship and leave watching to their parent.
 */
export function canStartThreadPullRequestWatch(
  thread: Pick<
    EnvironmentThreadShell,
    "settledOverride" | "settledAt" | "archivedAt" | "lineage"
  > | null,
): boolean {
  return (
    thread !== null &&
    thread.settledOverride !== "settled" &&
    thread.settledAt === null &&
    thread.archivedAt === null &&
    thread.lineage.relationshipToParent !== "subagent"
  );
}
