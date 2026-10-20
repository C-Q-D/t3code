/** DOM-free physical typing model. The renderer owns geometry, scheduling and visibility. */

/** Final prototype parameters; distances use CSS pixels and time uses seconds. */
export interface PhysicsConfig {
  stiffness: number;
  bounce: number;
  dropHeight: number;
  tension: number;
  wobble: number;
  heatPerKey: number;
  coolingRate: number;
  confetti: number;
  hueSpread: number;
  flowSpeed: number;
}

export const DEFAULT_PHYSICS: Readonly<PhysicsConfig> = {
  stiffness: 640,
  bounce: 0.1,
  dropHeight: 15,
  tension: 550,
  wobble: 0.15,
  heatPerKey: 1,
  coolingRate: 0.6,
  confetti: 0.8,
  hueSpread: 0.45,
  flowSpeed: 1,
};

/** One fixed-end edge, with displacement in pixels and velocity in pixels/second. */
export interface Edge {
  u: Float64Array;
  v: Float64Array;
}

/** A shadow glyph spring. x/yBase are measured resting positions, independent of spring y. */
export interface Glyph {
  x: number;
  yBase: number;
  y: number;
  vy: number;
  r: number;
  vr: number;
  s: number;
  vs: number;
  landed: boolean;
  delay: number;
  pending: number;
}

/** Reusable particle slot; inactive slots remain allocated for the renderer's DOM pool. */
export interface Bit {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  vr: number;
  f: number;
  vf: number;
  s: number;
  hue: number;
  life: number;
  age: number;
  bounced: number;
}

/** Return the prototype damping coefficient for a configured glyph spring. */
export function damping(config: PhysicsConfig) {
  return 2 * Math.sqrt(config.stiffness) * (0.95 - 0.65 * config.bounce);
}

/** Return velocity deformation, bounded so a fast impact cannot invert the glyph. */
export function squash(velocity: number) {
  return Math.min(Math.abs(velocity) / 2600, 0.22);
}

/** Create a glyph at its resting pixel position, initially dropped from above. */
export function createGlyph(x: number, yBase: number, config = DEFAULT_PHYSICS): Glyph {
  return {
    x,
    yBase,
    y: -config.dropHeight,
    vy: 0,
    r: 0,
    vr: 0,
    s: 0.55,
    vs: 0,
    landed: false,
    delay: 0,
    pending: 0,
  };
}

/** Return whether a glyph is within the prototype's resting tolerances. */
export function glyphResting(glyph: Glyph) {
  return (
    glyph.delay <= 0 &&
    Math.abs(glyph.y) <= 0.02 &&
    Math.abs(glyph.vy) <= 0.2 &&
    Math.abs(glyph.r) <= 0.02 &&
    Math.abs(glyph.vr) <= 0.2 &&
    Math.abs(glyph.s - 1) <= 0.001
  );
}

/** Own edges, glyphs and a bounded particle pool; no browser globals or autonomous clock. */
export class TypingPhysics {
  readonly config: PhysicsConfig;
  readonly top: Edge = { u: new Float64Array(40), v: new Float64Array(40) };
  readonly bottom: Edge = { u: new Float64Array(40), v: new Float64Array(40) };
  readonly glyphs: Glyph[] = [];
  readonly bits: Bit[] = Array.from({ length: 180 }, () => ({
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    r: 0,
    vr: 0,
    f: 0,
    vf: 0,
    s: 0,
    hue: 0,
    life: 0,
    age: 0,
    bounced: 0,
  }));
  heat = 0;
  hue = 200;
  width = 768;
  height = 84;
  private nextBit = 0;

  /** Configure the model; random returns values in [0,1) for particle initialization. */
  constructor(
    config: Partial<PhysicsConfig> = {},
    readonly random: () => number = Math.random,
  ) {
    this.config = { ...DEFAULT_PHYSICS, ...config };
  }

  /** Accumulate prototype heat for inserted and removed glyph counts. */
  warm(inserted: number, removed = 0) {
    this.heat = Math.min(
      1,
      this.heat + this.config.heatPerKey * (0.08 * inserted + 0.03 * removed),
    );
  }

  /** Add an impulse at pixel x; Gaussian spread is measured in edge nodes. */
  impulse(edge: Edge, x: number, amount: number, spread = 2) {
    const index = (x - this.radius) / this.spacing;
    for (let i = 1; i < 39; i++) {
      edge.v[i]! += amount * Math.exp(-((i - index) ** 2) / (2 * spread ** 2));
    }
  }

  /** Return the corner radius clamped to the measured surface dimensions. */
  get radius() {
    return Math.min(18, this.width / 2, this.height / 2);
  }
  /** Return horizontal distance between the 40 fixed-count edge nodes, in pixels. */
  get spacing() {
    return Math.max(0.001, (this.width - 2 * this.radius) / 39);
  }

  /** Sample edge displacement at pixel x, returning zero outside fixed endpoints. */
  sample(edge: Edge, x: number): number {
    const index = (x - this.radius) / this.spacing;
    if (index <= 0 || index >= 39) return 0;
    const i = Math.floor(index);
    const fraction = index - i;
    return edge.u[i]! * (1 - fraction) + edge.u[i + 1]! * fraction;
  }

  /** Return the prototype's weighted edge displacement for a glyph at pixel x. */
  ride(x: number) {
    return this.sample(this.bottom, x) * 0.6 + this.sample(this.top, x) * 0.4;
  }

  /** Return the wrapped spatial/temporal hue at pixel x, in degrees. */
  hueAt(x: number) {
    return (((x * this.config.hueSpread + this.hue) % 360) + 360) % 360;
  }

  /** Emit count particles at pixel coordinates, reusing at most 180 slots. */
  burst(x: number, y: number, count: number, hue: number | null, spread: number, power: number) {
    for (let i = 0; i < Math.min(180, count); i++) {
      const bit = this.bits[this.nextBit]!;
      this.nextBit = (this.nextBit + 1) % 180;
      const angle = -Math.PI / 2 + (this.random() - 0.5) * 2.2;
      const speed = (180 + this.random() * 260) * power;
      bit.active = true;
      bit.hue = hue === null ? this.random() * 360 : hue + (this.random() - 0.5) * spread;
      bit.s = 3 + this.random() * 3;
      bit.x = x + (this.random() - 0.5) * 10;
      bit.y = y;
      bit.vx = Math.cos(angle) * speed;
      bit.vy = Math.sin(angle) * speed;
      bit.r = this.random() * 360;
      bit.vr = (this.random() - 0.5) * 900;
      bit.f = this.random() * 6;
      bit.vf = 6 + this.random() * 10;
      bit.life = 1.1 + this.random() * 0.6;
      bit.age = 0;
      bit.bounced = 0;
    }
  }

  /** Advance an edge by seconds using simultaneous velocity then displacement updates. */
  private stepEdge(edge: Edge, dt: number) {
    const tension = this.config.tension * (1 - 0.25 * this.heat);
    const drag = 8 * (1 - 0.3 * this.heat);
    edge.u[0] = edge.u[39] = edge.v[0] = edge.v[39] = 0;
    for (let i = 1; i < 39; i++) {
      edge.v[i]! +=
        (tension * (edge.u[i - 1]! + edge.u[i + 1]! - 2 * edge.u[i]!) -
          40 * edge.u[i]! -
          drag * edge.v[i]!) *
        dt;
    }
    for (let i = 1; i < 39; i++) edge.u[i]! += edge.v[i]! * dt;
  }

  /** Transfer a landed glyph's velocity to three neighbors, edges and colored particles. */
  private land(index: number, glyph: Glyph) {
    const { wobble, bounce, confetti } = this.config;
    for (let distance = 1; distance <= 3; distance++) {
      const force = 150 * wobble * (0.3 + bounce) * 0.5 ** (distance - 1);
      const left = this.glyphs[index - distance];
      const right = this.glyphs[index + distance];
      if (left) left.vy += force;
      if (right) right.vy += force;
    }
    const hit = Math.min(Math.abs(glyph.vy), 900) * 0.7 * wobble * (1 + 0.3 * this.heat);
    this.impulse(this.bottom, glyph.x, hit, 1.8);
    this.impulse(this.top, glyph.x, hit * 0.35, 3);
    this.burst(
      glyph.x,
      glyph.yBase,
      Math.round((3 + this.heat * 5) * confetti),
      this.hueAt(glyph.x),
      140,
      0.75 + this.heat * 0.5,
    );
  }

  /** Integrate one substep in seconds, keeping the prototype's update order. */
  private integrate(dt: number) {
    const k = this.config.stiffness;
    const c = damping(this.config);
    this.heat *= Math.exp(-this.config.coolingRate * dt);
    this.hue = (this.hue + dt * this.config.flowSpeed * (6 + 70 * this.heat)) % 360;
    this.stepEdge(this.top, dt);
    this.stepEdge(this.bottom, dt);
    for (const [index, glyph] of this.glyphs.entries()) {
      if (glyph.delay > 0) {
        glyph.delay -= dt;
        if (glyph.delay <= 0) {
          glyph.vy += glyph.pending;
          glyph.pending = glyph.delay = 0;
        }
      }
      const previousY = glyph.y;
      glyph.vy += (-k * glyph.y - c * glyph.vy) * dt;
      glyph.y += glyph.vy * dt;
      glyph.vr += (-k * glyph.r - c * glyph.vr) * dt;
      glyph.r += glyph.vr * dt;
      glyph.vs += (-k * (glyph.s - 1) - c * glyph.vs) * dt;
      glyph.s += glyph.vs * dt;
      if (!glyph.landed && previousY < 0 && glyph.y >= 0) {
        glyph.landed = true;
        this.land(index, glyph);
      }
    }
    for (const bit of this.bits) {
      if (!bit.active) continue;
      bit.age += dt;
      if (bit.age >= bit.life) {
        bit.active = false;
        continue;
      }
      bit.vy += 1500 * dt;
      bit.vx *= Math.exp(-0.8 * dt);
      bit.x += bit.vx * dt;
      bit.y += bit.vy * dt;
      bit.r += bit.vr * dt;
      bit.f += bit.vf * dt;
      const floor = this.height - 7 + this.sample(this.bottom, bit.x) - bit.s;
      if (bit.y > floor && bit.vy > 0 && bit.x > 6 && bit.x < this.width - 6) {
        bit.y = floor;
        if (bit.bounced < 2 && bit.vy > 60) {
          bit.vy *= -0.38;
          bit.vx *= 0.7;
          bit.vr *= 0.5;
          bit.bounced++;
          this.impulse(this.bottom, bit.x, 4, 1);
        } else {
          bit.vy = 0;
          bit.vx *= 0.85;
          bit.vr *= 0.8;
          bit.vf *= 0.85;
        }
      }
    }
  }

  /** Advance finite nonnegative seconds using steps no larger than 1/360 second. */
  step(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError("Invalid physics duration");
    let remaining = seconds;
    while (remaining > 0) {
      const dt = Math.min(1 / 360, remaining);
      this.integrate(dt);
      remaining -= dt;
    }
  }

  /** Return true only after heat, glyphs, edges and all particles have settled. */
  resting(): boolean {
    return (
      this.heat <= 0.004 &&
      !this.bits.some((bit) => bit.active) &&
      [this.top, this.bottom].every(
        (edge) =>
          edge.u.every((value) => Math.abs(value) <= 0.03) &&
          edge.v.every((value) => Math.abs(value) <= 0.3),
      ) &&
      this.glyphs.every(glyphResting)
    );
  }

  /** Clear all motion immediately, retaining pool slots and the current color phase. */
  reset() {
    this.heat = 0;
    this.glyphs.length = 0;
    for (const edge of [this.top, this.bottom]) {
      edge.u.fill(0);
      edge.v.fill(0);
    }
    for (const bit of this.bits) bit.active = false;
  }
}
