/** Verifies the merged resize contract independently of panel persistence and layout. */
import { act, type PointerEvent } from "react";
import { create } from "react-test-renderer";
import { expect, it, vi } from "vite-plus/test";
import { setPhysicsEnabled } from "../lib/motion/preference";
import { useResizeDrag } from "./useResizeDrag";

/** Mount a real gesture hook; only host pointer capture and the animation clock are simulated. */
async function setup(physical: boolean) {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("document", { body: { style: { removeProperty() {} } } });
  let timestamp = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    setTimeout(() => callback((timestamp += 16)), 16),
  );
  vi.stubGlobal("cancelAnimationFrame", clearTimeout);
  setPhysicsEnabled(physical);
  let captured = false;
  const target = {
    setPointerCapture() {
      captured = true;
    },
    hasPointerCapture() {
      return captured;
    },
    releasePointerCapture() {
      captured = false;
    },
  };
  const resize = vi.fn((width: number) => width);
  const finish = vi.fn();
  const paint = vi.fn();
  const cleanup = vi.fn();
  const bounds = { min: 200, max: 800 };
  /** Exposes real hook handlers through a mounted handle; resetKey models a panel owner change. */
  function Harness({ resetKey = "a" }: { resetKey?: string }) {
    const handlers = useResizeDrag<HTMLButtonElement>(
      () => ({
        width: 400,
        edge: "right",
        bounds,
        resize,
        finish,
        paint,
        cleanup,
        ...(physical ? { physics: bounds } : {}),
      }),
      resetKey,
    );
    return <button {...handlers} />;
  }
  const renderer = await act(() => create(<Harness />, { createNodeMock: () => target }));
  return {
    resize,
    finish,
    paint,
    cleanup,
    handlers: () =>
      renderer.root.findByType("button").props as ReturnType<
        typeof useResizeDrag<HTMLButtonElement>
      >,
    pointer: (clientX: number) =>
      ({
        button: 0,
        pointerId: 1,
        clientX,
        timeStamp: 0,
        currentTarget: target,
        preventDefault() {},
        stopPropagation() {},
      }) as unknown as PointerEvent<HTMLButtonElement>,
    rerender: (resetKey = "a") => act(() => renderer.update(<Harness resetKey={resetKey} />)),
    async [Symbol.asyncDispose]() {
      await act(() => renderer.unmount());
      setPhysicsEnabled(false);
      vi.useRealTimers();
      vi.unstubAllGlobals();
    },
  };
}

it.each([false, true])("bounds resize and commit while physics=%s", async (physical) => {
  await using test = await setup(physical);
  await act(() => {
    test.handlers().onPointerDown(test.pointer(100));
    test.handlers().onPointerMove(test.pointer(1100));
    vi.advanceTimersByTime(16);
  });
  expect(test.resize).toHaveBeenLastCalledWith(800);
  await act(() => {
    test.handlers().onPointerUp(test.pointer(1100));
    vi.runAllTimers();
  });
  expect(test.finish).toHaveBeenCalledExactlyOnceWith(800, true);
});

it("keeps elastic paint separate from bounded resize and cancels without committing", async () => {
  await using test = await setup(true);
  await act(() => {
    test.handlers().onPointerDown(test.pointer(100));
    test.handlers().onPointerMove(test.pointer(1100));
    vi.advanceTimersByTime(16);
  });
  expect(test.paint.mock.lastCall?.[0]).toBeGreaterThan(800);
  expect(test.resize).toHaveBeenLastCalledWith(800);
  const ref = test.handlers().ref;
  await test.rerender();
  expect(test.handlers().ref).toBe(ref);
  await act(() => test.handlers().cancel());
  expect(test.cleanup).toHaveBeenCalledExactlyOnceWith(false);
  expect(test.finish).not.toHaveBeenCalled();
});
