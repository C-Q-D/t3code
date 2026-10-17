/** Checks joint reveal bounds and the single-sided policy when Provider overlays leave too little room. */
import { describe, expect, it } from "vite-plus/test";
import { resolveThreadFindRevealBounds } from "./useThreadFindNavigation.logic";

describe("thread find reveal bounds", () => {
  it.each([
    {
      label: "absent banner",
      bannerBottom: null,
      expected: { top: 296, bottom: 604, alignTop: false },
    },
    {
      label: "single-line banner",
      bannerBottom: 308,
      expected: { top: 308, bottom: 604, alignTop: false },
    },
    {
      label: "wrapped banner",
      bannerBottom: 352,
      expected: { top: 352, bottom: 604, alignTop: false },
    },
    {
      label: "banner above the existing margin",
      bannerBottom: 280,
      expected: { top: 296, bottom: 604, alignTop: false },
    },
  ])("uses unobscured bounds with $label", ({ bannerBottom, expected }) => {
    expect(
      resolveThreadFindRevealBounds({
        viewportTop: 200,
        viewportBottom: 800,
        contentInsetEndAdjustment: 100,
        matchHeight: 20,
        maxMargin: 96,
        bannerBottom,
      }),
    ).toEqual(expected);
  });

  it.each([
    {
      label: "short space without a banner",
      bannerBottom: null,
      composerInset: 400,
      expected: { top: 90, bottom: 110, alignTop: false },
    },
    {
      label: "short space with a banner",
      bannerBottom: 108,
      composerInset: 400,
      expected: { top: 108, bottom: 164, alignTop: false },
    },
    {
      label: "exactly enough space",
      bannerBottom: 108,
      composerInset: 472,
      expected: { top: 108, bottom: 128, alignTop: false },
    },
    {
      label: "insufficient space",
      bannerBottom: 108,
      composerInset: 490,
      expected: { top: 108, bottom: 110, alignTop: true },
    },
  ])(
    "resolves $label without incompatible margins",
    ({ bannerBottom, composerInset, expected }) => {
      expect(
        resolveThreadFindRevealBounds({
          viewportTop: 0,
          viewportBottom: 600,
          contentInsetEndAdjustment: composerInset,
          matchHeight: 20,
          maxMargin: 96,
          bannerBottom,
        }),
      ).toEqual(expected);
    },
  );
});
