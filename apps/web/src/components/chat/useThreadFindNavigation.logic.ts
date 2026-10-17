/** Resolves search reveal bounds independently of DOM measurement and virtual-list scrolling. */

/**
 * Keeps a revealed match below both the normal viewport margin and the Provider overlay.
 * @param input - Viewport top, existing margin, and visible banner bottom in CSS pixels;
 * bannerBottom is null when the banner is absent. Both positions use viewport coordinates.
 * @returns The first unobscured vertical position for the match, in viewport CSS pixels.
 */
export function resolveThreadFindRevealTop(input: {
  viewportTop: number;
  margin: number;
  bannerBottom: number | null;
}): number {
  const defaultTop = input.viewportTop + input.margin;
  return Math.max(defaultTop, input.bannerBottom ?? defaultTop);
}
