/** Wire contracts only; authorization, connection ownership and PTY writes belong to the server. */
import * as Schema from "effect/Schema";
import { EnvironmentId, ThreadId } from "./baseSchemas.ts";

export const TERMINAL_AUTOMATION_VERSION = 1;
export const TERMINAL_AUTOMATION_LIMITS = {
  candidates: 64,
  inputCodeUnits: 65_536,
  encodedCodeUnits: 262_144,
  readCodeUnits: 65_536,
  readLines: 1_000,
  retainedLines: 10_000,
} as const;

/** Reject extra fields before Struct can strip them, including inside discriminated unions. */
const strict = <F extends Schema.Struct.Fields>(fields: F) =>
  Schema.Unknown.check(
    Schema.makeFilter((value) => {
      if (value === null || typeof value !== "object") return true;
      const extra = Object.keys(value).find((key) => !Object.hasOwn(fields, key));
      return extra === undefined || `Unexpected field: ${extra}`;
    }),
  ).pipe(Schema.decodeTo(Schema.Struct(fields)));
const Id = Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(128));
const Counter = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(0),
  Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
);
const Cols = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 1000 }));
const Rows = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 500 }));
const Text = Schema.String.check(Schema.isMaxLength(TERMINAL_AUTOMATION_LIMITS.readCodeUnits));
const version = Schema.Literal(TERMINAL_AUTOMATION_VERSION);

/** Constructed from authenticated invocation context, never decoded from model arguments. */
export interface TerminalAutomationScope {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}

export const TerminalAutomationTarget = strict({
  terminalId: Id,
  terminalInstanceId: Id,
  viewId: Id,
});
export type TerminalAutomationTarget = typeof TerminalAutomationTarget.Type;

export const TerminalAutomationCandidate = strict({
  candidateId: Id,
  target: TerminalAutomationTarget,
  title: Schema.String.check(Schema.isMaxLength(256)),
  clientKind: Schema.Literals(["web", "windows_desktop"]),
  visible: Schema.Boolean,
  readiness: Schema.Literals(["ready", "not_ready"]),
  capabilities: strict({ read: Schema.Boolean, input: Schema.Boolean, show: Schema.Boolean }),
});
export type TerminalAutomationCandidate = typeof TerminalAutomationCandidate.Type;

// An authenticated connection owns this view list; metadata-only terminals must not be registered.
export const TerminalAutomationRegistration = strict({
  version,
  views: Schema.Array(TerminalAutomationCandidate).check(Schema.isMaxLength(64)),
});
export type TerminalAutomationRegistration = typeof TerminalAutomationRegistration.Type;

export const TerminalAutomationBinding = strict({
  bindingId: Id,
  target: TerminalAutomationTarget,
  alias: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(64)),
  inputEpoch: Counter,
});
export type TerminalAutomationBinding = typeof TerminalAutomationBinding.Type;

export const TerminalAutomationErrorCode = Schema.Literals([
  "client_unavailable",
  "target_invalid",
  "human_intervened",
  "selection_required",
  "unsupported_client",
  "not_ready",
  "stale_request",
  "budget_exceeded",
  "request_conflict",
]);
export type TerminalAutomationErrorCode = typeof TerminalAutomationErrorCode.Type;
export const TerminalAutomationError = strict({ code: TerminalAutomationErrorCode });
export type TerminalAutomationError = typeof TerminalAutomationError.Type;

const ConnectionBindingState = Schema.Union([
  strict({ status: Schema.Literal("bound"), binding: TerminalAutomationBinding }),
  strict({
    status: Schema.Literal("paused"),
    binding: TerminalAutomationBinding,
    reason: Schema.Literal("human_intervened"),
  }),
  strict({
    status: Schema.Literal("invalid"),
    binding: TerminalAutomationBinding,
    reason: Schema.Literals(["target_invalid", "client_unavailable"]),
  }),
]);
export const TerminalAutomationState = Schema.Union([
  strict({ status: Schema.Literal("unbound") }),
  strict({
    status: Schema.Literal("selection_required"),
    selectionRequestId: Id,
    candidateVersion: Counter,
  }),
  ConnectionBindingState,
]);
export type TerminalAutomationState = typeof TerminalAutomationState.Type;

export const TerminalAutomationBindInput = Schema.Union([
  strict({ mode: Schema.Literal("auto") }),
  strict({ mode: Schema.Literal("request_selection") }),
  strict({ mode: Schema.Literal("resume"), bindingId: Id }),
]);
export type TerminalAutomationBindInput = typeof TerminalAutomationBindInput.Type;

// Only the authenticated selecting client can answer; candidateId is never model approval.
export const TerminalAutomationSelectionReply = strict({
  version,
  selectionRequestId: Id,
  candidateVersion: Counter,
  choice: Schema.Union([
    strict({ status: Schema.Literal("selected"), candidateId: Id }),
    strict({ status: Schema.Literal("cancelled") }),
  ]),
});
export type TerminalAutomationSelectionReply = typeof TerminalAutomationSelectionReply.Type;

export const TerminalAutomationSelectionRequest = strict({
  version,
  selectionRequestId: Id,
  candidateVersion: Counter,
  candidates: Schema.Array(TerminalAutomationCandidate).check(Schema.isMaxLength(64)),
});
export type TerminalAutomationSelectionRequest = typeof TerminalAutomationSelectionRequest.Type;

export const TerminalAutomationConnectionState = strict({
  version,
  revision: Schema.optional(Counter),
  bindings: Schema.Array(ConnectionBindingState).check(Schema.isMaxLength(128)),
  selections: Schema.optional(
    Schema.Array(TerminalAutomationSelectionRequest).check(Schema.isMaxLength(128)),
  ),
});
export type TerminalAutomationConnectionState = typeof TerminalAutomationConnectionState.Type;

export const TerminalAutomationStateChanged = strict({
  type: Schema.Literal("state_changed"),
  revision: Counter,
});
export type TerminalAutomationStateChanged = typeof TerminalAutomationStateChanged.Type;

const Modifiers = strict({
  shift: Schema.Boolean,
  alt: Schema.Boolean,
  ctrl: Schema.Boolean,
  meta: Schema.Boolean,
});
const Position = strict({ column: Counter, row: Counter });
const InputText = Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(65_536));
const Key = Schema.Union([
  Schema.Literals([
    "Enter",
    "Tab",
    "Backspace",
    "Escape",
    "Delete",
    "Insert",
    "Home",
    "End",
    "PageUp",
    "PageDown",
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "F1",
    "F2",
    "F3",
    "F4",
    "F5",
    "F6",
    "F7",
    "F8",
    "F9",
    "F10",
    "F11",
    "F12",
  ]),
  Schema.String.check(Schema.isPattern(/^[\x20-\x7e]$/)),
]);

// Mouse positions are zero-based viewport grid cells; clients convert DOM/Ghostty conventions.
export const TerminalAutomationAction = Schema.Union([
  strict({ type: Schema.Literal("text"), text: InputText }),
  strict({ type: Schema.Literal("paste"), text: InputText }),
  strict({
    type: Schema.Literal("key"),
    key: Key,
    phase: Schema.Literals(["press", "release"]),
    modifiers: Modifiers,
  }),
  strict({
    type: Schema.Literal("mouse"),
    event: Schema.Literals(["move", "press", "release"]),
    position: Position,
    button: Schema.Literals(["none", "left", "middle", "right"]),
    modifiers: Modifiers,
    frameRevision: Counter,
  }),
  strict({
    type: Schema.Literal("mouse"),
    event: Schema.Literal("wheel"),
    position: Position,
    deltaColumns: Schema.Int.check(Schema.isBetween({ minimum: -100, maximum: 100 })),
    deltaRows: Schema.Int.check(Schema.isBetween({ minimum: -100, maximum: 100 })),
    modifiers: Modifiers,
    frameRevision: Counter,
  }),
]).check(
  Schema.makeFilter(
    (action) =>
      action.type !== "mouse" ||
      (action.position.column < 1000 &&
        action.position.row < 500 &&
        (action.event === "wheel"
          ? action.deltaColumns !== 0 || action.deltaRows !== 0
          : action.event === "move" || action.button !== "none")),
  ),
);
export type TerminalAutomationAction = typeof TerminalAutomationAction.Type;

// Plans only: encoding must not mutate the viewport or selection before server authorization.
export const TerminalAutomationLocalAction = Schema.Union([
  strict({
    type: Schema.Literal("scroll"),
    deltaRows: Schema.Int.check(
      Schema.isBetween({ minimum: -100, maximum: 100 }),
      Schema.makeFilter((rows) => rows !== 0),
    ),
  }),
  strict({
    type: Schema.Literal("selection"),
    phase: Schema.Literals(["press", "move", "release"]),
    position: Position,
  }),
]);
export type TerminalAutomationLocalAction = typeof TerminalAutomationLocalAction.Type;

export const TerminalAutomationInput = strict({
  bindingId: Id,
  requestId: Id,
  action: TerminalAutomationAction,
});
export type TerminalAutomationInput = typeof TerminalAutomationInput.Type;

// requestId is deduplicated within a binding; no receipt asserts command completion.
export const TerminalAutomationInputResult = Schema.Union([
  strict({ status: Schema.Literal("not_sent"), requestId: Id, error: TerminalAutomationError }),
  strict({
    status: Schema.Literal("written"),
    requestId: Id,
    writtenBytes: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 1_048_576 })),
  }),
  strict({ status: Schema.Literal("unknown"), requestId: Id }),
  strict({ status: Schema.Literal("local_applied"), requestId: Id }),
]);
export type TerminalAutomationInputResult = typeof TerminalAutomationInputResult.Type;

export const TerminalAutomationStatusInput = strict({
  receipt: Schema.optional(strict({ bindingId: Id, requestId: Id })),
});
export type TerminalAutomationStatusInput = typeof TerminalAutomationStatusInput.Type;
export const TerminalAutomationStatus = strict({
  version,
  candidateVersion: Counter,
  candidates: Schema.Array(TerminalAutomationCandidate).check(Schema.isMaxLength(64)),
  state: TerminalAutomationState,
  inputResult: Schema.optional(TerminalAutomationInputResult),
});
export type TerminalAutomationStatus = typeof TerminalAutomationStatus.Type;

const Budget = strict({
  maxCodeUnits: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65_536 })),
  maxLines: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 1_000 })),
});
const Range = strict({ startLine: Counter, endLineExclusive: Counter }).check(
  Schema.makeFilter(
    (range) =>
      range.endLineExclusive >= range.startLine &&
      range.endLineExclusive - range.startLine <= 10_000,
  ),
);
// The cursor identifies the next unread UTF-16 code unit, including a partial PTY output chunk.
const OutputCursor = strict({ sequence: Counter, codeUnitOffset: Counter });
export const TerminalAutomationReadQuery = Schema.Union([
  strict({
    source: Schema.Literal("screen"),
    view: Schema.Literals(["current_viewport", "active_bottom"]),
    budget: Budget,
  }),
  strict({
    source: Schema.Literal("history"),
    activeScreen: Schema.Literals(["primary", "alternate"]),
    range: Range,
    // Omission starts at zero; runtime validates line length and codepoint boundaries.
    codeUnitOffset: Schema.optional(Counter),
    frameRevision: Schema.optional(Counter),
    budget: Budget,
  }),
  strict({
    source: Schema.Literal("output"),
    cursor: Schema.NullOr(OutputCursor),
    budget: Budget,
  }),
]);
export type TerminalAutomationReadQuery = typeof TerminalAutomationReadQuery.Type;
export const TerminalAutomationReadInput = strict({
  bindingId: Id,
  query: TerminalAutomationReadQuery,
});
export type TerminalAutomationReadInput = typeof TerminalAutomationReadInput.Type;

// frameRevision changes on grid/view/screen changes; sequence tracks PTY output only.
export const TerminalAutomationFrame = strict({
  activeScreen: Schema.Literals(["primary", "alternate"]),
  cols: Cols,
  rows: Rows,
  viewportStartLine: Counter,
  retainedRange: Range,
  sequence: Counter,
  frameRevision: Counter,
  cursor: Schema.Union([
    strict({ status: Schema.Literal("visible"), position: Position }),
    strict({ status: Schema.Literal("outside_viewport") }),
    strict({ status: Schema.Literal("unknown") }),
  ]),
  pendingWrap: Schema.NullOr(Schema.Boolean),
}).check(
  Schema.makeFilter(
    (frame) =>
      frame.cursor.status !== "visible" ||
      (frame.cursor.position.column < frame.cols && frame.cursor.position.row < frame.rows),
  ),
);
export type TerminalAutomationFrame = typeof TerminalAutomationFrame.Type;

export const TerminalAutomationReadResult = strict({
  source: Schema.Literals(["screen", "history", "output"]),
  frame: TerminalAutomationFrame,
  text: Text,
  returnedRange: Schema.NullOr(Range),
  nextCursor: Schema.NullOr(
    Schema.Union([
      strict({
        source: Schema.Literal("history"),
        activeScreen: Schema.Literals(["primary", "alternate"]),
        nextLine: Counter,
        codeUnitOffset: Counter,
        frameRevision: Counter,
      }),
      strict({ source: Schema.Literal("output"), cursor: OutputCursor }),
    ]),
  ),
  continuity: Schema.Literals(["complete", "gap", "unknown"]),
  truncated: Schema.Boolean,
  change: Schema.Literals(["data", "no_change", "unknown"]),
  softWrapAfterLines: Schema.Array(Counter).check(Schema.isMaxLength(1000)),
  process: Schema.Union([
    strict({ status: Schema.Literal("running") }),
    strict({ status: Schema.Literal("exited"), processExitCode: Schema.NullOr(Schema.Int) }),
    strict({ status: Schema.Literal("unknown") }),
  ]),
}).check(
  Schema.makeFilter((result) => {
    if (result.change === "no_change" && result.text.length !== 0) return false;
    if (result.nextCursor !== null && result.nextCursor.source !== result.source) return false;
    const cursor = result.nextCursor;
    if (
      cursor?.source === "history" &&
      (cursor.activeScreen !== result.frame.activeScreen ||
        cursor.frameRevision !== result.frame.frameRevision ||
        result.softWrapAfterLines.some((line) => line >= cursor.nextLine))
    )
      return false;
    if (result.returnedRange === null) return result.softWrapAfterLines.length === 0;
    const range = result.returnedRange;
    return (
      range.endLineExclusive - range.startLine <= 1000 &&
      result.softWrapAfterLines.every(
        (line) => line >= range.startLine && line < range.endLineExclusive,
      )
    );
  }),
);
export type TerminalAutomationReadResult = typeof TerminalAutomationReadResult.Type;

export const TerminalAutomationReleaseInput = strict({ bindingId: Id });
export type TerminalAutomationReleaseInput = typeof TerminalAutomationReleaseInput.Type;
export const TerminalAutomationReleaseResult = strict({ status: Schema.Literal("released") });
export type TerminalAutomationReleaseResult = typeof TerminalAutomationReleaseResult.Type;

const BridgeFields = { version, bridgeRequestId: Id, binding: TerminalAutomationBinding };
export const TerminalAutomationClientRequest = Schema.Union([
  strict({ ...BridgeFields, operation: Schema.Literal("show") }),
  strict({ ...BridgeFields, operation: Schema.Literal("prepare_input"), inputRequestId: Id }),
  strict({
    ...BridgeFields,
    operation: Schema.Literal("read"),
    query: TerminalAutomationReadQuery,
  }),
  strict({
    ...BridgeFields,
    operation: Schema.Literal("encode_input"),
    inputRequestId: Id,
    frameRevision: Counter,
    action: TerminalAutomationAction,
  }),
  // Both peers revalidate the binding/epoch/frame; unknown delivery must never replay a local action.
  strict({
    ...BridgeFields,
    operation: Schema.Literal("apply_local"),
    inputRequestId: Id,
    frameRevision: Counter,
    localAction: TerminalAutomationLocalAction,
  }),
]);
export type TerminalAutomationClientRequest = typeof TerminalAutomationClientRequest.Type;

// Server correlates each reply with its owning connection and pending request, never a payload clientId.
export const TerminalAutomationClientReply = strict({
  ...BridgeFields,
  result: Schema.Union([
    strict({ operation: Schema.Literal("show"), status: Schema.Literal("visible") }),
    strict({
      operation: Schema.Literal("prepare_input"),
      inputRequestId: Id,
      frame: TerminalAutomationFrame,
    }),
    strict({ operation: Schema.Literal("read"), read: TerminalAutomationReadResult }),
    strict({
      operation: Schema.Literal("encode_input"),
      inputRequestId: Id,
      frameRevision: Counter,
      encodedText: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(262_144)),
    }),
    strict({
      operation: Schema.Literal("encode_input"),
      inputRequestId: Id,
      frameRevision: Counter,
      status: Schema.Literal("local_action"),
      localAction: TerminalAutomationLocalAction,
    }),
    strict({
      operation: Schema.Literal("apply_local"),
      inputRequestId: Id,
      status: Schema.Literal("local_applied"),
    }),
    strict({
      operation: Schema.Literal("apply_local"),
      inputRequestId: Id,
      error: TerminalAutomationError,
    }),
    strict({
      operation: Schema.Literals(["show", "prepare_input", "read", "encode_input"]),
      error: TerminalAutomationError,
    }),
  ]),
});
export type TerminalAutomationClientReply = typeof TerminalAutomationClientReply.Type;

export const TerminalAutomationClientEvent = strict({
  version,
  target: TerminalAutomationTarget,
  event: Schema.Literals(["human_intervened", "view_closed", "instance_exited"]),
});
export type TerminalAutomationClientEvent = typeof TerminalAutomationClientEvent.Type;
