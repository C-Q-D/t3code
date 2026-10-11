/** Localized preview UI and interactions; preserves user data, commands, and protocol values. */
import { t } from "~/i18n";
import { PREVIEW_ERROR_CODE_MESSAGES } from "./previewConstants";

/**
 * Resolve a friendly description for a Chromium / network error. Falls back
 * to the description string passed in when it isn't in our table.
 * @param description Original Chromium error description; an empty description uses the network fallback.
 * @returns The value described above, without changing user data or protocol identifiers.
 */
export function describePreviewError(description: string): string {
  const friendly = PREVIEW_ERROR_CODE_MESSAGES[description];
  if (friendly) return friendly;
  if (description.length > 0) return description;
  return t.tools.preview.networkError;
}
