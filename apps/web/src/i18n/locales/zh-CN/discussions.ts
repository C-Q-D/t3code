/** Chinese copy for discussion navigation, the list and future page placeholders. */
import type { Messages } from "../en";

export const discussions: Messages["discussions"] = {
  title: "讨论",
  newTitle: "新建讨论",
  ongoing: (count: number) => `进行中 · ${count}`,
  endedGroup: (count: number) => `已结束 · ${count}`,
  round: (round: number) => `第 ${round} 轮`,
  totalRounds: (round: number) => `共 ${round} 轮`,
  speaking: (personaName: string) => (personaName ? `发言中 · ${personaName}` : "发言中"),
  closing: "收尾中",
  paused: "已停下",
  seatFailed: "已停下 · 发言失败",
  ended: "已结束",
  deletedProject: "已删除的项目",
  empty: "还没有讨论",
  loading: "正在加载讨论…",
  loadFailed: "加载讨论失败",
  newPlaceholder: "新建讨论在后续版本提供",
  pagePlaceholder: "讨论页在后续版本提供",
};
