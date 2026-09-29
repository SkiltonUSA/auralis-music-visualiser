// Store exclusions by stable renderer ID, not the scene rail's display index.
export const ROTATION_STORAGE_KEY = "auralis.disabled-scenes.v1";

export class SceneRotation {
  constructor(renderModes, disabled = []) {
    this.modes = [...renderModes];
    this.disabled = new Set((Array.isArray(disabled) ? disabled : [])
      .filter(mode => this.modes.includes(mode)));
  }
  get count() { return this.modes.length - this.disabled.size; }
  get disabledModes() { return this.modes.filter(mode => this.disabled.has(mode)); }
  isEnabled(index) {
    return Number.isInteger(index) && index >= 0 && index < this.modes.length
      && !this.disabled.has(this.modes[index]);
  }
  toggle(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.modes.length) return undefined;
    const mode = this.modes[index];
    if (this.disabled.has(mode)) this.disabled.delete(mode);
    else this.disabled.add(mode);
    return this.isEnabled(index);
  }
  next(index) {
    for (let step = 1; step <= this.modes.length; step++) {
      const candidate = (index + step + this.modes.length) % this.modes.length;
      if (this.isEnabled(candidate)) return candidate;
    }
    return null;
  }
}
