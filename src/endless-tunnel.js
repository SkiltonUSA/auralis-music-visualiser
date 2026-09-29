import * as THREE from "three";

// Torus parameterization adapted from quakeboy/Endless-Tunnel-Rendering-OpenGLES
// RTunnel.cpp / RTunnel.h, commit 3c54aab1cc674c5cf4ce5c6877de8092fbfcc3b7 (MIT).
// Original notice retained:
// This source code is released by Quakeboy - http://qdevarena.blogspot.com
// prasna991@gmail.com
// You should not remove this comment notice... please :P
// See THIRD_PARTY_NOTICES.md for the full license.
export const TUNNEL_RADIUS = 32;
export const TUNNEL_WIDTH = 6.5;
const TAU = Math.PI * 2;

export function createTunnelGeometry(rings = 240, sides = 48) {
  if (!Number.isInteger(rings) || !Number.isInteger(sides) || rings < 3 || sides < 3) throw new RangeError("A tunnel needs at least three rings and sides");
  const positions = [], normals = [], uvs = [], indices = [];
  // Duplicate both UV seams rather than interpolate from 1 back to 0.
  for (let ring = 0; ring <= rings; ring++) {
    const u = ring / rings, angle = u * TAU;
    for (let side = 0; side <= sides; side++) {
      const v = side / sides, cross = v * TAU;
      const radial = TUNNEL_RADIUS + TUNNEL_WIDTH * Math.cos(cross);
      positions.push(radial * Math.cos(angle), TUNNEL_WIDTH * Math.sin(cross), radial * Math.sin(angle));
      normals.push(Math.cos(cross) * Math.cos(angle), Math.sin(cross), Math.cos(cross) * Math.sin(angle));
      uvs.push(u, v);
      if (ring < rings && side < sides) {
        const a = ring * (sides + 1) + side, b = a + 1, d = a + sides + 1, c = d + 1;
        indices.push(a, b, c, a, c, d);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

export function tunnelCenter(angle, out = new THREE.Vector3()) {
  return out.set(TUNNEL_RADIUS * Math.cos(angle), 0, TUNNEL_RADIUS * Math.sin(angle));
}

const vertexShader = /* glsl */ `
  uniform float uTime, uPulse;
  uniform float uTubeRotation;
  uniform float uChecker;
  uniform vec4 uAudio;
  uniform sampler2D uSpectrum;
  varying vec2 vUv;
  varying vec3 vView, vNormal;
  const float TAU = 6.28318530718;
  void main() {
    vUv = uv;
    float u = uv.x * TAU, v = uv.y * TAU;
    float band = texture2D(uSpectrum, vec2(.02 + abs(sin(v)) * .9, .5)).r;
    float wave = sin(v * 6. + u * 4. - uTime * .35);
    float breathe = uAudio.x * .35 + uPulse * .16;
    float detail = wave * (.08 + uAudio.y * .22) + band * .18;
    float pinch = cos(v * 4. + u * 2.) * (.16 + uAudio.y * .24) * uChecker;
    // Rotate the tube around its own curved centreline, not the camera.
    // UVs stay attached to the surface, so checker tiles, ribs and beat
    // flashes turn together while forward travel remains unchanged.
    float rolled = v + uTubeRotation;
    vec3 tubeNormal = vec3(cos(rolled) * cos(u), sin(rolled), cos(rolled) * sin(u));
    vec3 center = vec3(cos(u), 0., sin(u)) * ${TUNNEL_RADIUS.toFixed(1)};
    vec3 p = center + tubeNormal * (${TUNNEL_WIDTH.toFixed(1)} + breathe + detail + pinch);
    vec4 view = modelViewMatrix * vec4(p, 1.);
    vView = view.xyz; vNormal = normalMatrix * tubeNormal;
    gl_Position = projectionMatrix * view;
  }
`;
const fragmentShader = /* glsl */ `
  uniform float uTime, uPulse;
  uniform float uTileFlash;
  uniform float uChecker;
  uniform vec4 uAudio;
  uniform vec3 uA, uB, uC;
  uniform sampler2D uSpectrum;
  varying vec2 vUv;
  varying vec3 vView, vNormal;
  const float TAU = 6.28318530718;
  float stripe(float coordinate, float width) {
    float distance = abs(fract(coordinate + .5) - .5);
    return 1. - smoothstep(width, width + max(fwidth(coordinate), .001), distance);
  }
  void main() {
    float u = vUv.x * TAU, v = vUv.y * TAU;
    if (uChecker > .5) {
      // The checker coordinates live on the tube, not on a screen-space
      // membrane. Integer frequencies make both torus seams continuous.
      // Multiples of ten preserve checker parity and the five-tile pulse
      // pattern at both closed seams.
      float along = vUv.x * 60. + sin(v * 4. + u * 2. - uTime * .16) * (.3 + uAudio.y * .32);
      float around = vUv.y * 30. + sin(u * 3. + cos(v * 4.) * .3) * .22;
      float aaAlong = max(fwidth(along), .001);
      float aaAround = max(fwidth(around), .001);
      float a = smoothstep(-aaAlong, aaAlong, sin(along * 3.14159265));
      float b = smoothstep(-aaAround, aaAround, sin(around * 3.14159265));
      float checker = a * b + (1. - a) * (1. - b);
      float distance = length(vView);
      float facing = abs(dot(normalize(vNormal), normalize(-vView)));
      float nearLight = exp(-distance * .025) * (.35 + facing * .65);
      float band = texture2D(uSpectrum, vec2(.02 + abs(sin(v)) * .9, .5)).r;
      vec3 color = mix(uA * .012, uB * (.28 + nearLight * .52), checker);
      float rib = stripe(vUv.x * 32., .018);
      float seam = stripe(vUv.y * 12., .012);
      float detailFade = 1. - smoothstep(16., 42., distance);
      color += uC * rib * (.12 + uAudio.x * .23 + uPulse * .13);
      color += uB * seam * detailFade * (.06 + band * .18);
      color *= .72 + uAudio.w * .28;
      // One in five squares, staggered across rows. Sharing the checker's
      // warped coordinates keeps the flash attached to its tile.
      float fifthTile = 1. - step(.5, mod(floor(along) + floor(around), 5.));
      vec2 tileEdge = min(fract(vec2(along, around)), 1. - fract(vec2(along, around)));
      vec2 inset = smoothstep(vec2(0.), max(vec2(aaAlong, aaAround), vec2(.012)), tileEdge);
      float resolved = 1. - smoothstep(.25, .8, max(aaAlong, aaAround));
      float flash = fifthTile * inset.x * inset.y * resolved * uTileFlash;
      color += mix(uC, vec3(1.), .35) * flash * 1.6;
      color = mix(color, uA * .002, smoothstep(12., 48., distance));
      gl_FragColor = vec4(color, 1.);
      return;
    }
    // Integer angular frequencies keep the procedural plasma seamless.
    float drift = uTime * .16;
    float plasma = sin(u * 12. + sin(v * 5. + drift) * 1.8);
    plasma += sin(v * 8. - u * 9. - drift * .65);
    plasma += sin(u * 4. + v * 3. + sin(u * 7. - v * 2.) * 1.4 + drift);
    plasma = plasma / 6. + .5;
    float band = texture2D(uSpectrum, vec2(.02 + abs(sin(v)) * .9, .5)).r;
    float distance = length(vView);
    float facing = abs(dot(normalize(vNormal), normalize(-vView)));
    float lamp = (.24 + facing * .7) * exp(-distance * .032);
    vec3 pigment = mix(uA, uB, smoothstep(.15, .85, plasma));
    pigment = mix(pigment, uC, pow(plasma, 5.) * .5);
    vec3 color = pigment * (.075 + plasma * .24) * (lamp + .3);
    float rib = stripe(vUv.x * 64., .018);
    float twist = sin(u * 4.) * .28 + uTime * .008;
    float seam = stripe(vUv.y * 24. + twist, .014);
    float ringGlow = exp(-abs(fract(vUv.x * 64. + .5) - .5) * 36.) * .16;
    float filament = 1. - smoothstep(.018, .05 + fwidth(plasma), abs(plasma - .54));
    float farFade = 1. - smoothstep(18., 45., distance);
    color += mix(uB, uC, .35) * (rib * .85 + ringGlow) * (.65 + uAudio.x * .6 + uPulse * .25);
    color += uA * seam * (.22 + band * .6);
    color += pigment * filament * (.05 + uAudio.z * .22) * farFade;
    color = mix(color, vec3(.003, .001, .009), smoothstep(14., 48., distance));
    gl_FragColor = vec4(color, 1.);
  }
`;

const palettes = [
  [0x702bff, 0x09d6e8, 0xff4c91], [0xff473a, 0xffb34d, 0xa942ff],
  [0x12647c, 0x18efb6, 0x7075ff], [0xcc342c, 0xffa52c, 0xf252a1],
];
const checkerPalettes = [
  [0x124408, 0x73ff23, 0xbeff81], [0x531329, 0xff762b, 0xffcd68],
  [0x063944, 0x18edc5, 0x99eaff], [0x39102c, 0xf651a3, 0xffbe72],
];

export class CheckerBeatFlash {
  constructor() { this.value = 0; this.wasTransient = false; this.lastBeat = -1; }
  update(audio, delta) {
    const dt = Number.isFinite(delta) ? Math.max(0, Math.min(.05, delta)) : 0;
    if (!dt) return this.value;
    this.value *= Math.exp(-dt * 8);
    const newBeat = audio.transient && (!this.wasTransient ||
      (Number.isFinite(audio.beatCount) && audio.beatCount !== this.lastBeat));
    if (newBeat) {
      this.value = .75 + THREE.MathUtils.clamp(audio.bass || 0, 0, 1) * .25;
      this.lastBeat = audio.beatCount;
    }
    this.wasTransient = Boolean(audio.transient);
    return this.value;
  }
}

export class EndlessTunnel {
  constructor(scene, camera, spectrum, random, style = "plasma") {
    this.style = style;
    this.tileFlash = new CheckerBeatFlash();
    this.camera = camera; this.startAngle = random() * TAU;
    this.distance = 0; this.time = 0; this.speed = 4.8; this.pulse = 0;
    this.tubeRotation = 0;
    this.motionTime = 0; this.roll = 0; this.sway = 0; this.lift = 0; this.bank = 0;
    this.audio = new THREE.Vector4(0, 0, 0, 0); this.look = new THREE.Vector3();
    this.uniforms = { uTime: { value: 0 }, uTubeRotation: { value: 0 }, uPulse: { value: 0 }, uTileFlash: { value: 0 }, uChecker: { value: style === "checker" ? 1 : 0 }, uAudio: { value: this.audio },
      uSpectrum: { value: spectrum }, uA: { value: new THREE.Color() }, uB: { value: new THREE.Color() }, uC: { value: new THREE.Color() } };
    this.mesh = new THREE.Mesh(createTunnelGeometry(), new THREE.ShaderMaterial({
      vertexShader, fragmentShader, uniforms: this.uniforms, side: THREE.BackSide }));
    this.mesh.frustumCulled = false; scene.add(this.mesh);
    camera.fov = 88; camera.near = .08; camera.far = 120; camera.updateProjectionMatrix();
    this.update({}, 0, 0);
  }
  update(audio, delta, palette) {
    const dt = Math.max(0, Math.min(.05, delta)), ease = 1 - Math.exp(-dt * 3);
    [audio.bass || 0, audio.mid || 0, audio.high || 0, audio.level || 0].forEach((value, i) => {
      this.audio.setComponent(i, THREE.MathUtils.lerp(this.audio.getComponent(i), THREE.MathUtils.clamp(value, 0, 1), ease));
    });
    const targetSpeed = 4.8 + this.audio.w * 2.8 + this.audio.x * .8;
    this.speed += (targetSpeed - this.speed) * (1 - Math.exp(-dt * .85));
    this.distance += dt * this.speed; this.time += dt;
    if (dt > 0) {
      // Torus retains its gentle tube rotation. Plasma gets a stronger
      // corkscrew plus a separate, smooth flying-camera orientation.
      const spinSpeed = this.style === "checker" ? .16 + this.audio.w * .06 : .22 + this.audio.w * .10;
      this.tubeRotation = (this.tubeRotation + dt * spinSpeed) % TAU;
      if (this.style === "plasma") {
        this.motionTime += dt * (.75 + this.audio.w * .25);
        this.roll = (this.roll + dt * (.07 + this.audio.y * .025)) % TAU;
      }
    }
    this.uniforms.uTubeRotation.value = this.tubeRotation;
    this.pulse += (THREE.MathUtils.clamp(audio.beat || 0, 0, 1) - this.pulse) * (1 - Math.exp(-dt * 9));
    this.uniforms.uTime.value = this.time; this.uniforms.uPulse.value = this.pulse;
    this.uniforms.uTileFlash.value = this.style === "checker" ? this.tileFlash.update(audio, dt) : 0;
    const scheme = this.style === "checker" ? checkerPalettes : palettes;
    const colors = scheme[palette] || scheme[0];
    this.uniforms.uA.value.setHex(colors[0]); this.uniforms.uB.value.setHex(colors[1]); this.uniforms.uC.value.setHex(colors[2]);
    const angle = this.startAngle + THREE.MathUtils.euclideanModulo(this.distance / TUNNEL_RADIUS, TAU);
    tunnelCenter(angle, this.camera.position);
    tunnelCenter(angle + .12, this.look);
    if (this.style === "plasma") {
      // Stay well inside the tube: gently weave around its centreline while
      // looking upward and sweeping left/right. Integrated phase avoids
      // abrupt steering when a loud beat changes the audio level.
      const phase = this.motionTime;
      const offset = Math.sin(phase * .27) * .35;
      this.camera.position.x += Math.cos(angle) * offset;
      this.camera.position.z += Math.sin(angle) * offset;
      this.camera.position.y = Math.sin(phase * .21) * .22;
      this.sway = Math.sin(phase * .40) * .85;
      this.lift = .45 + Math.sin(phase * .31) * .35;
      this.look.x += Math.cos(angle) * this.sway;
      this.look.z += Math.sin(angle) * this.sway;
      this.look.y = this.camera.position.y + this.lift;
      this.bank = this.roll + Math.sin(phase * .32) * .22;
    }
    this.camera.up.set(0, 1, 0); this.camera.lookAt(this.look);
    if (this.style === "plasma") this.camera.rotateZ(this.bank);
  }
}
