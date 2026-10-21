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

it("ignores dragging while physics is disabled", () => {
  const motion = new FaderMotion();
  motion.configure(false, 37);
  motion.pointer("pointerdown", 37);
  motion.pointer("pointermove", 92);
  motion.drag(88);
  expect(motion.pointer("pointerup", 37)).toBe(false);
  expect(motion.spring.value).toBe(37);
  expect(motion.spring.velocity).toBe(0);
});

it.each(["pointerup", "pointercancel", "lostpointercapture"])(
  "%s returns an active drag to real usage and releases the clock",
  (event) => {
    const raf = installTestRaf();
    const motion = new FaderMotion();
    motion.configure(true, 37);
    motion.pointer("pointerdown", 37);
    motion.pointer("pointermove", 92);
    expect(motion.spring.value).toBe(92);
    expect(motion.pointer(event, 37)).toBe(true);
    expect(motion.spring.value).toBe(92);
    cancel = run((dt) => motion.step(dt));
    for (let frame = 0; frame < 300; frame++) raf.advance((frame * 1000) / 60);
    expect(motion.spring.value).toBe(37);
    expect(activeJobs()).toBe(0);
    expect(raf.pending.size).toBe(0);
    expect(motion.pointer("lostpointercapture", 37)).toBe(false);
  },
);
