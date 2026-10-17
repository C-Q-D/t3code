/** Fits the raw screen inside its viewport; surrounding controls own their layout space. */

/**
 * @param aspect Screen width divided by height.
 * @param width Available viewport width in CSS pixels.
 * @param height Available viewport height in CSS pixels.
 * @returns The largest undistorted frame, or a zero frame for an empty viewport.
 */
export function fitDeviceFrame(aspect: number, width: number, height: number) {
  const availableWidth = Math.max(0, width);
  if (availableWidth === 0 || height === 0) return { width: 0, height: 0 };
  const byHeight = { width: height * aspect, height };
  return byHeight.width <= availableWidth
    ? byHeight
    : { width: availableWidth, height: availableWidth / aspect };
}
