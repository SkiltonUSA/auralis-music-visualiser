import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SIGNAL_COLUMNS, SIGNAL_MARGIN, signalSceneGLSL } from './signal-scene.js';
import { VisualEngine } from './visual-engine.js';

describe('Signal spectrum', () => {
  it('spaces frequencies once, preserving mids instead of repeating bass bins', () => {
    const frequency = Uint8Array.from({ length: 1024 }, (_, i) => Math.min(255, i));
    const engine = {
      spectrumData: new Uint8Array(256), peakData: new Uint8Array(256),
      springSpectrum: new Float32Array(256), springVelocity: new Float32Array(256),
      spectrumTexture: {}, peakTexture: {},
    };
    for (let frame = 0; frame < 300; frame++) VisualEngine.prototype.updateSpectrum.call(engine, frequency, 1 / 60);
    expect(engine.spectrumData[128]).toBeCloseTo(Math.floor((128 / 255) ** 2 * 700), 0);
    expect(signalSceneGLSL).toContain('spectrumAt(sampleX)');
    expect(signalSceneGLSL).not.toContain('sampleX * sampleX');
    expect(signalSceneGLSL).not.toContain('liveX * liveX');
  });
  it('fits every column inside equal screen margins at any aspect ratio', () => {
    for (const width of [700, 1280, 2560, 5120]) {
      const centers = Array.from({ length: SIGNAL_COLUMNS }, (_, i) =>
        width * (SIGNAL_MARGIN + (i + .5) / SIGNAL_COLUMNS * (1 - 2 * SIGNAL_MARGIN)));
      expect(centers[0]).toBeGreaterThan(width * SIGNAL_MARGIN);
      expect(centers.at(-1)).toBeLessThan(width * (1 - SIGNAL_MARGIN));
      expect(centers[0]).toBeCloseTo(width - centers.at(-1));
    }
    expect(signalSceneGLSL).toContain('vUv.x');
    expect(signalSceneGLSL).toContain('return color * bounds');
    expect(signalSceneGLSL).not.toContain('p.x');
  });
  it('keeps bars and peak caps on the same bounded height scale, with stable gaps', () => {
    expect(signalSceneGLSL).toContain('height = .018 + bin * .60');
    expect(signalSceneGLSL).toContain('heldHeight = .018 + held * .60');
    expect(signalSceneGLSL).toContain('fwidth(cell)');
    expect(signalSceneGLSL).toContain('fwidth(y)');
    expect(signalSceneGLSL).not.toContain('sin(');
    const engine = readFileSync(new URL('./visual-engine.js', import.meta.url), 'utf8');
    expect(engine).toContain('(.20 + audio.bass * .06 - defaultBloom) * signalWeight');
    expect(engine).toContain('if (mode > 2.5 && mode < 3.5) return 0.');
  });
});
