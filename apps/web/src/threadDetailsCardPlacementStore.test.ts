/** Exercises placement persistence through the same storage boundary used by the desktop client. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createMemoryStorage } from "./lib/storage";

const key = "t3code:thread-details-card-placement:v1";
const placement = { side: "right", inset: 120, top: 50 } as const;
let storage: ReturnType<typeof createMemoryStorage>;

beforeEach(() => {
  storage = createMemoryStorage();
  vi.stubGlobal("window", { localStorage: storage });
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("thread details card placement", () => {
  it("places the card and resets to the persisted default", async () => {
    const { useThreadDetailsCardPlacementStore: store } =
      await import("./threadDetailsCardPlacementStore");
    store.getState().place(placement);
    expect(store.getState().placement).toEqual(placement);
    store.getState().reset();
    expect(store.getState().placement).toBeNull();
    expect(JSON.parse((await storage.getItem(key))!)).toEqual({
      state: { placement: null },
      version: 1,
    });
  });

  it("writes only placement and restores it after a fresh module load", async () => {
    const { useThreadDetailsCardPlacementStore: store } =
      await import("./threadDetailsCardPlacementStore");
    store.getState().place(placement);
    expect(JSON.parse((await storage.getItem(key))!)).toEqual({ state: { placement }, version: 1 });
    vi.resetModules();
    const { useThreadDetailsCardPlacementStore: restored } =
      await import("./threadDetailsCardPlacementStore");
    expect(restored.getState().placement).toEqual(placement);
  });

  it.each([
    ["missing side", { inset: 120, top: 50 }],
    ["missing inset", { side: "right", top: 50 }],
    ["missing top", { side: "right", inset: 120 }],
    ["unknown side", { ...placement, side: "bottom" }],
    ["string inset", { ...placement, inset: "120" }],
    ["string top", { ...placement, top: "50" }],
    ["null placement", null],
    ["primitive placement", 42],
  ])("restores %s as null", async (_label, invalid) => {
    storage.setItem(key, JSON.stringify({ state: { placement: invalid }, version: 1 }));
    const { useThreadDetailsCardPlacementStore: store } =
      await import("./threadDetailsCardPlacementStore");
    expect(store.getState().placement).toBeNull();
  });

  it.each([
    '{"state":{"placement":{"side":"right","inset":1e400,"top":50}},"version":1}',
    '{"state":{"placement":{"side":"right","inset":120,"top":-1e400}},"version":1}',
    '{"state":{},"version":1}',
    '{"state":null,"version":1}',
  ])("rejects invalid persisted state %s", async (serialized) => {
    storage.setItem(key, serialized);
    const { useThreadDetailsCardPlacementStore: store } =
      await import("./threadDetailsCardPlacementStore");
    expect(store.getState().placement).toBeNull();
  });
});
