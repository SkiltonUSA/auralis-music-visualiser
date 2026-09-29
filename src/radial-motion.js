// Integrate angular velocity: multiplying total elapsed time by the current
// audio band makes even a small band change jump the angle after a long run.
export class RadialMotion {
  constructor() { this.angle = 0; this.velocity = 0; }
  update(audio, delta, paused = false) {
    if (paused) return;
    const dt = Math.max(0, Math.min(delta, .05));
    const energy = Math.min(1, Math.max(0,
      ((audio.level || 0) * .55 + (audio.bass || 0) * .3 + (audio.mid || 0) * .15 - .015) / .985));
    const tempo = Math.min(180, Math.max(60, audio.bpm || 120)) / 120;
    const target = energy * (.035 + tempo * .02);
    const decay = Math.exp(-dt * 1.6);
    this.angle += target * dt + (this.velocity - target) * (1 - decay) / 1.6;
    this.velocity = target + (this.velocity - target) * decay;
  }
}
