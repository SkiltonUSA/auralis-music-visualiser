import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { HorizonWaves, HORIZON_WAVE_COUNT, HORIZON_WAVE_SAMPLES, HORIZON_WAVE_LIFETIME, horizonWavesGLSL } from "./horizon-waves.js";

const waveform = Uint8Array.from({ length: 2048 }, (_, i) => Math.round(128 + Math.sin(i * Math.PI / 80) * 65));
const audio = { waveform, level: .6, bass: .4 };
const silence = { waveform: new Uint8Array(2048).fill(128), level: 0, bass: 0 };

describe("Horizon's approaching waveform floor", () => {
  it("retains captured audio detail while travelling towards the viewer", () => {
    const waves = new HorizonWaves();
    expect(waves.update(audio, .02)).toBe(true);
    const snapshot = waves.data.slice(0, HORIZON_WAVE_SAMPLES);
    expect(Math.min(...snapshot)).toBeLessThan(100);
    expect(Math.max(...snapshot)).toBeGreaterThan(155);
    for (let i = 0; i < 60; i++) waves.update(silence, 1 / 60);
    expect(waves.lines[0].x).toBeCloseTo(1 / HORIZON_WAVE_LIFETIME);
    expect(waves.data.slice(0, HORIZON_WAVE_SAMPLES)).toEqual(snapshot);
    // Perspective projection moves down the screen and accelerates naturally
    // as constant-speed world-space travel approaches the camera.
    const y = age => -.08 - (1.1 / (8 - 7.2 * age) - 1.1 / 8);
    expect(y(.7)).toBeLessThan(y(.4));
    expect(y(.8) - y(.9)).toBeGreaterThan(y(.3) - y(.4));
    expect(horizonWavesGLSL).toContain('mix(8., .8, line.x)');
  });
  it("accentuates beats without crowding or changing existing shapes", () => {
    const waves = new HorizonWaves();
    waves.update(audio, 0);
    for (let i = 0; i < 6; i++) waves.update(audio, .05);
    expect(waves.emissions).toBe(1);
    expect(waves.update({ ...audio, transient: true }, .01)).toBe(true);
    expect(waves.lines[1].w).toBe(1);
    expect(waves.update({ ...audio, transient: true }, .01)).toBe(false);
  });
  it("freezes positions, emission timing and texture contents when paused", () => {
    const waves = new HorizonWaves();
    waves.update(audio, .01);
    const before = waves.lines.map(line => line.toArray());
    const data = waves.data.slice(), timer = waves.sinceEmission;
    expect(waves.update(audio, 100, true)).toBe(false);
    expect(waves.lines.map(line => line.toArray())).toEqual(before);
    expect(waves.data).toEqual(data);
    expect(waves.sinceEmission).toBe(timer);
  });
  it("rejects silence, DC offsets and missing audio; hidden trails drain away", () => {
    const waves = new HorizonWaves();
    expect(waves.update(silence, .05)).toBe(false);
    expect(waves.update({ ...silence, waveform: new Uint8Array(256).fill(175) }, .05)).toBe(false);
    expect(waves.update({}, .05)).toBe(false);
    expect(waves.update(audio, .05, false, false)).toBe(false);
    waves.update(audio, .05);
    for (let i = 0; i < 150; i++) waves.update(audio, .05, false, false);
    expect(waves.lines.every(line => line.y === 0)).toBe(true);
    expect(waves.emissions).toBe(1);
  });
  it("has frame-rate-independent travel and no jumps after a stalled frame", () => {
    const a = new HorizonWaves(), b = new HorizonWaves();
    a.update(audio, 0); b.update(audio, 0);
    for (let i = 0; i < 60; i++) a.update(silence, 1 / 60);
    for (let i = 0; i < 30; i++) b.update(silence, 1 / 30);
    expect(a.lines[0].x).toBeCloseTo(b.lines[0].x, 10);
    const age = a.lines[0].x;
    a.update(silence, 10);
    expect(a.lines[0].x - age).toBeCloseTo(.05 / HORIZON_WAVE_LIFETIME);
  });
  it("reuses a 6 KB texture and a fixed line pool during prolonged playback", () => {
    const waves = new HorizonWaves(), data = waves.data, first = waves.lines[0];
    for (let i = 0; i < 2000; i++) waves.update(audio, .05);
    expect(waves.emissions).toBeGreaterThan(HORIZON_WAVE_COUNT * 5);
    expect(waves.data).toBe(data);
    expect(waves.lines[0]).toBe(first);
    expect(data.byteLength).toBe(6144);
    expect(waves.lines).toHaveLength(HORIZON_WAVE_COUNT);
  });
  it("updates once per frame including outgoing Horizon blends, and only draws below the skyline", () => {
    const source = readFileSync(new URL('./visual-engine.js', import.meta.url), 'utf8');
    expect(source.match(/this\.horizonWaves\.update\(/g)).toHaveLength(1);
    expect(source).toContain('this.mode === 8 || (this.blend.active && this.blend.previous === 8)');
    expect(source).toContain('this.horizonWaves.update(audio, delta, this.paused, horizonVisible)');
    expect(horizonWavesGLSL).toContain('if (p.y >= baseline) return vec3(0.);');
    expect(source).not.toContain('float rush = fract(groundDepth');
  });
});
