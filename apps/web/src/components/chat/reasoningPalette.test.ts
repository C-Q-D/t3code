/** Guards the approved spacing of palette levels, independently of CSS and provider IDs. */
import { expect, it } from "vite-plus/test";
import { reasoningPaletteLevel } from "./reasoningPalette";

it.each([
  { count: 1, expected: [5] },
  { count: 2, expected: [0, 5] },
  { count: 4, expected: [0, 2, 3, 5] },
  { count: 5, expected: [0, 1, 3, 4, 5] },
  { count: 6, expected: [0, 1, 2, 3, 4, 5] },
])("maps $count visible choices to $expected", ({ count, expected }) => {
  expect(Array.from({ length: count }, (_, index) => reasoningPaletteLevel(count, index))).toEqual(
    expected,
  );
});
