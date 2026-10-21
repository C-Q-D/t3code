import { englishUsageMessages } from "./usageLabels.ts";
// @effect-diagnostics globalDate:off -- A fixed instant keeps calendar-window assertions deterministic.
import { describe, expect, it, vi } from "vite-plus/test";

import {
  formatDayShort,
  formatUsageContractMismatch,
  formatDateTimeShort,
  formatHourShort,
  formatPercent,
  formatRelativeHourShort,
  makeWindow,
} from "./usageFormat.ts";

describe("formatPercent", () => {
  it("distinguishes a small positive share from zero", () => {
    expect(formatPercent(0)).toBe("0.0%");
    expect(formatPercent(0.0004)).toBe("<0.1%");
    expect(formatPercent(0.0009)).toBe("<0.1%");
    expect(formatPercent(0.001)).toBe("0.1%");
    expect(formatPercent(0.023)).toBe("2.3%");
    expect(formatPercent(0.00004, 2)).toBe("<0.01%");
  });
});

describe("hourly usage formatting", () => {
  it("keeps requested zones separate when formatting repeated calls", () => {
    const instant = "2026-08-11T12:37:00.000Z";
    for (const zone of ["UTC", "America/New_York", "Asia/Kathmandu", "UTC"]) {
      expect(formatHourShort(instant, zone)).toBe(
        new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric" }).format(
          new Date(instant),
        ),
      );
    }
    expect(() => formatHourShort(instant, "Etc/Unknown")).toThrow(RangeError);
    expect(formatHourShort("invalid", "UTC")).toBe("invalid");
  });

  it("disambiguates repeated hours during a fall-back transition", () => {
    expect(formatHourShort("2026-11-01T05:37:00.000Z", "America/New_York")).toBe("1 AM EDT");
    expect(formatHourShort("2026-11-01T06:37:00.000Z", "America/New_York")).toBe("1 AM EST");
    expect(formatHourShort("2026-11-01T05:37:00.000Z", "America/New_York", undefined, false)).toBe(
      "01:00 EDT",
    );
    expect(formatHourShort("2026-11-01T06:37:00.000Z", "America/New_York", undefined, false)).toBe(
      "01:00 EST",
    );
  });

  it("builds an exact minute-aligned 24-hour request", () => {
    const window = makeWindow(1, new Date("2026-08-11T12:37:42.123Z"), "hour");

    expect(window.resolution).toBe("hour");
    expect(window.sinceTime).toBe("2026-08-10T12:37:00.000Z");
    expect(window.untilTime).toBe("2026-08-11T12:37:00.000Z");
  });

  it("degrades an unknown resolved zone to UTC instead of crashing", () => {
    const resolved = new Intl.DateTimeFormat().resolvedOptions();
    const resolvedOptions = vi
      .spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions")
      .mockReturnValue({ ...resolved, timeZone: "Etc/Unknown" });

    try {
      const now = new Date("2026-08-11T12:37:42.123Z");

      expect(makeWindow(1, now, "hour").timeZone).toBe("UTC");
      expect(makeWindow(30, now).timeZone).toBe("UTC");
    } finally {
      resolvedOptions.mockRestore();
    }
  });
});

it("localizes usage calendar labels and mismatch notices while preserving invalid input", () => {
  const messages = {
    ...englishUsageMessages,
    dateLocale: "zh-CN",
    day: (month: number, day: number) => `${month}月${day}日`,
    today: (hour: string) => `今天 ${hour}`,
    yesterday: (hour: string) => `昨天 ${hour}`,
    serverBehind: (environment: string) => `${environment} 服务端版本较旧，已排除用量。`,
  };
  expect(formatDayShort("2026-08-07", messages)).toBe("8月7日");
  expect(
    formatRelativeHourShort("2026-08-11T05:00:00Z", "2026-08-11T12:00:00Z", "UTC", messages),
  ).toBe("今天 5时");
  expect(
    formatRelativeHourShort("2026-08-10T05:00:00Z", "2026-08-11T12:00:00Z", "UTC", messages),
  ).toBe("昨天 5时");
  expect(formatDateTimeShort("invalid", "UTC", messages)).toBe("invalid");
  expect(formatUsageContractMismatch("Remote", { direction: "serverBehind" }, messages)).toBe(
    "Remote 服务端版本较旧，已排除用量。",
  );
});
