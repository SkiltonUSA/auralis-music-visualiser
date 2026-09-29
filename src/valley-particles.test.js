import { describe, expect, it } from "vitest";
import { createValleyParticles, projectValleyParticle } from "./valley-particles.js";

describe("Valley upward perspective particles", () => {
  it("uses a small deterministic pool with slow, staggered journeys", () => {
    const particles = createValleyParticles();
    expect(particles).toHaveLength(48);
    expect(particles).toEqual(createValleyParticles());
    expect(new Set(particles.map(p => p.phase)).size).toBe(48);
    for (const particle of particles) {
      expect(particle.duration).toBeGreaterThanOrEqual(24);
      expect(particle.duration).toBeLessThanOrEqual(38);
    }
  });
  it("emerges at the centre and moves monotonically up and outward to the top", () => {
    for (const particle of createValleyParticles()) {
      const p = { ...particle, phase: 0 };
      let previous = projectValleyParticle(p, 0, 1280, 800);
      expect(previous.x).toBe(640);
      expect(previous.y).toBe(416);
      expect(previous.opacity).toBe(0);
      for (let step = 1; step < 100; step++) {
        const point = projectValleyParticle(p, p.duration * step / 100, 1280, 800);
        expect(point.y).toBeLessThan(previous.y);
        expect(Math.abs(point.x - 640)).toBeGreaterThanOrEqual(Math.abs(previous.x - 640));
        expect(point.x).toBeGreaterThan(0);
        expect(point.x).toBeLessThan(1280);
        expect(point.size).toBeGreaterThan(previous.size);
        expect(point.tailY).toBeGreaterThanOrEqual(point.y);
        previous = point;
      }
      expect(previous.y).toBeLessThan(0);
    }
  });
  it("keeps motion and streaks gentle even at the near end of the perspective", () => {
    const particle = { ...createValleyParticles()[0], phase: 0, duration: 24 };
    const a = projectValleyParticle(particle, 23, 1280, 800);
    const b = projectValleyParticle(particle, 23 + 1 / 60, 1280, 800);
    expect(a.y - b.y).toBeLessThan(1.4);
    expect(Math.hypot(a.x - a.tailX, a.y - a.tailY)).toBeLessThan(14);
  });
  it("uses only supplied animation time, so pausing or changing redraw rate cannot move stars", () => {
    const particle = createValleyParticles()[0];
    const frozen = projectValleyParticle(particle, 6, 1280, 800);
    for (let i = 0; i < 200; i++) expect(projectValleyParticle(particle, 6, 1280, 800)).toEqual(frozen);
    let at30, at60;
    for (let i = 0; i <= 30; i++) at30 = projectValleyParticle(particle, i / 30, 1280, 800);
    for (let i = 0; i <= 60; i++) at60 = projectValleyParticle(particle, i / 60, 1280, 800);
    expect(at30).toEqual(at60);
  });
  it("preserves perspective on portrait displays and fades recycling points", () => {
    const particle = { ...createValleyParticles()[0], phase: 0 };
    const wide = projectValleyParticle(particle, 12, 1280, 800);
    const tall = projectValleyParticle(particle, 12, 390, 844);
    expect(wide.x / 1280).toBeCloseTo(tall.x / 390);
    expect(wide.y / 800).toBeCloseTo(tall.y / 844);
    expect(projectValleyParticle(particle, particle.duration - .001, 1280, 800).opacity).toBeLessThan(.001);
    expect(projectValleyParticle(particle, particle.duration, 1280, 800).opacity).toBe(0);
  });
});
