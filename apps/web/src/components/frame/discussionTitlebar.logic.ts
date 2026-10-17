/** Selects the discrete discussion layout; CSS owns continuous track sizing. */

/**
 * Switches to the menu when the full controls cannot retain a readable title.
 * @param width Measured titlebar content width, excluding its frame padding.
 * @returns The discrete layout state; no pixel width enters React state.
 */
export function resolveDiscussionTitlebarLayout(width: number) {
  // Full controls need 240 + 300px, two 8px gaps, and at least 160px for the title.
  return { compact: width < 716 };
}
