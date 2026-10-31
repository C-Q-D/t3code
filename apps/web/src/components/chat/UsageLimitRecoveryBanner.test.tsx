import { renderToStaticMarkup } from "react-dom/server";
import { RunId } from "@t3tools/contracts";
import type { TimestampFormat } from "@t3tools/contracts/settings";
import { describe, expect, it, vi } from "vite-plus/test";

import { usageLimitRecoveryBannerItem } from "./UsageLimitRecoveryBanner";

const stoppedAt = new Date(2026, 9, 20, 12, 0);

function bannerDescription(resetAt: Date, timestampFormat: TimestampFormat) {
  return renderToStaticMarkup(
    usageLimitRecoveryBannerItem({
      runId: RunId.make("run-1"),
      resetAt: resetAt.toISOString(),
      stoppedAt: stoppedAt.toISOString(),
      snoozedUntil: null,
      recovery: null,
      timestampFormat,
      onChange: async () => {},
    }).content,
  );
}

describe("usageLimitRecoveryBannerItem", () => {
  it.each([
    [
      "12-hour",
      `Resets ${new Date(2026, 9, 20, 17, 30).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true })}`,
    ],
    ["24-hour", "Resets 17:30"],
  ] as const)("formats a same-day reset with the %s setting", (timestampFormat, expected) => {
    using _now = vi.spyOn(Date, "now").mockReturnValue(stoppedAt.getTime());
    expect(bannerDescription(new Date(2026, 9, 20, 17, 30), timestampFormat)).toContain(expected);
  });

  it("names the day when the reset is tomorrow", () => {
    using _now = vi.spyOn(Date, "now").mockReturnValue(stoppedAt.getTime());
    expect(bannerDescription(new Date(2026, 9, 21, 17, 30), "24-hour")).toContain(
      "Resets tomorrow at 17:30",
    );
  });
});
