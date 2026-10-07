/** Chinese chat messages checked at the literal declaration. */
import type { Messages } from "../en";

export const chat: Messages["chat"] = {
  /** Formats a conversation count without an English plural branch. */
  threadCount: (count) => `${count} 个对话`,
};
