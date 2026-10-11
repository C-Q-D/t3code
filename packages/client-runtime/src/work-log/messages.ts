/** Dependency-light display defaults shared by clients; imports only label leaves and types, never client state. */
import { englishRemotePairingMessages } from "@t3tools/shared/remoteLabels";
import { englishRelayMessages } from "../relay/messages.ts";
import { englishConnectionMessages } from "../connection/messages.ts";
import type { OrchestrationV2ExecutionNode } from "@t3tools/contracts";
import { englishTerminalLabels } from "@t3tools/shared/terminalLabels";
import { englishUsageMessages, englishUsageLimitsMessages } from "@t3tools/shared/usageLabels";
import { englishToolActivityLabels } from "@t3tools/shared/toolActivityLabels";
import { englishT3ToolLabels } from "@t3tools/shared/t3McpToolPresentation";
import type { ToolGroupAction } from "./presentation.ts";

/** Formats an English counted noun; count is already computed from tool results. */
function quantity(count: number, noun: string, plural = `${noun}s`): string {
  return `${count} ${count === 1 ? noun : plural}`;
}

/** Selects successful versus attempted phrasing without interpreting provider results. */
function phrase(succeeded: boolean, past: string, infinitive: string, object: string): string {
  return `${succeeded ? past : `Tried to ${infinitive}`} ${object}`;
}

/** English output is shared by clients that do not provide translated messages. */
export const englishWorkLogMessages = {
  connection: englishConnectionMessages,
  remotePairing: englishRemotePairingMessages,
  relay: englishRelayMessages,
  subagentExecution: {
    starting: "Starting",
    labels: {
      idle: "Idle",
      pending: "Working",
      running: "Working",
      waiting: "Waiting",
      completed: "Completed",
      interrupted: "Interrupted",
      failed: "Failed",
      cancelled: "Cancelled",
      rolled_back: "Cancelled",
    } satisfies Record<OrchestrationV2ExecutionNode["status"], string>,
    live: (label: string, elapsed: string) => `${label} ${elapsed}`,
    completed: (label: string, elapsed: string) => `${label} in ${elapsed}`,
  },
  terminal: englishTerminalLabels,
  usage: englishUsageMessages,
  usageLimits: englishUsageLimitsMessages,
  t3Tools: {
    labels: englishT3ToolLabels,
    failed: (action: string) => `Failed to ${action.toLowerCase()}`,
    declined: (action: string) => `Declined to ${action.toLowerCase()}`,
    stopped: (running: string) => `Stopped ${running.toLowerCase()}`,
    pullRequest: (number: number) => `PR #${number}`,
    joinLabel: (verb: string, target: string) => `${verb} ${target}`,
    summary: {
      delegate: (count: number, succeeded: boolean) =>
        phrase(succeeded, "Delegated", "delegate", quantity(count, "task")),
      "thread-list": (count: number, succeeded: boolean) =>
        phrase(succeeded, "Listed", "list", `threads ${quantity(count, "time")}`),
      "thread-interrupt": (count: number, succeeded: boolean) =>
        phrase(succeeded, "Requested interrupts for", "interrupt", quantity(count, "thread")),
      "workflow-stop": (count: number, succeeded: boolean) =>
        phrase(succeeded, "Requested stops for", "stop", quantity(count, "workflow")),
      "task-status": (count: number, succeeded: boolean) =>
        phrase(succeeded, "Checked", "check", `task status ${quantity(count, "time")}`),
      "task-cancel": (count: number, succeeded: boolean) =>
        phrase(succeeded, "Requested cancellation of", "cancel", quantity(count, "task")),
      "schedule-create": (count: number, succeeded: boolean) =>
        phrase(succeeded, "Scheduled", "schedule", quantity(count, "task")),
      "schedule-list": (count: number, succeeded: boolean) =>
        phrase(succeeded, "Listed", "list", `scheduled tasks ${quantity(count, "time")}`),
      "schedule-update": (count: number, succeeded: boolean) =>
        phrase(succeeded, "Updated", "update", quantity(count, "scheduled task")),
      "schedule-delete": (count: number, succeeded: boolean) =>
        phrase(succeeded, "Requested deletion of", "delete", quantity(count, "scheduled task")),
      "schedule-run": (count: number, succeeded: boolean) =>
        phrase(succeeded, "Requested", "request", quantity(count, "scheduled task run")),
      "thread-configuration": (count: number, succeeded: boolean) =>
        phrase(succeeded, "Checked", "check", `thread configuration ${quantity(count, "time")}`),
      "thread-configure": (count: number, succeeded: boolean) =>
        phrase(succeeded, "Set", "set", `thread model ${quantity(count, "time")}`),
      "thread-fork": (count: number, succeeded: boolean) =>
        phrase(succeeded, "Requested", "request", quantity(count, "thread fork")),
      "thread-merge": (count: number, succeeded: boolean) =>
        phrase(succeeded, "Requested", "request", quantity(count, "context merge")),
      "thread-search": (count: number, succeeded: boolean) =>
        phrase(succeeded, "Searched", "search", `threads ${quantity(count, "time")}`),
      "thread-transfers": (count: number, succeeded: boolean) =>
        phrase(succeeded, "Checked", "check", `thread transfers ${quantity(count, "time")}`),
      "thread-organize": (count: number, succeeded: boolean) =>
        phrase(succeeded, "Organized", "organize", `threads ${quantity(count, "time")}`),
      "thread-update": (count: number, succeeded: boolean) =>
        phrase(succeeded, "Updated", "update", quantity(count, "thread")),
      "queue-list": (count: number, succeeded: boolean) =>
        phrase(succeeded, "Listed", "list", `queued messages ${quantity(count, "time")}`),
      "queue-read": (count: number, succeeded: boolean) =>
        phrase(succeeded, "Read", "read", quantity(count, "queued message")),
      "queue-edit": (count: number, succeeded: boolean) =>
        phrase(succeeded, "Edited", "edit", quantity(count, "queued message")),
      "queue-cancel": (count: number, succeeded: boolean) =>
        phrase(succeeded, "Requested cancellation of", "cancel", quantity(count, "queued run")),
      "queue-reorder": (count: number, succeeded: boolean) =>
        phrase(succeeded, "Reordered", "reorder", quantity(count, "queued run")),
      "queue-steer": (count: number, succeeded: boolean) =>
        phrase(
          succeeded,
          "Requested steering with",
          "steer with",
          quantity(count, "queued message"),
        ),
      "question-list": (count: number, succeeded: boolean) =>
        phrase(succeeded, "Listed", "list", `pending questions ${quantity(count, "time")}`),
      "question-read": (count: number, succeeded: boolean) =>
        phrase(succeeded, "Read", "read", quantity(count, "pending question request")),
      "question-respond": (count: number, succeeded: boolean) =>
        phrase(succeeded, "Answered", "answer", quantity(count, "pending question request")),
      "secret-request": (count: number, succeeded: boolean) =>
        phrase(succeeded, "Asked for", "ask for", quantity(count, "secret")),
      "worktree-handoff": (count: number, succeeded: boolean) =>
        phrase(succeeded, "Handed off to", "hand off to", quantity(count, "worktree")),
      "worktree-list": (count: number, succeeded: boolean) =>
        phrase(succeeded, "Listed", "list", `workspace branches ${quantity(count, "time")}`),
      "worktree-status": (count: number, succeeded: boolean) =>
        phrase(succeeded, "Checked", "check", `worktree status ${quantity(count, "time")}`),
      "project-list": (count: number, succeeded: boolean) =>
        phrase(succeeded, "Listed", "list", `projects ${quantity(count, "time")}`),
      "project-read": (count: number, succeeded: boolean) =>
        phrase(succeeded, "Read", "read", quantity(count, "project")),
      "project-create": (count: number, succeeded: boolean) =>
        phrase(succeeded, "Registered", "register", quantity(count, "project")),
      "project-update": (count: number, succeeded: boolean) =>
        phrase(succeeded, "Updated", "update", quantity(count, "project")),
      "project-delete": (count: number, succeeded: boolean) =>
        phrase(succeeded, "Deleted", "delete", quantity(count, "project")),
      "project-clone": (count: number, succeeded: boolean) =>
        phrase(succeeded, "Cloned", "clone", quantity(count, "repository", "repositories")),
      "environment-read": (count: number, succeeded: boolean) =>
        phrase(succeeded, "Checked", "check", `environment preferences ${quantity(count, "time")}`),
      "environment-update": (count: number, succeeded: boolean) =>
        phrase(
          succeeded,
          "Updated",
          "update",
          `environment preferences ${quantity(count, "time")}`,
        ),
      "attachment-prepare": (count: number, succeeded: boolean) =>
        phrase(succeeded, "Prepared", "prepare", quantity(count, "attachment upload")),
      "attachment-discard": (count: number, succeeded: boolean) =>
        phrase(succeeded, "Discarded", "discard", quantity(count, "pending attachment")),
      "link-pr": (count: number, succeeded: boolean) =>
        phrase(succeeded, "Linked", "link", quantity(count, "pull request")),
      "unlink-pr": (count: number, succeeded: boolean) =>
        phrase(succeeded, "Unlinked", "unlink", quantity(count, "pull request")),
      "watch-pr": (count: number, succeeded: boolean) =>
        phrase(succeeded, "Watching", "watch", quantity(count, "pull request")),
      "unwatch-pr": (count: number, succeeded: boolean) =>
        phrase(succeeded, "Stopped watching", "stop watching", quantity(count, "pull request")),
      "list-prs": (count: number, succeeded: boolean) =>
        phrase(
          succeeded,
          "Checked",
          "check",
          `linked pull requests${count === 1 ? "" : ` ${quantity(count, "time")}`}`,
        ),
      browser: (count: number, succeeded: boolean) =>
        phrase(succeeded, "Used", "use", `browser ${quantity(count, "time")}`),
      device: (count: number, succeeded: boolean) =>
        phrase(succeeded, "Used", "use", `device controls ${quantity(count, "time")}`),
      "html-preview": (count: number, succeeded: boolean) =>
        phrase(succeeded, "Previewed", "preview", quantity(count, "HTML page")),
      "html-render": (count: number, succeeded: boolean) =>
        phrase(succeeded, "Rendered", "render", quantity(count, "HTML page")),
      capabilities: (count: number, succeeded: boolean) =>
        phrase(
          succeeded,
          "Checked",
          "check",
          `orchestration capabilities ${quantity(count, "time")}`,
        ),
    },
    sentMessages: (count: number, threads: number | undefined, succeeded: boolean) =>
      phrase(
        succeeded,
        "Sent",
        "send",
        threads === undefined
          ? quantity(count, "message")
          : count === threads && count > 1
            ? `messages to ${quantity(threads, "thread")}`
            : `${quantity(count, "message")} to ${quantity(threads, "thread")}`,
      ),
    createdThreads: (count: number | undefined, times: number) =>
      count === undefined
        ? `Requested thread creation ${quantity(times, "time")}`
        : `Created ${quantity(count, "thread")}`,
    readThreads: (count: number | undefined, times: number, succeeded: boolean) =>
      phrase(
        succeeded,
        "Read",
        "read",
        count === undefined ? `threads ${quantity(times, "time")}` : quantity(count, "thread"),
      ),
    waitedThreads: (count: number | undefined, times: number, succeeded: boolean) =>
      phrase(
        succeeded,
        "Waited on",
        "wait on",
        count === undefined ? `threads ${quantity(times, "time")}` : quantity(count, "thread"),
      ),
    sentAttachments: (
      count: number | undefined,
      threads: number | undefined,
      times: number,
      succeeded: boolean,
    ) => {
      const target = threads === undefined ? "" : ` to ${quantity(threads, "thread")}`;
      return phrase(
        succeeded,
        "Sent",
        "send",
        count === undefined
          ? `attachments${target} ${quantity(times, "time")}`
          : `${quantity(count, "attachment")}${target}`,
      );
    },
  },
  toolActivity: englishToolActivityLabels,
  compactingContext: "Compacting context",
  contextCompacted: "Context compacted",
  contextCompactedTokens: (before: string, after: string) =>
    `Context compacted ${before} → ${after} tokens`,
  thought: "Thought",
  thoughtTimes: (count: number) => `Thought (×${count})`,
  groupAction: {
    "link-pr": (count: number) =>
      `Linked ${count} ${count === 1 ? "pull request" : "pull requests"}`,
    "unlink-pr": (count: number) =>
      `Unlinked ${count} ${count === 1 ? "pull request" : "pull requests"}`,
    "watch-pr": (count: number) =>
      `Watching ${count} ${count === 1 ? "pull request" : "pull requests"}`,
    "unwatch-pr": (count: number) =>
      `Stopped watching ${count} ${count === 1 ? "pull request" : "pull requests"}`,
    "list-prs": (count: number) =>
      count === 1 ? "Checked linked pull requests" : `Checked linked pull requests ${count} times`,
    read: (count: number) => `Read ${count} ${count === 1 ? "file" : "files"}`,
    edit: (count: number) => `Changed ${count} ${count === 1 ? "file" : "files"}`,
    command: (count: number) => `Ran ${count} ${count === 1 ? "command" : "commands"}`,
    "thread-create": (count: number) => `Created ${count} ${count === 1 ? "thread" : "threads"}`,
    device: (count: number) => `Used device controls ${count} ${count === 1 ? "time" : "times"}`,
    browser: (count: number) => `Used browser ${count} ${count === 1 ? "time" : "times"}`,
    search: (count: number) => `Searched the web ${count} ${count === 1 ? "time" : "times"}`,
    "code-search": (count: number) => `Searched code ${count} ${count === 1 ? "time" : "times"}`,
    other: (count: number) => `Used ${count} ${count === 1 ? "tool" : "tools"}`,
    update: (count: number) => `Received ${count} ${count === 1 ? "update" : "updates"}`,
  } satisfies Record<ToolGroupAction, (count: number) => string>,
  usedSources: (names: readonly string[], allIntegrations: boolean) => {
    const formatted =
      names.length < 2
        ? names[0]!
        : names.length === 2
          ? names.join(" and ")
          : `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
    return `Used ${formatted}${allIntegrations ? ` ${names.length === 1 ? "integration" : "integrations"}` : ""}`;
  },
  performedOtherActions: (count: number) =>
    `Performed ${count} other ${count === 1 ? "action" : "actions"}`,
  joinSummary: (labels: readonly string[]) => {
    const sentences = labels.map((label, index) =>
      index === 0 ? label : label.charAt(0).toLowerCase() + label.slice(1),
    );
    return sentences.length < 3
      ? sentences.join(" and ")
      : `${sentences.slice(0, -1).join(", ")}, and ${sentences.at(-1)}`;
  },
  subagentStatuses: {
    working: "working",
    done: "done",
    failed: "failed",
    stopped: "stopped",
    idle: "idle",
  },
};

/** Complete text contract accepted by generated work-log presentation functions. */
export type WorkLogMessages = typeof englishWorkLogMessages;
