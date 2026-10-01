import * as THREE from "three";

// Original WebGL implementation of the waveform + image-warp feedback idea
// described by Ryan Geiss: https://www.geisswerks.com/geiss/secrets.html
// See THIRD_PARTY_NOTICES.md. No native Winamp code or assembly is embedded.
export const GEISS_WAVE_SAMPLES = 512;
export const GEISS_MODE = 15;
export const GEISS_TUNNEL_RINGS = 16;
// Composite these after feedback: sharp fronts must not be fed back every frame.
export const geissTunnelRingsGLSL = /* glsl */ `
  uniform vec2 uGeissRings[${GEISS_TUNNEL_RINGS}];
  uniform float uGeissTunnelWeight, uGeissRotation;
  vec3 geissTunnelRings(vec2 uv, vec2 resolution, vec3 primary, vec3 secondary) {
    if (uGeissTunnelWeight < .001) return vec3(0.);
    vec2 p = (uv * 2. - 1.) * vec2(resolution.x / resolution.y, 1.);
    float r = length(p), a = atan(p.y, p.x + .000001) + uGeissRotation;
    float light = 0.;
    for (int i = 0; i < ${GEISS_TUNNEL_RINGS}; i++) {
      float radius = uGeissRings[i].x;
      float front = radius * (1. + .025 * cos(a * 6. - log(max(radius, .01)) * 2.));
      float width = max(3. / resolution.y, radius * .014);
      float line = exp(-pow((r - front) / width, 2.));
      light = max(light, line * uGeissRings[i].y);
    }
    return mix(primary, secondary, .5 + .5 * sin(a * 3. - log(r + .1) * 3.))
      * light * uGeissTunnelWeight * 1.1;
  }
`;
export const GEISS_PATTERNS = Object.freeze([
  { id: 'spiral', label: 'Classic Spiral' }, { id: 'twins', label: 'Twin Vortices' },
  { id: 'river', label: 'Flowing River' }, { id: 'kaleidoscope', label: 'Kaleidoscope' },
  { id: 'tunnel', label: 'Vortex Tunnel' }, { id: 'ribbons', label: 'Liquid Ribbons' },
].map(Object.freeze));
const clamp = value => Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

export class GeissFlowState {
  constructor({ enhanced = true } = {}) {
    this.enhanced = enhanced; this.automatic = true; this.phraseBeats = 16;
    this.seed = 313; this.variationIndex = 0;
    this.rotation = 0;
    this.time = 0; this.pulse = 0; this.beats = 0; this.lastBeat = null;
    this.wasTransient = false; this.lastSwitch = 0; this.pattern = enhanced ? 3 : 0;
    this.weights = new THREE.Vector3(enhanced ? 0 : 1, 0, 0);
    this.extraWeights = new THREE.Vector3(enhanced ? 1 : 0, 0, 0);
    // Direction, trail decay, symmetry mix and curvature. Targets ease, never jump.
    this.variation = new THREE.Vector4(1, .60, .25, 1);
    this.variationTarget = this.variation.clone();
    this.audio = new THREE.Vector4(0, 0, 0, 0);
    this.tunnelSpeed = .95;
    this.tunnelRings = Array.from({ length: GEISS_TUNNEL_RINGS }, () => new THREE.Vector2());
    this.nextTunnelRing = 0;
  }
  setPattern(id) {
    if (!this.enhanced) return false;
    const index = GEISS_PATTERNS.findIndex(pattern => pattern.id === id);
    if (id !== 'auto' && index < 0) return false;
    this.automatic = id === 'auto';
    if (index >= 0) this.pattern = index;
    this.beats = 0; this.lastSwitch = this.time;
    return true;
  }
  newVariation() {
    if (!this.enhanced) return false;
    const random = () => { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; };
    this.variationTarget.set(random() < .5 ? -1 : 1, .44 + random() * .42, random(), .75 + random() * .65);
    this.variationIndex += 1;
    this.phraseBeats = [16, 24, 32][this.variationIndex % 3];
    return true;
  }
  update(audio, delta, paused = false) {
    if (paused || !Number.isFinite(delta) || delta <= 0) return 0;
    const dt = Math.min(delta, .05), ease = 1 - Math.exp(-dt * 7);
    this.time += dt;
    [audio.bass, audio.mid, audio.high, audio.level].forEach((value, i) => {
      this.audio.setComponent(i, THREE.MathUtils.lerp(this.audio.getComponent(i), clamp(value), ease));
    });
    // Positive travel is independent of variation direction, including reversals.
    this.tunnelSpeed = .95 + this.audio.x * .25 + this.audio.w * .15;
    for (const ring of this.tunnelRings) {
      if (ring.y <= 0) continue;
      ring.x *= Math.exp(this.tunnelSpeed * dt);
      ring.y *= Math.exp(-dt * .18);
      if (ring.x > 6) ring.set(0, 0);
    }
    this.pulse *= Math.exp(-dt * 4);
    const counted = Number.isFinite(audio.beatCount);
    const hit = audio.transient && (counted ? audio.beatCount !== this.lastBeat : !this.wasTransient);
    this.wasTransient = Boolean(audio.transient);
    if (hit) {
      if (counted) this.lastBeat = audio.beatCount;
      this.pulse = .5 + clamp(audio.bass) * .5;
      if (this.enhanced && (this.pattern === 4 || this.extraWeights.y > .01) && clamp(audio.level) > .008) {
        this.tunnelRings[this.nextTunnelRing].set(.17, .55 + clamp(audio.bass) * .4);
        this.nextTunnelRing = (this.nextTunnelRing + 1) % GEISS_TUNNEL_RINGS;
      }
      this.beats += 1;
      if (this.automatic && this.beats >= (this.enhanced ? this.phraseBeats : 8) && this.time - this.lastSwitch >= (this.enhanced ? 6 : 4)) {
        this.pattern = (this.pattern + 1) % (this.enhanced ? 6 : 3);
        this.lastSwitch = this.time; this.beats = 0;
        this.newVariation();
      }
    }
    const blend = 1 - Math.exp(-dt * (this.enhanced ? .85 : 1.3));
    for (let i = 0; i < 6; i++) {
      const vector = i < 3 ? this.weights : this.extraWeights, component = i % 3;
      vector.setComponent(component, THREE.MathUtils.lerp(vector.getComponent(component), i === this.pattern ? 1 : 0, blend));
    }
    const variationBlend = 1 - Math.exp(-dt * .55);
    this.rotation += .07 * (this.variationTarget.x * dt
      + (this.variation.x - this.variationTarget.x) * variationBlend / .55);
    this.variation.lerp(this.variationTarget, variationBlend);
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
  uniform vec4 uAudio, uVariation;
  uniform vec3 uWeights, uExtraWeights, uPrimary, uSecondary, uAccent;
  uniform float uTime, uDelta, uPulse, uRotation, uTunnelSpeed;
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
    float radius = length(p), angle = atan(p.y, p.x);
    vec2 petals = p * (.16 + .025 * cos(angle * 6.)) + turn(p) * (.20 + .06 * sin(radius * 8.));
    vec2 tunnel = p * uTunnelSpeed + turn(p) * uVariation.x
      * (.55 + .18 * sin(log(radius + .12) * 3. - uTime * .18)) * uVariation.w;
    vec2 ribbons = vec2(.32 + .14 * cos(p.y * 3.), sin(p.x * 2.2 - uTime * .25) * .32)
      + vec2(sin(p.y * 5. + uTime * .2), cos(p.x * 3.5 - uTime * .15)) * .08 * uVariation.w;
    return ((spiral * uWeights.x + twin * uWeights.y + river * uWeights.z
      + petals * uExtraWeights.x + ribbons * uExtraWeights.z) * uVariation.x + curl * (1. - uExtraWeights.y))
      * (.65 + uAudio.w * .6 + uPulse * .12) + tunnel * uExtraWeights.y;
  }
  float waveform(float x) {
    float s = 1. / 512.;
    float value = texture2D(uWaveform, vec2(clamp(x, 0., 1.), .5)).r * .5;
    value += texture2D(uWaveform, vec2(clamp(x - s, 0., 1.), .5)).r * .25;
    value += texture2D(uWaveform, vec2(clamp(x + s, 0., 1.), .5)).r * .25;
    return (value * 255. - 128.) / 128.;
  }
  vec2 mirrorPoint(vec2 p, float sectors) {
    float sector = 6.28318530718 / sectors;
    float a = atan(p.y, p.x) + uTime * .025;
    a = abs(mod(a + sector * .5, sector) - sector * .5);
    return length(p) * vec2(cos(a), sin(a));
  }
  vec3 previousAt(vec2 p, float aspect) {
    vec2 uv = p / vec2(aspect, 1.) * .5 + .5;
    float inside = step(0., uv.x) * step(uv.x, 1.) * step(0., uv.y) * step(uv.y, 1.);
    return texture2D(uPrevious, clamp(uv, 0., 1.)).rgb * inside;
  }
  void main() {
    float aspect = uResolution.x / uResolution.y;
    vec2 p = (vUv * 2. - 1.) * vec2(aspect, 1.);
    // Midpoint backtrace gives smoothly curving trajectories, not linear smears.
    vec2 v = velocity(p);
    vec2 from = p - velocity(p - v * uDelta * .5) * uDelta;
    vec3 history = previousAt(from, aspect);
    if (uExtraWeights.x > .001) {
      vec3 mirrored = mix(previousAt(mirrorPoint(from, 6.), aspect), previousAt(mirrorPoint(from, 10.), aspect), uVariation.z);
      history = mix(history, mirrored, uExtraWeights.x * (1. - exp(-uDelta * 3.)));
    }
    // Long-lived, bounded linear-light trails. Silence decays naturally to black.
    float enhanced = dot(uExtraWeights, vec3(1.));
    float decay = mix(.68, uVariation.y + .45, enhanced) - uAudio.w * .18;
    // Tunnel trails survive the flight to the edges without altering other fields.
    decay = mix(decay, .38 + uVariation.y * .18, uExtraWeights.y);
    history *= exp(-uDelta * decay);
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
    ink *= dot(uWeights, vec3(1.));
    float radius = length(p), angle = atan(p.y, p.x) + uRotation;
    float radialWave = waveform(.5 + .5 * cos(angle * 6.));
    float petals = mix(cos(angle * 6.), cos(angle * 10.), uVariation.z);
    float flower = .53 + petals * (.14 + uAudio.y * .08) + radialWave * (.04 + uAudio.x * .12);
    float petalLine = exp(-pow((radius - flower) / (width * 2.), 2.));
    float innerLine = exp(-pow((radius - flower * .55) / (width * 1.5), 2.));
    vec3 kaleidoInk = mix(uPrimary, uSecondary, .5 + .5 * petals) * petalLine + uAccent * innerLine * .55;
    float tunnelRadius = .20 + cos(angle * 8.) * .022 + radialWave * .025 * uAudio.x;
    float tunnelRing = exp(-pow((radius - tunnelRadius) / (width * 1.8), 2.));
    float spokes = pow(max(0., cos(angle * 12.)), 24.) * exp(-radius * 5.) * uAudio.z * .15;
    vec3 tunnelInk = mix(uPrimary, uSecondary, .5 + .5 * cos(angle * 3.)) * tunnelRing * (.22 + uPulse)
      + uAccent * spokes;
    float ribbonY = sin(p.x * 2. + uTime * .32) * .30 * uVariation.w + wave * (.10 + uAudio.x * .22);
    float ribbonA = exp(-pow((p.y - ribbonY) / (width * 2.5), 2.));
    float ribbonB = exp(-pow((p.y + ribbonY - .22 * cos(p.x * 1.4)) / (width * 2.), 2.));
    float ribbonC = exp(-pow((p.y - ribbonY * .45 + .3) / (width * 1.4), 2.));
    vec3 ribbonInk = (uPrimary * ribbonA + uSecondary * ribbonB * .8 + uAccent * ribbonC * .45) * envelope;
    ink += (kaleidoInk * uExtraWeights.x + tunnelInk * uExtraWeights.y + ribbonInk * uExtraWeights.z) * energy * .65;
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
  constructor(renderer, options) {
    this.renderer = renderer; this.state = new GeissFlowState(options);
    this.targets = []; this.readIndex = 0; this.width = 2; this.height = 2;
    this.empty = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this.empty.needsUpdate = true;
    this.waveData = new Uint8Array(GEISS_WAVE_SAMPLES).fill(128);
    this.waveform = new THREE.DataTexture(this.waveData, GEISS_WAVE_SAMPLES, 1, THREE.RedFormat);
    this.waveform.minFilter = this.waveform.magFilter = THREE.LinearFilter;
    this.waveform.generateMipmaps = false; this.waveform.needsUpdate = true;
    this.uniforms = { uPrevious: { value: this.empty }, uWaveform: { value: this.waveform },
      uResolution: { value: new THREE.Vector2(2, 2) }, uTime: { value: 0 }, uDelta: { value: 0 }, uRotation: { value: 0 },
      uPulse: { value: 0 }, uAudio: { value: this.state.audio }, uWeights: { value: this.state.weights },
      uTunnelSpeed: { value: this.state.tunnelSpeed },
      uExtraWeights: { value: this.state.extraWeights }, uVariation: { value: this.state.variation },
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
      this.uniforms.uRotation.value = this.state.rotation;
      this.uniforms.uTunnelSpeed.value = this.state.tunnelSpeed;
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
