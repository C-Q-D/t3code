import * as A from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/ai";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as ThreadManagement from "../../../orchestration-v2/ThreadManagementService.ts";
import * as EventSink from "../../../orchestration-v2/EventSink.ts";
import * as Automation from "../../../terminal/AutomationService.ts";

const shared = {
  failure: Schema.Union([
    A.TerminalAutomationError,
    A.OrchestratorMcpFailure,
    A.McpCapabilityUnavailableError,
  ]),
  failureMode: "return" as const,
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagement.ThreadManagementService,
    EventSink.EventSinkV2,
    Automation.TerminalAutomationService,
  ],
};
const status = Tool.make("terminal_status", {
  ...shared,
  description:
    "Inspect already-open terminals in this thread and environment. Empty candidates means no usable terminal. State reports unbound, selection_required (wait for the user), bound, paused (human input; only the user can confirm resume), or invalid (stop using the old binding). Pass receipt:{bindingId,requestId} to query an input receipt without sending input. For unknown delivery, query the original receipt; never replay the command or create a new requestId to retry it. No per-command exitCode is available.",
  parameters: A.TerminalMcpStatusInput,
  success: Schema.toType(A.TerminalAutomationStatus),
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Idempotent, true);
const bind = Tool.make("terminal_bind", {
  ...shared,
  description:
    "Bind to an already-open terminal in this thread. mode:auto binds one candidate automatically; multiple candidates require user selection in an open window. mode:request_selection asks the user to choose. Keep the returned binding across follow-ups. Switching tabs does not change it. Child agents have independent bindings. No terminal is created. Requires full-access/default mode. A paused binding can only be resumed by explicit user confirmation in the client; this tool cannot approve resume.",
  parameters: A.TerminalMcpBindInput,
  success: Schema.toType(A.TerminalAutomationStatus),
});
const read = Tool.make("terminal_read", {
  ...shared,
  description:
    "Read the bound original terminal's screen, retained history, or output within the supplied budget. Use the returned frame and continuation cursor for further reads. Reads send no terminal input. Read access does not grant input permission. A missing or invalid target never falls back to a different terminal.",
  parameters: A.TerminalMcpReadInput,
  success: Schema.toType(A.TerminalAutomationReadResult),
}).annotate(Tool.Readonly, true);
const input = Tool.make("terminal_input", {
  ...shared,
  description:
    "Send text, paste, key, or supported mouse input to the bound original PTY, preserving its directory, environment, SSH and foreground program. The user sees the terminal and actual input; hidden views must be shown before dispatch. Requires full-access/default mode. Reuse requestId only for the same input. written means bytes sent, not command success. unknown means delivery may have occurred: query terminal_status with the original receipt and never replay. Human input pauses automation until the user confirms resume in the client. Cannot create a shell or approve resume.",
  parameters: A.TerminalMcpInput,
  success: Schema.toType(A.TerminalAutomationInputResult),
});
const release = Tool.make("terminal_release", {
  ...shared,
  description:
    "Release this caller's binding without closing the terminal or its PTY. Other threads and provider sessions cannot release it. Requires full-access/default mode.",
  parameters: A.TerminalMcpReleaseInput,
  success: Schema.toType(A.TerminalAutomationReleaseResult),
});
export const TerminalToolkit = Toolkit.make(status, bind, read, input, release);
