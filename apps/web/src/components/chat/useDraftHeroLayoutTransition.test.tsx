/** Exercises real hook lifecycles against a clocked WAAPI/layout substitute.
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { SpringTimeline } from "../../lib/motion/springTimeline";
import { springToLinear } from "../../lib/motion/springToLinear";
import { TOKENS } from "../../lib/motion/tokens";
import { useDraftHeroLayoutTransition } from "./useDraftHeroLayoutTransition";

const preference = vi.hoisted(() => ({ enabled: false }));
vi.mock("../../hooks/usePhysicsMotion", () => ({ usePhysicsMotion: () => preference }));

/** Interpolate the actual CSS linear() knots sent to WAAPI, including overshoot. */
function progress(easing: string, elapsed: number) {
  if (elapsed <= 0) return 0;
  if (elapsed >= 1) return 1;
  if (!easing.startsWith("linear(")) throw new Error("Legacy curve is sampled only at endpoints");
  const knots = easing
    .slice(7, -1)
    .split(", ")
    .map((point, index, all) => {
      const [value, percent] = point.split(" ");
      return {
        value: Number(value),
        time: percent ? parseFloat(percent) / 100 : index / (all.length - 1),
      };
    });
  const nextIndex = knots.findIndex((point) => point.time >= elapsed);
  const before = knots[nextIndex - 1]!;
  const after = knots[nextIndex]!;
  return (
    before.value +
    ((after.value - before.value) * (elapsed - before.time)) / (after.time - before.time)
  );
}

/** Decode only the translation forms emitted by the real hook; reject unsupported transforms. */
function translation(transform: string) {
  const axis = /^translate([XY])\(([-\d.e+]+)px\)$/.exec(transform);
  if (axis)
    return { x: axis[1] === "X" ? Number(axis[2]) : 0, y: axis[1] === "Y" ? Number(axis[2]) : 0 };
  const both = /^translate3d\(([-\d.e+]+)px, ([-\d.e+]+)px, 0\)$/.exec(transform);
  if (both) return { x: Number(both[1]), y: Number(both[2]) };
  const zero = transform === "translate3d(0, 0, 0)";
  if (!zero) throw new Error(`Unsupported transform: ${transform}`);
  return { x: 0, y: 0 };
}

/** Predict the first rendered chord from independently sampled physical velocity.
 * The baker's finite knots do not promise a fixed relative error on instantaneous slopes.
 */
function bakedVelocity(distancePx: number, velocityPxPerSecond: number) {
  const curve = springToLinear(TOKENS.settle, {
    initialVelocity: velocityPxPerSecond / distancePx,
  });
  return distancePx * progress(curve.easing, 0.01 / curve.durationMs) * 100_000;
}

/** Bind the production refs and expose its capture operation through a real click. */
function Composer({ hero, left, top }: { hero: boolean; left: number; top: number }) {
  const { captureComposerRect, transitionGroupRef, composerAnchorRef } =
    useDraftHeroLayoutTransition(hero, true, 360);
  return (
    <>
      <button onClick={captureComposerRect}>Capture</button>
      <div ref={transitionGroupRef}>
        <div data-anchor data-left={left} data-top={top} ref={composerAnchorRef} />
      </div>
    </>
  );
}

/** Mount a real React root; the substitute only implements browser animation and layout boundaries. */
async function mountComposer(enabled: boolean) {
  preference.enabled = enabled;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  const records: {
    from: { x: number; y: number };
    to: { x: number; y: number };
    startedAt: number;
    duration: number;
    easing: string;
    cancelled: boolean;
    done: boolean;
    resolve: () => void;
  }[] = [];
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "animate");
  Object.defineProperty(HTMLElement.prototype, "animate", {
    configurable: true,
    value: (frames: Keyframe[], options: KeyframeAnimationOptions) => {
      let resolve!: () => void;
      let reject!: (reason: Error) => void;
      const finished = new Promise<void>((yes, no) => {
        resolve = yes;
        reject = no;
      });
      const record = {
        from: translation(String(frames[0]!.transform)),
        to: translation(String(frames[1]!.transform)),
        startedAt: now,
        duration: Number(options.duration),
        easing: options.easing!,
        cancelled: false,
        done: false,
        resolve,
      };
      records.push(record);
      return {
        id: "",
        finished,
        cancel: () => {
          record.cancelled = true;
          reject(new Error("cancelled"));
        },
      };
    },
  });
  const offsetAt = (time: number) =>
    records
      .filter((r) => !r.cancelled && !r.done)
      .reduce(
        (point, record) => {
          const p = progress(record.easing, (time - record.startedAt) / record.duration);
          return {
            x: point.x + record.from.x + (record.to.x - record.from.x) * p,
            y: point.y + record.from.y + (record.to.y - record.from.y) * p,
          };
        },
        { x: 0, y: 0 },
      );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    const offset = offsetAt(now);
    return new DOMRect(
      Number(this.dataset.left) + offset.x,
      Number(this.dataset.top) + offset.y,
      100,
      80,
    );
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const render = async (hero: boolean, left: number, top: number) => {
    await act(async () => root.render(<Composer hero={hero} left={left} top={top} />));
  };
  await render(true, 40, 100);
  return {
    records,
    render,
    capture: async () => {
      await act(async () => container.querySelector("button")!.click());
    },
    position: () => {
      const rect = container.querySelector<HTMLElement>("[data-anchor]")!.getBoundingClientRect();
      return { x: rect.left, y: rect.top };
    },
    velocity: () => {
      const start = offsetAt(now),
        end = offsetAt(now + 0.01);
      return { x: (end.x - start.x) * 100_000, y: (end.y - start.y) * 100_000 };
    },
    advance: async (ms: number) => {
      await act(async () => {
        now += ms;
        for (const record of records) {
          if (!record.cancelled && now - record.startedAt >= record.duration) {
            record.done = true;
            record.resolve();
          }
        }
      });
    },
    close: async () => {
      await act(async () => root.unmount());
      container.remove();
      if (original) Object.defineProperty(HTMLElement.prototype, "animate", original);
      else Reflect.deleteProperty(HTMLElement.prototype, "animate");
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("keeps the legacy easing, duration, start position and destination", async () => {
  const view = await mountComposer(false);
  try {
    await view.capture();
    await view.render(false, 140, 400);
    expect(view.position()).toEqual({ x: 40, y: 100 });
    expect(view.records[0]).toMatchObject({
      duration: 360,
      easing: "cubic-bezier(0.4, 0, 0.2, 1)",
    });
    await view.advance(360);
    expect(view.position()).toEqual({ x: 140, y: 400 });
  } finally {
    await view.close();
  }
});

it("preserves visual position and signed velocity through captured and uncaptured interruptions", async () => {
  const view = await mountComposer(true);
  try {
    await view.capture();
    await view.render(false, 140, 400);
    await view.advance(130);
    const firstVisual = view.position();
    // This is an independent contract oracle, not state read back from the hook.
    const first = new SpringTimeline(TOKENS.settle, 0).at(130);
    await view.capture();
    await view.render(true, 100, 200);
    expect(view.position().x).toBeCloseTo(firstVisual.x, 6);
    expect(view.position().y).toBeCloseTo(firstVisual.y, 6);
    expect(view.records.slice(0, 2).every((record) => record.cancelled)).toBe(true);
    expect(view.velocity().x).toBeCloseTo(
      bakedVelocity(100 - firstVisual.x, first.velocity * 100),
      5,
    );
    expect(view.velocity().y).toBeCloseTo(
      bakedVelocity(200 - firstVisual.y, first.velocity * 300),
      5,
    );

    await view.advance(80);
    const secondVisual = view.position();
    const secondDistance = 200 - firstVisual.y;
    const second = new SpringTimeline(
      TOKENS.settle,
      130,
      (first.velocity * 300) / secondDistance,
    ).at(210);
    // No capture this time: the hook must combine saved layout and its live offset once.
    await view.render(false, 80, 500);
    expect(view.position().x).toBeCloseTo(secondVisual.x, 0);
    expect(view.position().y).toBeCloseTo(secondVisual.y, 0);
    expect(view.records.slice(0, 4).every((record) => record.cancelled)).toBe(true);
    const expectedVelocity = second.velocity * secondDistance;
    expect(Math.sign(view.velocity().y)).toBe(Math.sign(expectedVelocity));
    const expectedPosition = 200 - secondDistance * (1 - second.value);
    expect(view.velocity().y).toBeCloseTo(
      bakedVelocity(500 - expectedPosition, expectedVelocity),
      5,
    );
    await view.advance(2000);
    expect(view.position()).toEqual({ x: 80, y: 500 });
  } finally {
    await view.close();
  }
});
