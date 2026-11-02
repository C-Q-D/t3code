/** The reported cases are shapes a word-boundary scan missed in the 793bbf47b3 merge. */
import { describe, expect, it } from "vite-plus/test";

import { findEnglishCopy } from "./scan-english-copy.ts";

/** Builds `git diff --unified=0` output adding `added` to `path`. */
const diffOf = (path: string, ...added: ReadonlyArray<string>) =>
  [`+++ b/${path}`, `@@ -10,0 +21,${added.length} @@`, ...added.map((line) => `+${line}`)].join(
    "\n",
  );

describe("findEnglishCopy", () => {
  it.each([
    ["a label key with a prefix", '  ? { triggerLabel: "Mixed" }', ["Mixed"]],
    ["both branches of a ternary", '{isUser ? "You:" : "Agent:"}', ["You:", "Agent:"]],
    ["a multi-line ternary branch", '  : "Waiting for review"', ["Waiting for review"]],
    ["a nullish fallback", '?.toUpperCase() ?? "File";', ["File"]],
    ["a JSX attribute", '<Crumb origin="File" />', ["File"]],
    ["JSX text", "<span>Archived</span>", ["Archived"]],
    ["a lone JSX text line", "    Archived", ["Archived"]],
  ])("reports %s", (_name, line, expected) => {
    const found = findEnglishCopy(diffOf("apps/web/src/components/Example.tsx", line));

    expect(found.map((copy) => copy.text)).toEqual(expected);
  });

  it.each([
    ["an effect tag", '  _tag: "Failure",'],
    ["a lowercase attribute value", '<Button variant="ghost" />'],
    ["a translated value", "label={t.settings.title}"],
    ["an identifier-shaped value", '  title: "ChatComposer",'],
    ["an SVG path", '<path d="M12 0c6.627 0 12 5.373 12 12a.5.5 0 0 1-1 0Z" />'],
    ["Chinese copy", '  title: "设置",'],
    ["a comment", '// title: "Keep this comment"'],
  ])("skips %s", (_name, line) => {
    expect(findEnglishCopy(diffOf("apps/web/src/components/Example.tsx", line))).toEqual([]);
  });

  it.each([
    "apps/web/src/i18n/locales/en/chat.ts",
    "apps/web/src/components/Example.test.tsx",
    "apps/web/src/components/Example.browser.test.tsx",
  ])("skips files that hold no shipped copy: %s", (path) => {
    expect(findEnglishCopy(diffOf(path, '  title: "Settings",'))).toEqual([]);
  });

  it("keeps the line number of each added line across hunks", () => {
    const diff = [
      "+++ b/apps/web/src/A.tsx",
      "@@ -1,0 +5,2 @@",
      "+const unrelated = 1;",
      '+  title: "First",',
      "@@ -9,0 +40 @@",
      '+  title: "Second",',
      "+++ b/apps/web/src/B.tsx",
      "@@ -3,0 +7 @@",
      '+  title: "Third",',
    ].join("\n");

    expect(findEnglishCopy(diff)).toEqual([
      { path: "apps/web/src/A.tsx", line: 6, text: "First" },
      { path: "apps/web/src/A.tsx", line: 40, text: "Second" },
      { path: "apps/web/src/B.tsx", line: 7, text: "Third" },
    ]);
  });
});
