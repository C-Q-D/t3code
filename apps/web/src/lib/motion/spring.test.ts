/** Physical invariants independent of the spring's integration formula. */
import { describe, expect, it } from "vite-plus/test";
import { Spring } from "./spring";
import { TOKENS } from "./tokens";

describe("Spring", () => {
  it.each(Object.entries(TOKENS))("%s converges without losing finite state", (_name, token) => {
    const spring = new Spring({ value: -100, target: 80, velocity: 600, token });
    const samples = Array.from({ length: 1200 }, () => {
      spring.step(1 / 60);
      return spring.value;
    });
    expect(samples.every(Number.isFinite)).toBe(true);
    expect(spring.value).toBe(80);
    expect(spring.velocity).toBe(0);
    expect(spring.isSettled).toBe(true);
  });

  it("large damping stays bounded and converges with long frames", () => {
    const spring = new Spring({ target: 100, token: { response: 0.26, damping: 20 } });
    const samples = Array.from({ length: 2000 }, () => {
      spring.step(0.05);
      return spring.value;
    });
    expect(samples.every((value) => value >= 0 && value <= 100)).toBe(true);
    expect(spring.value).toBe(100);
  });

  it("retargeting and changing token preserve velocity until explicitly jumped", () => {
    const spring = new Spring({ target: 100 });
    spring.step(0.05);
    const { value, velocity } = spring;
    expect(velocity).toBeGreaterThan(0);
    spring.target = -100;
    spring.use(TOKENS.fling);
    expect(spring.value).toBe(value);
    expect(spring.velocity).toBe(velocity);
    spring.jump(20);
    expect([spring.value, spring.target, spring.velocity]).toEqual([20, 20, 0]);
    expect(spring.step(0.016)).toBe(false);
  });
});
