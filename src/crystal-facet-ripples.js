export const CRYSTAL_RIPPLE_COUNT = 8;
const SPEED = 3.8; // Radians per second across the globe's surface.
const LIFETIME = (Math.PI + .44) / SPEED;

export class CrystalFacetRipples {
  constructor() {
    // Shared by the core and instanced shards: (angular front, brightness).
    this.uniforms = new Float32Array(CRYSTAL_RIPPLE_COUNT * 2);
    this.waves = Array.from({ length: CRYSTAL_RIPPLE_COUNT }, () => ({ age: LIFETIME, strength: 0 }));
    this.next = 0; this.lastBeat = -1; this.wasTransient = false; this.emissions = 0;
  }
  update(audio, delta) {
    const dt = Number.isFinite(delta) ? Math.max(0, Math.min(.05, delta)) : 0;
    if (!dt) return;
    const onset = audio.transient && (!this.wasTransient ||
      (Number.isFinite(audio.beatCount) && audio.beatCount !== this.lastBeat));
    if (onset) {
      const wave = this.waves[this.next];
      wave.age = 0;
      const bass = Number.isFinite(audio.bass) ? Math.max(0, Math.min(1, audio.bass)) : 0;
      wave.strength = .55 + bass * .35;
      this.next = (this.next + 1) % CRYSTAL_RIPPLE_COUNT;
      this.lastBeat = audio.beatCount; this.emissions++;
    }
    this.wasTransient = Boolean(audio.transient);
    this.waves.forEach((wave, i) => {
      wave.age = Math.min(LIFETIME, wave.age + dt);
      this.uniforms[i * 2] = wave.age * SPEED - .22;
      this.uniforms[i * 2 + 1] = wave.age >= LIFETIME ? 0 : wave.strength;
    });
  }
}
