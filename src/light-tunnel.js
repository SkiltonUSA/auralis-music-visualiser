import * as THREE from "three";
import { DarkMatterScene } from "./dark-matter.js";

// Adapted from the user's September 2026 light-strip tunnel example.
// Uses Auralis's renderer, linear HDR bloom and lifecycle, not a second composer.
export const LIGHT_TUNNEL_MODE = 18;
export const LIGHT_TUNNEL_QUALITY = {
  auto: { ribbons: 90, stars: 3200, sparks: 700 },
  high: { ribbons: 120, stars: 5200, sparks: 1100 },
  ultra: { ribbons: 150, stars: 7400, sparks: 1500 },
};
export const LIGHT_TUNNEL_PALETTES = [
  [0xff8a00, 0xfff0be, 0xff5ea8, 0x2c7fff],
  [0xff5522, 0xffcf83, 0xef397c, 0x8d36dd],
  [0x25ffc0, 0xd5fff4, 0x19b9dd, 0x4162ff],
  [0xff481c, 0xffecd4, 0xebbb93, 0xad2717],
];
const TAU = Math.PI * 2, SEGMENTS = 620, RIBBONS = 150;
const level = v => Number.isFinite(v) ? THREE.MathUtils.clamp(v, 0, 1) : 0;
function randomSource(seed) {
  return () => {
    let v = seed += 0x6d2b79f5;
    v = Math.imul(v ^ v >>> 15, v | 1); v ^= v + Math.imul(v ^ v >>> 7, v | 61);
    return ((v ^ v >>> 14) >>> 0) / 4294967296;
  };
}

export function createLightPath() {
  const points = Array.from({ length: 18 }, (_, i) => {
    const a = i / 18 * TAU, r = 72 + Math.sin(a * 3) * 12 + Math.cos(a * 5) * 5;
    return new THREE.Vector3(Math.cos(a) * r, Math.sin(a * 2) * 16 + Math.cos(a * 4) * 4, Math.sin(a) * r);
  });
  const path = new THREE.CatmullRomCurve3(points, true, "centripetal", .45);
  path.arcLengthDivisions = 3000;
  return path;
}

export class LightTunnelMotion {
  constructor(length) {
    this.length = length; this.progress = .018; this.time = 0;
    this.audio = new THREE.Vector4(); this.wasTransient = false; this.lastBeat = -1;
    this.pulses = Array.from({ length: 8 }, () => new THREE.Vector2(0, 10));
    this.nextPulse = 0; this.emissions = 0;
  }
  update(audio, delta) {
    const dt = Number.isFinite(delta) ? THREE.MathUtils.clamp(delta, 0, .05) : 0;
    if (!dt) return 0;
    const ease = 1 - Math.exp(-3 * dt);
    const integral = (old, target) => target * dt + (old - target) * ease / 3;
    const bass = level(audio.bass), mid = level(audio.mid);
    const travel = 30 * dt + 8 * integral(this.audio.x, bass) + 4 * integral(this.audio.y, mid);
    const onset = audio.transient && (!this.wasTransient ||
      (Number.isFinite(audio.beatCount) && audio.beatCount !== this.lastBeat));
    if (onset) {
      this.pulses[this.nextPulse].set((this.progress + 100 / this.length) % 1, 0);
      this.nextPulse = (this.nextPulse + 1) % this.pulses.length;
      this.emissions++; this.lastBeat = audio.beatCount;
    }
    this.wasTransient = Boolean(audio.transient);
    for (const pulse of this.pulses) pulse.y = Math.min(10, pulse.y + dt);
    this.progress = (this.progress + travel / this.length) % 1; this.time += dt;
    [audio.bass, audio.mid, audio.high, audio.level].forEach((v, i) => {
      this.audio.setComponent(i, THREE.MathUtils.lerp(this.audio.getComponent(i), level(v), ease));
    });
    return dt;
  }
}

const vertexShader = /* glsl */ `
  attribute float aSide, aPath, aPhase, aColor, aBoost;
  varying float vSide, vPath, vPhase, vColor, vBoost, vDepth;
  void main() {
    vSide=aSide; vPath=aPath; vPhase=aPhase; vColor=aColor; vBoost=aBoost;
    vec4 view = modelViewMatrix * vec4(position, 1.);
    vDepth = -view.z;
    gl_Position = projectionMatrix * view;
  }
`;
const fragmentShader = /* glsl */ `
  uniform float uTime, uLength;
  uniform vec4 uAudio;
  uniform vec3 uColors[4];
  uniform vec2 uPulses[8];
  varying float vSide, vPath, vPhase, vColor, vBoost, vDepth;
  void main() {
    float core = pow(max(0., 1.-abs(vSide)), 2.2);
    float halo = pow(max(0., 1.-abs(vSide)), .48);
    // Integer harmonics make both brightness fields continuous at the loop seam.
    float fine = .82 + .18*sin(vPath*6.2831853*231.-uTime*3.92+vPhase);
    float longPulse = .78 + .22*sin(vPath*6.2831853*13.-uTime*1.176+vPhase*.37);
    float wave = 0.;
    for(int i=0;i<8;i++) {
      float age=uPulses[i].y;
      float front=uPulses[i].x-age*70./uLength;
      float distanceToFront=abs(fract(vPath-front+.5)-.5)*uLength;
      wave=max(wave, exp(-distanceToFront*distanceToFront*.055)*(1.-smoothstep(.85,1.5,age)));
    }
    vec3 tint=uColors[0]; float band=uAudio.x;
    if(vColor> .5){tint=uColors[1];band=uAudio.y;}
    if(vColor>1.5){tint=uColors[2];band=uAudio.z;}
    if(vColor>2.5){tint=uColors[3];band=uAudio.w;}
    float energy=mix(.22,1.,core)*fine*longPulse;
    float alpha=(halo*.24+core*.78)*(.74+energy*.26);
    // Fade distant overlapping turns, retaining the stars through the open side.
    alpha *= 1.-smoothstep(75.,180.,vDepth);
    vec3 color=tint*vBoost*(.55+band*.38)*(.5+energy*1.35+wave*1.3);
    gl_FragColor=vec4(color,alpha);
  }
`;

export class LightTunnel {
  constructor(scene, camera) {
    this.camera = camera; this.path = createLightPath();
    this.frames = this.path.computeFrenetFrames(SEGMENTS, true);
    // Numerical endpoint tangents can leave a visible slit in a closed strip.
    for (const axis of ["normals", "binormals", "tangents"]) this.frames[axis][SEGMENTS].copy(this.frames[axis][0]);
    this.samples = Array.from({ length: SEGMENTS + 1 }, (_, i) => this.path.getPointAt(i / SEGMENTS));
    this.motion = new LightTunnelMotion(this.path.getLength());
    this.uniforms = { uTime: { value: 0 }, uLength: { value: this.motion.length },
      uAudio: { value: this.motion.audio }, uPulses: { value: this.motion.pulses },
      uColors: { value: LIGHT_TUNNEL_PALETTES[0].map(c => new THREE.Color(c)) } };
    this.material = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader, fragmentShader,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(this.createRibbons(), this.material);
    this.mesh.frustumCulled = false; scene.add(this.mesh);
    this.stars = this.createPoints(false); this.sparks = this.createPoints(true);
    scene.add(this.stars, this.sparks);
    this.background = new DarkMatterScene(scene, { distantBackground: true });
    camera.near = .06; camera.far = 1800; camera.fov = 91.1; camera.updateProjectionMatrix();
    scene.background = new THREE.Color(0x020105);
    this.normal = new THREE.Vector3(); this.binormal = new THREE.Vector3();
    this.tangent = new THREE.Vector3(); this.lookTarget = new THREE.Vector3();
    this.lookMatrix = new THREE.Matrix4(); this.orientation = new THREE.Quaternion();
    this.ready = false; this.updateCamera(0);
  }
  createRibbons() {
    const random = randomSource(9137), positions = [], sides = [], paths = [], phases = [], colors = [], boosts = [], indices = [];
    const radial = new THREE.Vector3(), lateral = new THREE.Vector3(), point = new THREE.Vector3();
    const gap = THREE.MathUtils.degToRad(57);
    for (let lane = 0; lane < RIBBONS; lane++) {
      // Coprime permutation distributes every quality prefix around the full arc.
      const angleBase = gap / 2 + ((lane * 97 % RIBBONS) + .32 + random() * .36) / RIBBONS * (TAU - gap);
      const radius = 14.4 * (.84 + random() * .32), width = .16 * (.35 + random() ** 1.7 * 2.65);
      const amplitude = (random() - .5) * .16, frequency = 1 + Math.floor(random() * 4);
      const phase = random() * TAU, pulse = random() * 30, color = Math.floor(random() * 4), boost = .72 + random() * .55;
      for (let j = 0; j <= SEGMENTS; j++) {
        const u = j / SEGMENTS, angle = angleBase + Math.sin(u * TAU * frequency + phase) * amplitude;
        radial.copy(this.frames.binormals[j]).multiplyScalar(Math.cos(angle)).addScaledVector(this.frames.normals[j], Math.sin(angle));
        lateral.copy(this.frames.binormals[j]).multiplyScalar(-Math.sin(angle)).addScaledVector(this.frames.normals[j], Math.cos(angle));
        const r = radius * (1 + Math.sin(u * TAU * (2 + frequency) + phase) * .015);
        for (const side of [-1, 1]) {
          point.copy(this.samples[j]).addScaledVector(radial, r).addScaledVector(lateral, width * .5 * side);
          positions.push(point.x, point.y, point.z); sides.push(side); paths.push(u); phases.push(pulse); colors.push(color); boosts.push(boost);
        }
        if (j < SEGMENTS) { const a = (lane * (SEGMENTS + 1) + j) * 2; indices.push(a, a + 2, a + 1, a + 2, a + 3, a + 1); }
      }
    }
    const geometry = new THREE.BufferGeometry();
    for (const [name, values, size] of [["position", positions, 3], ["aSide", sides, 1], ["aPath", paths, 1], ["aPhase", phases, 1], ["aColor", colors, 1], ["aBoost", boosts, 1]]) {
      geometry.setAttribute(name, new THREE.Float32BufferAttribute(values, size));
    }
    geometry.setIndex(indices); geometry.computeBoundingSphere(); return geometry;
  }
  createPoints(sparks) {
    const random = randomSource(sparks ? 4412 : 7821), positions = [], sizes = [], phases = [];
    const point = new THREE.Vector3();
    for (let i = 0; i < (sparks ? 1500 : 7400); i++) {
      if (sparks) {
        const j = Math.floor(random() * SEGMENTS), angle = random() * TAU, radius = 14.4 * (.12 + random() ** .48 * .75);
        point.copy(this.samples[j]).addScaledVector(this.frames.binormals[j], Math.cos(angle) * radius).addScaledVector(this.frames.normals[j], Math.sin(angle) * radius);
      } else {
        const z = random() * 2 - 1, angle = random() * TAU, r = 260 + random() ** .42 * 850;
        point.set(Math.cos(angle) * Math.sqrt(1-z*z)*r, z*r, Math.sin(angle)*Math.sqrt(1-z*z)*r);
      }
      positions.push(point.x, point.y, point.z); sizes.push(sparks ? .35 + random() * .3 : .45 + random() ** 4 * 3.9); phases.push(random() * TAU);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("aSize", new THREE.Float32BufferAttribute(sizes, 1));
    geometry.setAttribute("aPhase", new THREE.Float32BufferAttribute(phases, 1));
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: sparks ? this.uniforms.uTime : { value: 0 },
        uAudio: sparks ? this.uniforms.uAudio : { value: new THREE.Vector4(0, 0, 0, 0) },
        uScale: { value: 1 }, uBrightness: { value: sparks ? .55 : .83 } },
      vertexShader: `attribute float aSize,aPhase; uniform float uTime,uScale; varying float vTwinkle;
        void main(){vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;
          gl_PointSize=clamp(aSize*uScale*620./max(80.,-p.z),.7,5.5*uScale);
          vTwinkle=.72+.28*sin(uTime*1.5+aPhase);}`,
      fragmentShader: `uniform float uBrightness; uniform vec4 uAudio; varying float vTwinkle;
        void main(){float core=1.-smoothstep(0.,.5,length(gl_PointCoord-.5));
          float sparkle=pow(core,3.)+pow(core,12.)*1.8;
          gl_FragColor=vec4(vec3(uBrightness*vTwinkle*sparkle*(1.+uAudio.z*.3)),core);}`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const points = new THREE.Points(geometry, material); points.frustumCulled = false; return points;
  }
  resize(width, height, quality) {
    this.background.resize(width, height, quality);
    const settings = LIGHT_TUNNEL_QUALITY[quality] || LIGHT_TUNNEL_QUALITY.auto;
    this.mesh.geometry.setDrawRange(0, settings.ribbons * SEGMENTS * 6);
    this.stars.geometry.setDrawRange(0, settings.stars); this.sparks.geometry.setDrawRange(0, settings.sparks);
    for (const points of [this.stars, this.sparks]) points.material.uniforms.uScale.value = Math.max(.5, height / 800);
  }
  updateCamera(dt) {
    if (!dt && this.ready) return;
    const u = this.motion.progress, index = u * SEGMENTS, a = Math.floor(index), b = Math.min(SEGMENTS, a + 1);
    this.path.getTangentAt(u, this.tangent).normalize();
    this.normal.copy(this.frames.normals[a]).lerp(this.frames.normals[b], index - a);
    this.normal.addScaledVector(this.tangent, -this.normal.dot(this.tangent)).normalize();
    this.binormal.crossVectors(this.tangent, this.normal).normalize();
    this.path.getPointAt(u, this.camera.position);
    this.path.getPointAt((u + 7.2 / this.motion.length) % 1, this.lookTarget);
    this.lookMatrix.lookAt(this.camera.position, this.lookTarget, this.normal);
    this.orientation.setFromRotationMatrix(this.lookMatrix);
    if (!this.ready) this.camera.quaternion.copy(this.orientation);
    else this.camera.quaternion.slerp(this.orientation, 1 - Math.exp(-4.2 * dt));
    // Fixed far-field stars: only the foreground tunnel/sparks travel.
    this.stars.position.copy(this.camera.position);
    this.stars.quaternion.copy(this.camera.quaternion);
    this.ready = true;
  }
  update(audio, delta, palette) {
    const dt = this.motion.update(audio, delta);
    this.uniforms.uTime.value = this.motion.time;
    const colors = LIGHT_TUNNEL_PALETTES[palette] || LIGHT_TUNNEL_PALETTES[0];
    this.uniforms.uColors.value.forEach((color, i) => color.setHex(colors[i]));
    this.updateCamera(dt);
    this.background.update(audio, dt, palette);
  }
  // Shared ProceduralScenes traversal owns all geometry/material/target disposal.
}
