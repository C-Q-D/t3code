/** Counts successful T3 effects and delegates display grammar to caller-owned messages. */
import { englishWorkLogMessages, type WorkLogMessages } from "./work-log/messages.ts";
import type { T3McpToolSummaryAction } from "@t3tools/shared/t3McpToolPresentation";

export interface T3ToolSummaryCall {
  readonly input: unknown;
  readonly output: unknown;
  readonly outcome: "completed" | "failed" | "unfinished";
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function id(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

interface ToolResult {
  readonly data?: Record<string, unknown>;
  readonly failed: boolean;
}

/** Reads the structured/JSON MCP result envelopes retained by the provider adapters. */
function readResult(value: unknown, depth = 0): ToolResult {
  if (depth > 4) return { failed: false };
  if (typeof value === "string") {
    try {
      return readResult(JSON.parse(value), depth + 1);
    } catch {
      return { failed: false };
    }
  }
  if (Array.isArray(value)) {
    let data: ToolResult["data"];
    let failed = false;
    for (const block of value) {
      const record = asRecord(block);
      const text = record?.text ?? asRecord(record?.content)?.text;
      const result = readResult(asRecord(text)?.text ?? text, depth + 1);
      data ??= result.data;
      failed ||= result.failed;
    }
    return { ...(data ? { data } : {}), failed };
  }
  const record = asRecord(value);
  if (!record) return { failed: false };
  const failed =
    record.isError === true ||
    record.is_error === true ||
    (typeof record._tag === "string" && /(?:Error|Failure)$/.test(record._tag)) ||
    record.error != null;
  const content = record.structuredContent ?? record.content;
  if (content !== undefined) {
    const result = readResult(content, depth + 1);
    return { ...(result.data ? { data: result.data } : {}), failed: failed || result.failed };
  }
  return { data: record, failed };
}

function readInput(value: unknown): Record<string, unknown> | undefined {
  const input = readResult(value).data;
  // Cursor retains its MCP args envelope; other adapters retain the arguments directly.
  return input && typeof input.toolName === "string" ? asRecord(input.args) : input;
}

/** MCP errors can be returned as data even when the provider completed the tool call. */
export function t3ToolResultIndicatesFailure(output: unknown): boolean {
  return readResult(output).failed;
}

function countEntities(ids: ReadonlyArray<string | undefined>): number {
  return (
    new Set(ids.filter((value) => value !== undefined)).size +
    ids.filter((value) => value === undefined).length
  );
}

/** Tool summaries with durable target identities count retries once per entity. */
const SUMMARY_ENTITY_KEYS: Partial<Record<T3McpToolSummaryAction, string>> = {
  delegate: "taskId",
  "workflow-stop": "subagentId",
  "task-cancel": "taskId",
  "schedule-create": "scheduledTaskId",
  "schedule-update": "scheduledTaskId",
  "schedule-delete": "scheduledTaskId",
  "queue-read": "queuedRunId",
  "queue-edit": "queuedRunId",
  "queue-cancel": "queuedRunId",
  "queue-reorder": "queuedRunId",
  "queue-steer": "queuedRunId",
  "question-read": "requestId",
  "question-respond": "requestId",
  "worktree-handoff": "worktreePath",
  "project-clone": "cwd",
  "attachment-prepare": "attachmentId",
  "attachment-discard": "attachmentId",
};

/**
 * Counts successful effects separately from failed or unfinished calls, deduplicating known identities.
 * @param action Semantic action shared by the grouped T3 tools.
 * @param calls Retained inputs, outputs, and lifecycle outcomes; provider error envelopes still count as failures.
 * @param messages Complete locale phrases; omitted messages preserve English for existing clients.
 * @returns Display label and the number of failed calls, without changing source data.
 */
export function summarizeT3ToolCalls(
  action: T3McpToolSummaryAction,
  calls: ReadonlyArray<T3ToolSummaryCall>,
  messages: WorkLogMessages["t3Tools"] = englishWorkLogMessages.t3Tools,
): { label: string; failedCount: number } {
  const results = calls.map((call) => {
    const result = readResult(call.output);
    return {
      input: readInput(call.input),
      output: result.data,
      outcome: result.failed ? ("failed" as const) : call.outcome,
    };
  });
  const completed = results.filter((call) => call.outcome === "completed");
  const failedCount = results.filter((call) => call.outcome === "failed").length;
  const selected = completed.length > 0 ? completed : results;
  const succeeded = completed.length > 0;
  const entityIds = (key: string) =>
    selected.map((call) => id(call.output?.[key]) ?? id(call.input?.[key]));
  const projectIds = selected.map(
    (call) => id(call.output?.id) ?? id(call.output?.projectId) ?? id(call.input?.projectId),
  );
  const threadIds = selected.map(
    (call) =>
      id(call.output?.threadId) ??
      id(asRecord(call.output?.thread)?.threadId) ??
      id(call.input?.threadId),
  );
  const entityKey = SUMMARY_ENTITY_KEYS[action];
  let count = selected.length;
  if (entityKey !== undefined) {
    count = countEntities(entityIds(entityKey));
  } else if (action === "thread-update" || action === "thread-interrupt") {
    count = countEntities(threadIds);
  } else if (
    action === "project-read" ||
    action === "project-create" ||
    action === "project-update" ||
    action === "project-delete"
  ) {
    count = countEntities(projectIds);
  }
  let label: string;
  switch (action) {
    case "thread-send": {
      const messageCount = countEntities(selected.map((call) => id(call.output?.messageId)));
      const threads = threadIds.every((value) => value !== undefined)
        ? new Set(threadIds).size
        : undefined;
      label = messages.sentMessages(messageCount, threads, succeeded);
      break;
    }
    case "thread-create": {
      const createdIds: string[] = [];
      const resultsKnown =
        completed.length > 0 &&
        completed.every((call) => {
          const threads = Array.isArray(call.output?.threads) ? call.output.threads : [call.output];
          return threads.every((thread) => {
            const record = asRecord(thread);
            if (record?.status === "rolled_back") return true;
            const threadId = id(record?.threadId);
            if (!threadId) return false;
            createdIds.push(threadId);
            return true;
          });
        });
      label = messages.createdThreads(
        resultsKnown ? new Set(createdIds).size : undefined,
        selected.length,
      );
      break;
    }
    case "thread-read":
    case "thread-wait": {
      const targets = threadIds.every((value) => value !== undefined)
        ? new Set(threadIds).size
        : undefined;
      label = (action === "thread-read" ? messages.readThreads : messages.waitedThreads)(
        targets,
        selected.length,
        succeeded,
      );
      break;
    }
    case "attachment-send": {
      // A message can contain several attachments. Count retries by message identity.
      const sentMessages = new Map<string, (typeof selected)[number]>();
      selected.forEach((call, index) =>
        sentMessages.set(id(call.output?.messageId) ?? `call-${index}`, call),
      );
      const attachmentCount = [...sentMessages.values()].reduce(
        (count, call) =>
          count + (Array.isArray(call.input?.attachments) ? call.input.attachments.length : 0),
        0,
      );
      const countsKnown = [...sentMessages.values()].every(
        (call) => Array.isArray(call.input?.attachments) && call.input.attachments.length > 0,
      );
      const targets = threadIds.every((value) => value !== undefined)
        ? new Set(threadIds).size
        : undefined;
      label = messages.sentAttachments(
        countsKnown ? attachmentCount : undefined,
        targets,
        selected.length,
        succeeded,
      );
      break;
    }
    default:
      label = messages.summary[action](count, succeeded);
  }
  return { label, failedCount };
}
