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

/**
 * Replace comments and strings outside apply directives with equal-length spaces, preserving CR/LF.
 * Apply values retain their quotes and brackets for the variant scanner; comments are masked everywhere.
 */
function maskCssNonCode(css: string): string {
  const characters = css.split("");
  let inApply = false;
  let depth = 0;
  let index = 0;
  while (index < css.length) {
    const char = css[index];
    let end = index;
    let mask = false;
    if (css.startsWith("/*", index)) {
      const close = css.indexOf("*/", index + 2);
      end = close === -1 ? css.length : close + 2;
      mask = true;
    } else if (char === "'" || char === '"') {
      end = index + 1;
      while (end < css.length) {
        if (css[end] === "\\") {
          end = Math.min(end + 2, css.length);
        } else if (css[end++] === char) {
          break;
        }
      }
      mask = !inApply;
    } else if (char === "\\") {
      index += 2;
      continue;
    } else {
      if (!inApply && css.startsWith("@apply", index) && !/\w/u.test(css[index + 6] ?? "")) {
        inApply = true;
        index += 6;
        continue;
      }
      if (inApply) {
        if (char === "[") depth++;
        else if (char === "]") depth = Math.max(0, depth - 1);
        else if (depth === 0 && (char === ";" || char === "{" || char === "}")) inApply = false;
      }
      index++;
      continue;
    }
    if (mask) {
      for (let position = index; position < end; position++) {
        if (css[position] !== "\n" && css[position] !== "\r") characters[position] = " ";
      }
    }
    index = end;
  }
  return characters.join("");
}

/**
 * Return one-based line diagnostics for forbidden variants in preprocessed CSS apply directives.
 * Call maskCssNonCode first to remove comments and strings outside directives.
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

/** Return line diagnostics for both relational selectors and apply variants in CSS source. */
function findCssViolations(css: string): string[] {
  const code = maskCssNonCode(css);
  const violations: string[] = [];
  for (const match of code.matchAll(/:has\(/giu)) {
    const line = code.slice(0, match.index).split("\n").length;
    violations.push(`${line}: forbidden relational selector`);
  }
  return [...violations, ...findForbiddenApply(code)];
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
    ["comment inside directive", ".x { @apply flex /* ; */ has-disabled:hidden; }"],
    ["ordinary variant", ".x { @apply flex has-disabled:hidden; }"],
  ])("reports a forbidden variant after %s", (_name, css) => {
    expect(findCssViolations(css)).toEqual(["1: forbidden variant has-disabled:hidden"]);
  });

  it("preserves line numbers through multiline comments", () => {
    expect(
      findCssViolations(
        "/* :has(\n @apply has-disabled:hidden; */\n.x { @apply flex /* ;\n */ has-disabled:hidden; }\n.x:has(.y) {}",
      ),
    ).toEqual(["5: forbidden relational selector", "4: forbidden variant has-disabled:hidden"]);
  });
  it("keeps line numbers across multiline directives", () => {
    expect(findCssViolations(".x {\n @apply content-[';']\n has-disabled:hidden;\n}")).toEqual([
      "3: forbidden variant has-disabled:hidden",
    ]);
  });

  it.each([
    "/* @apply has-disabled:hidden; */",
    '.x { content: "@apply has-disabled:hidden;"; }',
    '/* :has( */ .x { content: ":has("; }',
    String.raw`.x { content: "escaped \" @apply has-disabled:hidden;"; }`,
    ".x { @apply flex hover:block; }",
    ".x { @apply data-[has-icon=false]:block group-data-[has-icon=false]/row:hidden; }",
    ".x { @apply content-[';{[}]'] hover:block; }",
    ".x { @apply flex; has-disabled:hidden; }",
    ".x { @apply flex } .has-disabled:hidden { color: red; }",
    ".x { @apply flex { has-disabled:hidden; } }",
  ])("allows safe directives and stops at external boundaries: %s", (css) => {
    expect(findCssViolations(css)).toEqual([]);
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
      violations.push(...findCssViolations(css).map((violation) => `${file}:${violation}`));
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
