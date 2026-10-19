/** Pure spring integration; callers own scheduling and motion preferences. */
import { TOKENS, type SpringToken } from "./tokens";

/** Position and velocity in caller units, integrated with implicit damping in at most 4 ms steps. */
export class Spring {
  value: number;
  target: number;
  velocity: number;
  precision: number;
  private stiffness = 0;
  private damping = 0;

  /** Initialize position, target, units/second velocity and positional rest tolerance. */
  constructor({
    value = 0,
    target = value,
    velocity = 0,
    token = TOKENS.settle,
    precision = 0.1,
  }: {
    value?: number;
    target?: number;
    velocity?: number;
    token?: SpringToken;
    precision?: number;
  } = {}) {
    this.value = value;
    this.target = target;
    this.velocity = velocity;
    this.precision = precision;
    this.use(token);
  }

  /** Change physical parameters without discarding position or momentum; returns this spring. */
  use(token: SpringToken) {
    const omega = (2 * Math.PI) / token.response;
    this.stiffness = omega * omega;
    this.damping = 2 * token.damping * omega;
    return this;
  }

  /**
   * Return whether position error is < precision and absolute velocity is < precision * 20.
   * This only checks rest conditions; it does not snap to the target or change velocity.
   * Callers use this result to end motion tasks.
   */
  get isSettled() {
    return (
      Math.abs(this.value - this.target) < this.precision &&
      Math.abs(this.velocity) < this.precision * 20
    );
  }

  /** Advance by nonnegative finite seconds; return whether movement remains. */
  step(dt: number) {
    if (!Number.isFinite(dt) || dt < 0)
      throw new RangeError("Spring dt must be finite and nonnegative");
    const substeps = Math.max(1, Math.ceil(dt / 0.004));
    const h = dt / substeps;
    for (let i = 0; i < substeps; i++) {
      const acceleration = -this.stiffness * (this.value - this.target);
      this.velocity = (this.velocity + acceleration * h) / (1 + this.damping * h);
      this.value += this.velocity * h;
    }
    if (this.isSettled) {
      this.jump(this.target);
      return false;
    }
    return true;
  }

  /** Set both position and target in caller units and remove all momentum. */
  jump(value: number) {
    this.value = value;
    this.target = value;
    this.velocity = 0;
  }
}
