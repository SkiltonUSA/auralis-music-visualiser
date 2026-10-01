// Store exclusions by stable renderer ID, not the scene rail's display index.
export const ROTATION_STORAGE_KEY = "auralis.disabled-scenes.v1";
export const DURATION_STORAGE_KEY = "auralis.scene-durations.v3";
export const DEFAULT_SCENE_SECONDS = 5;

export function loadSceneDurations(storage) {
  try {
    const current = storage.getItem(DURATION_STORAGE_KEY);
    if (current !== null) return JSON.parse(current);
    const previous = storage.getItem('auralis.scene-durations.v2');
    const legacy = JSON.parse(previous ?? storage.getItem('auralis.scene-durations.v1') ?? '{}');
    const migrated = legacy && typeof legacy === 'object' && !Array.isArray(legacy)
      ? Object.fromEntries(Object.entries(legacy).map(([mode, value]) => [mode,
        previous === null && value === 0 ? DEFAULT_SCENE_SECONDS
          : mode === '8' && value === 40 ? 20 : mode === '25' && value === 60 ? 30 : value])) : {};
    // One-time migrations preserve other custom times and new beat-mode choices.
    try { storage.setItem(DURATION_STORAGE_KEY, JSON.stringify(migrated)); } catch { /* Keep session choices if storage is unavailable. */ }
    return migrated;
  } catch { return {}; }
}

// Stable renderer IDs keep saved timing attached to the right scene when the
// catalogue is reordered. Zero selects beat-based Auto Director timing.
export class SceneDurations {
  constructor(scenes, saved = {}) {
    this.defaults = new Map(scenes.map(scene => [scene.renderMode, scene.minimumDuration || DEFAULT_SCENE_SECONDS]));
    this.overrides = {};
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      for (const mode of this.defaults.keys()) {
        if (Object.hasOwn(saved, mode)) this.set(mode, saved[mode]);
      }
    }
  }
  get(mode) { return this.overrides[mode] ?? this.defaults.get(mode) ?? 0; }
  set(mode, seconds) {
    if (!this.defaults.has(mode) || !Number.isInteger(seconds) || (seconds !== 0 && (seconds < 5 || seconds > 600))) return false;
    if (seconds === this.defaults.get(mode)) delete this.overrides[mode];
    else this.overrides[mode] = seconds;
    return true;
  }
  reset() { this.overrides = {}; }
}

export function sceneCutReady(duration, dwell, beats, newBeat) {
  return duration > 0 ? dwell.ready : newBeat && beats >= 16;
}

// Count rendered, unpaused time rather than wall time, so a suspended window
// cannot consume an extended scene's entire stay in the background.
export class SceneDwell {
  constructor() { this.reset(); }
  reset(minimum = 0) {
    this.minimum = Number.isFinite(minimum) ? Math.max(0, minimum) : 0;
    this.elapsed = 0;
  }
  update(delta, active = true) {
    if (active && Number.isFinite(delta) && delta > 0) this.elapsed += Math.min(delta, .05);
  }
  get remaining() { return Math.max(0, this.minimum - this.elapsed); }
  get ready() { return this.remaining < 1e-6; }
}

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
