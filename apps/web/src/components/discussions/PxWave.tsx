/** Renders the 8a speaker waveform; motion gates remain owned by discussionMotion. */
import type { CSSProperties } from "react";
import { cn } from "~/lib/utils";
import { discussionSeatColor } from "./discussionSeatColors";
import "./discussionMotion";

const BARS = [
  { duration: "0.9s", delay: "0s" },
  { duration: "1.08s", delay: "-0.18s" },
  { duration: "0.96s", delay: "-0.36s" },
  { duration: "1.26s", delay: "-0.10s" },
  { duration: "1.02s", delay: "-0.28s" },
] as const;

/**
 * Decorative five-bar wave; callers assign speaking to the current occurrence only.
 * @param props.seatIndex Zero-based speaking position; omitted inherits the parent's text color.
 * @param props.state Defaults to speaking; every other state renders static bars.
 * @returns Five 2×14 CSS-pixel bars, excluded from the accessibility tree.
 */
export function PxWave({
  seatIndex,
  state = "speaking",
}: {
  readonly seatIndex?: number;
  readonly state?: "idle" | "speaking" | "next" | "done";
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex h-3.5 shrink-0 items-center gap-0.5",
        seatIndex === undefined ? undefined : discussionSeatColor(seatIndex + 1).textClassName,
      )}
    >
      {BARS.map(({ duration, delay }) => (
        <span
          key={duration}
          data-discussion-wave-bar=""
          data-discussion-motion={state === "speaking" ? "seatWave" : undefined}
          style={
            {
              "--discussion-wave-duration": duration,
              "--discussion-wave-delay": delay,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}
