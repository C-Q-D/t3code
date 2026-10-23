/** Validates rewritten drafts without applying suggestion word limits. */
import type { ComposerOptimizeFilterReason } from "@t3tools/contracts";
import { collectComposerContextReferences } from "../composerContextReferences.ts";

/** Removes recognized whole-response wrappers; inline code and draft content stay intact. */
export function stripOptimizeWrapping(raw: string): string {
  return raw
    .trim()
    .replace(/^<prompt>([\s\S]*)<\/prompt>$/i, "$1")
    .replace(/^Rewritten prompt:\s*/i, "")
    .replace(/^```[^\n`]*\n([\s\S]*?)\n```$/, "$1")
    .trim();
}

/**
 * Checks raw rewritten text against the original untrimmed draft.
 * Returns the first rejection, or null; reference bytes must survive unchanged.
 */
export function checkOptimizedPrompt(
  raw: string,
  draft: string,
): typeof ComposerOptimizeFilterReason.Type | null {
  const text = stripOptimizeWrapping(raw);
  if (text === "") return "empty";
  if (text.replace(/\s+/g, " ") === draft.trim().replace(/\s+/g, " ")) return "unchanged";
  if (text.length > Math.max(2000, 3 * draft.length)) return "too_long";
  const references = [
    ...collectComposerContextReferences(draft).map((entry) => entry.source),
    ...Array.from(
      draft.matchAll(
        /@[\w./\\-]+|`+[^`]+`+|(?:[A-Za-z]:[\\/]|\\\\|(?<![\w:/])\/)[^\s`"'<>，。；）)]+/g,
      ),
      (match) => match[0],
    ),
  ];
  if (references.some((reference) => !text.includes(reference))) return "references_dropped";
  return null;
}
