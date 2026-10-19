/** Validation transitions are specified independently of animation scheduling. */
import { expect, it } from "vite-plus/test";
import { shouldJoltComposer } from "./composerValidationMotion";

it.each([
  [null, "too long", false, true],
  ["too long", "too long", false, false],
  ["too long", "still too long", false, false],
  ["too long", null, false, false],
  [null, null, false, false],
  ["too long", "too long", true, true],
])("validation %s -> %s, rejected %s triggers %s", (previous, current, rejected, expected) => {
  expect(shouldJoltComposer(previous, current, rejected)).toBe(expected);
});
