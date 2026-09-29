import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { CrystalWaveFloor } from "./crystal-wave-floor.js";
import { horizonWavesGLSL } from "./horizon-waves.js";
import { ProceduralScenes } from "./procedural-scenes.js";

const colors = [0x10e7ff, 0xff22b8, 0x8040ff];
const audio = { waveform: Uint8Array.from({ length: 2048 }, (_, i) => 128 + Math.sin(i / 13) * 64), bass: .5, level: .6 };
const camera = () => {
  const camera = new THREE.PerspectiveCamera(48, 1.6, .1, 100);
  camera.position.set(0, .5, 9.6); camera.lookAt(0, 0, 0);
  return camera;
};

describe("Crystals' Horizon wave floor", () => {
  it("reuses Horizon audio capture and projection with foreground depth occlusion", () => {
    const floor = new CrystalWaveFloor(new THREE.Scene());
    floor.resize(1280, 800); floor.update(audio, .05, colors, camera());
    expect(floor.mesh.material.fragmentShader).toContain(horizonWavesGLSL);
    expect(floor.mesh.material.depthTest).toBe(true);
    expect(floor.mesh.material.depthWrite).toBe(false);
    expect(floor.mesh.renderOrder).toBeLessThan(0);
    expect(floor.waves.emissions).toBe(1);
    expect(floor.texture.image.data).toBe(floor.waves.data);
    expect(floor.uniforms.uHorizonLines.value).toBe(floor.waves.lines);
    expect(floor.uniforms.uBaseline.value).toBeLessThan(-.2);
    expect(floor.uniforms.uBaseline.value).toBeGreaterThan(-.6);
    expect(floor.uniforms.uA.value.getHex()).toBe(colors[0]);
    floor.dispose();
  });
  it("keeps captured wave history and position on resize and zero-delta updates", () => {
    const floor = new CrystalWaveFloor(new THREE.Scene()), cam = camera();
    floor.resize(1280, 800); floor.update(audio, .05, colors, cam);
    const data = floor.waves.data.slice(), positions = floor.waves.lines.map(line => line.toArray());
    const baseline = floor.uniforms.uBaseline.value;
    floor.resize(800, 1280); cam.aspect = 800 / 1280; cam.updateProjectionMatrix();
    floor.update(audio, 0, colors, cam);
    expect(floor.waves.data).toEqual(data);
    expect(floor.waves.lines.map(line => line.toArray())).toEqual(positions);
    expect(floor.uniforms.uBaseline.value).toBeCloseTo(baseline * 1.6);
    floor.dispose();
  });
  it("runs only for Crystals, freezes when hidden/paused, and disposes each resource once", () => {
    const renderer = { target: null, getRenderTarget() { return this.target; }, setRenderTarget(t) { this.target = t; }, render: vi.fn() };
    const spectrum = new THREE.Texture(), worlds = new ProceduralScenes(renderer, spectrum, 42);
    worlds.resize(1280, 800, 'high');
    worlds.render(11, audio, .05, 0, [], false);
    const floor = worlds.entries.get(11).waveFloor;
    const positions = floor.waves.lines.map(line => line.toArray()), emissions = floor.waves.emissions;
    worlds.render(11, audio, .05, 0, [], true);
    worlds.render(13, audio, .05, 0, [], false);
    expect(worlds.entries.get(13).waveFloor).toBeUndefined();
    expect(floor.waves.lines.map(line => line.toArray())).toEqual(positions);
    expect(floor.waves.emissions).toBe(emissions);
    worlds.render(11, audio, .05, 0, [], false);
    expect(floor.waves.lines[0].x).toBeGreaterThan(positions[0][0]);
    const spies = [floor.texture, floor.mesh.material, floor.mesh.geometry].map(resource => vi.spyOn(resource, 'dispose'));
    worlds.dispose(); spectrum.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
    expect(floor.mesh.parent).toBeNull();
  });
});
