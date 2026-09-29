import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { addCrystalEdgeAttributes, createNeonCrystalMaterial, updateNeonCrystalMaterial, CRYSTAL_NEON_PALETTES } from "./neon-crystals.js";
import { createCrystalGeometry, ProceduralScenes } from "./procedural-scenes.js";

describe("neon crystal facets", () => {
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
    expect(material.fragmentShader).toContain('fwidth(vBarycentric)');
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
  it("creates the real Crystals scene without glass transmission or environment-map passes", () => {
    const renderer = { target: null, getRenderTarget() { return this.target; }, setRenderTarget(t) { this.target = t; }, render: vi.fn() };
    const spectrum = new THREE.Texture(), worlds = new ProceduralScenes(renderer, spectrum, 42);
    worlds.resize(1280, 800, 'high');
    worlds.render(11, {}, .05, 0, [], false);
    const entry = worlds.entries.get(11), geometry = entry.crystals.geometry, matrix = entry.crystals.instanceMatrix;
    expect(entry.material.isShaderMaterial).toBe(true);
    expect(entry.environment).toBeUndefined();
    expect(entry.scene.environment).toBeNull();
    expect(entry.crystals.count).toBe(240);
    expect(entry.material.uniforms.uAudio.value).toBe(entry.audio);
    expect(entry.coreMaterial.uniforms.uCore.value).toBe(1);
    for (let i = 0; i < 80; i++) worlds.render(11, { level: .7, bass: .8, transient: i === 0, beatCount: 1 }, .05, 0, [], false);
    expect(entry.crystals.geometry).toBe(geometry);
    expect(entry.crystals.instanceMatrix).toBe(matrix);
    expect([...matrix.array].every(Number.isFinite)).toBe(true);
    expect(entry.anchor.position.y).toBe(0);
    const time = entry.material.uniforms.uTime.value;
    worlds.render(11, { transient: true, beatCount: 2 }, 10, 0, [], true);
    expect(entry.material.uniforms.uTime.value).toBe(time);
    const dispose = vi.spyOn(entry.material, 'dispose');
    worlds.dispose(); spectrum.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
