/** Guards motion ownership using the existing strip and live assignment boundaries. */
import { Discussion } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { expect, it } from "vite-plus/test";
import { discussionSeatStrip } from "./discussionPage.logic";
import { discussionLiveAssignment } from "./discussionLive.logic";
import { discussionSeatMotion, discussionLiveWave } from "./discussionMotion.logic";
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
    runId: "current",
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
it.each([
  {
    status: "speaking" as const,
    expected: [
      ["done", false],
      ["speaking", true],
      ["next", false],
    ],
  },
  {
    status: "paused" as const,
    expected: [
      ["done", false],
      ["idle", false],
      ["next", false],
    ],
  },
  {
    status: "ended" as const,
    expected: [
      ["done", false],
      ["done", false],
      ["done", false],
    ],
  },
])("$status assigns wave only to an active current strip seat", ({ status, expected }) => {
  const d = { ...base, status };
  expect(
    discussionSeatStrip(d)
      .filter((i) => i.kind === "seat")
      .map((i) => {
        const motion = discussionSeatMotion(i, d.status);
        return [motion.avatarState, motion.wave];
      }),
  ).toEqual(expected);
});
it.each(["closing", "paused"] as const)(
  "%s final round animates only its current occurrence",
  (status) => {
    const d = {
      ...base,
      status,
      cursor: { ...base.cursor, phase: "final_round" as const },
      closing: {
        summarizerSeatId: base.seats[0]!.id,
        summaryPrompt: "总结",
        remainingFinalSeatIds: [base.seats[1]!.id, base.seats[2]!.id],
        phase: "final_round" as const,
      },
    };
    expect(
      discussionSeatStrip(d)
        .filter((i) => i.kind === "seat")
        .map((i) => {
          const m = discussionSeatMotion(i, d.status);
          return [i.index, m.avatarState, m.wave];
        }),
    ).toEqual([
      [0, "done", false],
      [1, status === "paused" ? "idle" : "speaking", status === "closing"],
      [2, "next", false],
      [0, "next", false],
    ]);
  },
);
it("summarizing animates the summary occurrence and leaves the final occurrence done", () => {
  const d = {
    ...base,
    status: "closing" as const,
    cursor: { ...base.cursor, seatIndex: 0, phase: "summarizing" as const },
    closing: {
      summarizerSeatId: base.seats[0]!.id,
      summaryPrompt: "总结",
      remainingFinalSeatIds: [],
      phase: "summarizing" as const,
    },
  };
  expect(
    discussionSeatStrip(d)
      .filter((i) => i.kind === "seat")
      .map((i) => {
        const m = discussionSeatMotion(i, d.status);
        return [i.index, m.avatarState, m.wave];
      }),
  ).toEqual([
    [0, "done", false],
    [1, "done", false],
    [2, "done", false],
    [0, "speaking", true],
  ]);
});
it.each(["speaking", "closing", "paused", "ended"] as const)(
  "%s live heading wave follows the existing live assignment",
  (status) => {
    expect(discussionLiveWave(discussionLiveAssignment({ ...base, status }, []))).toBe(
      status === "speaking" || status === "closing",
    );
  },
);
