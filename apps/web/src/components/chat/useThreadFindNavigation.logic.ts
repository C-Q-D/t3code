/** Resolves search reveal bounds independently of DOM measurement and virtual-list scrolling. */

/**
 * Fits reveal margins inside the space between the Provider overlay and composer.
 * @param input - Viewport bounds and visible banner bottom in viewport CSS pixels;
 * bannerBottom is null when absent. Composer inset, match height, and maximum margin are CSS pixels.
 * @returns Reveal bounds in viewport coordinates and a top-only alignment policy when an overlay
 * leaves too little room for the match. Without a banner, the original symmetric margins apply.
 */
export function resolveThreadFindRevealBounds(input: {
  viewportTop: number;
  viewportBottom: number;
  contentInsetEndAdjustment: number;
  matchHeight: number;
  maxMargin: number;
  bannerBottom: number | null;
}) {
  const availableTop = Math.max(input.viewportTop, input.bannerBottom ?? input.viewportTop);
  const availableBottom = input.viewportBottom - input.contentInsetEndAdjustment;
  const availableHeight = availableBottom - availableTop;
  const margin = Math.min(input.maxMargin, Math.max(0, (availableHeight - input.matchHeight) / 2));
  return {
    top: Math.max(input.viewportTop + margin, availableTop),
    bottom: availableBottom - margin,
    alignTop: input.bannerBottom !== null && availableHeight < input.matchHeight,
  };
}
