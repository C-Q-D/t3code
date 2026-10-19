/**
 * Fork switch for every snooze affordance in this client. The owner never
 * uses snooze, so the Later tab, snooze/wake controls, snooze banners, and the
 * "Snooze limited threads" setting stay hidden, and a thread snoozed elsewhere
 * (an agent over MCP, another device) lists as an ordinary active thread.
 * Server rules, MCP tools, and mobile keep snooze; set this to true to bring
 * the web/desktop UI back. Each call site gates on this one flag so upstream
 * merges touch as little snooze code as possible.
 */
// Annotated so TypeScript does not narrow the literal and flag gated code as unreachable.
export const SNOOZE_UI_ENABLED: boolean = false;
