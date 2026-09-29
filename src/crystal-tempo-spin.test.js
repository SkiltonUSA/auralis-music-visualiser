import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { CrystalTempoSpin } from "./crystal-tempo-spin.js";
import { ProceduralScenes } from "./procedural-scenes.js";

function playback(bpm, seconds = 8, fps = 60, level = .5) {
  const spin = new CrystalTempoSpin();
  let angle = 0, previous = -1;
  for (let i = 0; i < seconds * fps; i++) {
    const beat = Math.floor(i / fps * bpm / 60 + 1e-8);
    angle += spin.update({ bpm, level, transient: beat !== previous, beatCount: beat }, 1 / fps);
    previous = beat;
  }
  return { spin, angle };
}

describe("Crystalis tempo-driven rotation", () => {
  it("spins proportionally faster at faster tempos, independently of volume", () => {
    const slow = playback(60), medium = playback(120), fast = playback(180);
    expect(slow.spin.speed).toBeCloseTo(.27, 5);
    expect(medium.spin.speed).toBeCloseTo(.54, 5);
    expect(fast.spin.speed).toBeCloseTo(.81, 5);
    expect(fast.angle).toBeGreaterThan(medium.angle);
    expect(medium.angle).toBeGreaterThan(slow.angle);
    expect(playback(120, 8, 60, .05).angle).toBe(playback(120, 8, 60, 1).angle);
  });
  it("eases tempo changes and returns to a gentle turn when beats stop", () => {
    const { spin } = playback(60);
    const before = spin.speed;
    spin.update({ bpm: 180, transient: true, beatCount: 100 }, 1 / 60);
    expect(spin.speed).toBeGreaterThan(before);
    expect(spin.speed - before).toBeLessThan(.02);
    for (let i = 0; i < 900; i++) spin.update({ bpm: 180 }, 1 / 60);
    expect(spin.speed).toBeCloseTo(.04, 4);
  });
  it("uses detected cadence when BPM is unavailable and ignores held transients", () => {
    const spin = new CrystalTempoSpin();
    spin.update({ transient: true, beatCount: 1 }, .05);
    for (let i = 0; i < 9; i++) spin.update({}, .05);
    spin.update({ transient: true, beatCount: 2 }, .05);
    expect(spin.estimatedBpm).toBeCloseTo(120);
    const estimate = spin.estimatedBpm;
    for (let i = 0; i < 5; i++) spin.update({ transient: true, beatCount: 2 }, .05);
    expect(spin.estimatedBpm).toBe(estimate);
    expect(spin.speed).toBeGreaterThan(.04);
  });
  it("is frame-rate independent, bounded after stalls, and frozen on pause", () => {
    expect(playback(120, 8, 30).angle).toBeCloseTo(playback(120, 8, 120).angle, 9);
    const { spin } = playback(120), saved = { ...spin };
    for (const delta of [0, -1, NaN]) expect(spin.update({ transient: true, beatCount: 100 }, delta)).toBe(0);
    expect({ ...spin }).toEqual(saved);
    expect(spin.update({ bpm: 10000, transient: true, beatCount: 101 }, 50)).toBeLessThanOrEqual(1.08 * .05);
    expect(spin.targetSpeed).toBe(1.08);
  });
  it("rotates the real globe without moving its anchor and freezes while hidden", () => {
    const renderer = { target: null, getRenderTarget() { return this.target; }, setRenderTarget(t) { this.target = t; }, render: vi.fn() };
    const spectrum = new THREE.Texture(), worlds = new ProceduralScenes(renderer, spectrum, 42);
    for (let i = 0; i < 60; i++) worlds.render(11, { bpm: 180, transient: i % 20 === 0, beatCount: Math.floor(i / 20) }, 1 / 60, 0, [], false);
    const entry = worlds.entries.get(11), rotation = entry.anchor.rotation.y, speed = entry.tempoSpin.speed;
    expect(rotation).toBeGreaterThan(.35);
    expect(entry.anchor.position.toArray()).toEqual([0, 0, 0]);
    worlds.render(11, { bpm: 60 }, .05, 0, [], true);
    worlds.render(13, {}, .05, 0, [], false);
    expect(entry.anchor.rotation.y).toBe(rotation);
    expect(entry.tempoSpin.speed).toBe(speed);
    worlds.dispose(); spectrum.dispose();
  });
});
