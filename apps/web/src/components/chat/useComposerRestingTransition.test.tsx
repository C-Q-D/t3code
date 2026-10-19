/** @vitest-environment jsdom */
/** Combine the real resting hook and impact receiver; only browser layout and WAAPI are faked. */
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { COMPOSER_IMPACT_EVENT } from "../../lib/motion/composerThrow";
import { activeJobs } from "../../lib/motion/loop";
import { setPhysicsEnabled } from "../../lib/motion/preference";
import { installTestRaf } from "../../lib/motion/testRaf";
import { attachComposerImpact } from "./composerImpact";
import { useComposerRestingTransition } from "./useComposerRestingTransition";

let root: Root;
let container: HTMLDivElement;
let clock: ReturnType<typeof installTestRaf>;
let disposeImpact: (() => void) | undefined;
let resizeCallback: ResizeObserverCallback;
let resizeObserver: ResizeObserver;
let animatedHeights: WeakMap<HTMLElement, number>;
let animations: ReturnType<typeof heightAnimation>[];

/** Exposes explicit resize delivery so the test can interleave it with a real impact frame. */
class TestResizeObserver implements ResizeObserver {
  /** Keep the production observer callback; entries are delivered explicitly by the scenario. */
  constructor(callback: ResizeObserverCallback) {
    resizeCallback = callback;
    resizeObserver = this;
  }
  /** Layout is synthetic, so observing a node does not schedule a browser delivery. */
  observe() {}
  /** The shared production observer owns subscription tracking; this fake has no pending entries. */
  unobserve() {}
  /** There are no asynchronous browser deliveries to cancel. */
  disconnect() {}
}

/** Model WAAPI's current used height and its removal on cancel; promises finish on explicit completion. */
function heightAnimation(
  element: HTMLElement,
  frames: Keyframe[],
  options: KeyframeAnimationOptions,
) {
  let resolveFinished: () => void = () => {};
  const finished = new Promise<void>((resolve) => {
    resolveFinished = resolve;
  });
  const start = Number.parseFloat(String(frames[0]?.height));
  const end = Number.parseFloat(String(frames[1]?.height));
  animatedHeights.set(element, start);
  return {
    frames,
    currentTime: 0,
    effect: { getComputedTiming: () => ({ duration: options.duration }) },
    finished,
    cancel() {
      animatedHeights.delete(element);
    },
    sample(height: number) {
      animatedHeights.set(element, height);
      this.currentTime = 100;
    },
    finish() {
      animatedHeights.set(element, end);
      resolveFinished();
    },
  };
}

/** Supply browser border-box geometry, including impact scale, which jsdom does not calculate. */
function visualRect(element: HTMLElement) {
  const height = animatedHeights.get(element) ?? Number(element.dataset.layoutHeight ?? 0);
  const scale = element.style.transform.match(/scale\([^,]+,\s*([^)]+)\)/);
  const scaleY = scale ? Number(scale[1]) : 1;
  return new DOMRect(0, 0, 400, height * scaleY);
}

/** Minimal real hook consumer with the same surface/body ownership as ChatComposer. */
function Composer({ collapsed, physics = true }: { collapsed: boolean; physics?: boolean }) {
  const controls = useRef<HTMLDivElement>(null);
  const surface = useComposerRestingTransition(
    collapsed,
    collapsed,
    controls,
    () => {},
    physics,
    0,
    physics,
  );
  return (
    <form>
      <div
        ref={surface}
        data-chat-composer-main-surface="true"
        data-layout-height={collapsed ? 100 : 200}
      >
        <div data-chat-composer-surface="true">
          <div data-chat-composer-body="true" />
        </div>
      </div>
    </form>
  );
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", TestResizeObserver);
  clock = installTestRaf();
  setPhysicsEnabled(true);
  animatedHeights = new WeakMap();
  animations = [];
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    return visualRect(this);
  });
  // jsdom has no WAAPI; the fake exposes used height, not the hook's measurement decisions.
  Object.defineProperty(HTMLElement.prototype, "animate", {
    configurable: true,
    value: function (this: HTMLElement, frames: Keyframe[], options: KeyframeAnimationOptions) {
      const animation = heightAnimation(this, frames, options);
      animations.push(animation);
      return animation;
    },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(() => root.unmount());
  disposeImpact?.();
  disposeImpact = undefined;
  setPhysicsEnabled(false);
  container.remove();
  Reflect.deleteProperty(HTMLElement.prototype, "animate");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Dispatch a real K4 impact and sample its first frame before measuring resting geometry. */
function impact() {
  const form = container.querySelector("form")!;
  const surface = form.querySelector<HTMLElement>("[data-chat-composer-main-surface]")!;
  const beforeImpactHeight = surface.getBoundingClientRect().height;
  disposeImpact = attachComposerImpact(
    form,
    () => true,
    () => {},
  ).dispose;
  form.dispatchEvent(
    new CustomEvent(COMPOSER_IMPACT_EVENT, { detail: { vx: 0, vy: 1600, atX: 200 } }),
  );
  clock.advance(0);
  expect(surface.getBoundingClientRect().height).toBeLessThan(beforeImpactHeight);
  return surface;
}

it.each([false, true])(
  "collapses during impact using layout heights, resize delivery: %s",
  async (resize) => {
    await act(() => root.render(<Composer collapsed={false} />));
    const surface = impact();
    const transform = surface.style.transform;
    if (resize) {
      resizeCallback(
        [
          {
            target: surface,
            contentRect: new DOMRect(0, 0, 400, 200),
            borderBoxSize: [{ inlineSize: 400, blockSize: 200 }],
            contentBoxSize: [{ inlineSize: 400, blockSize: 200 }],
            devicePixelContentBoxSize: [{ inlineSize: 400, blockSize: 200 }],
          },
        ],
        resizeObserver,
      );
    }
    await act(() => root.render(<Composer collapsed />));
    expect(animations.at(-1)?.frames).toEqual([{ height: "200px" }, { height: "100px" }]);
    expect(surface.style.transform).toBe(transform);
    const animation = animations.at(-1)!;
    animation.sample(100);
    const beforeCleanup = surface.getBoundingClientRect().height;
    await act(() => animation.finish());
    expect(surface.getBoundingClientRect().height).toBe(beforeCleanup);
    expect(surface.style.transform).toBe(transform);
    for (let frame = 1; frame <= 180; frame++) clock.advance((frame * 1000) / 60);
    expect(surface.getBoundingClientRect().height).toBe(100);
    expect(activeJobs()).toBe(0);
  },
);

it("reverses a collapsing height during impact without applying the scale twice", async () => {
  await act(() => root.render(<Composer collapsed={false} />));
  await act(() => root.render(<Composer collapsed />));
  animations.at(-1)!.sample(150);
  const surface = impact();
  const transform = surface.style.transform;
  await act(() => root.render(<Composer collapsed={false} />));
  expect(animations.at(-1)?.frames).toEqual([{ height: "150px" }, { height: "200px" }]);
  expect(surface.style.transform).toBe(transform);
  animations.at(-1)!.sample(200);
  const beforeCleanup = surface.getBoundingClientRect().height;
  await act(() => animations.at(-1)!.finish());
  expect(surface.getBoundingClientRect().height).toBe(beforeCleanup);
  expect(surface.style.transform).toBe(transform);
  for (let frame = 1; frame <= 180; frame++) clock.advance((frame * 1000) / 60);
  expect(surface.getBoundingClientRect().height).toBe(200);
  expect(activeJobs()).toBe(0);
});

it("keeps zero-duration legacy changes immediate", async () => {
  setPhysicsEnabled(false);
  await act(() => root.render(<Composer collapsed={false} physics={false} />));
  await act(() => root.render(<Composer collapsed physics={false} />));
  expect(animations).toHaveLength(0);
  expect(
    container
      .querySelector<HTMLElement>("[data-chat-composer-main-surface]")!
      .getBoundingClientRect().height,
  ).toBe(100);
});
