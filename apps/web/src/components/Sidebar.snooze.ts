import { activeLocale, t } from "~/i18n";
import type { TimestampFormat } from "@t3tools/contracts/settings";
import {
  resolveSnoozePresets as resolveSharedSnoozePresets,
  snoozeWakeLabel as resolveSharedSnoozeWakeLabel,
  type SnoozePreset,
} from "@t3tools/client-runtime/state/thread-settled";

import { formatShortTimestamp, parseTimestampDate } from "../timestampFormat";

export { type SnoozePreset };

const DAY_MS = 24 * 60 * 60 * 1_000;

const SNOOZE_PRESET_LABELS: Record<SnoozePreset["id"], string> = {
  hour: t.sidebar.snooze.inOneHour,
  "three-hours": t.sidebar.snooze.inThreeHours,
  evening: t.sidebar.snooze.thisEvening,
  tomorrow: t.sidebar.snooze.tomorrow,
  "next-week": t.sidebar.snooze.nextWeek,
};

function timeOfDayLabel(date: Date, timestampFormat: TimestampFormat): string {
  return formatShortTimestamp(date.toISOString(), timestampFormat);
}

/** Returns shared wake times with localized preset labels and the selected clock format. */
export function resolveSnoozePresets(
  now: Date,
  timestampFormat: TimestampFormat,
): ReadonlyArray<SnoozePreset> {
  return resolveSharedSnoozePresets(now).map((preset) => {
    const wake = parseTimestampDate(preset.snoozedUntil);
    const label = SNOOZE_PRESET_LABELS[preset.id];
    if (wake === null) return { ...preset, label };
    const time = timeOfDayLabel(wake, timestampFormat);
    return {
      ...preset,
      label,
      whenLabel:
        preset.id === "next-week"
          ? `${wake.toLocaleDateString(activeLocale === "zh-CN" ? activeLocale : undefined, { weekday: "short" })} ${time}`
          : time,
    };
  });
}

/** Localizes the shared remaining-time label without changing its rounding or wake-time rules. */
export function snoozeWakeLabel(snoozedUntil: string, options: { readonly now: string }): string {
  const label = resolveSharedSnoozeWakeLabel(snoozedUntil, options);
  if (label === "now") return t.sidebar.snooze.now;
  const count = Number.parseInt(label, 10);
  if (label.endsWith("m")) return t.sidebar.snooze.minutes(count);
  if (label.endsWith("h")) return t.sidebar.snooze.hours(count);
  if (label.endsWith("d")) return t.sidebar.snooze.days(count);
  return label;
}

/**
 * Human wake time for menus and toasts: "tomorrow 9:00", "Mon 9:00",
 * "17:30" (today).
 */
export function snoozeWakeDescription(
  snoozedUntil: string,
  now: Date,
  timestampFormat: TimestampFormat,
): string {
  const wake = parseTimestampDate(snoozedUntil);
  if (wake === null) return "";
  const time = timeOfDayLabel(wake, timestampFormat);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const dayDelta = Math.floor((wake.getTime() - startOfToday.getTime()) / DAY_MS);
  if (dayDelta === 0) return time;
  if (dayDelta === 1) return t.sidebar.snooze.tomorrowDescription(time);
  const locale = activeLocale === "zh-CN" ? activeLocale : undefined;
  const weekday = wake.toLocaleDateString(locale, { weekday: "short" });
  if (dayDelta < 7) return `${weekday} ${time}`;
  const date = wake.toLocaleDateString(locale, { month: "short", day: "numeric" });
  return `${date}, ${time}`;
}
