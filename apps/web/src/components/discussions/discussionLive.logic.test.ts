/** Guards opening positions and real projected item shapes against independent C4 expectations. */
import {
  Discussion,
  DiscussionEntry,
  OrchestrationV2ProjectedTurnItem,
  RunId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Schema from "effect/Schema";
import { expect, it } from "vite-plus/test";
import { discussions as copy } from "~/i18n/locales/zh-CN/discussions";
import {
  discussionLiveAssignment,
  discussionLiveContent,
  discussionLiveStage,
  orderDiscussionEntries,
} from "./discussionLive.logic";
import {
  discussionTranscriptItems,
  discussionStatementHeading,
} from "./discussionTranscript.logic";
const decodeEntry = Schema.decodeUnknownSync(DiscussionEntry);
const decodeProjection = Schema.decodeUnknownSync(OrchestrationV2ProjectedTurnItem);
const runId = RunId.make("current");
const discussion = Schema.decodeUnknownSync(Discussion)({
  id: "d",
  projectId: "p",
  title: "题",
  topic: "议题",
  seats: [
    {
      id: "a",
      personaName: "架构师",
      avatar: "architect",
      personaPrompt: "只读",
      modelSelection: { instanceId: "codex", model: "mini" },
      threadId: "thread",
    },
    {
      id: "b",
      personaName: "反方",
      avatar: "opponent",
      personaPrompt: "只读",
      modelSelection: { instanceId: "claude-code", model: "haiku" },
      threadId: "thread-b",
    },
  ],
  status: "speaking",
  cursor: {
    seatIndex: 0,
    round: 1,
    phase: "regular",
    runId: "current",
    dispatchedEntrySeq: 1,
    dispatchNo: 1,
    briefChars: 0,
    briefSentAsFile: false,
  },
  pause: null,
  closing: null,
  createdBy: "user",
  creationSource: "web",
  createdAt: "2026-10-13T00:00:00.000Z",
  updatedAt: "2026-10-13T00:00:00.000Z",
  endedAt: null,
});
/** Decodes a minimal real entry; user/system do not inherit statement-only attribution. */
function entry(seq: number, kind: DiscussionEntry["kind"], extra: Record<string, unknown> = {}) {
  return decodeEntry({
    id: `e${seq}`,
    discussionId: "d",
    seq,
    kind,
    text: kind === "system" ? "讨论到此" : "文本",
    files: [],
    status: "completed",
    checkpointRef: null,
    createdAt: discussion.createdAt,
    ...(kind === "statement" || kind === "summary"
      ? { seatId: "a", threadId: "thread", round: 1 }
      : {}),
    ...extra,
  });
}
/** Decodes the public projection envelope rather than mocking a raw turn-item array. */
function projected(ordinal: number, type: string, extra: Record<string, unknown> = {}) {
  return decodeProjection({
    position: ordinal,
    visibility: "local",
    sourceThreadId: "thread",
    sourceItemId: `item${ordinal}`,
    item: {
      id: `item${ordinal}`,
      nodeId: null,
      parentItemId: null,
      providerThreadId: null,
      providerTurnId: null,
      nativeItemRef: null,
      title: null,
      startedAt: null,
      completedAt: null,
      threadId: "thread",
      runId: "current",
      ordinal,
      type,
      status: "running",
      createdAt: discussion.createdAt,
      updatedAt: DateTime.makeUnsafe(discussion.createdAt),
      ...extra,
    },
  });
}

it("places opening statements before later interjections and End while preserving reference and AI order", () => {
  const before = entry(1, "user"),
    during = entry(2, "user"),
    boundary = entry(3, "system"),
    ordinary = entry(4, "statement", { dispatchedEntrySeq: 1 }),
    final = entry(5, "statement", { dispatchedEntrySeq: 4, finalStatement: true }),
    summary = entry(6, "summary", { dispatchedEntrySeq: 5 });
  const input = [before, during, boundary, ordinary, final, summary];
  expect(orderDiscussionEntries(input).map((e) => e.id)).toEqual([
    "e1",
    "e4",
    "e2",
    "e3",
    "e5",
    "e6",
  ]);
  expect(orderDiscussionEntries(input)[1]).toBe(ordinary);
  expect(input.map((e) => e.id)).toEqual(["e1", "e2", "e3", "e4", "e5", "e6"]);
  const items = discussionTranscriptItems(
    orderDiscussionEntries(input),
    {
      ...discussion,
      status: "ended",
      closing: {
        summarizerSeatId: discussion.seats[0]!.id,
        summaryPrompt: "总结",
        remainingFinalSeatIds: [],
        phase: "summarizing",
      },
    },
    copy,
  );
  expect(items.map((i) => (i.kind === "entry" ? i.entry.id : i.kind))).toEqual([
    "round",
    "topic",
    "e1",
    "e4",
    "e2",
    "closing",
    "e5",
    "e6",
    "footer",
  ]);
  expect(
    discussionStatementHeading(ordinary, discussion.seats[0], "model", copy, "missing").roundLabel,
  ).toBe("第 1 轮");
});
it("keeps an interjection between interrupted and retried openings and keeps legacy seq order", () => {
  expect(
    orderDiscussionEntries([
      entry(1, "user"),
      entry(2, "statement", { dispatchedEntrySeq: 0, status: "interrupted" }),
      entry(3, "user"),
      entry(4, "statement", { dispatchedEntrySeq: 3 }),
      entry(5, "statement"),
    ]).map((e) => e.seq),
  ).toEqual([2, 1, 3, 4, 5]);
  expect(
    orderDiscussionEntries([entry(3, "statement"), entry(1, "user"), entry(2, "summary")]).map(
      (e) => e.seq,
    ),
  ).toEqual([1, 2, 3]);
});
it.each(["speaking", "closing"] as const)("%s exposes the active assignment", (status) =>
  expect(discussionLiveAssignment({ ...discussion, status }, [])).toEqual({
    runId,
    seatIndex: 0,
    round: 1,
    phase: "regular",
    dispatchedEntrySeq: 1,
  }),
);
it.each(["paused", "ended"] as const)("%s has no live assignment", (status) =>
  expect(discussionLiveAssignment({ ...discussion, status }, [])).toBeNull(),
);
it("suppresses missing runs and a run already recorded", () => {
  expect(
    discussionLiveAssignment({ ...discussion, cursor: { ...discussion.cursor, runId: null } }, []),
  ).toBeNull();
  expect(
    discussionLiveAssignment(discussion, [entry(3, "statement", { runId: "current" })]),
  ).toBeNull();
});
it.each([
  { phase: "regular" as const, roundLabel: "第 3 轮", turnBadge: null },
  { phase: "final_round" as const, roundLabel: null, turnBadge: "最后陈述" },
  { phase: "summarizing" as const, roundLabel: null, turnBadge: "梳理" },
  { phase: undefined, roundLabel: "第 3 轮", turnBadge: null },
])("stage $phase", ({ phase, roundLabel, turnBadge }) =>
  expect(discussionLiveStage(phase, 3, copy)).toEqual({ roundLabel, turnBadge }),
);
it("joins only current assistant messages by ordinal and reports streaming", () => {
  const messages = [
    projected(3, "assistant_message", { messageId: "m3", text: "第二段", streaming: true }),
    projected(1, "assistant_message", { messageId: "m1", text: "第一段", streaming: false }),
    projected(2, "reasoning", { text: "忽略推理", streaming: true }),
    projected(4, "assistant_message", {
      runId: "old",
      messageId: "m4",
      text: "旧运行",
      streaming: true,
    }),
  ];
  expect(discussionLiveContent(messages, runId)).toEqual({
    text: "第一段\n\n第二段",
    isStreaming: true,
    files: [],
    command: null,
  });
  expect(discussionLiveContent([messages[1]!], runId).isStreaming).toBe(false);
});
it("aggregates same-name changes and zero defaults without including other runs", () => {
  expect(
    discussionLiveContent(
      [
        projected(1, "file_change", { fileName: "a.ts", additions: 3 }),
        projected(2, "file_change", { fileName: "a.ts", deletions: 2 }),
        projected(3, "file_change", { fileName: "b.ts" }),
        projected(4, "file_change", { runId: "old", fileName: "ignored", additions: 99 }),
      ],
      runId,
    ).files,
  ).toEqual([
    { path: "a.ts", additions: 3, deletions: 2 },
    { path: "b.ts", additions: 0, deletions: 0 },
  ]);
  expect(discussionLiveContent([], runId).files).toEqual([]);
});
it("selects the last running command by ordinal and excludes other runs and completed commands", () => {
  expect(
    discussionLiveContent(
      [
        projected(3, "command_execution", { input: "last" }),
        projected(1, "command_execution", { input: "first" }),
        projected(5, "command_execution", { input: "done", status: "completed" }),
        projected(6, "command_execution", { input: "other", runId: "old" }),
      ],
      runId,
    ).command,
  ).toBe("last");
  expect(
    discussionLiveContent(
      [projected(5, "command_execution", { input: "done", status: "completed" })],
      runId,
    ).command,
  ).toBeNull();
});

it("keeps a live opening and its completed replacement before intervening records and before next", () => {
  const input = [entry(1, "user"), entry(2, "user"), entry(3, "system")];
  const live = discussionTranscriptItems(orderDiscussionEntries(input), discussion, copy);
  expect(live.map((i) => (i.kind === "entry" ? i.entry.id : i.kind))).toEqual([
    "round",
    "topic",
    "e1",
    "live",
    "e2",
    "closing",
    "next",
  ]);
  const complete = entry(4, "statement", { runId: "current", dispatchedEntrySeq: 1 });
  const recorded = discussionTranscriptItems(
    orderDiscussionEntries([...input, complete]),
    discussion,
    copy,
  );
  expect(recorded.map((i) => (i.kind === "entry" ? i.entry.id : i.kind))).toEqual([
    "round",
    "topic",
    "e1",
    "e4",
    "e2",
    "closing",
    "next",
  ]);
});
it("computes live round boundaries after earlier interruptions and suppresses them after closing", () => {
  const snapshot = {
    ...discussion,
    cursor: { ...discussion.cursor, round: 2, dispatchedEntrySeq: 2 },
  };
  expect(
    discussionTranscriptItems(
      orderDiscussionEntries([entry(1, "statement", { dispatchedEntrySeq: 0 }), entry(2, "user")]),
      snapshot,
      copy,
    ).map((i) => (i.kind === "round" ? `round${i.round}` : i.kind)),
  ).toEqual(["round1", "topic", "entry", "entry", "round2", "live", "next"]);
  const final = {
    ...snapshot,
    status: "closing" as const,
    cursor: { ...snapshot.cursor, phase: "final_round" as const },
    closing: {
      summarizerSeatId: discussion.seats[0]!.id,
      summaryPrompt: "总结",
      remainingFinalSeatIds: [discussion.seats[0]!.id, discussion.seats[1]!.id],
      phase: "final_round" as const,
    },
  };
  expect(
    discussionTranscriptItems(orderDiscussionEntries([entry(1, "system")]), final, copy).map(
      (i) => i.kind,
    ),
  ).toEqual(["round", "topic", "closing", "live", "next"]);
});
