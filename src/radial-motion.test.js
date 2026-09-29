import { describe, it, expect } from "vitest";
import { RadialMotion } from "./radial-motion.js";
const loud = { level: 1, bass: 1, mid: 1, bpm: 120, transient: true };
describe("Radial musical motion", () => {
  it("turns slowly without transient speed jumps", () => {
    const motion = new RadialMotion();
    for (let i = 0; i < 600; i++) motion.update(loud, 1 / 60);
    expect(motion.angle).toBeGreaterThan(.4);
    expect(motion.angle).toBeLessThan(.6);
    const angle = motion.angle;
    motion.update({ ...loud, mid: 0 }, 1 / 60);
    expect(motion.angle - angle).toBeGreaterThan(0);
    expect(motion.angle - angle).toBeLessThan(.001);
  });
  it("responds to musical energy and slows to a stop in silence", () => {
    const motion = new RadialMotion();
    for (let i = 0; i < 120; i++) motion.update(loud, 1 / 30);
    expect(motion.velocity).toBeGreaterThan(.05);
    for (let i = 0; i < 240; i++) motion.update({}, 1 / 30);
    expect(motion.velocity).toBeLessThan(.00001);
    const silent = new RadialMotion();
    silent.update({}, .05);
    expect(silent.angle).toBe(0);
  });
  it("is frame-rate independent and freezes on pause", () => {
    const a = new RadialMotion(), b = new RadialMotion();
    for (let i = 0; i < 600; i++) a.update(loud, 1 / 60);
    for (let i = 0; i < 300; i++) b.update(loud, 1 / 30);
    expect(a.angle).toBeCloseTo(b.angle, 8);
    const before = a.angle;
    a.update(loud, 10, true);
    expect(a.angle).toBe(before);
  });
});
