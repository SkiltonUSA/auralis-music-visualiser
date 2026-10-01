import { describe, expect, it } from "vitest";
import { CrystalFacetRipples, CRYSTAL_RIPPLE_COUNT } from "./crystal-facet-ripples.js";

const beat = { transient: true, beatCount: 1, bass: 1 };
const brightness = (ripples, arc) => {
  let value = 0;
  for (let i = 0; i < CRYSTAL_RIPPLE_COUNT; i++) {
    const t = Math.max(0, Math.min(1, (Math.abs(arc - ripples.uniforms[i * 2]) - .06) / .16));
    value = Math.max(value, (1 - t * t * (3 - 2 * t)) * ripples.uniforms[i * 2 + 1]);
  }
  return value;
};

describe("crystal triangle ripples", () => {
  it("finishes the far-side growth release after the light has left the globe", () => {
    for (const fps of [30, 60, 120]) {
      const ripples = new CrystalFacetRipples();
      let previous = 0, largestDrop = 0, lateGrowth = 0;
      for (let frame = 0; frame < fps * 1.4; frame++) {
        ripples.update(frame === 0 ? beat : {}, 1 / fps);
        const growth = ripples.growthAt(Math.PI);
        largestDrop = Math.max(largestDrop, previous - growth);
        previous = growth;
        const time = (frame + 1) / fps;
        if (time >= .95 && time <= 1.02) {
          lateGrowth = Math.max(lateGrowth, growth);
          expect(brightness(ripples, Math.PI)).toBe(0);
        }
      }
      expect(lateGrowth).toBeGreaterThan(.7);
      expect(largestDrop).toBeLessThan(.25);
      expect(previous).toBe(0);
      expect(ripples.emissions).toBe(1);
    }
  });
  it("grows shards successively behind the light front, with bounded overlapping beats", () => {
    const ripples = new CrystalFacetRipples();
    expect(ripples.growthAt(0)).toBe(0);
    ripples.update(beat, .05);
    for (let i = 0; i < 2; i++) ripples.update({}, .05);
    expect(ripples.growthAt(0)).toBeGreaterThan(.7);
    expect(ripples.growthAt(1)).toBe(0);
    for (let i = 0; i < 5; i++) ripples.update({}, .05);
    expect(ripples.growthAt(0)).toBe(0);
    expect(ripples.growthAt(1)).toBeGreaterThan(.7);
    for (let i = 0; i < 40; i++) ripples.update({ ...beat, beatCount: i }, .05);
    for (let arc = 0; arc < Math.PI; arc += .05) expect(ripples.growthAt(arc)).toBeLessThanOrEqual(.901);
    for (let i = 0; i < 40; i++) ripples.update({}, .05);
    expect(ripples.growthAt(1)).toBe(0);
    expect(ripples.growthAt(NaN)).toBe(0);
  });
  it("lights successive surface distances in order, not all faces together", () => {
    const ripples = new CrystalFacetRipples();
    ripples.update(beat, .05);
    expect(brightness(ripples, 0)).toBeGreaterThan(.8);
    expect(brightness(ripples, 1)).toBe(0);
    for (let i = 0; i < 5; i++) ripples.update({}, .05);
    expect(brightness(ripples, 1)).toBeGreaterThan(.7);
    expect(brightness(ripples, 0)).toBe(0);
    expect(brightness(ripples, 2)).toBe(0);
    for (let i = 0; i < 6; i++) ripples.update({}, .05);
    expect(brightness(ripples, 2)).toBeGreaterThan(.7);
    for (let i = 0; i < 20; i++) ripples.update({}, .05);
    for (let arc = 0; arc <= Math.PI; arc += .05) expect(brightness(ripples, arc)).toBe(0);
  });
  it("emits once per beat and scales brightness with bass", () => {
    const loud = new CrystalFacetRipples(), soft = new CrystalFacetRipples();
    loud.update(beat, .05); soft.update({ ...beat, bass: 0 }, .05);
    expect(brightness(loud, 0)).toBeGreaterThan(brightness(soft, 0));
    for (let i = 0; i < 5; i++) loud.update(beat, .05);
    expect(loud.emissions).toBe(1);
    loud.update({ ...beat, beatCount: 2 }, .05);
    expect(loud.emissions).toBe(2);
  });
  it("freezes on pause and ignores sustained energy without an onset", () => {
    const ripples = new CrystalFacetRipples();
    ripples.update({ bass: 1, level: 1 }, .05);
    expect(ripples.emissions).toBe(0);
    ripples.update(beat, .05);
    const saved = ripples.uniforms.slice();
    for (const dt of [0, -1, NaN]) ripples.update({ ...beat, beatCount: 2 }, dt);
    expect(ripples.uniforms).toEqual(saved);
    expect(ripples.emissions).toBe(1);
  });
  it("keeps bounded storage, clamps stalls, and matches timing at 30/60 fps", () => {
    const a = new CrystalFacetRipples(), b = new CrystalFacetRipples();
    for (let i = 0; i < 30; i++) a.update(i ? {} : beat, 1 / 60);
    for (let i = 0; i < 15; i++) b.update(i ? {} : beat, 1 / 30);
    a.uniforms.forEach((value, i) => expect(value).toBeCloseTo(b.uniforms[i], 6));
    const buffer = a.uniforms, waves = a.waves;
    for (let i = 0; i < 1000; i++) a.update({ ...beat, beatCount: i, bass: i % 2 ? 9 : NaN }, 100);
    expect(a.uniforms).toBe(buffer); expect(a.waves).toBe(waves);
    expect(waves).toHaveLength(CRYSTAL_RIPPLE_COUNT);
    expect([...buffer].every(Number.isFinite)).toBe(true);
    expect(waves[(a.next + CRYSTAL_RIPPLE_COUNT - 1) % CRYSTAL_RIPPLE_COUNT].age).toBeCloseTo(.05);
    for (let arc = 0; arc < Math.PI; arc += .05) expect(brightness(a, arc)).toBeLessThan(.901);
  });
});
