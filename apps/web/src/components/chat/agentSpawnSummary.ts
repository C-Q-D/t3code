/** Summarizes observed subagent activity for display without mutating runtime state. */
import { t } from "~/i18n";
import {
  isActiveSubagentStatus,
  isTerminalSubagentStatus,
  type RuntimeSubagent,
} from "@t3tools/client-runtime/state/subagentRuntime";

/** Summarize observed states without treating idle or missing agents as completed. */
export function deriveAgentSpawnSummary({
  agents,
  agentCount,
  coordinatorStatus,
}: {
  agents: ReadonlyArray<Pick<RuntimeSubagent, "kind" | "status">>;
  agentCount: number;
  coordinatorStatus?: RuntimeSubagent["status"] | undefined;
}) {
  const working = agents.filter((agent) => isActiveSubagentStatus(agent.status)).length;
  const failed = agents.filter((agent) => agent.status === "failed").length;
  const idle = agents.filter((agent) => agent.status === "idle").length;
  const stopped = agents.filter(
    (agent) => agent.status === "cancelled" || agent.status === "interrupted",
  ).length;
  const batches = agents.filter((agent) => agent.kind === "subagent_batch").length;
  const individuals = agentCount - batches;
  // Workflow coordinators can keep running between dynamic member launches.
  const live =
    coordinatorStatus !== undefined ? !isTerminalSubagentStatus(coordinatorStatus) : working > 0;
  const subjects = [
    individuals > 0 ? t.chat.subagents.individualCount(individuals) : null,
    batches > 0 ? t.chat.subagents.batchCount(batches, individuals > 0) : null,
  ]
    .filter(Boolean)
    .join(t.chat.subagents.and);
  const lead = t.chat.subagents.lead(batches > 0, live, subjects || t.chat.subagents.subagents);

  const status = live
    ? working > 0
      ? t.chat.subagents.workingCount(working)
      : t.chat.subagents.working
    : coordinatorStatus === "failed"
      ? t.chat.subagents.workflowFailed
      : coordinatorStatus === "cancelled" || coordinatorStatus === "interrupted"
        ? t.chat.subagents.workflowStopped
        : failed > 0
          ? t.chat.subagents.failedCount(failed)
          : stopped > 0
            ? t.chat.subagents.stoppedCount(stopped)
            : idle > 0
              ? t.chat.subagents.idleCount(idle)
              : coordinatorStatus !== "completed" &&
                  (agents.length === 0 || agents.length < agentCount)
                ? t.chat.subagents.statusUnavailable
                : t.chat.subagents.completed;
  const tone = live
    ? "working"
    : failed > 0 || coordinatorStatus === "failed"
      ? "failed"
      : status === t.chat.subagents.completed
        ? "completed"
        : "inactive";
  return { live, lead, status, tone };
}
