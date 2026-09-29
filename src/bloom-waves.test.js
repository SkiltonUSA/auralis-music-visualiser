import { describe, it, expect } from "vitest";
import { BloomWaves, BLOOM_WAVE_SAMPLES, BLOOM_RING_COUNT } from "./bloom-waves.js";
const waveform = Uint8Array.from({ length: 2048 }, (_, i) => Math.round(128 + Math.sin(i / 2048 * Math.PI * 16) * 70));
const audio = { waveform, level: .5, bass: .6 };

describe("Bloom's travelling waveform rings", () => {
  it("captures real waveform detail and preserves it as the ring travels", () => {
    const waves = new BloomWaves();
    expect(waves.update(audio, 1 / 60)).toBe(true);
    const snapshot = waves.data.slice(0, BLOOM_WAVE_SAMPLES);
    expect(Math.min(...snapshot)).toBeLessThan(100);
    expect(Math.max(...snapshot)).toBeGreaterThan(160);
    const radius = waves.rings[0].x;
    for (let i = 0; i < 30; i++) waves.update({ ...audio, waveform: new Uint8Array(2048).fill(128) }, 1 / 60);
    expect(waves.rings[0].x).toBeGreaterThan(radius);
    expect(waves.data.slice(0, BLOOM_WAVE_SAMPLES)).toEqual(snapshot);
  });
  it("launches an extra ring on a beat, with a minimum spacing", () => {
    const waves = new BloomWaves();
    waves.update(audio, .01);
    for (let i = 0; i < 4; i++) waves.update(audio, .05);
    expect(waves.emissions).toBe(1);
    expect(waves.update({ ...audio, transient: true }, .01)).toBe(true);
    expect(waves.update({ ...audio, transient: true }, .01)).toBe(false);
    expect(waves.emissions).toBe(2);
  });
  it("does not emit in silence or other scenes and lets existing rings fade", () => {
    const waves = new BloomWaves();
    expect(waves.update({ ...audio, waveform: new Uint8Array(2048).fill(128) }, .05)).toBe(false);
    expect(waves.update(audio, .05, false, false)).toBe(false);
    waves.update(audio, .05);
    for (let i = 0; i < 80; i++) waves.update(audio, .05, false, false);
    expect(waves.rings.every((ring) => ring.y === 0)).toBe(true);
  });
  it("freezes ring position and waveform history when paused", () => {
    const waves = new BloomWaves();
    waves.update(audio, .01);
    const ring = waves.rings[0].clone();
    expect(waves.update({ ...audio, transient: true }, 10, true)).toBe(false);
    expect(waves.rings[0].equals(ring)).toBe(true);
    expect(waves.emissions).toBe(1);
  });
  it("reuses bounded storage during extended playback", () => {
    const waves = new BloomWaves();
    const data = waves.data;
    for (let i = 0; i < 1000; i++) waves.update(audio, .05);
    expect(waves.emissions).toBeGreaterThan(BLOOM_RING_COUNT * 2);
    expect(waves.rings).toHaveLength(BLOOM_RING_COUNT);
    expect(waves.data).toBe(data);
    expect(waves.data.length).toBe(BLOOM_RING_COUNT * BLOOM_WAVE_SAMPLES);
  });
});
