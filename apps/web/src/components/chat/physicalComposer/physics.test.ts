/** Independent numeric contracts from the approved prototype, not renderer snapshots. */
import { describe, expect, it } from "vite-plus/test";
import { createGlyph, damping, DEFAULT_PHYSICS, squash, TypingPhysics } from "./physics";

describe("physical typing model", () => {
  it("uses the approved damping ratio and caps velocity deformation", () => {
    expect(damping(DEFAULT_PHYSICS)).toBeCloseTo(44.7778516679843, 7);
    expect(squash(-260)).toBeCloseTo(0.1);
    expect(squash(2600)).toBe(0.22);
  });

  it("advances displacement, rotation and scale with the same damped spring", () => {
    const model = new TypingPhysics();
    const glyph = createGlyph(100, 20);
    glyph.r = 2;
    model.glyphs.push(glyph);
    model.step(1 / 360);
    expect(glyph.vy).toBeCloseTo(26.666666667, 7);
    expect(glyph.y).toBeCloseTo(-14.925925926, 7);
    expect(glyph.vr).toBeCloseTo(-3.555555556, 7);
    expect(glyph.s).toBeCloseTo(0.552222222, 7);
    model.step(1 / 360);
    expect(glyph.vy).toBeCloseTo(49.8847681892028, 6);
  });

  it("accumulates insertion/deletion heat, clamps it and cools exponentially", () => {
    const model = new TypingPhysics();
    model.warm(1, 1);
    expect(model.heat).toBeCloseTo(0.11);
    model.step(1);
    expect(model.heat).toBeCloseTo(0.06036927997, 9);
    model.warm(20);
    expect(model.heat).toBe(1);
  });

  it("integrates the wave equation with fixed endpoints and heat-dependent tension and damping", () => {
    const model = new TypingPhysics({ coolingRate: 0 });
    model.heat = 1;
    model.top.u[20] = 1;
    model.top.v[20] = 2;
    model.top.u[0] = 7;
    model.top.v[39] = 9;
    model.step(1 / 360);
    expect(model.top.v[20]).toBeCloseTo(-0.433888889, 7);
    expect(model.top.v[19]).toBeCloseTo(1.145833333, 7);
    expect(model.top.u[0]).toBe(0);
    expect(model.top.v[39]).toBe(0);
    expect(model.top.u).toHaveLength(40);
    expect(model.bottom.u).toHaveLength(40);
  });

  it("reuses 180 particle slots and expires them after the approved lifetime", () => {
    const model = new TypingPhysics({}, () => 0.5);
    model.burst(100, 20, 180, 200, 0, 1);
    const slots = [...model.bits];
    expect(model.bits).toHaveLength(180);
    expect(model.bits[0]?.life).toBeCloseTo(1.4);
    model.burst(100, 20, 20, 200, 0, 1);
    expect(model.bits).toEqual(slots);
    expect(model.bits.every((bit, index) => bit === slots[index])).toBe(true);
    model.step(1.41);
    expect(model.bits.filter((bit) => bit.active)).toHaveLength(0);
  });

  it("applies gravity, restitution and at most two floor bounces", () => {
    const model = new TypingPhysics({}, () => 0.5);
    model.burst(100, 20, 1, 200, 0, 0);
    const bit = model.bits[0]!;
    model.step(1 / 360);
    expect(bit.vy).toBeCloseTo(4.166666667, 7);
    bit.y = 80;
    bit.vy = 100;
    model.step(1 / 360);
    expect(bit.vy).toBeCloseTo(-39.583333333, 7);
    expect(bit.bounced).toBe(1);
    bit.y = 80;
    bit.vy = 100;
    bit.bounced = 2;
    model.step(1 / 360);
    expect(bit.vy).toBe(0);
    expect(bit.bounced).toBe(2);
  });

  it("stays active during heat and delayed glyph motion, then settles", () => {
    const model = new TypingPhysics();
    expect(model.resting()).toBe(true);
    model.warm(1);
    expect(model.resting()).toBe(false);
    const glyph = createGlyph(100, 20);
    glyph.delay = 0.1;
    glyph.pending = -240;
    model.glyphs.push(glyph);
    model.step(0.05);
    expect(model.resting()).toBe(false);
    model.step(20);
    expect(model.resting()).toBe(true);
  });
});
