export const DEFAULT_RESPONSE = 1.2;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

// One visual gain, after audio analysis: never change beat detection, BPM,
// playback volume or source buffers. Reuse the output buffers each frame.
export class GlobalResponse {
  constructor() {
    this.amount = DEFAULT_RESPONSE;
    this.gain = 1;
    this.lastTime = null;
    this.frequency = new Uint8Array(0);
    this.waveform = new Uint8Array(0);
  }

  set(value) {
    const number = Number(value);
    if (value === null || value === '' || !Number.isFinite(number)) return;
    this.amount = clamp(number, .5, 2.5);
  }

  apply(state, now) {
    const delta = this.lastTime === null ? 1 / 60 : clamp((now - this.lastTime) / 1000, 0, .05);
    this.lastTime = now;
    this.gain += (this.amount / DEFAULT_RESPONSE - this.gain) * (1 - Math.exp(-delta / .15));
    const gain = this.gain;
    const level = value => clamp((value || 0) * gain, 0, 1);
    if (this.frequency.length !== state.frequency.length) this.frequency = new Uint8Array(state.frequency.length);
    if (this.waveform.length !== state.waveform.length) this.waveform = new Uint8Array(state.waveform.length);
    for (let i = 0; i < this.frequency.length; i++) this.frequency[i] = clamp(state.frequency[i] * gain, 0, 255);
    for (let i = 0; i < this.waveform.length; i++) this.waveform[i] = clamp(128 + (state.waveform[i] - 128) * gain, 0, 255);
    return {
      ...state,
      level: level(state.level), bass: level(state.bass), mid: level(state.mid), high: level(state.high),
      beat: level(state.beat), peak: level(state.peak),
      bands: Object.fromEntries(Object.entries(state.bands).map(([name, value]) => [name, level(value)])),
      frequency: this.frequency, waveform: this.waveform, response: gain,
    };
  }
}
