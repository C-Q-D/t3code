/** Reject CSS relational selectors in string literals and template fragments before Tailwind builds them. */
/* oxlint-disable t3code/no-has-selector -- this rule must name the syntax it rejects */
import { defineRule } from "@oxlint/plugins";

const HAS_VARIANT = /^(group-|peer-|not-|in-)?has(-|\[)/u;

/**
 * Return forbidden tokens from whitespace-separated class text.
 * Bracket contents are arbitrary selectors or values, so their colons do not split variants.
 * The final segment is a utility, not a variant; explicit relational selectors are always rejected.
 */
function findHasSelectorTokens(text: string): string[] {
  return text.split(/\s+/u).filter((token) => {
    if (/:has\(/iu.test(token)) return true;
    let depth = 0;
    let start = 0;
    for (let index = 0; index < token.length; index++) {
      const char = token[index];
      if (char === "\\") {
        index++;
        continue;
      }
      if (char === "[") depth++;
      else if (char === "]") depth = Math.max(0, depth - 1);
      else if (char === ":" && depth === 0) {
        if (HAS_VARIANT.test(token.slice(start, index))) return true;
        start = index + 1;
      }
    }
    return false;
  });
}

export default defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Disallow CSS :has() and Tailwind has-* variants to avoid whole-page restyles.",
    },
  },
  create(context) {
    const message = (token: string) =>
      `Do not use :has() or has-* variants (${token}). Virtual list insertions invalidate ancestor styles in Chrome. Use component-owned data-* attributes, focus-within, peer, or child-slot registration.`;
    return {
      Literal(node) {
        if (typeof node.value !== "string") return;
        for (const token of findHasSelectorTokens(node.value)) {
          context.report({ node, message: message(token) });
        }
      },
      TemplateElement(node) {
        for (const token of findHasSelectorTokens(node.value.cooked ?? node.value.raw)) {
          context.report({ node, message: message(token) });
        }
      },
    };
  },
});
