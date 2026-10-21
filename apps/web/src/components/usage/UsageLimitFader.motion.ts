/** Fader-local physics; the caller owns the shared clock and DOM writes. */
import { Spring } from "../../lib/motion/spring";
import { TOKENS } from "../../lib/motion/tokens";

/** Keeps displayed position separate from the authoritative usage percentage. */
export class FaderMotion {
  readonly spring = new Spring({ token: TOKENS.fling, precision: 0.01 });
  private delay = 0;
  private enabled = true;
  private dragging = false;

  /** Apply effective motion permission; disabling snaps to real usage and ends any gesture. */
  configure(enabled: boolean, usedPercent: number) {
    this.enabled = enabled;
    if (!enabled) {
      this.dragging = false;
      this.spring.jump(usedPercent);
      this.delay = 0;
    }
  }

  /** Process browser pointer phases; true requests a return animation after an active gesture ends. */
  pointer(type: string, usedPercent: number): boolean {
    if (!this.enabled) return false;
    if (type === "pointerdown") this.dragging = true;
    else if (type === "pointermove" && this.dragging) this.drag(usedPercent);
    else if (this.dragging && ["pointerup", "pointercancel", "lostpointercapture"].includes(type)) {
      this.dragging = false;
      this.release(usedPercent);
      return true;
    }
    return false;
  }

  /** Start an entrance or refresh toward usage percent; delay is seconds, only for entrance. */
  target(usedPercent: number, delay = 0) {
    this.spring.target = usedPercent;
    this.delay = delay;
  }

  /** Follow a pointer in percentage units, discarding stale return momentum. */
  drag(usedPercent: number) {
    if (!this.enabled) return;
    this.spring.jump(Math.max(0, Math.min(100, usedPercent)));
    this.delay = 0;
  }

  /** Release from the current position toward real usage, without jumping to it. */
  release(usedPercent: number) {
    this.target(usedPercent);
  }

  /** Advance by seconds; false tells the shared clock to remove this task. */
  step(dt: number) {
    if (this.delay > 0) {
      this.delay -= dt;
      if (this.delay > 0) return true;
      dt = -this.delay;
    }
    return this.spring.step(dt);
  }
}
