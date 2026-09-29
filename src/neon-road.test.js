import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { NeonRoad, roadCenter, roadElevation } from "./neon-road.js";
import { ProceduralScenes, seededRandom, isProceduralMode } from "./procedural-scenes.js";

function create() {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const road = new NeonRoad(scene, camera, new THREE.Texture(), seededRandom(42));
  return { road, camera, scene, dispose() {
    const geometries = new Set(), materials = new Set();
    scene.traverse((object) => { if (object.geometry) geometries.add(object.geometry); if (object.material) materials.add(object.material); if (object.isInstancedMesh) object.dispose(); });
    geometries.forEach((geometry) => geometry.dispose()); materials.forEach((material) => material.dispose());
    road.uniforms.uSpectrum.value.dispose();
  } };
}

describe("Neon Road", () => {
  it("generates continuous bends and hills with no seams", () => {
    for (let s = 0; s < 10000; s += 19.4) {
      expect(Math.abs(roadCenter(s, 1))).toBeLessThanOrEqual(21);
      expect(Math.abs(roadCenter(s + .01, 1) - roadCenter(s, 1))).toBeLessThan(.004);
      expect(Math.abs(roadElevation(s + .01, 1) - roadElevation(s, 1))).toBeLessThan(.001);
    }
    expect(roadCenter(100, 1)).not.toBe(roadCenter(100, 2));
  });
  it("keeps the camera above the road and looks forward through bends", () => {
    const test = create(), { road, camera } = test;
    for (let i = 0; i < 500; i++) {
      road.update({ level: .8, bass: .7 }, 1 / 30, 0);
      expect(camera.position.x).toBeCloseTo(roadCenter(road.travel, road.phase));
      expect(camera.position.y - roadElevation(road.travel, road.phase)).toBeCloseTo(2.2);
      expect(camera.getWorldDirection(new THREE.Vector3()).z).toBeLessThan(-.8);
    }
    expect(road.travel).toBeGreaterThan(200);
    expect(road.speed).toBeLessThanOrEqual(19);
    test.dispose();
  });
  it("moves steadily independent of frame rate and reuses terrain and markers", () => {
    const a = create(), b = create();
    const geometry = a.scene.children[0].geometry, positions = geometry.attributes.position.array.slice();
    for (let i = 0; i < 300; i++) a.road.update({}, 1 / 30, 0);
    for (let i = 0; i < 1200; i++) b.road.update({}, 1 / 120, 0);
    expect(a.road.travel).toBeCloseTo(b.road.travel, 8);
    expect(a.scene.children[0].geometry).toBe(geometry);
    expect(geometry.attributes.position.array).toEqual(positions);
    expect(a.road.posts.count).toBe(64);
    const matrix = new THREE.Matrix4(), point = new THREE.Vector3();
    for (let i = 0; i < 64; i++) {
      a.road.posts.getMatrixAt(i, matrix); point.setFromMatrixPosition(matrix);
      expect(point.z).toBeLessThanOrEqual(6);
      expect(point.z).toBeGreaterThanOrEqual(-314);
      expect(Math.abs(point.x - roadCenter(a.road.travel - point.z, a.road.phase))).toBeCloseTo(5.35, 4);
    }
    a.dispose(); b.dispose();
  });
  it("pauses and resumes the integrated scene without advancing the route while hidden", () => {
    const renderer = { getRenderTarget: () => null, setRenderTarget() {}, render() {} };
    const scenes = new ProceduralScenes(renderer, new THREE.Texture(), 42);
    scenes.resize(2400, 1600, "auto");
    scenes.render(12, { level: .8 }, .016, 0, [], false);
    const entry = scenes.entries.get(12), travel = entry.road.travel;
    const camera = entry.camera.position.clone(), rotation = entry.camera.quaternion.clone();
    const skyTime = entry.road.uniforms.uTime.value;
    const smokePositions = entry.road.atmosphere.sheets.map((sheet) => sheet.mesh.position.clone());
    expect(entry.target.width).toBe(1000);
    expect(isProceduralMode(12)).toBe(true);
    scenes.render(12, {}, 1, 0, [], true);
    scenes.render(6, {}, 1, 0, [], false);
    expect(entry.road.travel).toBe(travel); expect(entry.camera.position).toEqual(camera);
    scenes.resize(1600, 1000, "ultra");
    scenes.render(12, {}, 1, 0, [], true);
    expect(entry.camera.quaternion.toArray()).toEqual(rotation.toArray());
    expect(entry.road.travel).toBe(travel);
    expect(entry.road.uniforms.uTime.value).toBe(skyTime);
    expect(entry.road.atmosphere.sheets.map((sheet) => sheet.mesh.position)).toEqual(smokePositions);
    scenes.render(12, {}, 10, 2, [], false);
    expect(entry.road.travel - travel).toBeLessThan(1);
    expect(entry.road.uniforms.uPink.value.getHex()).toBe(0x19e9c7);
    scenes.dispose();
  });
  it("keeps a bounded pool of smoke aligned with the road and sharing the sky clock", () => {
    const test = create(), { road } = test;
    const sheets = road.atmosphere.sheets, geometry = sheets[0].mesh.geometry;
    expect(sheets).toHaveLength(6);
    for (let step = 0; step < 200; step++) {
      road.update({ level: .8 }, .05, 0);
      for (const sheet of sheets) {
        expect(sheet.mesh.geometry).toBe(geometry);
        expect(sheet.mesh.material.uniforms.uTime).toBe(road.uniforms.uTime);
        expect(sheet.mesh.material.depthTest).toBe(true);
        expect(sheet.mesh.material.depthWrite).toBe(false);
        const opacity = sheet.mesh.material.uniforms.uOpacity.value;
        expect(opacity).toBeGreaterThanOrEqual(0);
        expect(opacity).toBeLessThanOrEqual(.4);
        const world = road.travel - sheet.mesh.position.z;
        expect(sheet.mesh.position.x).toBeCloseTo(roadCenter(world, road.phase));
        expect(sheet.mesh.position.y).toBeCloseTo(roadElevation(world, road.phase) + sheet.height);
      }
    }
    expect(road.uniforms.uTime.value).toBeCloseTo(10);
    test.dispose();
  });
  it("fades smoke before the recycling seam and before reaching the camera", () => {
    const test = create(), { road } = test, sheet = road.atmosphere.sheets[0];
    for (const travel of [235, 240, 255.9999, 256.0001]) {
      road.atmosphere.update(travel, road.phase, 1);
      expect(sheet.mesh.material.uniforms.uOpacity.value).toBeLessThan(.001);
      expect(sheet.mesh.visible).toBe(false);
    }
    road.atmosphere.update(200, road.phase, 1);
    expect(sheet.mesh.material.uniforms.uOpacity.value).toBeGreaterThan(.1);
    expect(sheet.mesh.visible).toBe(true);
    test.dispose();
  });
});
