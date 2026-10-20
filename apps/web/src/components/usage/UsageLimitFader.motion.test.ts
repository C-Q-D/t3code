/** Exercises the fader's real spring and clock, replacing only browser frame delivery. */
import { afterEach, expect, it, vi } from "vite-plus/test";
import { activeJobs, run } from "../../lib/motion/loop";
import { installTestRaf } from "../../lib/motion/testRaf";
import { FaderMotion } from "./UsageLimitFader.motion";

let cancel: (() => void) | undefined;
afterEach(() => {
  cancel?.();
  vi.unstubAllGlobals();
});

it("returns from a dragged position to real usage and stops requesting frames", () => {
  const raf = installTestRaf();
  const motion = new FaderMotion();
  motion.drag(92);
  motion.release(37);
  expect(motion.spring.value).toBe(92);
  cancel = run((dt) => motion.step(dt));
  for (let frame = 0; frame < 300; frame++) raf.advance((frame * 1000) / 60);
  expect(motion.spring.value).toBe(37);
  expect(motion.spring.velocity).toBe(0);
  expect(activeJobs()).toBe(0);
  expect(raf.pending.size).toBe(0);
  const requestsAtRest = raf.request.mock.calls.length;
  raf.advance(6000);
  expect(raf.request).toHaveBeenCalledTimes(requestsAtRest);
});

it("delays entrance, then reaches the target without leaving a clock task", () => {
  const raf = installTestRaf();
  const motion = new FaderMotion();
  motion.target(65, 0.12);
  cancel = run((dt) => motion.step(dt));
  raf.advance(0);
  raf.advance(50);
  expect(motion.spring.value).toBe(0);
  for (let frame = 1; frame < 300; frame++) raf.advance(50 + (frame * 1000) / 60);
  expect(motion.spring.value).toBe(65);
  expect(activeJobs()).toBe(0);
  expect(raf.pending.size).toBe(0);
});
