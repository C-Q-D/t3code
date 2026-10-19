/** Test-only browser clock boundary; motion jobs and spring integration remain real. */
import { vi } from "vitest";

/** Install a deterministic rAF queue; advance drains one browser frame at a supplied millisecond time. */
export function installTestRaf() {
  let nextId = 1;
  const pending = new Map<number, FrameRequestCallback>();
  const request = vi.fn((callback: FrameRequestCallback) => {
    const id = nextId++;
    pending.set(id, callback);
    return id;
  });
  vi.stubGlobal("requestAnimationFrame", request);
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    pending.delete(id);
  });
  return {
    request,
    pending,
    advance(time: number) {
      const callbacks = [...pending.values()];
      pending.clear();
      for (const callback of callbacks) callback(time);
    },
  };
}
