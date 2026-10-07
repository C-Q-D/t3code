/** Tests device language resolution and guarded browser storage without a DOM. */
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  isLocalePreference,
  LOCALE_STORAGE_KEY,
  readLocalePreference,
  readSystemLocaleTags,
  resolveActiveLocale,
  resolveLocale,
  writeLocalePreference,
} from "./locale";

afterEach(() => vi.unstubAllGlobals());

describe("resolveLocale", () => {
  it.each(["zh", "zh-CN", "zh-Hans-CN", "zh_CN", "zh-TW", "zh-HK", "zh-Hant", "ZH-cn"])(
    "maps %s to Simplified Chinese",
    (tag) => expect(resolveLocale("system", [tag])).toBe("zh-CN"),
  );
  it("gives explicit choices priority over system languages", () => {
    expect(resolveLocale("en", ["zh-CN"])).toBe("en");
    expect(resolveLocale("zh-CN", ["en-US"])).toBe("zh-CN");
    expect(resolveLocale("system", ["en-US", "zh-TW"])).toBe("zh-CN");
  });
  it.each([{ tags: [] }, { tags: ["fr-FR"] }, { tags: ["unknown"] }, { tags: ["zho"] }])(
    "uses English for $tags",
    ({ tags }) => {
      expect(resolveLocale("system", tags)).toBe("en");
    },
  );
});

describe("device preference storage", () => {
  it.each(["system", "en", "zh-CN"])("accepts %s", (value) => {
    vi.stubGlobal("window", { localStorage: { getItem: () => value } });
    expect(isLocalePreference(value)).toBe(true);
    expect(readLocalePreference()).toBe(value);
  });
  it.each([null, "", "zh", "fr", "undefined"])("falls back for %s", (value) => {
    vi.stubGlobal("window", { localStorage: { getItem: () => value } });
    expect(isLocalePreference(value)).toBe(false);
    expect(readLocalePreference()).toBe("system");
  });
  it("falls back when window is absent", () => {
    vi.stubGlobal("window", undefined);
    expect(readLocalePreference()).toBe("system");
    expect(writeLocalePreference("en")).toBe(false);
  });
  it("handles a blocked localStorage property for both reads and writes", () => {
    vi.stubGlobal("window", {
      get localStorage() {
        throw new Error("SecurityError");
      },
    });
    expect(readLocalePreference()).toBe("system");
    expect(writeLocalePreference("zh-CN")).toBe(false);
  });
  it("handles storage operation failures", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("SecurityError");
        },
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
      },
    });
    expect(readLocalePreference()).toBe("system");
    expect(writeLocalePreference("zh-CN")).toBe(false);
  });
  it("persists and resolves a device choice", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });
    vi.stubGlobal("navigator", { languages: ["zh-TW"] });
    expect(resolveActiveLocale()).toBe("zh-CN");
    expect(writeLocalePreference("en")).toBe(true);
    expect(storage.get(LOCALE_STORAGE_KEY)).toBe("en");
    expect(readLocalePreference()).toBe("en");
    expect(resolveActiveLocale()).toBe("en");
  });
});

describe("readSystemLocaleTags", () => {
  it("prefers the desktop OS locale over Electron navigator", () => {
    vi.stubGlobal("window", { desktopBridge: { getSystemLocale: () => "zh-TW" } });
    vi.stubGlobal("navigator", { languages: ["en-US"], language: "en-US" });
    expect(readSystemLocaleTags()).toEqual(["zh-TW"]);
  });
  it("falls back to browser languages when the bridge has no locale", () => {
    vi.stubGlobal("window", { desktopBridge: { getSystemLocale: () => null } });
    vi.stubGlobal("navigator", { languages: ["fr-FR", "zh-CN"], language: "fr-FR" });
    expect(readSystemLocaleTags()).toEqual(["fr-FR", "zh-CN"]);
  });
  it("uses language when languages is absent", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", { language: "zh_CN" });
    expect(readSystemLocaleTags()).toEqual(["zh_CN"]);
  });
  it("returns no tags without window even if Node has navigator", () => {
    vi.stubGlobal("window", undefined);
    vi.stubGlobal("navigator", { languages: ["zh-CN"] });
    expect(readSystemLocaleTags()).toEqual([]);
  });
});
