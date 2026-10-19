/** Additive layout and impact offsets; callers give this module exclusive ownership of transform. */
import { run } from "./loop";
import { isPhysicsEnabled, onPhysicsChange } from "./preference";
import type { Point } from "./project";
import { Spring } from "./spring";
import { TOKENS, type SpringToken } from "./tokens";

/** Separate springs keep impacts from changing layout damping or discarding layout momentum. */
export interface OffsetState {
  x: Spring;
  y: Spring;
  ix: Spring;
  iy: Spring;
  running: boolean;
}
const offsets = new WeakMap<Element, OffsetState>();

/** Return persistent springs, starting their task only when physics is enabled; element must own transform. */
export function offsetOf(el: HTMLElement): OffsetState {
  let state = offsets.get(el);
  if (!state) {
    state = {
      x: new Spring(),
      y: new Spring(),
      ix: new Spring({ token: TOKENS.jolt }),
      iy: new Spring({ token: TOKENS.jolt }),
      running: false,
    };
    offsets.set(el, state);
  }
  const current = state;
  if (!current.running && isPhysicsEnabled()) {
    current.running = true;
    const unsubscribe = onPhysicsChange((enabled) => {
      if (enabled) return;
      cancel();
      unsubscribe();
      current.running = false;
      current.x.jump(0);
      current.y.jump(0);
      current.ix.jump(0);
      current.iy.jump(0);
      el.style.transform = "";
    });
    const cancel = run((dt) => {
      // Step every channel; short-circuiting would freeze the remaining channels.
      const xMoving = current.x.step(dt);
      const yMoving = current.y.step(dt);
      const ixMoving = current.ix.step(dt);
      const iyMoving = current.iy.step(dt);
      const moving = xMoving || yMoving || ixMoving || iyMoving;
      el.style.transform = moving
        ? `translate(${(current.x.value + current.ix.value).toFixed(2)}px, ${(current.y.value + current.iy.value).toFixed(2)}px)`
        : "";
      current.running = moving;
      if (!moving) unsubscribe();
      return moving;
    });
  }
  return current;
}

/** Return the summed CSS pixel offset without allocating state or starting a task. */
export function readOffset(el: Element): Point {
  const state = offsets.get(el);
  return state
    ? { x: state.x.value + state.ix.value, y: state.y.value + state.iy.value }
    : { x: 0, y: 0 };
}

/** Animate from the previous visual rectangle to the current layout, preserving impact and optional px/s release velocity. */
export function flip(
  el: HTMLElement,
  fromRect: Pick<DOMRect, "left" | "top">,
  token: SpringToken = TOKENS.settle,
  velocity?: Point,
) {
  if (!isPhysicsEnabled()) return;
  const rect = el.getBoundingClientRect();
  const visual = readOffset(el);
  const dx = fromRect.left - (rect.left - visual.x);
  const dy = fromRect.top - (rect.top - visual.y);
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && !velocity?.x && !velocity?.y) return;
  const state = offsetOf(el);
  state.x.use(token);
  state.y.use(token);
  state.x.value = dx - state.ix.value;
  state.x.target = 0;
  state.y.value = dy - state.iy.value;
  state.y.target = 0;
  if (velocity) {
    state.x.velocity = velocity.x;
    state.y.velocity = velocity.y;
  }
  el.style.transform = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px)`;
}

/** Add an impact velocity in px/s without changing layout springs; disabled physics has no side effects. */
export function nudge(el: HTMLElement, vx: number, vy: number, token: SpringToken = TOKENS.jolt) {
  if (!isPhysicsEnabled()) return;
  const state = offsetOf(el);
  state.ix.use(token);
  state.iy.use(token);
  state.ix.velocity += vx;
  state.iy.velocity += vy;
}
