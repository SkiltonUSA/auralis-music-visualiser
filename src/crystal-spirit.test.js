import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { CrystalSpirit, SpiritMotion, createSpiritSeeds, SPIRIT_COUNTS, SPIRIT_SIZE } from "./crystal-spirit.js";
import { ProceduralScenes, seededRandom, createCrystalGeometry, createCrystalLayout } from "./procedural-scenes.js";
import { createNeonCrystalMaterial } from "./neon-crystals.js";

const colors = [0x83ffd1, 0x408cfa, 0xbb62ff];
const audio = { bass: .8, mid: .6, high: .4, level: .7 };
function setup(supported = true) {
  const renderer = { target: { name: 'outer' }, extensions: { has: () => supported },
    getRenderTarget() { return this.target; }, setRenderTarget(target) { this.target = target; }, render: vi.fn() };
  const scene = new THREE.Scene();
  return { renderer, scene, spirit: new CrystalSpirit(renderer, scene, seededRandom(42)) };
}

describe("Crystal Spirit audio and seeds", () => {
  it("seeds a bounded repeatable cloud with randomized lifetimes", () => {
    const data = createSpiritSeeds(seededRandom(42));
    expect(data).toEqual(createSpiritSeeds(seededRandom(42)));
    expect(data).not.toEqual(createSpiritSeeds(seededRandom(43)));
    expect(data.length).toBe(SPIRIT_SIZE * SPIRIT_SIZE * 4);
    for (let i = 0; i < data.length; i += 4) {
      expect(Math.hypot(data[i], data[i + 1], data[i + 2])).toBeLessThanOrEqual(1.000001);
      expect(data[i + 3]).toBeGreaterThan(0); expect(data[i + 3]).toBeLessThan(1);
    }
  });
  it("smooths musical response independently of frame rate and caps stalled steps", () => {
    const a = new SpiritMotion(), b = new SpiritMotion();
    for (let i = 0; i < 60; i++) a.update(audio, 1 / 60);
    for (let i = 0; i < 30; i++) b.update(audio, 1 / 30);
    expect(a.time).toBeCloseTo(b.time, 10);
    expect(a.audio.clone().sub(b.audio).length()).toBeLessThan(1e-9);
    expect(a.audio.x).toBeLessThan(audio.bass);
    expect(a.update(audio, 100)).toBe(.05);
    a.update({ bass: NaN, high: Infinity, level: -1 }, .05);
    expect(a.audio.toArray().every(Number.isFinite)).toBe(true);
  });
  it("deduplicates beat pulses, releases smoothly and freezes on pause", () => {
    const state = new SpiritMotion();
    state.update({ transient: true, beatCount: 1, bass: 1 }, .016);
    expect(state.pulse).toBe(1);
    state.update({ transient: true, beatCount: 1, bass: 1 }, .05);
    expect(state.pulse).toBeLessThan(1);
    const before = JSON.stringify(state);
    expect(state.update({ transient: true, beatCount: 2 }, 0)).toBe(0);
    expect(JSON.stringify(state)).toBe(before);
    for (let i = 0; i < 80; i++) state.update({}, .05);
    expect(state.pulse).toBeLessThan(.001);
  });
});

describe("Crystal Spirit GPU lifecycle", () => {
  it("allocates targets lazily and restores the enclosing render target", () => {
    const { spirit, renderer } = setup(), previous = renderer.target;
    expect(spirit.targets).toHaveLength(0);
    spirit.update(audio, .016, colors);
    expect(spirit.targets).toHaveLength(2);
    expect(renderer.render).toHaveBeenCalledTimes(3);
    expect(renderer.target).toBe(previous);
    expect(spirit.targets[0].texture.type).toBe(THREE.FloatType);
    expect(spirit.uniforms.uPrevious.value).not.toBe(spirit.uniforms.uPositions.value);
    const targets = spirit.targets.slice();
    spirit.update(audio, .016, colors);
    expect(renderer.render).toHaveBeenCalledTimes(4);
    expect(spirit.targets).toEqual(targets);
    spirit.dispose();
  });
  it("changes quality and viewport without clearing simulation history", () => {
    const { spirit } = setup();
    spirit.update(audio, .016, colors);
    const targets = spirit.targets.slice(), texture = spirit.uniforms.uPositions.value;
    for (const quality of ['auto', 'high', 'ultra', 'auto']) {
      spirit.setQuality(quality, 1000);
      expect(spirit.points.geometry.drawRange.count).toBe(SPIRIT_COUNTS[quality]);
      expect(spirit.uniforms.uCount.value).toBe(SPIRIT_COUNTS[quality]);
      expect(spirit.uniforms.uHeight.value).toBe(1000);
      expect(spirit.targets).toEqual(targets);
      expect(spirit.uniforms.uPositions.value).toBe(texture);
    }
    expect(spirit.points.material.depthTest).toBe(true);
    expect(spirit.points.material.depthWrite).toBe(false);
    spirit.dispose();
  });
  it("preserves GPU history at zero delta and releases every owned resource once", () => {
    const { spirit, scene, renderer } = setup();
    spirit.update(audio, .016, colors);
    const texture = spirit.uniforms.uPositions.value, time = spirit.motion.time;
    renderer.render.mockClear();
    spirit.update(audio, 0, colors);
    expect(renderer.render).not.toHaveBeenCalled();
    expect(spirit.uniforms.uPositions.value).toBe(texture);
    expect(spirit.motion.time).toBe(time);
    const resources = [...spirit.targets, spirit.seeds, spirit.quad.geometry, spirit.quad.material, spirit.points.geometry, spirit.points.material];
    const spies = resources.map(resource => vi.spyOn(resource, 'dispose'));
    spirit.dispose(); spirit.dispose();
    spies.forEach(spy => expect(spy).toHaveBeenCalledOnce());
    expect(scene.children).not.toContain(spirit.points);
  });
  it("omits only the added cloud on hardware without float render targets", () => {
    const { spirit, scene, renderer } = setup(false);
    spirit.setQuality('ultra', 900); spirit.update(audio, .016, colors); spirit.dispose();
    expect(spirit.supported).toBe(false);
    expect(scene.children).toHaveLength(0);
    expect(renderer.render).not.toHaveBeenCalled();
  });
  it("restores the render target if simulation fails", () => {
    const { spirit, renderer } = setup(), previous = renderer.target;
    spirit.update(audio, .016, colors);
    renderer.render.mockImplementation(() => { throw Error('GPU failure'); });
    expect(() => spirit.update(audio, .016, colors)).toThrow('GPU failure');
    expect(renderer.target).toBe(previous);
    spirit.dispose();
  });
  it("lives only in Crystals, freezes while hidden/paused and shares scene disposal", () => {
    const { spirit, renderer, scene } = setup();
    const spectrum = new THREE.Texture(), worlds = new ProceduralScenes(renderer, spectrum, 42);
    const layout = createCrystalLayout(42), material = createNeonCrystalMaterial(new THREE.Vector4());
    const crystals = new THREE.InstancedMesh(createCrystalGeometry(42), material, layout.length);
    const anchor = new THREE.Group(); anchor.add(crystals); scene.add(anchor);
    const entry = { spirit, scene, crystals, material, anchor, layout,
      camera: new THREE.PerspectiveCamera(), target: new THREE.WebGLRenderTarget(),
      audio: new THREE.Vector4(), time: 0, age: 4, rendered: false };
    worlds.entries.set(11, entry);
    worlds.render(11, audio, .016, 0, [], false);
    const time = spirit.motion.time;
    const calls = renderer.render.mock.calls.length;
    worlds.render(11, audio, 1, 0, [], true);
    worlds.render(0, audio, 1, 0, [], false);
    expect(spirit.motion.time).toBe(time);
    expect(renderer.render).toHaveBeenCalledTimes(calls);
    worlds.resize(1920, 1080, 'high');
    worlds.render(11, audio, 1, 0, [], true);
    expect(spirit.motion.time).toBe(time);
    const dispose = vi.spyOn(spirit.points.material, 'dispose');
    worlds.dispose(); spectrum.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
