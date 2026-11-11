/** Active-screen reads and input preparation; the caller owns PTY sequencing and transport. */
import type {
  TerminalAutomationFrame,
  TerminalAutomationReadQuery,
  TerminalAutomationReadResult,
  TerminalAutomationErrorCode,
  TerminalAutomationAction,
} from "@t3tools/contracts";
import { GhosttyTerminalCore, type GhosttyAutomationMetadata } from "./core";
import { US_SHIFTED_TO_UNSHIFTED_KEYS } from "@t3tools/shared/keybindings";

/** A1 failures the bridge can return without claiming a PTY write. */
export class GhosttyAutomationError extends Error {
  constructor(readonly code: TerminalAutomationErrorCode) {
    super(code);
    this.name = "GhosttyAutomationError";
  }
}

/** Current CSS-pixel canvas geometry; cell coordinates are converted to cell centers. */
export interface GhosttyAutomationGeometry {
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly screenWidth: number;
  readonly screenHeight: number;
  readonly paddingLeft: number;
  readonly paddingRight: number;
  readonly paddingTop: number;
  readonly paddingBottom: number;
}

/** Local scroll needs surface execution and cannot be represented by A1's encodedText reply. */
export type GhosttyAutomationEncoding =
  | { readonly status: "encoded"; readonly encodedText: string }
  | { readonly status: "not_sent" }
  | { readonly status: "local_action"; readonly action: "scroll"; readonly deltaRows: number };

/** Encodes without DOM dispatch or PTY writes; only positional input requires a current frame, while keys use current modes. */
export function encodeGhosttyAutomation(
  core: GhosttyTerminalCore,
  action: TerminalAutomationAction,
  frameRevision: number,
  geometry?: GhosttyAutomationGeometry,
): GhosttyAutomationEncoding {
  const metadata = core.automationMetadata();
  let encodedText = "";
  if (action.type === "text" || action.type === "paste") {
    encodedText = core.encodePaste(action.text);
  } else if (action.type === "key") {
    const punctuation: Readonly<Record<string, string>> = {
      " ": "Space",
      "`": "Backquote",
      "~": "Backquote",
      "-": "Minus",
      _: "Minus",
      "=": "Equal",
      "+": "Equal",
      "[": "BracketLeft",
      "{": "BracketLeft",
      "]": "BracketRight",
      "}": "BracketRight",
      "\\": "Backslash",
      "|": "Backslash",
      ";": "Semicolon",
      ":": "Semicolon",
      "'": "Quote",
      '"': "Quote",
      ",": "Comma",
      "<": "Comma",
      ".": "Period",
      ">": "Period",
      "/": "Slash",
      "?": "Slash",
    };
    const unshifted = US_SHIFTED_TO_UNSHIFTED_KEYS.get(action.key) ?? action.key;
    const code = /^[a-z]$/i.test(action.key)
      ? `Key${action.key.toUpperCase()}`
      : /^[0-9]$/.test(unshifted)
        ? `Digit${unshifted}`
        : (punctuation[action.key] ?? action.key);
    encodedText = core.encodeKey(
      {
        key: action.key,
        code,
        repeat: false,
        shiftKey: action.modifiers.shift,
        ctrlKey: action.modifiers.ctrl,
        altKey: action.modifiers.alt,
        metaKey: action.modifiers.meta,
        getModifierState: () => false,
        isComposing: false,
      },
      action.phase,
    );
  } else {
    const { column, row } = action.position;
    if (
      frameRevision !== metadata.frameRevision ||
      action.frameRevision !== frameRevision ||
      !Number.isInteger(column) ||
      !Number.isInteger(row) ||
      column < 0 ||
      row < 0 ||
      column >= metadata.cols ||
      row >= metadata.rows
    )
      throw new GhosttyAutomationError("stale_request");
    if (
      !geometry ||
      !Object.values(geometry).every(Number.isFinite) ||
      geometry.cellWidth <= 0 ||
      geometry.cellHeight <= 0 ||
      Math.min(
        geometry.paddingLeft,
        geometry.paddingRight,
        geometry.paddingTop,
        geometry.paddingBottom,
      ) < 0 ||
      geometry.screenWidth <
        geometry.paddingLeft + geometry.paddingRight + metadata.cols * geometry.cellWidth ||
      geometry.screenHeight <
        geometry.paddingTop + geometry.paddingBottom + metadata.rows * geometry.cellHeight
    )
      throw new GhosttyAutomationError("stale_request");
    const reporting = core.isMouseTracking() && !action.modifiers.shift;
    if (!reporting) {
      if (action.event !== "wheel" || action.deltaColumns !== 0)
        throw new GhosttyAutomationError("unsupported_client");
      if (!core.isAlternateScreen())
        return { status: "local_action", action: "scroll", deltaRows: action.deltaRows };
      const prefix = core.isApplicationCursorKeys() ? "\x1bO" : "\x1b[";
      encodedText = (prefix + (action.deltaRows < 0 ? "A" : "B")).repeat(
        Math.abs(action.deltaRows),
      );
    } else {
      const mods =
        (action.modifiers.shift ? 1 : 0) |
        (action.modifiers.ctrl ? 2 : 0) |
        (action.modifiers.alt ? 4 : 0) |
        (action.modifiers.meta ? 8 : 0);
      // Cell protocols use the encoder's integer grid; pixel protocols keep actual CSS positions.
      const grid = core.isPixelMouseReporting()
        ? geometry
        : {
            cellWidth: Math.max(1, Math.round(geometry.cellWidth)),
            cellHeight: Math.max(1, Math.round(geometry.cellHeight)),
            paddingLeft: Math.round(geometry.paddingLeft),
            paddingRight: Math.round(geometry.paddingRight),
            paddingTop: Math.round(geometry.paddingTop),
            paddingBottom: Math.round(geometry.paddingBottom),
            screenWidth:
              Math.round(geometry.paddingLeft) +
              metadata.cols * Math.max(1, Math.round(geometry.cellWidth)) +
              Math.round(geometry.paddingRight),
            screenHeight:
              Math.round(geometry.paddingTop) +
              metadata.rows * Math.max(1, Math.round(geometry.cellHeight)) +
              Math.round(geometry.paddingBottom),
          };
      const encode = (button: number | null, event: "press" | "release" | "motion") => {
        try {
          return core.encodeMouse(
            {
              ...grid,
              x: grid.paddingLeft + (column + 0.5) * grid.cellWidth,
              y: grid.paddingTop + (row + 0.5) * grid.cellHeight,
              action: event,
              button,
              mods,
              anyButtonPressed:
                action.event !== "wheel" && action.button !== "none" && action.event !== "release",
            },
            true,
          );
        } catch (error) {
          if (error instanceof TypeError) throw new GhosttyAutomationError("unsupported_client");
          throw error;
        }
      };
      if (action.event === "wheel") {
        for (let index = 0; index < Math.abs(action.deltaRows); index += 1)
          encodedText += encode(action.deltaRows < 0 ? 4 : 5, "press");
        for (let index = 0; index < Math.abs(action.deltaColumns); index += 1)
          encodedText += encode(action.deltaColumns < 0 ? 6 : 7, "press");
      } else {
        const buttons = { none: null, left: 1, middle: 3, right: 2 };
        encodedText = encode(
          buttons[action.button],
          action.event === "move" ? "motion" : action.event,
        );
      }
    }
  }
  return encodedText.length > 0 ? { status: "encoded", encodedText } : { status: "not_sent" };
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
