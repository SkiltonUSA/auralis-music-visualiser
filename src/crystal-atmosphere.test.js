import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { CrystalBeatGrowth, CrystalSmokeVeils } from "./crystal-atmosphere.js";
import { seededRandom } from "./procedural-scenes.js";

describe("crystal beat growth", () => {
  it("grows on a beat and settles to its original size without undershooting", () => {
    const motion = new CrystalBeatGrowth();
    expect(motion.update({}, 1 / 60)).toBe(0);
    expect(motion.update({ transient: true, beatCount: 1, bass: .8 }, 1 / 60)).toBeGreaterThan(0);
    const heights = [];
    for (let i = 0; i < 240; i++) heights.push(motion.update({}, 1 / 60));
    expect(Math.max(...heights)).toBeGreaterThan(.6);
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(0);
    expect(motion.growth).toBeLessThan(.001);
  });
  it("is frame-rate independent and does not repeatedly trigger a held beat", () => {
    const run = (fps) => {
      const motion = new CrystalBeatGrowth();
      for (let i = 0; i < fps; i++) motion.update({ transient: true, beatCount: 1, bass: 1 }, 1 / fps);
      return motion;
    };
    const slow = run(30), fast = run(120);
    expect(slow.growth).toBeCloseTo(fast.growth, 9);
    expect(slow.drive).toBeCloseTo(fast.drive, 9);
    expect(slow.growth).toBeLessThan(.03);
  });
  it("bounds repeated impulses and leaves state untouched for a paused step", () => {
    const motion = new CrystalBeatGrowth();
    for (let i = 0; i < 500; i++) {
      const height = motion.update({ transient: true, beatCount: i, bass: 1 }, .016);
      expect(height).toBeGreaterThanOrEqual(0);
      expect(height).toBeLessThanOrEqual(1.2);
    }
    const snapshot = { ...motion };
    motion.update({ transient: true, beatCount: 1000 }, 0);
    expect({ ...motion }).toEqual(snapshot);
  });
});

describe("random grey smoke veils", () => {
  function create(seed) { return new CrystalSmokeVeils(new THREE.Scene(), seededRandom(seed)); }
  function dispose(veils) {
    veils.slots[0].mesh.geometry.dispose();
    veils.slots.forEach((slot) => slot.mesh.material.dispose());
  }
  it("uses a fixed two-sheet pool with seeded, varying intervals and thicker bounded opacity", () => {
    const a = create(42), b = create(42), c = create(43);
    expect(a.next).toBe(b.next);
    expect(a.next).not.toBe(c.next);
    const meshes = a.slots.map((slot) => slot.mesh), intervals = new Set();
    let visibleFrames = 0, clearFrames = 0;
    for (let i = 0; i < 1200; i++) {
      a.update(.05, .8); b.update(.05, .8);
      intervals.add(a.next);
      expect(a.next).toBe(b.next);
      if (a.slots.some((slot) => slot.active)) visibleFrames++; else clearFrames++;
      for (const slot of a.slots) {
        expect(slot.mesh.material.uniforms.uOpacity.value).toBeGreaterThanOrEqual(0);
        expect(slot.mesh.material.uniforms.uOpacity.value).toBeLessThanOrEqual(.88);
        expect(slot.mesh.material.blending).toBe(THREE.NormalBlending);
      }
    }
    expect(visibleFrames).toBeGreaterThan(0); expect(clearFrames).toBeGreaterThan(0);
    expect(intervals.size).toBeGreaterThan(5);
    expect(a.slots.map((slot) => slot.mesh)).toEqual(meshes);
    [a, b, c].forEach(dispose);
  });
  it("fades at both ends and freezes its schedule and positions on pause", () => {
    const veils = create(42), slot = veils.slots[0];
    veils.spawn(slot); veils.next = 100;
    expect(slot.opacity).toBeGreaterThanOrEqual(.72);
    expect(slot.mesh.scale.y).toBeGreaterThanOrEqual(3.2);
    expect(slot.duration).toBeGreaterThanOrEqual(7);
    veils.update(.001);
    expect(slot.mesh.material.uniforms.uOpacity.value).toBeLessThan(.001);
    for (let i = 0; i < 30; i++) veils.update(.05);
    const time = veils.time, position = slot.mesh.position.clone(), alpha = slot.mesh.material.uniforms.uOpacity.value;
    veils.update(0, 1);
    expect(veils.time).toBe(time); expect(slot.mesh.position).toEqual(position);
    expect(slot.mesh.material.uniforms.uOpacity.value).toBe(alpha);
    for (let i = 0; i < 220; i++) veils.update(.05);
    expect(slot.active).toBe(false); expect(slot.mesh.visible).toBe(false);
    dispose(veils);
  });
});
