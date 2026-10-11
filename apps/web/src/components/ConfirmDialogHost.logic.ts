/** Resolves confirmation headings and descriptions independently of dialog rendering. */
import { t } from "~/i18n";

/** The confirmation heading and optional supporting text displayed by the host. */
type ConfirmationCopy = {
  readonly title: string;
  readonly description: string | null;
};

/**
 * Separates a confirmation question from its supporting text without changing either.
 * @param message Caller-supplied confirmation text; empty or whitespace-only text uses localized defaults.
 * @returns A trimmed title and description; description is null when no supporting text remains.
 */
export function resolveConfirmDialogCopy(message: string): ConfirmationCopy {
  const normalizedMessage = message.trim();
  const lines = normalizedMessage.split("\n");
  const questionLineIndex = lines.findIndex((line) => /[?？]$/.test(line.trim()));

  if (questionLineIndex >= 0) {
    const title = lines[questionLineIndex]!.trim();
    const description = lines
      .filter((_, index) => index !== questionLineIndex)
      .join("\n")
      .trim();
    return { title, description: description || null };
  }

  const questionMarkIndex = normalizedMessage.search(/[?？]/);
  if (questionMarkIndex >= 0) {
    return {
      title: normalizedMessage.slice(0, questionMarkIndex + 1).trim(),
      description: normalizedMessage.slice(questionMarkIndex + 1).trim() || null,
    };
  }

  return {
    title: t.common.confirm.title,
    description: normalizedMessage || t.common.confirm.description,
  };
}
