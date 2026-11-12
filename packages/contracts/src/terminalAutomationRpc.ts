/** Client transport contracts; authenticated connection and environment identities never cross this wire. */
import * as Schema from "effect/Schema";
import * as Rpc from "effect/rpc/Rpc";
import * as RpcGroup from "effect/rpc/RpcGroup";
import { ThreadId } from "./baseSchemas.ts";
import { EnvironmentAuthorizationError } from "./auth.ts";
import {
  TerminalAutomationRegistration,
  TerminalAutomationClientReply,
  TerminalAutomationClientEvent,
  TerminalAutomationSelectionReply,
  TerminalAutomationSelectionRequest,
  TerminalAutomationClientRequest,
  TerminalAutomationStatus,
  TerminalAutomationConnectionState,
  TerminalAutomationError,
} from "./terminalAutomation.ts";

export const TERMINAL_AUTOMATION_WS_METHODS = {
  terminalAutomationGetConnectionState: "terminalAutomation.getConnectionState",
  terminalAutomationSubscribe: "terminalAutomation.subscribe",
  terminalAutomationRegisterViews: "terminalAutomation.registerViews",
  terminalAutomationReplyBridge: "terminalAutomation.replyBridge",
  terminalAutomationReplySelection: "terminalAutomation.replySelection",
  terminalAutomationReportEvent: "terminalAutomation.reportEvent",
  terminalAutomationResume: "terminalAutomation.resume",
} as const;

const strict = <F extends Schema.Struct.Fields>(fields: F) =>
  Schema.Unknown.check(
    Schema.makeFilter(
      (value) =>
        value === null ||
        typeof value !== "object" ||
        Object.keys(value).every((key) => Object.hasOwn(fields, key)) ||
        "Unexpected RPC field",
    ),
  ).pipe(Schema.decodeTo(Schema.Struct(fields)));

export const TerminalAutomationSubscribeInput = strict({ threadId: ThreadId });
export const TerminalAutomationRegisterViewsInput = strict({
  threadId: ThreadId,
  registration: TerminalAutomationRegistration,
});
export const TerminalAutomationReplyBridgeInput = strict({
  threadId: ThreadId,
  reply: TerminalAutomationClientReply,
});
export const TerminalAutomationReplySelectionInput = strict({
  threadId: ThreadId,
  reply: TerminalAutomationSelectionReply,
});
export const TerminalAutomationReportEventInput = strict({
  threadId: ThreadId,
  event: TerminalAutomationClientEvent,
});
export const TerminalAutomationResumeInput = strict({
  threadId: ThreadId,
  bindingId: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(128)),
  inputEpoch: Schema.Number.check(
    Schema.isInt(),
    Schema.isGreaterThanOrEqualTo(0),
    Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
  ),
});
export const TerminalAutomationRpcEvent = Schema.Union([
  strict({ type: Schema.Literal("ready") }),
  TerminalAutomationClientRequest,
  TerminalAutomationSelectionRequest,
]);
const error = Schema.Union([TerminalAutomationError, EnvironmentAuthorizationError]);

export const TerminalAutomationRpcGroup = RpcGroup.make(
  Rpc.make(TERMINAL_AUTOMATION_WS_METHODS.terminalAutomationGetConnectionState, {
    payload: TerminalAutomationSubscribeInput,
    success: TerminalAutomationConnectionState,
    error,
  }),
  Rpc.make(TERMINAL_AUTOMATION_WS_METHODS.terminalAutomationSubscribe, {
    payload: TerminalAutomationSubscribeInput,
    success: TerminalAutomationRpcEvent,
    error,
    stream: true,
  }),
  Rpc.make(TERMINAL_AUTOMATION_WS_METHODS.terminalAutomationRegisterViews, {
    payload: TerminalAutomationRegisterViewsInput,
    success: Schema.Void,
    error,
  }),
  Rpc.make(TERMINAL_AUTOMATION_WS_METHODS.terminalAutomationReplyBridge, {
    payload: TerminalAutomationReplyBridgeInput,
    success: Schema.Void,
    error,
  }),
  Rpc.make(TERMINAL_AUTOMATION_WS_METHODS.terminalAutomationReplySelection, {
    payload: TerminalAutomationReplySelectionInput,
    success: Schema.Void,
    error,
  }),
  Rpc.make(TERMINAL_AUTOMATION_WS_METHODS.terminalAutomationReportEvent, {
    payload: TerminalAutomationReportEventInput,
    success: Schema.Void,
    error,
  }),
  Rpc.make(TERMINAL_AUTOMATION_WS_METHODS.terminalAutomationResume, {
    payload: TerminalAutomationResumeInput,
    success: TerminalAutomationStatus,
    error,
  }),
);
