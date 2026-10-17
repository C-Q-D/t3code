/** Owns the inactivity-day step boundary shared by button availability and commits. */
import {
  MAX_SIDEBAR_AUTO_SETTLE_AFTER_DAYS,
  MIN_SIDEBAR_AUTO_SETTLE_AFTER_DAYS,
} from "@t3tools/contracts/settings";

/**
 * Resolves a one-day step without exceeding the settings contract.
 * @param value Persisted integer days within the contract's range.
 * @param direction One day backward (-1) or forward (1).
 * @returns The next valid day count, or null when the requested step is unavailable.
 */
export function stepAutoSettleDays(value: number, direction: -1 | 1): number | null {
  const next = value + direction;
  return next < MIN_SIDEBAR_AUTO_SETTLE_AFTER_DAYS || next > MAX_SIDEBAR_AUTO_SETTLE_AFTER_DAYS
    ? null
    : next;
}
