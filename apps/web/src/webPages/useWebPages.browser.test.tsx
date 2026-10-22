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
} from "~/hooks/useSettings";
import { useWebPages } from "./useWebPages";
import { readWebPageFavicon, rememberWebPageFavicon } from "./webPageSession";
import { useWebPageRuntimeStore } from "./webPageRuntimeStore";

const saved = { id: "saved", name: "Saved", url: "https://example.com/" };

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

it("rejects additions and updates before hydration without saving", async () => {
  using state = setup();
  const apiRef = createRef<ReturnType<typeof useWebPages>>();
  await using screen = await render(<Harness apiRef={apiRef} />);
  await expect.element(screen.getByText("pending")).toBeVisible();
  expect(apiRef.current!.add({ url: "https://a.example/" })).toBeNull();
  expect(apiRef.current!.add({ url: "https://b.example/" })).toBeNull();
  expect(apiRef.current!.update("saved", { name: "Changed" })).toBe(false);
  await act(async () => {
    state.hydration.resolve({ ...DEFAULT_CLIENT_SETTINGS, webPages: [saved] });
    await ensureClientSettingsHydrated();
  });
  expect(mocks.setClientSettings).not.toHaveBeenCalled();
  expect(apiRef.current!.entries).toEqual([saved]);
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
