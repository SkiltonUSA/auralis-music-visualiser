const IDLE_SPEED = .04;
const RADIANS_PER_BEAT = .27;

// Follow musical tempo, not loudness: smooth angular velocity changes preserve
// the globe's position and prevent individual transients from kicking it.
export class CrystalTempoSpin {
  constructor() {
    this.speed = IDLE_SPEED;
    this.targetSpeed = IDLE_SPEED;
    this.sinceBeat = Infinity;
    this.estimatedBpm = 0;
    this.lastBeat = -1;
    this.wasTransient = false;
  }
  update(audio, delta) {
    const dt = Number.isFinite(delta) ? Math.max(0, Math.min(.05, delta)) : 0;
    if (!dt) return 0;
    this.sinceBeat += dt;
    const onset = audio.transient && (!this.wasTransient ||
      (Number.isFinite(audio.beatCount) && audio.beatCount !== this.lastBeat));
    if (onset) {
      // Cadence fallback while the shared audio engine is still estimating BPM.
      if (this.sinceBeat >= .25 && this.sinceBeat <= 2) {
        const measured = 60 / this.sinceBeat;
        this.estimatedBpm = this.estimatedBpm ? this.estimatedBpm * .65 + measured * .35 : measured;
      }
      this.sinceBeat = 0;
      this.lastBeat = audio.beatCount;
    }
    this.wasTransient = Boolean(audio.transient);
    const bpm = Number.isFinite(audio.bpm) && audio.bpm > 0 ? audio.bpm : this.estimatedBpm;
    // A retained BPM must not keep the globe spinning quickly after music ends.
    this.targetSpeed = bpm > 0 && this.sinceBeat < 2.5
      ? Math.min(240, Math.max(30, bpm)) / 60 * RADIANS_PER_BEAT : IDLE_SPEED;
    if (this.sinceBeat >= 2.5) this.estimatedBpm = 0;
    const rate = this.targetSpeed > this.speed ? 1.8 : .9;
    const decay = Math.exp(-rate * dt);
    // Exact integration of the speed ramp keeps 30/60/120 fps trajectories equal.
    const rotation = this.targetSpeed * dt + (this.speed - this.targetSpeed) * (1 - decay) / rate;
    this.speed = this.targetSpeed + (this.speed - this.targetSpeed) * decay;
    return rotation;
  }
}
