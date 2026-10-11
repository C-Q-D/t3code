/** Localized usage presentation and existing interaction behavior. */
import { t } from "~/i18n";
import type { KeybindingCommand, ResolvedKeybindingsConfig } from "@t3tools/contracts";
import type { UsageChartMetric } from "./UsageProviderChart";
import { resolveShortcutCommand, type ShortcutEventLike } from "../../keybindings";

export type UsageMetric = UsageChartMetric | "limits";
export const METRIC_OPTIONS = [
  { value: "cost", label: t.tools.usage.cost, command: "usage.cost" },
  { value: "tokens", label: t.tools.usage.tokens, command: "usage.tokens" },
  { value: "limits", label: t.tools.usage.limits, command: "usage.limits" },
] as const satisfies readonly { value: UsageMetric; label: string; command: KeybindingCommand }[];

export const WINDOW_OPTIONS = [
  { days: 1, label: t.tools.usage.past24h, command: "usage.period.day" },
  { days: 7, label: t.tools.usage.sevenDays, command: "usage.period.week" },
  { days: 30, label: t.tools.usage.thirtyDays, command: "usage.period.month" },
  { days: 90, label: t.tools.usage.ninetyDays, command: "usage.period.quarter" },
] as const;

/** Resolves page shortcuts without taking letters from fields or popup controls. */
export function resolveUsageShortcut(
  event: ShortcutEventLike & { target: EventTarget | null },
  keybindings: ResolvedKeybindingsConfig,
) {
  const target = event.target;
  if (
    target instanceof HTMLElement &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT" ||
      target.isContentEditable ||
      target.closest('[role="dialog"], [aria-modal="true"], [data-slot$="popup"]'))
  ) {
    return null;
  }

  return resolveShortcutCommand(event, keybindings, {
    context: { usagePageOpen: true },
  });
}
