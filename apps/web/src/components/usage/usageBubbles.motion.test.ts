/** Drive real bubble jobs through the shared frame clock; no component markup assertions. */
import { afterEach, expect, it, vi } from "vite-plus/test";
import { activeJobs, run } from "../../lib/motion/loop";
import { installTestRaf } from "../../lib/motion/testRaf";
import { createUsageBubbles, UsageBubblePhysics } from "./usageBubbles.logic";

afterEach(() => vi.unstubAllGlobals());

it("releases the shared clock within six seconds and requests no frames after rest", () => {
  const raf = installTestRaf();
  const physics = new UsageBubblePhysics(
    createUsageBubbles([{ key: "a", label: "a", provider: "codex", share: 1 }], 300, 300),
    300,
    300,
  );
  const cancel = run((dt) => physics.step(dt));
  try {
    for (let frame = 0; frame <= 361; frame++) raf.advance(frame * (1000 / 60));
    expect(activeJobs()).toBe(0);
    expect(raf.pending.size).toBe(0);
    const requestsAtRest = raf.request.mock.calls.length;
    raf.advance(10_000);
    expect(raf.request).toHaveBeenCalledTimes(requestsAtRest);
  } finally {
    cancel();
  }
});

it("settles without requesting any frame when physical motion is disabled", () => {
  const raf = installTestRaf();
  const physics = new UsageBubblePhysics(
    createUsageBubbles([{ key: "a", label: "a", provider: "codex", share: 1 }], 300, 300),
    300,
    300,
  );
  physics.settle();
  expect(physics.nodes[0]?.y).toBeCloseTo(150, 0);
  expect(physics.nodes[0]?.radius).toBeCloseTo(119.682684, 4);
  expect(raf.request).not.toHaveBeenCalled();
});
