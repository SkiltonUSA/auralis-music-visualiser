import * as THREE from "three";

// Original WebGL implementation of the waveform + image-warp feedback idea
// described by Ryan Geiss: https://www.geisswerks.com/geiss/secrets.html
// See THIRD_PARTY_NOTICES.md. No native Winamp code or assembly is embedded.
export const GEISS_WAVE_SAMPLES = 512;
export const GEISS_MODE = 15;
const clamp = value => Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

export class GeissFlowState {
  constructor() {
    this.time = 0; this.pulse = 0; this.beats = 0; this.lastBeat = null;
    this.wasTransient = false; this.lastSwitch = 0; this.pattern = 0;
    this.weights = new THREE.Vector3(1, 0, 0);
    this.audio = new THREE.Vector4(0, 0, 0, 0);
  }
  update(audio, delta, paused = false) {
    if (paused || !Number.isFinite(delta) || delta <= 0) return 0;
    const dt = Math.min(delta, .05), ease = 1 - Math.exp(-dt * 7);
    this.time += dt;
    [audio.bass, audio.mid, audio.high, audio.level].forEach((value, i) => {
      this.audio.setComponent(i, THREE.MathUtils.lerp(this.audio.getComponent(i), clamp(value), ease));
    });
    this.pulse *= Math.exp(-dt * 4);
    const counted = Number.isFinite(audio.beatCount);
    const hit = audio.transient && (counted ? audio.beatCount !== this.lastBeat : !this.wasTransient);
    this.wasTransient = Boolean(audio.transient);
    if (hit) {
      if (counted) this.lastBeat = audio.beatCount;
      this.pulse = .5 + clamp(audio.bass) * .5;
      this.beats += 1;
      if (this.beats >= 8 && this.time - this.lastSwitch >= 4) {
        this.pattern = (this.pattern + 1) % 3;
        this.lastSwitch = this.time; this.beats = 0;
      }
    }
    const blend = 1 - Math.exp(-dt * 1.3);
    for (let i = 0; i < 3; i++) this.weights.setComponent(i,
      THREE.MathUtils.lerp(this.weights.getComponent(i), i === this.pattern ? 1 : 0, blend));
    return dt;
  }
}

export function fillGeissWaveform(target, waveform) {
  if (!waveform?.length) { target.fill(128); return; }
  for (let i = 0; i < target.length; i++) {
    const start = Math.floor(i * waveform.length / target.length);
    const end = Math.max(start + 1, Math.floor((i + 1) * waveform.length / target.length));
    let sum = 0;
    for (let j = start; j < end; j++) sum += Number.isFinite(waveform[j]) ? waveform[j] : 128;
    target[i] = Math.round(Math.min(255, Math.max(0, sum / (end - start))));
  }
}

export function geissTargetSize(width, height, quality = "auto") {
  const cap = { auto: 1000, high: 1400, ultra: 1800 }[quality] || 1000;
  const scale = Math.min(1, cap / Math.max(width, height, 1));
  return [Math.max(2, Math.round(width * scale)), Math.max(2, Math.round(height * scale))];
}

const vertexShader = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position, 1.); }`;
const fragmentShader = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uPrevious, uWaveform;
  uniform vec2 uResolution;
  uniform vec4 uAudio;
  uniform vec3 uWeights, uPrimary, uSecondary, uAccent;
  uniform float uTime, uDelta, uPulse;
  vec2 turn(vec2 p) { return vec2(-p.y, p.x); }
  vec2 velocity(vec2 p) {
    vec2 centre = vec2(sin(uTime * .13) * .24, cos(uTime * .11) * .16);
    vec2 q = p - centre;
    vec2 spiral = q * .19 + turn(q) * (.34 + .13 * sin(length(q) * 3. - uTime * .16));
    vec2 a = p - vec2(-.48, .16), b = p - vec2(.48, -.16);
    vec2 twin = turn(a) * .085 / (.18 + dot(a,a)) - turn(b) * .085 / (.18 + dot(b,b)) + p * .10;
    vec2 river = vec2(.24 + sin(p.y * 3.4 + uTime * .2) * .12,
      sin(p.x * 3. + uTime * .18) * .22) + turn(p) * .06;
    vec2 curl = vec2(sin(p.y * 4.2 + uTime * .23), cos(p.x * 3.7 - uTime * .19)) * .055;
    return (spiral * uWeights.x + twin * uWeights.y + river * uWeights.z + curl)
      * (.65 + uAudio.w * .6 + uPulse * .12);
  }
  float waveform(float x) {
    float s = 1. / 512.;
    float value = texture2D(uWaveform, vec2(clamp(x, 0., 1.), .5)).r * .5;
    value += texture2D(uWaveform, vec2(clamp(x - s, 0., 1.), .5)).r * .25;
    value += texture2D(uWaveform, vec2(clamp(x + s, 0., 1.), .5)).r * .25;
    return (value * 255. - 128.) / 128.;
  }
  void main() {
    float aspect = uResolution.x / uResolution.y;
    vec2 p = (vUv * 2. - 1.) * vec2(aspect, 1.);
    // Midpoint backtrace gives smoothly curving trajectories, not linear smears.
    vec2 v = velocity(p);
    vec2 from = p - velocity(p - v * uDelta * .5) * uDelta;
    vec2 uv = from / vec2(aspect, 1.) * .5 + .5;
    float inside = step(0., uv.x) * step(uv.x, 1.) * step(0., uv.y) * step(uv.y, 1.);
    vec3 history = texture2D(uPrevious, clamp(uv, 0., 1.)).rgb * inside;
    // Long-lived, bounded linear-light trails. Silence decays naturally to black.
    history *= exp(-uDelta * (.68 - uAudio.w * .18));
    float x = p.x / max(.5, aspect) * .5 + .5;
    float wave = waveform(x);
    float envelope = pow(max(0., sin(clamp(x, 0., 1.) * 3.14159265)), .7);
    float sweep = sin(p.x * 2.1 + uTime * .38) * .18 + sin(uTime * .29) * .17;
    float shape = wave * (.20 + uAudio.x * .30) * envelope;
    float y = sweep + shape;
    float width = max(2. / uResolution.y, .0025);
    float lineA = exp(-pow((p.y - y) / width, 2.));
    float lineB = exp(-pow((p.y + y + .13 * sin(uTime * .21)) / (width * 1.2), 2.));
    float halo = exp(-abs(p.y - y) * 70.) * .14;
    float energy = smoothstep(.008, .16, uAudio.w) * (.35 + uAudio.w * .8 + uPulse * .3);
    float hue = .5 + .5 * sin(p.x * 2.4 + uTime * .32);
    vec3 ink = mix(uPrimary, uSecondary, hue) * (lineA + halo);
    ink += mix(uSecondary, uAccent, .5 + .5 * sin(uTime * .17 - p.x * 2.)) * lineB * .72;
    // Sparse high-frequency sparks join the same flow; no decorative bar overlay.
    float sparkX = sin(uTime * .43) * aspect * .7;
    vec2 spark = p - vec2(sparkX, waveform(sparkX / aspect * .5 + .5) * .35);
    ink += uAccent * exp(-dot(spark, spark) * 1800.) * uAudio.z * 1.4;
    ink *= energy * envelope * 3.2;
    vec3 color = history + ink * (1. - exp(-uDelta * 30.));
    // Avoid an HDR runaway if slow-moving traces repeatedly overlap.
    gl_FragColor = vec4(min(color, vec3(4.)), 1.);
  }
`;
const palettes = [
  [0x12dbff, 0xee2cda, 0xffb454], [0xff411d, 0xffbb40, 0xff61be],
  [0x18d8ae, 0x338aff, 0xc4ffed], [0xfff0d9, 0xff4221, 0xffb56c],
];

export class GeissFlow {
  constructor(renderer) {
    this.renderer = renderer; this.state = new GeissFlowState();
    this.targets = []; this.readIndex = 0; this.width = 2; this.height = 2;
    this.empty = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this.empty.needsUpdate = true;
    this.waveData = new Uint8Array(GEISS_WAVE_SAMPLES).fill(128);
    this.waveform = new THREE.DataTexture(this.waveData, GEISS_WAVE_SAMPLES, 1, THREE.RedFormat);
    this.waveform.minFilter = this.waveform.magFilter = THREE.LinearFilter;
    this.waveform.generateMipmaps = false; this.waveform.needsUpdate = true;
    this.uniforms = { uPrevious: { value: this.empty }, uWaveform: { value: this.waveform },
      uResolution: { value: new THREE.Vector2(2, 2) }, uTime: { value: 0 }, uDelta: { value: 0 },
      uPulse: { value: 0 }, uAudio: { value: this.state.audio }, uWeights: { value: this.state.weights },
      uPrimary: { value: new THREE.Color() }, uSecondary: { value: new THREE.Color() }, uAccent: { value: new THREE.Color() } };
    this.material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: this.uniforms, depthTest: false, depthWrite: false });
    this.copy = new THREE.ShaderMaterial({ vertexShader, depthTest: false, depthWrite: false,
      uniforms: { uSource: { value: this.empty } }, fragmentShader: `varying vec2 vUv; uniform sampler2D uSource;
        void main() { gl_FragColor = texture2D(uSource, vUv); }` });
    this.scene = new THREE.Scene(); this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material); this.scene.add(this.quad);
  }
  get texture() { return this.targets[this.readIndex]?.texture || this.empty; }
  resize(width, height, quality) { [this.width, this.height] = geissTargetSize(width, height, quality); }
  ensureTargets() {
    if (this.targets[0]?.width === this.width && this.targets[0]?.height === this.height) return;
    const old = this.targets;
    this.copy.uniforms.uSource.value = this.texture;
    const next = [0, 1].map(() => new THREE.WebGLRenderTarget(this.width, this.height,
      { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false }));
    this.quad.material = this.copy;
    try {
      for (const target of next) { this.renderer.setRenderTarget(target); this.renderer.render(this.scene, this.camera); }
    } catch (error) { next.forEach(target => target.dispose()); throw error; }
    finally { this.quad.material = this.material; }
    this.targets = next; this.readIndex = 0;
    this.copy.uniforms.uSource.value = this.empty;
    old.forEach(target => target.dispose());
    this.uniforms.uResolution.value.set(this.width, this.height);
  }
  render(audio, delta, palette = 0, paused = false) {
    const previous = this.renderer.getRenderTarget();
    try {
      this.ensureTargets();
      const dt = this.state.update(audio, delta, paused);
      if (!dt) return;
      fillGeissWaveform(this.waveData, audio.waveform); this.waveform.needsUpdate = true;
      const colors = palettes[palette] || palettes[0];
      ["uPrimary", "uSecondary", "uAccent"].forEach((key, i) => this.uniforms[key].value.setHex(colors[i]));
      this.uniforms.uPrevious.value = this.texture;
      this.uniforms.uTime.value = this.state.time; this.uniforms.uDelta.value = dt;
      this.uniforms.uPulse.value = this.state.pulse;
      const write = 1 - this.readIndex;
      this.renderer.setRenderTarget(this.targets[write]); this.renderer.render(this.scene, this.camera);
      this.readIndex = write;
    } finally { this.renderer.setRenderTarget(previous); }
  }
  dispose() {
    this.targets.forEach(target => target.dispose()); this.targets = [];
    this.quad.geometry.dispose(); this.material.dispose(); this.copy.dispose(); this.waveform.dispose(); this.empty.dispose();
  }
}
