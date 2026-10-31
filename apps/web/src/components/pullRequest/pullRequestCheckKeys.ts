/** Supplies data-based React keys for check lists whose provider contract has no check identifier. */
import type { PullRequestCheck } from "@t3tools/contracts";

/** Keeps distinct checks stable across status-based reordering; indistinguishable duplicates use an occurrence suffix. */
export function keyedPullRequestChecks(checks: ReadonlyArray<PullRequestCheck>) {
  const occurrences = new Map<string, number>();
  return checks.map((check) => {
    const identity = JSON.stringify([check.url, check.name, check.description, check.required]);
    const occurrence = occurrences.get(identity) ?? 0;
    occurrences.set(identity, occurrence + 1);
    return { check, key: `${identity}:${occurrence}` };
  });
}
