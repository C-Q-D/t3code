/** Truth-table coverage keeps explicit on separate from system accessibility preference. */
import { afterEach, expect, it } from "vitest";
import {
  isPhysicsEnabled,
  onPhysicsChange,
  resolvePhysicsMotion,
  setPhysicsEnabled,
  type PhysicsMotionMode,
} from "./preference";

afterEach(() => setPhysicsEnabled(false));
it.each<[PhysicsMotionMode, boolean, boolean, boolean]>([
  ["on", true, true, true],
  ["on", false, true, true],
  ["system", true, true, false],
  ["system", false, true, true],
  ["off", true, true, false],
  ["off", false, true, false],
  ["on", true, false, false],
  ["on", false, false, false],
  ["system", true, false, false],
  ["system", false, false, false],
  ["off", true, false, false],
  ["off", false, false, false],
])(
  "mode=%s reduced=%s hydrated=%s resolves to %s",
  (mode, prefersReducedMotion, hydrated, expected) => {
    expect(resolvePhysicsMotion({ mode, prefersReducedMotion, hydrated })).toBe(expected);
  },
);

it("publishes only effective transitions and releases listeners", () => {
  const values: boolean[] = [];
  const unsubscribe = onPhysicsChange((value) => values.push(value));
  setPhysicsEnabled(true);
  setPhysicsEnabled(true);
  expect(isPhysicsEnabled()).toBe(true);
  setPhysicsEnabled(false);
  unsubscribe();
  setPhysicsEnabled(true);
  expect(values).toEqual([true, false]);
});
