/** Verifies edits against real settings hydration and persistence, with only disk IO replaced. */
import { createRef, useImperativeHandle, type RefObject } from "react";
import { DEFAULT_CLIENT_SETTINGS, type ClientSettings } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { act, render } from "../../test/render";

const mocks = vi.hoisted(() => ({
  getClientSettings: vi.fn<() => Promise<ClientSettings | null>>(),
  setClientSettings: vi.fn<(settings: ClientSettings) => Promise<void>>(),
}));

vi.mock(import("~/localApi"), async (original) => {
  const actual = await original();
  return {
    ...actual,
    ensureLocalApi: () => ({ ...actual.ensureLocalApi(), persistence: mocks as never }),
  };
});

import {
  __resetClientSettingsPersistenceForTests,
  ensureClientSettingsHydrated,
  getClientSettings,
  updateClientSettings,
} from "~/hooks/useSettings";
import { useWebPages } from "./useWebPages";
import { readWebPageFavicon, rememberWebPageFavicon } from "./webPageSession";
import { useWebPageRuntimeStore } from "./webPageRuntimeStore";

const saved = { id: "saved", name: "Saved", url: "https://example.com/" };
const other = { id: "other", name: "Other", url: "https://other.example/" };

/** Exposes completion of the first disk write and releases it without timing-based waits. */
function blockFirstSave() {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  mocks.setClientSettings.mockImplementationOnce(async () => {
    entered();
    await gate;
  });
  return { started, release, [Symbol.dispose]: release };
}

/** Exposes the current committed hook result without substituting its settings subscriptions. */
function Harness({ apiRef }: { apiRef: RefObject<ReturnType<typeof useWebPages> | null> }) {
  const api = useWebPages();
  useImperativeHandle(apiRef, () => api);
  return <output>{api.hydrated ? "ready" : "pending"}</output>;
}

/** Holds disk hydration until the test releases it and cleans only this feature's state. */
function setup() {
  __resetClientSettingsPersistenceForTests();
  useWebPageRuntimeStore.setState(useWebPageRuntimeStore.getInitialState(), true);
  window.localStorage.removeItem("t3code:web-pages:session:v1");
  let resolve!: (settings: ClientSettings | null) => void;
  const promise = new Promise<ClientSettings | null>((finishRead) => {
    resolve = finishRead;
  });
  const hydration = { promise, resolve };
  mocks.getClientSettings.mockReset().mockReturnValue(hydration.promise);
  mocks.setClientSettings.mockReset().mockResolvedValue(undefined);
  return {
    hydration,
    [Symbol.dispose]() {
      hydration.resolve({ ...DEFAULT_CLIENT_SETTINGS, webPages: [saved] });
      __resetClientSettingsPersistenceForTests();
      useWebPageRuntimeStore.setState(useWebPageRuntimeStore.getInitialState(), true);
      window.localStorage.removeItem("t3code:web-pages:session:v1");
    },
  };
}

it("rejects additions before hydration without saving", async () => {
  using state = setup();
  const apiRef = createRef<ReturnType<typeof useWebPages>>();
  await using screen = await render(<Harness apiRef={apiRef} />);
  await expect.element(screen.getByText("pending")).toBeVisible();
  expect(apiRef.current!.add({ url: "https://a.example/" })).toBeNull();
  expect(apiRef.current!.add({ url: "https://b.example/" })).toBeNull();
  await act(async () => {
    state.hydration.resolve({ ...DEFAULT_CLIENT_SETTINGS, webPages: [saved] });
    await ensureClientSettingsHydrated();
  });
  expect(mocks.setClientSettings).not.toHaveBeenCalled();
  expect(apiRef.current!.entries).toEqual([saved]);
});

it("keeps an unhydrated update closure inactive when the saved entry becomes available", async () => {
  using state = setup();
  const disk = { ...DEFAULT_CLIENT_SETTINGS, webPages: [saved] };
  const apiRef = createRef<ReturnType<typeof useWebPages>>();
  await using screen = await render(<Harness apiRef={apiRef} />);
  await expect.element(screen.getByText("pending")).toBeVisible();
  const pendingUpdate = apiRef.current!.update;
  expect(pendingUpdate("saved", { name: "Changed" })).toBe(false);
  expect(mocks.setClientSettings).not.toHaveBeenCalled();
  await act(async () => {
    state.hydration.resolve(disk);
    await ensureClientSettingsHydrated();
  });
  await expect.element(screen.getByText("ready")).toBeVisible();
  expect(getClientSettings().webPages).toEqual([saved]);
  // The entry now exists in memory: rejection can only come from the old closure's guard.
  expect(pendingUpdate("saved", { name: "Changed" })).toBe(false);
  expect(mocks.setClientSettings).not.toHaveBeenCalled();
  await act(() => {
    expect(apiRef.current!.update("saved", { name: "Changed" })).toBe(true);
  });
  await vi.waitFor(() =>
    expect(mocks.setClientSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({ webPages: [{ ...saved, name: "Changed" }] }),
    ),
  );
});

it("does not remove saved entries, sessions or runtime state before hydration", async () => {
  using state = setup();
  rememberWebPageFavicon(saved, "saved-icon");
  useWebPageRuntimeStore.getState().select("saved");
  const apiRef = createRef<ReturnType<typeof useWebPages>>();
  await using screen = await render(<Harness apiRef={apiRef} />);
  await expect.element(screen.getByText("pending")).toBeVisible();
  apiRef.current!.remove("saved");
  expect(readWebPageFavicon("saved")).toBe("saved-icon");
  expect(useWebPageRuntimeStore.getState().activeId).toBe("saved");
  await act(async () => {
    state.hydration.resolve({ ...DEFAULT_CLIENT_SETTINGS, webPages: [saved] });
    await ensureClientSettingsHydrated();
  });
  expect(mocks.setClientSettings).not.toHaveBeenCalled();
  expect(apiRef.current!.entries).toEqual([saved]);
});

it("keeps successive additions after hydration and removes their session and runtime state", async () => {
  using state = setup();
  const apiRef = createRef<ReturnType<typeof useWebPages>>();
  await using screen = await render(<Harness apiRef={apiRef} />);
  await act(async () => {
    state.hydration.resolve({ ...DEFAULT_CLIENT_SETTINGS, webPages: [saved] });
    await ensureClientSettingsHydrated();
  });
  await expect.element(screen.getByText("ready")).toBeVisible();
  await act(() => {
    expect(apiRef.current!.add({ name: "A", url: "https://a.example/" })).not.toBeNull();
    expect(apiRef.current!.add({ name: "B", url: "https://b.example/" })).not.toBeNull();
  });
  await vi.waitFor(() =>
    expect(mocks.setClientSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({
        webPages: [
          saved,
          expect.objectContaining({ name: "A" }),
          expect.objectContaining({ name: "B" }),
        ],
      }),
    ),
  );
  rememberWebPageFavicon(saved, "saved-icon");
  useWebPageRuntimeStore.getState().select("saved");
  await act(() => apiRef.current!.remove("saved"));
  await vi.waitFor(() =>
    expect(mocks.setClientSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({
        webPages: [expect.objectContaining({ name: "A" }), expect.objectContaining({ name: "B" })],
      }),
    ),
  );
  expect(readWebPageFavicon("saved")).toBeNull();
  expect(useWebPageRuntimeStore.getState().activeId).toBeNull();
});

it("saves a long hostname with a bounded default name but rejects an oversized custom name", async () => {
  using state = setup();
  const apiRef = createRef<ReturnType<typeof useWebPages>>();
  await using screen = await render(<Harness apiRef={apiRef} />);
  await act(async () => {
    state.hydration.resolve({ ...DEFAULT_CLIENT_SETTINGS, webPages: [saved] });
    await ensureClientSettingsHydrated();
  });
  await expect.element(screen.getByText("ready")).toBeVisible();
  await act(() => {
    expect(apiRef.current!.add({ url: `https://${"a".repeat(50)}.example/` })).toMatchObject({
      name: "a".repeat(48),
    });
    expect(apiRef.current!.add({ name: "x".repeat(49), url: "https://example.com/" })).toBeNull();
  });
  await vi.waitFor(() =>
    expect(mocks.setClientSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({
        webPages: [saved, expect.objectContaining({ name: "a".repeat(48) })],
      }),
    ),
  );
});

it.each([
  {
    action: "add",
    edit: (api: ReturnType<typeof useWebPages>) => {
      expect(api.add({ name: "A", url: "https://a.example/" })).not.toBeNull();
      expect(api.add({ name: "B", url: "https://b.example/" })).not.toBeNull();
    },
    initial: [saved],
    expected: [
      saved,
      expect.objectContaining({ name: "A" }),
      expect.objectContaining({ name: "B" }),
    ],
  },
  {
    action: "update",
    edit: (api: ReturnType<typeof useWebPages>) => {
      expect(api.update("saved", { name: "Edited saved" })).toBe(true);
      expect(api.update("other", { name: "Edited other" })).toBe(true);
    },
    initial: [saved, other],
    expected: [
      { ...saved, name: "Edited saved" },
      { ...other, name: "Edited other" },
    ],
  },
  {
    action: "remove",
    edit: (api: ReturnType<typeof useWebPages>) => {
      api.remove("saved");
      api.remove("other");
    },
    initial: [saved, other],
    expected: [],
  },
])(
  "preserves consecutive $action edits behind deferred settings patches",
  async ({ edit, initial, expected }) => {
    using state = setup();
    using firstSave = blockFirstSave();
    const firstPatch = updateClientSettings({ wordWrap: false });
    const secondPatch = updateClientSettings({ wordWrap: true });
    const apiRef = createRef<ReturnType<typeof useWebPages>>();
    await using screen = await render(<Harness apiRef={apiRef} />);
    await act(async () => {
      state.hydration.resolve({ ...DEFAULT_CLIENT_SETTINGS, webPages: initial });
      await ensureClientSettingsHydrated();
      await firstSave.started;
    });
    await expect.element(screen.getByText("ready")).toBeVisible();
    await act(() => edit(apiRef.current!));
    await act(async () => {
      firstSave.release();
      await Promise.all([firstPatch, secondPatch]);
    });
    await vi.waitFor(() => {
      expect(getClientSettings().webPages).toEqual(expected);
      expect(mocks.setClientSettings).toHaveBeenLastCalledWith(
        expect.objectContaining({ webPages: expected }),
      );
    });
  },
);

it.each([
  {
    action: "add",
    edit: (api: ReturnType<typeof useWebPages>) => api.add({ url: "https://a.example/" }),
  },
  {
    action: "update",
    edit: (api: ReturnType<typeof useWebPages>) => api.update("saved", { name: "Edited" }),
  },
  { action: "remove", edit: (api: ReturnType<typeof useWebPages>) => api.remove("saved") },
])("logs $action persistence rejection without an unhandled promise", async ({ edit }) => {
  using state = setup();
  const apiRef = createRef<ReturnType<typeof useWebPages>>();
  await using screen = await render(<Harness apiRef={apiRef} />);
  await act(async () => {
    state.hydration.resolve({ ...DEFAULT_CLIENT_SETTINGS, webPages: [saved] });
    await ensureClientSettingsHydrated();
  });
  await expect.element(screen.getByText("ready")).toBeVisible();
  using errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.setClientSettings.mockRejectedValueOnce(new Error("disk failed"));
  await act(() => {
    edit(apiRef.current!);
  });
  await vi.waitFor(() =>
    expect(errors).toHaveBeenCalledWith(
      "[CLIENT_SETTINGS] persist failed",
      expect.objectContaining({ operation: "persist" }),
    ),
  );
  expect(getClientSettings().webPages).toEqual([saved]);
});
