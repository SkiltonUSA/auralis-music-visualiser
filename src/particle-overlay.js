import p5 from "p5";
import { createValleyParticles, projectValleyParticle } from "./valley-particles.js";

const SPRING_POINTS = 96;
const BAR_COUNT = 54;

export class ParticleOverlay {
  constructor(container) {
    this.audio = null; this.mode = 0; this.palette = 0; this.visible = true; this.radialAngle = 0;
    this.density = Math.min(window.devicePixelRatio, 1.35);
    this.ready = false; this.frame = 0; this.flash = 0;
    this.sceneTime = 0;
    this.valleyParticles = createValleyParticles();
    this.waveSprings = Array.from({ length: SPRING_POINTS }, () => ({ position: 0, velocity: 0 }));
    this.waveHistory = [];
    this.barPeaks = new Float32Array(BAR_COUNT);
    const seeded = (value) => Math.abs(Math.sin(value * 91.733) * 43758.5453) % 1;
    this.particles = Array.from({ length: 72 }, (_, index) => {
      const group = index % 12;
      const sector = Math.floor(index / 12);
      return {
        group,
        angle: sector * Math.PI / 3 + seeded(group + 1) * Math.PI / 3,
        radius: 0.08 + seeded(group + 7) * 0.42,
        speed: 0.00025 + seeded(group + 13) * 0.0007,
        offset: seeded(group + 19) * Math.PI * 2,
        size: 0.45 + seeded(group + 23) * 1.3,
      };
    });
    this.sketch = new p5((p) => {
      p.setup = () => {
        p.pixelDensity(this.density);
        const canvas = p.createCanvas(window.innerWidth, window.innerHeight);
        canvas.parent(container);
        p.noLoop();
        this.ready = true;
      };
      p.windowResized = () => p.resizeCanvas(window.innerWidth, window.innerHeight);
      p.draw = () => this.draw(p);
    });
  }

  setMode(mode) {
    if (this.mode === Number(mode)) return;
    this.mode = Number(mode);
    if (this.ready) this.sketch.clear();
  }
  setPalette(palette) { this.palette = palette; }
  setLayers(layers) { this.layers = layers; }
  setQuality(quality) {
    this.density = quality === "ultra" ? 2 : quality === "high" ? 1.5 : Math.min(window.devicePixelRatio, 1.35);
    if (!this.ready) return;
    this.sketch.pixelDensity(this.density);
    this.sketch.resizeCanvas(window.innerWidth, window.innerHeight);
  }
  setVisible(visible) {
    this.visible = visible;
    this.sketch.canvas.style.opacity = visible ? "1" : "0";
  }
  color(p, alpha = 100, shift = 0) {
    alpha = Number.isFinite(alpha) ? Math.max(0, Math.min(255, alpha)) : 0;
    shift = Number.isFinite(shift) ? shift : 0;
    if (this.palette === 1) return p.color(255, 113 + shift * 30, 60, alpha);
    if (this.palette === 2) return p.color(65, 220, 232 + shift * 15, alpha);
    if (this.palette === 3) return shift > 0.15 ? p.color(255, 74, 18, alpha) : p.color(238, 233, 223, alpha);
    return p.color(170 + shift * 60, 110, 255, alpha);
  }

  updateSprings(waveform, transient) {
    for (let index = 0; index < this.waveSprings.length; index += 1) {
      const sourceIndex = Math.floor(index / (this.waveSprings.length - 1) * (waveform.length - 1));
      const target = ((waveform[sourceIndex] || 128) - 128) / 128;
      const spring = this.waveSprings[index];
      spring.velocity += (target - spring.position) * .16;
      spring.velocity *= .76;
      if (transient) spring.velocity += target * .075;
      spring.position += spring.velocity;
    }
    if (this.frame % 2 === 0) {
      this.waveHistory.unshift(this.waveSprings.map((spring) => spring.position));
      if (this.waveHistory.length > 8) this.waveHistory.pop();
    }
    this.flash = transient ? 1 : this.flash * .84;
  }

  drawWavePath(p, samples, cx, cy, width, amplitude, offset, alpha, weight, inverted = false) {
    p.stroke(this.color(p, alpha, offset * .012));
    p.strokeWeight(weight);
    p.noFill();
    p.beginShape();
    samples.forEach((sample, index) => {
      const x = cx - width / 2 + index / (samples.length - 1) * width;
      const y = cy + offset + sample * amplitude * (inverted ? -1 : 1);
      if (typeof p.splineVertex === "function") p.splineVertex(x, y);
      else p.vertex(x, y);
    });
    p.endShape();
  }

  drawSpringMesh(p, audio, cx, cy, strong = false) {
    const { mid, high, frequency, bands = {} } = audio;
    const width = Math.min(p.width * (strong ? .8 : .7), 1040);
    const amplitude = 28 + mid * (strong ? 112 : 72);
    const meshDepth = 7 + (bands.presence || high) * 34;
    for (let historyIndex = this.waveHistory.length - 1; historyIndex >= 0; historyIndex -= 1) {
      const age = historyIndex / Math.max(1, this.waveHistory.length - 1);
      const alpha = (strong ? 34 : 20) * (1 - age * .78);
      this.drawWavePath(p, this.waveHistory[historyIndex], cx, cy, width, amplitude, age * 14, alpha, .55 + (1 - age) * .55);
    }

    const current = this.waveSprings.map((spring) => spring.position);
    const upper = current.map((value, index) => {
      const sourceIndex = Math.floor((index / (current.length - 1)) ** 1.7 * Math.min(420, frequency.length - 1));
      return value - (frequency[sourceIndex] / 255) * .16;
    });
    this.drawWavePath(p, current, cx, cy, width, amplitude, 0, 62 + high * 70 + this.flash * 80, 1.15 + this.flash * 1.7);
    this.drawWavePath(p, upper, cx, cy, width, amplitude, -meshDepth, 42 + high * 54, .8);

    p.strokeWeight(.55);
    for (let index = 0; index < current.length; index += strong ? 3 : 6) {
      const x = cx - width / 2 + index / (current.length - 1) * width;
      const yMain = cy + current[index] * amplitude;
      const yUpper = cy - meshDepth + upper[index] * amplitude;
      p.stroke(this.color(p, 20 + high * 38 + this.flash * 22, index / current.length));
      p.line(x, yMain, x, yUpper);
    }

    if (this.flash > .04) {
      this.drawWavePath(p, current, cx, cy, width, amplitude * (1 + this.flash * .08), 0, this.flash * 105, 3.5 + this.flash * 4);
    }
  }

  drawSegmentedSpectrum(p, audio, cx, cy, scale) {
    const { frequency, high, beat } = audio;
    const width = Math.min(p.width * .8, 1040);
    const halfHeight = scale * .35;
    const contourTop = [];
    for (let index = 0; index < BAR_COUNT; index += 1) {
      const sourceIndex = Math.floor((index / (BAR_COUNT - 1)) ** 1.72 * Math.min(420, frequency.length - 1));
      const value = (frequency[sourceIndex] || 0) / 255;
      this.barPeaks[index] = Math.max(value, this.barPeaks[index] - (.009 + index / BAR_COUNT * .008));
      const x = cx - width / 2 + index / (BAR_COUNT - 1) * width;
      const height = value * halfHeight;
      contourTop.push([x, cy - height]);
      p.stroke(this.color(p, 58 + value * 130 + beat * 30, index / BAR_COUNT));
      p.strokeWeight(1 + value * 1.5);
      for (let y = 3; y < height; y += 8) {
        p.line(x, cy - y, x, cy - Math.min(y + 4, height));
        p.line(x, cy + y, x, cy + Math.min(y + 4, height));
      }
      const peakY = this.barPeaks[index] * halfHeight;
      p.stroke(255, 224, 164, 90 + this.barPeaks[index] * 150);
      p.strokeWeight(1.1);
      p.line(x - 2.2, cy - peakY, x + 2.2, cy - peakY);
      p.line(x - 2.2, cy + peakY, x + 2.2, cy + peakY);
    }
    p.noFill(); p.stroke(this.color(p, 42 + high * 72, .25)); p.strokeWeight(.8);
    p.beginShape();
    contourTop.forEach(([x, y]) => {
      if (typeof p.splineVertex === "function") p.splineVertex(x, y);
      else p.vertex(x, y);
    });
    p.endShape();
  }

  drawValleyParticles(p, audio) {
    const high = Number.isFinite(audio.high) ? audio.high : 0;
    const beat = Number.isFinite(audio.beat) ? audio.beat : 0;
    for (const particle of this.valleyParticles) {
      const point = projectValleyParticle(particle, this.sceneTime, p.width, p.height);
      const alpha = point.opacity * (110 + high * 65 + beat * 20);
      p.stroke(this.color(p, alpha * .45, particle.tint));
      p.strokeWeight(Math.max(.45, point.size * .45));
      p.line(point.tailX, point.tailY, point.x, point.y);
      p.noStroke();
      p.fill(this.color(p, alpha * .15, particle.tint));
      p.circle(point.x, point.y, point.size * 2.8);
      p.fill(this.color(p, alpha, particle.tint));
      p.circle(point.x, point.y, point.size);
    }
  }

  drawParticles(p, audio, cx, cy, scale, now) {
    if (this.mode === 6) return this.drawValleyParticles(p, audio);
    const bass = Number.isFinite(audio.bass) ? audio.bass : 0;
    const high = Number.isFinite(audio.high) ? audio.high : 0;
    const beat = Number.isFinite(audio.beat) ? audio.beat : 0;
    const { frequency } = audio;
    p.noStroke();
    for (const particle of this.particles) {
      const sourceIndex = Math.floor((particle.group / 11) ** 2 * Math.min(500, frequency.length - 1));
      const spectrum = Number.isFinite(frequency[sourceIndex]) ? frequency[sourceIndex] / 255 : 0;
      const angle = particle.angle + (this.mode === 9
        ? this.radialAngle
        : now * particle.speed * (0.7 + high + spectrum * 0.45));
      const breathingRadius = particle.radius * scale * (0.84 + bass * 0.24 + spectrum * 0.18);
      const ripplePhase = this.mode === 9 ? this.radialAngle * 2 : now * .0018;
      const ripple = Math.sin(ripplePhase + particle.offset) * scale * (0.012 + spectrum * 0.018) * audio.mid;
      const x = cx + Math.cos(angle) * (breathingRadius + ripple);
      const y = cy + Math.sin(angle) * (breathingRadius * (this.mode === 1 ? 0.72 : 0.58) + ripple);
      p.fill(this.color(p, 35 + high * 125 + beat * 70, Math.sin(particle.offset)));
      p.circle(x, y, particle.size * (1 + bass * 1.7 + spectrum * 2.2 + beat * 1.4));
    }
  }

  draw(p) {
    p.clear();
    if (!this.visible || !this.audio) return;
    const layers = (this.layers || [{ mode: this.mode, palette: this.palette, weight: 1 }])
      .filter(layer => layer.weight > 0 && layer.mode !== 4 && layer.mode !== 8 && layer.mode < 11);
    if (!layers.length) return;
    const audio = this.audio;
    const cx = p.width / 2, cy = p.height / 2, scale = Math.min(p.width, p.height), now = performance.now();
    this.updateSprings(audio.waveform, audio.transient);
    p.blendMode(p.ADD); p.noFill();
    const mode = this.mode, palette = this.palette;
    for (const layer of layers) {
      this.mode = layer.mode; this.palette = layer.palette;
      p.push();
      p.drawingContext.globalAlpha = layer.weight;
      if (this.mode === 3) this.drawSegmentedSpectrum(p, audio, cx, cy, scale);
      this.drawSpringMesh(p, audio, cx, cy, this.mode === 3);
      if (this.mode !== 3) this.drawParticles(p, audio, cx, cy, scale, now);
      p.pop();
    }
    this.mode = mode; this.palette = palette;
    p.blendMode(p.BLEND);
    this.frame += 1;
  }

  render(audio, radialAngle = 0, sceneTime = 0) {
    this.audio = audio; this.radialAngle = radialAngle; this.sceneTime = sceneTime;
    this.sketch.redraw();
  }
}
