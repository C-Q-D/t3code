/** Protects discussion entry visibility and route selection independently of rendered markup. */
import { describe, expect, it } from "vite-plus/test";

import { discussionDeleteShouldNavigate } from "./discussionPage.logic";
import { discussionNavigationState } from "./discussionNavigation.logic";

describe("discussionNavigationState", () => {
  it.each([
    { hasProjects: true, pathname: "/discussions", expected: { visible: true, isActive: true } },
    { hasProjects: true, pathname: "/env/thread", expected: { visible: true, isActive: false } },
    {
      hasProjects: false,
      pathname: "/discussions/new",
      expected: { visible: false, isActive: false },
    },
    { hasProjects: false, pathname: "/env/thread", expected: { visible: false, isActive: false } },
  ])("resolves projects=$hasProjects on $pathname", ({ hasProjects, pathname, expected }) => {
    expect(discussionNavigationState(hasProjects, pathname)).toEqual(expected);
  });

  it("selects a discussion detail route and rejects an unrelated shared prefix", () => {
    expect(discussionNavigationState(true, "/discussions/env/discussion")).toEqual({
      visible: true,
      isActive: true,
    });
    expect(discussionNavigationState(true, "/discussions-other")).toEqual({
      visible: true,
      isActive: false,
    });
  });
});

describe("discussion deletion navigation", () => {
  it.each([
    { pathname: "/discussions/env/a", expected: true },
    { pathname: "/discussions/env/b", expected: false },
    { pathname: "/discussions/other/a", expected: false },
    { pathname: "/discussions", expected: false },
    { pathname: "/env/thread", expected: false },
  ])("$pathname", ({ pathname, expected }) => {
    expect(discussionDeleteShouldNavigate(pathname, "env", "a")).toBe(expected);
  });
});
