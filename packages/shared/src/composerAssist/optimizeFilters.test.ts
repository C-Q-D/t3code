/** Protects draft preservation, independent length limits, and wrapper removal. */
import { expect, it } from "vite-plus/test";
import { checkOptimizedPrompt, stripOptimizeWrapping } from "./optimizeFilters.ts";

it.each([
  ["empty", "<prompt> </prompt>", "fix it"],
  ["unchanged", " fix   it ", "fix it"],
  ["too_long", "x".repeat(2001), "fix it"],
  ["too_long", "x".repeat(3001), "a".repeat(1000)],
  ["references_dropped", "fix the module", "fix @file.ts"],
  ["references_dropped", "fix the module", "fix `myFunction()`"],
  ["references_dropped", "fix the module", "fix /src/module.ts"],
  ["references_dropped", "fix the module", "fix C:\\src\\module.ts"],
  ["references_dropped", "fix the module", "fix [module](t3-context://v1/file/file_1)"],
])("rejects %s for %j", (reason, raw, draft) => {
  expect(checkOptimizedPrompt(raw, draft)).toBe(reason);
});

it.each([
  ["at reference", "fix @file.ts", "fix @file.ts and test it"],
  ["inline code", "fix `myFunction()`", "fix `myFunction()` and test it"],
  ["POSIX path", "fix /src/module.ts", "fix /src/module.ts and test it"],
  ["Windows path", "fix C:\\src\\module.ts", "fix C:\\src\\module.ts and test it"],
  [
    "context link",
    "fix [module](t3-context://v1/file/file_1)",
    "fix [module](t3-context://v1/file/file_1) and test it",
  ],
  ["2000-character boundary", "fix it", "x".repeat(2000)],
  ["three-times-draft boundary", "a".repeat(1000), "x".repeat(3000)],
])("accepts preserved target or exact limit: %s", (_case, draft, raw) => {
  expect(checkOptimizedPrompt(raw, draft)).toBeNull();
});

it.each([
  ["<prompt>fix it and test it</prompt>", "fix it and test it"],
  ["Rewritten prompt: fix it and test it", "fix it and test it"],
  ["```text\nfix it and test it\n```", "fix it and test it"],
  ["use `code` now", "use `code` now"],
])("unwraps %j without removing inline code", (raw, expected) => {
  expect(stripOptimizeWrapping(raw)).toBe(expected);
});

it.each([
  ["修复 @文件.ts", "修复模块并添加测试"],
  ["fix @file.ts", "fix @file.tsx and test"],
  ["fix /src/a.ts", "fix /src/a.tsx and test"],
  ['fix "C:\\My Project\\a.ts"', "fix C:\\My Project\\b.ts and test"],
])("rejects a missing or changed target in %j", (draft, raw) => {
  expect(checkOptimizedPrompt(raw, draft)).toBe("references_dropped");
});

it.each([
  ["fix @file.ts", "修复 @file.ts，并添加测试"],
  ["run `cmd`", "运行 `cmd`。然后检查结果"],
  ["fix @文件.ts", "修复 @文件.ts, then test"],
  ['fix "C:\\My Project\\a.ts"', "fix 'C:\\My Project\\a.ts' and test"],
  ['fix "C:\\My Project\\a.ts"', "fix C:\\My Project\\a.ts and test"],
  ["fix '/my project/a.ts'", 'fix "/my project/a.ts" and test'],
])("accepts punctuation and equivalent path quoting in %j", (draft, raw) => {
  expect(checkOptimizedPrompt(raw, draft)).toBeNull();
});

it.each([
  ["fix /src/a.ts: add tests", "Please fix /src/a.ts and add regression tests"],
  ["fix **/src/a.ts**", "Please fix /src/a.ts and add regression tests"],
  ["run `cmd`", "执行`cmd`并检查结果"],
  ["fix _/src/a.ts_", "Please fix /src/a.ts and test"],
  ["fix ~~/src/a.ts~~", "Please fix /src/a.ts and test"],
  ["fix [/src/a.ts]", "Please fix (/src/a.ts) and test"],
  ["fix @file.ts:", "Please fix @file.ts and test"],
])("preserves targets through prose wrappers: %j", (draft, raw) => {
  expect(checkOptimizedPrompt(raw, draft)).toBeNull();
});

it.each([
  ["fix /src/a.ts", "Please fix /src/a.tsx and test"],
  ["fix **/src/a.ts**", "Please fix /src/b.ts and test"],
  ["fix _/src/a.ts_", "Please fix /src/b.ts and test"],
])("still rejects changed wrapped targets: %j", (draft, raw) => {
  expect(checkOptimizedPrompt(raw, draft)).toBe("references_dropped");
});
