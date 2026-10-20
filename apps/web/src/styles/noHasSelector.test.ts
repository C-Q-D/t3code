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
      // An apply directive can span lines. Keep token offsets so diagnostics identify the actual line.
      for (const apply of css.matchAll(/@apply\b([^;{}]*)(?:;|(?=\})|$)/gu)) {
        for (const token of apply[0].matchAll(/\S+/gu)) {
          if (hasForbiddenVariant(token[0])) {
            violations.push(
              `${location(file, css, apply.index + token.index)}: forbidden variant ${token[0]}`,
            );
          }
        }
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
