/** Covers which merge outcomes count as a lost symbol, using in-memory source trees. */
import { describe, expect, it } from "vite-plus/test";

import { findLostSymbols } from "./merge-lost-symbols.ts";

const declaration = "export const composerWidth = 1;\n";
const callerAtBase = "import { composerWidth } from './width';\ncomposerWidth;\n";
const callerAtLocal = `${callerAtBase}localTweak();\n`;

/** Builds a source tree from a path-to-text record. */
const tree = (files: Record<string, string>) => new Map(Object.entries(files));

/** Keeps only the fields a case asserts on, so caller lists stay out of the expectations. */
const lostNames = (input: Parameters<typeof findLostSymbols>[0]) =>
  findLostSymbols(input).map(({ symbol, reason }) => ({ symbol, reason }));

describe("findLostSymbols", () => {
  it("reports a symbol the merge removed while a locally edited file used it", () => {
    const lost = findLostSymbols({
      base: tree({ "width.ts": declaration, "composer.tsx": callerAtBase }),
      local: tree({ "width.ts": declaration, "composer.tsx": callerAtLocal }),
      merged: tree({ "composer.tsx": "localTweak();\n" }),
    });

    expect(lost).toEqual([
      {
        symbol: "composerWidth",
        declaredIn: "width.ts",
        reason: "removed",
        localCallers: ["composer.tsx"],
      },
    ]);
  });

  it("reports a symbol that survives but lost its last caller", () => {
    expect(
      lostNames({
        base: tree({ "width.ts": declaration, "composer.tsx": callerAtBase }),
        local: tree({ "width.ts": declaration, "composer.tsx": callerAtLocal }),
        merged: tree({ "width.ts": declaration, "composer.tsx": "localTweak();\n" }),
      }),
    ).toEqual([{ symbol: "composerWidth", reason: "uncalled" }]);
  });

  it("treats a symbol only its home file still uses as uncalled", () => {
    expect(
      lostNames({
        base: tree({ "width.ts": declaration, "composer.tsx": callerAtBase }),
        local: tree({ "width.ts": declaration, "composer.tsx": callerAtLocal }),
        merged: tree({
          "width.ts": "const composerWidth = 1;\nrender(composerWidth);\n",
          "composer.tsx": "localTweak();\n",
        }),
      }),
    ).toEqual([{ symbol: "composerWidth", reason: "uncalled" }]);
  });

  it("reports a contracts schema field the same way", () => {
    const contract =
      "export const Settings = Schema.Struct({\n  collapseOnScroll: Schema.Boolean,\n});\n";
    const reader = "settings.collapseOnScroll;\n";

    expect(
      lostNames({
        base: tree({ "packages/contracts/src/settings.ts": contract, "composer.tsx": reader }),
        local: tree({
          "packages/contracts/src/settings.ts": contract,
          "composer.tsx": `${reader}localTweak();\n`,
        }),
        merged: tree({
          "packages/contracts/src/settings.ts": "export const Settings = Schema.Struct({});\n",
          "composer.tsx": `${reader}localTweak();\n`,
        }),
      }),
    ).toContainEqual({ symbol: "collapseOnScroll", reason: "removed" });
  });

  it("ignores a removal whose callers local code never touched", () => {
    expect(
      lostNames({
        base: tree({ "width.ts": declaration, "composer.tsx": callerAtBase }),
        local: tree({ "width.ts": declaration, "composer.tsx": callerAtBase }),
        merged: tree({ "composer.tsx": "" }),
      }),
    ).toEqual([]);
  });

  it.each([
    ["moved it to another file", declaration],
    ["stopped exporting it", "const composerWidth = 1;\n"],
  ])("ignores a symbol the merge only %s", (_name, mergedDeclaration) => {
    expect(
      lostNames({
        base: tree({ "width.ts": declaration, "composer.tsx": callerAtBase }),
        local: tree({ "width.ts": declaration, "composer.tsx": callerAtLocal }),
        merged: tree({ "layout.ts": mergedDeclaration, "composer.tsx": callerAtLocal }),
      }),
    ).toEqual([]);
  });
});
