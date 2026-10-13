/** Builds complete Chinese seat material; identity instructions use developer context instead. */
import type { Discussion, DiscussionEntry } from "@t3tools/contracts";

/** Material phase is explicit because a run already in flight at End remains an ordinary statement. */
export type DiscussionBriefPhase = "regular" | "final_round" | "summarizing";

/**
 * Ends the durable user message with its phase so a retry after End preserves the original assignment.
 * @param phase Assignment given to this dispatch, independent of later lifecycle changes.
 * @returns A Chinese phase label retained in both inline and attachment messages.
 */
export function discussionBriefPhaseMarker(phase: DiscussionBriefPhase): string {
  return `本次阶段：${phase === "regular" ? "普通讨论发言" : phase === "final_round" ? "最后陈述" : "梳理"}。`;
}

/**
 * Formats complete entries in transcript order without truncation or paraphrasing.
 * @param input Snapshot, destination seat, project name, unread entries and dispatch phase.
 * @returns Full material measured with JavaScript string.length, matching provider input checks.
 */
export function buildDiscussionBrief(input: {
  readonly discussion: Discussion;
  readonly seatIndex: number;
  readonly projectTitle: string;
  readonly entries: ReadonlyArray<DiscussionEntry>;
  readonly firstDelivery: boolean;
  readonly phase: DiscussionBriefPhase;
  readonly interrupted: boolean;
}): string {
  const { discussion, seatIndex } = input;
  const seat = discussion.seats[seatIndex];
  if (!seat) throw new RangeError("Discussion seat index is out of range.");
  const sections = [
    `# 讨论：${discussion.title}\n项目：${input.projectTitle}\n第 ${discussion.cursor.round} 轮`,
    `你是「${seat.personaName}」（座位 ${seatIndex + 1}/${discussion.seats.length}）。\n参会者顺序：${discussion.seats.map((item, index) => `${index + 1}. ${item.personaName}`).join(" → ")}`,
  ];
  if (input.firstDelivery) sections.push(`## 议题原文\n${discussion.topic}`);
  for (const entry of input.entries) {
    const speaker = discussion.seats.find((item) => item.id === entry.seatId)?.personaName;
    const label =
      entry.kind === "user"
        ? "用户插话"
        : entry.kind === "system"
          ? "系统"
          : `${speaker ?? "座位"}的${entry.kind === "summary" ? "梳理" : "发言"}（${entry.status}）`;
    sections.push(`## ${label}\n${entry.text}`);
    if (entry.kind === "statement" || entry.kind === "summary") {
      sections.push(
        entry.files === null
          ? "改动文件：无法确定。"
          : `改动文件：${entry.files.length === 0 ? "无。" : "\n" + entry.files.map((file) => `${file.path}：+${file.additions} / -${file.deletions} 行`).join("\n")}`,
      );
    }
  }
  if (input.interrupted)
    sections.push("你上次发言被中止，已记录的部分如上。请结合新增内容重新发言。");
  sections.push(
    input.phase === "summarizing"
      ? `## 本次要求\n请按下面的梳理模板总结整场讨论：\n${discussion.closing?.summaryPrompt ?? ""}`
      : input.phase === "final_round"
        ? "## 本次要求\n这是你本次讨论的最后一次发言。请完整表达你的最后意见，说明已改动的文件和未解决的问题。"
        : "## 本次要求\n请以自己的身份回应新增内容，推进讨论。可以修改共享工作区文件，并在发言中说明改动。不要代替其他座位发言，也不要复述材料原文。",
  );
  sections.push(discussionBriefPhaseMarker(input.phase));
  return sections.join("\n\n");
}
