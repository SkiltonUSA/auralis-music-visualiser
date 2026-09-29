import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { createTerrainChunk, terrainTiles, TERRAIN_CHUNK, flightCenter, flightAltitude } from "./terrain-flyover.js";
import { ProceduralScenes } from "./procedural-scenes.js";

describe("flyover terrain chunks", () => {
  it("builds upward-facing indexed grids with skirts on every border", () => {
    const res = 12, geometry = createTerrainChunk(res), count = (res + 1) ** 2;
    const p = geometry.attributes.position, skirts = geometry.attributes.aSkirt;
    expect(p.count).toBe(count + res * 4);
    expect(geometry.index.count).toBe(res * res * 6 + res * 4 * 6);
    expect([...p.array].every(Number.isFinite)).toBe(true);
    expect([...skirts.array].filter(v => v === 1)).toHaveLength(res * 4);
    expect(Math.max(...geometry.index.array)).toBeLessThan(p.count);
    const vertex = i => new THREE.Vector3().fromBufferAttribute(p, geometry.index.getX(i));
    const a = vertex(0), b = vertex(1), c = vertex(2);
    expect(b.sub(a).cross(c.sub(a)).y).toBeGreaterThan(0);
    for (let i = count; i < p.count; i++) {
      expect(p.getX(i) === 0 || p.getX(i) === TERRAIN_CHUNK || p.getZ(i) === 0 || p.getZ(i) === TERRAIN_CHUNK).toBe(true);
    }
    geometry.dispose(); expect(() => createTerrainChunk(0)).toThrow(RangeError);
  });
  it("recycles a bounded grid without shifting surviving world coordinates", () => {
    const before = terrainTiles(0, 0, 4), after = terrainTiles(129, -1, 4);
    expect(before).toHaveLength(81); expect(after).toHaveLength(81);
    expect(new Set(before.map(t => `${t.x},${t.z}`)).size).toBe(81);
    expect(before.filter(t => t.lod === 0)).toHaveLength(9);
    expect(before.filter(t => t.lod === 1)).toHaveLength(16);
    expect(before.filter(t => t.lod === 2)).toHaveLength(56);
    expect(after.filter(t => before.some(b => b.x === t.x && b.z === t.z))).toHaveLength(64);
    expect(terrainTiles(0, 0, 6)).toHaveLength(169);
  });
  it("keeps the flight path continuous with bounded height and turns", () => {
    for (let z = -10000; z < 10000; z += 19.7) {
      expect(flightAltitude(z)).toBeGreaterThanOrEqual(46);
      expect(flightAltitude(z)).toBeLessThanOrEqual(70);
      expect(Math.abs(flightCenter(z + .25, 2) - flightCenter(z, 2))).toBeLessThan(.12);
    }
  });
});

describe("flyover lifecycle", () => {
  const setup = () => {
    const renderer = { getRenderTarget: () => null, setRenderTarget: vi.fn(), render: vi.fn() };
    const texture = new THREE.Texture(), worlds = new ProceduralScenes(renderer, texture, 42);
    worlds.resize(1800, 1200, "auto");
    return { worlds, renderer, dispose() { worlds.dispose(); texture.dispose(); } };
  };
  it("generates lazily, reuses geometry, and pauses across quality changes", () => {
    const test = setup(), { worlds } = test;
    expect(worlds.entries.size).toBe(0);
    worlds.render(14, {}, .016, 0, [], false);
    const entry = worlds.entries.get(14), fly = entry.flyover;
    const geometries = fly.batches.map(b => b.geometry);
    const disposals = geometries.map(g => vi.spyOn(g, "dispose"));
    const materials = vi.spyOn(fly.material, "dispose");
    expect(entry.target.width).toBe(1000);
    expect(fly.batches.reduce((sum, b) => sum + b.count, 0)).toBe(81);
    for (let i = 0; i < 1000; i++) worlds.render(14, { level: 1, bass: 1 }, .05, 0, [], false);
    expect(fly.batches.map(b => b.geometry)).toEqual(geometries);
    expect(fly.speed).toBeGreaterThan(47.5);
    expect(fly.speed).toBeLessThanOrEqual(48.75);
    const time = fly.time, travel = fly.travel, position = entry.camera.position.clone();
    worlds.resize(1800, 1200, "ultra");
    worlds.render(14, {}, 10, 0, [], true);
    expect(fly.batches.reduce((sum, b) => sum + b.count, 0)).toBe(169);
    expect(fly.time).toBe(time); expect(fly.travel).toBe(travel);
    expect(entry.camera.position).toEqual(position);
    worlds.render(0, {}, 10, 0, [], false);
    expect(fly.travel).toBe(travel);
    test.dispose(); disposals.forEach(spy => expect(spy).toHaveBeenCalledOnce());
    expect(materials).toHaveBeenCalledOnce();
  });
  it("repeats its seed, travels independently of frame rate, and eases audio", () => {
    const a = setup(), b = setup();
    for (const test of [a, b]) test.worlds.render(14, {}, 0, 0, [], false);
    const first = a.worlds.entries.get(14).flyover, second = b.worlds.entries.get(14).flyover;
    expect(first.uniforms.uSeed.value).toEqual(second.uniforms.uSeed.value);
    expect(first.uniforms.uLow.value.getHex()).toBe(0xff279e);
    expect(first.uniforms.uRock.value.getHex()).toBe(0x19eaff);
    for (let i = 0; i < 300; i++) first.update({}, 1 / 30, 0);
    for (let i = 0; i < 600; i++) second.update({}, 1 / 60, 0);
    expect(first.travel).toBeCloseTo(375, 8);
    expect(first.camera.position.distanceTo(second.camera.position)).toBeLessThan(1e-8);
    const position = first.camera.position.clone();
    first.update({ bass: 1, mid: 1, high: 1, level: 1, transient: true }, 10, 0);
    expect(first.audio.x).toBeGreaterThan(0); expect(first.audio.x).toBeLessThan(.1);
    expect(first.camera.position.distanceTo(position)).toBeLessThan(2.25);
    a.dispose(); b.dispose();
  });
});
