/** Counts retained work-log facts for the timeline summary; never infers files from prose or output. */
import type { WorkLogEntry } from "../../session-logic";
import { toolGroupAction } from "@t3tools/client-runtime/work-log/presentation";

const PATH_KEYS = ["path", "filePath", "file_path", "relativePath", "filename", "fileName"];
const INPUT_KEYS = ["input", "rawInput", "locations", "item", "data"];

/**
 * Collect full input path metadata, without the eight-path limit used by compact row labels.
 * @param data A tool input object, array, or absent value. Output and file-body fields are ignored.
 * @returns Recorded paths; an empty list means the input does not identify any files.
 */
function summaryInputPaths(data: unknown): string[] {
  const paths: string[] = [];
  const pending: unknown[] = [data];
  const visited = new Set<object>();
  while (pending.length > 0) {
    const value = pending.pop();
    if (!value || typeof value !== "object" || visited.has(value)) continue;
    visited.add(value);
    if (Array.isArray(value)) {
      for (const nested of value) pending.push(nested);
      continue;
    }
    const record = value as Record<string, unknown>;
    for (const key of PATH_KEYS) {
      const path = record[key];
      if (typeof path === "string" && path.trim()) paths.push(path);
    }
    for (const key of INPUT_KEYS) pending.push(record[key]);
  }
  return paths;
}

/** Normalize only spelling differences that do not require a workspace root or filesystem lookup. */
function normalizedPath(path: string) {
  return path
    .trim()
    .replaceAll("\\", "/")
    .replace(/^(?:\.\/)+/, "");
}

/**
 * Count unique file paths and command calls in one response.
 * @param entries Retained work entries, possibly empty or containing repeated lifecycle updates.
 * @returns Counts by category; null means a relevant entry lacks enough metadata for an exact count.
 */
export function workLogSummaryCounts(entries: ReadonlyArray<WorkLogEntry>) {
  const calls = new Map<string, WorkLogEntry>();
  for (const entry of entries) {
    // Lifecycle notifications share a tool call; the latest retained update owns its status.
    const projected = entry.projectedItem;
    const key = projected
      ? `${projected.sourceThreadId}:${projected.sourceItemId}`
      : `${entry.runId ?? ""}:${entry.toolCallId ?? entry.id}`;
    calls.set(key, entry);
  }
  const reads = new Set<string>();
  const edits = new Set<string>();
  let readsKnown = true;
  let editsKnown = true;
  let commandsKnown = true;
  let commands = 0;
  for (const entry of calls.values()) {
    if (
      entry.itemType === "approval_request" ||
      entry.itemType === "user_input_request" ||
      entry.tone === "thinking"
    )
      continue;
    const action = toolGroupAction(entry);
    const item = entry.structuredPayload ?? entry.projectedItem?.item;
    const status = entry.toolLifecycleStatus ?? item?.status;
    if (action === "command") {
      if (status === undefined) commandsKnown = false;
      else if (status === "completed") commands += 1;
      continue;
    }
    if (action !== "read" && action !== "edit") continue;
    if (status !== undefined && status !== "completed") continue;
    const paths =
      action === "edit" && item?.type === "file_change"
        ? item.changes?.length
          ? item.changes.map((change) => change.path)
          : [item.fileName]
        : entry.changedFiles?.length
          ? entry.changedFiles
          : entry.viewedImagePath
            ? [entry.viewedImagePath]
            : summaryInputPaths(
                item?.type === "dynamic_tool" ? { input: item.input } : entry.toolData,
              );
    const normalized = paths.map(normalizedPath).filter(Boolean);
    // A call count cannot stand in for a file count. Hide the whole category if any path is unknown.
    if (normalized.length === 0 || status === undefined) {
      if (action === "read") readsKnown = false;
      else editsKnown = false;
      continue;
    }
    for (const path of normalized) (action === "read" ? reads : edits).add(path);
  }
  return {
    readFiles: readsKnown ? reads.size : null,
    commands: commandsKnown ? commands : null,
    changedFiles: editsKnown ? edits.size : null,
  };
}
