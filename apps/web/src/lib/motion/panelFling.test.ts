/** Protects the product threshold, signed direction and strict projected boundary independently. */
import { describe, expect, it } from "vite-plus/test";
import { shouldCollapsePanel } from "./panelFling";

describe("panel fling collapse", () => {
  it.each([
    [199, -900, 200, true],
    [199, -899, 200, false],
    [100, 900, 200, false],
    [100, 0, 200, false],
    [200, -1000, 200, false],
    [201, -1000, 200, false],
    [199, -1000, 200, true],
  ])(
    "projected size %s with velocity %s and minimum %s collapses: %s",
    (size, velocity, minimum, collapse) => {
      expect(shouldCollapsePanel(size, velocity, minimum)).toBe(collapse);
    },
  );
});
