import { describe, it, expect } from "vitest";
import { Vector4 } from "three";
import { FlowingTerrain } from "./flowing-terrain.js";
import { seededRandom } from "./procedural-scenes.js";

describe("flowing simplex terrain", () => {
  it("keeps a stable seeded field and samples both terrain dimensions", () => {
    const a = new FlowingTerrain(seededRandom(42)), b = new FlowingTerrain(seededRandom(42));
    expect(a.geometry.attributes.position.array).toEqual(b.geometry.attributes.position.array);
    const before = a.geometry.attributes.position.array.slice(), noise = a.noise;
    a.update(0, new Vector4());
    expect(a.noise).toBe(noise);
    expect(a.geometry.attributes.position.array).toEqual(before);
    expect(a.heightAt(2, 5)).not.toBe(a.heightAt(5, 2));
    a.geometry.dispose(); b.geometry.dispose();
  });

  it("advects the same features smoothly and independently of frame rate", () => {
    const a = new FlowingTerrain(seededRandom(42)), b = new FlowingTerrain(seededRandom(42));
    const audio = new Vector4(.5, .3, .2, .7), before = a.heightAt(2, 5, .5, .2);
    a.update(1 / 60, audio);
    expect(Math.abs(a.heightAt(2, 5, .5, .2) - before)).toBeLessThan(.02);
    expect(a.heightAt(2, 5, .5, .2)).toBeCloseTo(b.heightAt(2, 5 - a.travel, .5, .2), 10);
    for (let i = 1; i < 60; i++) a.update(1 / 60, audio);
    for (let i = 0; i < 30; i++) b.update(1 / 30, audio);
    expect(a.travel).toBeCloseTo(b.travel, 10);
    expect(a.heightAt(2, 5, .5, .2)).toBeCloseTo(b.heightAt(2, 5, .5, .2), 10);
    a.geometry.dispose(); b.geometry.dispose();
  });

  it("responds to music, updates normals, and stays below the camera", () => {
    const terrain = new FlowingTerrain(seededRandom(42));
    const before = terrain.geometry.attributes.position.array.slice();
    terrain.update(0, new Vector4(1, 1, 1, 1));
    const position = terrain.geometry.attributes.position;
    expect(position.array).not.toEqual(before);
    expect([...terrain.geometry.attributes.normal.array].every(Number.isFinite)).toBe(true);
    for (let i = 0; i < position.count; i++) {
      expect(position.getY(i)).toBeGreaterThan(-4.1);
      expect(position.getY(i)).toBeLessThan(-1.5);
      expect(position.getX(i)).toBe(before[i * 3]);
      expect(position.getZ(i)).toBe(before[i * 3 + 2]);
    }
    terrain.update(10, new Vector4(1, 1, 1, 1));
    expect(terrain.travel).toBeCloseTo(.05);
    terrain.geometry.dispose();
  });
});
