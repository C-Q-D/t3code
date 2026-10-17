/** Protects the contract's one-day increment/decrement and inclusive 1–90 day limits. */
import { describe, expect, it } from "vite-plus/test";

import { stepAutoSettleDays } from "./AutoSettleDaysInput.logic";

describe("inactivity day step limits", () => {
  it.each([
    [7, 1, 8],
    [7, -1, 6],
    [1, -1, null],
    [1, 1, 2],
    [90, 1, null],
    [90, -1, 89],
    [2, -1, 1],
    [89, 1, 90],
  ] as const)("steps %i by %i to %s", (value, direction, expected) => {
    expect(stepAutoSettleDays(value, direction)).toBe(expected);
  });
});
