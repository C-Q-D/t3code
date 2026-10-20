/** DOM-free model-share layout and finite physics for the usage composition chart. */

/** A positive fraction of the selected metric; keys identify models across refreshes. */
export interface BubbleShare {
  readonly key: string;
  readonly label: string;
  readonly provider: string;
  readonly share: number;
}

/** Mutable simulation coordinates in pixels and velocities in pixels per second. */
export interface UsageBubble extends BubbleShare {
  readonly members: readonly BubbleShare[];
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  readonly targetRadius: number;
}

/**
 * Build descending positive shares for a pixel-sized field. Shares below 0.005
 * merge into one node. Existing keys retain their position and current radius.
 */
export function createUsageBubbles(
  shares: readonly BubbleShare[],
  width: number,
  height: number,
  previous: readonly UsageBubble[] = [],
): UsageBubble[] {
  const positive = shares.filter((item) => Number.isFinite(item.share) && item.share > 0);
  const small = positive.filter((item) => item.share < 0.005);
  const items = positive
    .filter((item) => item.share >= 0.005)
    .toSorted((a, b) => b.share - a.share)
    .map((item) => ({ ...item, members: [] as readonly BubbleShare[] }));
  if (small.length) {
    items.push({
      key: "other",
      label: "",
      provider: "other",
      share: small.reduce((sum, item) => sum + item.share, 0),
      members: small,
    });
  }
  const total = items.reduce((sum, item) => sum + item.share, 0);
  const old = new Map(previous.map((node) => [node.key, node]));
  return items.map((item, index) => {
    const existing = old.get(item.key);
    const targetRadius = Math.max(
      13,
      Math.sqrt((width * height * 0.5 * item.share) / total / Math.PI),
    );
    // A deterministic spread makes layout reproducible without injecting browser randomness.
    const fraction = ((index + 1) * 0.61803398875) % 1;
    return {
      ...item,
      x: existing?.x ?? width * (0.1 + fraction * 0.8),
      y: existing?.y ?? -targetRadius - index * 17,
      vx: 0,
      vy: existing ? 0 : 60,
      radius: existing?.radius ?? 0,
      targetRadius,
    };
  });
}

/** Cap a released node's speed to 900 px/s while preserving its direction. */
export function releaseUsageBubble(node: UsageBubble): void {
  const speed = Math.hypot(node.vx, node.vy);
  if (speed > 900) {
    node.vx *= 900 / speed;
    node.vy *= 900 / speed;
  }
}

/** Owns one simulation; step returns false once twenty consecutive steps are calm. */
export class UsageBubblePhysics {
  private calmSteps = 0;
  private ageSeconds = 0;
  drag: UsageBubble | null = null;

  /** Nodes are mutated in place; width and height are field dimensions in pixels. */
  constructor(
    readonly nodes: UsageBubble[],
    readonly width: number,
    readonly height: number,
  ) {}

  /** Restart the settling deadline after user input; does not reset node positions. */
  wake(): void {
    this.calmSteps = 0;
    this.ageSeconds = 0;
  }

  /** Advance by elapsed seconds. Dragged nodes are pinned; false releases the shared clock. */
  step(dt: number): boolean {
    if (!this.nodes.length) return false;
    this.ageSeconds += dt;
    for (const node of this.nodes) {
      node.radius += (node.targetRadius - node.radius) * Math.min(1, dt * 8);
      if (node === this.drag) continue;
      node.vx += (this.width / 2 - node.x) * 1.6 * dt;
      node.vy += (this.height / 2 - node.y) * 2.2 * dt;
      node.vx *= Math.pow(0.18, dt);
      node.vy *= Math.pow(0.18, dt);
      node.x += node.vx * dt;
      node.y += node.vy * dt;
      if (node.x < node.radius) {
        node.x = node.radius;
        node.vx = Math.abs(node.vx) * 0.5;
      }
      if (node.x > this.width - node.radius) {
        node.x = this.width - node.radius;
        node.vx = -Math.abs(node.vx) * 0.5;
      }
      if (node.y > this.height - node.radius) {
        node.y = this.height - node.radius;
        node.vy = -Math.abs(node.vy) * 0.5;
      }
      if (node.y < node.radius && node.vy < 0 && node.y > -50) {
        node.y = node.radius;
        node.vy = Math.abs(node.vy) * 0.5;
      }
    }
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < this.nodes.length; i++) {
        for (let j = i + 1; j < this.nodes.length; j++) {
          const a = this.nodes[i]!;
          const b = this.nodes[j]!;
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let distance = Math.hypot(dx, dy);
          // Coincident nodes need a direction or separation cannot move either node.
          if (distance === 0) {
            dx = 1;
            dy = 0;
            distance = 1;
          }
          const overlap = a.radius + b.radius + 2 - distance;
          if (overlap <= 0) continue;
          dx /= distance;
          dy /= distance;
          const weightA = a === this.drag ? 0 : b === this.drag ? 1 : 0.5;
          const weightB = 1 - weightA;
          a.x -= dx * overlap * weightA;
          a.y -= dy * overlap * weightA;
          b.x += dx * overlap * weightB;
          b.y += dy * overlap * weightB;
          const relativeSpeed = (b.vx - a.vx) * dx + (b.vy - a.vy) * dy;
          if (relativeSpeed < 0) {
            const impulse = relativeSpeed * 0.6;
            if (a !== this.drag) {
              a.vx += impulse * dx * weightA * 2;
              a.vy += impulse * dy * weightA * 2;
            }
            if (b !== this.drag) {
              b.vx -= impulse * dx * weightB * 2;
              b.vy -= impulse * dy * weightB * 2;
            }
          }
        }
      }
    }
    const energy = this.nodes.reduce((sum, node) => sum + node.vx ** 2 + node.vy ** 2, 0);
    this.calmSteps = energy < this.nodes.length * 30 && !this.drag ? this.calmSteps + 1 : 0;
    return this.drag !== null || (this.calmSteps < 20 && this.ageSeconds < 6);
  }

  /** Resolve the finite entrance synchronously when motion is disabled; no frame is scheduled. */
  settle(): void {
    this.drag = null;
    this.wake();
    for (let step = 0; step < 600 && this.step(1 / 60); step++) {
      // Use the same solver and stopping rule as the animated path.
    }
  }
}
