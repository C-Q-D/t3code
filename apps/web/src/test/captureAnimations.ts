/** Browser-only WAAPI control shared by interaction suites. */
import { vi } from "vite-plus/test";

/** Freeze real animations before control returns to production or browser transport.
 * Install before the action under test; disposal restores WAAPI and releases captured animations.
 */
export function captureAnimations() {
  const original = Element.prototype.animate;
  const animations: Animation[] = [];
  const spy = vi.spyOn(Element.prototype, "animate").mockImplementation(function (
    this: Element,
    ...args: Parameters<Element["animate"]>
  ) {
    const animation = original.apply(this, args);
    animation.pause();
    animation.currentTime = 0;

    animations.push(animation);
    return animation;
  });
  return {
    animations,
    [Symbol.dispose]() {
      spy.mockRestore();
      for (const animation of animations) animation.cancel();
    },
  };
}
