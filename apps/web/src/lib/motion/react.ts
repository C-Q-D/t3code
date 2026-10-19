/** React lifecycle ownership for imperative motion jobs; frame values never enter React state. */
import { useCallback, useEffect, useRef } from "react";
import { run, type MotionJob } from "./loop";

/** Own one job: start replaces it, stop cancels it, and unmount always releases it. */
export function useMotionJob() {
  const cancellation = useRef<(() => void) | null>(null);
  const stop = useCallback(() => {
    cancellation.current?.();
    cancellation.current = null;
  }, []);
  const start = useCallback(
    (job: MotionJob) => {
      stop();
      cancellation.current = run(job);
    },
    [stop],
  );
  useEffect(() => stop, [stop]);
  return { start, stop };
}
