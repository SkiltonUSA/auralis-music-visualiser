import * as THREE from "three";
import { DarkMatterScope, darkMatterScopeGLSL } from './dark-matter-scope.js';

// Adapted from the user's Dark Matter volumetric shader (September 2026).
// Render through Auralis; no additional canvas, remote imports or GUI.
export const DARK_MATTER_MODE = 17;
export const DARK_MATTER_QUALITY = {
  auto: { edge: 640, steps: 32 },
  high: { edge: 900, steps: 48 },
  ultra: { edge: 1200, steps: 64 },
};
export const DARK_MATTER_PALETTES = [
  [0xff941a, 0x4b70b9, 0xcc0000, 0xfff957], // Supplied amber / blue palette.
  [0xff6c20, 0xbc255c, 0x4e075c, 0xffe296],
  [0x36ffe0, 0x377cfa, 0x181e7c, 0xcbfff2],
  [0xff4b16, 0xded5c8, 0x680b15, 0xffdc83],
];
const clamp = value => Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0, 1) : 0;

export class DarkMatterMotion {
  constructor() {
    this.time = 0; this.rotation = 0; this.audio = new THREE.Vector4();
    this.drive = 0; this.pulse = 0; this.sinceBeat = 10;
    this.wasTransient = false; this.lastBeat = -1; this.emissions = 0;
  }
  update(audio, delta) {
    const dt = Number.isFinite(delta) ? THREE.MathUtils.clamp(delta, 0, .05) : 0;
    if (!dt) return;
    const ease = 1 - Math.exp(-dt * 3), bass = clamp(audio.bass), mid = clamp(audio.mid);
    const integral = (old, target) => target * dt + (old - target) * ease / 3;
    // Integrated velocities, not elapsed-time multiplication by live audio.
    this.rotation = (this.rotation + .25 * dt + .12 * integral(this.audio.x, bass)) % (Math.PI * 2);
    this.time += 1.1 * dt + .25 * integral(this.audio.y, mid);
    [audio.bass, audio.mid, audio.high, audio.level].forEach((value, i) => {
      this.audio.setComponent(i, THREE.MathUtils.lerp(this.audio.getComponent(i), clamp(value), ease));
    });
    const onset = audio.transient && (!this.wasTransient ||
      (Number.isFinite(audio.beatCount) && audio.beatCount !== this.lastBeat));
    if (onset) {
      this.drive = Math.max(this.drive, .65 + bass * .35);
      this.sinceBeat = 0; this.lastBeat = audio.beatCount; this.emissions++;
    }
    this.wasTransient = Boolean(audio.transient);
    this.sinceBeat = Math.min(10, this.sinceBeat + dt);
    const attack = Math.exp(-20 * dt), release = Math.exp(-4.5 * dt);
    this.pulse = this.pulse * attack + this.drive * 20 / 15.5 * (release - attack);
    this.drive *= release;
  }
}

const vertexShader = /* glsl */ `
  void main() { gl_Position = vec4(position.xy, 0., 1.); }
`;
const fragmentShader = /* glsl */ `
  precision highp float;
  uniform vec2 uResolution;
  uniform float uTime, uRotation, uPulse, uBeatRadius;
  uniform vec4 uAudio;
  uniform vec3 uOuter, uMid, uDeep, uCore;
  uniform int uSteps;
  ${darkMatterScopeGLSL}
  float hash(vec3 p) {
    p = fract(p * .3183099 + .1); p *= 17.;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise3D(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
                   mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                   mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float value = 0., amplitude = .5;
    for (int i = 0; i < 3; i++) { value += amplitude * noise3D(p); p = p * 3.5 + 100.; amplitude *= .5; }
    return value;
  }
  float fbmFast(vec3 p) {
    float value = 0., amplitude = .4;
    for (int i = 0; i < 2; i++) { value += amplitude * noise3D(p); p = p * 2. + 100.; amplitude *= -.1; }
    return value;
  }
  vec2 volumeInterval(vec3 origin, vec3 ray) {
    // Intersect the whole bounded volume. Changing quality changes sampling
    // density, never the far-side coverage (the reference stopped too early).
    vec3 directionSign = mix(vec3(-1.), vec3(1.), step(vec3(0.), ray));
    vec3 inverseRay = directionSign / max(abs(ray), vec3(.000001));
    vec3 a = (vec3(-3., -1.2, -3.) - origin) * inverseRay;
    vec3 b = (vec3(3., 1.2, 3.) - origin) * inverseRay;
    vec3 nearPoint = min(a, b), farPoint = max(a, b);
    return vec2(max(0., max(nearPoint.x, max(nearPoint.y, nearPoint.z))),
      min(farPoint.x, min(farPoint.y, farPoint.z)));
  }
  void main() {
    vec2 resolution = max(uResolution, vec2(1.));
    vec3 scope=darkMatterScope(gl_FragCoord.xy/resolution);
    vec2 uv = (gl_FragCoord.xy - .5 * resolution) / resolution.y;
    vec3 origin = vec3(0., 1.9, -4.9), target = vec3(0., -.3, 0.);
    #ifdef DISTANT_BACKGROUND
    // Fixed right-side composition: a farther virtual viewpoint gives the
    // cloud distance and perspective without inheriting tunnel camera motion.
    uv -= vec2(resolution.x / resolution.y * .27, .06);
    origin = vec3(0., 3.8, -9.8);
    #endif
    vec3 forward = normalize(target - origin);
    vec3 right = normalize(cross(forward, vec3(0,1,0)));
    vec3 up = normalize(cross(right, forward));
    // Keep the disc framed on a narrow portrait screen as well as landscape.
    float focal = 1.5 * min(1., resolution.x / resolution.y);
    vec3 ray = mat3(right, up, forward) * normalize(vec3(uv, focal));
    vec2 interval = volumeInterval(origin, ray);
    if (interval.y <= interval.x) { gl_FragColor = vec4(scope,1.); return; }
    float stepSize = (interval.y - interval.x) / float(uSteps);
    float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715))));
    float distanceAlongRay = interval.x + jitter * stepSize;
    vec3 color = vec3(0.);
    float transmittance = 1.;
    for (int i = 0; i < 64; i++) {
      if (i >= uSteps || transmittance < .01) break;
      vec3 p = origin + ray * distanceAlongRay;
      float r = length(p.xz);
      if (r <= 3.) {
        float angle = atan(p.z, p.x) - uRotation - 2.5 / (r + .5);
        vec3 sp = vec3(cos(angle) * r, p.y * 2., sin(angle) * r);
        vec3 q = vec3(fbmFast(sp + uTime * .2),
          fbmFast(sp + vec3(1., -uTime * .15, 1.)),
          fbmFast(sp + vec3(2., 2., uTime * .1)));
        float n = fbm((sp + q) * (1.5 + uAudio.y * .12));
        float mask = (1. - smoothstep(.5, 2.5, r)) * (1. - smoothstep(.1, 1., abs(p.y)));
        float density = smoothstep(.3, .8, n) * mask * (2.8 + uAudio.x * .5 + uPulse * .2);
        if (density > .01) {
          vec3 tint = mix(uDeep, uOuter, smoothstep(.2, .7, n));
          tint = mix(tint, uMid, smoothstep(.5, 1.5, r + q.x * .5));
          tint = mix(uCore, tint, smoothstep(.1, .5, r));
          tint += vec3(.5) * smoothstep(.6, .9, n);
          float wave = exp(-pow((r - uBeatRadius) * 7., 2.)) * uPulse;
          tint *= 1. + uAudio.z * .18 + wave * .45;
          float alpha = 1. - exp(-density * stepSize * 5.);
          color += transmittance * alpha * tint * 2.;
          transmittance *= 1. - alpha;
        }
      }
      distanceAlongRay += stepSize;
    }
    // Preserve the reference's dark core as positive absorption, not negative
    // emission (which otherwise feeds invalid negative colours into bloom).
    float closest = max(0., -dot(origin, ray));
    float coreDistance = length(origin + ray * closest);
    float absorption = .125 / (coreDistance * coreDistance + .01);
    absorption *= 1. - smoothstep(0., 1.5, coreDistance);
    color *= exp(-absorption);
    #ifdef DISTANT_BACKGROUND
    // Subdued distant light leaves the bright tunnel strips in front.
    color *= .48;
    #endif
    // Integration already includes alpha. Do not apply opacity a second time.
    // Shared post-processing handles exposure/tone mapping, once, in linear HDR.
    gl_FragColor = vec4(clamp(color, vec3(0.), vec3(4.)) + scope, 1.);
  }
`;

export class DarkMatterScene {
  constructor(scene, { distantBackground = false } = {}) {
    this.distantBackground = distantBackground;
    this.scope = distantBackground ? null : new DarkMatterScope();
    this.motion = new DarkMatterMotion();
    if (distantBackground) this.motion.audio.set(0, 0, 0, 0);
    this.uniforms = {
      uResolution: { value: new THREE.Vector2(2, 2) },
      uTime: { value: 0 }, uRotation: { value: 0 }, uPulse: { value: 0 }, uBeatRadius: { value: 20 },
      uAudio: { value: this.motion.audio }, uSteps: { value: DARK_MATTER_QUALITY.auto.steps },
      uOuter: { value: new THREE.Color() }, uMid: { value: new THREE.Color() },
      uDeep: { value: new THREE.Color() }, uCore: { value: new THREE.Color() },
      uScopeWaveform: { value: this.scope?.texture ?? null },
    };
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([-1,-1,0, 3,-1,0, -1,3,0], 3));
    this.material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: this.uniforms,
      defines: distantBackground ? { DISTANT_BACKGROUND: 1 } : {},
      depthTest: false, depthWrite: false, blending: THREE.NoBlending });
    this.mesh = new THREE.Mesh(geometry, this.material); this.mesh.frustumCulled = false; scene.add(this.mesh);
    if (distantBackground) this.mesh.renderOrder = -1000;
    this.update({}, 0, 0);
  }
  resize(width, height, quality) {
    this.uniforms.uResolution.value.set(Math.max(2, width), Math.max(2, height));
    this.uniforms.uSteps.value = (DARK_MATTER_QUALITY[quality] || DARK_MATTER_QUALITY.auto).steps;
    if (this.distantBackground) this.uniforms.uSteps.value /= 2;
  }
  update(audio, delta, palette) {
    // The right-side background is deliberately static, including its audio
    // envelope/noise. Standalone Dark Matter retains full music response.
    if (!this.distantBackground) this.motion.update(audio, delta);
    this.scope?.update(audio.waveform, delta);
    this.uniforms.uTime.value = this.motion.time;
    this.uniforms.uRotation.value = this.motion.rotation;
    this.uniforms.uPulse.value = this.motion.pulse;
    this.uniforms.uBeatRadius.value = .25 + this.motion.sinceBeat * 2.2;
    const colors = DARK_MATTER_PALETTES[palette] || DARK_MATTER_PALETTES[0];
    ["uOuter", "uMid", "uDeep", "uCore"].forEach((key, i) => this.uniforms[key].value.setHex(colors[i]));
  }
  // The procedural-world owner releases the mesh's material and geometry.
  dispose() { this.scope?.dispose(); }
}
