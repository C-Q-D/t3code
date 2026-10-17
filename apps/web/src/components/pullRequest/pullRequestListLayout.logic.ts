/** Computes the fresh PR list split before the persisted panel width takes precedence. */

/**
 * Reserve the board's list width while respecting the detail panel's existing 360px minimum.
 * @param hostWidth Available width of the list and detail host in CSS pixels.
 * @param listWidth Preferred list width read from the PR list theme token.
 * @returns The initial detail width; saved splitter state is applied by the panel itself.
 */
export function pullRequestListDetailWidth(hostWidth: number, listWidth: number): number {
  return Math.max(360, hostWidth - listWidth);
}
