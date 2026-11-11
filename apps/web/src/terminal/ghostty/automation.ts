/** Active-screen reads and input preparation; the caller owns PTY sequencing and transport. */
import type {
  TerminalAutomationFrame,
  TerminalAutomationReadQuery,
  TerminalAutomationReadResult,
  TerminalAutomationErrorCode,
} from "@t3tools/contracts";
import { GhosttyTerminalCore, type GhosttyAutomationMetadata } from "./core";

export class GhosttyAutomationError extends Error {
  constructor(readonly code: TerminalAutomationErrorCode) {
    super(code);
    this.name = "GhosttyAutomationError";
  }
}

/** Projects current core metadata into a frame; sequence must come from the owning PTY stream. */
export function ghosttyAutomationFrame(
  metadata: GhosttyAutomationMetadata,
  sequence: number,
  startLine = metadata.viewportStartLine,
): TerminalAutomationFrame {
  const row = metadata.cursorLine - startLine;
  return {
    activeScreen: metadata.activeScreen,
    cols: metadata.cols,
    rows: metadata.rows,
    viewportStartLine: startLine,
    retainedRange: { ...metadata.retainedRange },
    frameRevision: metadata.frameRevision,
    sequence,
    pendingWrap: metadata.pendingWrap,
    cursor:
      row >= 0 && row < metadata.rows && metadata.cursorColumn < metadata.cols
        ? { status: "visible", position: { row, column: metadata.cursorColumn } }
        : { status: "outside_viewport" },
  };
}

/** Reads whole physical rows within A1 budgets; oversized first rows fail rather than lose text or repeat a cursor. */
export function readGhosttyAutomation(
  core: GhosttyTerminalCore,
  query: TerminalAutomationReadQuery,
  sequence: number,
): TerminalAutomationReadResult {
  if (query.source === "output") throw new GhosttyAutomationError("unsupported_client");
  const metadata = core.automationMetadata();
  if (
    query.source === "history" &&
    (query.activeScreen !== metadata.activeScreen ||
      (query.frameRevision !== undefined && query.frameRevision !== metadata.frameRevision))
  ) {
    throw new GhosttyAutomationError("stale_request");
  }
  const budget = query.budget;
  if (
    !Number.isInteger(budget.maxLines) ||
    budget.maxLines < 1 ||
    budget.maxLines > 1000 ||
    !Number.isInteger(budget.maxCodeUnits) ||
    budget.maxCodeUnits < 1 ||
    budget.maxCodeUnits > 65536
  )
    throw new GhosttyAutomationError("budget_exceeded");
  const start =
    query.source === "history"
      ? query.range.startLine
      : query.view === "active_bottom"
        ? Math.max(0, metadata.retainedRange.endLineExclusive - metadata.rows)
        : metadata.viewportStartLine;
  const end =
    query.source === "history"
      ? query.range.endLineExclusive
      : Math.min(metadata.retainedRange.endLineExclusive, start + metadata.rows);
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < metadata.retainedRange.startLine ||
    end > metadata.retainedRange.endLineExclusive ||
    end < start
  )
    throw new GhosttyAutomationError("stale_request");
  let nextLine = start;
  let text = "";
  const softWrapAfterLines: number[] = [];
  while (nextLine < end && nextLine - start < budget.maxLines) {
    const line = core.readAutomationRows(nextLine, nextLine + 1).lines[0]!;
    const separator = nextLine === start ? "" : "\n";
    if (text.length + separator.length + line.text.length > budget.maxCodeUnits) {
      if (nextLine === start) throw new GhosttyAutomationError("budget_exceeded");
      break;
    }
    text += separator + line.text;
    if (line.softWrapAfter) softWrapAfterLines.push(nextLine);
    nextLine += 1;
  }
  const truncated = nextLine < end;
  return {
    source: query.source,
    frame: ghosttyAutomationFrame(
      metadata,
      sequence,
      query.source === "screen" ? start : metadata.viewportStartLine,
    ),
    text,
    returnedRange: { startLine: start, endLineExclusive: nextLine },
    nextCursor:
      truncated && query.source === "history"
        ? {
            source: "history",
            activeScreen: metadata.activeScreen,
            nextLine,
            frameRevision: metadata.frameRevision,
          }
        : null,
    continuity: "complete",
    truncated,
    change: "data",
    softWrapAfterLines,
    process: { status: "unknown" },
  };
}
