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

/**
 * Creates real router matches without application subscriptions or RPCs.
 * @param pathname Initial history address.
 * @param threadLoader Optional controlled loader for a destination thread.
 * @param detailLoader Optional controlled loader for discussion content.
 * @returns An isolated memory-history router using the installed implementation.
 */
function createDiscussionRouter(
  pathname: string,
  threadLoader?: () => Promise<void>,
  detailLoader?: () => Promise<void>,
) {
  const root = createRootRoute();
  const chat = createRoute({ getParentRoute: () => root, id: "_chat" });
  const detail = createRoute({
    getParentRoute: () => chat,
    path: "discussions/$environmentId/$discussionId",
    ...(detailLoader ? { loader: detailLoader } : {}),
  });
  const list = createRoute({ getParentRoute: () => chat, path: "discussions" });
  const thread = createRoute({
    getParentRoute: () => chat,
    path: "$environmentId/$threadId",
    ...(threadLoader ? { loader: threadLoader } : {}),
  });
  return createRouter({
    routeTree: root.addChildren([chat.addChildren([detail, list, thread])]),
    history: createMemoryHistory({ initialEntries: [pathname] }),
  });
}

describe("discussion deletion navigation", () => {
  it("does not redirect after leaving a discussion while the destination loader is pending", async () => {
    let enterLoader!: () => void;
    let finishLoader!: () => void;
    const entered = new Promise<void>((resolve) => {
      enterLoader = resolve;
    });
    const unfinished = new Promise<void>((resolve) => {
      finishLoader = resolve;
    });
    const router = createDiscussionRouter("/discussions/env/a", async () => {
      enterLoader();
      await unfinished;
    });
    await router.load();
    router.history.push("/env/thread");
    const loading = router.load();
    await entered;
    try {
      expect(router.latestLocation.pathname).toBe("/env/thread");
      expect(router.state.matches.at(-1)?.routeId).toBe(
        "/_chat/discussions/$environmentId/$discussionId",
      );
      expect(discussionDeleteShouldNavigate(router, "env", "a")).toBe(false);
    } finally {
      finishLoader();
      await loading;
    }
  });

  it("still redirects when deletion removes content without changing the discussion address", async () => {
    let enterLoader!: () => void;
    let finishLoader!: () => void;
    const entered = new Promise<void>((resolve) => {
      enterLoader = resolve;
    });
    const unfinished = new Promise<void>((resolve) => {
      finishLoader = resolve;
    });
    const router = createDiscussionRouter("/discussions/env/a", undefined, async () => {
      enterLoader();
      await unfinished;
    });
    const loading = router.load();
    await entered;
    try {
      expect(router.state.matches).toEqual([]);
      expect(discussionDeleteShouldNavigate(router, "env", "a")).toBe(true);
    } finally {
      finishLoader();
      await loading;
    }
  });

  it.each([
    { pathname: "/discussions/env/a", expected: true },
    { pathname: "/discussions/env/b", expected: false },
    { pathname: "/discussions/other/a", expected: false },
    { pathname: "/discussions", expected: false },
    { pathname: "/env/thread", expected: false },
  ])("$pathname", async ({ pathname, expected }) => {
    const router = createDiscussionRouter(pathname);
    await router.load();
    expect(discussionDeleteShouldNavigate(router, "env", "a")).toBe(expected);
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
    expect(discussionDeleteShouldNavigate(router, environmentId, discussionId)).toBe(true);
  });
});
