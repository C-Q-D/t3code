/** Protects frame gutter accounting and persisted/default width behavior with literal geometry. */
import { describe, expect, it } from "vite-plus/test";

import {
  resolveFrameGeometry,
  resolveFrameInitialSidebarWidth,
  resolveFrameSidebarMaximumWidth,
} from "./frameGeometry";

const frame = {
  sidebarWidth: 276,
  horizontalSpace: 116,
};

describe("frame sidebar geometry", () => {
  it("reserves a 52px project rail, two 16px paddings, and two 16px gaps", () => {
    expect(
      resolveFrameGeometry({
        sidebarWidth: 276,
        projectbarWidth: 52,
        paddingInline: 16,
        slabGap: 16,
      }),
    ).toEqual({ sidebarWidth: 276, horizontalSpace: 116 });
  });

  it("deducts the frame's 116px before reserving the main area's 640px", () => {
    expect(resolveFrameSidebarMaximumWidth(1920, 208, frame)).toBe(1164);
  });

  it.each([
    { viewport: 964, minimum: 208, expected: 208 },
    { viewport: 965, minimum: 208, expected: 209 },
    { viewport: 320, minimum: 300, expected: 300 },
  ])(
    "keeps maximum $expected at viewport $viewport with minimum $minimum",
    ({ viewport, minimum, expected }) => {
      expect(resolveFrameSidebarMaximumWidth(viewport, minimum, frame)).toBe(expected);
    },
  );

  it.each([
    { sidebarWidth: 276, expected: 276 },
    { sidebarWidth: 304, expected: 304 },
  ])(
    "restores token default $sidebarWidth when no user width is stored",
    ({ sidebarWidth, expected }) => {
      expect(resolveFrameInitialSidebarWidth(null, 1920, { ...frame, sidebarWidth })).toBe(
        expected,
      );
    },
  );

  it.each([
    { storedWidth: 352, expected: 352 },
    { storedWidth: 100, expected: 208 },
    { storedWidth: 4096, expected: 1164 },
  ])(
    "restores stored width $storedWidth with existing clamps to $expected",
    ({ storedWidth, expected }) => {
      expect(resolveFrameInitialSidebarWidth(storedWidth, 1920, frame)).toBe(expected);
    },
  );
});
