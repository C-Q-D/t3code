/** @vitest-environment jsdom */
/** Contract values and dispatched DOM events cover real receiver behavior without rendering React. */
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import {
  COMPOSER_IMPACT_EVENT,
  COMPOSER_MENTION_THROW_EVENT,
} from "../../lib/motion/composerThrow";
import { activeJobs } from "../../lib/motion/loop";
import { setPhysicsEnabled } from "../../lib/motion/preference";
import { installTestRaf } from "../../lib/motion/testRaf";
import {
  attachComposerImpact,
  composerImpactParameters,
  composerNeighborImpulse,
} from "./composerImpact";

let clock: ReturnType<typeof installTestRaf>;
let dispose: (() => void) | undefined;
beforeEach(() => {
  clock = installTestRaf();
  setPhysicsEnabled(true);
});
afterEach(() => {
  dispose?.();
  dispose = undefined;
  setPhysicsEnabled(false);
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it("transfers seven percent of velocity and caps both directions at 240 px/s", () => {
  expect(composerImpactParameters({ vx: 1000, vy: -500, atX: 0 }, 400, 100)).toMatchObject({
    vx: 70,
    vy: -35,
  });
  expect(composerImpactParameters({ vx: -8000, vy: 8000, atX: 0 }, 400, 100)).toMatchObject({
    vx: -240,
    vy: 240,
    depthPx: 10,
  });
});

it("compresses the impact axis with a 3.5 to 10 pixel depth", () => {
  const slow = composerImpactParameters({ vx: 0, vy: 100, atX: 0 }, 400, 100);
  expect(slow.depthPx).toBe(3.5);
  expect(slow.scaleVy).toBeCloseTo(-0.61575216, 6);
  expect(slow.scaleVx).toBeCloseTo(0.07696902, 6);
  const horizontal = composerImpactParameters({ vx: 1600, vy: 0, atX: 0 }, 400, 100);
  expect(horizontal.depthPx).toBe(10);
  expect(horizontal.scaleVx).toBeCloseTo(-0.43982297, 6);
  expect(horizontal.scaleVy).toBe(0);
});

it("pushes neighboring labels away with a 260 pixel decay radius", () => {
  const impact = { vx: 0, vy: 1500, atX: 200 };
  expect(composerNeighborImpulse(impact, 330)).toEqual({ vx: 160, vy: 30 });
  expect(composerNeighborImpulse(impact, 70)).toEqual({ vx: -160, vy: 30 });
  expect(composerNeighborImpulse(impact, 460)).toEqual({ vx: 0, vy: 0 });
});

/** A real DOM receiver with fixed layout; jsdom cannot measure CSS geometry. */
function receiver() {
  const form = document.createElement("form");
  const surface = document.createElement("div");
  surface.setAttribute("data-chat-composer-main-surface", "true");
  surface.getBoundingClientRect = () => new DOMRect(0, 0, 400, 100);
  form.append(surface);
  document.body.append(form);
  let text = "draft";
  const controller = attachComposerImpact(
    form,
    (mention) => {
      text += mention;
      return true;
    },
    () => {},
  );
  dispose = controller.dispose;
  return { form, surface, text: () => text };
}

it("receives a mention through K4 and removes the listener on disposal", () => {
  const host = receiver();
  host.form.dispatchEvent(
    new CustomEvent(COMPOSER_MENTION_THROW_EVENT, { detail: { text: " [a](a.ts)" } }),
  );
  expect(host.text()).toBe("draft [a](a.ts)");
  dispose?.();
  host.form.dispatchEvent(
    new CustomEvent(COMPOSER_MENTION_THROW_EVENT, { detail: { text: " ignored" } }),
  );
  expect(host.text()).toBe("draft [a](a.ts)");
});

it("paints an impact then releases every frame job at rest", () => {
  const host = receiver();
  host.form.dispatchEvent(
    new CustomEvent(COMPOSER_IMPACT_EVENT, { detail: { vx: 1000, vy: 800, atX: 100 } }),
  );
  clock.advance(0);
  expect(host.surface.style.transform).toContain("scale(");
  expect(host.surface.style.transform).not.toContain("scale(1, 1)");
  for (let frame = 1; frame <= 180; frame++) clock.advance((frame * 1000) / 60);
  expect(host.surface.style.transform).toBe("");
  expect(activeJobs()).toBe(0);
});

it("does not listen or animate with physics disabled", () => {
  setPhysicsEnabled(false);
  const host = receiver();
  host.form.dispatchEvent(
    new CustomEvent(COMPOSER_MENTION_THROW_EVENT, { detail: { text: " ignored" } }),
  );
  host.form.dispatchEvent(
    new CustomEvent(COMPOSER_IMPACT_EVENT, { detail: { vx: 1000, vy: 800, atX: 100 } }),
  );
  expect(host.text()).toBe("draft");
  expect(host.surface.style.transform).toBe("");
  expect(activeJobs()).toBe(0);
});

it("leans only while the form is a drag target and returns to rest", async () => {
  const host = receiver();
  host.form.setAttribute("data-thread-context-over", "true");
  await Promise.resolve();
  for (let frame = 0; frame <= 90; frame++) clock.advance((frame * 1000) / 60);
  expect(host.form.style.transform.trim()).toBe("translateY(-6px)");
  expect(activeJobs()).toBe(0);
  host.form.removeAttribute("data-thread-context-over");
  await Promise.resolve();
  for (let frame = 91; frame <= 180; frame++) clock.advance((frame * 1000) / 60);
  expect(host.form.style.transform).toBe("");
  expect(activeJobs()).toBe(0);
});
