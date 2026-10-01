import { describe, it, expect, vi } from "vitest";
import * as THREE from "three";
import { VoxelTunnelMotion, VoxelTunnelScene, VOXEL_TUNNEL_MODE, VOXEL_TUNNEL_QUALITY, VOXEL_TUNNEL_PALETTES } from "./voxel-tunnel.js";
import { ProceduralScenes, isProceduralMode } from "./procedural-scenes.js";
import { hasSmoke } from "./smoke-simulation.js";

const beat = { bass: .9, mid: .6, high: .4, level: .7, transient: true, beatCount: 1 };
describe("Voxel Tunnel", () => {
  it("integrates musical speed consistently and wraps only the repeating travel axis", () => {
    const states = [30, 60, 120].map(fps => {
      const motion = new VoxelTunnelMotion();
      for (let i = 0; i < fps * 8; i++) motion.update(beat, 1 / fps);
      return motion;
    });
    for (const motion of states) {
      for (const key of ["travel", "time", "pulse"]) expect(motion[key]).toBeCloseTo(states[0][key], 10);
      expect(motion.travel).toBeGreaterThanOrEqual(0); expect(motion.travel).toBeLessThan(7);
      expect(motion.time).toBeGreaterThan(8); expect(motion.emissions).toBe(1);
    }
    const motion = new VoxelTunnelMotion(); motion.travel = 6.99; motion.update({}, .02);
    expect(motion.travel).toBeCloseTo(.02); expect(motion.time).toBeCloseTo(.02);
  });
  it("deduplicates onsets, eases after beats and handles invalid or paused input", () => {
    const motion = new VoxelTunnelMotion(); motion.update(beat, .05);
    const frozen = JSON.stringify(motion);
    for (const dt of [0, -1, NaN, Infinity]) motion.update({ ...beat, beatCount: 2 }, dt);
    expect(JSON.stringify(motion)).toBe(frozen);
    motion.update(beat, .05); expect(motion.emissions).toBe(1);
    motion.update({ ...beat, beatCount: 2 }, .05); expect(motion.emissions).toBe(2);
    const time = motion.time;
    motion.update({ bass: Infinity, mid: NaN, high: 4, level: -1 }, 100);
    expect(motion.time - time).toBeLessThan(.0561);
    expect(motion.audio.toArray().every(v => Number.isFinite(v) && v >= 0 && v <= 1)).toBe(true);
    for (let i = 0; i < 180; i++) motion.update({}, 1 / 60);
    expect(motion.pulse).toBeLessThan(.001); expect(motion.audio.length()).toBeLessThan(.001);
  });
  it("preserves the folded voxel geometry with bounded marching and safe display decoding", () => {
    const effect = new VoxelTunnelScene(new THREE.Scene()), shader = effect.material.fragmentShader;
    expect(effect.mesh.geometry.attributes.position.count).toBe(3);
    expect(effect.uniforms.uAxis.value.length()).toBeCloseTo(1);
    expect(shader).toContain("stepIndex<110"); expect(shader).toContain("i<12");
    expect(shader).toContain("mod(q.z,7.)"); expect(shader).toContain("ceil(q*55.)/55.");
    expect(shader).toContain("traveled>45."); expect(shader).toContain("exp(-2.*x)");
    expect(shader).not.toContain("exp(2.0 * x)");
    for (const [index, colors] of VOXEL_TUNNEL_PALETTES.entries()) {
      effect.update({}, 0, index);
      expect(effect.uniforms.uPrimary.value.toArray()).toEqual(colors.primary);
      expect(effect.uniforms.uSecondary.value.toArray()).toEqual(colors.secondary);
      expect(effect.uniforms.uTint.value.toArray()).toEqual(colors.tint);
    }
    effect.update({}, 0, Infinity); expect(effect.uniforms.uPrimary.value.toArray()).toEqual(VOXEL_TUNNEL_PALETTES[0].primary);
    effect.mesh.geometry.dispose(); effect.material.dispose();
  });
  it("allocates lazily, reuses resources at all qualities and freezes when paused or hidden", () => {
    const renderer = { target: {}, getRenderTarget() { return this.target; }, setRenderTarget(t) { this.target = t; }, render: vi.fn() };
    const caller = renderer.target, worlds = new ProceduralScenes(renderer, null, 42);
    expect(worlds.entries.size).toBe(0); expect(isProceduralMode(VOXEL_TUNNEL_MODE)).toBe(true); expect(hasSmoke(VOXEL_TUNNEL_MODE)).toBe(false);
    worlds.resize(3840, 2160, "auto"); worlds.render(20, beat, .05, 0, [], false);
    const entry = worlds.entries.get(20), effect = entry.voxelTunnel, geometry = effect.mesh.geometry, material = effect.material;
    expect(renderer.target).toBe(caller);
    const frozen = JSON.stringify(effect.motion);
    for (const [quality, settings] of Object.entries(VOXEL_TUNNEL_QUALITY)) {
      worlds.resize(3840, 2160, quality); worlds.render(20, { ...beat, beatCount: 2 }, .05, 2, [], true);
      expect(entry.target.width).toBe(settings.edge);
      expect(effect.uniforms.uResolution.value.toArray()).toEqual([entry.target.width, entry.target.height]);
      expect(effect.mesh.geometry).toBe(geometry); expect(effect.material).toBe(material);
      expect(JSON.stringify(effect.motion)).toBe(frozen);
    }
    worlds.render(17, beat, .05, 0, [], false); expect(JSON.stringify(effect.motion)).toBe(frozen);
    worlds.render(20, {}, .05, 0, [], false); expect(JSON.stringify(effect.motion)).not.toBe(frozen);
    renderer.render.mockImplementation(() => { throw Error("draw failure"); });
    expect(() => worlds.render(20, {}, .05, 0, [], false)).toThrow("draw failure"); expect(renderer.target).toBe(caller);
    const disposals = [entry.target, geometry, material].map(o => vi.spyOn(o, "dispose"));
    worlds.dispose(); disposals.forEach(spy => expect(spy).toHaveBeenCalledOnce());
  });
});
