import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { TunnelRingPulses, TUNNEL_PULSE_COUNT } from "./tunnel-ring-pulses.js";
import { EndlessTunnel } from "./endless-tunnel.js";

const beat = { transient: true, beatCount: 1, bass: 1, level: 1 };
const advance = (pulses, frames, camera = 0) => {
  for (let i = 0; i < frames; i++) pulses.update({}, 1 / 60, camera);
};
const active = pulses => pulses.waves.filter((_, i) => pulses.uniforms[i * 3 + 2] > 0);

describe("single Tunnel beat projectiles", () => {
  it("creates one narrow front per beat, with completely dark space on both sides", () => {
    const pulses = new TunnelRingPulses();
    pulses.update(beat, .05, 0);
    const centre = pulses.uniforms[0];
    expect(active(pulses)).toHaveLength(1);
    expect(pulses.sample(centre)).toBeCloseTo(.9);
    for (const offset of [-3, -1, -.4, .4, 1, 3]) expect(pulses.sample(centre + offset)).toBe(0);
    expect(pulses.waves[0].width * 2).toBeLessThan(1); // Less than one ring spacing.
    for (let i = 0; i < 5; i++) pulses.update(beat, .05, 0);
    expect(pulses.emissions).toBe(1);
  });
  it("shoots from the bend toward the camera and clears in under half a second", () => {
    const pulses = new TunnelRingPulses();
    pulses.update(beat, 1 / 60, 0);
    let depth = 7;
    for (let i = 1; i < 28; i++) {
      const camera = i / 60 * 2;
      pulses.update({}, 1 / 60, camera);
      const next = (pulses.uniforms[0] - camera + 96) % 64 - 32;
      expect(next).toBeLessThan(depth); depth = next;
    }
    expect(depth).toBeLessThan(0);
    advance(pulses, 10, 1);
    expect(active(pulses)).toHaveLength(0);
  });
  it("crosses the UV seam smoothly without reappearing", () => {
    const pulses = new TunnelRingPulses();
    pulses.update(beat, .05, 60);
    expect(pulses.uniforms[0]).toBeCloseTo(1.8);
    advance(pulses, 6, 60);
    expect(pulses.uniforms[0]).toBeCloseTo(.4);
    advance(pulses, 3, 60);
    expect(pulses.uniforms[0]).toBeCloseTo(63.7);
    expect(pulses.sample(-.3)).toBeCloseTo(.9);
    advance(pulses, 120, 60);
    expect(active(pulses)).toHaveLength(0);
    expect(Math.max(...pulses.levels)).toBe(0);
  });
  it("does not emit from FFT noise or sustain a glow between beats", () => {
    const pulses = new TunnelRingPulses();
    for (let i = 0; i < 60; i++) pulses.update({ bass: 1, level: 1, frequency: new Uint8Array(1024).fill(255) }, 1 / 60, 0);
    expect(pulses.emissions).toBe(0);
    pulses.update(beat, .05, 0); advance(pulses, 60);
    expect(active(pulses)).toHaveLength(0);
    expect(Math.max(...pulses.levels)).toBe(0);
  });
  it("never adds overlapping pulses into a white wash, even with rapid beats", () => {
    const pulses = new TunnelRingPulses(), uniforms = pulses.uniforms, waves = pulses.waves;
    for (let i = 0; i < 100; i++) pulses.update({ ...beat, beatCount: i }, 1 / 60, 0);
    expect(pulses.waves).toBe(waves); expect(pulses.uniforms).toBe(uniforms);
    expect(waves).toHaveLength(TUNNEL_PULSE_COUNT);
    for (let x = 0; x < 64; x += .05) expect(pulses.sample(x)).toBeLessThanOrEqual(.901);
    pulses.update({ ...beat, beatCount: 101 }, 100, 0);
    expect(waves[(pulses.next + 7) % 8].age).toBeCloseTo(.05);
  });
  it("freezes pulses on pause", () => {
    const pulses = new TunnelRingPulses();
    pulses.update(beat, .05, 0);
    const uniforms = pulses.uniforms.slice(), waves = JSON.stringify(pulses.waves);
    pulses.update({ ...beat, beatCount: 2 }, 0, 0);
    expect(pulses.uniforms).toEqual(uniforms); expect(JSON.stringify(pulses.waves)).toBe(waves);
    expect(pulses.emissions).toBe(1);
  });
  it("keeps the same width and trajectory at different frame rates", () => {
    const a = new TunnelRingPulses(), b = new TunnelRingPulses();
    for (let i = 0; i < 12; i++) a.update(i ? {} : beat, 1 / 60, 0);
    for (let i = 0; i < 6; i++) b.update(i ? {} : beat, 1 / 30, 0);
    a.uniforms.forEach((value, i) => expect(value).toBeCloseTo(b.uniforms[i], 6));
  });
  it("binds continuous fronts only in Tunnel and leaves Torus beat tiles intact", () => {
    const spectrum = new THREE.Texture();
    const make = style => new EndlessTunnel(new THREE.Scene(), new THREE.PerspectiveCamera(), spectrum, () => 0, style);
    const plasma = make('plasma'), checker = make('checker');
    plasma.update(beat, .05, 0); checker.update(beat, .05, 0);
    expect(plasma.uniforms.uPulseWaves.value).toBe(plasma.ringPulses.uniforms);
    expect(plasma.mesh.material.fragmentShader).toContain('max(wallPulse, front * pulse.z)');
    expect(checker.ringPulses).toBeNull(); expect(checker.uniforms.uTileFlash.value).toBe(1);
    expect(Math.max(...checker.uniforms.uPulseWaves.value)).toBe(0);
    for (const tunnel of [plasma, checker]) { tunnel.mesh.geometry.dispose(); tunnel.mesh.material.dispose(); }
    spectrum.dispose();
  });
});
