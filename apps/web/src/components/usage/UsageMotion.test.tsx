/** Real component motion observed through painted values and the shared clock's lifetime.
 * @vitest-environment jsdom
 */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { activeJobs } from "~/lib/motion/loop";
import { setPhysicsEnabled } from "~/lib/motion/preference";
import { installTestRaf } from "~/lib/motion/testRaf";
import { UsageChartBars } from "./UsageChartBars";
import { UsageAnimatedValue, useUsageEntrance } from "./UsagePresentationMotion";

// Replace settings hydration only. Preference notifications, springs and the scheduler remain real.
vi.mock("~/hooks/usePhysicsMotion", async () => {
  const { useSyncExternalStore } = await import("react");
  const { onPhysicsChange, isPhysicsEnabled } = await import("~/lib/motion/preference");
  return {
    usePhysicsMotion: () => ({
      enabled: useSyncExternalStore(onPhysicsChange, isPhysicsEnabled),
      mode: "on",
    }),
  };
});

let host: HTMLDivElement;
let root: Root;
let clock: ReturnType<typeof installTestRaf>;
let time: number;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  clock = installTestRaf();
  setPhysicsEnabled(true);
  host = document.createElement("div");
  root = createRoot(host);
  time = 0;
});

afterEach(() => {
  act(() => root.unmount());
  setPhysicsEnabled(false);
  vi.unstubAllGlobals();
});

/** Mount supplied real components without replacing their motion hooks. */
function render(content: ReactNode) {
  act(() => root.render(content));
}

/** Advance a fixed frame budget; unlike waiting until idle, this exposes nonterminating jobs. */
function frames(count: number) {
  act(() => {
    for (let index = 0; index < count; index++) {
      clock.advance(time);
      time += 16;
    }
  });
}

/** Observe the SVG clipping extent actually painted by the height animation. */
function heights() {
  return [...host.querySelectorAll("[data-usage-clip]")].map((rect) =>
    Number(rect.getAttribute("height")),
  );
}

/** Keep a fixed 100-unit scale: supplied totals map to the chart's 250px plot area. */
function bars(totals: readonly number[]) {
  return (
    <UsageChartBars
      columns={totals.map((total) => ({ total, bands: [{ provider: "codex", value: total }] }))}
      periods={totals.map((_, index) => String(index))}
      scale={{ max: 100, labeled: true }}
      loadingProviders={new Set()}
      format={String}
      formatPeriod={String}
    />
  );
}

/** Exercise the same entrance hook used by the strip, including its 45ms stagger. */
function Entrance() {
  const ref = useUsageEntrance(0.045);
  return <section ref={ref} />;
}

/** Both scheduler state and pending browser work must be released, even after extra frames. */
function expectIdle() {
  expect(activeJobs()).toBe(0);
  expect(clock.pending.size).toBe(0);
  const requested = clock.request.mock.calls.length;
  frames(5);
  expect(clock.request.mock.calls.length).toBe(requested);
}

it("grows first-mount bars from zero to their exact scaled heights and releases the clock", () => {
  render(bars([40, 20]));
  expect(heights()).toEqual([0, 0]);
  expect(activeJobs()).toBe(1);
  frames(1);
  expect(heights()[0]).toBeGreaterThan(0);
  expect(heights()[0]).toBeLessThan(100);
  frames(180);
  expect(heights()).toEqual([100, 50]);
  expectIdle();
});

it("retargets equal-count bars from their current painted height", () => {
  render(bars([40]));
  frames(2);
  const before = heights();
  expect(before[0]).toBeGreaterThan(0);
  expect(before[0]).toBeLessThan(100);
  render(bars([80]));
  expect(heights()).toEqual(before);
  frames(180);
  expect(heights()).toEqual([200]);
  expectIdle();
});

it("starts a changed column count from zero rather than reusing old heights", () => {
  render(bars([40]));
  frames(2);
  expect(heights()[0]).toBeGreaterThan(0);
  render(bars([20, 60]));
  expect(heights()).toEqual([0, 0]);
  frames(180);
  expect(heights()).toEqual([50, 150]);
  expectIdle();
});

it("staggers columns but starts the last of 80 columns within 0.32 seconds", () => {
  render(bars(Array.from({ length: 80 }, () => 40)));
  frames(1);
  expect(heights()[0]).toBeGreaterThan(0);
  expect(heights().at(-1)).toBe(0);
  frames(20);
  expect(heights().at(-1)).toBeGreaterThan(0);
  frames(180);
  expect(heights()).toEqual(Array.from({ length: 80 }, () => 100));
  expectIdle();
});

it("delays the strip entrance then settles its translation and opacity", () => {
  render(<Entrance />);
  const section = host.querySelector("section")!;
  expect(section.style.transform).toBe("translateY(18px)");
  frames(2);
  expect(section.style.opacity).toBe("0");
  frames(1);
  expect(Number(section.style.opacity)).toBeGreaterThan(0);
  expect(Number(section.style.opacity)).toBeLessThan(1);
  frames(180);
  expect(section.style.transform).toBe("");
  expect(section.style.opacity).toBe("1");
  expectIdle();
});

it("rolls numbers from zero and retargets the displayed value without restarting", () => {
  render(<UsageAnimatedValue value={64.25} format={String} />);
  const number = host.querySelector('[aria-hidden="true"]')!;
  expect(number.textContent).toBe("0");
  frames(2);
  const before = Number(number.textContent);
  expect(before).toBeGreaterThan(0);
  expect(before).toBeLessThan(64.25);
  render(<UsageAnimatedValue value={1.25} format={String} />);
  expect(Number(number.textContent)).toBe(before);
  frames(180);
  expect(number.textContent).toBe("1.25");
  expectIdle();
});

const presentations = [
  {
    name: "bars",
    content: () => bars([40, 20]),
    read: () => heights(),
    final: [100, 50],
  },
  {
    name: "entrance",
    content: () => <Entrance />,
    read: () => {
      const section = host.querySelector("section")!;
      return [section.style.opacity, section.style.transform];
    },
    final: ["1", ""],
  },
  {
    name: "number",
    content: () => <UsageAnimatedValue value={64.25} format={String} />,
    read: () => host.querySelector('[aria-hidden="true"]')!.textContent,
    final: "64.25",
  },
];

it.each(presentations)(
  "$name jumps to the final state when disabled during motion",
  ({ content, read, final }) => {
    render(content());
    frames(3);
    expect(activeJobs()).toBe(1);
    expect(read()).not.toEqual(final);
    act(() => setPhysicsEnabled(false));
    expect(read()).toEqual(final);
    expectIdle();
  },
);

it.each(presentations)(
  "$name never schedules a frame when mounted with physics disabled",
  ({ content, read, final }) => {
    act(() => setPhysicsEnabled(false));
    render(content());
    expect(read()).toEqual(final);
    expect(clock.request).not.toHaveBeenCalled();
    expectIdle();
  },
);

it.each(presentations)(
  "$name cancels active work and its pending frame on unmount",
  ({ content }) => {
    render(content());
    frames(1);
    expect(activeJobs()).toBe(1);
    expect(clock.pending.size).toBe(1);
    render(null);
    expectIdle();
  },
);
