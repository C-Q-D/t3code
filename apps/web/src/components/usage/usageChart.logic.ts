/** Pure scale calculations for the M1 stacked usage chart; rendering and data fetching stay outside. */
import type { UsageProviderKind } from "@t3tools/contracts";
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
