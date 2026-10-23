/** Separates live generation from the latest run's retained terminal status. */
import type { OrchestrationV2ShellThreadStatus } from "@t3tools/contracts";

const generatingStatus = {
  idle: false,
  preparing: true,
  queued: true,
  starting: true,
  running: true,
  waiting: true,
  completed: false,
  interrupted: false,
  failed: false,
  cancelled: false,
  rolled_back: false,
} satisfies Record<OrchestrationV2ShellThreadStatus, boolean>;

/** An active run remains authoritative even while the shell status catches up. */
export function isComposerThreadGenerating(thread: {
  readonly activeRunId: string | null;
  readonly status: OrchestrationV2ShellThreadStatus;
}): boolean {
  return thread.activeRunId !== null || generatingStatus[thread.status];
}
