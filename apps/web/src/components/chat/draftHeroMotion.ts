/** Draft-only conversion between visual offsets and normalized WAAPI springs. */

/**
 * Convert an axis offset (px from the new layout) and velocity (px/s) into additive
 * springs ending at zero. Signed distance preserves momentum on reversal.
 * At the target, two cancelling 1px springs carry velocity without dividing by zero
 * or introducing a visible starting offset. No segment is needed for an idle axis.
 */
export function draftHeroAxisSegments(offsetPx: number, velocityPxPerSecond: number) {
  if (offsetPx !== 0) {
    return [{ fromPx: offsetPx, initialVelocity: velocityPxPerSecond / -offsetPx }];
  }
  if (velocityPxPerSecond === 0) return [];
  return [
    { fromPx: 1, initialVelocity: -velocityPxPerSecond },
    { fromPx: -1, initialVelocity: 0 },
  ];
}
