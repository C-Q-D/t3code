/** Maps visible reasoning choices onto the six approved aurora levels. */

/** Count is positive and index is zero-based within the visible, non-injected options.
 * Returns a level from 0 to 5; a single available choice uses level 5.
 */
export function reasoningPaletteLevel(count: number, index: number) {
  return count === 1 ? 5 : Math.round((index * 5) / (count - 1));
}
