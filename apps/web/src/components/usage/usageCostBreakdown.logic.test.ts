/** Guards the agreed speed-price accounting and category geometry with independent examples. */
import { describe, expect, it } from "vite-plus/test";
import { costTypeSegments, tokenTypeSegments } from "./usageBreakdown";
import { ringSegments, speedBreakdown } from "./usageCostBreakdown.logic";

describe("speed prices", () => {
  it.each([
    {
      name: "mixed speeds",
      input: { standard: 60, fast: 30, ultrafast: 10, premium: 15 },
      expected: {
        total: 100,
        fastF: 0.4,
        standard: 60,
        fastStandard: 25,
        premium: 15,
        allStandard: 85,
        savingsF: 0.15,
        showSpeed: true,
      },
    },
    {
      name: "no fast usage",
      input: { standard: 20, fast: 0, ultrafast: 0, premium: 0 },
      expected: {
        total: 20,
        fastF: 0,
        standard: 20,
        fastStandard: 0,
        premium: 0,
        allStandard: 20,
        savingsF: 0,
        showSpeed: false,
      },
    },
    {
      name: "ultrafast only",
      input: { standard: 0, fast: 0, ultrafast: 40, premium: 10 },
      expected: {
        total: 40,
        fastF: 1,
        standard: 0,
        fastStandard: 30,
        premium: 10,
        allStandard: 30,
        savingsF: 0.25,
        showSpeed: true,
      },
    },
    {
      name: "no premium",
      input: { standard: 10, fast: 10, ultrafast: 0, premium: 0 },
      expected: {
        total: 20,
        fastF: 0.5,
        standard: 10,
        fastStandard: 10,
        premium: 0,
        allStandard: 20,
        savingsF: 0,
        showSpeed: true,
      },
    },
    {
      name: "zero total",
      input: { standard: 0, fast: 0, ultrafast: 0, premium: 0 },
      expected: {
        total: 0,
        fastF: 0,
        standard: 0,
        fastStandard: 0,
        premium: 0,
        allStandard: 0,
        savingsF: 0,
        showSpeed: false,
      },
    },
  ])("$name", ({ input, expected }) => {
    expect(speedBreakdown(input)).toEqual(expected);
  });
});

describe("ring geometry", () => {
  it("normalizes cost categories and omits a zero category", () => {
    const segments = ringSegments(
      costTypeSegments({ input: 10, cacheRead: 20, cacheWrite: 0, output: 30, unsplit: 40 }),
    );
    expect(segments.map(({ start, fraction, color }) => ({ start, fraction, color }))).toEqual([
      { start: 0, fraction: 0.1, color: "var(--color-usage-split-input)" },
      { start: 0.1, fraction: 0.2, color: "var(--color-usage-split-cache-read)" },
      { start: expect.closeTo(0.3), fraction: 0.3, color: "var(--color-usage-split-output)" },
      { start: expect.closeTo(0.6), fraction: 0.4, color: "var(--color-usage-split-other)" },
    ]);
    expect(segments.reduce((sum, segment) => sum + segment.fraction, 0)).toBeCloseTo(1);
  });

  it("uses processed token categories without adding reasoning twice", () => {
    const segments = ringSegments(
      tokenTypeSegments({
        uncachedInputTokens: 10,
        cachedInputTokens: 20,
        cacheCreationTokens: 30,
        outputTokens: 40,
      }),
    );
    expect(segments.map(({ start, fraction, color }) => ({ start, fraction, color }))).toEqual([
      { start: 0, fraction: 0.1, color: "var(--color-usage-split-input)" },
      { start: 0.1, fraction: 0.2, color: "var(--color-usage-split-cache-read)" },
      { start: expect.closeTo(0.3), fraction: 0.3, color: "var(--color-usage-split-cache-write)" },
      { start: expect.closeTo(0.6), fraction: 0.4, color: "var(--color-usage-split-output)" },
    ]);
    expect(segments.reduce((sum, segment) => sum + segment.fraction, 0)).toBeCloseTo(1);
  });

  it("returns no arcs for zero costs or zero tokens", () => {
    expect(
      ringSegments(
        costTypeSegments({ input: 0, cacheRead: 0, cacheWrite: 0, output: 0, unsplit: 0 }),
      ),
    ).toEqual([]);
    expect(
      ringSegments(
        tokenTypeSegments({
          uncachedInputTokens: 0,
          cachedInputTokens: 0,
          cacheCreationTokens: 0,
          outputTokens: 0,
        }),
      ),
    ).toEqual([]);
  });
});
