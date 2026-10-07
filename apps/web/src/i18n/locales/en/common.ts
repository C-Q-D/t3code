/** Shared English UI labels; excludes persisted values and protocol strings. */
export const common = {
  system: "System default",
  resetToDefault: "Reset to default",
  /** Builds the accessible reset action name for a setting's UI label. */
  resetLabelToDefault: (label: string) => `Reset ${label} to default`,
};
