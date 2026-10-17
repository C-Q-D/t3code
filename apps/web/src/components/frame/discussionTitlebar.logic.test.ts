/** Guards the titlebar's available-space budget at the first inline discussion width. */
import { describe, expect, it } from "vite-plus/test";
import { resolveDiscussionTitlebarLayout } from "./discussionTitlebar.logic";

describe("discussion titlebar space", () => {
  it("fits the 1025px window and reserves a clickable menu before the title", () => {
    // H1 leaves 453px before the panel; the titlebar has 16px left frame padding.
    const layout = resolveDiscussionTitlebarLayout(453 - 16);
    expect(layout.compact).toBe(true);
    expect(layout.actions).toBe(44); // 32px menu plus the existing 12px right gutter.
    expect(layout.title).toBeGreaterThan(0);
    expect(
      layout.leading + layout.spacer + layout.title + layout.gap + layout.actions + 16,
    ).toBeLessThanOrEqual(453);
  });

  it.each([716, 900, 1400])("keeps full actions inside a %spx content box", (width) => {
    const layout = resolveDiscussionTitlebarLayout(width);
    expect(layout.compact).toBe(false);
    expect(layout.title).toBeGreaterThanOrEqual(160);
    expect(layout.leading + layout.spacer + layout.title + layout.gap + layout.actions).toBe(width);
    expect(layout.spacer).toBeLessThanOrEqual(190);
  });
});
