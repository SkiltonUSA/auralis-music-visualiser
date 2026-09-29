import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { FlyoverSmoke } from "./flyover-smoke.js";
import { ProceduralScenes, seededRandom } from "./procedural-scenes.js";

function setup() {
  const scene = new THREE.Scene(), uniforms = { uTime: { value: 0 }, uLow: { value: new THREE.Color(0xff279e) }, uRock: { value: new THREE.Color(0x19eaff) } };
  const smoke = new FlyoverSmoke(scene, uniforms, seededRandom(42), z => z * .05);
  return { smoke, uniforms, dispose() {
    smoke.sheets[0].mesh.geometry.dispose(); smoke.sheets.forEach(s => s.mesh.material.dispose());
  } };
}

describe("Flyover smoke", () => {
  it("uses a fixed pool with shared geometry, palette, clock and terrain occlusion", () => {
    const test = setup(), { smoke, uniforms } = test;
    expect(smoke.sheets).toHaveLength(6);
    const geometry = smoke.sheets[0].mesh.geometry;
    for (let step = 0; step < 500; step++) {
      uniforms.uTime.value = step * .05; smoke.update(step * 7, 1);
      for (const { mesh } of smoke.sheets) {
        expect(mesh.geometry).toBe(geometry);
        expect(mesh.material.uniforms.uTime).toBe(uniforms.uTime);
        expect(mesh.material.uniforms.uLow).toBe(uniforms.uLow);
        expect(mesh.material.uniforms.uRock).toBe(uniforms.uRock);
        expect(mesh.material.depthTest).toBe(true);
        expect(mesh.material.depthWrite).toBe(false);
        expect(mesh.material.uniforms.uOpacity.value).toBeGreaterThanOrEqual(0);
        expect(mesh.material.uniforms.uOpacity.value).toBeLessThanOrEqual(.46);
        expect(mesh.position.toArray().every(Number.isFinite)).toBe(true);
      }
    }
    test.dispose();
  });
  it("keeps smoke in world space while wind blows laterally", () => {
    const test = setup(), { smoke, uniforms } = test;
    smoke.update(1, 0);
    const positions = smoke.sheets.map(s => s.mesh.position.clone());
    smoke.update(2, 0);
    smoke.sheets.forEach((s, i) => expect(s.mesh.position).toEqual(positions[i]));
    uniforms.uTime.value = 1; smoke.update(2, 0);
    smoke.sheets.forEach((s, i) => {
      expect(s.mesh.position.z).toBe(positions[i].z);
      expect(s.mesh.position.x).not.toBe(positions[i].x);
    });
    test.dispose();
  });
  it("fades fully before passing the camera or recycling", () => {
    const test = setup(), { smoke } = test, { mesh } = smoke.sheets[0];
    for (const travel of [0, 410, 449.9999, 450.0001]) {
      smoke.update(travel, 1);
      expect(mesh.material.uniforms.uOpacity.value).toBe(0);
      expect(mesh.visible).toBe(false);
    }
    smoke.update(340, 1);
    expect(mesh.material.uniforms.uOpacity.value).toBeGreaterThan(.1);
    expect(mesh.visible).toBe(true);
    test.dispose();
  });
  it("freezes while paused or hidden, including resize, and disposes shared resources once", () => {
    const renderer = { getRenderTarget: () => null, setRenderTarget() {}, render() {} };
    const texture = new THREE.Texture(), worlds = new ProceduralScenes(renderer, texture, 42);
    worlds.render(14, { level: .8 }, .05, 0, [], false);
    const fly = worlds.entries.get(14).flyover;
    const snapshot = () => fly.smoke.sheets.map(s => [s.mesh.position.toArray(), s.mesh.material.uniforms.uOpacity.value]);
    const before = snapshot(), time = fly.time;
    const geometry = vi.spyOn(fly.smoke.sheets[0].mesh.geometry, "dispose");
    const materials = fly.smoke.sheets.map(s => vi.spyOn(s.mesh.material, "dispose"));
    worlds.resize(1400, 900, "ultra");
    worlds.render(14, { level: 1 }, 2, 0, [], true);
    worlds.render(0, {}, 2, 0, [], false);
    expect(snapshot()).toEqual(before); expect(fly.time).toBe(time);
    worlds.dispose(); texture.dispose();
    expect(geometry).toHaveBeenCalledOnce(); materials.forEach(spy => expect(spy).toHaveBeenCalledOnce());
  });
});
