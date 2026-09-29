import { Vector4 } from "three";

export const HORIZON_WAVE_COUNT = 24;
export const HORIZON_WAVE_SAMPLES = 256;
export const HORIZON_WAVE_LIFETIME = 7;

// A bounded history of real audio, moving through a perspective floor. Captured
// shapes never change underneath the camera; new sound enters at the horizon.
export class HorizonWaves {
  constructor() {
    this.data = new Uint8Array(HORIZON_WAVE_COUNT * HORIZON_WAVE_SAMPLES).fill(128);
    // Normalized age, captured energy, colour seed, captured beat accent.
    this.lines = Array.from({ length: HORIZON_WAVE_COUNT }, () => new Vector4(1, 0, 0, 0));
    this.next = 0;
    this.emissions = 0;
    this.sinceEmission = .36;
  }
  update(audio, delta, paused = false, active = true) {
    if (paused) return false;
    const dt = Math.max(0, Math.min(delta, .05));
    this.sinceEmission = Math.min(1, this.sinceEmission + dt);
    for (const line of this.lines) {
      line.x = Math.min(1, line.x + dt / HORIZON_WAVE_LIFETIME);
      if (line.x >= 1) line.y = 0;
    }
    if (!active || !audio.waveform?.length || this.sinceEmission < .3) return false;
    if (!audio.transient && this.sinceEmission < .36) return false;
    const waveform = audio.waveform;
    let mean = 0, power = 0;
    for (const value of waveform) mean += value;
    mean /= waveform.length;
    for (const value of waveform) power += ((value - mean) / 128) ** 2;
    const rms = Math.sqrt(power / waveform.length);
    if (rms < .008) return false;
    const gain = Math.min(2.5, .48 / rms);
    const row = this.next * HORIZON_WAVE_SAMPLES;
    for (let i = 0; i < HORIZON_WAVE_SAMPLES; i++) {
      const start = Math.floor(i / HORIZON_WAVE_SAMPLES * waveform.length);
      const end = Math.min(waveform.length, Math.max(start + 1, Math.floor((i + 1) / HORIZON_WAVE_SAMPLES * waveform.length)));
      let sample = 0;
      for (let j = start; j < end; j++) sample += waveform[j] - mean;
      this.data[row + i] = Math.round(Math.max(0, Math.min(255, 128 + sample / (end - start) * gain)));
    }
    const energy = Math.min(1, rms * 1.3 + (audio.level || 0) * .35 + (audio.bass || 0) * .2);
    this.lines[this.next].set(0, energy, (this.emissions * .137) % 1, audio.transient ? 1 : 0);
    this.next = (this.next + 1) % HORIZON_WAVE_COUNT;
    this.emissions++;
    this.sinceEmission = 0;
    return true;
  }
}

export const horizonWavesGLSL = /* glsl */ `
  vec3 horizonWaves(vec2 p, float baseline) {
    if (p.y >= baseline) return vec3(0.);
    vec3 color = vec3(0.);
    float pixel = 2. / min(uResolution.x, uResolution.y);
    for (int i = 0; i < ${HORIZON_WAVE_COUNT}; i++) {
      vec4 line = uHorizonLines[i];
      if (line.y <= 0.) continue;
      // Constant world-space travel: lines spread apart and their captured
      // waveform widens naturally as it comes towards the camera.
      float z = mix(8., .8, line.x);
      float depth = 1.1 / z - 1.1 / 8.;
      float worldX = p.x * z;
      float uvX = 1. - abs(mod(.5 + worldX * .065, 2.) - 1.);
      float wave = texture2D(uHorizonWaveforms, vec2(clamp(uvX, .002, .998), (float(i) + .5) / ${HORIZON_WAVE_COUNT}.)).r * 2. - 1.;
      float y = baseline - depth + wave * (.12 + line.y * .20) / z;
      float width = max(pixel * .7, .003 / z);
      float distance = abs(p.y - y);
      float core = 1. - smoothstep(width * .35, width * 1.8, distance);
      float glow = exp(-distance / (width * 4.5)) * .25;
      // Fine parallel filaments echo the reference without a solid fill.
      float echo = abs(p.y - y - (.018 + wave * .016) / z);
      float thread = (1. - smoothstep(width * .25, width * 1.25, echo)) * .36;
      float amber = exp(-abs(p.y - y + .042 / z) / (width * 2.)) * .16;
      float fade = smoothstep(0., .09, line.x) * (1. - smoothstep(.94, 1., line.x));
      fade *= smoothstep(0., .05, baseline - p.y);
      float light = (.28 + line.y * .9 + line.w * .18) * fade;
      vec3 ink = uPalette < .5
        ? mix(vec3(.38, 1., .025), vec3(.9, 1., .25), line.z)
        : chroma(.16 + line.z * .3, 1.);
      color += (ink * (core + glow + thread) + vec3(.8, .30, .035) * amber) * light;
    }
    return color;
  }
`;
