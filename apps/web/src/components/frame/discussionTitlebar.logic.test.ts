/** Guards the discrete titlebar threshold; CSS owns widths within each region. */
import { describe, expect, it } from "vite-plus/test";
import { resolveDiscussionTitlebarLayout } from "./discussionTitlebar.logic";

describe("discussion titlebar space", () => {
  it("selects the menu at 1025px and up to the full-layout threshold", () => {
    // H1 leaves 453px before the panel; the titlebar has 16px left frame padding.
    const layout = resolveDiscussionTitlebarLayout(453 - 16);
    expect(layout.compact).toBe(true);
    expect(resolveDiscussionTitlebarLayout(715).compact).toBe(true);
  });

  it.each([716, 900, 1400])("selects full actions for a %spx content box", (width) => {
    const layout = resolveDiscussionTitlebarLayout(width);
    expect(layout.compact).toBe(false);
  });
});
