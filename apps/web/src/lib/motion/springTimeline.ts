/** A lazily sampled shadow of a normalized WAAPI spring; no animation task or DOM writes. */
import { Spring } from "./spring";
import type { SpringToken } from "./tokens";

/** Records a transition's origin so interruptions can inherit physical velocity in either direction. */
export class SpringTimeline {
  private readonly token: SpringToken;
  private readonly startedAt: number;
  private readonly initialVelocity: number;

  /** token uses seconds/damping ratio; startedAt is a performance timestamp in ms; velocity is normalized units/s. */
  constructor(token: SpringToken, startedAt: number, initialVelocity = 0) {
    this.token = { ...token };
    this.startedAt = startedAt;
    this.initialVelocity = initialVelocity;
  }

  /** Return normalized position and units/s velocity at now (ms), clamping pre-start reads to the origin.
   * Replay the baker's 1 ms steps so results do not depend on the order or frequency of reads.
   */
  at(now: number) {
    if (!Number.isFinite(now)) throw new RangeError("Timeline timestamp must be finite");
    const spring = new Spring({
      target: 1,
      token: this.token,
      velocity: this.initialVelocity,
      precision: 0.01,
    });
    let remainingMs = Math.max(0, now - this.startedAt);
    while (remainingMs > 0 && !spring.isSettled) {
      const stepMs = Math.min(1, remainingMs);
      spring.step(stepMs / 1000);
      remainingMs -= stepMs;
    }
    return { value: spring.value, velocity: spring.velocity };
  }
}
