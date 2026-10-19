/** Exercises clipping lifetime with real resize delivery and a controlled layout/clock.
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { AnimatedHeight } from "./AnimatedHeight";

const preference = vi.hoisted(() => ({ enabled: false }));
vi.mock("../hooks/usePhysicsMotion", () => ({ usePhysicsMotion: () => preference }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it.each([
  { physics: false, releaseAfterMs: 250 },
  { physics: true, releaseAfterMs: 469 },
])(
  "releases overflowing content at $releaseAfterMs ms with physics=$physics",
  async ({ physics, releaseAfterMs }) => {
    preference.enabled = physics;
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.useFakeTimers({
      toFake: [
        "setTimeout",
        "clearTimeout",
        "requestAnimationFrame",
        "cancelAnimationFrame",
        "performance",
      ],
    });
    let contentHeight = 80;
    const observed = new Set<Element>();
    let deliver!: ResizeObserverCallback;
    /** Browser-boundary substitute: subscriptions and delivery still use the real observeResize service. */
    class ControlledResizeObserver {
      /** Retain the real service's delivery callback for an explicit test resize. */
      constructor(callback: ResizeObserverCallback) {
        deliver = callback;
      }
      /** Register a browser element whose measured size may change. */
      observe(element: Element) {
        observed.add(element);
      }
      /** Stop delivery to an element removed by the service. */
      unobserve(element: Element) {
        observed.delete(element);
      }
      /** Release every observation when the mounted component is cleaned up. */
      disconnect() {
        observed.clear();
      }
    }
    vi.stubGlobal("ResizeObserver", ControlledResizeObserver);
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(() => contentHeight);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      // Simulate a still-running height transition with no transitionend event;
      // the fallback must keep overflowing content clipped until its deadline.
      return new DOMRect(0, 0, 100, this.dataset.slot === "animated-height" ? 80 : contentHeight);
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () =>
        root.render(
          <AnimatedHeight>
            <div>Growing content</div>
          </AnimatedHeight>,
        ),
      );
      await act(async () => vi.advanceTimersByTime(32));
      const viewport = container.querySelector<HTMLElement>('[data-slot="animated-height"]')!;
      const content = viewport.firstElementChild as HTMLElement;
      // Observe visible content extent under the browser's clipping rule, rather than
      // counting timeouts or checking a static rendered style snapshot.
      const visibleExtent = () =>
        getComputedStyle(viewport).overflow === "clip"
          ? Math.min(
              viewport.getBoundingClientRect().height,
              content.getBoundingClientRect().height,
            )
          : content.getBoundingClientRect().height;
      const releases: number[] = [];
      const startedAt = performance.now();
      const observer = new MutationObserver(() => {
        if (visibleExtent() === 200) releases.push(performance.now() - startedAt);
      });
      observer.observe(viewport, { attributes: true, attributeFilter: ["style"] });
      try {
        contentHeight = 200;
        await act(async () => {
          const entries = [...observed].map(
            (target) =>
              ({ target, contentRect: new DOMRect(0, 0, 100, 200) }) as ResizeObserverEntry,
          );
          deliver(entries, {} as ResizeObserver);
        });
        expect(visibleExtent()).toBe(80);
        await act(async () => vi.advanceTimersByTime(releaseAfterMs - 1));
        expect(visibleExtent()).toBe(80);
        expect(releases).toEqual([]);
        await act(async () => vi.advanceTimersByTime(1));
        expect(visibleExtent()).toBe(200);
        expect(releases).toEqual([releaseAfterMs]);
      } finally {
        observer.disconnect();
      }
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  },
);
