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
  const original = extractReferences(draft);
  const rewritten = extractReferences(text);
  if (
    [...original.contexts].some((reference) => !rewritten.contexts.has(reference)) ||
    [...original.targets].some((target) => !rewritten.targets.has(target)) ||
    [...original.code].some((fragment) => !text.includes(fragment))
  )
    return "references_dropped";
  return null;
}

/** Extracts complete targets identically on both sides; normalization only removes outside wrappers. */
function extractReferences(text: string) {
  // The web composer uses this same parser for t3-context links.
  const contexts = new Set(collectComposerContextReferences(text).map((entry) => entry.source));
  const plain = replaceComposerContextReferences(text, () => "");
  const targets = new Set<string>();
  const code = new Set<string>();
  // Quoted paths consume the whole quoted value. Bare directory segments may contain spaces.
  // Ambiguous bare paths may overcapture prose: rejecting the rewrite preserves the draft,
  // which is safer than accepting a different target. Never recover by substring matching.
  for (const match of plain.matchAll(
    /(["'])((?:[A-Za-z]:[\\/]|\\\\|\/)[^\n]*?)\1|`+[^`]+`+|@[\p{L}\p{N}_./\\-][^\s`"'<>*~，。；：！？、（）【】(),:;!?[\]]*|(?:[A-Za-z]:[\\/]|\\\\|(?<![\p{L}\p{N}:/])\/)(?:[^\r\n`"'<>*~，。；：！？、（）【】(),:;!?[\]]*[\\/])?[^\s`"'<>*~，。；：！？、（）【】(),:;!?[\]]+/gu,
  )) {
    if (match[0].startsWith("`")) {
      code.add(match[0]);
      continue;
    }
    if (match[2] !== undefined) {
      targets.add(match[2]);
      continue;
    }
    const target = match[0].replace(/[.,:;!?，。；：！？、]+$/, "");
    // Underscores are filename characters unless paired with a leading Markdown wrapper.
    const wrapper = plain.slice(0, match.index).match(/_+$/)?.[0];
    targets.add(wrapper && target.endsWith(wrapper) ? target.slice(0, -wrapper.length) : target);
  }
  return { contexts, targets, code };
}
