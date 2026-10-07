/** Shared Chinese UI labels checked at the literal declaration. */
import type { Messages } from "../en";

export const common: Messages["common"] = {
  system: "系统默认",
  resetToDefault: "恢复默认值",
  /** Builds a complete Chinese reset action name from the setting's UI label. */
  resetLabelToDefault: (label) => `将${label}恢复为默认值`,
};
