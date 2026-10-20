/** One demand-driven animation clock for all physical motion; no task means no requested frame. */

/** Receives elapsed seconds (at most 0.05); false releases the task. */
export type MotionJob = (dt: number) => boolean;
const jobs = new Set<MotionJob>();
const listeners = new Set<(count: number) => void>();
let frameId: number | null = null;
let lastTime: number | null = null;
let inFrame = false;

/** Notify observers of the current number of tasks, without creating a clock for observers alone. */
function notify() {
  const snapshot = [...listeners];
  for (const listener of snapshot) listener(jobs.size);
}

/** Request at most one frame, including when jobs register other jobs during a frame. */
function schedule() {
  if (jobs.size && frameId === null && !inFrame) frameId = requestAnimationFrame(frame);
}

/** Advance a snapshot at a browser timestamp in milliseconds; failed jobs are removed before rethrowing. */
function frame(now: number) {
  frameId = null;
  inFrame = true;
  const dt = lastTime === null ? 1 / 60 : Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
  lastTime = now;
  try {
    const snapshot = [...jobs];
    for (const job of snapshot) {
      if (!jobs.has(job)) continue;
      try {
        if (!job(dt)) jobs.delete(job);
      } catch (error) {
        jobs.delete(job);
        throw error;
      }
    }
  } finally {
    inFrame = false;
    if (!jobs.size) lastTime = null;
    schedule();
    notify();
  }
}

/** Register a job once by function identity; return cancellation, also cancelling an idle pending frame. */
export function run(job: MotionJob) {
  const alreadyRegistered = jobs.has(job);
  jobs.add(job);
  try {
    schedule();
    notify();
  } catch (error) {
    // No cancellation handle reached the caller, so registration must roll back here.
    if (!alreadyRegistered) jobs.delete(job);
    if (!jobs.size) {
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = null;
      lastTime = null;
    }
    throw error;
  }
  return () => {
    if (!jobs.delete(job)) return;
    if (!jobs.size) {
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = null;
      lastTime = null;
    }
    notify();
  };
}

export function activeJobs() {
  return jobs.size;
}

/** Observe task counts on registration, cancellation and frame completion; return unsubscribe. */
export function onLoop(listener: (count: number) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
