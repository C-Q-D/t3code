/** Protects discussion entry visibility and route selection independently of rendered markup. */
import { describe, expect, it } from "vite-plus/test";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";

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

/** Creates real installed-router matches while excluding application subscriptions and RPCs. */
function createDiscussionRouter(pathname: string) {
  const root = createRootRoute();
  const chat = createRoute({ getParentRoute: () => root, id: "_chat" });
  const detail = createRoute({
    getParentRoute: () => chat,
    path: "discussions/$environmentId/$discussionId",
  });
  const list = createRoute({ getParentRoute: () => chat, path: "discussions" });
  const thread = createRoute({ getParentRoute: () => chat, path: "$environmentId/$threadId" });
  return createRouter({
    routeTree: root.addChildren([chat.addChildren([detail, list, thread])]),
    history: createMemoryHistory({ initialEntries: [pathname] }),
  });
}

describe("discussion deletion navigation", () => {
  it.each([
    { pathname: "/discussions/env/a", expected: true },
    { pathname: "/discussions/env/b", expected: false },
    { pathname: "/discussions/other/a", expected: false },
    { pathname: "/discussions", expected: false },
    { pathname: "/env/thread", expected: false },
  ])("$pathname", async ({ pathname, expected }) => {
    const router = createDiscussionRouter(pathname);
    await router.load();
    expect(
      discussionDeleteShouldNavigate(
        router.state.matches.find(
          (match) => match.routeId === "/_chat/discussions/$environmentId/$discussionId",
        )?.params,
        "env",
        "a",
      ),
    ).toBe(expected);
  });
});

describe("encoded discussion identity", () => {
  it.each([
    { environmentId: "env", discussionId: "含 空格" },
    { environmentId: "环境 甲", discussionId: "a" },
    { environmentId: "env", discussionId: "part/one?two" },
    { environmentId: "part/#%", discussionId: "a" },
  ])("stays on $environmentId / $discussionId", async ({ environmentId, discussionId }) => {
    const router = createDiscussionRouter(
      `/discussions/${encodeURIComponent(environmentId)}/${encodeURIComponent(discussionId)}`,
    );
    await router.load();
    expect(
      discussionDeleteShouldNavigate(
        router.state.matches.find(
          (match) => match.routeId === "/_chat/discussions/$environmentId/$discussionId",
        )?.params,
        environmentId,
        discussionId,
      ),
    ).toBe(true);
  });
});
