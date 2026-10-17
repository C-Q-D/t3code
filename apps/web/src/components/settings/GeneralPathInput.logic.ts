/** Resolves native folder-picker results before they enter the existing scoped path writer. */

/**
 * Converts cancellation or an empty selection into no commit.
 * @param path Native picker result; null means cancellation or unavailable capability.
 * @returns A trimmed path, matching the settings contract, or null to leave the setting unchanged.
 */
export function resolvePickedFolderPath(path: string | null): string | null {
  return path?.trim() || null;
}
