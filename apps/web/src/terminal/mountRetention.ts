import type { TerminalAutomationController } from "./automationController";

export async function terminalCanUnmount(controller: TerminalAutomationController | undefined) {
  if (!controller?.getSnapshot().ready) return true;
  try {
    const state = await controller.refreshState();
    return !state.bindings.some((binding) => binding.status !== "invalid");
  } catch {
    return !controller.getSnapshot().ready;
  }
}
