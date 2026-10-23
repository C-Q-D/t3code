/** Locks generation gates to the run lifecycle, including retained terminal states. */
import { expect, it } from "vite-plus/test";
import { isComposerThreadGenerating } from "./isComposerThreadGenerating.ts";

it.each([
  ["idle", false],
  ["preparing", true],
  ["queued", true],
  ["starting", true],
  ["running", true],
  ["waiting", true],
  ["completed", false],
  ["interrupted", false],
  ["failed", false],
  ["cancelled", false],
  ["rolled_back", false],
] as const)("classifies %s with no active run as generating=%s", (status, expected) => {
  expect(isComposerThreadGenerating({ status, activeRunId: null })).toBe(expected);
});

it("treats an active run as generating despite a retained completed status", () => {
  expect(isComposerThreadGenerating({ status: "completed", activeRunId: "run-active" })).toBe(true);
});
