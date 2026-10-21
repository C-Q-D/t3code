/** Keyboard scrolling contracts, using injected frame time without a browser or real sleeps. */
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { activeJobs, onLoop, run } from "../../lib/motion/loop";
import { installTestRaf } from "../../lib/motion/testRaf";
import { setPhysicsEnabled } from "../../lib/motion/preference";

import {
  createPageScrollController,
  getTimelinePageScrollKey,
  getPageScrollDistancePx,
  getPageScrollMultiplier,
  getPageScrollVelocityPxPerMs,
  PAGE_SCROLL_ACCELERATION_MS,
  PAGE_SCROLL_ANIMATION_MS,
  PAGE_SCROLL_MAX_MULTIPLIER,
} from "./pageScrollController";

afterEach(() => {
  setPhysicsEnabled(false);
  vi.unstubAllGlobals();
});

/** Deterministic timer and frame queues shared by both scrolling modes. */
class TestClock {
  private currentTime = 0;
  private nextHandle = 1;
  private frames = installTestRaf();
  private timeouts = new Map<number, { at: number; callback: () => void }>();

  readonly env = {
    prefersReducedMotion: () => false,
    now: () => this.currentTime,
    requestAnimationFrame: (callback: FrameRequestCallback) => this.frames.request(callback),
    cancelAnimationFrame: (handle: number) => cancelAnimationFrame(handle),
    setTimeout: (callback: () => void, delay: number) => {
      const handle = this.nextHandle;
      this.nextHandle += 1;
      this.timeouts.set(handle, { at: this.currentTime + delay, callback });
      return handle;
    },
    clearTimeout: (handle: number) => {
      this.timeouts.delete(handle);
    },
  };

  /** Return the number of queued animation callbacks without advancing the clock. */
  get pendingFrames() {
    return this.frames.pending.size;
  }

  /** Advance milliseconds and flush due timers before each frame, like the browser boundary. */
  advanceBy(ms: number, frameMs = 16) {
    const target = this.currentTime + ms;

    while (this.currentTime < target) {
      this.currentTime = Math.min(target, this.currentTime + frameMs);
      this.flushTimeouts();
      this.frames.advance(this.currentTime);
    }
  }

  /** Run all due timers, including timers made due by callbacks, without advancing time. */
  private flushTimeouts() {
    let hasDueTimeouts = true;
    while (hasDueTimeouts) {
      hasDueTimeouts = false;

      for (const [handle, timeout] of this.timeouts) {
        if (timeout.at > this.currentTime) {
          continue;
        }

        this.timeouts.delete(handle);
        timeout.callback();
        hasDueTimeouts = true;
      }
    }
  }
}

describe.each([false, true])("page scroll helpers physics=%s", (physics) => {
  beforeEach(() => setPhysicsEnabled(physics));
  afterEach(() => setPhysicsEnabled(false));
  const composerPageScrollEvent = (
    overrides: Partial<Parameters<typeof getTimelinePageScrollKey>[0]> = {},
  ) => ({
    altKey: false,
    clientHeight: 200,
    ctrlKey: false,
    defaultPrevented: false,
    isComposing: false,
    key: "PageDown",
    keyCode: 34,
    metaKey: false,
    scrollHeight: 200,
    scrollTop: 0,
    shiftKey: false,
    ...overrides,
  });

  test("leaves page keys to IME composition", () => {
    expect(getTimelinePageScrollKey(composerPageScrollEvent({ isComposing: true }))).toBeNull();
    expect(getTimelinePageScrollKey(composerPageScrollEvent({ keyCode: 229 }))).toBeNull();
  });

  test("leaves page keys to an overflowing composer until it reaches the boundary", () => {
    expect(
      getTimelinePageScrollKey(composerPageScrollEvent({ scrollHeight: 600, scrollTop: 0 })),
    ).toBeNull();
    expect(
      getTimelinePageScrollKey(
        composerPageScrollEvent({
          key: "PageUp",
          keyCode: 33,
          scrollHeight: 600,
          scrollTop: 400,
        }),
      ),
    ).toBeNull();

    expect(
      getTimelinePageScrollKey(
        composerPageScrollEvent({
          key: "PageUp",
          keyCode: 33,
          scrollHeight: 600,
          scrollTop: 0,
        }),
      ),
    ).toBe("PageUp");
    expect(
      getTimelinePageScrollKey(composerPageScrollEvent({ scrollHeight: 600, scrollTop: 400 })),
    ).toBe("PageDown");
  });

  test("hands off page keys within a fractional pixel of the composer boundary", () => {
    expect(
      getTimelinePageScrollKey(
        composerPageScrollEvent({
          key: "PageUp",
          keyCode: 33,
          scrollHeight: 600,
          scrollTop: 0.5,
        }),
      ),
    ).toBe("PageUp");
    expect(
      getTimelinePageScrollKey(composerPageScrollEvent({ scrollHeight: 600, scrollTop: 399.5 })),
    ).toBe("PageDown");
  });

  test("ramps multiplier over time and caps at the max velocity", () => {
    expect(getPageScrollMultiplier(0)).toBe(1);
    expect(getPageScrollMultiplier(PAGE_SCROLL_ACCELERATION_MS / 2)).toBeCloseTo(1.5);
    expect(getPageScrollMultiplier(PAGE_SCROLL_ACCELERATION_MS * 5)).toBe(
      PAGE_SCROLL_MAX_MULTIPLIER,
    );
  });

  test("derives the hold velocity from page size and acceleration", () => {
    expect(
      getPageScrollVelocityPxPerMs({
        holdElapsedMs: 0,
        pageScrollDistancePx: 600,
      }),
    ).toBeCloseTo(4);
    expect(
      getPageScrollVelocityPxPerMs({
        holdElapsedMs: PAGE_SCROLL_ACCELERATION_MS * 5,
        pageScrollDistancePx: 600,
      }),
    ).toBeCloseTo(8);
  });
});

describe.each([false, true])("createPageScrollController physics=%s", (physics) => {
  beforeEach(() => setPhysicsEnabled(physics));
  afterEach(() => setPhysicsEnabled(false));
  test("keeps a single page scroll when the key is tapped", () => {
    const clock = new TestClock();
    const container = {
      clientHeight: 600,
      scrollHeight: 1_800,
      scrollTop: 0,
      getBoundingClientRect: () => ({ height: 600 }),
    };
    const controller = createPageScrollController({
      getContainer: () => container,
      getScrollPaddingBottomPx: () => 24,
      env: clock.env,
    });

    controller.handleKeyDown("PageDown");
    controller.handleKeyUp("PageDown");
    clock.advanceBy(physics ? 2000 : PAGE_SCROLL_ANIMATION_MS);

    expect(container.scrollTop).toBeCloseTo(
      getPageScrollDistancePx({
        containerHeightPx: 600,
        scrollPaddingBottomPx: 24,
      }),
      5,
    );
  });

  test("continues scrolling on hold without repeated keydown events and stops on keyup", () => {
    const clock = new TestClock();
    const container = {
      clientHeight: 600,
      scrollHeight: 4_000,
      scrollTop: 0,
      getBoundingClientRect: () => ({ height: 600 }),
    };
    const controller = createPageScrollController({
      getContainer: () => container,
      getScrollPaddingBottomPx: () => 24,
      env: clock.env,
    });
    controller.handleKeyDown("PageDown");
    clock.advanceBy(PAGE_SCROLL_ANIMATION_MS + 50);

    const afterHoldStarts = container.scrollTop;
    clock.advanceBy(200);

    expect(container.scrollTop).toBeGreaterThan(afterHoldStarts);

    const stoppedAt = container.scrollTop;
    controller.handleKeyUp("PageDown");
    if (physics) {
      const positions = Array.from({ length: 125 }, () => {
        clock.advanceBy(16);
        return container.scrollTop;
      });
      const distances = positions.map(
        (position, index) => position - (positions[index - 1] ?? stoppedAt),
      );
      expect(positions[0]).toBeGreaterThan(stoppedAt);
      expect(
        positions.every((position, index) => position >= (positions[index - 1] ?? stoppedAt)),
      ).toBe(true);
      expect(
        distances.every((distance, index) => distance <= (distances[index - 1] ?? Infinity) + 0.01),
      ).toBe(true);
      expect(positions.at(-1)! - stoppedAt).toBeLessThan(540);
      expect(positions.at(-1)).toBe(positions.at(-2));
      expect(clock.pendingFrames).toBe(0);
    } else {
      clock.advanceBy(250);
      expect(container.scrollTop).toBe(stoppedAt);
    }
    controller.dispose();
  });

  test("notifies once when a page scroll starts", () => {
    const clock = new TestClock();
    const started: string[] = [];
    const controller = createPageScrollController({
      getContainer: () => ({
        clientHeight: 600,
        scrollHeight: 1_800,
        scrollTop: 600,
        getBoundingClientRect: () => ({ height: 600 }),
      }),
      getScrollPaddingBottomPx: () => 24,
      onScrollStart: (key) => started.push(key),
      env: clock.env,
    });

    controller.handleKeyDown("PageUp");
    controller.handleKeyDown("PageUp");

    expect(started).toEqual(["PageUp"]);
  });

  test("does not start a page scroll at the timeline boundary", () => {
    const clock = new TestClock();
    const started: string[] = [];
    const container = {
      clientHeight: 600,
      scrollHeight: 1_800,
      scrollTop: 0.5,
      getBoundingClientRect: () => ({ height: 600 }),
    };
    const controller = createPageScrollController({
      getContainer: () => container,
      getScrollPaddingBottomPx: () => 24,
      onScrollStart: (key) => started.push(key),
      env: clock.env,
    });

    controller.handleKeyDown("PageUp");
    clock.advanceBy(PAGE_SCROLL_ANIMATION_MS * 2);

    container.scrollTop = container.scrollHeight - container.clientHeight - 0.5;
    controller.handleKeyDown("PageDown");
    clock.advanceBy(PAGE_SCROLL_ANIMATION_MS * 2);

    expect(started).toEqual([]);
    expect(container.scrollTop).toBe(1_199.5);
  });
});

describe("physical page targets", () => {
  beforeEach(() => setPhysicsEnabled(true));
  afterEach(() => setPhysicsEnabled(false));

  test.each(["natural rest", "disable", "dispose"])(
    "shares one frame with other motion and cleans up on %s",
    (ending) => {
      const clock = new TestClock();
      const counts: number[] = [];
      const unsubscribe = onLoop((count) => counts.push(count));
      const container = {
        clientHeight: 600,
        scrollHeight: 10000,
        scrollTop: 0,
        getBoundingClientRect: () => ({ height: 600 }),
      };
      const controller = createPageScrollController({
        getContainer: () => container,
        getScrollPaddingBottomPx: () => 24,
        env: clock.env,
      });
      const cancelOther = run(() => false);
      try {
        controller.handleKeyDown("PageDown");
        controller.handleKeyUp("PageDown");
        expect(activeJobs()).toBe(2);
        expect(counts.at(-1)).toBe(2);
        expect(clock.pendingFrames).toBe(1);
        clock.advanceBy(16);
        expect(container.scrollTop).toBeGreaterThan(0);
        expect(activeJobs()).toBe(1);
        expect(clock.pendingFrames).toBe(1);
        if (ending === "disable") setPhysicsEnabled(false);
        else if (ending === "dispose") controller.dispose();
        else clock.advanceBy(2000);
        expect(activeJobs()).toBe(0);
        expect(counts.at(-1)).toBe(0);
        expect(clock.pendingFrames).toBe(0);
      } finally {
        controller.dispose();
        cancelOther();
        unsubscribe();
      }
    },
  );

  test("zero page distance never registers a frame", () => {
    const clock = new TestClock();
    const container = {
      clientHeight: 60,
      scrollHeight: 10000,
      scrollTop: 500,
      getBoundingClientRect: () => ({ height: 60 }),
    };
    const controller = createPageScrollController({
      getContainer: () => container,
      getScrollPaddingBottomPx: () => 24,
      env: clock.env,
    });
    controller.handleKeyDown("PageDown");
    expect(clock.pendingFrames).toBe(0);
    clock.advanceBy(1000);
    expect(container.scrollTop).toBe(500);
    expect(clock.pendingFrames).toBe(0);
    controller.dispose();
  });

  test("layout reducing page distance to zero releases the running task", () => {
    const clock = new TestClock();
    let height = 600;
    const container = {
      clientHeight: 600,
      scrollHeight: 10000,
      scrollTop: 500,
      getBoundingClientRect: () => ({ height }),
    };
    const controller = createPageScrollController({
      getContainer: () => container,
      getScrollPaddingBottomPx: () => 24,
      env: clock.env,
    });
    controller.handleKeyDown("PageDown");
    clock.advanceBy(200);
    expect(container.scrollTop).toBeGreaterThan(500);
    expect(clock.pendingFrames).toBe(1);
    height = 50;
    container.clientHeight = 50;
    const atResize = container.scrollTop;
    clock.advanceBy(16);
    expect(clock.pendingFrames).toBe(0);
    clock.advanceBy(1000);
    expect(container.scrollTop).toBe(atResize);
    controller.dispose();
  });

  test("two PageDown taps accumulate targets without resetting velocity", () => {
    const clock = new TestClock();
    const container = {
      clientHeight: 600,
      scrollHeight: 10000,
      scrollTop: 0,
      getBoundingClientRect: () => ({ height: 600 }),
    };
    const controller = createPageScrollController({
      getContainer: () => container,
      getScrollPaddingBottomPx: () => 24,
      env: clock.env,
    });
    controller.handleKeyDown("PageDown");
    controller.handleKeyUp("PageDown");
    clock.advanceBy(80);
    const before = container.scrollTop;
    clock.advanceBy(16);
    const previousDistance = container.scrollTop - before;
    const atSecondPress = container.scrollTop;
    controller.handleKeyDown("PageDown");
    controller.handleKeyUp("PageDown");
    clock.advanceBy(16);
    expect(container.scrollTop - atSecondPress).toBeGreaterThan(previousDistance * 0.8);
    clock.advanceBy(2000);
    expect(container.scrollTop).toBe(1080);
    expect(clock.pendingFrames).toBe(0);
    controller.dispose();
  });

  test.each<["PageDown" | "PageUp", number, number, number]>([
    ["PageDown", 0, 9400, 1],
    ["PageUp", 9400, 0, -1],
  ])("%s holds move every frame then sleep at the boundary", (key, from, boundary, direction) => {
    const clock = new TestClock();
    const container = {
      clientHeight: 600,
      scrollHeight: 10000,
      scrollTop: from,
      getBoundingClientRect: () => ({ height: 600 }),
    };
    const controller = createPageScrollController({
      getContainer: () => container,
      getScrollPaddingBottomPx: () => 24,
      env: clock.env,
    });
    controller.handleKeyDown(key);
    const positions = Array.from({ length: 40 }, () => {
      clock.advanceBy(16);
      return container.scrollTop;
    });
    expect(
      positions.every(
        (position, index) => (position - (positions[index - 1] ?? from)) * direction > 0,
      ),
    ).toBe(true);
    clock.advanceBy(5000);
    expect(container.scrollTop).toBe(boundary);
    expect(clock.pendingFrames).toBe(0);
    controller.dispose();
  });

  test("disable and disposal cancel pending physical work without a late scroll", () => {
    const clock = new TestClock();
    const container = {
      clientHeight: 600,
      scrollHeight: 10000,
      scrollTop: 0,
      getBoundingClientRect: () => ({ height: 600 }),
    };
    const controller = createPageScrollController({
      getContainer: () => container,
      getScrollPaddingBottomPx: () => 24,
      env: clock.env,
    });
    controller.handleKeyDown("PageDown");
    clock.advanceBy(32);
    const atDisable = container.scrollTop;
    setPhysicsEnabled(false);
    expect(clock.pendingFrames).toBe(0);
    clock.advanceBy(1000);
    expect(container.scrollTop).toBe(atDisable);
    setPhysicsEnabled(true);
    controller.handleKeyDown("PageDown");
    expect(clock.pendingFrames).toBe(1);
    controller.dispose();
    expect(clock.pendingFrames).toBe(0);
    clock.advanceBy(1000);
    expect(container.scrollTop).toBe(atDisable);
  });
});
