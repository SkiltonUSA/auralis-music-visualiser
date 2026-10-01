import { describe, expect, it } from 'vitest';
import { GlobalResponse } from './global-response.js';
import { AudioEngine } from './audio-engine.js';

const frame = () => ({
  level: .2, bass: .3, mid: .2, high: .1, beat: .4, peak: .35,
  transient: true, bpm: 126, beatCount: 7, barBeat: 3,
  bands: { sub: .3, bass: .25, lowMid: .2, mid: .15, presence: .1, air: .05 },
  frequency: new Uint8Array([0, 24, 64, 120, 255]),
  waveform: new Uint8Array([0, 96, 128, 160, 255]),
});
const settle = (response, state) => {
  let result;
  for (let i = 0; i < 120; i++) result = response.apply(state, i * 1000 / 60);
  return result;
};

describe('global visual response', () => {
  it('preserves the existing default appearance without altering source buffers', () => {
    const response = new GlobalResponse(), source = frame();
    const result = response.apply(source, 0);
    expect(result).toEqual({ ...source, response: 1 });
    expect(result.frequency).not.toBe(source.frequency);
    expect(result.waveform).not.toBe(source.waveform);
    expect(result.bands).not.toBe(source.bands);
  });

  it('reduces or boosts all amplitude channels together while preserving musical timing', () => {
    const source = frame(), original = structuredClone(source);
    const low = new GlobalResponse(), high = new GlobalResponse();
    low.set(.5);high.set(2.5);
    const quiet = settle(low, source), strong = settle(high, source);
    for (const name of ['level', 'bass', 'mid', 'high', 'beat', 'peak']) {
      expect(quiet[name]).toBeLessThan(source[name]);
      expect(strong[name]).toBeGreaterThan(source[name]);
      expect(strong[name]).toBeLessThanOrEqual(1);
    }
    for (const name of Object.keys(source.bands)) {
      expect(quiet.bands[name]).toBeLessThan(source.bands[name]);
      expect(strong.bands[name]).toBeGreaterThan(source.bands[name]);
    }
    expect(quiet.frequency[2]).toBeLessThan(64);expect(strong.frequency[2]).toBeGreaterThan(64);
    expect(quiet.waveform[3]).toBeLessThan(160);expect(strong.waveform[3]).toBeGreaterThan(160);
    expect(quiet.waveform[1]).toBeGreaterThan(96);expect(strong.waveform[1]).toBeLessThan(96);
    expect(strong.waveform[2]).toBe(128);expect(strong.frequency[0]).toBe(0);
    for (const key of ['transient', 'bpm', 'beatCount', 'barBeat']) {
      expect(quiet[key]).toBe(source[key]);expect(strong[key]).toBe(source[key]);
    }
    expect(source).toEqual(original);
  });

  it('smooths adjustments, validates the range and reuses buffers', () => {
    const response = new GlobalResponse(), source = frame();
    const original = response.apply(source, 0);
    for (const invalid of [NaN, Infinity, 'bad', '', null]) response.set(invalid);
    expect(response.amount).toBe(1.2);
    response.set(100);expect(response.amount).toBe(2.5);
    const next = response.apply(source, 16);
    expect(next.response).toBeGreaterThan(1);expect(next.response).toBeLessThan(2.5 / 1.2);
    expect(next.frequency).toBe(original.frequency);expect(next.waveform).toBe(original.waveform);
    response.set(-1);expect(response.amount).toBe(.5);
  });

  it.each(['demo', 'microphone', 'file'])('keeps %s beat detection and raw analysis independent of Response', mode => {
    const engines = [.5, 2.5].map(amount => {
      const engine = new AudioEngine({ volume: .7 });
      engine.setSensitivity(amount);engine.mode = mode;engine.demoStartedAt = 0;
      if (mode !== 'demo') {
        engine.context = { sampleRate: 48000 };
        engine.analyser = { fftSize: 2048,
          getByteFrequencyData: target => target.fill(40),
          getByteTimeDomainData: target => target.fill(144) };
      }
      return engine;
    });
    let output;
    for (let i = 0; i < 180; i++) {
      output = engines.map(engine => engine.update(i * 1000 / 60));
      for (const name of ['bpm', 'beatCount', 'transient']) expect(output[0][name]).toBe(output[1][name]);
    }
    expect(output[1].bass).toBeGreaterThan(output[0].bass);
    expect(output[1].frequency[10]).toBeGreaterThan(output[0].frequency[10]);
    expect(engines[0].values).toEqual(engines[1].values);
    for (const engine of engines) expect(engine.player.volume).toBe(.7);
  });
});
