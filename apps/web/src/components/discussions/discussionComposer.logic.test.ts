/** Protects D1's independently specified composer text, submission gates and local keyboard contract. */
import { Discussion } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";
import { discussions as copy } from "~/i18n/locales/zh-CN/discussions";
import {
  discussionComposerView,
  discussionEnterSends,
  discussionInterjectionText,
} from "./discussionComposer.logic";
import { discussionHeaderActionEnabled, discussionHeaderView } from "./discussionPage.logic";

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
      personaName: "实现者",
      personaPrompt: "落地",
      avatar: "implementer",
      modelSelection: { instanceId: "codex", model: "gpt" },
      threadId: "thread-b",
    },
  ],
  status: "speaking",
  cursor: {
    phase: "regular",
    seatIndex: 0,
    round: 1,
    dispatchNo: 1,
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
const closing: NonNullable<Discussion["closing"]> = {
  summarizerSeatId: base.seats[0]!.id,
  summaryPrompt: "梳理",
  remainingFinalSeatIds: [base.seats[0]!.id],
  phase: "final_round",
};

describe("discussion composer presentation", () => {
  it.each([
    {
      name: "speaking with a successor",
      discussion: base,
      expected: { disabled: false, placeholder: "插话…不会打断架构师，下一位实现者开口时读到" },
    },
    {
      name: "single seat speaks again",
      discussion: { ...base, seats: base.seats.slice(0, 1) },
      expected: { disabled: false, placeholder: "插话…不会打断架构师，架构师下次开口时读到" },
    },
    {
      name: "paused seat retries itself",
      discussion: {
        ...base,
        status: "paused" as const,
        cursor: { ...base.cursor, seatIndex: 1 },
        pause: { reason: "stopped" as const },
      },
      expected: { disabled: false, placeholder: "插话…实现者重新开口时读到" },
    },
    {
      name: "closing while speaking",
      discussion: { ...base, status: "closing" as const, closing },
      expected: { disabled: true, placeholder: "收尾中，不能插话" },
    },
    {
      name: "closing while paused",
      discussion: { ...base, status: "paused" as const, closing },
      expected: { disabled: true, placeholder: "收尾中，不能插话" },
    },
    {
      name: "ended even with a closing plan",
      discussion: { ...base, status: "ended" as const, closing },
      expected: null,
    },
    {
      name: "missing next seat",
      discussion: { ...base, cursor: { ...base.cursor, seatIndex: 9 } },
      expected: { disabled: false, placeholder: "插话…" },
    },
  ])("$name", ({ discussion, expected }) => {
    expect(discussionComposerView(discussion, copy)).toEqual(expected);
  });
});

describe("discussion interjection submission", () => {
  const available = { disabled: false, placeholder: "插话…" };
  it.each([
    {
      name: "trims the submitted text only",
      text: " \n讨论一个方案\n第二行  ",
      pending: false,
      permitted: true,
      view: available,
      expected: "讨论一个方案\n第二行",
    },
    {
      name: "rejects whitespace",
      text: " \n\t ",
      pending: false,
      permitted: true,
      view: available,
      expected: null,
    },
    {
      name: "rejects a second submission",
      text: "方案",
      pending: true,
      permitted: true,
      view: available,
      expected: null,
    },
    {
      name: "requires permission",
      text: "方案",
      pending: false,
      permitted: false,
      view: available,
      expected: null,
    },
    {
      name: "rejects closing",
      text: "方案",
      pending: false,
      permitted: true,
      view: { disabled: true, placeholder: "收尾中，不能插话" },
      expected: null,
    },
    {
      name: "rejects a hidden composer",
      text: "方案",
      pending: false,
      permitted: true,
      view: null,
      expected: null,
    },
  ])("$name", ({ text, pending, permitted, view, expected }) => {
    expect(discussionInterjectionText(text, view, pending, permitted)).toBe(expected);
  });
  it.each([
    { key: "Enter", shiftKey: false, isComposing: false, keyCode: 13, expected: true },
    { key: "Enter", shiftKey: true, isComposing: false, keyCode: 13, expected: false },
    { key: "Enter", shiftKey: false, isComposing: true, keyCode: 13, expected: false },
    { key: "Enter", shiftKey: false, isComposing: false, keyCode: 229, expected: false },
    { key: "a", shiftKey: false, isComposing: false, keyCode: 65, expected: false },
  ])("$key shift=$shiftKey composing=$isComposing code=$keyCode", ({ expected, ...event }) => {
    expect(discussionEnterSends(event)).toBe(expected);
  });
});

describe("discussion header command availability", () => {
  it.each([
    {
      name: "speaking",
      discussion: base,
      pending: false,
      permitted: true,
      expected: [true, false],
    },
    {
      name: "paused",
      discussion: { ...base, status: "paused" as const },
      pending: false,
      permitted: true,
      expected: [true, false],
    },
    {
      name: "closing",
      discussion: { ...base, status: "closing" as const, closing },
      pending: false,
      permitted: true,
      expected: [true],
    },
    { name: "pending", discussion: base, pending: true, permitted: true, expected: [false, false] },
    {
      name: "no permission",
      discussion: base,
      pending: false,
      permitted: false,
      expected: [false, false],
    },
    {
      name: "ended",
      discussion: { ...base, status: "ended" as const },
      pending: false,
      permitted: true,
      expected: [false],
    },
  ])("$name", ({ discussion, pending, permitted, expected }) => {
    expect(
      discussionHeaderView(discussion, copy, "").actions.map((action) =>
        discussionHeaderActionEnabled(action, pending, permitted),
      ),
    ).toEqual(expected);
  });
});
