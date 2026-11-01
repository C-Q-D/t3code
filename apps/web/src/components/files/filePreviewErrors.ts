/** Localizes errors produced by preview workers; external library messages pass through unchanged. */
import { t } from "~/i18n";
import { en } from "~/i18n/locales/en";

/** Resolves known worker copy at display time without changing worker protocols or error identity. */
export function localizeFilePreviewError(message: string): string {
  const english: Readonly<Record<string, string>> = en.tools.previewErrors;
  const translated: Readonly<Record<string, string>> = t.tools.previewErrors;
  for (const [key, value] of Object.entries(english)) {
    if (message === value) return translated[key] ?? message;
  }
  return message;
}
