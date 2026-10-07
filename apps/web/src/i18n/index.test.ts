/** Tests dictionary installation, startup fallback, and Node isolation without React. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { activeLocale, installLocaleMessages, installMessages, t } from "./index";
import { en } from "./locales/en";
import { messages } from "./locales/zh-CN";

beforeEach(() => {
  installMessages("en", en);
  vi.stubGlobal("window", {});
  vi.stubGlobal("document", { documentElement: { lang: "" } });
});
afterEach(() => {
  installMessages("en", en);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("installLocaleMessages", () => {
  it("installs English synchronously without loading a chunk", async () => {
    installMessages("zh-CN", messages);
    const loader = vi.fn(async () => ({ messages }));
    const pending = installLocaleMessages("en", loader);
    expect(t).toBe(en);
    expect(activeLocale).toBe("en");
    expect(document.documentElement.lang).toBe("en");
    await pending;
    expect(loader).not.toHaveBeenCalled();
  });
  it("loads Chinese before replacing the dictionary and document language", async () => {
    const loader = vi.fn(async () => ({ messages }));
    await installLocaleMessages("zh-CN", loader);
    expect(loader).toHaveBeenCalledOnce();
    expect(t).toBe(messages);
    expect(t.settings.rows.language.title).toBe("语言");
    expect(activeLocale).toBe("zh-CN");
    expect(document.documentElement.lang).toBe("zh-CN");
  });
  it("resolves the saved startup choice with the real dictionary loader", async () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => "zh-CN" } });
    await installLocaleMessages();
    expect(t).toBe(messages);
    expect(activeLocale).toBe("zh-CN");
  });
  it.each(["reject", "undefined"])(
    "falls back to English when the loader returns %s",
    async (failure) => {
      installMessages("zh-CN", messages);
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      await installLocaleMessages("zh-CN", async () => {
        if (failure === "reject") throw new Error("offline");
        return undefined;
      });
      expect(t).toBe(en);
      expect(activeLocale).toBe("en");
      expect(document.documentElement.lang).toBe("en");
      expect(log).toHaveBeenCalledOnce();
    },
  );
  it.each(["window", "document"])(
    "keeps English without %s despite Chinese navigator",
    async (global) => {
      vi.stubGlobal(global, undefined);
      vi.stubGlobal("navigator", { languages: ["zh-CN"] });
      const loader = vi.fn(async () => ({ messages }));
      await installLocaleMessages("zh-CN", loader);
      expect(t).toBe(en);
      expect(activeLocale).toBe("en");
      expect(loader).not.toHaveBeenCalled();
    },
  );
  it("keeps bootstrap's partial Node document stub in English", async () => {
    vi.stubGlobal("window", { location: {} });
    vi.stubGlobal("document", {});
    vi.stubGlobal("navigator", { languages: ["zh-CN"] });
    await installLocaleMessages();
    expect(t).toBe(en);
    expect(activeLocale).toBe("en");
  });
});
