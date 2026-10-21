/** @vitest-environment jsdom */
/** Exercises mounted usage motion through real DOM writes, springs and the shared frame queue. */
import { act, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { activeJobs } from "~/lib/motion/loop";
import { isPhysicsEnabled, onPhysicsChange, setPhysicsEnabled } from "~/lib/motion/preference";
import { installTestRaf } from "~/lib/motion/testRaf";
import { UsageCostRing } from "./UsageCostRing";
import { UsageSpeedGauge } from "./UsageSpeedGauge";
import { ringSegments, speedBreakdown } from "./usageCostBreakdown.logic";

// Replace only settings hydration; components, numeric hook, springs and scheduler remain real.
vi.mock("~/hooks/usePhysicsMotion", () => ({
  usePhysicsMotion: () => ({
    enabled: useSyncExternalStore(onPhysicsChange, isPhysicsEnabled),
    mode: "on",
  }),
}));
let host: HTMLDivElement;
let root: Root;
let clock: ReturnType<typeof installTestRaf>;
let time: number;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  clock = installTestRaf();
  time = 0;
  setPhysicsEnabled(true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  setPhysicsEnabled(false);
  vi.unstubAllGlobals();
});

/** Advance a bounded number of deterministic frames, never sleep or poll for success. */
function frames(count: number) {
  act(() => {
    for (let index = 0; index < count; index++) {
      time += 16;
      clock.advance(time);
    }
  });
}
/** Read the actual visual number, whose text is owned by the numeric animation hook. */
function center() {
  return host.querySelector(".usage-cost-ring-value")!.textContent;
}
/** Commit one metric using the same mounted ring; only its unit and input values change. */
function renderMetric(metric: "cost" | "tokens") {
  const value = metric === "cost" ? 10 : 1_000_000;
  act(() =>
    root.render(
      <UsageCostRing
        metric={metric}
        segments={ringSegments([
          { label: "Input", value, color: "var(--color-usage-split-input)" },
        ])}
      />,
    ),
  );
}
it.each([
  { from: "tokens" as const, to: "cost" as const, expected: "$10.00" },
  { from: "cost" as const, to: "tokens" as const, expected: "1M" },
])("switches $from to $to without painting the old unit", ({ from, to, expected }) => {
  renderMetric(from);
  frames(300);
  renderMetric(to);
  expect(center()).toBe(expected);
  frames(1);
  expect(center()).toBe(expected);
  expect(activeJobs()).toBe(0);
  expect(clock.pending.size).toBe(0);
});

const segments = ringSegments([
  { label: "Input", value: 25, color: "var(--color-usage-split-input)" },
  { label: "Output", value: 75, color: "var(--color-usage-split-output)" },
]);
/** Read the first painted arc's length and displacement, rather than React's initial props. */
function arcState() {
  const arc = host.querySelector('[data-arc="0"]')!;
  const translation = /translate\(([^ ]+) ([^)]+)\)/.exec(arc.getAttribute("transform")!)!;
  return {
    length: Number(arc.getAttribute("stroke-dasharray")!.split(" ")[0]),
    offset: Math.hypot(Number(translation[1]), Number(translation[2])),
  };
}
it("sweeps the ring, rolls same-unit hover values, returns home and releases all frames", () => {
  act(() => root.render(<UsageCostRing metric="cost" segments={segments} />));
  expect(arcState().length).toBe(0);
  frames(20);
  expect(arcState().length).toBeGreaterThan(0);
  expect(arcState().length).toBeLessThan(109.956);
  frames(300);
  expect(arcState().length).toBeCloseTo(109.955743, 5);
  expect(activeJobs()).toBe(0);
  expect(clock.pending.size).toBe(0);
  const row = host.querySelector("button")!;
  act(() => row.dispatchEvent(new MouseEvent("pointerover", { bubbles: true })));
  expect(center()).toBe("$100.00");
  frames(1);
  expect(center()).not.toBe("$100.00");
  expect(center()).not.toBe("$25.00");
  frames(300);
  expect(center()).toBe("$25.00");
  expect(arcState().offset).toBeCloseTo(8, 5);
  expect(activeJobs()).toBe(0);
  expect(clock.pending.size).toBe(0);
  act(() => row.dispatchEvent(new MouseEvent("pointerout", { bubbles: true })));
  frames(300);
  expect(center()).toBe("$100.00");
  expect(arcState().offset).toBe(0);
  expect(activeJobs()).toBe(0);
  expect(clock.pending.size).toBe(0);
});

it("settles the gauge at its cost share and releases its task and frame", () => {
  act(() =>
    root.render(
      <UsageSpeedGauge
        speed={speedBreakdown({ standard: 60, fast: 30, ultrafast: 10, premium: 15 })}
      />,
    ),
  );
  expect(host.querySelector("[data-gauge-value]")!.textContent).toBe("0.0%");
  frames(30);
  expect(host.querySelector("[data-gauge-value]")!.textContent).not.toBe("0.0%");
  expect(activeJobs()).toBeGreaterThan(0);
  frames(400);
  expect(host.querySelector("[data-gauge-value]")!.textContent).toBe("40.0%");
  expect(host.querySelector("[data-gauge-needle]")!.getAttribute("transform")).toBe(
    "rotate(72 125 124)",
  );
  expect(
    Number(host.querySelector("[data-gauge-arc]")!.getAttribute("stroke-dasharray")!.split(" ")[0]),
  ).toBeCloseTo(125.663706, 5);
  expect(activeJobs()).toBe(0);
  expect(clock.pending.size).toBe(0);
});

it("disabling motion mid-flight paints final ring, number and gauge values without another frame", () => {
  act(() =>
    root.render(
      <>
        <UsageCostRing metric="cost" segments={segments} />
        <UsageSpeedGauge
          speed={speedBreakdown({ standard: 60, fast: 30, ultrafast: 10, premium: 15 })}
        />
      </>,
    ),
  );
  frames(24);
  act(() =>
    host.querySelector("button")!.dispatchEvent(new MouseEvent("pointerover", { bubbles: true })),
  );
  frames(1);
  expect(activeJobs()).toBeGreaterThan(0);
  expect(arcState().offset).toBeGreaterThan(0);
  act(() => setPhysicsEnabled(false));
  expect(center()).toBe("$25.00");
  expect(arcState().length).toBeCloseTo(109.955743, 5);
  expect(arcState().offset).toBe(0);
  expect(host.querySelector("[data-gauge-value]")!.textContent).toBe("40.0%");
  expect(host.querySelector("[data-gauge-needle]")!.getAttribute("transform")).toBe(
    "rotate(72 125 124)",
  );
  expect(activeJobs()).toBe(0);
  expect(clock.pending.size).toBe(0);
});
