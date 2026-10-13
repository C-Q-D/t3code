/** Verifies C2 record ordering and presentation against explicit requirements, without static markup tests. */
import {
  DiscussionEntry,
  DiscussionSeat,
  ProviderInstanceId,
  ProviderDriverKind,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";
import { discussions as copy } from "~/i18n/locales/zh-CN/discussions";
import { discussionModelLabel } from "./discussionModelLabel";
import {
  discussionFilesSummary,
  discussionStatementHeading,
  discussionTranscriptItems,
} from "./discussionTranscript.logic";

const decodeEntryId = Schema.decodeSync(DiscussionEntry.fields.id);
const seat = Schema.decodeSync(DiscussionSeat)({
  id: "a",
  personaName: "架构师",
  personaPrompt: "结构",
  avatar: "architect",
  modelSelection: { instanceId: "claude-personal", model: "claude-opus" },
  threadId: "seat-thread",
});
const base = Schema.decodeSync(DiscussionEntry)({
  id: "entry",
  discussionId: "discussion",
  seq: 1,
  kind: "statement",
  seatId: "a",
  threadId: "entry-thread",
  round: 1,
  text: "正文",
  files: [],
  status: "completed",
  checkpointRef: null,
  createdAt: "2026-10-13T00:00:00.000Z",
});
const topic: DiscussionEntry = { ...base, kind: "user", id: decodeEntryId("topic") };
const interruption: DiscussionEntry = { ...topic, id: decodeEntryId("interruption"), seq: 3 };

describe("discussion transcript ordering", () => {
  it.each([
    {
      name: "initial divider even before statements",
      entries: [topic],
      expected: ["round:1", "topic"],
    },
    {
      name: "same round has no second divider",
      entries: [topic, base, { ...base, id: decodeEntryId("second"), seq: 3 }],
      expected: ["round:1", "topic", "entry", "second"],
    },
    {
      name: "interruption remains above the next round",
      entries: [
        topic,
        base,
        interruption,
        { ...base, id: decodeEntryId("next-round"), seq: 4, round: 2 },
      ],
      expected: ["round:1", "topic", "entry", "interruption", "round:2", "next-round"],
    },
    {
      name: "only increasing rounds separate",
      entries: [
        base,
        { ...base, id: decodeEntryId("later"), seq: 2, round: 3 },
        { ...base, id: decodeEntryId("older"), seq: 3, round: 2 },
      ],
      expected: ["round:1", "entry", "round:3", "later", "older"],
    },
    {
      name: "system and summary do not leak into C2",
      entries: [topic, { ...base, kind: "system" }, { ...base, kind: "summary" }, base],
      expected: ["round:1", "topic", "entry"],
    },
  ] satisfies { name: string; entries: DiscussionEntry[]; expected: string[] }[])(
    "$name",
    ({ entries, expected }) => {
      const items = discussionTranscriptItems(entries);
      expect(
        items.map((item) => (item.kind === "round" ? `round:${item.round}` : item.entry.id)),
      ).toEqual(expected);
      expect(items.filter((item) => item.kind === "entry").map((item) => item.entry)).toEqual(
        entries.filter((entry) => entry.kind === "user" || entry.kind === "statement"),
      );
      expect(items.find((item) => item.kind === "entry")?.entry).toBe(
        entries.find((entry) => entry.kind === "user" || entry.kind === "statement"),
      );
    },
  );
});

describe("statement headings", () => {
  it.each([
    { status: "completed", statusLabel: null, badgeVariant: null },
    { status: "interrupted", statusLabel: "已中止", badgeVariant: "warning" },
    { status: "failed", statusLabel: "发言失败", badgeVariant: "error" },
  ] as const)(
    "$status attributes the entry and shows the required status",
    ({ status, statusLabel, badgeVariant }) => {
      expect(
        discussionStatementHeading(
          { ...base, round: 4, status },
          seat,
          "Claude 私人 · Opus",
          copy,
          "已删除的身份",
        ),
      ).toEqual({
        personaName: "架构师",
        modelLabel: "Claude 私人 · Opus",
        roundLabel: "第 4 轮",
        threadId: "entry-thread",
        statusLabel,
        badgeVariant,
      });
    },
  );
  it("uses the seat thread when the entry has no thread", () => {
    const { threadId: _threadId, ...entry } = base;
    expect(
      discussionStatementHeading(entry, seat, "Claude · Opus", copy, "已删除的身份").threadId,
    ).toBe("seat-thread");
  });
  it("omits unavailable round and thread instead of linking to the current seat", () => {
    const { threadId: _threadId, round: _round, ...entry } = base;
    expect(
      discussionStatementHeading(entry, undefined, "unknown · raw-model", copy, "已删除的身份"),
    ).toEqual({
      personaName: "已删除的身份",
      modelLabel: "unknown · raw-model",
      roundLabel: null,
      threadId: null,
      statusLabel: null,
      badgeVariant: null,
    });
  });
});

describe("checkpoint statistics", () => {
  it.each([
    { files: [], expected: { kind: "empty", label: "未改文件" } },
    { files: null, expected: { kind: "pending", label: "改动统计暂不可用" } },
    {
      files: [
        { path: "first.ts", additions: 38, deletions: 2 },
        { path: "second.ts", additions: 4, deletions: 7 },
        { path: "test.ts", additions: 0, deletions: 0 },
      ],
      expected: { kind: "files", label: "改动 3 个文件", count: 3, additions: 42, deletions: 9 },
    },
  ] satisfies { files: DiscussionEntry["files"]; expected: object }[])(
    "distinguishes $expected.kind",
    ({ files, expected }) => {
      expect(discussionFilesSummary(files, copy)).toEqual(expected);
    },
  );
});

describe("shared discussion model label", () => {
  const selection = { instanceId: ProviderInstanceId.make("personal"), model: "raw-model" };
  it.each([
    {
      name: "configured instance uses display name and short model name",
      instance: { displayName: "My Codex", driverKind: ProviderDriverKind.make("codex") },
      model: { slug: "raw-model", name: "Full name", shortName: "Short name" },
      expected: "My Codex · Short name",
    },
    {
      name: "Claude driver strips Claude qualifier",
      instance: { displayName: "Claude 私人", driverKind: ProviderDriverKind.make("claudeAgent") },
      model: { slug: "raw-model", name: "Claude Opus 5.5" },
      expected: "Claude 私人 · Opus 5.5",
    },
    {
      name: "missing instance falls back to ID while retaining model qualifier",
      instance: undefined,
      model: { slug: "raw-model", name: "Codex Model X", subProvider: "Codex" },
      expected: "personal · Model X",
    },
    {
      name: "unlisted model retains stored slug",
      instance: { displayName: "My Codex", driverKind: ProviderDriverKind.make("codex") },
      model: undefined,
      expected: "My Codex · raw-model",
    },
    {
      name: "both missing retain stored identities",
      instance: undefined,
      model: undefined,
      expected: "personal · raw-model",
    },
  ] as const)("$name", ({ instance, model, expected }) => {
    expect(discussionModelLabel(selection, instance, model)).toBe(expected);
  });
});
