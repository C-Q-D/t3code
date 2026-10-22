/** Protects physical momentum and leading/trailing edge assignment independently of the DOM. */
import { expect, it } from "vite-plus/test";
import { SpringTimeline } from "./springTimeline";
import { planIndicatorTransition } from "./springIndicator";

it.each([
  {
    from: [0, 40] as const,
    to: [100, 160] as const,
    tokens: [
      { response: 0.46, damping: 0.8 },
      { response: 0.26, damping: 0.92 },
    ],
  },
  {
    from: [100, 160] as const,
    to: [0, 40] as const,
    tokens: [
      { response: 0.26, damping: 0.92 },
      { response: 0.46, damping: 0.8 },
    ],
  },
])("uses snap on the leading edge for $from → $to", ({ from, to, tokens }) => {
  const edges = planIndicatorTransition(from, to);
  expect(edges.map((edge) => edge.token)).toEqual(tokens);
});

it.each([[180, 240] as const, [-60, -10] as const])(
  "inherits both edge velocities when retargeting to %j",
  (start, end) => {
    const left = new SpringTimeline({ response: 0.46, damping: 0.8 }, 0);
    const right = new SpringTimeline({ response: 0.26, damping: 0.92 }, 0);
    const edges = planIndicatorTransition(
      [25, 70],
      [start, end],
      [
        { timeline: left, travelPx: 100, elapsedMs: 60 },
        { timeline: right, travelPx: 120, elapsedMs: 60 },
      ],
    );
    expect(edges[0]!.timeline.at(0).velocity * (start - 25)).toBeCloseTo(
      left.at(60).velocity * 100,
      8,
    );
    expect(edges[1]!.timeline.at(0).velocity * (end - 70)).toBeCloseTo(
      right.at(60).velocity * 120,
      8,
    );
    expect(edges[0]!.initialVelocity).not.toBe(0);
    expect(edges[1]!.initialVelocity).not.toBe(0);
  },
);
