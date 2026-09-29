import * as THREE from "three";

export class CrystalBeatGrowth {
  constructor() { this.growth = 0; this.drive = 0; this.wasTransient = false; this.lastBeat = -1; }
  update(audio, delta) {
    const dt = Math.max(0, Math.min(.05, delta));
    if (!dt) return this.growth;
    const newBeat = audio.transient && (!this.wasTransient || (Number.isFinite(audio.beatCount) && audio.beatCount !== this.lastBeat));
    if (newBeat) {
      this.drive = Math.max(this.drive, .7 + THREE.MathUtils.clamp(audio.bass || 0, 0, 1) * .5);
      this.lastBeat = audio.beatCount;
    }
    this.wasTransient = Boolean(audio.transient);
    // Exact attack/release filter: fast growth, gradual settling, no undershoot
    // and no size discontinuity when another beat arrives during a pulse.
    const attack = 25, release = 4.5;
    const rise = Math.exp(-attack * dt), decay = Math.exp(-release * dt);
    this.growth = this.growth * rise + this.drive * attack / (attack - release) * (decay - rise);
    this.drive *= decay;
    return this.growth;
  }
}

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }
`;
const fragmentShader = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime, uSeed, uOpacity;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
    return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + 1.), f.x), f.y);
  }
  float fbm(vec2 p) {
    float n = 0., amplitude = .5;
    for (int i = 0; i < 4; i++) { n += noise(p) * amplitude; p = mat2(.8, -.6, .6, .8) * p * 2.03 + 7.1; amplitude *= .5; }
    return n;
  }
  void main() {
    vec2 p = vUv * vec2(4.8, 2.3) + vec2(-uTime * .13, uTime * .035);
    vec2 curl = vec2(fbm(p + uSeed), fbm(p + 19.7));
    float density = smoothstep(.08, .56, fbm(p + curl * 2.4));
    float edge = 1. - smoothstep(.2, 1., length((vUv - .5) * vec2(2., 2.2)));
    float strands = .65 + .35 * noise(p * 2. + curl);
    // Neutral grey, normal alpha blending: a veil, not luminous coloured fog.
    gl_FragColor = vec4(vec3(.16 + density * .1), density * strands * edge * uOpacity);
  }
`;

export class CrystalSmokeVeils {
  constructor(scene, random) {
    this.random = random; this.time = 0; this.next = .8 + random() * 1.2;
    const geometry = new THREE.PlaneGeometry(1, 1);
    this.slots = Array.from({ length: 2 }, () => {
      const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader,
        uniforms: { uTime: { value: 0 }, uSeed: { value: 0 }, uOpacity: { value: 0 } },
        transparent: true, depthWrite: false, blending: THREE.NormalBlending });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.visible = false; mesh.renderOrder = 10; scene.add(mesh);
      return { mesh, age: 0, duration: 0, active: false };
    });
  }
  spawn(slot) {
    const random = this.random;
    slot.active = true; slot.age = 0; slot.duration = 7 + random() * 3;
    slot.direction = random() > .5 ? 1 : -1; slot.y = (random() - .5) * 2;
    slot.opacity = .72 + random() * .16;
    slot.mesh.position.z = 4.2;
    slot.mesh.scale.set(8 + random() * 2, 3.2 + random() * 1.2, 1);
    slot.mesh.rotation.z = (random() - .5) * .3;
    slot.mesh.material.uniforms.uSeed.value = random() * 100;
    slot.mesh.visible = true;
  }
  update(delta, level = 0) {
    const dt = Math.max(0, Math.min(.05, delta));
    if (!dt) return;
    this.time += dt;
    if (this.time >= this.next) {
      const slot = this.slots.find((candidate) => !candidate.active);
      if (slot) this.spawn(slot);
      this.next = this.time + 2.2 + this.random() * 2;
    }
    for (const slot of this.slots) {
      if (!slot.active) continue;
      slot.age += dt;
      const phase = Math.min(1, slot.age / slot.duration);
      const envelope = Math.sin(Math.PI * phase) ** 2;
      slot.mesh.position.x = slot.direction * (phase - .5) * 5;
      slot.mesh.position.y = slot.y + Math.sin(phase * Math.PI) * .25;
      slot.mesh.material.uniforms.uTime.value = this.time;
      slot.mesh.material.uniforms.uOpacity.value = envelope * slot.opacity * (.85 + THREE.MathUtils.clamp(level, 0, 1) * .15);
      if (phase === 1) { slot.active = false; slot.mesh.visible = false; }
    }
  }
}
