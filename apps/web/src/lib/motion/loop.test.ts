/** Scheduling and hook ownership are tested against a fake browser clock, without sleeps. */
import { act, createElement, useLayoutEffect } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { activeJobs, onLoop, run } from "./loop";
import { useMotionJob } from "./react";
import { installTestRaf } from "./testRaf";

let clock: ReturnType<typeof installTestRaf>;
const cleanup: (() => void)[] = [];
beforeEach(() => {
  clock = installTestRaf();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});
afterEach(() => {
  cleanup.splice(0).forEach((stop) => stop());
  vi.unstubAllGlobals();
});

it("deduplicates jobs and sleeps immediately after the final job finishes", () => {
  const job = vi.fn(() => false);
  cleanup.push(run(job), run(job));
  expect(activeJobs()).toBe(1);
  expect(clock.request).toHaveBeenCalledTimes(1);
  clock.advance(0);
  expect(job).toHaveBeenCalledTimes(1);
  expect(activeJobs()).toBe(0);
  expect(clock.pending.size).toBe(0);
  clock.advance(1000);
  expect(clock.request).toHaveBeenCalledTimes(1);
});

it("caps long frames at 50 ms and resets timing after cancellation", () => {
  const durations: number[] = [];
  const stop = run((dt) => {
    durations.push(dt);
    return true;
  });
  cleanup.push(stop);
  clock.advance(0);
  clock.advance(200);
  expect(durations).toEqual([1 / 60, 0.05]);
  stop();
  expect(clock.pending.size).toBe(0);
  cleanup.push(
    run((dt) => {
      durations.push(dt);
      return false;
    }),
  );
  clock.advance(5000);
  expect(durations).toEqual([1 / 60, 0.05, 1 / 60]);
});

it("jobs added in a callback share the next frame and listeners can unsubscribe", () => {
  const counts: number[] = [];
  const unsubscribe = onLoop((count) => counts.push(count));
  cleanup.push(unsubscribe);
  const next = vi.fn(() => false);
  cleanup.push(
    run(() => {
      cleanup.push(run(next));
      return false;
    }),
  );
  clock.advance(10);
  expect(clock.pending.size).toBe(1);
  expect(next).not.toHaveBeenCalled();
  clock.advance(20);
  expect(counts.at(-1)).toBe(0);
  expect(next).toHaveBeenCalledTimes(1);
  const length = counts.length;
  unsubscribe();
  cleanup.push(run(() => false));
  clock.advance(30);
  expect(counts).toHaveLength(length);
});

it("a failed job is removed while other work remains scheduled", () => {
  cleanup.push(
    run(() => {
      throw new Error("job failed");
    }),
    run(() => false),
  );
  expect(() => clock.advance(0)).toThrow("job failed");
  expect(activeJobs()).toBe(1);
  expect(clock.pending.size).toBe(1);
  clock.advance(16);
  expect(activeJobs()).toBe(0);
});

it("useMotionJob replaces active work and unmount cancels the final frame", () => {
  let controls: ReturnType<typeof useMotionJob> | undefined;
  /** Capture the hook after commit so the test exercises effect cleanup, not render side effects. */
  function Owner() {
    const motion = useMotionJob();
    useLayoutEffect(() => {
      controls = motion;
    });
    return null;
  }
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(createElement(Owner));
  });
  cleanup.push(() => {
    act(() => renderer?.unmount());
  });
  const oldJob = vi.fn(() => true);
  const newJob = vi.fn(() => true);
  controls!.start(oldJob);
  controls!.start(newJob);
  clock.advance(0);
  expect(oldJob).not.toHaveBeenCalled();
  expect(newJob).toHaveBeenCalledTimes(1);
  act(() => renderer!.unmount());
  expect(activeJobs()).toBe(0);
  expect(clock.pending.size).toBe(0);
});
