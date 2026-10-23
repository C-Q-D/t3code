/** Validates rewritten drafts without applying suggestion word limits. */
import type { ComposerOptimizeFilterReason } from "@t3tools/contracts";
import {
  collectComposerContextReferences,
  replaceComposerContextReferences,
} from "../composerContextReferences.ts";

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
  // The web composer uses this same parser for t3-context links.
  const contextReferences = collectComposerContextReferences(draft);
  const outputContexts = new Set(
    collectComposerContextReferences(text).map((entry) => entry.source),
  );
  if (contextReferences.some((entry) => !outputContexts.has(entry.source)))
    return "references_dropped";
  const plainDraft = replaceComposerContextReferences(draft, () => "");
  const references = Array.from(
    plainDraft.matchAll(
      /(["'])((?:[A-Za-z]:[\\/]|\\\\|\/)[^\n]*?)\1|@[\p{L}\p{N}_./\\-]+|`+[^`]+`+|(?:[A-Za-z]:[\\/]|\\\\|(?<![\p{L}\p{N}:/])\/)[^\s`"'<>*~，。；：！？、（）【】(),:;!?[\]]+/gu,
    ),
    (match) => {
      if (match[2] !== undefined) return match[2];
      const target = match[0].replace(/[.,:;!?，。；：！？、]+$/, "");
      // Underscores are valid filename characters unless paired with a leading Markdown wrapper.
      const wrapper = plainDraft.slice(0, match.index).match(/_+$/)?.[0];
      return wrapper && target.endsWith(wrapper) ? target.slice(0, -wrapper.length) : target;
    },
  );
  if (references.some((reference) => !containsTarget(text, reference))) return "references_dropped";
  return null;
}

/** Code delimiters identify their own boundary; paths and mentions still reject longer targets. */
function containsTarget(text: string, target: string): boolean {
  if (target.startsWith("`")) return text.includes(target);
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const continuation = String.raw`[\p{L}\p{N}_/\\-]|\.[\p{L}\p{N}_]`;
  return new RegExp(
    String.raw`(?<![\p{L}\p{N}_/\\@\x60])(?:(\*\*|\*|_|~~)${escaped}\1|${escaped})(?!${continuation}|\x60)`,
    "u",
  ).test(text);
}
