import type { TerminalAutomationController } from "./automationController";

export function terminalCanUnmount(controller: TerminalAutomationController | undefined) {
  // A binding can appear after an empty query; ready subscriptions have a server limit of 128 per environment.
  return !controller?.getSnapshot().ready;
}
