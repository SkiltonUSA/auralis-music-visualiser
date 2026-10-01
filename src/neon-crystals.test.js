import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { addCrystalEdgeAttributes, createNeonCrystalMaterial, updateNeonCrystalMaterial, CRYSTAL_NEON_PALETTES } from "./neon-crystals.js";
import { createCrystalGeometry, ProceduralScenes } from "./procedural-scenes.js";

describe("neon crystal facets", () => {
  it("gives each triangle one constant, accurate ripple centroid", () => {
    for (const geometry of [createCrystalGeometry(42), new THREE.IcosahedronGeometry(1.67, 1)]) {
      addCrystalEdgeAttributes(geometry);
      const positions = geometry.attributes.position, centers = geometry.attributes.aFaceCenter;
      expect(centers.count).toBe(positions.count);
      const unique = new Set();
      for (let first = 0; first < centers.count; first += 3) {
        for (const get of ['getX', 'getY', 'getZ']) {
          const mean = (positions[get](first) + positions[get](first + 1) + positions[get](first + 2)) / 3;
          for (let corner = 0; corner < 3; corner++) expect(centers[get](first + corner)).toBeCloseTo(mean, 6);
        }
        unique.add([centers.getX(first), centers.getY(first), centers.getZ(first)].join(','));
      }
      expect(unique.size).toBe(positions.count / 3);
      geometry.dispose();
    }
  });
  it("adds barycentric edges without changing geometry or highlighting internal quad diagonals", () => {
    const geometry = createCrystalGeometry(42), original = geometry.attributes.position.array.slice();
    expect(addCrystalEdgeAttributes(geometry, true)).toBe(geometry);
    expect(geometry.attributes.position.array).toEqual(original);
    const bary = geometry.attributes.aBarycentric, masks = geometry.attributes.aEdgeMask;
    expect(bary.count).toBe(72);
    for (let i = 0; i < bary.count; i++) {
      expect(bary.getX(i) + bary.getY(i) + bary.getZ(i)).toBe(1);
      const triangle = Math.floor(i / 3) % 4;
      expect([masks.getX(i), masks.getY(i), masks.getZ(i)]).toEqual(triangle === 0 ? [1, 0, 1] : triangle === 1 ? [1, 1, 0] : [1, 1, 1]);
    }
    geometry.dispose();
  });
  it("keeps all core facet edges and uses an opaque depth-tested material", () => {
    const geometry = addCrystalEdgeAttributes(new THREE.IcosahedronGeometry(1.67, 1));
    expect([...geometry.attributes.aEdgeMask.array].every(value => value === 1)).toBe(true);
    const audio = new THREE.Vector4(), material = createNeonCrystalMaterial(audio, true);
    expect(material.transparent).toBe(false);
    expect(material.depthWrite).toBe(true);
    expect(material.uniforms.uCore.value).toBe(1);
    expect(material.uniforms.uAudio.value).toBe(audio);
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
    material.onBeforeCompile(shader);
    expect(material.isMeshPhysicalMaterial).toBe(true);
    expect(shader.fragmentShader).toContain('fwidth(vBarycentric)');
    expect(shader.fragmentShader).toContain('totalEmissiveRadiance +=');
    expect(shader.fragmentShader).toContain('#include <lights_physical_fragment>');
    expect(shader.vertexShader).toContain('facet = instanceMatrix * facet');
    expect(shader.uniforms.uFacetRipples).toBe(material.uniforms.uFacetRipples);
    geometry.dispose(); material.dispose();
  });
  it("updates palette and beat highlights without replacing the material", () => {
    const material = createNeonCrystalMaterial(new THREE.Vector4());
    for (const colors of CRYSTAL_NEON_PALETTES) {
      updateNeonCrystalMaterial(material, colors, 5, .7);
      expect(material.uniforms.uEdgeA.value.getHex()).toBe(colors[0]);
      expect(material.uniforms.uEdgeB.value.getHex()).toBe(colors[1]);
      expect(material.uniforms.uTime.value).toBe(5);
      expect(material.uniforms.uBeat.value).toBe(.7);
    }
    material.dispose();
  });
  it("matches globe triangle edges to the physical surface while preserving shard outlines and face ripples", () => {
    for (const core of [true, false]) {
      const material = createNeonCrystalMaterial(new THREE.Vector4(), core);
      const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
      material.onBeforeCompile(shader);
      expect(shader.uniforms.uCore.value).toBe(core ? 1 : 0);
      expect(shader.fragmentShader).toContain('vec3 edge = ink * (line + halo) * energy * .72 * (1. - uCore);');
      expect(shader.fragmentShader).toContain('flash * mix(.55, .32, uCore)');
      expect(shader.fragmentShader).toContain('#include <lights_physical_fragment>');
      material.dispose();
    }
  });
  it("propagates actual shard growth around the globe without displacing any batch's anchors", () => {
    const renderer = { getRenderTarget: () => null, setRenderTarget() {}, render() {} };
    const spectrum = new THREE.Texture(), worlds = new ProceduralScenes(renderer, spectrum, 42);
    const entry = worlds.create(11);
    entry.age = 4;
    const bins = new Uint8Array(256).fill(100);
    for (let i = 0; i < 4; i++) worlds.update(entry, { transient: i === 0, beatCount: 1, bass: 1 }, .05, 0, bins);
    const active = entry.crystalBatches.flatMap(b => b.indices.slice(0, b.mesh.count).map(i => entry.layout[i]));
    const near = active.filter(c => c.arc < .5), far = active.filter(c => c.arc > 1.4 && c.arc < 1.8);
    expect(near.length).toBeGreaterThan(0); expect(far.length).toBeGreaterThan(0);
    expect(Math.max(...near.map(c => c.growth))).toBeGreaterThan(.3);
    expect(far.every(c => c.growth === 0)).toBe(true);
    for (let i = 0; i < 7; i++) worlds.update(entry, {}, .05, 0, bins);
    expect(Math.max(...far.map(c => c.growth))).toBeGreaterThan(.3);
    const matrix = new THREE.Matrix4(), position = new THREE.Vector3();
    for (const batch of entry.crystalBatches) {
      for (let i = 0; i < batch.mesh.count; i++) {
        batch.mesh.getMatrixAt(i, matrix);
        position.setFromMatrixPosition(matrix);
        expect(position.distanceTo(entry.layout[batch.indices[i]].position)).toBeLessThan(1e-6);
      }
    }
    expect(entry.anchor.position.toArray()).toEqual([0, 0, 0]);
    expect(entry.anchor.scale.toArray()).toEqual([1, 1, 1]);
    worlds.dispose(); spectrum.dispose();
  });
  it("reuses a physical studio environment and five instanced variants across frames, quality and pause", () => {
    const renderer = { target: null, getRenderTarget() { return this.target; }, setRenderTarget(t) { this.target = t; }, render: vi.fn() };
    const spectrum = new THREE.Texture(), worlds = new ProceduralScenes(renderer, spectrum, 42);
    worlds.resize(1280, 800, 'high');
    worlds.render(11, {}, .05, 0, [], false);
    const entry = worlds.entries.get(11), geometry = entry.crystals.geometry, matrix = entry.crystals.instanceMatrix;
    expect(entry.material.isMeshPhysicalMaterial).toBe(true);
    expect(entry.material.transmission).toBe(0);
    expect(entry.scene.environment).toBe(entry.environment);
    expect(entry.environment.mapping).toBe(THREE.EquirectangularReflectionMapping);
    const environment = entry.environment;
    expect(entry.crystalBatches).toHaveLength(5);
    expect(entry.crystalBatches.reduce((sum, b) => sum + b.mesh.count, 0)).toBe(240);
    expect(new Set(entry.crystalBatches.map(b => b.mesh.geometry.attributes.position.array.join(','))).size).toBe(5);
    expect(entry.material.uniforms.uAudio.value).toBe(entry.audio);
    expect(entry.coreMaterial.uniforms.uCore.value).toBe(1);
    expect(entry.material.uniforms.uFacetRipples.value).toBe(entry.facetRipples.uniforms);
    expect(entry.coreMaterial.uniforms.uFacetRipples.value).toBe(entry.facetRipples.uniforms);
    for (let i = 0; i < 80; i++) worlds.render(11, { level: .7, bass: .8, transient: i === 0, beatCount: 1 }, .05, 0, [], false);
    expect(entry.crystals.geometry).toBe(geometry);
    expect(entry.crystals.instanceMatrix).toBe(matrix);
    expect(entry.environment).toBe(environment);
    for (const batch of entry.crystalBatches) expect([...batch.mesh.instanceMatrix.array].every(Number.isFinite)).toBe(true);
    expect([...matrix.array].every(Number.isFinite)).toBe(true);
    expect(entry.anchor.position.y).toBe(0);
    const time = entry.material.uniforms.uTime.value;
    const ripples = entry.facetRipples.uniforms.slice();
    worlds.render(11, { transient: true, beatCount: 2 }, 10, 0, [], true);
    expect(entry.material.uniforms.uTime.value).toBe(time);
    expect(entry.facetRipples.uniforms).toEqual(ripples);
    worlds.render(13, {}, .05, 0, [], false);
    expect(entry.facetRipples.uniforms).toEqual(ripples);
    worlds.resize(1280, 800, 'ultra');
    expect(entry.crystalBatches.reduce((sum, b) => sum + b.mesh.count, 0)).toBe(320);
    worlds.render(11, {}, .05, 0, [], false);
    worlds.resize(1280, 800, 'auto');
    expect(entry.crystalBatches.reduce((sum, b) => sum + b.mesh.count, 0)).toBe(160);
    expect(entry.material.uniforms.uFacetRipples.value).toBe(entry.facetRipples.uniforms);
    expect(entry.facetRipples.emissions).toBe(1);
    const dispose = vi.spyOn(entry.material, 'dispose');
    const environmentDispose = vi.spyOn(environment, 'dispose');
    const geometryDisposals = entry.crystalBatches.map(b => vi.spyOn(b.mesh.geometry, 'dispose'));
    worlds.dispose(); spectrum.dispose();
    expect(dispose).toHaveBeenCalledOnce();
    expect(environmentDispose).toHaveBeenCalledOnce();
    geometryDisposals.forEach(spy => expect(spy).toHaveBeenCalledOnce());
  });
  it("preserves crystal sizes on paused resize and quality changes despite live FFT updates", () => {
    const renderer = { getRenderTarget: () => null, setRenderTarget() {}, render: vi.fn() };
    const texture = new THREE.Texture(), worlds = new ProceduralScenes(renderer, texture, 42);
    worlds.resize(1280, 800, 'ultra');
    const entry = worlds.create(11), bins = new Uint8Array(256).fill(60);
    entry.age = 4;
    worlds.render(11, { transient:true, beatCount:1, bass:1 }, .05, 0, bins, false);
    const matrices = entry.crystalBatches.map(b => b.mesh.instanceMatrix.array.slice());
    const growth = entry.layout.map(c => c.growth), ripples = entry.facetRipples.uniforms.slice();
    const rotation = entry.anchor.rotation.toArray(), age = entry.age;
    const snapshot = entry.crystalSpectrum;
    expect(snapshot).not.toBe(bins);
    const frozenAudio = snapshot.slice();
    for (const [quality, width, height] of [['ultra',800,1000], ['auto',800,1000], ['high',1280,720], ['ultra',1280,800]]) {
      bins.fill(255);
      worlds.resize(width, height, quality);
      const renders = renderer.render.mock.calls.length;
      worlds.render(11, { transient:true, beatCount:2, bass:1 }, .05, 0, bins, true);
      expect(renderer.render.mock.calls.length).toBe(renders + 1);
      entry.crystalBatches.forEach((batch, i) => expect(batch.mesh.instanceMatrix.array).toEqual(matrices[i]));
      expect(entry.crystalSpectrum).toBe(snapshot);
      expect(snapshot).toEqual(frozenAudio);
      expect(entry.layout.map(c => c.growth)).toEqual(growth);
      expect(entry.facetRipples.uniforms).toEqual(ripples);
      expect(entry.anchor.rotation.toArray()).toEqual(rotation);
      expect(entry.age).toBe(age);
      expect(entry.camera.aspect).toBe(width / height);
    }
    worlds.render(11, {}, .05, 0, bins, false);
    expect(entry.crystalSpectrum).toBe(snapshot);
    expect(snapshot).toEqual(bins);
    expect(entry.crystals.instanceMatrix.array).not.toEqual(matrices[0]);
    worlds.dispose(); texture.dispose();
  });
});
