/** Tests theme migration, initial application, and storage or desktop failure handling. */
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

function createStorage(overrides: Partial<Storage> = {}): Storage {
  const store = new Map<string, string>();
  return {
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
    removeItem: (key) => {
      store.delete(key);
    },
    setItem: (key, value) => {
      store.set(key, value);
    },
    ...overrides,
  };
}

afterEach(() => {
  vi.doUnmock("react");
  vi.resetModules();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Graphite theme migration", () => {
  it("restores the original mix and preserves the error when the theme write fails", async () => {
    const storage = createStorage();
    const originalMix = '{ "light": "t3-chat", "dark": "ocean" }';
    const cause = new Error("theme storage quota exceeded");
    storage.setItem("t3code:theme", "system");
    storage.setItem("t3code:theme-halves:v1", originalMix);
    const setItem = storage.setItem.bind(storage);
    vi.spyOn(storage, "setItem").mockImplementation((key, value) => {
      if (key === "t3code:theme") throw cause;
      setItem(key, value);
    });
    vi.stubGlobal("window", { localStorage: storage });

    const { readThemePreference, ThemeStorageError } = await import("./useTheme");

    const error = (() => {
      try {
        readThemePreference();
      } catch (failure) {
        return failure;
      }
      return undefined;
    })();
    expect(error).toBeInstanceOf(ThemeStorageError);
    expect(error).toMatchObject({
      operation: "write",
      storageKey: "t3code:theme",
      theme: "graphite",
      cause,
    });
    expect(storage.getItem("t3code:theme-halves:v1")).toBe(originalMix);
    expect(storage.getItem("t3code:theme")).toBe("system");
    expect(storage.getItem("t3code:theme-migrated-graphite")).toBeNull();
  });

  it("initializes empty storage with Graphite and records the migration before first application", async () => {
    const storage = createStorage();
    vi.stubGlobal("window", { localStorage: storage });
    const toggle = vi.fn(() => ({
      theme: storage.getItem("t3code:theme"),
      migrated: storage.getItem("t3code:theme-migrated-graphite"),
    }));
    vi.stubGlobal("document", { documentElement: { classList: { toggle } } });

    const { readThemePreference } = await import("./useTheme");

    expect(readThemePreference()).toBe("graphite");
    expect(storage.getItem("t3code:theme")).toBe("graphite");
    expect(storage.getItem("t3code:theme-migrated-graphite")).not.toBeNull();
    expect(toggle).toHaveBeenCalledWith("dark", true);
    expect(toggle.mock.results[0]?.value).toEqual({ theme: "graphite", migrated: "true" });
  });

  it("replaces an old preference and light mix with Graphite once", async () => {
    const storage = createStorage();
    storage.setItem("t3code:theme", "system");
    storage.setItem("t3code:theme-appearance-mode", "light");
    storage.setItem("t3code:theme-halves:v1", JSON.stringify({ light: "t3-chat" }));
    vi.stubGlobal("window", { localStorage: storage });
    const toggle = vi.fn();
    vi.stubGlobal("document", { documentElement: { classList: { toggle } } });

    const { readThemePreference } = await import("./useTheme");

    expect(readThemePreference()).toBe("graphite");
    expect(storage.getItem("t3code:theme")).toBe("graphite");
    expect(storage.getItem("t3code:theme-migrated-graphite")).not.toBeNull();
    expect(storage.getItem("t3code:theme-halves:v1")).toBeNull();
    expect(toggle).toHaveBeenCalledWith("dark", true);
  });

  it("preserves a later theme choice when the migration key exists", async () => {
    const storage = createStorage();
    storage.setItem("t3code:theme", "ocean");
    storage.setItem("t3code:theme-migrated-graphite", "");
    vi.stubGlobal("window", { localStorage: storage });

    const { readThemePreference, writeThemePreference } = await import("./useTheme");

    expect(readThemePreference()).toBe("ocean");
    writeThemePreference("system");
    expect(readThemePreference()).toBe("system");
    expect(storage.getItem("t3code:theme")).toBe("system");
    expect(storage.getItem("t3code:theme-migrated-graphite")).toBe("");
  });
});

describe("theme failure handling", () => {
  it("preserves exact storage causes and operation context", async () => {
    const readCause = new Error("storage read blocked");
    const writeCause = new Error("storage quota exceeded");
    vi.stubGlobal("window", {
      localStorage: createStorage({
        getItem: () => {
          throw readCause;
        },
        setItem: () => {
          throw writeCause;
        },
      }),
    });

    const { readThemePreference, ThemeStorageError, writeThemePreference } =
      await import("./useTheme");

    try {
      readThemePreference();
      expect.unreachable("expected the theme read to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ThemeStorageError);
      expect(error).toMatchObject({
        operation: "read",
        storageKey: "t3code:theme",
        cause: readCause,
      });
    }

    try {
      writeThemePreference("dark");
      expect.unreachable("expected the theme write to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ThemeStorageError);
      expect(error).toMatchObject({
        operation: "write",
        storageKey: "t3code:theme",
        theme: "dark",
        cause: writeCause,
      });
    }
  });

  it("reads the persisted T3 Chat theme preference", async () => {
    vi.stubGlobal("window", {
      localStorage: createStorage({
        getItem: () => "t3-chat",
      }),
    });

    const { readThemePreference } = await import("./useTheme");

    expect(readThemePreference()).toBe("t3-chat");
  });

  it("falls back during initial theme application and logs only safe attributes", async () => {
    const cause = new Error("private browsing storage failure");
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("window", {
      localStorage: createStorage({
        getItem: () => {
          throw cause;
        },
      }),
      matchMedia: () => ({ matches: false }),
    });
    vi.stubGlobal("document", {
      documentElement: {
        classList: { toggle: vi.fn() },
      },
    });

    await expect(import("./useTheme")).resolves.toBeDefined();

    expect(errorLog).toHaveBeenCalledWith(
      "Failed to read theme preference for t3code:theme.",
      expect.objectContaining({
        operation: "read",
        storageKey: "t3code:theme",
        errorTag: "ThemeStorageError",
      }),
    );
    const attributes = errorLog.mock.calls[0]?.[1];
    expect(attributes).not.toHaveProperty("cause");
    expect(JSON.stringify(attributes)).not.toContain(cause.message);
  });

  it("retries a failed storage read only after a relevant storage event", async () => {
    const cause = new Error("persistent storage failure");
    const themeGetItem = vi.fn((): string | null => {
      throw cause;
    });
    const getItem = vi.fn((key: string) => (key === "t3code:theme" ? themeGetItem() : null));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    let readSnapshot: (() => unknown) | undefined;
    let subscribeToTheme: ((listener: () => void) => () => void) | undefined;
    let storageHandler: ((event: StorageEvent) => void) | undefined;
    vi.doMock("react", () => ({
      useCallback: <A>(callback: A) => callback,
      useEffect: () => undefined,
      useSyncExternalStore: (
        subscribe: (listener: () => void) => () => void,
        getSnapshot: () => unknown,
      ) => {
        subscribeToTheme = subscribe;
        readSnapshot = getSnapshot;
        return getSnapshot();
      },
    }));
    vi.stubGlobal("window", {
      addEventListener: (type: string, listener: (event: StorageEvent) => void) => {
        if (type === "storage") storageHandler = listener;
      },
      localStorage: createStorage({ getItem }),
      matchMedia: () => ({
        matches: false,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
      removeEventListener: () => undefined,
    });

    const { useTheme } = await import("./useTheme");
    useTheme();
    readSnapshot?.();
    readSnapshot?.();

    expect(themeGetItem).toHaveBeenCalledTimes(1);
    expect(errorLog).toHaveBeenCalledTimes(1);

    const unsubscribe = subscribeToTheme?.(() => undefined);
    storageHandler?.({ key: "t3code:theme" } as StorageEvent);
    readSnapshot?.();

    expect(themeGetItem).toHaveBeenCalledTimes(2);
    expect(errorLog).toHaveBeenCalledTimes(2);
    unsubscribe?.();
  });

  it("preserves desktop sync causes and retries after a failed cosmetic sync", async () => {
    const cause = new Error("desktop IPC unavailable");
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const setTheme = vi.fn().mockRejectedValue(cause);
    vi.stubGlobal("window", { desktopBridge: { setTheme } });

    const { DesktopThemeSyncError, syncDesktopTheme, syncDesktopThemePreference } =
      await import("./useTheme");

    const error = await syncDesktopThemePreference({ setTheme }, "dark").then(
      () => undefined,
      (failure: unknown) => failure,
    );
    expect(error).toBeInstanceOf(DesktopThemeSyncError);
    expect(error).toMatchObject({ theme: "dark", cause });

    setTheme.mockClear();
    syncDesktopTheme("dark");
    await Promise.resolve();
    await Promise.resolve();
    syncDesktopTheme("dark");
    await Promise.resolve();
    await Promise.resolve();

    expect(setTheme).toHaveBeenCalledTimes(2);
    expect(errorLog).toHaveBeenCalledWith(
      "Failed to sync the dark theme to the desktop shell.",
      expect.objectContaining({
        theme: "dark",
        errorTag: "DesktopThemeSyncError",
      }),
    );
    for (const [, attributes] of errorLog.mock.calls) {
      expect(attributes).not.toHaveProperty("cause");
      expect(JSON.stringify(attributes)).not.toContain(cause.message);
    }
  });
});
