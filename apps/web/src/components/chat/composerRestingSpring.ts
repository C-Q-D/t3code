/** Converts resting-transition momentum between measured height journeys. */

/**
 * Convert normalized units/s velocity between previousTravelPx and nextTravelPx, signed CSS
 * pixel journeys. Their sign carries direction, so reversal preserves physical momentum.
 * A zero new journey has no animation and therefore no normalized velocity.
 */
export function composerRestingVelocity(
  velocity: number,
  previousTravelPx: number,
  nextTravelPx: number,
) {
  return nextTravelPx === 0 ? 0 : (velocity * previousTravelPx) / nextTravelPx;
}
