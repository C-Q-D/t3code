/** React lifecycle ownership for imperative motion jobs; frame values never enter React state. */
import { useStableCallback } from "~/hooks/useStableCallback";
import { useEffect, useRef } from "react";
import { run, type MotionJob } from "./loop";

/** Own one job: start replaces it, stop cancels it, and unmount always releases it. */
export function useMotionJob() {
  const cancellation = useRef<(() => void) | null>(null);
  const stop = useStableCallback(() => {
    cancellation.current?.();
    cancellation.current = null;
  });
  const start = useStableCallback((job: MotionJob) => {
    stop();
    cancellation.current = run(job);
  });
  useEffect(() => stop, [stop]);
  return { start, stop };
}
