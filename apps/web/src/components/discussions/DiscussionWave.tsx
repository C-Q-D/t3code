/** Shows the active seat's five-bar CSS waveform without introducing animation state. */
import type { CSSProperties } from "react";
import { discussionSeatColor } from "./discussionSeatColors";
import "./discussionMotion";
/**
 * Renders a decorative waveform in the assigned seat's foreground color.
 * @param props.seat One-based discussion seat number.
 * @returns Five contained transform-only bars; visibility and reduced motion are CSS-owned.
 */
export function DiscussionWave({ seat }: { seat: number }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-3.5 shrink-0 items-center gap-0.5 ${discussionSeatColor(seat).textClassName}`}
    >
      {[0, 0.22, 0.44, 0.12, 0.32].map((delay, index) => (
        <span
          key={delay}
          data-discussion-motion="seatWave"
          style={
            {
              "--discussion-wave-duration": `${0.9 + (index % 3) * 0.18}s`,
              "--discussion-wave-delay": `${delay}s`,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}
