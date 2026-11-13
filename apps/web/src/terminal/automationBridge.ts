import type * as A from "@t3tools/contracts";
import type { TerminalAutomationOutput } from "@t3tools/client-runtime/state/terminal";
import type { GhosttyTerminalSurface } from "./ghostty/surface";
import { GhosttyAutomationError } from "./ghostty/automation";
import { TerminalBridgeError } from "./automationController";

type Surface = Pick<
  GhosttyTerminalSurface,
  | "automationFrame"
  | "readAutomation"
  | "encodeAutomationInput"
  | "applyAutomationLocalAction"
  | "cancelAutomationSelection"
>;

export function readAutomationOutput(
  output: TerminalAutomationOutput,
  query: Extract<A.TerminalAutomationReadQuery, { source: "output" }>,
  frame: A.TerminalAutomationFrame,
): A.TerminalAutomationReadResult {
  const chunks = output.chunks;
  const cursor = query.cursor;
  const exact =
    cursor === null ? -1 : chunks.findIndex((chunk) => chunk.sequence === cursor.sequence);
  if (cursor && (cursor.sequence > output.sequence || cursor.codeUnitOffset < 0))
    throw new TerminalBridgeError("stale_request");
  if (cursor && exact >= 0) {
    const text = chunks[exact]!.data;
    const offset = cursor.codeUnitOffset;
    if (
      offset > text.length ||
      (offset > 0 &&
        offset < text.length &&
        /[\uD800-\uDBFF]/.test(text[offset - 1]!) &&
        /[\uDC00-\uDFFF]/.test(text[offset]!))
    )
      throw new TerminalBridgeError("stale_request");
  }
  const first =
    cursor === null
      ? 0
      : exact >= 0
        ? exact
        : chunks.findIndex((chunk) => chunk.sequence > cursor.sequence);
  let text = "";
  let lines = 0;
  let next = cursor ?? { sequence: chunks[0]?.sequence ?? output.sequence, codeUnitOffset: 0 };
  let truncated = false;
  if (first >= 0) {
    outer: for (let index = first; index < chunks.length; index += 1) {
      const chunk = chunks[index]!;
      let offset = index === exact ? cursor!.codeUnitOffset : 0;
      for (const codepoint of chunk.data.slice(offset)) {
        if (
          text.length + codepoint.length > query.budget.maxCodeUnits ||
          lines >= query.budget.maxLines
        ) {
          truncated = true;
          break outer;
        }
        text += codepoint;
        offset += codepoint.length;
        if (codepoint === "\n") lines += 1;
        next = { sequence: chunk.sequence, codeUnitOffset: offset };
      }
      next = { sequence: chunk.sequence, codeUnitOffset: chunk.data.length };
    }
  }
  if (truncated && text.length === 0) throw new TerminalBridgeError("budget_exceeded");
  const gap =
    output.gap ||
    (cursor !== null && exact < 0 && cursor.sequence < (chunks[0]?.sequence ?? output.sequence));
  return {
    source: "output",
    frame,
    text,
    returnedRange: null,
    nextCursor: { source: "output", cursor: next },
    continuity: gap ? "gap" : cursor === null ? "unknown" : "complete",
    truncated,
    change: text.length > 0 ? "data" : "no_change",
    softWrapAfterLines: [],
    process: { status: "running" },
  };
}

export function createTerminalAutomationBridge(options: {
  surface: Surface;
  output: () => TerminalAutomationOutput | undefined;
  target: () => A.TerminalAutomationTarget | null;
  show: (signal: AbortSignal) => Promise<void>;
  ready: () => boolean;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  let allowedBindings: Set<string> | null = null;
  const inputs = new Map<
    string,
    {
      bindingId: string;
      frameRevision: number;
      epoch: number;
      expiresAt: number;
      plan?: A.TerminalAutomationLocalAction;
      applied: boolean;
      failed: boolean;
    }
  >();
  return {
    invalidate: () => {
      options.surface.cancelAutomationSelection();
      for (const input of inputs.values()) {
        input.failed = true;
        delete input.plan;
      }
    },
    retainBindings: (bindings: readonly A.TerminalAutomationBinding[]) => {
      allowedBindings = new Set(bindings.map((binding) => binding.bindingId));
      for (const [key, input] of inputs)
        if (!allowedBindings.has(input.bindingId)) {
          options.surface.cancelAutomationSelection();
          inputs.delete(key);
        }
    },
    async perform(
      request: A.TerminalAutomationClientRequest,
      guard: () => void,
      signal: AbortSignal,
    ): Promise<A.TerminalAutomationClientReply["result"]> {
      const check = () => {
        guard();
        if (allowedBindings !== null && !allowedBindings.has(request.binding.bindingId))
          throw new TerminalBridgeError("target_invalid");
        const target = options.target();
        if (
          !target ||
          target.terminalInstanceId !== request.binding.target.terminalInstanceId ||
          target.terminalId !== request.binding.target.terminalId ||
          target.viewId !== request.binding.target.viewId
        )
          throw new TerminalBridgeError("target_invalid");
        if (request.operation !== "read" && !options.ready())
          throw new TerminalBridgeError("not_ready");
      };
      try {
        guard();
        if (request.operation === "show") {
          await options.show(signal);
          check();
          return { operation: "show", status: "visible" };
        }
        check();
        const output = options.output();
        if (!output || output.terminalInstanceId !== request.binding.target.terminalInstanceId)
          throw new TerminalBridgeError("not_ready");
        const frame = options.surface.automationFrame(output.sequence);
        if (request.operation === "read") {
          return {
            operation: "read",
            read:
              request.query.source === "output"
                ? readAutomationOutput(output, request.query, frame)
                : options.surface.readAutomation(request.query, output.sequence),
          };
        }
        const key = JSON.stringify([request.binding.bindingId, request.inputRequestId]);
        if (request.operation === "prepare_input") {
          if (inputs.has(key)) throw new TerminalBridgeError("request_conflict");
          let active = 0;
          let owned = 0;
          for (const input of inputs.values()) {
            if (now() >= input.expiresAt) {
              input.failed = true;
              delete input.plan;
            }
            if (!input.failed && !input.applied) active += 1;
            if (input.bindingId === request.binding.bindingId) owned += 1;
          }
          // The service bounds each binding to 256 input IDs; retain those IDs for its full lifetime.
          if (active >= 128 || owned >= 256) throw new TerminalBridgeError("budget_exceeded");
          inputs.set(key, {
            bindingId: request.binding.bindingId,
            frameRevision: frame.frameRevision,
            epoch: request.binding.inputEpoch,
            expiresAt: now() + 10_000,
            applied: false,
            failed: false,
          });
          return { operation: "prepare_input", inputRequestId: request.inputRequestId, frame };
        }
        const prepared = inputs.get(key);
        if (
          !prepared ||
          prepared.failed ||
          now() >= prepared.expiresAt ||
          prepared.epoch !== request.binding.inputEpoch ||
          prepared.frameRevision !== request.frameRevision
        )
          throw new TerminalBridgeError("stale_request");
        if (request.operation === "encode_input") {
          const result = options.surface.encodeAutomationInput(
            request.action,
            request.frameRevision,
          );
          check();
          if (result.status === "not_sent") throw new TerminalBridgeError("unsupported_client");
          if (result.status === "local_action") {
            prepared.plan =
              result.action === "scroll"
                ? { type: "scroll", deltaRows: result.deltaRows }
                : result.localAction;
            return {
              operation: "encode_input",
              inputRequestId: request.inputRequestId,
              frameRevision: request.frameRevision,
              status: "local_action",
              localAction: prepared.plan,
            };
          }
          prepared.failed = true;
          return {
            operation: "encode_input",
            inputRequestId: request.inputRequestId,
            frameRevision: request.frameRevision,
            encodedText: result.encodedText,
          };
        }
        if (
          !prepared.plan ||
          (prepared.plan.type === "scroll"
            ? request.localAction.type !== "scroll" ||
              prepared.plan.deltaRows !== request.localAction.deltaRows
            : request.localAction.type !== "selection" ||
              prepared.plan.phase !== request.localAction.phase ||
              prepared.plan.position.column !== request.localAction.position.column ||
              prepared.plan.position.row !== request.localAction.position.row)
        )
          throw new TerminalBridgeError("stale_request");
        if (!prepared.applied) {
          check();
          prepared.failed = true;
          options.surface.applyAutomationLocalAction(
            prepared.plan,
            request.frameRevision,
            JSON.stringify([request.binding.bindingId, request.binding.inputEpoch]),
          );
          prepared.applied = true;
          prepared.failed = false;
        }
        return {
          operation: "apply_local",
          inputRequestId: request.inputRequestId,
          status: "local_applied",
        };
      } catch (error) {
        if (error instanceof GhosttyAutomationError) throw new TerminalBridgeError(error.code);
        throw error;
      }
    },
  };
}
