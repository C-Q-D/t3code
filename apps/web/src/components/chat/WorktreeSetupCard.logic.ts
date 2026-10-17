/** Derives worktree card presentation without changing server phases or host action grants. */
import type { WorktreeSetupSnapshot } from "@t3tools/contracts";

/**
 * Selects the heading and disclosure state for a server snapshot.
 * @param snapshot Current phase and stage outcomes, including script output.
 * @param embedded Whether the live turn owns the surrounding timeline header.
 * @param canOpenTerminal Whether the host supplied a terminal action; this does not grant access.
 * @returns A heading dictionary key, collapsed state, and visibility of existing terminal/log UI.
 */
export function worktreeSetupPresentation(
  snapshot: Pick<WorktreeSetupSnapshot, "phase" | "stages">,
  embedded: boolean,
  canOpenTerminal: boolean,
) {
  const running = snapshot.phase === "running";
  const setupStage = snapshot.stages.find((stage) => stage.id === "setup-script");
  const headingKey = (() => {
    switch (snapshot.phase) {
      case "running":
        return "settingUpWorktree" as const;
      case "done":
        return snapshot.stages.some((stage) => stage.status === "failed")
          ? ("worktreeReadySetupScriptFailed" as const)
          : ("worktreeReady" as const);
      case "failed":
        return "worktreeSetupFailed" as const;
      case "cancelled":
        return "worktreeSetupCancelled" as const;
    }
  })();
  return {
    headingKey,
    collapsed: embedded && !running,
    showTerminal: canOpenTerminal && setupStage !== undefined && setupStage.status !== "pending",
    // Mount at full height on the first live line; retain failed output even when it is empty.
    showTail:
      setupStage !== undefined &&
      (setupStage.status === "failed" ||
        (setupStage.status === "running" && setupStage.tail.length > 0)),
  };
}
