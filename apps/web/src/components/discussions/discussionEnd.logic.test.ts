/** Guards D2's independent defaults, stored copy, fallback rules and submission lifecycle. */
import { Discussion, DiscussionPrompt } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { describe, it, expect } from "vite-plus/test";
import { discussions as zh } from "~/i18n/locales/zh-CN/discussions";
import { discussions as en } from "~/i18n/locales/en/discussions";
import {
  discussionSummarizers,
  discussionSummaryChoices,
  discussionEndNotice,
  discussionEndInput,
  discussionEndShouldClose,
} from "./discussionEnd.logic";
const d = Schema.decodeSync(Discussion)({
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
      threadId: "a",
    },
    {
      id: "b",
      personaName: "反方",
      personaPrompt: "反证",
      avatar: "opponent",
      modelSelection: { instanceId: "codex", model: "gpt" },
      threadId: "b",
    },
  ],
  status: "speaking",
  cursor: {
    phase: "regular",
    seatIndex: 1,
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
const decodePrompt = Schema.decodeSync(DiscussionPrompt);
/** Builds independent stored prompt fixtures; IDs and descriptions come from the D2 cases. */
const prompt = (id: string, kind: "summary" | "persona", description: string) =>
  decodePrompt({
    id,
    kind,
    name: id === "builtin:summary:default" ? "默认" : "自定义",
    description,
    prompt: "梳理",
    avatar: null,
    builtin: id.startsWith("builtin:"),
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  });
const defaults = prompt("builtin:summary:default", "summary", "共识 / 分歧 / 待你决定");
const custom = prompt("custom", "summary", "");
const prompts = [prompt("persona", "persona", "身份"), custom, defaults];
const closing = {
  summarizerSeatId: d.seats[0]!.id,
  summaryPrompt: "梳理",
  remainingFinalSeatIds: [],
  phase: "final_round" as const,
};
describe("end discussion selections", () => {
  it("preserves every seat and defaults to the first", () => {
    const v = discussionSummarizers(d);
    expect(v.options.map((s) => [s.id, s.personaName, s.avatar, s.modelSelection.model])).toEqual([
      ["a", "架构师", "architect", "opus"],
      ["b", "反方", "opponent", "gpt"],
    ]);
    expect(v.selected).toBe("a");
  });
  it.each([
    { copy: zh, labels: ["自定义", "默认（共识 / 分歧 / 待你决定）"] },
    { copy: en, labels: ["自定义", "默认 (共识 / 分歧 / 待你决定)"] },
  ])("filters summaries and formats stored labels", ({ copy, labels }) => {
    const v = discussionSummaryChoices(prompts, false, "builtin:summary:default", copy);
    expect(v.options.map((p) => p.label)).toEqual(labels);
    expect(v.selected).toBe("builtin:summary:default");
    expect(v.disabled).toBe(false);
  });
  it.each([
    {
      name: "loading",
      prompts: null,
      failed: false,
      selected: "builtin:summary:default",
      id: null,
      message: "正在读取梳理模板…",
      disabled: true,
    },
    {
      name: "failed even with cached data",
      prompts,
      failed: true,
      selected: "custom",
      id: null,
      message: "梳理模板读取失败，将使用默认模板",
      disabled: true,
    },
    {
      name: "custom choice",
      prompts,
      failed: false,
      selected: "custom",
      id: "custom",
      message: null,
      disabled: false,
    },
    {
      name: "deleted selection",
      prompts,
      failed: false,
      selected: "gone",
      id: "builtin:summary:default",
      message: null,
      disabled: false,
    },
    {
      name: "missing builtin too",
      prompts: [custom],
      failed: false,
      selected: "gone",
      id: null,
      message: null,
      disabled: false,
    },
  ])("$name", ({ prompts, failed, selected, id, message, disabled }) => {
    const v = discussionSummaryChoices(prompts, failed, selected, zh);
    expect([v.selected, v.message, v.disabled]).toEqual([id, message, disabled]);
    const input = discussionEndInput(d, "a", v.selected, false, true);
    expect(input).toEqual({
      discussionId: "discussion",
      summarizerSeatId: "a",
      ...(id ? { summaryPromptId: id } : {}),
    });
  });
  it("uses the current speaking seat in the notice", () =>
    expect(discussionEndNotice(d, zh)).toBe("反方正在发言，等它说完再开始最后陈述"));
  it("hides the notice while paused", () =>
    expect(discussionEndNotice({ ...d, status: "paused" }, zh)).toBeNull());
  it.each([
    { name: "pending", discussion: d, pending: true, permitted: true, seat: "a" },
    { name: "no permission", discussion: d, pending: false, permitted: false, seat: "a" },
    {
      name: "ended",
      discussion: { ...d, status: "ended" as const },
      pending: false,
      permitted: true,
      seat: "a",
    },
    {
      name: "closing paused",
      discussion: { ...d, status: "paused" as const, closing },
      pending: false,
      permitted: true,
      seat: "a",
    },
    {
      name: "closing status",
      discussion: { ...d, status: "closing" as const },
      pending: false,
      permitted: true,
      seat: "a",
    },
    { name: "missing seat", discussion: d, pending: false, permitted: true, seat: "gone" },
  ])("blocks $name", ({ discussion, pending, permitted, seat }) =>
    expect(discussionEndInput(discussion, seat, null, pending, permitted)).toBeNull(),
  );
  it("allows paused submission with a selected second seat", () =>
    expect(discussionEndInput({ ...d, status: "paused" }, "b", defaults.id, false, true)).toEqual({
      discussionId: "discussion",
      summarizerSeatId: "b",
      summaryPromptId: "builtin:summary:default",
    }));
  it("closes after its own end response fails with persisted closing", () =>
    expect(discussionEndShouldClose({ ...d, status: "paused", closing }, false)).toBe(true));
  it.each([
    { status: "speaking" as const, closing: null, ending: false, expected: false },
    { status: "paused" as const, closing: null, ending: false, expected: false },
    { status: "ended" as const, closing: null, ending: false, expected: true },

    { status: "closing" as const, closing, ending: false, expected: true },
    { status: "closing" as const, closing, ending: true, expected: false },
  ])("automatic close $status own-end=$ending", ({ status, closing, ending, expected }) =>
    expect(discussionEndShouldClose({ ...d, status, closing }, ending)).toBe(expected),
  );
});
