/** Checks C1 selection and fallback behavior at the state boundary consumed by the UI. */
import { describe, expect, it, vi } from "vite-plus/test";
import { createBackgroundImageStore, defaultBackgroundUrl } from "./backgroundImage";

const customUrl = "/__t3/background/0123456789abcdef.png";

describe("background image selection", () => {
  it.each([
    {
      name: "saved desktop image",
      bridge: { getBackgroundImage: async () => customUrl },
      expected: customUrl,
    },
    {
      name: "desktop without an image",
      bridge: { getBackgroundImage: async () => null },
      expected: defaultBackgroundUrl,
    },
    { name: "browser without a bridge", bridge: undefined, expected: defaultBackgroundUrl },
  ])("loads $name", async ({ bridge, expected }) => {
    const store = createBackgroundImageStore(bridge);
    await store.getState().load();
    expect(store.getState().url).toBe(expected);
    expect(store.getState().isCustom).toBe(expected === customUrl);
  });

  it("publishes a picked image and restores the bundled image after clearing", async () => {
    const store = createBackgroundImageStore({
      getBackgroundImage: async () => null,
      pickBackgroundImage: async () => customUrl,
      clearBackgroundImage: async () => {},
    });
    const displayedUrls: string[] = [];
    const unsubscribe = store.subscribe((state) => displayedUrls.push(state.url));
    await store.getState().pick();
    expect(store.getState().url).toBe(customUrl);
    expect(store.getState().isCustom).toBe(true);
    await store.getState().clear();
    expect(store.getState().url).toBe(defaultBackgroundUrl);
    expect(store.getState().isCustom).toBe(false);
    expect(displayedUrls).toContain(customUrl);
    expect(displayedUrls.at(-1)).toBe(defaultBackgroundUrl);
    unsubscribe();
  });

  it("keeps the saved image when the picker is cancelled", async () => {
    const store = createBackgroundImageStore({
      getBackgroundImage: async () => customUrl,
      pickBackgroundImage: async () => null,
    });
    await store.getState().pick();
    expect(store.getState().url).toBe(customUrl);
    expect(store.getState().isCustom).toBe(true);
  });

  it("reports a failed clear without replacing the displayed image", async () => {
    const store = createBackgroundImageStore({
      getBackgroundImage: async () => customUrl,
      clearBackgroundImage: vi.fn().mockRejectedValue(new Error("clear failed")),
    });
    await store.getState().load();
    await expect(store.getState().clear()).rejects.toThrow("clear failed");
    expect(store.getState().url).toBe(customUrl);
    expect(store.getState().busy).toBe(false);
  });
});
