/** Dependency-free display text for usage dates, compatibility notices, and limit countdowns. */
const ENGLISH_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Existing English date and compatibility text for callers that omit a locale. */
export const englishUsageMessages = {
  dateLocale: "en-US",
  day: (month: number, day: number) => `${ENGLISH_MONTHS[month - 1] ?? ""} ${day}`,
  today: (hour: string) => `${hour} today`,
  yesterday: (hour: string) => `${hour} yesterday`,
  serverBehind: (environment: string) =>
    `${environment} runs an older server version and is excluded from totals.`,
  clientBehind: (environment: string) =>
    `This client is older than the server on ${environment}; its usage is excluded from totals.`,
};

/** Locale text accepted by usage date and compatibility formatters. */
export type UsageMessages = typeof englishUsageMessages;

/** Existing English limit text; countdown variants replace former caller-side prefix manipulation. */
export const englishUsageLimitsMessages = {
  daysHours: (days: number, hours: number) => `${days}d ${hours}h`,
  hoursMinutes: (hours: number, minutes: number) => `${hours}h ${minutes}m`,
  minutes: (minutes: number) => `${minutes}m`,
  resetsNow: "resets now",
  resetsIn: (duration: string) => `resets in ${duration}`,
  relativeReset: (duration: string) => `in ${duration}`,
  compactReset: (duration: string) => `↻ ${duration}`,
  noSubscriptionLimits: "This account has no subscription limits.",
  couldNotReadLimits: "Could not read limits.",
  noLimits: "No limits reported.",
  noAccounts: "No accounts reported.",
  cursorWindows: {
    totalPercentUsed: {
      label: "Overall",
      description: "Combined usage across both allowances, not a third quota.",
    },
    autoPercentUsed: {
      label: "Cursor Models",
      description: "Grok and Composer use this first. Auto can use either pool.",
    },
    apiPercentUsed: {
      label: "Other Models",
      description: "Claude, GPT, and Gemini use this pool. Grok and Composer fall back here.",
    },
  },
};

/** Locale text accepted by usage limit presentation helpers; provider text remains unchanged. */
export type UsageLimitsMessages = typeof englishUsageLimitsMessages;
