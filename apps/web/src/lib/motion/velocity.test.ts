/** Release velocity boundaries use fixed millisecond timestamps, never wall-clock sleeps. */
import { expect, it, vi } from "vite-plus/test";
import { VelocityTracker } from "./velocity";

it("keeps coalesced pointer velocity when handling is delayed by 100 ms", () => {
  const tracker = new VelocityTracker();
  const move = {
    clientX: 180,
    clientY: 0,
    timeStamp: 96,
    getCoalescedEvents: () =>
      Array.from({ length: 12 }, (_, i) => ({
        clientX: 15 * (i + 1),
        clientY: 0,
        timeStamp: 8 * (i + 1),
      })),
  };
  const clock = vi.spyOn(performance, "now").mockReturnValue(196);
  try {
    tracker.addPointerEvent({ clientX: 0, clientY: 0, timeStamp: 0 });
    tracker.addPointerEvent(move);
    expect(tracker.velocity(96).x).toBe(1875);
    tracker.addPointerEvent({ clientX: 180, clientY: 0, timeStamp: 97 });
    // The unchanged up point adds 1 ms to the 135 px / 72 ms measurement window.
    expect(tracker.velocity(97).x).toBeCloseTo(1849.315, 2);
    expect(tracker.velocity(146).x).toBeCloseTo(1849.315, 2);
    expect(tracker.velocity(147)).toEqual({ x: 0, y: 0 });
    tracker.addPointerEvent({
      clientX: 180,
      clientY: 0,
      timeStamp: 296,
      getCoalescedEvents: () => [],
    });
    expect(tracker.velocity(296)).toEqual({ x: 0, y: 0 });
  } finally {
    clock.mockRestore();
  }
});

it("reports px/s from only the recent 80 ms", () => {
  const tracker = new VelocityTracker();
  tracker.add(-1000, -1000, 40);
  tracker.add(0, 0, 100);
  tracker.add(40, -20, 140);
  expect(tracker.velocity(140)).toEqual({ x: 1000, y: -500 });
});

it.each([
  [7, 0],
  [8, 1000],
])("a %i ms window yields %i px/s", (time, speed) => {
  const tracker = new VelocityTracker();
  tracker.add(0, 0, 0);
  tracker.add(time, 0, time);
  expect(tracker.velocity(time)).toEqual({ x: speed, y: 0 });
});

it.each([
  [60, 1000],
  [61, 0],
])("last movement at 10 ms yields %i query / %i px/s", (now, speed) => {
  const tracker = new VelocityTracker();
  tracker.add(0, 0, 0);
  tracker.add(10, 0, 10);
  expect(tracker.velocity(now)).toEqual({ x: speed, y: 0 });
});

it("stationary samples cannot refresh last movement and reset removes old momentum", () => {
  const tracker = new VelocityTracker();
  tracker.add(0, 0, 0);
  tracker.add(10, 0, 10);
  tracker.add(10, 0, 60);
  expect(tracker.velocity(61)).toEqual({ x: 0, y: 0 });
  tracker.reset();
  tracker.add(50, 20, 70);
  expect(tracker.velocity(70)).toEqual({ x: 0, y: 0 });
});
