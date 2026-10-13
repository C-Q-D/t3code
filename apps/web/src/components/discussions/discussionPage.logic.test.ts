/** Guards C1's independently specified routing, header and ordered seat presentation contracts. */
import { Discussion, DiscussionId, EnvironmentId } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";
import { discussions as copy } from "~/i18n/locales/zh-CN/discussions";
import {
  discussionHeaderView,
  discussionRouteState,
  discussionSeatStrip,
} from "./discussionPage.logic";

const decodeEnvironmentId = Schema.decodeOption(EnvironmentId);
const decodeDiscussionId = Schema.decodeOption(DiscussionId);

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
      snapshot: { ...base, status: "closing", closing },
      expected: { label: "收尾中 · 最后陈述", variant: "info", actions: ["stop"] },
    },
    {
      snapshot: { ...base, status: "closing", closing: { ...closing, phase: "summarizing" } },
      expected: { label: "收尾中 · 梳理", variant: "info", actions: ["stop"] },
    },
    {
      snapshot: { ...base, status: "paused", closing },
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
      snapshot: { ...base, status: "closing", closing },
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
      snapshot: { ...base, status: "paused", pause: { reason: "stopped" }, closing },
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
        closing: { ...closing, phase: "summarizing", remainingFinalSeatIds: [] },
      },
      expected: ["final", "0:done:", "1:done:", "2:done:", "summary", "0:done:summarizer"],
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
