/** Private floating-surface geometry; persisted positions remain bounded by each caller. */

/** Recover CSS-pixel travel from rubber's visual offset so re-grabbing does not compress it twice.
 * @param offset Signed visual overflow, strictly smaller in magnitude than dimension.
 * @param dimension Positive container size in CSS pixels, matching rubber's default coefficient.
 * @returns Uncompressed signed travel for the next drag or glide origin.
 */
export function restoreFloatingOverflow(offset: number, dimension: number) {
  if (offset === 0) return 0;
  return offset / (0.55 * (1 - Math.abs(offset) / dimension));
}
