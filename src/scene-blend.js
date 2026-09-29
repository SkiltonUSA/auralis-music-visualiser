export const SCENE_BLEND_SECONDS = 1.6;

export class SceneBlend {
  constructor(mode = 0) { this.mode = mode; this.previous = mode; this.progress = 1; this.queued = null; }
  get active() { return this.progress < 1; }
  get weight() { return this.progress * this.progress * (3 - 2 * this.progress); }
  request(mode, immediate = false) {
    if (immediate) {
      this.mode = this.previous = mode; this.progress = 1; this.queued = null; return;
    }
    // Finish the visible two-scene mix before starting the latest request.
    // This avoids cuts and unbounded stacks of concurrently rendered scenes.
    if (this.active) { this.queued = mode === this.mode ? null : mode; return; }
    if (mode === this.mode) return;
    this.previous = this.mode; this.mode = mode; this.progress = 0;
  }
  update(delta, paused = false) {
    if (paused || !Number.isFinite(delta) || delta <= 0 || !this.active) return;
    this.progress = Math.min(1, this.progress + Math.min(delta, .1) / SCENE_BLEND_SECONDS);
    if (this.progress >= 1 - 1e-9) {
      this.progress = 1;
      const next = this.queued; this.queued = null;
      if (next !== null) this.request(next);
    }
  }
}
