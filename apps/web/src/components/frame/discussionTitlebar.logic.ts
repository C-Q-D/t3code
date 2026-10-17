/** Allocates the shortened discussion titlebar without relying on title or translated label length. */

/**
 * Reserves clickable controls before assigning the title's clipping track.
 * @param width Measured titlebar content width, excluding its frame padding.
 * @returns Fixed control tracks and the remaining title space, in CSS pixels.
 */
export function resolveDiscussionTitlebarLayout(width: number) {
  // Full controls need 240 + 300px, two 8px gaps, and at least 160px for the title.
  const compact = width < 716;
  const leading = compact ? 70 : 240;
  const actions = compact ? 44 : 300;
  const spacer = compact ? 8 : 8 + Math.min(182, Math.max(0, width - 716));
  const gap = 8;
  const title = Math.max(0, width - leading - actions - spacer - gap);
  return { compact, leading, actions, spacer, gap, title };
}
