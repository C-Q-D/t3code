/** Resolves terminal display labels without changing IDs or running process names. */
import type { TerminalSummary } from "@t3tools/contracts";

/** Locale text for numbered terminal fallbacks; IDs and process names are never translated. */
export const englishTerminalLabels = { numbered: (number: string) => `Terminal ${number}` };

/** Display-only terminal label contract; a numeric suffix retains its original spelling. */
export type TerminalLabels = typeof englishTerminalLabels;

function terminalNumber(terminalId: string): string | undefined {
  return /^term(?:inal)?-(\d+)(?:-[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12})?$/i.exec(
    terminalId,
  )?.[1];
}

/**
 * Formats a numbered terminal fallback; unrecognized IDs remain verbatim.
 * @param terminalId Existing session ID, including optional uniqueness suffix.
 * @param messages Locale label formatter; defaults to the existing English label.
 * @returns Numbered label or unchanged ID.
 */
export function getTerminalLabel(
  terminalId: string,
  messages: TerminalLabels = englishTerminalLabels,
): string {
  const numericSuffix = terminalNumber(terminalId);
  if (numericSuffix) {
    return messages.numbered(numericSuffix);
  }

  return terminalId;
}

/**
 * Localizes only confirmed idle default labels; preserves process and other server names.
 * @param terminalId Session ID used when no display name is available.
 * @param summary Server label and optional process state; missing state cannot prove a default name.
 * @param messages Display locale; omitted messages preserve existing English output.
 * @returns Trimmed server name or a localized default, without changing server state.
 */
export function resolveTerminalSessionLabel(
  terminalId: string,
  summary:
    | (Pick<TerminalSummary, "label"> & Partial<Pick<TerminalSummary, "hasRunningSubprocess">>)
    | null
    | undefined,
  messages: TerminalLabels = englishTerminalLabels,
): string {
  const trimmed = summary?.label?.trim();
  if (trimmed && trimmed.length > 0) {
    if (summary?.hasRunningSubprocess === false && trimmed === getTerminalLabel(terminalId)) {
      return getTerminalLabel(terminalId, messages);
    }
    return trimmed;
  }
  return getTerminalLabel(terminalId, messages);
}

/**
 * Client-side terminal id allocator. Ids are ALWAYS chosen by the client and sent explicitly
 * on every `terminal.open` / `terminal.attach` call — the server never allocates.
 *
 * Returns the lowest unused `term-N` number. When metadata is unavailable,
 * callers append a UUID so an unseen host session cannot be reused accidentally.
 */
export function nextTerminalId(
  existingTerminalIds: ReadonlyArray<string>,
  uniqueSuffix?: string,
): string {
  const usedNumbers = new Set(existingTerminalIds.map(terminalNumber));
  let nextIndex = 1;
  while (usedNumbers.has(String(nextIndex))) {
    nextIndex += 1;
  }

  return `term-${nextIndex}${uniqueSuffix === undefined ? "" : `-${uniqueSuffix}`}`;
}
