/** Protects D3 notice priority, seat attribution and independently specified localized copy. */
import { Discussion, DiscussionSeatId } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";
import { discussions as zh } from "~/i18n/locales/zh-CN/discussions";
import { discussions as en } from "~/i18n/locales/en/discussions";
import { discussionAlertView } from "./discussionAlert.logic";

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

const missingSeatId = Schema.decodeSync(DiscussionSeatId)("missing");
const providers = new Map([
  ["claude", "Claude"],
  ["codex", "Codex"],
]);
const command = {
  approvals: [{ requestKind: "command" }],
  userInputs: [],
} satisfies NonNullable<Parameters<typeof discussionAlertView>[1]>;
const permission = {
  approvals: [{ requestKind: "permission" }],
  userInputs: [],
} satisfies NonNullable<Parameters<typeof discussionAlertView>[1]>;
const operation = {
  approvals: [{ requestKind: "file-change" }],
  userInputs: [],
} satisfies NonNullable<Parameters<typeof discussionAlertView>[1]>;
const questions = { approvals: [], userInputs: [{}] };
const empty = { approvals: [], userInputs: [] };

/** Builds only the notice's pause inputs; unrelated snapshot values stay fixed. */
function paused(pause: Discussion["pause"], finishing = false): Discussion {
  return { ...base, status: "paused", pause, closing: finishing ? closing : null };
}

/** Sets material inputs without deriving expected counts from implementation constants. */
function material(
  chars: number,
  file = false,
  status: "speaking" | "closing" = "speaking",
): Discussion {
  return { ...base, status, cursor: { ...base.cursor, briefChars: chars, briefSentAsFile: file } };
}

describe("discussion pause notices", () => {
  it.each([
    {
      name: "stopped",
      discussion: paused({ reason: "stopped" }),
      variant: "warning",
      text: '讨论已停下。点"继续"，架构师会重新发言。',
    },
    {
      name: "usage limit uses failed seat",
      discussion: paused({
        reason: "seat_failed",
        seatId: base.seats[1]!.id,
        failureKind: "usage_limit",
      }),
      variant: "error",
      text: '实现者发言失败：Codex用量已达上限。可以稍后点"继续"重试，或者结束讨论。',
    },
    {
      name: "Chinese period",
      discussion: paused({ reason: "seat_failed", message: "连接失败。" }),
      variant: "error",
      text: '架构师发言失败：连接失败。可以稍后点"继续"重试，或者结束讨论。',
    },
    {
      name: "English period",
      discussion: paused({ reason: "seat_failed", message: "连接失败." }),
      variant: "error",
      text: '架构师发言失败：连接失败。可以稍后点"继续"重试，或者结束讨论。',
    },
    {
      name: "no period",
      discussion: paused({ reason: "seat_failed", failureKind: "error", message: "连接失败" }),
      variant: "error",
      text: '架构师发言失败：连接失败。可以稍后点"继续"重试，或者结束讨论。',
    },
    {
      name: "no message",
      discussion: paused({ reason: "seat_failed" }),
      variant: "error",
      text: '架构师发言失败。可以稍后点"继续"重试，或者结束讨论。',
    },
    {
      name: "missing failed seat falls back",
      discussion: paused({
        reason: "seat_failed",
        seatId: missingSeatId,
      }),
      variant: "error",
      text: '架构师发言失败。可以稍后点"继续"重试，或者结束讨论。',
    },
    {
      name: "server restarted",
      discussion: paused({ reason: "server_restarted" }),
      variant: "info",
      text: '桌面端重启过，讨论已停下。点"继续"恢复。',
    },
    {
      name: "closing usage limit",
      discussion: paused({ reason: "seat_failed", failureKind: "usage_limit" }, true),
      variant: "error",
      text: '架构师发言失败：Claude用量已达上限。可以稍后点"继续"重试。',
    },
    {
      name: "closing failure",
      discussion: paused({ reason: "seat_failed", message: "失败。" }, true),
      variant: "error",
      text: '架构师发言失败：失败。可以稍后点"继续"重试。',
    },
  ])("$name", ({ discussion, variant, text }) => {
    expect(discussionAlertView(discussion, empty, zh, "zh-CN", providers)).toEqual({
      variant,
      text,
      threadId: null,
    });
  });
  it("pause takes precedence over requests and material", () => {
    const discussion = {
      ...paused({ reason: "stopped" }),
      cursor: { ...base.cursor, briefChars: 123400, briefSentAsFile: true },
    };
    expect(discussionAlertView(discussion, command, zh, "zh-CN", providers)).toEqual({
      variant: "warning",
      text: '讨论已停下。点"继续"，架构师会重新发言。',
      threadId: null,
    });
  });
  it("has no notice when pause information is absent", () => {
    expect(discussionAlertView(paused(null), command, zh, "zh-CN", providers)).toBeNull();
  });
});

describe("active discussion notices", () => {
  it.each([
    {
      name: "command approval",
      requests: command,
      text: "架构师在等你批准一条命令。讨论没有停下，批准后它会接着发言。",
    },
    {
      name: "permission approval",
      requests: permission,
      text: "架构师在等你批准一项操作。讨论没有停下，批准后它会接着发言。",
    },
    {
      name: "operation approval",
      requests: operation,
      text: "架构师在等你批准一项操作。讨论没有停下，批准后它会接着发言。",
    },
    {
      name: "questions",
      requests: questions,
      text: "架构师在等你回答问题。讨论没有停下，回答后它会接着发言。",
    },
    {
      name: "approval before questions",
      requests: { ...command, userInputs: [{}] },
      text: "架构师在等你批准一条命令。讨论没有停下，批准后它会接着发言。",
    },
  ])("$name", ({ requests, text }) => {
    expect(discussionAlertView(base, requests, zh, "zh-CN", providers)).toEqual({
      variant: "info",
      text,
      threadId: base.seats[0]!.threadId,
    });
  });
  it.each(["speaking", "closing"] as const)("%s request beats material", (status) => {
    expect(
      discussionAlertView(material(123400, true, status), command, zh, "zh-CN", providers),
    ).toEqual({
      variant: "info",
      text: "架构师在等你批准一条命令。讨论没有停下，批准后它会接着发言。",
      threadId: base.seats[0]!.threadId,
    });
  });
  it.each(["speaking", "closing"] as const)("%s file notice", (status) => {
    expect(
      discussionAlertView(material(123400, true, status), empty, zh, "zh-CN", providers),
    ).toEqual({
      variant: "info",
      text: "给架构师的材料有 123,400 字符，超过单条消息上限 120,000 字符，已改为文件发送。",
      threadId: null,
    });
  });
  it.each(["speaking", "closing"] as const)("%s warning strictly above threshold", (status) => {
    expect(
      discussionAlertView(material(60001, false, status), null, zh, "zh-CN", providers),
    ).toEqual({
      variant: "warning",
      text: "给架构师的材料已有 60,001 字符。超过 120,000 字符时会改为文件发送。",
      threadId: null,
    });
  });
  it.each([material(60000), base, { ...material(123400, true), status: "ended" as const }])(
    "suppresses inactive or unneeded notices",
    (discussion) => {
      expect(discussionAlertView(discussion, empty, zh, "zh-CN", providers)).toBeNull();
    },
  );
});

describe("English notice copy", () => {
  it.each([
    {
      discussion: paused({ reason: "stopped" }),
      requests: empty,
      text: 'The discussion is paused. Select "Continue" and 架构师 will speak again.',
    },
    {
      discussion: paused({ reason: "seat_failed", failureKind: "usage_limit" }),
      requests: empty,
      text: '架构师 could not speak: Claude usage limit reached. You can select "Continue" later to retry, or end the discussion.',
    },
    {
      discussion: paused({ reason: "seat_failed", message: "Connection failed." }),
      requests: empty,
      text: '架构师 could not speak: Connection failed. You can select "Continue" later to retry, or end the discussion.',
    },
    {
      discussion: paused({ reason: "seat_failed" }),
      requests: empty,
      text: '架构师 could not speak. You can select "Continue" later to retry, or end the discussion.',
    },
    {
      discussion: paused({ reason: "server_restarted" }),
      requests: empty,
      text: 'The desktop app restarted and the discussion is paused. Select "Continue" to resume.',
    },
    {
      discussion: base,
      requests: command,
      text: "架构师 is waiting for you to approve a command. The discussion is still running; they will continue speaking after approval.",
    },
    {
      discussion: base,
      requests: operation,
      text: "架构师 is waiting for you to approve an operation. The discussion is still running; they will continue speaking after approval.",
    },
    {
      discussion: base,
      requests: questions,
      text: "架构师 is waiting for you to answer questions. The discussion is still running; they will continue speaking after your response.",
    },
    {
      discussion: material(64200),
      requests: empty,
      text: "The material for 架构师 is now 64,200 characters long. Above 120,000 characters, it will be sent as a file.",
    },
    {
      discussion: material(123400, true),
      requests: empty,
      text: "The material for 架构师 is 123,400 characters long, exceeding the 120,000-character message limit. It was sent as a file.",
    },
    {
      discussion: paused({ reason: "seat_failed", failureKind: "usage_limit" }, true),
      requests: empty,
      text: '架构师 could not speak: Claude usage limit reached. You can select "Continue" later to retry.',
    },
  ])("$text", ({ discussion, requests, text }) => {
    expect(discussionAlertView(discussion, requests, en, "en", providers)?.text).toBe(text);
  });
});
