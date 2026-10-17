/** Pure model selection and quota geometry for the usage overview; no network or settings writes. */
import type { ServerProviderUsageWindow } from "@t3tools/contracts";
import { elapsedShare, remainingPercent } from "@t3tools/shared/usageLimits";
import type { UsagePriceTarget } from "./usagePriceTargets";

/** Returns the deduplicated, sorted custom price/mapping model IDs in the supplied environment snapshots. */
export function customPriceModels(targets: readonly UsagePriceTarget[]): string[] {
  return [
    ...new Set(
      targets.flatMap((target) => [
        ...Object.keys(target.prices ?? {}),
        ...Object.keys(target.aliases ?? {}),
      ]),
    ),
  ].sort();
}

/** Maps consumed quota to M1's fill and elapsed time to its white reference line; now is epoch milliseconds and unknown clocks have no reference mark. */
export function quotaBarLayout(window: ServerProviderUsageWindow, now: number) {
  const elapsed = elapsedShare(window, now);
  return {
    fillPercent: 100 - remainingPercent(window),
    referencePercent: elapsed === null ? null : elapsed * 100,
  };
}
