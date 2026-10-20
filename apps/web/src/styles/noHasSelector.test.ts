/** Guard every web stylesheet, including Tailwind apply directives that generate relational selectors. */
// @effect-diagnostics nodeBuiltinImport:off - this Node-only source guard reads stylesheet files directly.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

const sourceRoot = NodeURL.fileURLToPath(new URL("../", import.meta.url));
const cssFiles = NodeFS.readdirSync(sourceRoot, { recursive: true, encoding: "utf8" })
  .filter((file) => file.endsWith(".css"))
  .sort();

/**
 * Identify a forbidden Tailwind variant in one apply token, excluding the final utility.
 * Nested brackets and escaped characters cannot introduce variant separators.
 */
function hasForbiddenVariant(token: string): boolean {
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
      if (/^(group-|peer-|not-|in-)?has(-|\[)/u.test(token.slice(start, index))) return true;
      start = index + 1;
    }
  }
  return false;
}

/** Return source-relative file and one-based line for a CSS match at the given character offset. */
function location(file: string, css: string, offset: number): string {
  return `${file}:${css.slice(0, offset).split("\n").length}`;
}

/**
 * Return one-based line diagnostics for forbidden variants in CSS apply directives, without filesystem access.
 * Quotes, escapes, and nested brackets protect arbitrary values from being read as directive boundaries.
 */
function findForbiddenApply(css: string): string[] {
  const violations: string[] = [];
  const directive = /@apply\b/gu;
  let apply: RegExpExecArray | null;
  while ((apply = directive.exec(css)) !== null) {
    const start = apply.index + apply[0].length;
    let end = start;
    let depth = 0;
    let quote: string | undefined;
    for (; end < css.length; end++) {
      const char = css[end];
      if (char === "\\") {
        end++;
        continue;
      }
      if (quote !== undefined) {
        if (char === quote) quote = undefined;
        continue;
      }
      if (char === "'" || char === '"') quote = char;
      else if (char === "[") depth++;
      else if (char === "]") depth = Math.max(0, depth - 1);
      else if (depth === 0 && (char === ";" || char === "{" || char === "}")) break;
    }
    // Resume after this directive so literal @apply text inside its values is not scanned again.
    directive.lastIndex = end;
    for (const token of css.slice(start, end).matchAll(/\S+/gu)) {
      if (hasForbiddenVariant(token[0])) {
        const line = css.slice(0, start + token.index).split("\n").length;
        violations.push(`${line}: forbidden variant ${token[0]}`);
      }
    }
  }
  return violations;
}

/* oxlint-disable t3code/no-has-selector -- regression fixtures deliberately contain forbidden variants */
describe("apply directive scanning", () => {
  it.each([
    ["quoted opening brace", ".x { @apply content-['{'] has-disabled:hidden; }"],
    ["quoted semicolon", ".x { @apply content-[';'] has-disabled:hidden; }"],
    ["quoted closing brace", '.x { @apply content-["}"] has-disabled:hidden; }'],
    ["escaped quote", String.raw`.x { @apply content-['\';'] has-disabled:hidden; }`],
    ["escaped backslash", String.raw`.x { @apply content-['\\'] has-disabled:hidden; }`],
    ["nested brackets", ".x { @apply content-[[a;b]] has-disabled:hidden; }"],
    ["ordinary variant", ".x { @apply flex has-disabled:hidden; }"],
  ])("reports a forbidden variant after %s", (_name, css) => {
    expect(findForbiddenApply(css)).toEqual(["1: forbidden variant has-disabled:hidden"]);
  });

  it("keeps line numbers across multiline directives", () => {
    expect(findForbiddenApply(".x {\n @apply content-[';']\n has-disabled:hidden;\n}")).toEqual([
      "3: forbidden variant has-disabled:hidden",
    ]);
  });

  it.each([
    ".x { @apply flex hover:block; }",
    ".x { @apply data-[has-icon=false]:block group-data-[has-icon=false]/row:hidden; }",
    ".x { @apply content-[';{[}]'] hover:block; }",
    ".x { @apply flex; has-disabled:hidden; }",
    ".x { @apply flex } .has-disabled:hidden { color: red; }",
    ".x { @apply flex { has-disabled:hidden; } }",
  ])("allows safe directives and stops at external boundaries: %s", (css) => {
    expect(findForbiddenApply(css)).toEqual([]);
  });
});
/* oxlint-enable t3code/no-has-selector */
describe("web stylesheets", () => {
  it("contain no relational selectors or Tailwind has variants", () => {
    expect(
      cssFiles.length,
      "The stylesheet scan must not silently pass on an empty tree",
    ).toBeGreaterThan(0);
    const violations: string[] = [];
    for (const file of cssFiles) {
      const css = NodeFS.readFileSync(NodePath.join(sourceRoot, file), "utf8");
      for (const match of css.matchAll(/:has\(/giu)) {
        violations.push(`${location(file, css, match.index)}: forbidden relational selector`);
      }
      violations.push(...findForbiddenApply(css).map((violation) => `${file}:${violation}`));
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
