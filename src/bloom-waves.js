import { Vector4 } from "three";

export const BLOOM_RING_COUNT = 16;
export const BLOOM_WAVE_SAMPLES = 256;
export const BLOOM_WAVE_LIFETIME = 3.6;

// Each travelling ring retains the audio waveform captured at its birth.
// New audio creates new rings, rather than reshaping every old ring at once.
export class BloomWaves {
  constructor() {
    this.data = new Uint8Array(BLOOM_RING_COUNT * BLOOM_WAVE_SAMPLES).fill(128);
    // radius, captured energy, normalized age, colour offset
    this.rings = Array.from({ length: BLOOM_RING_COUNT }, () => new Vector4(0, 0, 1, 0));
    this.ages = new Float64Array(BLOOM_RING_COUNT).fill(BLOOM_WAVE_LIFETIME);
    this.next = 0;
    this.sinceEmission = .28;
    this.emissions = 0;
  }
  update(audio, delta, paused = false, active = true) {
    if (paused) return false;
    const dt = Math.max(0, Math.min(delta, .05));
    this.sinceEmission += dt;
    for (let i = 0; i < BLOOM_RING_COUNT; i++) {
      this.ages[i] = Math.min(BLOOM_WAVE_LIFETIME, this.ages[i] + dt);
      this.rings[i].x = .26 + this.ages[i] * .4;
      this.rings[i].z = this.ages[i] / BLOOM_WAVE_LIFETIME;
      if (this.ages[i] >= BLOOM_WAVE_LIFETIME) this.rings[i].y = 0;
    }
    if (!active || !audio.waveform?.length || this.sinceEmission < .18) return false;
    if (!audio.transient && this.sinceEmission < .28) return false;
    const waveform = audio.waveform;
    let mean = 0, power = 0;
    for (const value of waveform) mean += value;
    mean /= waveform.length;
    for (const value of waveform) power += ((value - mean) / 128) ** 2;
    const rms = Math.sqrt(power / waveform.length);
    if (rms < .008) return false;
    const energy = Math.min(1, rms * 1.2 + (audio.level || 0) * .35 + (audio.bass || 0) * .25);
    const gain = Math.min(3, .55 / Math.max(rms, .01));
    const row = this.next * BLOOM_WAVE_SAMPLES;
    for (let i = 0; i < BLOOM_WAVE_SAMPLES; i++) {
      const start = Math.floor(i / BLOOM_WAVE_SAMPLES * waveform.length);
      const end = Math.min(waveform.length, Math.max(start + 1, Math.floor((i + 1) / BLOOM_WAVE_SAMPLES * waveform.length)));
      let value = 0;
      for (let j = start; j < end; j++) value += waveform[j] - mean;
      this.data[row + i] = Math.round(Math.min(255, Math.max(0, 128 + value / (end - start) * gain)));
    }
    this.ages[this.next] = 0;
    this.rings[this.next].set(.26, energy, 0, (this.emissions * .083) % 1);
    this.next = (this.next + 1) % BLOOM_RING_COUNT;
    this.emissions++;
    this.sinceEmission = 0;
    return true;
  }
}
