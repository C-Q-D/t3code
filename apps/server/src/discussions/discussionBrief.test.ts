/** Protects Chinese material content, phase rules and verbatim originals independently of provider transport. */
import { describe, it, expect } from "@effect/vitest";
import { buildDiscussionBrief } from "./discussionBrief.ts";
import { discussionFixture, entryFixtures } from "./discussionFixtures.testkit.ts";

const input = {
  discussion: discussionFixture,
  seatIndex: 1,
  projectTitle: "共享项目",
  entries: entryFixtures,
  firstDelivery: true,
  phase: "regular" as const,
  interrupted: false,
};

describe("discussion material", () => {
  it("includes project, round, seat order, originals and file statistics, with persona kept out", () => {
    const text = buildDiscussionBrief(input);
    for (const original of [
      "边界讨论",
      "项目：共享项目",
      "第 3 轮",
      "你是「实现者」（座位 2/2）",
      "1. 架构师 → 2. 实现者",
      "议题第一行\n议题完整原文🌿",
      "插话完整原文\n第二行",
      "上一位全部原文\n不准裁剪🌿",
      "new/a.ts：+8 / -2 行",
      "讨论到此",
    ])
      expect(text).toContain(original);
    expect(text.indexOf("插话完整原文")).toBeLessThan(text.indexOf("上一位全部原文"));
    expect(text.indexOf("上一位全部原文")).toBeLessThan(text.indexOf("讨论到此"));
    expect(text).not.toContain("秘密提示词");
    expect(text).toContain("不要代替其他座位发言");
  });

  it("omits the already delivered topic and explains an interrupted retry", () => {
    const text = buildDiscussionBrief({ ...input, firstDelivery: false, interrupted: true });
    expect(text).not.toContain("议题完整原文");
    expect(text).toContain("你上次发言被中止，已记录的部分如上");
    expect(text).toContain("插话完整原文\n第二行");
  });

  it("marks final speech and appends the full frozen template only for summarizing", () => {
    const discussion = {
      ...discussionFixture,
      closing: {
        summarizerSeatId: discussionFixture.seats[1]!.id,
        summaryPrompt: "冻结的模板原文\n所有问题都要列出",
        remainingFinalSeatIds: [],
        phase: "summarizing" as const,
      },
    };
    const final = buildDiscussionBrief({ ...input, discussion, phase: "final_round" });
    expect(final).toContain("这是你本次讨论的最后一次发言");
    expect(final).not.toContain("冻结的模板原文");
    const summary = buildDiscussionBrief({ ...input, discussion, phase: "summarizing" });
    expect(summary).toContain("冻结的模板原文\n所有问题都要列出");
    expect(summary).not.toContain("这是你本次讨论的最后一次发言");
  });
});
