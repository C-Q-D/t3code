/** Protects exclusive placement and composer counts when T2 notices move to the timeline. */
import { describe, expect, it } from "vite-plus/test";
import { partitionTimelineBanners } from "./timelineBannerRouting.logic";

describe("timeline banner routing", () => {
  it.each([
    { id: "branch-mismatch:thread-a", variant: "info" },
    { id: "environment-unavailable:offline", variant: "warning" },
    { id: "environment-unavailable:reconnecting", variant: "warning" },
    { id: "project-clone:running", variant: "info" },
    { id: "project-clone:cancelled", variant: "warning" },
    { id: "project-clone:failed", variant: "error" },
  ])("places $id only in the timeline, excluding it from composer counts", (state) => {
    const usage = { id: "usage-limit", variant: "warning" };
    const update = { id: "server-version:host", variant: "default" };
    const result = partitionTimelineBanners([usage, state, update]);
    expect(result.timeline).toEqual([state]);
    expect(result.timeline[0]).toBe(state);
    expect(result.composer).toEqual([usage, update]);
    expect(result.composer).toHaveLength(2);
  });

  it("retains existing activity and severity ordering without mutating source items", () => {
    const branch = { id: "branch-mismatch:thread-a", variant: "info" };
    const offline = { id: "environment-unavailable:host", variant: "warning" };
    const clone = { id: "project-clone:project-a", variant: "info", priority: "activity" };
    const items = Object.freeze([branch, offline, clone]);
    expect(partitionTimelineBanners(items)).toEqual({
      timeline: [clone, offline, branch],
      composer: [],
    });
    expect(items).toEqual([branch, offline, clone]);
  });

  it("keeps non-T2 notices and custom content in their existing composer order", () => {
    const items = [
      { id: "usage-limit", variant: "warning" },
      { id: "background-work", variant: "info", content: "running" },
      { id: "server-version:host", variant: "default" },
    ];
    expect(partitionTimelineBanners(items)).toEqual({ timeline: [], composer: items });
    expect(partitionTimelineBanners([])).toEqual({ timeline: [], composer: [] });
  });
});
