import * as THREE from "three";
import { spiritCurlGLSL } from "./spirit-curl.js";

// GPU position/lifetime ping-pong and curl advection adapted from The Spirit,
// Copyright (c) 2015 Edan Kwan, MIT. See THIRD_PARTY_NOTICES.md.
// Crystal-safe emitters, audio response, rendering and lifecycle are Auralis's.
export const SPIRIT_SIZE = 128;
export const SPIRIT_COUNTS = { auto: 8192, high: 12288, ultra: 16384 };
const clamp = value => Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0, 1) : 0;

export function createSpiritSeeds(random) {
  const data = new Float32Array(SPIRIT_SIZE * SPIRIT_SIZE * 4);
  for (let i = 0; i < data.length; i += 4) {
    const angle = random() * Math.PI * 2, y = random() * 2 - 1;
    const radius = Math.cbrt(random()), ring = Math.sqrt(1 - y * y) * radius;
    data[i] = Math.cos(angle) * ring;
    data[i + 1] = y * radius;
    data[i + 2] = Math.sin(angle) * ring;
    data[i + 3] = .02 + random() * .96;
  }
  return data;
}

export class SpiritMotion {
  constructor() {
    this.time = 0; this.audio = new THREE.Vector4(); this.pulse = 0;
    this.wasTransient = false; this.lastBeat = -1;
  }
  update(audio, delta) {
    const dt = Number.isFinite(delta) ? THREE.MathUtils.clamp(delta, 0, .05) : 0;
    if (!dt) return 0;
    this.time += dt;
    const ease = 1 - Math.exp(-dt * 3);
    [audio.bass, audio.mid, audio.high, audio.level].forEach((value, i) => {
      this.audio.setComponent(i, THREE.MathUtils.lerp(this.audio.getComponent(i), clamp(value), ease));
    });
    this.pulse *= Math.exp(-dt * 3.5);
    if (audio.transient && (!this.wasTransient || (Number.isFinite(audio.beatCount) && audio.beatCount !== this.lastBeat))) {
      this.pulse = .6 + clamp(audio.bass) * .4; this.lastBeat = audio.beatCount;
    }
    this.wasTransient = Boolean(audio.transient);
    return dt;
  }
}

const quadVertex = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position, 1.); }`;
const simulationFragment = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uPrevious, uSeeds;
  uniform float uTime, uDelta, uPulse, uReset, uCount;
  uniform vec4 uAudio;
  ${spiritCurlGLSL}
  vec3 emitter(float seed) {
    float angle = floor(fract(seed * 13.) * 3.) * 2.0943951 + uTime * .20;
    return vec3(cos(angle) * 3.35, sin(angle) * 2.65, sin(angle * 2.) * .8 - .8);
  }
  void main() {
    vec4 seed = texture2D(uSeeds, vUv);
    vec4 state = texture2D(uPrevious, vUv);
    if (uReset > .5) {
      gl_FragColor = vec4(emitter(seed.w) + seed.xyz * .75, seed.w);
      return;
    }
    float index = floor(vUv.y * 128.) * 128. + floor(vUv.x * 128.);
    if (index >= uCount) { gl_FragColor = state; return; }
    vec3 p = state.xyz;
    float life = state.w - uDelta * (.085 + uAudio.z * .018);
    if (life <= 0. || length(p) > 7.) {
      p = emitter(seed.w) + seed.xyz * (.50 + uAudio.x * .30);
      life = .75 + fract(seed.w * 21.4131 + uTime) * .25;
    } else {
      vec3 curl = spiritCurl(p * .58, uTime * .16);
      vec3 tangent = vec3(-p.y, p.x * .72, sin(uTime * .3 + p.x) * .22);
      float radius = length(p);
      vec3 outward = p / max(radius, .01);
      // The cloud breathes around the globe instead of moving its anchors.
      float shell = 3.5 + uAudio.x * .55;
      vec3 velocity = curl * (.21 + uAudio.y * .27) + tangent * .18;
      velocity += outward * ((shell - radius) * .38 + uPulse * .6);
      velocity += (emitter(seed.w) - p) * .035;
      p += velocity * uDelta;
      if (length(p) < 2.75) p = normalize(p + vec3(.0001)) * 2.75;
    }
    gl_FragColor = vec4(p, life);
  }
`;
const particleVertex = /* glsl */ `
  uniform sampler2D uPositions, uSeeds;
  uniform float uHeight, uTime, uPulse;
  uniform vec4 uAudio;
  varying float vAlpha, vTint, vSpark;
  void main() {
    vec4 state = texture2D(uPositions, position.xy);
    float seed = texture2D(uSeeds, position.xy).w;
    vec4 view = modelViewMatrix * vec4(state.xyz, 1.);
    gl_Position = projectionMatrix * view;
    float size = .048 + seed * .040;
    gl_PointSize = clamp(size * uHeight / max(1., -view.z), 1., 15.);
    float life = smoothstep(0., .14, state.w) * (1. - smoothstep(.88, 1., state.w));
    // Protect the central silhouette even where particles pass in front.
    float clearance = mix(.08, 1., smoothstep(2., 2.9, length(state.xy)));
    vAlpha = life * clearance * (.10 + uAudio.w * .065);
    vTint = seed;
    vSpark = pow(max(0., sin(seed * 173. + uTime * 1.3)), 18.) * uAudio.z;
  }
`;
const particleFragment = /* glsl */ `
  uniform vec3 uA, uB, uC;
  uniform float uPulse;
  varying float vAlpha, vTint, vSpark;
  void main() {
    vec2 point = gl_PointCoord * 2. - 1.;
    float r2 = dot(point, point);
    if (r2 > 1.) discard;
    float soft = exp(-r2 * 4.) * (1. - smoothstep(.6, 1., r2));
    vec3 color = mix(uA, uB, vTint);
    color = mix(color, uC, vSpark * .5);
    gl_FragColor = vec4(color * (1. + vSpark * .8 + uPulse * .12), soft * vAlpha);
  }
`;

export class CrystalSpirit {
  constructor(renderer, scene, random) {
    this.renderer = renderer; this.parent = scene; this.motion = new SpiritMotion();
    this.supported = Boolean(renderer.extensions?.has("EXT_color_buffer_float"));
    this.targets = []; this.readIndex = 0; this.disposed = false;
    this.count = SPIRIT_COUNTS.auto;
    if (!this.supported) return;
    this.seeds = new THREE.DataTexture(createSpiritSeeds(random), SPIRIT_SIZE, SPIRIT_SIZE, THREE.RGBAFormat, THREE.FloatType);
    this.seeds.minFilter = this.seeds.magFilter = THREE.NearestFilter;
    this.seeds.generateMipmaps = false; this.seeds.needsUpdate = true;
    this.uniforms = {
      uPrevious: { value: this.seeds }, uSeeds: { value: this.seeds },
      uPositions: { value: this.seeds }, uTime: { value: 0 }, uDelta: { value: 0 },
      uPulse: { value: 0 }, uReset: { value: 0 }, uCount: { value: this.count },
      uAudio: { value: this.motion.audio }, uHeight: { value: 800 },
      uA: { value: new THREE.Color() }, uB: { value: new THREE.Color() }, uC: { value: new THREE.Color() },
    };
    this.simulation = new THREE.Scene(); this.camera = new THREE.Camera();
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      vertexShader: quadVertex, fragmentShader: simulationFragment, uniforms: this.uniforms,
      depthTest: false, depthWrite: false, blending: THREE.NoBlending,
    }));
    this.simulation.add(this.quad);
    const positions = new Float32Array(SPIRIT_SIZE * SPIRIT_SIZE * 3);
    for (let i = 0; i < SPIRIT_SIZE * SPIRIT_SIZE; i++) {
      positions[i * 3] = (i % SPIRIT_SIZE + .5) / SPIRIT_SIZE;
      positions[i * 3 + 1] = (Math.floor(i / SPIRIT_SIZE) + .5) / SPIRIT_SIZE;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setDrawRange(0, this.count);
    this.points = new THREE.Points(geometry, new THREE.ShaderMaterial({
      vertexShader: particleVertex, fragmentShader: particleFragment, uniforms: this.uniforms,
      transparent: true, depthTest: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.points.frustumCulled = false; this.points.renderOrder = 2; scene.add(this.points);
  }
  setQuality(quality, height) {
    this.count = SPIRIT_COUNTS[quality] || SPIRIT_COUNTS.auto;
    if (!this.supported || this.disposed) return;
    this.points.geometry.setDrawRange(0, this.count);
    this.uniforms.uCount.value = this.count;
    this.uniforms.uHeight.value = Math.max(2, height);
  }
  ensureTargets() {
    if (this.targets.length) return;
    this.targets = [0, 1].map(() => new THREE.WebGLRenderTarget(SPIRIT_SIZE, SPIRIT_SIZE, {
      type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
      depthBuffer: false, stencilBuffer: false, generateMipmaps: false,
    }));
    this.uniforms.uReset.value = 1;
    try {
      for (const target of this.targets) {
        this.renderer.setRenderTarget(target); this.renderer.render(this.simulation, this.camera);
      }
    } catch (error) {
      this.targets.forEach(target => target.dispose()); this.targets = [];
      throw error;
    } finally { this.uniforms.uReset.value = 0; }
    this.uniforms.uPositions.value = this.targets[0].texture;
  }
  update(audio, delta, colors) {
    if (!this.supported || this.disposed) return;
    const previous = this.renderer.getRenderTarget();
    try {
      this.ensureTargets();
      ["uA", "uB", "uC"].forEach((name, i) => this.uniforms[name].value.setHex(colors[i]));
      const dt = this.motion.update(audio, delta);
      if (!dt) return;
      this.uniforms.uTime.value = this.motion.time; this.uniforms.uDelta.value = dt;
      this.uniforms.uPulse.value = this.motion.pulse;
      this.uniforms.uPrevious.value = this.targets[this.readIndex].texture;
      const write = 1 - this.readIndex;
      this.renderer.setRenderTarget(this.targets[write]); this.renderer.render(this.simulation, this.camera);
      this.readIndex = write; this.uniforms.uPositions.value = this.targets[write].texture;
    } finally { this.renderer.setRenderTarget(previous); }
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (!this.supported) return;
    this.parent.remove(this.points);
    this.points.geometry.dispose(); this.points.material.dispose();
    this.targets.forEach(target => target.dispose()); this.targets = [];
    this.quad.geometry.dispose(); this.quad.material.dispose(); this.seeds.dispose();
  }
}
