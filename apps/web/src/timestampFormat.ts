/** Formats display-only timestamps; host clock preferences remain independent of UI language. */
import { t } from "~/i18n";
import { type TimestampFormat } from "@t3tools/contracts/settings";

function getTimestampFormatOptions(
  timestampFormat: TimestampFormat,
  includeSeconds: boolean,
): Intl.DateTimeFormatOptions {
  const baseOptions: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    ...(includeSeconds ? { second: "2-digit" } : {}),
  };

  if (timestampFormat === "locale") {
    return baseOptions;
  }

  return {
    ...baseOptions,
    hour12: timestampFormat === "12-hour",
  };
}

function resolveTimestampLocale(systemLocale: string | null | undefined): string | undefined {
  const tag = systemLocale?.trim();
  if (!tag) return undefined;

  try {
    // Every timestamp in the UI runs through this formatter, so a tag the host
    // could not normalize falls back rather than throwing. Throws on a
    // structurally invalid tag; a well-formed tag ICU has no data for resolves
    // here and is left to ICU's own fallback.
    Intl.DateTimeFormat.supportedLocalesOf([tag]);
    return tag;
  } catch {
    return undefined;
  }
}

function readHostSystemLocale(): string | null {
  if (typeof window === "undefined") return null;
  return window.desktopBridge?.getSystemLocale?.() ?? null;
}

const timestampLocale = resolveTimestampLocale(readHostSystemLocale());

const WEEKDAY_INDEXES = [0, 1, 2, 3, 4, 5, 6] as const;
type WeekdayIndex = (typeof WEEKDAY_INDEXES)[number];

type LocaleWithWeekInfo = Intl.Locale & {
  readonly weekInfo?: { readonly firstDay: number };
  getWeekInfo?: () => { readonly firstDay: number };
};

/**
 * First weekday of a locale as a `Date#getDay` index (0 is Sunday), or
 * `undefined` when the runtime has no week data, so callers keep their own
 * default.
 */
function resolveWeekStartsOn(locale: string | undefined): WeekdayIndex | undefined {
  try {
    const resolved: LocaleWithWeekInfo = new Intl.Locale(
      locale ?? Intl.DateTimeFormat().resolvedOptions().locale,
    );
    // Week info counts Monday as 1 and Sunday as 7.
    const firstDay = resolved.getWeekInfo?.().firstDay ?? resolved.weekInfo?.firstDay;
    return firstDay === undefined ? undefined : WEEKDAY_INDEXES[firstDay % 7];
  } catch {
    return undefined;
  }
}

export const weekStartsOn = resolveWeekStartsOn(timestampLocale);

const timestampFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getTimestampFormatter(
  timestampFormat: TimestampFormat,
  includeSeconds: boolean,
): Intl.DateTimeFormat {
  const cacheKey = `${timestampFormat}:${includeSeconds ? "seconds" : "minutes"}`;
  const cachedFormatter = timestampFormatterCache.get(cacheKey);
  if (cachedFormatter) {
    return cachedFormatter;
  }

  const formatter = new Intl.DateTimeFormat(
    timestampLocale,
    getTimestampFormatOptions(timestampFormat, includeSeconds),
  );
  timestampFormatterCache.set(cacheKey, formatter);
  return formatter;
}

export function resolveHour12(timestampFormat: TimestampFormat): boolean {
  return getTimestampFormatter(timestampFormat, false).resolvedOptions().hour12 ?? false;
}

export function parseTimestampDate(isoDate: string): Date | null {
  const date = new Date(isoDate);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatTimestamp(isoDate: string, timestampFormat: TimestampFormat): string {
  const date = parseTimestampDate(isoDate);
  if (!date) return "";
  return getTimestampFormatter(timestampFormat, true).format(date);
}

/**
 * Localized tooltip for an ISO instant, using the requested clock format without seconds.
 * Includes the local calendar date and year; invalid dates return an empty string.
 */
export function formatChatTimestampTooltip(
  isoDate: string,
  timestampFormat: TimestampFormat,
): string {
  const date = parseTimestampDate(isoDate);
  if (!date) return "";
  const time = formatShortTimestamp(isoDate, timestampFormat);
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  return t.common.timestamp.tooltip(time, day, month, year);
}

export function formatShortTimestamp(isoDate: string, timestampFormat: TimestampFormat): string {
  const date = parseTimestampDate(isoDate);
  if (!date) return "";
  return getTimestampFormatter(timestampFormat, false).format(date);
}

const numericDateFormatter = new Intl.DateTimeFormat(timestampLocale, {
  month: "numeric",
  day: "numeric",
});
const numericDateWithYearFormatter = new Intl.DateTimeFormat(timestampLocale, {
  month: "numeric",
  day: "numeric",
  year: "numeric",
});

export function formatDayAwareTimestamp(
  isoDate: string,
  timestampFormat: TimestampFormat,
  nowMs: number = Date.now(),
): string {
  const date = parseTimestampDate(isoDate);
  if (!date) return "";
  const time = getTimestampFormatter(timestampFormat, false).format(date);

  const now = new Date(nowMs);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfMessageDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  // Round so DST-shifted 23/25 hour days still count as whole days.
  const dayDiff = Math.round((startOfToday - startOfMessageDay) / 86_400_000);

  if (dayDiff <= 0) return time;
  if (dayDiff === 1) return t.common.timestamp.yesterday(time);
  const dateFormatter =
    date.getFullYear() === now.getFullYear() ? numericDateFormatter : numericDateWithYearFormatter;
  return `${dateFormatter.format(date)} ${time}`;
}

export function formatUpcomingTimestamp(
  isoDate: string,
  timestampFormat: TimestampFormat,
  nowMs: number = Date.now(),
): string {
  const date = parseTimestampDate(isoDate);
  if (!date) return "";
  const time = getTimestampFormatter(timestampFormat, false).format(date);

  const now = new Date(nowMs);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfTargetDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDiff = Math.round((startOfTargetDay - startOfToday) / 86_400_000);

  if (dayDiff < 0) return formatDayAwareTimestamp(isoDate, timestampFormat, nowMs);
  if (dayDiff === 0) return time;
  if (dayDiff === 1) return t.common.timestamp.tomorrow(time);
  const dateFormatter =
    date.getFullYear() === now.getFullYear() ? numericDateFormatter : numericDateWithYearFormatter;
  return `${dateFormatter.format(date)} ${time}`;
}

/** Localized relative-time parts that callers can style independently. */
type RelativeTimeParts = { value: string; suffix: string | null };
export type RelativeTimeState =
  | { status: "missing" }
  | { status: "invalid" }
  | { status: "relative"; value: string; suffix: string | null };

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

function relativeTimeUnitMs(elapsedMs: number): number {
  if (elapsedMs < HOUR_MS) return MINUTE_MS;
  if (elapsedMs < DAY_MS) return HOUR_MS;
  return DAY_MS;
}

/**
 * Elapsed time floored to the precision `formatRelativeTime` shows, so two
 * instants with the same label return the same number.
 */
export function relativeTimeElapsedMs(isoDate: string, nowMs: number = Date.now()): number | null {
  const date = parseTimestampDate(isoDate);
  if (!date) return null;
  const elapsedMs = Math.max(0, nowMs - date.getTime());
  const unitMs = relativeTimeUnitMs(elapsedMs);
  return Math.floor(elapsedMs / unitMs) * unitMs;
}

/** Milliseconds until the `formatRelativeTime` label for `isoDate` next changes. */
export function msUntilRelativeTimeChange(
  isoDate: string,
  nowMs: number = Date.now(),
): number | null {
  const date = parseTimestampDate(isoDate);
  if (!date) return null;
  const elapsedMs = Math.max(0, nowMs - date.getTime());
  const unitMs = relativeTimeUnitMs(elapsedMs);
  const nextChangeMs = date.getTime() + (Math.floor(elapsedMs / unitMs) + 1) * unitMs;
  // setTimeout fires at once past 2^31-1 ms, which would loop on a far-future
  // timestamp. Waking early is harmless: the caller re-reads and re-schedules.
  return Math.min(nextChangeMs - nowMs, DAY_MS);
}

export function formatRelativeElapsed(elapsedMs: number): RelativeTimeParts {
  const seconds = Math.floor(elapsedMs / 1000);
  if (seconds < 60) return { value: t.common.timestamp.justNow, suffix: null };
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60)
    return { value: t.common.timestamp.minutes(minutes), suffix: t.common.timestamp.ago };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { value: t.common.timestamp.hours(hours), suffix: t.common.timestamp.ago };
  const days = Math.floor(hours / 24);
  return { value: t.common.timestamp.days(days), suffix: t.common.timestamp.ago };
}

export function formatRelativeTime(
  isoDate: string,
  nowMs: number = Date.now(),
): RelativeTimeParts | null {
  const elapsedMs = relativeTimeElapsedMs(isoDate, nowMs);
  return elapsedMs === null ? null : formatRelativeElapsed(elapsedMs);
}

export function formatRelativeTimeLabel(isoDate: string, nowMs: number = Date.now()) {
  const relative = formatRelativeTime(isoDate, nowMs);
  if (!relative) return "";
  return relative.suffix ? `${relative.value} ${relative.suffix}` : relative.value;
}

export function formatElapsedDurationLabel(isoDate: string, nowMs: number = Date.now()): string {
  const date = parseTimestampDate(isoDate);
  if (!date) return "";
  const diffMs = nowMs - date.getTime();
  if (diffMs <= 0) return t.common.timestamp.justNow;

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 5) return t.common.timestamp.justNow;
  if (seconds < 60) return t.common.timestamp.seconds(seconds);

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t.common.timestamp.minutes(minutes);

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t.common.timestamp.hours(hours);

  const days = Math.floor(hours / 24);
  return t.common.timestamp.days(days);
}

function formatRelativeTimeUntil(isoDate: string): RelativeTimeParts | null {
  const date = parseTimestampDate(isoDate);
  if (!date) return null;
  const diffMs = date.getTime() - Date.now();
  if (diffMs <= 0) return { value: t.common.timestamp.expired, suffix: null };
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 5) return { value: t.common.timestamp.soon, suffix: null };
  if (seconds < 60)
    return { value: t.common.timestamp.seconds(seconds), suffix: t.common.timestamp.left };
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60)
    return { value: t.common.timestamp.minutes(minutes), suffix: t.common.timestamp.left };
  const hours = Math.floor(minutes / 60);
  if (hours < 24)
    return { value: t.common.timestamp.hours(hours), suffix: t.common.timestamp.left };
  const days = Math.floor(hours / 24);
  return { value: t.common.timestamp.days(days), suffix: t.common.timestamp.left };
}

export function formatRelativeTimeUntilLabel(isoDate: string): string {
  const relative = formatRelativeTimeUntil(isoDate);
  if (!relative) return "";
  return relative.suffix ? `${relative.value} ${relative.suffix}` : relative.value;
}

/**
 * Pass `nowMs` when a parent tick drives re-renders so the diff matches that snapshot.
 */
export function formatExpiresInLabel(isoDate: string, nowMs: number = Date.now()): string {
  const date = parseTimestampDate(isoDate);
  if (!date) return "";
  const diffMs = date.getTime() - nowMs;
  if (diffMs <= 0) return t.common.timestamp.expired;

  const totalSeconds = Math.floor(diffMs / 1000);
  if (totalSeconds < 5) return t.common.timestamp.expiresSoon;
  if (totalSeconds < 60)
    return t.common.timestamp.expiresIn(t.common.timestamp.seconds(totalSeconds));

  if (totalSeconds < 3600) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return seconds === 0
      ? t.common.timestamp.expiresIn(t.common.timestamp.minutes(minutes))
      : t.common.timestamp.expiresIn(
          `${t.common.timestamp.minutes(minutes)} ${t.common.timestamp.seconds(seconds)}`,
        );
  }

  if (totalSeconds < 86_400) {
    const hours = Math.floor(totalSeconds / 3600);
    const rem = totalSeconds % 3600;
    const minutes = Math.floor(rem / 60);
    const seconds = rem % 60;
    const parts = [t.common.timestamp.hours(hours)];
    if (minutes > 0) parts.push(t.common.timestamp.minutes(minutes));
    if (seconds > 0) parts.push(t.common.timestamp.seconds(seconds));
    return t.common.timestamp.expiresIn(parts.join(" "));
  }

  const days = Math.floor(totalSeconds / 86_400);
  const remAfterDays = totalSeconds % 86_400;
  if (remAfterDays === 0) return t.common.timestamp.expiresIn(t.common.timestamp.days(days));
  const hours = Math.floor(remAfterDays / 3600);
  const rem = remAfterDays % 3600;
  const minutes = Math.floor(rem / 60);
  const seconds = rem % 60;
  const tail: string[] = [];
  if (hours > 0) tail.push(t.common.timestamp.hours(hours));
  if (minutes > 0) tail.push(t.common.timestamp.minutes(minutes));
  if (seconds > 0) tail.push(t.common.timestamp.seconds(seconds));
  return tail.length > 0
    ? t.common.timestamp.expiresIn(`${t.common.timestamp.days(days)} ${tail.join(" ")}`)
    : t.common.timestamp.expiresIn(t.common.timestamp.days(days));
}
