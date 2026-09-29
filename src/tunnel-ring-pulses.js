export const TUNNEL_RING_COUNT = 64;
export const TUNNEL_PULSE_COUNT = 8;
const WAVE_LIFETIME = .8;
const LAUNCH_DEPTH = 6.5;
const WAVE_SPEED = 14;
const clamp = value => Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
const wrap = value => ((value % TUNNEL_RING_COUNT) + TUNNEL_RING_COUNT) % TUNNEL_RING_COUNT;
const signedDistance = (a, b) => wrap(a - b + TUNNEL_RING_COUNT / 2) - TUNNEL_RING_COUNT / 2;

export class TunnelRingPulses {
  constructor() {
    // The shader evaluates the narrow front continuously, not by interpolating
    // whole-panel samples (which would smear one pulse over several rings).
    this.uniforms = new Float32Array(TUNNEL_PULSE_COUNT * 3);
    // Coarse diagnostic samples; not used to shade the tunnel.
    this.levels = new Float32Array(TUNNEL_RING_COUNT);
    this.waves = Array.from({ length: TUNNEL_PULSE_COUNT }, () => ({ age: WAVE_LIFETIME, origin: 0, strength: 0, width: .3 }));
    this.next = 0; this.lastBeat = -1; this.wasTransient = false; this.emissions = 0;
  }
  update(audio, delta, cameraRing) {
    const dt = Number.isFinite(delta) ? Math.max(0, Math.min(.05, delta)) : 0;
    if (!dt) return;
    const newBeat = audio.transient && (!this.wasTransient || (Number.isFinite(audio.beatCount) && audio.beatCount !== this.lastBeat));
    if (newBeat) {
      const wave = this.waves[this.next];
      wave.age = 0;
      // Forward camera travel increases UV.x. Start ahead of the viewer and
      // travel in the opposite direction: the pulse expands out of the bend,
      // approaches the screen, then passes behind the camera exactly once.
      wave.origin = wrap(cameraRing + LAUNCH_DEPTH);
      wave.strength = .65 + clamp(audio.bass) * .25;
      this.next = (this.next + 1) % TUNNEL_PULSE_COUNT;
      this.lastBeat = audio.beatCount; this.emissions++;
    }
    this.wasTransient = Boolean(audio.transient);
    for (let i = 0; i < this.waves.length; i++) {
      const wave = this.waves[i];
      wave.age = Math.min(WAVE_LIFETIME, wave.age + dt);
      const centre = wave.origin - wave.age * WAVE_SPEED;
      if (signedDistance(centre, cameraRing) < -1) wave.age = WAVE_LIFETIME;
      this.uniforms[i * 3] = wrap(centre);
      this.uniforms[i * 3 + 1] = wave.width;
      this.uniforms[i * 3 + 2] = wave.age >= WAVE_LIFETIME ? 0 : wave.strength * Math.min(1, wave.age / .035);
    }
    for (let ring = 0; ring < TUNNEL_RING_COUNT; ring++) {
      this.levels[ring] = this.sample(ring + .5);
    }
  }
  sample(coordinate) {
    let value = 0;
    for (let i = 0; i < TUNNEL_PULSE_COUNT; i++) {
      const centre = this.uniforms[i * 3], width = this.uniforms[i * 3 + 1];
      if (!width) continue;
      const distance = Math.abs(signedDistance(coordinate, centre));
      const t = Math.min(1, Math.max(0, (distance - width * .35) / (width * .65)));
      value = Math.max(value, (1 - t * t * (3 - 2 * t)) * this.uniforms[i * 3 + 2]);
    }
    return value;
  }
}
