/** Independent acceptance cases for share grouping, geometry, and finite bubble motion. */
import { describe, expect, it } from "vite-plus/test";
import { createUsageBubbles, releaseUsageBubble, UsageBubblePhysics } from "./usageBubbles.logic";

/** Supply stable model identity; shares are fractions, not percentages. */
function share(key: string, value: number) {
  return { key, label: key, provider: "codex", share: value };
}

/** Run a bounded simulation without DOM or a wall clock. */
function advanceToRest(simulation: UsageBubblePhysics) {
  let moving = true;
  let steps = 0;
  while (moving && steps < 600) {
    moving = simulation.step(1 / 60);
    steps++;
  }
  return { moving, steps };
}

/** Return the largest visible overlap, independently of the solver's separation algorithm. */
function maximumOverlap(nodes: ReturnType<typeof createUsageBubbles>) {
  return Math.max(
    0,
    ...nodes.flatMap((a, index) =>
      nodes.slice(index + 1).map((b) => a.radius + b.radius - Math.hypot(a.x - b.x, a.y - b.y)),
    ),
  );
}

describe("usage bubble physics", () => {
  it("merges only positive shares below 0.5% and retains their members", () => {
    const nodes = createUsageBubbles(
      [
        share("large", 0.99),
        share("boundary", 0.005),
        share("tiny", 0.003),
        share("tiny2", 0.002),
        share("zero", 0),
      ],
      500,
      300,
    );
    expect(nodes.map((node) => node.key)).toEqual(["large", "boundary", "other"]);
    expect(nodes[2]?.share).toBeCloseTo(0.005);
    expect(nodes[2]?.members.map((member) => member.key)).toEqual(["tiny", "tiny2"]);
  });

  it("uses a 13px radius floor and the required area formula above it", () => {
    const nodes = createUsageBubbles([share("large", 0.995), share("small", 0.005)], 300, 300);
    expect(nodes[0]?.targetRadius).toBeCloseTo(119.383103, 5);
    expect(nodes[1]?.targetRadius).toBe(13);
  });

  it("settles the falling nodes within 600 steps without overlap above 1px", () => {
    const nodes = createUsageBubbles(
      [share("a", 0.5), share("b", 0.3), share("c", 0.15), share("d", 0.05)],
      560,
      300,
    );
    expect(advanceToRest(new UsageBubblePhysics(nodes, 560, 300)).moving).toBe(false);
    expect(maximumOverlap(nodes)).toBeLessThanOrEqual(1);
    expect(nodes.every((node) => node.y > 0)).toBe(true);
  });

  it("caps a throw to 900px/s without changing direction", () => {
    const node = createUsageBubbles([share("a", 1)], 300, 300)[0]!;
    node.vx = 1200;
    node.vy = -1600;
    releaseUsageBubble(node);
    expect(node.vx).toBe(540);
    expect(node.vy).toBe(-720);
  });

  it("finishes an empty field immediately", () => {
    const nodes = createUsageBubbles([], 500, 300);
    expect(nodes).toEqual([]);
    expect(new UsageBubblePhysics(nodes, 500, 300).step(1 / 60)).toBe(false);
  });

  it("retains existing positions and radii when shares change", () => {
    const previous = createUsageBubbles([share("a", 1)], 300, 300);
    previous[0]!.x = 91;
    previous[0]!.y = 82;
    previous[0]!.radius = 45;
    const next = createUsageBubbles([share("a", 0.5), share("b", 0.5)], 300, 300, previous);
    expect(next[0]).toMatchObject({ x: 91, y: 82, radius: 45 });
    expect(next[0]?.targetRadius).toBeCloseTo(84.628438, 5);
  });
});
