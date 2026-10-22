// @vitest-environment jsdom
/** Exercises session persistence through localStorage, including unavailable and corrupt storage. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  forgetWebPageSession,
  readWebPageFavicon,
  rememberWebPageFavicon,
  rememberWebPageUrl,
  resolveWebPageStartUrl,
} from "./webPageSession";

const key = "t3code:web-pages:session:v1";
const entry = { id: "chat", name: "Chat", url: "https://chatgpt.com/" };

beforeEach(() => window.localStorage.removeItem(key));
afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.removeItem(key);
});

describe("web-page sessions", () => {
  it("round-trips navigation and icons without losing another entry", () => {
    rememberWebPageUrl(entry, "https://chatgpt.com/c/123");
    rememberWebPageFavicon(entry, "data:image/png;base64,YQ==");
    rememberWebPageUrl({ ...entry, id: "other" }, "https://example.com/other");
    expect(resolveWebPageStartUrl(entry)).toBe("https://chatgpt.com/c/123");
    expect(readWebPageFavicon("chat")).toBe("data:image/png;base64,YQ==");
    expect(JSON.parse(window.localStorage.getItem(key)!)).toEqual({
      chat: {
        baseUrl: "https://chatgpt.com/",
        lastUrl: "https://chatgpt.com/c/123",
        favicon: "data:image/png;base64,YQ==",
      },
      other: {
        baseUrl: "https://chatgpt.com/",
        lastUrl: "https://example.com/other",
        favicon: null,
      },
    });
  });

  it("uses the new entry URL after an edit even when an icon arrives first", () => {
    rememberWebPageUrl(entry, "https://chatgpt.com/c/old");
    const edited = { ...entry, url: "https://deepseek.com/" };
    expect(resolveWebPageStartUrl(edited)).toBe("https://deepseek.com/");
    rememberWebPageFavicon(edited, "data:image/png;base64,Yg==");
    expect(resolveWebPageStartUrl(edited)).toBe("https://deepseek.com/");
    rememberWebPageUrl(edited, "https://deepseek.com/chat/new");
    expect(resolveWebPageStartUrl(edited)).toBe("https://deepseek.com/chat/new");
    expect(readWebPageFavicon("chat")).toBe("data:image/png;base64,Yg==");
  });

  it.each(["javascript:alert(1)", "file:///C:/a", "/relative", "https://", ""])(
    "does not launch an invalid remembered URL: %s",
    (lastUrl) => {
      window.localStorage.setItem(
        key,
        JSON.stringify({ chat: { baseUrl: entry.url, lastUrl, favicon: null } }),
      );
      expect(resolveWebPageStartUrl(entry)).toBe("https://chatgpt.com/");
    },
  );

  it("does not write unchanged hints or remove an already absent entry", () => {
    rememberWebPageUrl(entry, "https://chatgpt.com/c/123");
    rememberWebPageFavicon(entry, "data:image/png;base64,YQ==");
    using writes = vi.spyOn(Storage.prototype, "setItem");
    rememberWebPageUrl(entry, "https://chatgpt.com/c/123");
    rememberWebPageFavicon(entry, "data:image/png;base64,YQ==");
    forgetWebPageSession("missing");
    expect(writes).not.toHaveBeenCalled();
    expect(resolveWebPageStartUrl(entry)).toBe("https://chatgpt.com/c/123");
    expect(readWebPageFavicon("chat")).toBe("data:image/png;base64,YQ==");
  });

  it("forgets only the requested entry and tolerates repeated removal", () => {
    rememberWebPageUrl(entry, "https://chatgpt.com/c/123");
    const other = { ...entry, id: "other" };
    rememberWebPageUrl(other, "https://chatgpt.com/c/other");
    forgetWebPageSession("chat");
    forgetWebPageSession("chat");
    expect(resolveWebPageStartUrl(entry)).toBe("https://chatgpt.com/");
    expect(readWebPageFavicon("chat")).toBeNull();
    expect(resolveWebPageStartUrl(other)).toBe("https://chatgpt.com/c/other");
  });

  it.each(["{", "null", "[]", '{"chat":{"baseUrl":5}}'])(
    "ignores damaged storage without overwriting it: %s",
    (raw) => {
      window.localStorage.setItem(key, raw);
      expect(resolveWebPageStartUrl(entry)).toBe("https://chatgpt.com/");
      expect(readWebPageFavicon("chat")).toBeNull();
      expect(() => rememberWebPageUrl(entry, "https://chatgpt.com/c/123")).not.toThrow();
      expect(() => rememberWebPageFavicon(entry, "data:image/png;base64,YQ==")).not.toThrow();
      expect(() => forgetWebPageSession("chat")).not.toThrow();
      expect(window.localStorage.getItem(key)).toBe(raw);
    },
  );

  it("falls back when reading storage throws", () => {
    using reads = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(resolveWebPageStartUrl(entry)).toBe("https://chatgpt.com/");
    expect(readWebPageFavicon("chat")).toBeNull();
    expect(() => rememberWebPageUrl(entry, "https://chatgpt.com/c/123")).not.toThrow();
    expect(() => rememberWebPageFavicon(entry, "icon")).not.toThrow();
    expect(() => forgetWebPageSession("chat")).not.toThrow();
  });

  it("ignores write failures and leaves the previously saved hints intact", () => {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        chat: { baseUrl: entry.url, lastUrl: "https://chatgpt.com/c/old", favicon: "old-icon" },
      }),
    );
    using writes = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => rememberWebPageUrl(entry, "https://chatgpt.com/c/new")).not.toThrow();
    expect(() => rememberWebPageFavicon(entry, "new-icon")).not.toThrow();
    expect(() => forgetWebPageSession("chat")).not.toThrow();
    expect(resolveWebPageStartUrl(entry)).toBe("https://chatgpt.com/c/old");
    expect(readWebPageFavicon("chat")).toBe("old-icon");
  });
});
