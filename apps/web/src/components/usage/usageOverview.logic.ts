/** Pure custom-price model selection; no quota geometry, network or settings writes. */
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
