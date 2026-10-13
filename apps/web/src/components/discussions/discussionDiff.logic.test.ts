/** Protects statement scope, independent titles and diff outcome distinctions. */
import { DiscussionEntryDiffResult } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { describe, it, expect } from "vite-plus/test";
import { discussions as zh } from "~/i18n/locales/zh-CN/discussions";
import { discussions as en } from "~/i18n/locales/en/discussions";
import { getRenderablePatch } from "~/lib/diffRendering";
import {
  discussionDiffContent,
  discussionDiffKey,
  discussionDiffTitle,
  discussionFilesCanOpen,
} from "./discussionDiff.logic";

const patch = "diff --git a/new.ts b/new.ts\n--- a/new.ts\n+++ b/new.ts\n@@ -1 +1 @@\n-old\n+new\n";
const rename =
  "diff --git a/old.ts b/new.ts\nsimilarity index 50%\nrename from old.ts\nrename to new.ts\n--- a/old.ts\n+++ b/new.ts\n@@ -1 +1 @@\n-old\n+new\n";
const data = Schema.decodeSync(DiscussionEntryDiffResult)({
  discussionId: "discussion",
  entryId: "entry",
  diff: patch,
});
const success = { data, isSuccess: true, error: null };

describe("discussion diff titles", () => {
  it.each([
    { entry: { kind: "statement" as const, round: 2 }, copy: zh, expected: "架构师 · 第 2 轮" },
    { entry: { kind: "statement" as const }, copy: zh, expected: "架构师" },
    {
      entry: { kind: "statement" as const, round: 2, finalStatement: true as const },
      copy: zh,
      expected: "架构师 · 最后陈述",
    },
    { entry: { kind: "summary" as const, round: 2 }, copy: zh, expected: "架构师 · 梳理" },
    { entry: { kind: "statement" as const, round: 2 }, copy: en, expected: "架构师 · Round 2" },
    { entry: { kind: "statement" as const }, copy: en, expected: "架构师" },
    {
      entry: { kind: "statement" as const, finalStatement: true as const },
      copy: en,
      expected: "架构师 · Final statements",
    },
    { entry: { kind: "summary" as const }, copy: en, expected: "架构师 · Summary" },
  ])("$expected", ({ entry, copy, expected }) =>
    expect(discussionDiffTitle(entry, "架构师", copy)).toBe(expected),
  );
});

describe("discussion diff content", () => {
  it("loads before any current success", () =>
    expect(
      discussionDiffContent(
        "discussion",
        "entry",
        { data: null, isSuccess: false, error: null },
        null,
        "new.ts",
        zh,
      ),
    ).toEqual({ kind: "loading", label: "正在读取这次发言的改动…" }));
  it.each([
    { message: "连接失败。", expected: "读取这次发言的改动失败：连接失败。" },
    { message: "连接失败.", expected: "读取这次发言的改动失败：连接失败。" },
    { message: "连接失败", expected: "读取这次发言的改动失败：连接失败。" },
    { message: "", expected: "读取这次发言的改动失败。" },
  ])("request failure: $message", ({ message, expected }) =>
    expect(
      discussionDiffContent(
        "discussion",
        "entry",
        { ...success, isSuccess: false, error: message },
        getRenderablePatch(patch),
        "new.ts",
        zh,
      ),
    ).toEqual({ kind: "error", label: expected }),
  );
  it("keeps a successful blank patch distinct from failure", () =>
    expect(
      discussionDiffContent("discussion", "entry", success, getRenderablePatch("  "), "new.ts", zh),
    ).toEqual({ kind: "empty", label: "这次发言没有可显示的改动。" }));
  it("preserves a parser failure's reason and raw text", () =>
    expect(
      discussionDiffContent(
        "discussion",
        "entry",
        success,
        { kind: "raw", reason: "不支持的格式", text: "raw patch" },
        "new.ts",
        zh,
      ),
    ).toEqual({ kind: "raw", reason: "不支持的格式", text: "raw patch" }));
  it("finds the current filename", () =>
    expect(
      discussionDiffContent(
        "discussion",
        "entry",
        success,
        getRenderablePatch(patch),
        "new.ts",
        zh,
      ),
    ).toMatchObject({ kind: "files", selectedIndex: 0, notice: null }));
  it("finds a renamed file by its previous name", () =>
    expect(
      discussionDiffContent(
        "discussion",
        "entry",
        success,
        getRenderablePatch(rename),
        "old.ts",
        zh,
      ),
    ).toMatchObject({ kind: "files", selectedIndex: 0, notice: null }));
  it("shows all files when the selected path is missing", () =>
    expect(
      discussionDiffContent(
        "discussion",
        "entry",
        success,
        getRenderablePatch(patch),
        "missing.ts",
        zh,
      ),
    ).toMatchObject({
      kind: "files",
      selectedIndex: -1,
      notice: "没有找到 missing.ts 的改动，下面是这次发言的全部改动。",
    }));
  it("rejects the prior entry's successful patch", () =>
    expect(
      discussionDiffContent(
        "discussion",
        "other-entry",
        success,
        getRenderablePatch(patch),
        "new.ts",
        zh,
      ),
    ).toEqual({ kind: "loading", label: "正在读取这次发言的改动…" }));
  it("isolates mounted queries for each destination", () => {
    expect(discussionDiffKey("env", "discussion", "entry")).toBe('["env","discussion","entry"]');
    expect(discussionDiffKey("env", "discussion", "other-entry")).not.toBe(
      discussionDiffKey("env", "discussion", "entry"),
    );
    expect(discussionDiffKey("other-env", "discussion", "entry")).not.toBe(
      discussionDiffKey("env", "discussion", "entry"),
    );
    expect(discussionDiffKey("env", "other-discussion", "entry")).not.toBe(
      discussionDiffKey("env", "discussion", "entry"),
    );
  });
});

describe("file row availability", () => {
  it.each([
    { id: "entry", files: [{ path: "new.ts", additions: 1, deletions: 1 }], expected: true },
    { id: "entry", files: null, expected: false },
    { id: "entry", files: [], expected: false },
    { id: null, files: [{ path: "new.ts", additions: 1, deletions: 1 }], expected: false },
  ])("$id / $files", ({ id, files, expected }) =>
    expect(discussionFilesCanOpen(id, files)).toBe(expected),
  );
});
