/** Checks the product's state precedence, including stale runtime state after deletion or pause. */
import { expect, it } from "vite-plus/test";
import { resolveWebPagesPageState } from "./webPagesPageState";

it("prioritizes desktop availability, saved selection, pause, and failure in that order", () => {
  const entry = { id: "chat", name: "Chat", url: "https://chatgpt.com/" };
  const nav = {
    url: entry.url,
    title: "Chat",
    loading: false,
    failure: { code: -105, description: "Host not found" },
    canGoBack: false,
    canGoForward: false,
  };
  expect(resolveWebPagesPageState({ desktop: false, entry, opened: true, nav })).toBe(
    "desktop-only",
  );
  expect(
    resolveWebPagesPageState({ desktop: false, entry: null, opened: false, nav: undefined }),
  ).toBe("desktop-only");
  expect(resolveWebPagesPageState({ desktop: true, entry: undefined, opened: true, nav })).toBe(
    "empty",
  );
  expect(
    resolveWebPagesPageState({ desktop: true, entry: null, opened: false, nav: undefined }),
  ).toBe("empty");
  expect(resolveWebPagesPageState({ desktop: true, entry, opened: false, nav })).toBe("paused");
  expect(resolveWebPagesPageState({ desktop: true, entry, opened: true, nav })).toBe("failed");
  expect(resolveWebPagesPageState({ desktop: true, entry, opened: true, nav: undefined })).toBe(
    "ready",
  );
  expect(
    resolveWebPagesPageState({
      desktop: true,
      entry,
      opened: true,
      nav: { ...nav, loading: true, failure: null },
    }),
  ).toBe("ready");
});
