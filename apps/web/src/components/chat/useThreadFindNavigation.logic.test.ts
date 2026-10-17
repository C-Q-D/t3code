/** Checks reveal boundaries against measured Provider overlays, including wrapped messages. */
import { describe, expect, it } from "vite-plus/test";
import { resolveThreadFindRevealTop } from "./useThreadFindNavigation.logic";

describe("thread find reveal top", () => {
  it.each([
    { label: "absent banner", bannerBottom: null, expected: 296 },
    { label: "single-line banner", bannerBottom: 308, expected: 308 },
    { label: "wrapped banner", bannerBottom: 352, expected: 352 },
    { label: "banner above the existing margin", bannerBottom: 280, expected: 296 },
  ])("uses the unobscured boundary with $label", ({ bannerBottom, expected }) => {
    expect(resolveThreadFindRevealTop({ viewportTop: 200, margin: 96, bannerBottom })).toBe(
      expected,
    );
  });
});
