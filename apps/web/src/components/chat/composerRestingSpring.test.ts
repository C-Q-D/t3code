/** Independent journey examples protect physical momentum across retargeting. */
import { expect, it } from "vite-plus/test";
import { composerRestingVelocity } from "./composerRestingSpring";

it.each([
  [100, 40, 5],
  [-100, -40, 5],
  [100, -40, -5],
  [-100, 40, -5],
])("preserves momentum from %s px to %s px", (previous, next, expected) => {
  expect(composerRestingVelocity(2, previous, next)).toBe(expected);
});

it("does not divide by a completed journey", () => {
  expect(composerRestingVelocity(2, 100, 0)).toBe(0);
});
