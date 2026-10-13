/** Verifies C2 record ordering and presentation against explicit requirements, without static markup tests. */
import {
  DiscussionEntry,
  DiscussionSeat,
  Discussion,
  ProviderInstanceId,
  ProviderDriverKind,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";
import { discussions as copy } from "~/i18n/locales/zh-CN/discussions";
import { discussionModelLabel } from "./discussionModelLabel";
import { discussionSeatStrip } from "./discussionPage.logic";
import {
  discussionFilesSummary,
  discussionStatementHeading,
  discussionTranscriptItems,
  discussionUserView,
  discussionEntryFiles,
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
const discussion = Schema.decodeSync(Discussion)({
  id: "discussion",
  projectId: "project",
  title: "议题",
  topic: "议题",
  seats: [
    seat,
    { ...seat, id: "b", personaName: "反方", avatar: "opponent", threadId: "b-thread" },
  ],
  status: "speaking",
  cursor: {
    seatIndex: 0,
    round: 1,
    phase: "regular",
    dispatchNo: 0,
    runId: null,
    dispatchedEntrySeq: 0,
    briefChars: 0,
    briefSentAsFile: false,
  },
  pause: null,
  closing: null,
  createdBy: "user",
  creationSource: "web",
  createdAt: base.createdAt,
  updatedAt: base.createdAt,
  endedAt: null,
});
const closing = {
  summarizerSeatId: seat.id,
  summaryPrompt: "梳理",
  remainingFinalSeatIds: [seat.id, discussion.seats[1]!.id],
  phase: "final_round" as const,
};
const marker: DiscussionEntry = {
  ...base,
  id: decodeEntryId("end"),
  kind: "system",
  text: "讨论到此",
};

/** Identifies grouping order without deriving any expected text or seat state. */
function itemKey(item: ReturnType<typeof discussionTranscriptItems>[number]) {
  return item.kind === "round"
    ? `round:${item.round}`
    : item.kind === "entry"
      ? item.entry.id
      : item.kind === "next"
        ? `next:${item.seatIndex}`
        : `${item.kind}:${item.label}`;
}

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
      name: "unrelated system is hidden and summary is retained",
      entries: [
        topic,
        { ...base, kind: "system" },
        { ...base, id: decodeEntryId("summary"), kind: "summary" },
        base,
      ],
      expected: ["round:1", "topic", "summary", "entry"],
    },
  ] satisfies { name: string; entries: DiscussionEntry[]; expected: string[] }[])(
    "$name",
    ({ entries, expected }) => {
      const items = discussionTranscriptItems(entries, discussion, copy);
      expect(items.map(itemKey)).toEqual([...expected, "next:1"]);
      expect(items.filter((item) => item.kind === "entry").map((item) => item.entry)).toEqual(
        entries.filter((entry) => entry.kind !== "system"),
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
        turnBadge: null,
        avatarState: "idle",
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
      turnBadge: null,
      avatarState: "idle",
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

describe("C3 receipt and closing presentation", () => {
  it.each([
    {
      name: "topic has no receipt",
      entry: topic,
      topic: true,
      snapshot: discussion,
      expected: { label: null, seatIndex: null, avatarState: "idle", read: true },
    },
    {
      name: "read receipt",
      entry: { ...interruption, readBySeatId: seat.id },
      topic: false,
      snapshot: discussion,
      expected: { label: "插话 · 架构师已读到", seatIndex: 0, avatarState: "idle", read: true },
    },
    {
      name: "speaking unread",
      entry: interruption,
      topic: false,
      snapshot: discussion,
      expected: { label: "插话 · 反方开口时读到", seatIndex: 1, avatarState: "next", read: false },
    },
    {
      name: "last seat wraps",
      entry: interruption,
      topic: false,
      snapshot: { ...discussion, cursor: { ...discussion.cursor, seatIndex: 1 } },
      expected: {
        label: "插话 · 架构师开口时读到",
        seatIndex: 0,
        avatarState: "next",
        read: false,
      },
    },
    {
      name: "paused retries",
      entry: interruption,
      topic: false,
      snapshot: { ...discussion, status: "paused" as const },
      expected: {
        label: "插话 · 架构师重新开口时读到",
        seatIndex: 0,
        avatarState: "next",
        read: false,
      },
    },
    {
      name: "closing goes to next final seat",
      entry: interruption,
      topic: false,
      snapshot: {
        ...discussion,
        status: "closing" as const,
        cursor: { ...discussion.cursor, phase: "final_round" as const },
        closing,
      },
      expected: { label: "插话 · 反方开口时读到", seatIndex: 1, avatarState: "next", read: false },
    },
    {
      name: "ended unread has no avatar",
      entry: interruption,
      topic: false,
      snapshot: { ...discussion, status: "ended" as const },
      expected: { label: "插话", seatIndex: null, avatarState: "idle", read: false },
    },
  ])("$name", ({ entry, topic: isTopic, snapshot, expected }) => {
    expect(discussionUserView(entry, isTopic, snapshot, copy)).toEqual(expected);
    if (!isTopic && !entry.readBySeatId && snapshot.status !== "ended") {
      expect(discussionUserView(entry, isTopic, snapshot, copy).seatIndex).toBe(
        discussionSeatStrip(snapshot).find(
          (item): item is Extract<typeof item, { kind: "seat" }> =>
            item.kind === "seat" && item.tags.includes("next"),
        )?.index,
      );
    }
  });

  it.each([
    { status: "speaking" as const, label: "开口时读到上面 1 条插话", index: 1 },
    { status: "paused" as const, label: "重新开口时读到上面 1 条插话", index: 0 },
    { status: "closing" as const, label: "开口时读到上面 1 条插话", index: 1 },
  ])("$status next counts only unread interjections", ({ status, label, index }) => {
    const snapshot = {
      ...discussion,
      status,
      ...(status === "closing"
        ? { closing, cursor: { ...discussion.cursor, phase: "final_round" as const } }
        : {}),
    };
    const items = discussionTranscriptItems(
      [
        topic,
        { ...interruption, readBySeatId: seat.id },
        { ...interruption, id: decodeEntryId("unread") },
      ],
      snapshot,
      copy,
    );
    expect(items.at(-1)).toEqual({ kind: "next", seatIndex: index, label, round: null });
  });
  it("zero unread next has no text and no same-round divider", () => {
    expect(discussionTranscriptItems([topic, base], discussion, copy).map(itemKey)).toEqual([
      "round:1",
      "topic",
      "entry",
      "next:1",
    ]);
    expect(discussionTranscriptItems([topic], discussion, copy).at(-1)).toEqual({
      kind: "next",
      seatIndex: 1,
      label: null,
      round: null,
    });
  });
  it("wrap divider remains below interjections and directly above next", () => {
    const snapshot = { ...discussion, cursor: { ...discussion.cursor, seatIndex: 1 } };
    expect(
      discussionTranscriptItems([topic, base, interruption], snapshot, copy).map(itemKey),
    ).toEqual(["round:1", "topic", "entry", "interruption", "round:2", "next:0"]);
  });
  it("closing marker suppresses later round dividers including placeholder wraps", () => {
    const snapshot = {
      ...discussion,
      status: "paused" as const,
      closing: { ...closing, remainingFinalSeatIds: [discussion.seats[1]!.id, seat.id] },
      cursor: { ...discussion.cursor, seatIndex: 1, phase: "final_round" as const },
    };
    const later = { ...base, id: decodeEntryId("late-ordinary"), round: 3 };
    expect(
      discussionTranscriptItems([topic, base, marker, interruption, later], snapshot, copy).map(
        itemKey,
      ),
    ).toEqual([
      "round:1",
      "topic",
      "entry",
      "closing:讨论到此 · 梳理人：架构师",
      "interruption",
      "late-ordinary",
      "next:1",
    ]);
  });
  it("missing summarizer uses a plain closing marker and hides other systems", () => {
    expect(
      discussionTranscriptItems(
        [{ ...marker, text: "其他通知" }, marker],
        { ...discussion, closing: null },
        copy,
      ).map(itemKey),
    ).toEqual(["round:1", "closing:讨论到此", "next:1"]);
  });
  it("final attribution overrides round and retains interrupted status", () => {
    expect(
      discussionStatementHeading(
        { ...base, finalStatement: true, status: "interrupted", round: 4 },
        seat,
        "Claude · Opus",
        copy,
        "已删除的身份",
      ),
    ).toEqual({
      personaName: "架构师",
      modelLabel: "Claude · Opus",
      roundLabel: null,
      turnBadge: "最后陈述",
      avatarState: "idle",
      threadId: "entry-thread",
      statusLabel: "已中止",
      badgeVariant: "warning",
    });
    expect(
      discussionStatementHeading(base, seat, "Claude · Opus", copy, "已删除的身份").roundLabel,
    ).toBe("第 1 轮");
  });
  it.each([
    { files: [] },
    { files: null },
    { files: [{ path: "summary.ts", additions: 7, deletions: 2 }] },
  ])("summary statistics for $files", ({ files }) => {
    const entry = { ...base, kind: "summary" as const, files };
    expect(discussionStatementHeading(entry, seat, "Claude · Opus", copy, "已删除的身份")).toEqual({
      personaName: "架构师",
      modelLabel: "Claude · Opus",
      roundLabel: null,
      turnBadge: "梳理",
      avatarState: "done",
      threadId: "entry-thread",
      statusLabel: null,
      badgeVariant: null,
    });
    expect(discussionEntryFiles(entry, copy)).toEqual(
      files?.length
        ? { kind: "files", label: "改动 1 个文件", count: 1, additions: 7, deletions: 2 }
        : null,
    );
  });
  it("ended footer follows the summary without a next placeholder", () => {
    const summary = { ...base, kind: "summary" as const, id: decodeEntryId("summary") };
    expect(
      discussionTranscriptItems(
        [topic, marker, summary],
        { ...discussion, status: "ended", closing },
        copy,
      ).map(itemKey),
    ).toEqual([
      "round:1",
      "topic",
      "closing:讨论到此 · 梳理人：架构师",
      "summary",
      "footer:讨论已结束，记录保留。要接着讨论，请新建一场。",
    ]);
  });
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
