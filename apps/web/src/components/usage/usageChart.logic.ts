/** Pure selected-window statistics and chart scales; rendering and data fetching stay outside. */
import type { UsageProviderKind } from "@t3tools/contracts";
import type { DailyTotals, HourlyTotals } from "@t3tools/shared/usageMerge";
import type { DayColumn } from "./UsageProviderChart";

const TICK_COUNT = 4;
const PLACEHOLDER_TICKS = Array.from({ length: TICK_COUNT + 1 }, (_, index) => index);

/** Rounds a nonnegative peak up to a readable 1/2/5 step; count is the target tick count. Zero yields a single zero tick. */
export function niceScale(peak: number, count: number): { max: number; ticks: readonly number[] } {
  if (peak <= 0) return { max: 0, ticks: [0] };
  const rawStep = peak / count;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const step = (normalized > 5 ? 10 : normalized > 2 ? 5 : normalized > 1 ? 2 : 1) * magnitude;
  const max = Math.ceil(peak / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= max + step * 1e-6; value += step) ticks.push(value);
  return { max, ticks };
}

/** Fits complete stacked columns; loadingProviders keeps an empty chart's scale stable until data arrives. */
export function chartScale(
  columns: readonly DayColumn[],
  loadingProviders: ReadonlySet<UsageProviderKind>,
) {
  const peak = columns.reduce((max, column) => Math.max(max, column.total), 0);
  return peak === 0 && loadingProviders.size > 0
    ? { max: TICK_COUNT, ticks: PLACEHOLDER_TICKS, labeled: false }
    : { ...niceScale(peak, TICK_COUNT), labeled: true };
}

/** Returns a provider's nonnegative share of its column for flex sizing; an empty column has no filled bands. */
export function bandShare(value: number, total: number): number {
  return total > 0 ? value / total : 0;
}

/**
 * Summarizes ordered, nonnegative column totals in the selected metric's units.
 * Inactive columns remain in the average denominator; an empty/all-zero window has no peak.
 * Strict comparison preserves the earliest peak when chronological columns tie.
 */
export function summarizeColumns(columns: readonly { readonly total: number }[]) {
  let total = 0;
  let activeCount = 0;
  let peak = 0;
  let peakIndex: number | null = null;
  columns.forEach((column, index) => {
    total += column.total;
    if (column.total > 0) activeCount++;
    if (column.total > peak) {
      peak = column.total;
      peakIndex = index;
    }
  });
  return {
    total,
    average: columns.length === 0 ? 0 : total / columns.length,
    activeCount,
    columnCount: columns.length,
    peakIndex,
  };
}

/**
 * Builds token and USD series in the main chart's period order, summing only selected providers.
 * Missing periods/providers and an empty selection contribute zero without removing columns.
 * periods accepts day keys or hourStart keys matching byPeriod; no date conversion occurs here.
 */
export function buildMetricSeries(
  periods: readonly string[],
  byPeriod: ReadonlyMap<string, DailyTotals | HourlyTotals>,
  providers: readonly UsageProviderKind[],
) {
  const tokens: number[] = [];
  const cost: number[] = [];
  for (const period of periods) {
    const entry = byPeriod.get(period);
    let totalTokens = 0;
    let costUsd = 0;
    for (const provider of providers) {
      const value = entry?.byProvider.get(provider);
      totalTokens += value?.totalTokens ?? 0;
      costUsd += value?.costUsd ?? 0;
    }
    tokens.push(totalTokens);
    cost.push(costUsd);
  }
  return { tokens, cost };
}
