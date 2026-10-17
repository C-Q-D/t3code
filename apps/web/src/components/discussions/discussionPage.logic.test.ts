/** Guards C1's independently specified routing, header and ordered seat presentation contracts. */
import {
  Discussion,
  DiscussionEntry,
  DiscussionId,
  DiscussionSeatId,
  EnvironmentId,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";
import { discussions as copy } from "~/i18n/locales/zh-CN/discussions";
import {
  discussionHeaderView,
  discussionRouteState,
  discussionSeatStrip,
  discussionTableSeats,
  discussionTableView,
} from "./discussionPage.logic";
import { discussionTableConnections } from "./discussionRoundTable.logic";

const decodeEnvironmentId = Schema.decodeOption(EnvironmentId);
const decodeDiscussionId = Schema.decodeOption(DiscussionId);
const decodeSeatId = Schema.decodeSync(DiscussionSeatId);
const decodeEntryId = Schema.decodeSync(DiscussionEntry.fields.id);
const decodeEntry = Schema.decodeSync(DiscussionEntry);

const base = Schema.decodeSync(Discussion)({
  id: "discussion",
  projectId: "project",
  title: "讨论",
  topic: "议题",
  seats: [
    {
      id: "a",
      personaName: "架构师",
      personaPrompt: "结构",
      avatar: "architect",
      modelSelection: { instanceId: "claude", model: "opus" },
      threadId: "thread-a",
    },
    {
      id: "b",
      personaName: "反方",
      personaPrompt: "异议",
      avatar: "opponent",
      modelSelection: { instanceId: "codex", model: "gpt" },
      threadId: "thread-b",
    },
    {
      id: "c",
      personaName: "实现者",
      personaPrompt: "落地",
      avatar: "implementer",
      modelSelection: { instanceId: "codex", model: "gpt" },
      threadId: "thread-c",
    },
  ],
  status: "speaking",
  cursor: {
    phase: "regular",
    seatIndex: 1,
    round: 3,
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
  createdAt: "2026-10-13T00:00:00.000Z",
  updatedAt: "2026-10-13T00:00:00.000Z",
  endedAt: null,
});
const closing = {
  summarizerSeatId: base.seats[0]!.id,
  summaryPrompt: "梳理",
  remainingFinalSeatIds: [base.seats[1]!.id, base.seats[2]!.id],
  phase: "final_round" as const,
};

const finals: Discussion = {
  ...base,
  status: "closing",
  cursor: { ...base.cursor, seatIndex: 0, phase: "final_round" },
  closing: { ...closing, remainingFinalSeatIds: [base.seats[0]!.id, base.seats[1]!.id] },
};
const summary: Discussion = {
  ...finals,
  cursor: { ...finals.cursor, phase: "summarizing" },
  closing: { ...closing, phase: "summarizing", remainingFinalSeatIds: [] },
};

describe("G1–G7 table lifecycle mapping", () => {
  it.each([
    {
      name: "G1 speaking / G4 approval waiting keeps the active lifecycle",
      snapshot: base,
      expected: {
        centerLabel: "第 3 轮",
        subtitle: "顺时针发言",
        order: ["a", "b", "c"],
        closeLoop: true,
        quiet: false,
        footer: null,
      },
    },
    {
      name: "G2 stopped",
      snapshot: { ...base, status: "paused", pause: { reason: "stopped" } },
      expected: {
        centerLabel: "第 3 轮",
        subtitle: "已停下",
        order: ["a", "b", "c"],
        closeLoop: true,
        quiet: false,
        footer: null,
      },
    },
    {
      name: "G3 failed",
      snapshot: {
        ...base,
        status: "paused",
        pause: { reason: "seat_failed", failureKind: "usage_limit" },
      },
      expected: {
        centerLabel: "第 3 轮",
        subtitle: "已停下",
        order: ["a", "b", "c"],
        closeLoop: true,
        quiet: false,
        footer: null,
      },
    },
    {
      name: "G5 finite finals start at the completed implementer",
      snapshot: finals,
      expected: {
        centerLabel: "最后陈述",
        subtitle: "之后由架构师梳理",
        order: ["c", "a", "b"],
        closeLoop: false,
        quiet: false,
        footer: null,
      },
    },
    {
      name: "G6 summary",
      snapshot: summary,
      expected: {
        centerLabel: "梳理",
        subtitle: "最后陈述已完成",
        order: ["a", "b", "c"],
        closeLoop: true,
        quiet: true,
        footer: null,
      },
    },
    {
      name: "G7 ended",
      snapshot: { ...summary, status: "ended", endedAt: "2026-10-13T07:42:00.000Z" },
      expected: {
        centerLabel: "共 3 轮",
        subtitle: "昨天 15:42",
        order: ["a", "b", "c"],
        closeLoop: true,
        quiet: true,
        footer: "讨论已结束，记录保留。要接着讨论，请新建一场。",
      },
    },
    {
      name: "paused finals keep the closing stage and actual sequence",
      snapshot: { ...finals, status: "paused", pause: { reason: "stopped" } },
      expected: {
        centerLabel: "最后陈述",
        subtitle: "已停下",
        order: ["c", "a", "b"],
        closeLoop: false,
        quiet: false,
        footer: null,
      },
    },
  ] satisfies { name: string; snapshot: Discussion; expected: object }[])(
    "$name",
    ({ snapshot, expected }) => {
      const { seats, ...view } = discussionTableView(snapshot, [], copy, "昨天 15:42");
      expect(view).toEqual(expected);
      expect(seats.map((seat) => seat.id)).toEqual(["a", "b", "c"]);
    },
  );

  it("G5 draws the completed bottom arc then the upcoming arc, without a return arc", () => {
    const view = discussionTableView(finals, [], copy, "");
    expect(
      view.seats.map(({ id, state, completed, tags }) => ({ id, state, completed, tags })),
    ).toEqual([
      {
        id: "a",
        state: "speaking",
        completed: false,
        tags: [{ label: "梳理人", tone: "neutral" }],
      },
      { id: "b", state: "next", completed: false, tags: [{ label: "下一位", tone: "outline" }] },
      { id: "c", state: "idle", completed: true, tags: [] },
    ]);
    expect(
      discussionTableConnections(view.seats, view).map(({ fromId, toId, kind }) => ({
        fromId,
        toId,
        kind,
      })),
    ).toEqual([
      { fromId: "c", toId: "a", kind: "completed" },
      { fromId: "a", toId: "b", kind: "next" },
    ]);
  });

  it.each([
    { remaining: ["a", "b", "c"], expected: ["a", "b", "c"] },
    { remaining: ["b", "c", "a"], expected: ["b", "c", "a"] },
    { remaining: ["c", "a", "b"], expected: ["c", "a", "b"] },
    { remaining: ["b"], expected: ["c", "a", "b"] },
  ])("recovers the full final order from remaining $remaining", ({ remaining, expected }) => {
    const snapshot = {
      ...finals,
      closing: {
        ...closing,
        remainingFinalSeatIds: remaining.map((id) => decodeSeatId(id)),
      },
    };
    expect(discussionTableView(snapshot, [], copy, "").order).toEqual(expected);
  });

  it("G7 keeps only the summarizer's checkmark and draws every connection quietly", () => {
    const snapshot: Discussion = { ...summary, status: "ended" };
    const view = discussionTableView(snapshot, [], copy, "");
    expect(view.subtitle).toBe("");
    expect(view.seats.map(({ id, state, tags }) => ({ id, state, tags }))).toEqual([
      { id: "a", state: "done", tags: [{ label: "梳理人", tone: "neutral" }] },
      { id: "b", state: "idle", tags: [] },
      { id: "c", state: "idle", tags: [] },
    ]);
    expect(discussionTableConnections(view.seats, view).map(({ kind }) => kind)).toEqual([
      "quiet",
      "quiet",
      "quiet",
    ]);
  });
});

describe("table interjection notes", () => {
  const entry = decodeEntry({
    id: "note",
    discussionId: "discussion",
    seq: 1,
    kind: "user",
    text: "插话",
    files: null,
    status: "completed",
    checkpointRef: null,
    createdAt: "2026-10-13T00:00:00.000Z",
  });
  const entries = [
    entry,
    { ...entry, seq: 2 },
    { ...entry, seq: 3, readBySeatId: base.seats[0]!.id },
    { ...entry, seq: 4, kind: "statement" as const },
  ].map((value, index) => ({ ...value, id: decodeEntryId(`note-${index}`) }));
  it.each([
    {
      name: "speaking passes unread notes to the next reader",
      snapshot: base,
      expected: [undefined, undefined, { count: 2, label: "开口时读到上面 2 条插话" }],
    },
    {
      name: "paused reader keeps its own retry notes",
      snapshot: { ...base, status: "paused", pause: { reason: "stopped" } },
      expected: [undefined, { count: 2, label: "重新开口时读到上面 2 条插话" }, undefined],
    },
    {
      name: "disabled finals have no interjection note",
      snapshot: finals,
      expected: [undefined, undefined, undefined],
    },
    {
      name: "ended has no interjection note",
      snapshot: { ...summary, status: "ended" },
      expected: [undefined, undefined, undefined],
    },
  ] satisfies { name: string; snapshot: Discussion; expected: unknown[] }[])(
    "$name",
    ({ snapshot, expected }) => {
      expect(
        discussionTableView(snapshot, entries, copy, "").seats.map((seat) => seat.interjection),
      ).toEqual(expected);
    },
  );
  it("removes the note when all user material has been read", () => {
    expect(
      discussionTableView(
        base,
        [{ ...entry, readBySeatId: base.seats[1]!.id }],
        copy,
        "",
      ).seats.map((seat) => seat.interjection),
    ).toEqual([undefined, undefined, undefined]);
  });
});

describe("physical discussion table seats", () => {
  it("keeps physical identity, completion and upcoming seats separate from avatar badges", () => {
    expect(discussionTableSeats(base, copy.page)).toEqual([
      {
        id: "a",
        seatIndex: 0,
        role: "architect",
        label: "架构师",
        state: "idle",
        completed: true,
        tags: [],
      },
      {
        id: "b",
        seatIndex: 1,
        role: "opponent",
        label: "反方",
        state: "speaking",
        completed: false,
        tags: [{ label: "发言中", tone: "info" }],
      },
      {
        id: "c",
        seatIndex: 2,
        role: "implementer",
        label: "实现者",
        state: "next",
        completed: false,
        tags: [{ label: "下一位", tone: "outline" }],
      },
    ]);
  });

  it("stops the failed seat's motion while keeping its retry and the future seat recessed", () => {
    expect(
      discussionTableSeats(
        { ...base, status: "paused", pause: { reason: "seat_failed" } },
        copy.page,
      ),
    ).toEqual([
      {
        id: "a",
        seatIndex: 0,
        role: "architect",
        label: "架构师",
        state: "idle",
        completed: true,
        tags: [],
      },
      {
        id: "b",
        seatIndex: 1,
        role: "opponent",
        label: "反方",
        state: "idle",
        completed: false,
        tags: [
          { label: "发言失败", tone: "error" },
          { label: "下一位", tone: "outline" },
        ],
      },
      {
        id: "c",
        seatIndex: 2,
        role: "implementer",
        label: "实现者",
        state: "next",
        completed: false,
        tags: [],
      },
    ]);
  });

  it("shows the next-round first seat once and preserves its completed arc", () => {
    expect(
      discussionTableSeats({ ...base, cursor: { ...base.cursor, seatIndex: 2 } }, copy.page),
    ).toEqual([
      {
        id: "a",
        seatIndex: 0,
        role: "architect",
        label: "架构师",
        state: "next",
        completed: true,
        tags: [{ label: "下一位", tone: "outline" }],
      },
      {
        id: "b",
        seatIndex: 1,
        role: "opponent",
        label: "反方",
        state: "idle",
        completed: true,
        tags: [],
      },
      {
        id: "c",
        seatIndex: 2,
        role: "implementer",
        label: "实现者",
        state: "speaking",
        completed: false,
        tags: [{ label: "发言中", tone: "info" }],
      },
    ]);
  });

  it("uses the active summary occurrence without duplicating the summarizer", () => {
    expect(
      discussionTableSeats(
        {
          ...base,
          status: "closing",
          cursor: { ...base.cursor, seatIndex: 0, phase: "summarizing" },
          closing: { ...closing, phase: "summarizing", remainingFinalSeatIds: [] },
        },
        copy.page,
      ),
    ).toEqual([
      {
        id: "a",
        seatIndex: 0,
        role: "architect",
        label: "架构师",
        state: "speaking",
        completed: true,
        tags: [
          { label: "梳理人", tone: "neutral" },
          { label: "发言中", tone: "info" },
        ],
      },
      {
        id: "b",
        seatIndex: 1,
        role: "opponent",
        label: "反方",
        state: "idle",
        completed: true,
        tags: [],
      },
      {
        id: "c",
        seatIndex: 2,
        role: "implementer",
        label: "实现者",
        state: "idle",
        completed: true,
        tags: [],
      },
    ]);
  });
});

describe("discussion route eligibility", () => {
  it.each([
    [" ", "x", false, false, "invalid"],
    ["env", " ", true, true, "invalid"],
    ["env", "x", false, false, "waiting"],
    ["env", "x", true, false, "unknown-environment"],
    ["env", "x", true, true, "subscribe"],
  ] as const)("gates %s/%s with ready=%s and exists=%s", (env, id, ready, exists, expected) => {
    expect(
      discussionRouteState(decodeEnvironmentId(env), decodeDiscussionId(id), ready, exists),
    ).toEqual(
      expected === "subscribe"
        ? { kind: "subscribe", environmentId: "env", discussionId: "x" }
        : { kind: expected },
    );
  });
});

describe("discussion header", () => {
  it.each([
    {
      snapshot: base,
      expected: { label: "第 3 轮 · 发言中", variant: "info", actions: ["stop", "end"] },
    },
    {
      snapshot: { ...base, status: "paused", pause: { reason: "stopped" } },
      expected: { label: "已停下", variant: "warning", actions: ["resume", "end"] },
    },
    {
      snapshot: {
        ...base,
        status: "closing",
        cursor: { ...base.cursor, phase: "final_round" },
        closing,
      },
      expected: { label: "收尾中 · 最后陈述", variant: "info", actions: ["stop"] },
    },
    {
      snapshot: {
        ...base,
        status: "closing",
        cursor: { ...base.cursor, phase: "summarizing" },
        closing: { ...closing, phase: "summarizing" },
      },
      expected: { label: "收尾中 · 梳理", variant: "info", actions: ["stop"] },
    },
    {
      snapshot: {
        ...base,
        status: "paused",
        cursor: { ...base.cursor, phase: "final_round" },
        closing,
      },
      expected: { label: "已停下", variant: "warning", actions: ["resume"] },
    },
    {
      snapshot: { ...base, status: "ended", endedAt: "2026-10-13T07:42:00.000Z" },
      expected: { label: "已结束 · 15:42", variant: "secondary", actions: ["more"] },
    },
  ] satisfies { snapshot: Discussion; expected: object }[])(
    "presents $expected.label and its actions",
    ({ snapshot, expected }) => {
      expect(discussionHeaderView(snapshot, copy, "15:42")).toEqual(expected);
    },
  );
});

describe("ordered discussion seat strip", () => {
  it.each([
    {
      name: "middle cursor",
      snapshot: base,
      expected: ["round:3", "0:done:", "1:current:speaking", "2:next:next"],
    },
    {
      name: "last cursor wraps",
      snapshot: { ...base, cursor: { ...base.cursor, seatIndex: 2 } },
      expected: ["round:3", "0:done:", "1:done:", "2:current:speaking", "round:4", "0:next:next"],
    },
    {
      name: "stopped current retries",
      snapshot: { ...base, status: "paused", pause: { reason: "stopped" } },
      expected: ["round:3", "0:done:", "1:current:interrupted,next", "2:next:"],
    },
    {
      name: "restarted last retries without next-round tag",
      snapshot: {
        ...base,
        status: "paused",
        pause: { reason: "server_restarted" },
        cursor: { ...base.cursor, seatIndex: 2 },
      },
      expected: [
        "round:3",
        "0:done:",
        "1:done:",
        "2:current:interrupted,next",
        "round:4",
        "0:next:",
      ],
    },
    {
      name: "failed current retries",
      snapshot: { ...base, status: "paused", pause: { reason: "seat_failed" } },
      expected: ["round:3", "0:done:", "1:current:failed,next", "2:next:"],
    },
    {
      name: "final statements",
      snapshot: {
        ...base,
        status: "closing",
        cursor: { ...base.cursor, phase: "final_round" },
        closing,
      },
      expected: [
        "final",
        "0:done:summarizer",
        "1:current:speaking",
        "2:next:next",
        "summary",
        "0:next:",
      ],
    },
    {
      name: "ordinary statement continues before final round",
      snapshot: {
        ...base,
        status: "closing",
        closing: {
          ...closing,
          remainingFinalSeatIds: [base.seats[2]!.id, base.seats[0]!.id, base.seats[1]!.id],
        },
      },
      expected: [
        "round:3",
        "1:current:speaking",
        "final",
        "0:next:summarizer",
        "1:next:",
        "2:next:next",
        "summary",
        "0:next:",
      ],
    },
    {
      name: "summary is next after last final statement",
      snapshot: {
        ...base,
        status: "closing",
        cursor: { ...base.cursor, phase: "final_round" },
        closing: { ...closing, remainingFinalSeatIds: [base.seats[1]!.id] },
      },
      expected: [
        "final",
        "0:done:summarizer",
        "1:current:speaking",
        "2:done:",
        "summary",
        "0:next:next",
      ],
    },
    {
      name: "summarizing",
      snapshot: {
        ...base,
        status: "closing",
        cursor: { ...base.cursor, seatIndex: 0, phase: "summarizing" },
        closing: { ...closing, phase: "summarizing", remainingFinalSeatIds: [] },
      },
      expected: [
        "final",
        "0:done:summarizer",
        "1:done:",
        "2:done:",
        "summary",
        "0:current:speaking",
      ],
    },
    {
      name: "paused final statement",
      snapshot: {
        ...base,
        status: "paused",
        cursor: { ...base.cursor, phase: "final_round" },
        pause: { reason: "stopped" },
        closing,
      },
      expected: [
        "final",
        "0:done:summarizer",
        "1:current:interrupted,next",
        "2:next:",
        "summary",
        "0:next:",
      ],
    },
    {
      name: "paused summary",
      snapshot: {
        ...base,
        status: "paused",
        cursor: { ...base.cursor, seatIndex: 0, phase: "summarizing" },
        pause: { reason: "seat_failed" },
        closing: { ...closing, phase: "summarizing", remainingFinalSeatIds: [] },
      },
      expected: [
        "final",
        "0:done:summarizer",
        "1:done:",
        "2:done:",
        "summary",
        "0:current:failed,next",
      ],
    },
    {
      name: "ended",
      snapshot: {
        ...base,
        status: "ended",
        cursor: { ...base.cursor, seatIndex: 0, phase: "summarizing" },
        closing: { ...closing, phase: "summarizing", remainingFinalSeatIds: [] },
      },
      expected: ["final", "0:done:", "1:done:", "2:done:", "summary", "0:done:summarizer"],
    },
    {
      name: "two seats stop the ordinary statement after End",
      snapshot: {
        ...base,
        seats: base.seats.slice(0, 2),
        status: "paused",
        cursor: { ...base.cursor, seatIndex: 0, phase: "regular" },
        pause: { reason: "stopped" },
        closing: { ...closing, remainingFinalSeatIds: [base.seats[1]!.id, base.seats[0]!.id] },
      },
      expected: [
        "round:3",
        "0:current:interrupted,next",
        "final",
        "0:next:summarizer",
        "1:next:",
        "summary",
        "0:next:",
      ],
    },
    {
      name: "two seats fail the ordinary statement after End",
      snapshot: {
        ...base,
        seats: base.seats.slice(0, 2),
        status: "paused",
        cursor: { ...base.cursor, seatIndex: 0, phase: "regular" },
        pause: { reason: "seat_failed" },
        closing: { ...closing, remainingFinalSeatIds: [base.seats[1]!.id, base.seats[0]!.id] },
      },
      expected: [
        "round:3",
        "0:current:failed,next",
        "final",
        "0:next:summarizer",
        "1:next:",
        "summary",
        "0:next:",
      ],
    },
    {
      name: "single seat completes its ordinary statement before the final statement",
      snapshot: {
        ...base,
        seats: base.seats.slice(0, 1),
        status: "closing",
        cursor: { ...base.cursor, seatIndex: 0, phase: "regular" },
        closing: { ...closing, remainingFinalSeatIds: [base.seats[0]!.id] },
      },
      expected: [
        "round:3",
        "0:current:speaking",
        "final",
        "0:next:next,summarizer",
        "summary",
        "0:next:",
      ],
    },
    {
      name: "single seat retries its paused ordinary statement before the final statement",
      snapshot: {
        ...base,
        seats: base.seats.slice(0, 1),
        status: "paused",
        cursor: { ...base.cursor, seatIndex: 0, phase: "regular" },
        pause: { reason: "stopped" },
        closing: { ...closing, remainingFinalSeatIds: [base.seats[0]!.id] },
      },
      expected: [
        "round:3",
        "0:current:interrupted,next",
        "final",
        "0:next:summarizer",
        "summary",
        "0:next:",
      ],
    },
    {
      name: "single seat final statement leads directly to summary",
      snapshot: {
        ...base,
        seats: base.seats.slice(0, 1),
        status: "closing",
        cursor: { ...base.cursor, seatIndex: 0, phase: "final_round" },
        closing: { ...closing, remainingFinalSeatIds: [base.seats[0]!.id] },
      },
      expected: ["final", "0:current:speaking,summarizer", "summary", "0:next:next"],
    },
    {
      name: "legacy paused ordinary statement uses the final seat order fallback",
      snapshot: {
        ...base,
        seats: base.seats.slice(0, 2),
        status: "paused",
        cursor: {
          seatIndex: 0,
          round: 3,
          dispatchNo: 0,
          runId: null,
          dispatchedEntrySeq: 0,
          briefChars: 0,
          briefSentAsFile: false,
        },
        pause: { reason: "stopped" },
        closing: { ...closing, remainingFinalSeatIds: [base.seats[1]!.id, base.seats[0]!.id] },
      },
      expected: [
        "round:3",
        "0:current:interrupted,next",
        "final",
        "0:next:summarizer",
        "1:next:",
        "summary",
        "0:next:",
      ],
    },
    {
      name: "ended without closing plan",
      snapshot: { ...base, status: "ended" },
      expected: ["final", "0:done:", "1:done:", "2:done:"],
    },
  ] satisfies { name: string; snapshot: Discussion; expected: string[] }[])(
    "shows $name",
    ({ snapshot, expected }) => {
      expect(
        discussionSeatStrip(snapshot).map((item) =>
          item.kind === "segment"
            ? item.round === undefined
              ? item.label
              : `${item.label}:${item.round}`
            : `${item.index}:${item.state}:${item.tags.join(",")}`,
        ),
      ).toEqual(expected);
    },
  );
});
