/** Guards the selected-window statistics and series contracts, independent of rendering. */
import { describe, expect, it } from "vite-plus/test";
import type { DailyTotals } from "@t3tools/shared/usageMerge";
import { summarizeColumns, buildMetricSeries } from "./usageChart.logic";

describe("summarizeColumns", () => {
  it("includes inactive columns in the average but not the active count", () => {
    expect(summarizeColumns([{ total: 6 }, { total: 0 }, { total: 12 }])).toEqual({
      total: 18,
      average: 6,
      activeCount: 2,
      columnCount: 3,
      peakIndex: 2,
    });
  });

  it("has no peak for an all-zero window", () => {
    expect(summarizeColumns([{ total: 0 }, { total: 0 }])).toEqual({
      total: 0,
      average: 0,
      activeCount: 0,
      columnCount: 2,
      peakIndex: null,
    });
  });

  it("uses the only column as the average and peak", () => {
    expect(summarizeColumns([{ total: 7.5 }])).toEqual({
      total: 7.5,
      average: 7.5,
      activeCount: 1,
      columnCount: 1,
      peakIndex: 0,
    });
  });

  it("keeps the earliest column when positive peaks tie", () => {
    expect(summarizeColumns([{ total: 2 }, { total: 9 }, { total: 9 }])).toEqual({
      total: 20,
      average: 20 / 3,
      activeCount: 3,
      columnCount: 3,
      peakIndex: 1,
    });
  });

  it("returns finite empty statistics when there are no columns", () => {
    expect(summarizeColumns([])).toEqual({
      total: 0,
      average: 0,
      activeCount: 0,
      columnCount: 0,
      peakIndex: null,
    });
  });
});

describe("buildMetricSeries", () => {
  const periods = ["2026-08-01", "2026-08-02", "2026-08-03"];
  const byPeriod: ReadonlyMap<string, DailyTotals> = new Map([
    [
      "2026-08-01",
      {
        day: "2026-08-01",
        costUsd: 15,
        totalTokens: 900,
        byProvider: new Map([
          ["codex", { totalTokens: 100, costUsd: 2 }],
          ["claude", { totalTokens: 300, costUsd: 5 }],
          ["pi", { totalTokens: 500, costUsd: 8 }],
        ]),
      },
    ],
    [
      "2026-08-03",
      {
        day: "2026-08-03",
        costUsd: 4,
        totalTokens: 60,
        byProvider: new Map([["claude", { totalTokens: 60, costUsd: 4 }]]),
      },
    ],
  ]);

  it("sums selected providers and zero-fills missing providers and periods", () => {
    expect(buildMetricSeries(periods, byPeriod, ["codex", "claude"])).toEqual({
      tokens: [400, 0, 60],
      cost: [7, 0, 4],
    });
  });

  it("keeps the main chart column count when no providers are selected", () => {
    expect(buildMetricSeries(periods, byPeriod, [])).toEqual({
      tokens: [0, 0, 0],
      cost: [0, 0, 0],
    });
  });
});
