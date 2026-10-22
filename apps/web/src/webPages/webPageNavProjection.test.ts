/** Guards desktop-to-page projection and session eligibility against the page-host contract. */
import type { DesktopPreviewTabState } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import {
  projectWebPageFavicon,
  projectWebPageNav,
  shouldRememberWebPageUrl,
} from "./webPageNavProjection";

/** Supplies unrelated desktop fields while leaving navigation explicit in each case. */
function state(navStatus: DesktopPreviewTabState["navStatus"]): DesktopPreviewTabState {
  return {
    tabId: "web-page:chat",
    webContentsId: 12,
    navStatus,
    canGoBack: true,
    canGoForward: false,
    zoomFactor: 1,
    pictureInPicture: false,
    colorScheme: "system",
    audioMuted: false,
    audible: false,
    controller: "human",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("page navigation projection", () => {
  it("publishes no navigation for an idle tab", () => {
    expect(projectWebPageNav(state({ kind: "Idle" }))).toBeNull();
  });

  it.each([
    ["Loading", true],
    ["Success", false],
  ] as const)("projects %s without a failure", (kind, loading) => {
    expect(
      projectWebPageNav(state({ kind, url: "https://chatgpt.com/c/1", title: "Chat" })),
    ).toEqual({
      url: "https://chatgpt.com/c/1",
      title: "Chat",
      loading,
      failure: null,
      canGoBack: true,
      canGoForward: false,
    });
  });

  it("keeps a load failure distinct from loading and preserves both history flags", () => {
    expect(
      projectWebPageNav({
        ...state({
          kind: "LoadFailed",
          url: "https://example.com/",
          title: "Offline",
          code: -105,
          description: "Name not resolved",
        }),
        canGoBack: false,
        canGoForward: true,
      }),
    ).toEqual({
      url: "https://example.com/",
      title: "Offline",
      loading: false,
      failure: { code: -105, description: "Name not resolved" },
      canGoBack: false,
      canGoForward: true,
    });
  });

  it.each([
    ["https://chatgpt.com/other", "data:image/png;base64,YQ=="],
    ["https://example.com/", null],
    ["http://chatgpt.com/", null],
    ["https://chatgpt.com:444/", null],
    ["invalid", null],
  ])("checks the captured page origin: %s", (pageUrl, expected) => {
    expect(
      projectWebPageFavicon({
        ...state({ kind: "Success", url: "https://chatgpt.com/c/1", title: "Chat" }),
        favicon: { pageUrl: pageUrl!, dataUrl: "data:image/png;base64,YQ==", capturedAt: 1 },
      }),
    ).toBe(expected);
  });

  it("does not use an icon without a valid current origin", () => {
    const favicon = { pageUrl: "invalid", dataUrl: "old", capturedAt: 1 };
    expect(projectWebPageFavicon({ ...state({ kind: "Idle" }), favicon })).toBeNull();
    expect(
      projectWebPageFavicon({ ...state({ kind: "Success", url: "invalid", title: "" }), favicon }),
    ).toBeNull();
    expect(
      projectWebPageFavicon(state({ kind: "Success", url: "https://example.com/", title: "" })),
    ).toBeNull();
  });

  it.each(["Loading", "Success"] as const)(
    "remembers changed HTTP(S) addresses during %s",
    (kind) => {
      expect(
        shouldRememberWebPageUrl(state({ kind, url: "https://chatgpt.com/c/1", title: "" }), null),
      ).toBe(true);
      expect(
        shouldRememberWebPageUrl(
          state({ kind, url: "http://example.com/", title: "" }),
          "https://example.com/",
        ),
      ).toBe(true);
      expect(
        shouldRememberWebPageUrl(
          state({ kind, url: "https://chatgpt.com/c/1", title: "" }),
          "https://chatgpt.com/c/1",
        ),
      ).toBe(false);
    },
  );

  it.each(["about:blank", "file:///C:/page", "javascript:alert(1)", "invalid"])(
    "does not remember %s",
    (url) => {
      expect(shouldRememberWebPageUrl(state({ kind: "Loading", url, title: "" }), null)).toBe(
        false,
      );
      expect(shouldRememberWebPageUrl(state({ kind: "Success", url, title: "" }), null)).toBe(
        false,
      );
    },
  );

  it("does not remember idle or failed navigation", () => {
    expect(shouldRememberWebPageUrl(state({ kind: "Idle" }), null)).toBe(false);
    expect(
      shouldRememberWebPageUrl(
        state({
          kind: "LoadFailed",
          url: "https://example.com/",
          title: "",
          code: -2,
          description: "Failed",
        }),
        null,
      ),
    ).toBe(false);
  });
});
