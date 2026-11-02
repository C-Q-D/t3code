#!/usr/bin/env node
/** Lists likely untranslated English copy on lines added since a commit, over-reporting on purpose. */
// @effect-diagnostics nodeBuiltinImport:off globalConsole:off - One-shot maintainer report over `git diff` output.
import * as NodeChildProcess from "node:child_process";

/** One candidate string, located on the head side of the diff. */
export interface EnglishCopy {
  readonly path: string;
  readonly line: number;
  readonly text: string;
}

const SKIPPED_FILE =
  /\.test\.|\.browser\.|\/test\/|\/testing\/|i18n\/locales\/|desktopMessages|\.d\.ts$|\.css$/;
const NON_CODE_LINE = /^\s*(?:\/\/|\/\*|\*|import |export \* )/;
const QUOTED = `["'\`]([^"'\`$]+)["'\`]`;
const MAX_DIFF_BYTES = 2 ** 30;

const COPY_PATTERNS = [
  // Matches on the key's suffix so `triggerLabel` counts as well as `label`.
  new RegExp(
    `\\b[\\w-]*(?:title|label|placeholder|description|alt|tooltip|text|message|heading|hint|summary)\\s*[:=]\\s*\\{?\\s*${QUOTED}`,
    "gi",
  ),
  new RegExp(`(?:\\?\\?|\\|\\||\\?)\\s*${QUOTED}`, "g"),
  new RegExp(`(?:^\\s*|\\?.*):\\s*${QUOTED}`, "g"),
];
const JSX_COPY_PATTERNS = [
  new RegExp(`[\\w-]+=\\{?${QUOTED}`, "g"),
  />([A-Z][^<>{}]*)</g,
  /^\s+([A-Z][a-z]+(?: [A-Za-z0-9'’,.-]+)*[.?!]?)\s*$/g,
];

/** Copy starts uppercase here; this drops class lists, identifiers, and SVG paths. */
const isCopy = (value: string) =>
  /^[A-Z]/.test(value) &&
  /[a-z]/.test(value) &&
  !/[一-鿿]/.test(value) &&
  !/^(?:[A-Z][a-z0-9]*){2,}$/.test(value) &&
  !/^[A-Z]-?\d/.test(value);

/** Returns each distinct candidate on one line; JSX shapes only count in `.tsx` files. */
const copyOnLine = (path: string, text: string) => {
  const patterns = path.endsWith(".tsx") ? [...COPY_PATTERNS, ...JSX_COPY_PATTERNS] : COPY_PATTERNS;
  const values = patterns.flatMap((pattern) =>
    [...text.matchAll(pattern)].flatMap((match) => match[1]?.trim() ?? []),
  );
  return [...new Set(values)].filter(isCopy);
};

/** Reads `git diff --unified=0` output and returns candidates in diff order. */
export const findEnglishCopy = (diff: string): ReadonlyArray<EnglishCopy> => {
  const found: Array<EnglishCopy> = [];
  let path = "";
  let nextLine = 0;
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("+++ ")) {
      path = raw.startsWith("+++ b/") ? raw.slice("+++ b/".length) : "";
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(raw);
    if (hunk) {
      nextLine = Number(hunk[1]);
      continue;
    }
    if (!raw.startsWith("+")) continue;
    const line = nextLine;
    nextLine += 1;
    const code = raw.slice(1);
    if (SKIPPED_FILE.test(path) || NON_CODE_LINE.test(code)) continue;
    for (const text of copyOnLine(path, code)) found.push({ path, line, text });
  }
  return found;
};

if (import.meta.main) {
  const [base, head = "HEAD"] = process.argv.slice(2);
  if (!base) {
    console.error("Usage: node scripts/scan-english-copy.ts <base commit> [head commit]");
    process.exit(2);
  }
  const diff = NodeChildProcess.execFileSync(
    "git",
    ["diff", "--unified=0", "--no-color", base, head, "--", "apps/web/src", "apps/desktop/src"],
    { encoding: "utf8", maxBuffer: MAX_DIFF_BYTES },
  );
  const found = findEnglishCopy(diff);
  for (const { path, line, text } of found) console.log(`${path}:${line}\t${text}`);
  console.log(
    `${found.length} candidates added since ${base}. Route real copy through \`t\` with en and zh-CN entries; skip strings users never see.`,
  );
}
