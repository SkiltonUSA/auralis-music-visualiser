import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { createLightPath, LightTunnelMotion, LIGHT_TUNNEL_MODE, LIGHT_TUNNEL_QUALITY, LIGHT_TUNNEL_PALETTES } from "./light-tunnel.js";
import { ProceduralScenes, isProceduralMode } from "./procedural-scenes.js";
import { hasSmoke } from "./smoke-simulation.js";

const audio = { bass: .9, mid: .6, high: .4, level: .7, transient: true, beatCount: 1 };
describe("Light Tunnel", () => {
  it("uses a closed, arc-length flight route with matching seam tangents", () => {
    const path = createLightPath();
    expect(path.getPointAt(0).distanceTo(path.getPointAt(1))).toBeLessThan(.00001);
    expect(path.getTangentAt(0).dot(path.getTangentAt(1))).toBeGreaterThan(.999);
    expect(path.getLength()).toBeGreaterThan(400);
  });
  it("integrates flight consistently, deduplicates beats and caps its pulse pool", () => {
    const states = [30, 60, 120].map(fps => {
      const state = new LightTunnelMotion(500);
      for (let i = 0; i < fps; i++) state.update(audio, 1 / fps);
      return state;
    });
    const expectedProgress = states[0].progress;
    for (const state of states) {
      expect(state.progress).toBeCloseTo(expectedProgress, 10);
      expect(state.time).toBeCloseTo(1, 10);
      expect(state.emissions).toBe(1);
      expect(state.pulses[0].y).toBeCloseTo(1, 10);
      const frozen = JSON.stringify(state);
      for (const dt of [0, -1, NaN, Infinity]) state.update(audio, dt);
      expect(JSON.stringify(state)).toBe(frozen);
      for (let i = 2; i < 100; i++) state.update({ ...audio, beatCount: i }, .05);
      expect(state.pulses).toHaveLength(8);
      expect(state.progress).toBeGreaterThanOrEqual(0); expect(state.progress).toBeLessThan(1);
      state.update({ bass: Infinity, mid: NaN, high: -1, level: 5 }, 100);
      expect(state.audio.toArray().every(v => Number.isFinite(v) && v >= 0 && v <= 1)).toBe(true);
    }
  });
  it("allocates lazily, reuses quality geometry, freezes camera and releases resources", () => {
    const renderer = { target: {}, getRenderTarget() { return this.target; }, setRenderTarget(t) { this.target = t; }, render: vi.fn() };
    const outer = renderer.target, worlds = new ProceduralScenes(renderer, null, 42);
    expect(isProceduralMode(LIGHT_TUNNEL_MODE)).toBe(true); expect(hasSmoke(LIGHT_TUNNEL_MODE)).toBe(false);
    expect(worlds.entries.size).toBe(0);
    worlds.resize(3840, 2160, "auto"); worlds.render(18, audio, .05, 0, [], false);
    const entry = worlds.entries.get(18), effect = entry.lightTunnel, geometry = effect.mesh.geometry;
    expect(renderer.target).toBe(outer); expect(entry.scene.children).toHaveLength(4);
    expect(effect.background.material.defines.DISTANT_BACKGROUND).toBe(1);
    expect(effect.background.mesh.renderOrder).toBeLessThan(effect.mesh.renderOrder);
    expect(effect.background.material.depthWrite).toBe(false);
    expect(effect.background.material.depthTest).toBe(false);
    expect(effect.background.material.fragmentShader).toContain('resolution.x / resolution.y * .27');
    expect(effect.background.uniforms).not.toHaveProperty('uCameraWorld');
    expect(geometry.attributes.position.count).toBe(150 * 621 * 2);
    expect(geometry.index.array).toBeInstanceOf(Uint32Array);
    // Each strip's first/last vertices meet, with finite indexed geometry.
    for (let lane = 0; lane < 150; lane++) {
      const a = new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, lane * 1242);
      const b = new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, lane * 1242 + 1240);
      expect(a.distanceTo(b)).toBeLessThan(.0001);
    }
    const motion = JSON.stringify(effect.motion), backgroundMotion = JSON.stringify(effect.background.motion), position = entry.camera.position.clone(), rotation = entry.camera.quaternion.clone();
    for (const [quality, settings] of Object.entries(LIGHT_TUNNEL_QUALITY)) {
      worlds.resize(3840, 2160, quality); worlds.render(18, { ...audio, beatCount: 9 }, .05, 2, [], true);
      expect(effect.mesh.geometry).toBe(geometry);
      expect(geometry.drawRange.count).toBe(settings.ribbons * 620 * 6);
      expect(effect.stars.geometry.drawRange.count).toBe(settings.stars);
      expect(effect.sparks.geometry.drawRange.count).toBe(settings.sparks);
      expect(JSON.stringify(effect.motion)).toBe(motion);
      expect(JSON.stringify(effect.background.motion)).toBe(backgroundMotion);
      expect(effect.background.uniforms.uSteps.value).toBe({auto:16,high:24,ultra:32}[quality]);
      expect(effect.background.uniforms.uResolution.value.toArray()).toEqual([entry.target.width,entry.target.height]);
      expect(entry.camera.position.equals(position)).toBe(true); expect(entry.camera.quaternion.equals(rotation)).toBe(true);
    }
    LIGHT_TUNNEL_PALETTES.forEach((colors, i) => {
      effect.update({}, 0, i); expect(effect.uniforms.uColors.value.map(c => c.getHex())).toEqual(colors);
    });
    worlds.render(17, audio, .05, 0, [], false); expect(JSON.stringify(effect.motion)).toBe(motion);
    expect(JSON.stringify(effect.background.motion)).toBe(backgroundMotion);
    expect(worlds.entries.get(17).darkMatter).not.toBe(effect.background);
    expect(worlds.entries.get(17).darkMatter.material.defines).not.toHaveProperty('DISTANT_BACKGROUND');
    worlds.render(18, {}, .05, 0, [], false); expect(entry.camera.position.equals(position)).toBe(false);
    expect(JSON.stringify(effect.background.motion)).toBe(backgroundMotion);
    expect(effect.background.motion.time).toBe(0);
    expect(effect.background.motion.emissions).toBe(0);
    expect(effect.stars.position.equals(entry.camera.position)).toBe(true);
    expect(effect.stars.quaternion.equals(entry.camera.quaternion)).toBe(true);
    expect(effect.stars.material.uniforms.uTime.value).toBe(0);
    expect(effect.stars.material.uniforms.uAudio.value.length()).toBe(0);
    expect(effect.sparks.material.uniforms.uTime).toBe(effect.uniforms.uTime);
    const disposals = [entry.target, ...entry.scene.children.flatMap(o => [o.geometry, o.material])].map(o => vi.spyOn(o, "dispose"));
    worlds.dispose(); disposals.forEach(spy => expect(spy).toHaveBeenCalledOnce());
  });
  it("shares the additional scene sampler per mixer draw rather than adding texture units", () => {
    const engine = readFileSync(new URL("./visual-engine.js", import.meta.url), "utf8");
    expect(engine).toContain("texture2D(uAdditionalScene, vUv)");
    expect(engine).toContain("this.procedural.texture(mode >= DARK_MATTER_MODE ? mode : DARK_MATTER_MODE)");
    expect(engine).not.toContain("uniform sampler2D uLightTunnel");
  });
});
