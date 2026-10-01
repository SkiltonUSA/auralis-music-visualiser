import * as THREE from "three";

// Adapted from the user's standalone Aura shader (September 2026). Keep the
// warped distance field and black-cutoff glow, using Auralis's renderer/audio
// instead of a second canvas, CDN imports, GUI or global colour-space changes.
export const AURA_MODE = 16;
export const AURA_QUALITY = {
  auto: { edge: 900, steps: 44 },
  high: { edge: 1200, steps: 50 },
  ultra: { edge: 1600, steps: 60 },
};
const clamp = value => Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0, 1) : 0;

export const horizonAuraGLSL = /* glsl */ `
  vec3 horizonAura(vec2 p, float baseline, float foreground) {
    // Reserve the approaching wave floor and mask the skyline/peak markers.
    float sky = smoothstep(baseline + .015, baseline + .18, p.y);
    float coverage = sky * (1. - clamp(foreground, 0., 1.));
    return texture2D(uHorizonAura, vUv).rgb * .42 * coverage;
  }
`;

export class AuraMotion {
  constructor() {
    this.time = 0; this.audio = new THREE.Vector4();
    this.drive = 0; this.pulse = 0; this.lastBeat = -1; this.wasTransient = false; this.emissions = 0;
  }
  update(audio, delta) {
    const dt = Number.isFinite(delta) ? THREE.MathUtils.clamp(delta, 0, .05) : 0;
    if (!dt) return;
    const decay = Math.exp(-dt * 3), level = clamp(audio.level);
    // Integrate the eased speed: no camera jumps on onsets or frame-rate changes.
    this.time += .65 * dt + .18 * (level * dt + (this.audio.w - level) * (1 - decay) / 3);
    [audio.bass, audio.mid, audio.high, audio.level].forEach((value, i) => {
      this.audio.setComponent(i, THREE.MathUtils.lerp(this.audio.getComponent(i), clamp(value), 1 - decay));
    });
    const onset = audio.transient && (!this.wasTransient ||
      (Number.isFinite(audio.beatCount) && audio.beatCount !== this.lastBeat));
    if (onset) {
      this.drive = Math.max(this.drive, .65 + clamp(audio.bass) * .35);
      this.lastBeat = audio.beatCount; this.emissions++;
    }
    this.wasTransient = Boolean(audio.transient);
    const attack = 20, release = 4.5;
    const rise = Math.exp(-attack * dt), fall = Math.exp(-release * dt);
    this.pulse = this.pulse * rise + this.drive * attack / (attack - release) * (fall - rise);
    this.drive *= fall;
  }
}

const vertexShader = /* glsl */ `
  void main() { gl_Position = vec4(position.xy, 0., 1.); }
`;
const fragmentShader = /* glsl */ `
  precision highp float;
  uniform vec2 uResolution;
  uniform float uTime, uPulse, uPalette;
  uniform vec4 uAudio;
  uniform int uRaySteps;
  float gradientNoise(vec2 p) {
    return fract(52.9829189 * fract(dot(p, vec2(.06711056, .00583715))));
  }
  vec3 auraColor(float iteration) {
    // Preserve the supplied spectrum in the default palette.
    vec3 original = max(vec3(0.), .9 + sin(iteration * 1.3 - vec3(4.8, -.4, 1.2)));
    float blend = .5 + .5 * sin(iteration * 1.3);
    vec3 ember = mix(vec3(1.8, .2, .04), vec3(1.5, .6, .45), blend);
    vec3 aqua = mix(vec3(.04, .7, 1.8), vec3(.18, 1.8, .9), blend);
    vec3 signal = mix(vec3(1.9, .18, .02), vec3(1.65, 1.5, 1.2), blend);
    return uPalette < .5 ? original : uPalette < 1.5 ? ember : uPalette < 2.5 ? aqua : signal;
  }
  void main() {
    vec2 resolution = max(uResolution, vec2(1.));
    vec2 screen = (2. * gl_FragCoord.xy - resolution) / resolution.y;
    float warpMask = mix(.18 + uAudio.y * .10, 1., smoothstep(0., .57, length(screen)));
    screen.y /= 1.84 + uAudio.x * .12;
    vec3 ray = normalize(vec3(screen, .09));
    vec3 color = vec3(0.);
    float rayDistance = .45;
    float lineWidth = .0086 + uAudio.x * .0018 + uPulse * .001;
    float backgroundGlow = 1. / (.093 * .093 + .0001);
    // The supplied loop starts at 20, so 50 means 30 distance-field samples.
    // Compile-time bounds keep costs predictable on WebGL drivers.
    for (int stepIndex = 20; stepIndex < 60; stepIndex++) {
      if (stepIndex >= uRaySteps) break;
      float iteration = float(stepIndex) + 2.;
      vec3 position = rayDistance * ray;
      float phase = uTime + iteration - rayDistance;
      for (int warpIndex = 1; warpIndex <= 7; warpIndex++) {
        float frequency = float(warpIndex);
        float amplitude = .52 * warpMask * pow(frequency, -2.32);
        position += amplitude * sin(position.yzx * (frequency * (2.42 + uAudio.y * .12)) + phase) - .12;
      }
      vec4 field = vec4(abs(position.y + position.z * .20), sin(position - rayDistance) / 3.99);
      float distanceStep = max(length(field) / (4.73 + rayDistance * rayDistance * .14), .0097);
      float glowDistance = max(distanceStep - lineWidth, 0.);
      float glow = max(1. / (glowDistance * glowDistance + .0001) - backgroundGlow, 0.);
      color += auraColor(iteration) * glow / max(rayDistance, .45);
      rayDistance += distanceStep;
    }
    color *= (1. + uAudio.z * .12 + uPulse * .10) / 2000.;
    vec3 e = exp(2. * clamp(color, vec3(0.), vec3(10.)));
    color = (e - 1.) / (e + 1.);
    float dither = gradientNoise(gl_FragCoord.xy) + gradientNoise(gl_FragCoord.xy + vec2(47.3, 13.9)) - 1.;
    color += clamp(color * 255., 0., 1.) * dither * 1.6 / 255.;
    // The standalone shader writes display colours directly. Decode them for
    // Auralis's linear HDR pipeline so its final gamma pass doesn't wash out
    // the folds. Keep a little headroom for the shared bloom.
    gl_FragColor = vec4(pow(clamp(color, 0., 1.), vec3(2.2)) * .9, 1.);
  }
`;

export class AuraScene {
  constructor(scene) {
    this.motion = new AuraMotion();
    this.uniforms = {
      uResolution: { value: new THREE.Vector2(2, 2) },
      uTime: { value: 0 }, uPulse: { value: 0 }, uPalette: { value: 0 },
      uAudio: { value: this.motion.audio }, uRaySteps: { value: AURA_QUALITY.auto.steps },
    };
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: this.uniforms,
      depthTest: false, depthWrite: false, blending: THREE.NoBlending });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  resize(width, height, quality) {
    this.uniforms.uResolution.value.set(Math.max(2, width), Math.max(2, height));
    this.uniforms.uRaySteps.value = (AURA_QUALITY[quality] || AURA_QUALITY.auto).steps;
  }
  update(audio, delta, palette) {
    this.motion.update(audio, delta);
    this.uniforms.uTime.value = this.motion.time;
    this.uniforms.uPulse.value = this.motion.pulse;
    this.uniforms.uPalette.value = Number.isInteger(palette) && palette >= 0 && palette < 4 ? palette : 0;
  }
  // Geometry and material are owned/disposed by ProceduralScenes's traversal.
}
