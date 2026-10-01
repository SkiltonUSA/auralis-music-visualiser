import { describe, it, expect, vi } from "vitest";
import * as THREE from "three";
import { FractalLotusMotion, FractalLotusScene, FRACTAL_LOTUS_MODE, FRACTAL_LOTUS_QUALITY } from "./fractal-lotus.js";
import { ProceduralScenes, isProceduralMode } from "./procedural-scenes.js";
import { hasSmoke } from "./smoke-simulation.js";

const beat = { bass: .9, mid: .6, high: .4, level: .7, transient: true, beatCount: 1 };
describe("Fractal Lotus", () => {
  it("integrates smooth orbit, morph and pulse consistently across frame rates", () => {
    const states = [30, 60, 120].map(fps => {
      const motion = new FractalLotusMotion();
      for (let i = 0; i < fps; i++) motion.update(beat, 1 / fps);
      return motion;
    });
    for (const motion of states) {
      for (const key of ["time", "orbit", "morph", "pulse"]) expect(motion[key]).toBeCloseTo(states[0][key], 10);
      expect(motion.emissions).toBe(1);
      expect(motion.orbit).toBeGreaterThan(.2); expect(motion.orbit).toBeLessThan(.24);
      expect(motion.morph).toBeGreaterThan(1); expect(motion.morph).toBeLessThan(1.12);
    }
  });
  it("deduplicates onsets, sanitizes levels and freezes on invalid or paused time", () => {
    const motion = new FractalLotusMotion(); motion.update(beat, .05);
    const frozen = JSON.stringify(motion);
    for (const dt of [0, -1, NaN, Infinity]) motion.update({ ...beat, beatCount: 2 }, dt);
    expect(JSON.stringify(motion)).toBe(frozen);
    motion.update(beat, .05); expect(motion.emissions).toBe(1);
    motion.update({ ...beat, beatCount: 2 }, .05); expect(motion.emissions).toBe(2);
    const time = motion.time;
    motion.update({ bass: Infinity, mid: NaN, high: 10, level: -1 }, 100);
    expect(motion.time - time).toBeCloseTo(.05);
    expect(motion.audio.toArray().every(v => Number.isFinite(v) && v >= 0 && v <= 1)).toBe(true);
    for (let i = 0; i < 180; i++) motion.update({}, 1 / 60);
    expect(motion.pulse).toBeLessThan(.001); expect(motion.audio.length()).toBeLessThan(.001);
  });
  it("preserves the fold count with finite distance steps and linear HDR output", () => {
    const effect = new FractalLotusScene(new THREE.Scene()), shader = effect.material.fragmentShader;
    expect(effect.mesh.geometry.attributes.position.count).toBe(3);
    expect(shader).toContain("i<16"); expect(shader).toContain("i<75"); expect(shader).toContain("i<100");
    expect(shader).toContain("clamp(dot(q,q), .0001, 79.46)");
    expect(shader).toContain("t+=max(d*.6,.0002)");
    expect(shader).toContain("clamp(1.-.3*length(uv),0.,1.)");
    expect(shader).toContain("1.-smoothstep(size*.4,size,distanceToRay)");
    expect(shader).not.toContain("2.51"); expect(shader).not.toContain("1.0 / 2.2");
    for (const palette of [0, 1, 2, 3]) { effect.update({}, 0, palette); expect(effect.uniforms.uPalette.value).toBe(palette); }
    effect.update({}, 0, Infinity); expect(effect.uniforms.uPalette.value).toBe(0);
    expect(shader).not.toContain("lotusScopes");
    expect(effect.uniforms).not.toHaveProperty("uScopeWaves");
    effect.mesh.geometry.dispose(); effect.material.dispose();
  });
  it("allocates lazily, respects quality budgets and freezes on resize or while hidden", () => {
    const renderer = { target: {}, getRenderTarget() { return this.target; }, setRenderTarget(t) { this.target = t; }, render: vi.fn() };
    const caller = renderer.target, worlds = new ProceduralScenes(renderer, null, 42);
    expect(worlds.entries.size).toBe(0); expect(isProceduralMode(FRACTAL_LOTUS_MODE)).toBe(true); expect(hasSmoke(FRACTAL_LOTUS_MODE)).toBe(false);
    worlds.resize(3840, 2160, "auto"); worlds.render(19, beat, .05, 0, [], false);
    const entry = worlds.entries.get(19), effect = entry.fractalLotus, geometry = effect.mesh.geometry, material = effect.material;
    expect(renderer.target).toBe(caller);
    const frozen = JSON.stringify(effect.motion);
    for (const [quality, settings] of Object.entries(FRACTAL_LOTUS_QUALITY)) {
      worlds.resize(3840, 2160, quality); worlds.render(19, { ...beat, beatCount: 2 }, .05, 2, [], true);
      expect(entry.target.width).toBe(settings.edge);
      expect(effect.uniforms.uParticles.value).toBe(settings.particles);
      expect(effect.uniforms.uResolution.value.toArray()).toEqual([entry.target.width, entry.target.height]);
      expect(effect.mesh.geometry).toBe(geometry); expect(effect.material).toBe(material);
      expect(JSON.stringify(effect.motion)).toBe(frozen);
    }
    worlds.render(17, beat, .05, 0, [], false); expect(JSON.stringify(effect.motion)).toBe(frozen);
    worlds.render(19, {}, .05, 0, [], false); expect(JSON.stringify(effect.motion)).not.toBe(frozen);
    renderer.render.mockImplementation(() => { throw Error("draw failure"); });
    expect(() => worlds.render(19, {}, .05, 0, [], false)).toThrow("draw failure"); expect(renderer.target).toBe(caller);
    const disposals = [entry.target, geometry, material].map(o => vi.spyOn(o, "dispose"));
    worlds.dispose(); disposals.forEach(spy => expect(spy).toHaveBeenCalledOnce());
  });
});
