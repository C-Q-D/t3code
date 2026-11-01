/** Adapts environment snooze presets to local labels; the shared runtime owns wake-time calculations. */
import type { EnvironmentId } from "@t3tools/contracts";
import { parseTimestampDate } from "../timestampFormat";
import { activeLocale, t } from "~/i18n";
import type { TimestampFormat } from "@t3tools/contracts/settings";
import {
  pickSnoozePreset as pickSharedSnoozePreset,
  resolveSnoozePresets as resolveSharedSnoozePresets,
  snoozeWakeLabel as resolveSharedSnoozeWakeLabel,
  type SnoozePreset,
} from "@t3tools/client-runtime/state/thread-settled";

import { appAtomRegistry } from "../rpc/atomRegistry";
import { serverEnvironment } from "../state/server";
import { formatShortTimestamp } from "../timestampFormat";
import { toastManager } from "./ui/toast";

export { type SnoozePreset };

const DAY_MS = 24 * 60 * 60 * 1_000;

function timeOfDayLabel(date: Date, timestampFormat: TimestampFormat): string {
  return formatShortTimestamp(date.toISOString(), timestampFormat);
}

/** Returns shared wake times with localized preset labels and the selected clock format. */
export function resolveSnoozePresets(
  now: Date,
  timestampFormat: TimestampFormat,
  environmentId: EnvironmentId,
): ReadonlyArray<SnoozePreset> {
  return resolveSharedSnoozePresets(now, snoozeOptions(timestampFormat, environmentId)).map(
    localizeSnoozePreset,
  );
}

/** Localizes generated preset labels without changing their IDs or resolved wake times. */
export function localizeSnoozePreset(preset: SnoozePreset): SnoozePreset {
  const labels: Readonly<Record<string, Readonly<Record<string, string>>>> = {
    "after:60": { "In 1 hour": t.sidebar.snooze.inOneHour },
    "after:180": { "In 3 hours": t.sidebar.snooze.inThreeHours },
    "at:today:18:00": { "This evening": t.sidebar.snooze.thisEvening },
    "at:tomorrow:09:00": { Tomorrow: t.sidebar.snooze.tomorrow },
    "at:monday:09:00": {
      "Next week": t.sidebar.snooze.nextWeek,
      Tomorrow: t.sidebar.snooze.tomorrow,
    },
  };
  const days: Readonly<Record<string, string>> = {
    Monday: t.sidebar.snoozeLabels.Monday,
    Tuesday: t.sidebar.snoozeLabels.Tuesday,
    Wednesday: t.sidebar.snoozeLabels.Wednesday,
    Thursday: t.sidebar.snoozeLabels.Thursday,
    Friday: t.sidebar.snoozeLabels.Friday,
    Saturday: t.sidebar.snoozeLabels.Saturday,
    Sunday: t.sidebar.snoozeLabels.Sunday,
  };
  const calendar: Readonly<Record<string, string>> = {
    "This morning": t.sidebar.snoozeLabels.morning,
    "This afternoon": t.sidebar.snoozeLabels.afternoon,
    "This evening": t.sidebar.snoozeLabels.evening,
    Tomorrow: t.sidebar.snoozeLabels.tomorrow,
    "Next week": t.sidebar.snoozeLabels.nextWeek,
  };
  const duration = /^In (\d+) (minute|hour|day)s?$/.exec(preset.label);
  const unit = duration?.[2];
  const label =
    duration && (unit === "minute" || unit === "hour" || unit === "day")
      ? t.sidebar.snoozeLabels.duration(Number(duration[1]), unit)
      : preset.label.startsWith("Next ") && days[preset.label.slice(5)]
        ? t.sidebar.snoozeLabels.next(days[preset.label.slice(5)]!)
        : (days[preset.label] ?? calendar[preset.label] ?? preset.label);
  return { ...preset, label: labels[preset.id]?.[preset.label] ?? label };
}

/** Revalidates a displayed choice at click time; expired choices prompt the user to choose again. */
export function pickSnoozePreset(
  shown: ReadonlyArray<SnoozePreset>,
  id: string,
  timestampFormat: TimestampFormat,
  environmentId: EnvironmentId,
): SnoozePreset | undefined {
  const picked = pickSharedSnoozePreset({
    shown,
    id,
    now: new Date(),
    ...snoozeOptions(timestampFormat, environmentId),
  });
  if (!picked) {
    toastManager.add({
      type: "warning",
      title: t.sidebar.snoozeErrors.failed,
      description: t.sidebar.snoozeErrors.passed,
    });
  }
  return picked ? localizeSnoozePreset(picked) : undefined;
}

/** Reads presets from the target environment and formats times using the selected clock format; absent settings use shared defaults. */
function snoozeOptions(timestampFormat: TimestampFormat, environmentId: EnvironmentId) {
  const presets = appAtomRegistry.get(
    serverEnvironment.settingsValueAtom(environmentId),
  )?.snoozePresets;
  return {
    ...(presets ? { presets } : {}),
    formatTime: (date: Date) => formatShortTimestamp(date.toISOString(), timestampFormat),
  };
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
