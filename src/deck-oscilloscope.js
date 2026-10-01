const WIDTH = 640, CENTER = 32, AMPLITUDE = 26, POINTS = 384;
const sample = (waveform, index) => {
  const value = waveform?.[index];
  return Number.isFinite(value) ? Math.max(0, Math.min(255, value)) : 128;
};

// Display time-domain samples, not FFT bins. Trigger on a rising zero crossing
// so sustained notes remain readable instead of sliding across the deck.
export function oscilloscopeSamples(waveform, sensitivity = 1, target = new Float32Array(POINTS)) {
  const length = waveform?.length || 0;
  if (length < 2) { target.fill(0); return target; }
  const gain = Number.isFinite(sensitivity) ? Math.max(0, Math.min(2.5, sensitivity)) : 1;
  const span = Math.max(1, Math.floor((length - 1) / 2));
  let start = 0, armed = false;
  for (let i = 0; i < length - span - 1; i++) {
    const a = sample(waveform, i), b = sample(waveform, i + 1);
    if (a < 125) armed = true;
    if (armed && a <= 128 && b > 128) {
      start = i + (128 - a) / (b - a); break;
    }
  }
  for (let i = 0; i < target.length; i++) {
    const fraction = i / Math.max(1, target.length - 1), position = start + fraction * span;
    const index = Math.floor(position), mix = position - index;
    const a = sample(waveform, index), b = sample(waveform, Math.min(index + 1, length - 1));
    target[i] = Math.max(-1, Math.min(1, ((a + (b - a) * mix) - 128) / 128 * gain));
  }
  return target;
}

export function oscilloscopePath(waveform, sensitivity = 1) {
  if ((waveform?.length || 0) < 2) return `M0,${CENTER}L${WIDTH},${CENTER}`;
  const samples = oscilloscopeSamples(waveform, sensitivity), commands = [];
  for (let i = 0; i < POINTS; i++) {
    const fraction = i / (POINTS - 1), amplitude = samples[i];
    commands.push(`${i ? "L" : "M"}${(fraction * WIDTH).toFixed(2)},${(CENTER - amplitude * AMPLITUDE).toFixed(2)}`);
  }
  return commands.join("");
}

export class DeckOscilloscope {
  constructor(element) {
    this.traces = [...element.querySelectorAll(".scope-trace")];
    this.lastFrame = -Infinity;
  }
  update(waveform, sensitivity, now, paused = false, hidden = false) {
    if (paused || hidden || !Number.isFinite(now) || now - this.lastFrame < 1000 / 60) return;
    this.lastFrame = now;
    const path = oscilloscopePath(waveform, sensitivity);
    for (const trace of this.traces) trace.setAttribute("d", path);
  }
}
