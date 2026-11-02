#!/usr/bin/env node
/** Lists symbols local code used that a merge removed, which no conflict or local diff shows. */
// @effect-diagnostics nodeBuiltinImport:off globalConsole:off - One-shot maintainer report; `git cat-file --batch` needs stdin and raw bytes.
import * as NodeChildProcess from "node:child_process";

type SourceTree = ReadonlyMap<string, string>;

/** A symbol local code relied on before the merge and can no longer reach after it. */
export interface LostSymbol {
  readonly symbol: string;
  readonly declaredIn: string;
  readonly reason: "removed" | "uncalled";
  readonly localCallers: ReadonlyArray<string>;
}

const SOURCE_ROOTS = ["apps/web/src", "apps/server/src", "apps/desktop/src", "packages"];
const NON_SOURCE = /\.test\.|\.browser\.|\/test\/|\.d\.ts$/;
const EXPORTED_DECLARATION =
  /^export (?:declare )?(?:abstract )?(?:async )?(?:const|let|function\*?|class|type|interface|enum) +([A-Za-z_$][\w$]*)/gm;
const ANY_DECLARATION =
  /\b(?:const|let|var|function\*?|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/g;
const CONTRACT_FIELD = /^ {2,8}([a-zA-Z][a-zA-Z0-9]*): /gm;
const MAX_GIT_OUTPUT_BYTES = 2 ** 30;

/** Exports, plus schema fields in contracts files, since a field can vanish while its export stays. */
const declaredSymbols = (path: string, text: string) => {
  const fields = path.startsWith("packages/contracts/src/") ? text.matchAll(CONTRACT_FIELD) : [];
  return new Set(
    [...text.matchAll(EXPORTED_DECLARATION), ...fields].flatMap((match) => match[1] ?? []),
  );
};

/** Also counts unexported declarations, so dropping `export` does not read as a removal. */
const anyDeclaredSymbols = (path: string, text: string) =>
  new Set([
    ...declaredSymbols(path, text),
    ...[...text.matchAll(ANY_DECLARATION)].flatMap((match) => match[1] ?? []),
  ]);

/** Records that `path` holds `key`, creating the set on first sight. */
const addToIndex = (index: Map<string, Set<string>>, key: string, path: string) => {
  const paths = index.get(key);
  if (paths) paths.add(path);
  else index.set(key, new Set([path]));
};

/** Word matches rather than a reference graph: a same-named local counts, hiding some losses. */
const indexIdentifiers = (tree: SourceTree) => {
  const index = new Map<string, Set<string>>();
  for (const [path, text] of tree) {
    for (const identifier of text.match(/[A-Za-z_$][\w$]*/g) ?? []) {
      addToIndex(index, identifier, path);
    }
  }
  return index;
};

/** Maps each symbol `symbolsIn` finds to the files that declare it. */
const indexDeclarations = (
  tree: SourceTree,
  symbolsIn: (path: string, text: string) => ReadonlySet<string>,
) => {
  const index = new Map<string, Set<string>>();
  for (const [path, text] of tree) {
    for (const symbol of symbolsIn(path, text)) addToIndex(index, symbol, path);
  }
  return index;
};

/** Only callers in files local code edited count, so upstream removing its own code stays quiet. */
export const findLostSymbols = (trees: {
  readonly base: SourceTree;
  readonly local: SourceTree;
  readonly merged: SourceTree;
}): ReadonlyArray<LostSymbol> => {
  const localIdentifiers = indexIdentifiers(trees.local);
  const mergedIdentifiers = indexIdentifiers(trees.merged);
  const mergedExports = indexDeclarations(trees.merged, declaredSymbols);
  const mergedDeclarations = indexDeclarations(trees.merged, anyDeclaredSymbols);
  const lost: Array<LostSymbol> = [];
  for (const [symbol, declaredIn] of indexDeclarations(trees.local, declaredSymbols)) {
    const localCallers = [...(localIdentifiers.get(symbol) ?? [])].filter(
      (path) => !declaredIn.has(path) && trees.base.get(path) !== trees.local.get(path),
    );
    if (localCallers.length === 0) continue;
    const stillDeclared = mergedDeclarations.has(symbol);
    // A call from inside its home file proves nothing: the callers that mattered lived elsewhere.
    const stillCalled = [...(mergedIdentifiers.get(symbol) ?? [])].some(
      (path) => !declaredIn.has(path) && !mergedExports.get(symbol)?.has(path),
    );
    if (stillDeclared && stillCalled) continue;
    lost.push({
      symbol,
      declaredIn: [...declaredIn].join(", "),
      reason: stillDeclared ? "uncalled" : "removed",
      localCallers,
    });
  }
  return lost;
};

/** Reads every source file at `commit` in one batch; sizes are bytes, so parsing stays on the buffer. */
const readTree = (commit: string): SourceTree => {
  const paths = NodeChildProcess.execFileSync(
    "git",
    ["ls-tree", "-r", "-z", "--name-only", commit, "--", ...SOURCE_ROOTS],
    { encoding: "utf8", maxBuffer: MAX_GIT_OUTPUT_BYTES },
  )
    .split("\0")
    .filter((path) => /\.tsx?$/.test(path) && !NON_SOURCE.test(path));
  const blobs = NodeChildProcess.execFileSync("git", ["cat-file", "--batch"], {
    input: paths.map((path) => `${commit}:${path}\n`).join(""),
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
  });
  const tree = new Map<string, string>();
  let offset = 0;
  for (const path of paths) {
    const headerEnd = blobs.indexOf(10, offset);
    const size = Number(blobs.toString("latin1", offset, headerEnd).split(" ")[2]);
    tree.set(path, blobs.toString("utf8", headerEnd + 1, headerEnd + 1 + size));
    offset = headerEnd + 1 + size + 1;
  }
  return tree;
};

if (import.meta.main) {
  const [base, local, merged] = process.argv.slice(2);
  if (!base || !local || !merged) {
    console.error(
      "Usage: node scripts/merge-lost-symbols.ts <merge base> <local before merge> <merged commit>",
    );
    process.exit(2);
  }
  const lost = findLostSymbols({
    base: readTree(base),
    local: readTree(local),
    merged: readTree(merged),
  });
  for (const { symbol, declaredIn, reason, localCallers } of lost) {
    console.log(`${reason}\t${symbol}\t${declaredIn}\t${localCallers.slice(0, 3).join(" ")}`);
  }
  console.log(
    `${lost.length} symbols local code used are gone or uncalled. Restore each one, or confirm the local feature was meant to go.`,
  );
  if (lost.length > 0) process.exitCode = 1;
}
