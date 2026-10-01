import { describe, it, expect, vi } from "vitest";
import * as THREE from "three";
import { CrystalBeatGrowth } from "./crystal-atmosphere.js";
import { createNeonCrystalMaterial, CRYSTAL_NEON_PALETTES } from "./neon-crystals.js";
import { seededRandom, createCrystalGeometry, createCrystalCoreGeometry, createCrystalLayout, createAuroraGeometry, addAuroraCurtains, ProceduralScenes, isProceduralMode } from "./procedural-scenes.js";

describe("procedural generation", () => {
  it("repeats a seed without repeating different seeds", () => {
    const sequence = (seed) => { const random = seededRandom(seed); return Array.from({ length: 100 }, random); };
    expect(sequence(42)).toEqual(sequence(42));
    expect(sequence(42)).not.toEqual(sequence(43));
    expect(sequence(42).every((n) => n >= 0 && n < 1)).toBe(true);
  });
  it("builds finite flat-shaded quartz with outward-facing side normals", () => {
    const geometry = createCrystalGeometry();
    const p = geometry.attributes.position, n = geometry.attributes.normal;
    expect(p.count).toBe(72);
    expect([...p.array, ...n.array].every(Number.isFinite)).toBe(true);
    for (let face = 0; face < 6; face++) {
      const i = face * 12;
      expect(p.getX(i) * n.getX(i) + p.getZ(i) * n.getZ(i)).toBeGreaterThan(0);
    }
    geometry.dispose();
  });
  it("creates bounded, stable surface anchors and valid spectrum indices", () => {
    const layout = createCrystalLayout(123);
    expect(layout).toHaveLength(320);
    expect(layout).toEqual(createCrystalLayout(123));
    expect(layout).not.toEqual(createCrystalLayout(124));
    for (const shard of layout) {
      expect(shard.position.length()).toBeGreaterThan(1.62);
      expect(shard.position.length()).toBeLessThan(1.636);
      expect(shard.rotation.length()).toBeCloseTo(1);
      expect(shard.band).toBeGreaterThanOrEqual(0);
      expect(shard.band).toBeLessThan(256);
    }
  });
  it("embeds every shard in the actual smooth core, with outward growth and spatial wave coordinates", () => {
    const geometry = createCrystalCoreGeometry();
    const surface = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    const ray = new THREE.Raycaster();
    expect(geometry.attributes.position.count / 3).toBe(1620);
    for (const crystal of createCrystalLayout(42, 64, geometry)) {
      const radial = crystal.position.clone().normalize();
      ray.set(radial.clone().multiplyScalar(4), radial.clone().negate());
      const hit = ray.intersectObject(surface)[0];
      expect(hit.point.length() - crystal.position.length()).toBeCloseTo(.035, 6);
      const growthDirection = new THREE.Vector3(0, 1, 0).applyQuaternion(crystal.rotation);
      expect(growthDirection.dot(radial)).toBeGreaterThan(.9);
      expect(crystal.arc).toBeGreaterThanOrEqual(0);
      expect(crystal.arc).toBeLessThanOrEqual(Math.PI);
    }
    geometry.dispose(); surface.material.dispose();
  });
  it("builds seeded curved curtain anchors with full-height UVs", () => {
    const a = createAuroraGeometry(1, 0), b = createAuroraGeometry(2, 0);
    expect([...a.attributes.position.array].every(Number.isFinite)).toBe(true);
    expect(a.attributes.position.count).toBe(151 * 19);
    expect(a.attributes.position.array).not.toEqual(b.attributes.position.array);
    expect(Math.min(...a.attributes.uv.array)).toBe(0);
    expect(Math.max(...a.attributes.uv.array)).toBe(1);
    a.dispose(); b.dispose();
  });
});

describe("procedural scene lifecycle", () => {
  function setup() {
    const renderer = { target: { name: "previous target" }, getRenderTarget() { return this.target; },
      setRenderTarget(target) { this.target = target; }, render: vi.fn() };
    return { renderer, worlds: new ProceduralScenes(renderer, new THREE.Texture(), 123) };
  }
  const audio = { bass: .8, mid: .6, high: .4, level: .7 };
  it("places a depth-tested aurora behind crystals with bounded background quality", () => {
    const { worlds } = setup(), scene = new THREE.Scene(), audioBands = new THREE.Vector4();
    const layer = addAuroraCurtains(scene, audioBands, worlds.spectrum, 42, true);
    const entry = { scene, ...layer, auroraBackdrop: true, camera: new THREE.PerspectiveCamera(), target: new THREE.WebGLRenderTarget() };
    worlds.entries.set(11, entry);
    expect(layer.curtains).toHaveLength(6);
    for (const mesh of layer.curtains) {
      expect(mesh.material.depthTest).toBe(true);
      expect(mesh.material.depthWrite).toBe(false);
      expect(mesh.material.uniforms.uAudio.value).toBe(audioBands);
      expect(mesh.material.uniforms.uSpectrum.value).toBe(worlds.spectrum);
      const positions = mesh.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        // Allow 2.1 units of shader sway, still behind the whole crystal world.
        expect(positions.getZ(i) + mesh.position.z + 2.1).toBeLessThan(-6);
      }
    }
    worlds.resize(1200, 800, "auto");
    expect(layer.curtains.filter((m) => m.visible)).toHaveLength(2);
    worlds.resize(1200, 800, "high");
    expect(layer.curtains.filter((m) => m.visible)).toHaveLength(4);
    worlds.resize(1200, 800, "ultra");
    expect(layer.curtains.filter((m) => m.visible)).toHaveLength(6);
    const geometryDisposals = [...new Set(layer.curtains.map((m) => m.geometry))].map((g) => vi.spyOn(g, "dispose"));
    worlds.dispose();
    geometryDisposals.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
  });
  it("reshapes crystal instances from the spectrum without moving their anchors", () => {
    const { worlds } = setup();
    const layout = createCrystalLayout(123, 1), geometry = createCrystalGeometry();
    const material = createNeonCrystalMaterial(new THREE.Vector4());
    const crystals = new THREE.InstancedMesh(geometry, material, layout.length);
    const entry = { crystals, material, layout, anchor: new THREE.Group(), camera: new THREE.PerspectiveCamera(),
      audio: new THREE.Vector4(), age: 4, time: 0 };
    const backgroundScene = new THREE.Scene();
    Object.assign(entry, addAuroraCurtains(backgroundScene, entry.audio, worlds.spectrum, 123, true));
    const quietMatrix = new THREE.Matrix4(), loudMatrix = new THREE.Matrix4();
    worlds.update(entry, {}, 0, 0, new Uint8Array(256));
    crystals.getMatrixAt(0, quietMatrix);
    worlds.update(entry, {}, 0, 0, new Uint8Array(256).fill(255));
    crystals.getMatrixAt(0, loudMatrix);
    const quietScale = new THREE.Vector3().setFromMatrixScale(quietMatrix);
    const loudScale = new THREE.Vector3().setFromMatrixScale(loudMatrix);
    expect(loudScale.y).toBeGreaterThan(quietScale.y * 1.8);
    expect(new THREE.Vector3().setFromMatrixPosition(loudMatrix)).toEqual(new THREE.Vector3().setFromMatrixPosition(quietMatrix));
    worlds.update(entry, audio, .016, 1, new Uint8Array(256).fill(255));
    expect(entry.materials[0].uniforms.uTime.value).toBe(entry.time);
    expect(entry.materials[0].uniforms.uAudio.value.x).toBeGreaterThan(0);
    expect(entry.materials[0].uniforms.uHem.value.getHex()).toBe(CRYSTAL_NEON_PALETTES[1][0]);
    new Set(entry.curtains.map((m) => m.geometry)).forEach((g) => g.dispose());
    entry.materials.forEach((m) => m.dispose());
    geometry.dispose(); material.dispose(); crystals.dispose(); worlds.dispose();
  });
  it("allocates lazily, respects quality caps, and restores the render target", () => {
    const { worlds, renderer } = setup(), previous = renderer.target;
    worlds.resize(3200, 1800, "auto");
    worlds.render(6, audio, .016, 0, [], false);
    expect(worlds.entries.size).toBe(0);
    worlds.render(12, audio, .016, 0, [], false);
    const entry = worlds.entries.get(12);
    expect(entry.target.width).toBe(1000);
    expect(entry.road.posts.count).toBe(64);
    expect(renderer.target).toBe(previous);
    worlds.resize(3200, 1800, "ultra");
    expect(entry.target.width).toBe(1800);
    expect(entry.road.posts.count).toBe(64);
    worlds.dispose();
    expect(worlds.entries.size).toBe(0);
  });
  it("grows crystal instances on beats while the globe and shard anchors stay fixed", () => {
    const { worlds } = setup();
    const layout = createCrystalLayout(42, 1), geometry = createCrystalGeometry(42), material = createNeonCrystalMaterial(new THREE.Vector4());
    const crystals = new THREE.InstancedMesh(geometry, material, layout.length);
    const entry = { crystals, material, layout, anchor: new THREE.Group(), camera: new THREE.PerspectiveCamera(),
      audio: new THREE.Vector4(0, 0, 0, 0), age: 4, time: 0, beatGrowth: new CrystalBeatGrowth() };
    const spectrum = new Uint8Array(256).fill(100), before = new THREE.Matrix4(), after = new THREE.Matrix4();
    worlds.update(entry, {}, 0, 0, spectrum);
    crystals.getMatrixAt(0, before);
    for (let i = 0; i < 8; i++) {
      worlds.update(entry, { transient: i === 0, beatCount: 1, bass: 1 }, 1 / 60, 0, spectrum);
      expect(entry.anchor.position.toArray()).toEqual([0, 0, 0]);
      expect(entry.anchor.scale.toArray()).toEqual([1, 1, 1]);
      expect(entry.camera.position.y).toBe(.5);
      expect(entry.anchor.rotation.y).toBeCloseTo((i + 1) / 60 * .04, 10);
    }
    crystals.getMatrixAt(0, after);
    const oldSize = new THREE.Vector3().setFromMatrixScale(before), newSize = new THREE.Vector3().setFromMatrixScale(after);
    expect(newSize.y).toBeGreaterThan(oldSize.y * 1.4);
    expect(newSize.x / oldSize.x).toBeLessThan(newSize.y / oldSize.y);
    expect(new THREE.Vector3().setFromMatrixPosition(after)).toEqual(new THREE.Vector3().setFromMatrixPosition(before));
    expect(newSize.y).toBeLessThanOrEqual(2.251);
    const rotation = entry.anchor.rotation.y;
    for (let i = 0; i < 60; i++) worlds.update(entry, {}, 1 / 60, 0, spectrum);
    expect(entry.anchor.rotation.y - rotation).toBeCloseTo(.04, 10);
    const pausedRotation = entry.anchor.rotation.toArray();
    worlds.update(entry, { bass: 1, level: 1, transient: true, beatCount: 2 }, 0, 0, spectrum);
    expect(entry.anchor.rotation.toArray()).toEqual(pausedRotation);
    crystals.dispose(); geometry.dispose(); material.dispose(); worlds.dispose();
  });
  it("smooths musical movement, freezes on pause, and keeps time bounded after stalls", () => {
    const { worlds, renderer } = setup();
    worlds.render(12, audio, .016, 0, [], false);
    const entry = worlds.entries.get(12), time = entry.road.time, travel = entry.road.travel;
    const cameraPosition = entry.camera.position.clone();
    expect(entry.road.audio.x).toBeGreaterThan(0);
    expect(entry.road.audio.x).toBeLessThan(audio.bass);
    worlds.render(12, audio, 1, 0, [], true);
    expect(entry.road.time).toBe(time);
    expect(entry.road.travel).toBe(travel);
    expect(entry.camera.position).toEqual(cameraPosition);
    expect(renderer.render).toHaveBeenCalledTimes(1);
    worlds.render(12, audio, 5, 0, [], false);
    expect(entry.road.time - time).toBeLessThan(.06);
    worlds.dispose();
  });
  it("restores the outer target even when a scene fails to render", () => {
    const { worlds, renderer } = setup(), previous = renderer.target;
    renderer.render.mockImplementation(() => { throw new Error("test failure"); });
    expect(() => worlds.render(12, audio, .016, 0, [], false)).toThrow("test failure");
    expect(renderer.target).toBe(previous);
    expect(isProceduralMode(11)).toBe(true);
    expect(isProceduralMode(12)).toBe(true);
    expect(isProceduralMode(13)).toBe(false);
    expect(isProceduralMode(14)).toBe(true);
    expect(isProceduralMode(15)).toBe(false);
    expect(isProceduralMode(10)).toBe(false);
    worlds.dispose();
  });
});
