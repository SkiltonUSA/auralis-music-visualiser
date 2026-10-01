import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { DeckOscilloscope, oscilloscopePath } from "./deck-oscilloscope.js";

const points = path => [...path.matchAll(/[ML]([\d.]+),([\d.]+)/g)].map(m => [Number(m[1]), Number(m[2])]);
describe("control-deck oscilloscope", () => {
  it("draws silence as a centered flat line and handles missing samples", () => {
    expect(oscilloscopePath(null)).toBe("M0,32L640,32");
    for (const wave of [new Uint8Array(2048).fill(128), [NaN, undefined, Infinity, 128]]) {
      expect(points(oscilloscopePath(wave)).every(([, y]) => y === 32)).toBe(true);
    }
  });
  it("draws signed time-domain amplitude, preserves zero bytes and bounds gain", () => {
    expect(points(oscilloscopePath(new Uint8Array(2048), 1)).every(([, y]) => y === 58)).toBe(true);
    expect(points(oscilloscopePath(new Uint8Array(2048).fill(255), 2.5)).every(([, y]) => y === 6)).toBe(true);
    const quiet = points(oscilloscopePath(new Uint8Array(2048).fill(160), .5))[0][1];
    const loud = points(oscilloscopePath(new Uint8Array(2048).fill(160), 2))[0][1];
    expect(Math.abs(loud - 32)).toBeGreaterThan(Math.abs(quiet - 32));
    expect(oscilloscopePath([0, 255, NaN, -50, 999], Infinity)).not.toMatch(/NaN|Infinity/);
  });
  it("triggers a periodic waveform on a rising zero crossing without altering its shape", () => {
    const sine = phase => Float32Array.from({ length: 2048 }, (_, i) => 128 + 80 * Math.sin((i + phase) * Math.PI / 64));
    const a = points(oscilloscopePath(sine(0))), b = points(oscilloscopePath(sine(47)));
    expect(a).toHaveLength(384); expect(a[0]).toEqual([0, 32]); expect(a.at(-1)[0]).toBe(640);
    expect(a).toEqual(b);
    expect(a.some(([, y]) => y < 32)).toBe(true); expect(a.some(([, y]) => y > 32)).toBe(true);
  });
  it("limits DOM updates to 60 Hz and freezes while paused or hidden", () => {
    const traces = [{ setAttribute: vi.fn() }, { setAttribute: vi.fn() }];
    const scope = new DeckOscilloscope({ querySelectorAll: () => traces });
    const wave = new Uint8Array(2048).fill(160);
    scope.update(wave, 1, 0); scope.update(wave, 1, 8);
    scope.update(wave, 1, 50, true); scope.update(wave, 1, 100, false, true);
    scope.update(wave, 1, NaN);
    traces.forEach(t => expect(t.setAttribute).toHaveBeenCalledOnce());
    scope.update(wave, 1, 150);
    traces.forEach(t => expect(t.setAttribute).toHaveBeenCalledTimes(2));
  });
  it("replaces only the deck bars and connects to the audio waveform", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    const main = readFileSync(new URL("./main.js", import.meta.url), "utf8");
    expect(html).toContain('id="deck-oscilloscope"'); expect(html).not.toContain('id="spectrum"');
    expect(main).toContain("deckOscilloscope.update(state.waveform, 1.2, now, paused, uiHidden || visualOnly)");
    expect(main).not.toContain("spectrumBars");
  });
});
