/** Guards K1 line spacing, custom spacing and unclipped glyphs using fixed pixel expectations. */
import { describe, expect, it } from "vite-plus/test";
import { terminalCellHeight } from "./renderer.logic";

describe("terminalCellHeight", () => {
  it.each([
    { fontSize: 12, glyphHeight: 12, expected: 19 },
    { fontSize: 13, glyphHeight: 12, expected: 21 },
    { fontSize: 12, glyphHeight: 25.25, expected: 26 },
  ])(
    "contains $glyphHeight px glyphs at $fontSize px with K1 spacing",
    ({ fontSize, glyphHeight, expected }) => {
      expect(terminalCellHeight(fontSize, glyphHeight)).toBe(expected);
    },
  );

  it("accepts custom spacing without clipping descenders", () => {
    expect(terminalCellHeight(12, 12, 1)).toBe(12);
    expect(terminalCellHeight(12, 14.25, 1)).toBe(15);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "falls back to K1 for invalid ratio %s",
    (ratio) => {
      expect(terminalCellHeight(12, 12, ratio)).toBe(19);
    },
  );
});
