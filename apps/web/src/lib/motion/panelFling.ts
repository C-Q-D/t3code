/** Panel collapse policy; velocities use increasing-size coordinates, independent of handle orientation. */

export const PANEL_FLING_SPEED_PX_PER_SECOND = 900;

/** Return whether projected size (px) and signed velocity (px/s) project strictly below minimum (px). */
export function shouldCollapsePanel(
  projectedSize: number,
  velocity: number,
  minimum: number,
): boolean {
  return velocity <= -PANEL_FLING_SPEED_PX_PER_SECOND && projectedSize < minimum;
}
