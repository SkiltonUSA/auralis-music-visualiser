import * as THREE from "three";

// WebGL adaptation of Jack Purvis / EmperorJack's smokey-bbq GPU solver.
// Upstream: 1ededca35822aac614da71294c122c87e02143cd. See THIRD_PARTY_NOTICES.md.
// Packed state: velocity.xy (cells/second), density.z, temperature.w.
// RGB dye is advected separately, as in upstream's RGB Spectrum composition.
export const SMOKE_STEP = 1 / 30;
export const SMOKE_EMITTERS = 16;
export const hasSmoke = (mode) => [0, 5, 6, 10].includes(mode);
export const smokeComposition = (mode) => mode === 6 ? "wisps" : "circular";

export function smokeGrid(width, height, quality = "auto") {
  const edge = { auto: 192, high: 256, ultra: 320 }[quality] || 192;
  const aspect = Math.max(.25, Math.min(4, width / Math.max(1, height)));
  return aspect >= 1 ? [edge, Math.max(48, Math.round(edge / aspect))]
    : [Math.max(48, Math.round(edge * aspect)), edge];
}

// Shared by the native-inspired horizontal, circular and RGB compositions.
export function fillSmokeEmitters(emitters, forces, spectrum, audio, time, aspect, composition) {
  const circular = composition === "circular";
  const wisps = composition === "wisps";
  const bass = Math.min(1, Math.max(0, audio.bass || 0));
  const hit = audio.transient ? 1 : Math.min(1, Math.max(0, audio.beat || 0));
  for (let i = 0; i < SMOKE_EMITTERS; i++) {
    const f = i / (SMOKE_EMITTERS - 1);
    const band = circular || wisps ? (i % 8) / 7 : Math.abs(f * 2 - 1);
    const value = (spectrum[Math.round(band * (spectrum.length - 1))] || 0) / 255;
    const energy = Math.max(0, value - .035);
    if (wisps) {
      const lane = i % 8, side = i < 8 ? -1 : 1;
      const sweep = .45 + .55 * (.5 + .5 * Math.sin(time * 1.35 - lane * .72));
      const strength = energy * sweep;
      emitters[i].set(.5 + side * (.006 + lane * .006) / aspect,
        .49 + (lane - 3.5) * .007 + Math.sin(time * .65 + lane * .5) * .008,
        .017 + energy * .009, strength * (.55 + bass * .2 + hit * .1));
      forces[i].set(side * (40 + energy * 28) * strength,
        Math.sin(time * .65 + lane * .5) * 7 * strength, strength * .18, f);
      continue;
    }
    const angle = i / SMOKE_EMITTERS * Math.PI * 2 + time * .12;
    const radius = .13 + bass * .035;
    const x = circular ? .5 + Math.cos(angle) * radius / aspect : .09 + f * .82;
    const y = circular ? .48 + Math.sin(angle) * radius : .1 + Math.sin(time * .7 + i) * .012;
    emitters[i].set(x, y, .015 + energy * .02, energy * (1.3 + bass * .5 + hit * .7));
    const speed = (22 + energy * 38 + hit * 18) * energy;
    forces[i].set(
      (circular ? Math.cos(angle) : Math.sin(time * 1.8 + i * 2.4) * .42) * speed,
      (circular ? Math.sin(angle) : 1) * speed,
      energy * (2 + hit), f,
    );
  }
}

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position, 1.); }
`;
const shared = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uState, uSource, uCurl, uPressure, uDivergence;
  uniform vec2 uTexel;
  uniform float uDt, uAspect, uVorticity, uDye, uGridScale, uWisps;
  uniform vec4 uEmitters[16], uForces[16];
  vec2 bounded(vec2 uv) { return clamp(uv, uTexel * .5, 1. - uTexel * .5); }
  vec2 velocity(vec2 uv) {
    vec2 v = texture2D(uState, bounded(uv)).xy;
    if (uv.x < 0. || uv.x > 1.) v.x = -v.x;
    if (uv.y < 0. || uv.y > 1.) v.y = -v.y;
    return v;
  }
  float pressure(vec2 uv) { return texture2D(uPressure, bounded(uv)).r; }
  float curl(vec2 uv) { return texture2D(uCurl, bounded(uv)).r; }
`;
const shaders = {
  // Semi-Lagrangian midpoint backtrace, replacing upstream's four-tap
  // interpolation with hardware bilinear filtering and a backward midpoint.
  advect: /* glsl */ `
    void main() {
      vec2 v = velocity(vUv);
      vec2 mid = bounded(vUv - .5 * uDt * v * uTexel);
      vec2 trace = bounded(vUv - uDt * velocity(mid) * uTexel);
      vec4 value = texture2D(uSource, trace);
      vec4 decay = mix(vec4(.16, .16, .34, .85), vec4(.34), uDye);
      decay = mix(decay, mix(vec4(.3, .3, .95, 1.8), vec4(.95), uDye), uWisps);
      gl_FragColor = value * exp(-decay * uDt);
    }
  `,
  curl: /* glsl */ `
    void main() {
      float c = .5 * (velocity(vUv + vec2(uTexel.x, 0.)).y
        - velocity(vUv - vec2(uTexel.x, 0.)).y
        - velocity(vUv + vec2(0., uTexel.y)).x
        + velocity(vUv - vec2(0., uTexel.y)).x);
      gl_FragColor = vec4(c, 0., 0., 0.);
    }
  `,
  // Upstream applyBuoyancy + applyVorticityConfinement + applyImpulse,
  // batched into one ping-pong pass instead of many additive draw calls.
  forces: /* glsl */ `
    void main() {
      vec4 state = texture2D(uState, vUv);
      vec2 gradient = .5 * vec2(
        abs(curl(vUv + vec2(uTexel.x, 0.))) - abs(curl(vUv - vec2(uTexel.x, 0.))),
        abs(curl(vUv + vec2(0., uTexel.y))) - abs(curl(vUv - vec2(0., uTexel.y))));
      gradient /= max(length(gradient), .0001);
      vec2 confinement = vec2(gradient.y, -gradient.x) * curl(vUv) * uVorticity;
      state.xy += uDt * (confinement + vec2(0., state.w * 14. - state.z * 2.) * uGridScale * mix(1., .12, uWisps));
      for (int i = 0; i < 16; i++) {
        vec2 d = (vUv - uEmitters[i].xy) * vec2(uAspect, 1.);
        d.y *= mix(1., 2.4, uWisps);
        float weight = exp(-dot(d, d) / max(.00001, uEmitters[i].z * uEmitters[i].z));
        state.xy += uForces[i].xy * weight * uDt * 8. * uGridScale;
        state.zw += vec2(uEmitters[i].w, uForces[i].z) * weight * uDt * 3.;
      }
      state.xy = clamp(state.xy, vec2(-100. * uGridScale), vec2(100. * uGridScale));
      state.zw = clamp(state.zw, vec2(0.), vec2(6.));
      gl_FragColor = state;
    }
  `,
  divergence: /* glsl */ `
    void main() {
      float d = .5 * (velocity(vUv + vec2(uTexel.x, 0.)).x
        - velocity(vUv - vec2(uTexel.x, 0.)).x
        + velocity(vUv + vec2(0., uTexel.y)).y
        - velocity(vUv - vec2(0., uTexel.y)).y);
      gl_FragColor = vec4(d, 0., 0., 0.);
    }
  `,
  jacobi: /* glsl */ `
    void main() {
      float neighbours = pressure(vUv + vec2(uTexel.x, 0.)) + pressure(vUv - vec2(uTexel.x, 0.))
        + pressure(vUv + vec2(0., uTexel.y)) + pressure(vUv - vec2(0., uTexel.y));
      gl_FragColor = vec4((neighbours - texture2D(uDivergence, vUv).r) * .25, 0., 0., 0.);
    }
  `,
  project: /* glsl */ `
    void main() {
      vec4 state = texture2D(uState, vUv);
      state.xy -= .5 * vec2(
        pressure(vUv + vec2(uTexel.x, 0.)) - pressure(vUv - vec2(uTexel.x, 0.)),
        pressure(vUv + vec2(0., uTexel.y)) - pressure(vUv - vec2(0., uTexel.y)));
      if (vUv.x < uTexel.x || vUv.x > 1. - uTexel.x) state.x = 0.;
      if (vUv.y < uTexel.y || vUv.y > 1. - uTexel.y) state.y = 0.;
      gl_FragColor = state;
    }
  `,
  dye: /* glsl */ `
    void main() {
      vec3 color = texture2D(uSource, vUv).rgb;
      for (int i = 0; i < 16; i++) {
        vec2 d = (vUv - uEmitters[i].xy) * vec2(uAspect, 1.);
        d.y *= mix(1., 2.4, uWisps);
        float weight = exp(-dot(d, d) / max(.00001, uEmitters[i].z * uEmitters[i].z));
        vec3 tint = .52 + .48 * cos(6.28318 * (uForces[i].w + vec3(0., .33, .67)));
        color += tint * uEmitters[i].w * weight * uDt * 3.;
      }
      gl_FragColor = vec4(min(color, vec3(6.)), 1.);
    }
  `,
};

function target(width, height) {
  return new THREE.WebGLRenderTarget(width, height, {
    type: THREE.HalfFloatType, format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    depthBuffer: false, stencilBuffer: false,
  });
}
function swap(pair) { pair.reverse(); }

export class SmokeSimulation {
  constructor(renderer) {
    this.renderer = renderer;
    this.supported = renderer.extensions.has("EXT_color_buffer_float");
    this.empty = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat);
    this.empty.needsUpdate = true;
    this.targets = [];
    this.accumulator = 0;
    this.time = 0;
    this.active = false;
    this.composition = null;
    this.emitters = Array.from({ length: SMOKE_EMITTERS }, () => new THREE.Vector4());
    this.forces = Array.from({ length: SMOKE_EMITTERS }, () => new THREE.Vector4());
    this.uniforms = {
      uState: { value: this.empty }, uSource: { value: this.empty },
      uCurl: { value: this.empty }, uPressure: { value: this.empty }, uDivergence: { value: this.empty },
      uTexel: { value: new THREE.Vector2(1, 1) }, uDt: { value: SMOKE_STEP },
      uAspect: { value: 1 }, uVorticity: { value: 9 }, uDye: { value: 0 },
      uGridScale: { value: 1 },
      uWisps: { value: 0 },
      uEmitters: { value: this.emitters }, uForces: { value: this.forces },
    };
    this.materials = Object.fromEntries(Object.entries(shaders).map(([name, source]) => [name,
      new THREE.ShaderMaterial({ vertexShader, fragmentShader: shared + source, uniforms: this.uniforms,
        depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false }),
    ]));
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.materials.advect);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }
  get texture() { return this.state?.[0].texture || this.empty; }
  get dyeTexture() { return this.dye?.[0].texture || this.empty; }
  resize(width, height, quality) {
    if (!this.supported) return;
    this.iterations = { auto: 12, high: 18, ultra: 24 }[quality] || 12;
    const [w, h] = smokeGrid(width, height, quality);
    if (w === this.width && h === this.height) return;
    for (const buffer of this.targets) buffer.dispose();
    this.width = w; this.height = h;
    this.state = [target(w, h), target(w, h)];
    this.dye = [target(w, h), target(w, h)];
    this.pressure = [target(w, h), target(w, h)];
    this.curl = target(w, h); this.divergence = target(w, h);
    this.targets = [...this.state, ...this.dye, ...this.pressure, this.curl, this.divergence];
    this.uniforms.uTexel.value.set(1 / w, 1 / h);
    this.uniforms.uAspect.value = w / h;
    this.uniforms.uGridScale.value = h / 108;
    this.reset();
  }
  clear(buffers) {
    const previous = this.renderer.getRenderTarget();
    const color = this.renderer.getClearColor(new THREE.Color());
    const alpha = this.renderer.getClearAlpha();
    this.renderer.setClearColor(0, 0);
    for (const buffer of buffers) {
      this.renderer.setRenderTarget(buffer);
      this.renderer.clear();
    }
    this.renderer.setRenderTarget(previous);
    this.renderer.setClearColor(color, alpha);
  }
  reset() {
    this.clear(this.targets);
    this.accumulator = 0;
    this.time = 0;
  }
  pass(name, destination) {
    this.quad.material = this.materials[name];
    this.renderer.setRenderTarget(destination);
    this.renderer.render(this.scene, this.camera);
  }
  step(audio, spectrum, composition) {
    const u = this.uniforms;
    this.time += SMOKE_STEP;
    fillSmokeEmitters(this.emitters, this.forces, spectrum, audio, this.time, this.width / this.height, composition);
    u.uWisps.value = composition === "wisps" ? 1 : 0;
    u.uVorticity.value = composition === "wisps" ? 1.5 + (audio.mid || 0) * 2 : 7 + (audio.mid || 0) * 9;
    u.uDye.value = 0;
    u.uState.value = this.texture;
    u.uSource.value = this.texture;
    this.pass("advect", this.state[1]); swap(this.state);
    u.uState.value = this.texture;
    this.pass("curl", this.curl);
    u.uCurl.value = this.curl.texture;
    this.pass("forces", this.state[1]); swap(this.state);
    u.uState.value = this.texture;
    this.pass("divergence", this.divergence);
    u.uDivergence.value = this.divergence.texture;
    this.clear(this.pressure);
    for (let i = 0; i < this.iterations; i++) {
      u.uPressure.value = this.pressure[0].texture;
      this.pass("jacobi", this.pressure[1]); swap(this.pressure);
    }
    u.uPressure.value = this.pressure[0].texture;
    this.pass("project", this.state[1]); swap(this.state);
    u.uState.value = this.texture;
    u.uSource.value = this.dyeTexture;
    u.uDye.value = 1;
    this.pass("advect", this.dye[1]); swap(this.dye);
    u.uSource.value = this.dyeTexture;
    this.pass("dye", this.dye[1]); swap(this.dye);
  }
  update(audio, spectrum, delta, mode, previousMode, transition, paused) {
    if (!this.supported || !this.state || paused) return;
    const active = hasSmoke(mode) || (transition < 1 && hasSmoke(previousMode));
    if (!active) { this.active = false; this.accumulator = 0; return; }
    const sourceMode = hasSmoke(mode) ? mode : previousMode;
    const composition = smokeComposition(sourceMode);
    // Never carry a ring-shaped emission field into the landscape.
    if (!this.active || this.composition !== composition) this.reset();
    this.composition = composition;
    this.active = true;
    const previous = this.renderer.getRenderTarget();
    // Fixed 30 Hz; at most two steps after a slow frame/tab resume.
    this.accumulator = Math.min(SMOKE_STEP * 2, this.accumulator + Math.max(0, delta));
    while (this.accumulator + 1e-8 >= SMOKE_STEP) {
      this.step(audio, spectrum, composition);
      this.accumulator -= SMOKE_STEP;
    }
    this.renderer.setRenderTarget(previous);
  }
  dispose() {
    for (const buffer of this.targets) buffer.dispose();
    for (const material of Object.values(this.materials)) material.dispose();
    this.quad.geometry.dispose();
    this.empty.dispose();
  }
}
