/** Decides when validation feedback warrants one new composer impulse. */

/**
 * Compare previous/current alert messages (null means absent). rejected marks an explicit failed
 * submit attempt and defaults to false. Return whether to inject one impulse; persistent or
 * changing messages do not repeat passive feedback.
 */
export function shouldJoltComposer(
  previous: string | null,
  current: string | null,
  rejected = false,
) {
  return rejected || (previous === null && current !== null);
}
