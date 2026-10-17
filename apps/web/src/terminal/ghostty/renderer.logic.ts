/** Shared cell-height calculation for terminal measurement, grid sizing and canvas geometry. */

/** Terminal8a K1 uses 12px glyphs on a 19px row; user font sizes keep the same ratio. */
export const DEFAULT_TERMINAL_LINE_HEIGHT = 19 / 12;

/**
 * Return a whole-pixel cell height that contains the measured glyphs.
 * fontSize and glyphHeight are CSS pixels; lineHeight is a positive font-size ratio.
 * Missing or invalid ratios use K1 spacing. Tall glyphs can enlarge a row to avoid clipping.
 */
export function terminalCellHeight(
  fontSize: number,
  glyphHeight: number,
  lineHeight = DEFAULT_TERMINAL_LINE_HEIGHT,
): number {
  const ratio =
    Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : DEFAULT_TERMINAL_LINE_HEIGHT;
  return Math.max(1, Math.round(fontSize * ratio), Math.ceil(glyphHeight));
}
