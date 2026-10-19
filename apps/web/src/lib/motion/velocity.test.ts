/** Release velocity boundaries use fixed millisecond timestamps, never wall-clock sleeps. */
import { expect, it } from "vite-plus/test";
import { VelocityTracker } from "./velocity";

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
