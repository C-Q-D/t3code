/** Verifies proportional viewport fitting after controls moved below the device screen. */
import { expect, it } from "vite-plus/test";
import { fitDeviceFrame } from "./deviceFrameLayout";

it("uses the full viewport without reserving space for a side controls rail", () => {
  const frame = fitDeviceFrame(9 / 19.5, 480, 1_000);
  // A 9:19.5 screen at 1000px tall is 6000/13px wide and fits within 480px.
  expect(frame.width).toBeCloseTo(6_000 / 13);
  expect(frame.height).toBe(1_000);
  expect(frame.width / frame.height).toBeCloseTo(9 / 19.5);
});
