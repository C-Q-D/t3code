/** Derives speed prices and drawable ring geometry without UI state or scheduling. */
import type { SpeedCost } from "@t3tools/shared/usageMerge";
import type { ShareSegment } from "./UsageShareBar";

/** Splits USD speed totals; premium is already included in fast and ultrafast costs. */
export function speedBreakdown(cost: SpeedCost) {
  const fastCost = cost.fast + cost.ultrafast;
  const total = cost.standard + fastCost;
  return {
    total,
    fastF: total === 0 ? 0 : fastCost / total,
    standard: cost.standard,
    fastStandard: fastCost - cost.premium,
    premium: cost.premium,
    allStandard: total - cost.premium,
    savingsF: total === 0 ? 0 : cost.premium / total,
    showSpeed: fastCost > 0,
  };
}

/** Normalizes positive category values in source order; empty totals produce no SVG segments. */
export function ringSegments(segments: readonly ShareSegment[]) {
  const positive = segments.filter((segment) => segment.value > 0);
  const total = positive.reduce((sum, segment) => sum + segment.value, 0);
  let start = 0;
  return positive.map((segment) => {
    const fraction = segment.value / total;
    const result = { ...segment, start, fraction };
    start += fraction;
    return result;
  });
}
