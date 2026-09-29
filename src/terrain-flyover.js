import * as THREE from "three";
import { FlyoverSmoke } from "./flyover-smoke.js";

// Chunk grid/skirt construction adapted from ZyFou/ProceduralTerrains (MIT),
// 96c094ef49dd4b2d1ff8c51c47ab1faa7c201ea7, ChunkGeometry.js.
// Copyright (c) 2026 ZyFou. Full notice: THIRD_PARTY_NOTICES.md.
// Terrain shading, audio response and automatic flight are local adaptations.
export const TERRAIN_CHUNK = 128;
export const FLYOVER_RADII = { auto: 4, high: 5, ultra: 6 };
export const FLYOVER_SPEED = { cruise: 37.5, musicBoost: 11.25 };
export const flightCenter = (z, phase) => Math.sin(z * .004 + phase) * 65 + Math.sin(z * .009 + phase * 1.7) * 22;
export const flightAltitude = z => 58 + Math.sin(z * .003) * 12;

export function createTerrainChunk(res) {
  if (!Number.isInteger(res) || res < 2) throw new RangeError("Terrain resolution must be at least two");
  const side = res + 1, count = side * side, ring = [], positions = [], skirts = [], indices = [];
  for (let z = 0; z <= res; z++) for (let x = 0; x <= res; x++) {
    positions.push(x / res * TERRAIN_CHUNK, 0, z / res * TERRAIN_CHUNK); skirts.push(0);
  }
  for (let x = 0; x < res; x++) ring.push(x);
  for (let z = 0; z < res; z++) ring.push(z * side + res);
  for (let x = res; x > 0; x--) ring.push(res * side + x);
  for (let z = res; z > 0; z--) ring.push(z * side);
  for (const src of ring) { positions.push(positions[src * 3], 0, positions[src * 3 + 2]); skirts.push(1); }
  for (let z = 0; z < res; z++) for (let x = 0; x < res; x++) {
    const a = z * side + x, b = a + 1, c = a + side, d = c + 1;
    indices.push(a, c, b, b, c, d);
  }
  ring.forEach((a, k) => {
    const next = (k + 1) % ring.length, b = ring[next];
    indices.push(a, count + k, b, b, count + k, count + next);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aSkirt", new THREE.Float32BufferAttribute(skirts, 1));
  geometry.setIndex(indices);
  return geometry;
}

export function terrainTiles(x, z, radius) {
  const cx = Math.floor(x / TERRAIN_CHUNK), cz = Math.floor(z / TERRAIN_CHUNK), tiles = [];
  for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
    const distance = Math.max(Math.abs(dx), Math.abs(dz));
    tiles.push({ x: (cx + dx) * TERRAIN_CHUNK, z: (cz + dz) * TERRAIN_CHUNK, lod: distance <= 1 ? 0 : distance <= 2 ? 1 : 2 });
  }
  return tiles;
}

const common = /* glsl */ `
  uniform float uTime, uPhase;
  uniform vec2 uSeed;
  uniform vec4 uAudio;
  uniform vec3 uLow, uRock, uSky;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 s = f * f * f * (f * (f * 6. - 15.) + 10.);
    return mix(mix(hash(i), hash(i + vec2(1., 0.)), s.x), mix(hash(i + vec2(0., 1.)), hash(i + 1.), s.x), s.y);
  }
  float fbm(vec2 p) {
    float value = 0., amplitude = .5;
    for (int i = 0; i < 4; i++) { value += noise(p) * amplitude; p = mat2(.8, -.6, .6, .8) * p * 2.03 + 7.1; amplitude *= .5; }
    return value;
  }
  float route(float z) { return sin(z * .004 + uPhase) * 65. + sin(z * .009 + uPhase * 1.7) * 22.; }
  float heightAt(vec2 xz) {
    vec2 p = xz * .009 + uSeed;
    float warp = noise(p * .55) * 1.6;
    float ridge = 1. - abs(noise(p + warp) * 2. - 1.);
    float mountain = pow(ridge, 2.6) * 65. + fbm(p * .75) * 25.;
    float valley = smoothstep(16., 110., abs(xz.x - route(xz.y)));
    return -4. + mountain * valley * (1. + uAudio.x * .18);
  }
  vec3 atmosphere(vec3 color, float distance) {
    float haze = 1. - exp(-distance * .0022);
    return mix(color, uSky, max(haze * .78, smoothstep(340., 485., distance)));
  }
`;
const terrainVertex = /* glsl */ `
  ${common}
  attribute float aSkirt;
  varying vec3 vWorld, vNormal;
  void main() {
    vec3 p = (instanceMatrix * vec4(position, 1.)).xyz;
    float h = heightAt(p.xz);
    vNormal = normalize(vec3(h - heightAt(p.xz + vec2(2., 0.)), 2., h - heightAt(p.xz + vec2(0., 2.))));
    p.y = h - aSkirt * 12.; vWorld = p;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.);
  }
`;
const terrainFragment = /* glsl */ `
  ${common}
  varying vec3 vWorld, vNormal;
  void main() {
    vec3 normal = normalize(vNormal);
    float distance = length(vWorld - cameraPosition);
    vec3 color = vec3(.009, .002, .024) + mix(uLow, uRock, normal.y) * .014;
    // World-locked, antialiased neon lattice: perspective motion comes from
    // the camera, so terrain recycling never slides or resets the grid.
    vec2 gridUv = vWorld.xz / 12.;
    vec2 edge = abs(fract(gridUv + .5) - .5);
    vec2 aa = max(fwidth(gridUv), vec2(.002));
    vec2 strokes = 1. - smoothstep(vec2(.012), vec2(.012) + aa, edge);
    float grid = max(strokes.x, strokes.y);
    float resolved = 1. - smoothstep(.25, .8, max(aa.x, aa.y));
    float glow = exp(-min(edge.x, edge.y) * 42.) * .15;
    color += uLow * (grid + glow) * resolved * (.7 + uAudio.x * .7);
    float contourUv = vWorld.y / 9.;
    float contour = abs(fract(contourUv + .5) - .5);
    float line = 1. - smoothstep(.014, .014 + max(fwidth(contourUv), .005), contour);
    color += uRock * line * (.14 + uAudio.z * .3) * (1. - smoothstep(150., 380., distance));
    float shore = exp(-abs(vWorld.y - .3) * 1.7);
    color += uRock * shore * (.48 + uAudio.y * .38);
    gl_FragColor = vec4(atmosphere(color, distance), 1.);
  }
`;
const worldVertex = /* glsl */ `
  varying vec3 vWorld;
  void main() { vec4 p = modelMatrix * vec4(position, 1.); vWorld = p.xyz; gl_Position = projectionMatrix * viewMatrix * p; }
`;
const waterFragment = /* glsl */ `
  ${common}
  varying vec3 vWorld;
  void main() {
    vec3 view = normalize(cameraPosition - vWorld);
    float ripple = sin(vWorld.x * .23 + uTime * .65) * sin(vWorld.z * .19 - uTime * .48);
    float fresnel = pow(1. - max(0., view.y), 3.);
    vec3 water = mix(vec3(.008, .002, .028), uSky * .85, fresnel);
    float glint = pow(max(0., sin(vWorld.z * .32 + ripple * 1.8 - uTime)), 18.);
    water += mix(uRock, uLow, ripple * .5 + .5) * glint * (.12 + uAudio.z * .22);
    vec2 gridUv = vWorld.xz / vec2(12., 18.);
    vec2 aa = max(fwidth(gridUv), vec2(.003));
    vec2 grid = 1. - smoothstep(vec2(.01), vec2(.01) + aa, abs(fract(gridUv + .5) - .5));
    water += uRock * max(grid.x, grid.y) * .22 * (1. - smoothstep(.25, .8, max(aa.x, aa.y)));
    float reflection = exp(-pow((vWorld.x - route(vWorld.z)) / 15., 2.));
    water += uLow * reflection * (.04 + glint * .15);
    gl_FragColor = vec4(atmosphere(water, length(vWorld - cameraPosition)), 1.);
  }
`;
const skyVertex = /* glsl */ `
  varying vec3 vDirection;
  void main() { vDirection = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }
`;
const skyFragment = /* glsl */ `
  ${common}
  varying vec3 vDirection;
  void main() {
    vec3 ray = normalize(vDirection);
    vec3 color = mix(uSky, vec3(.003, .001, .015), smoothstep(0., .7, ray.y));
    color += uLow * exp(-abs(ray.y - .015) * 13.) * .07;
    vec3 sun = normalize(vec3(.05, .12, -1.));
    float alignment = max(0., dot(ray, sun));
    vec3 sunRight = normalize(cross(sun, vec3(0., 1., 0.)));
    vec3 sunUp = normalize(cross(sunRight, sun));
    vec2 discUv = vec2(dot(ray, sunRight), dot(ray, sunUp)) / .17;
    float disc = (1. - smoothstep(.98, 1., length(discUv))) * step(.9, alignment);
    float stripe = smoothstep(.18, .24, fract((discUv.y + 1.) * 7.));
    stripe = mix(stripe, 1., smoothstep(.1, .45, discUv.y));
    vec3 sunset = mix(vec3(1.1, .015, .24), vec3(1.4, .7, .08), smoothstep(-.8, .8, discUv.y));
    color += sunset * disc * stripe * .8;
    color += uLow * pow(alignment, 36.) * .09;
    vec2 starUv = vec2(atan(ray.x, -ray.z), asin(clamp(ray.y, -1., 1.))) * 180.;
    float star = step(.993, hash(floor(starUv))) * (1. - smoothstep(.025, .12, length(fract(starUv) - .5)));
    color += vec3(.4, .65, 1.) * star * smoothstep(.15, .3, ray.y);
    // Keep projection continuous near the horizon; clamping its denominator
    // to a flat value stretches clouds into vertical curtains.
    vec2 cloudUv = ray.xz / (.18 + max(0., ray.y)) * 2.4 + uSeed + vec2(uTime * .014, 0.);
    float cloud = smoothstep(.48, .76, fbm(cloudUv));
    cloud *= smoothstep(.04, .26, ray.y);
    color = mix(color, uSky * .8 + uLow * .025, cloud * .42 * (1. - disc));
    gl_FragColor = vec4(color, 1.);
  }
`;

const palettes = [
  [0xff279e, 0x19eaff, 0x351047], [0xff5937, 0xffc450, 0x3b103e],
  [0x25e6cb, 0x6583ff, 0x102e45], [0xfa397e, 0xffa743, 0x38132b],
];

export class TerrainFlyover {
  constructor(scene, camera, random) {
    this.camera = camera; this.phase = random() * Math.PI * 2;
    this.travel = 0; this.time = 0; this.speed = FLYOVER_SPEED.cruise; this.quality = "auto"; this.chunkKey = "";
    this.audio = new THREE.Vector4(0, 0, 0, 0); this.look = new THREE.Vector3(); this.matrix = new THREE.Matrix4();
    this.uniforms = { uTime: { value: 0 }, uPhase: { value: this.phase }, uSeed: { value: new THREE.Vector2(random() * 80, random() * 80) },
      uAudio: { value: this.audio }, uLow: { value: new THREE.Color() }, uRock: { value: new THREE.Color() }, uSky: { value: new THREE.Color() } };
    this.material = new THREE.ShaderMaterial({ vertexShader: terrainVertex, fragmentShader: terrainFragment, uniforms: this.uniforms });
    this.batches = [48, 24, 12].map(res => {
      const mesh = new THREE.InstancedMesh(createTerrainChunk(res), this.material, 169);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; scene.add(mesh); return mesh;
    });
    const waterGeometry = new THREE.PlaneGeometry(1900, 1900); waterGeometry.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(waterGeometry, new THREE.ShaderMaterial({ vertexShader: worldVertex, fragmentShader: waterFragment, uniforms: this.uniforms }));
    scene.add(this.water);
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1400, 32, 16), new THREE.ShaderMaterial({ vertexShader: skyVertex, fragmentShader: skyFragment,
      uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false }));
    this.sky.renderOrder = -1; this.sky.frustumCulled = false; scene.add(this.sky);
    this.smoke = new FlyoverSmoke(scene, this.uniforms, random, z => flightCenter(z, this.phase));
    camera.fov = 68; camera.near = .2; camera.far = 1700; camera.updateProjectionMatrix();
    this.update({}, 0, 0);
  }
  setQuality(quality) { if (quality !== this.quality) { this.quality = quality; this.chunkKey = ""; this.recycle(); } }
  recycle() {
    const p = this.camera.position;
    const key = `${Math.floor(p.x / TERRAIN_CHUNK)},${Math.floor(p.z / TERRAIN_CHUNK)}`;
    if (key === this.chunkKey) return;
    this.chunkKey = key;
    const counts = [0, 0, 0];
    for (const tile of terrainTiles(p.x, p.z, FLYOVER_RADII[this.quality] || 4)) {
      this.matrix.makeTranslation(tile.x, 0, tile.z);
      this.batches[tile.lod].setMatrixAt(counts[tile.lod]++, this.matrix);
    }
    this.batches.forEach((batch, i) => { batch.count = counts[i]; batch.instanceMatrix.needsUpdate = true; });
    this.water.position.set(Math.floor(p.x / TERRAIN_CHUNK) * TERRAIN_CHUNK, 0, Math.floor(p.z / TERRAIN_CHUNK) * TERRAIN_CHUNK);
  }
  update(audio, delta, palette) {
    const dt = Math.max(0, Math.min(.05, Number.isFinite(delta) ? delta : 0));
    const ease = 1 - Math.exp(-dt * 1.6);
    [audio.bass || 0, audio.mid || 0, audio.high || 0, audio.level || 0].forEach((v, i) => this.audio.setComponent(i,
      THREE.MathUtils.lerp(this.audio.getComponent(i), THREE.MathUtils.clamp(v, 0, 1), ease)));
    this.speed += (FLYOVER_SPEED.cruise + this.audio.w * FLYOVER_SPEED.musicBoost - this.speed) * (1 - Math.exp(-dt * .7));
    this.travel += this.speed * dt; this.time += dt; this.uniforms.uTime.value = this.time;
    const colors = palettes[palette] || palettes[0];
    this.uniforms.uLow.value.setHex(colors[0]); this.uniforms.uRock.value.setHex(colors[1]); this.uniforms.uSky.value.setHex(colors[2]);
    const z = -this.travel;
    this.camera.position.set(flightCenter(z, this.phase), flightAltitude(z), z);
    this.look.set(flightCenter(z - 70, this.phase), flightAltitude(z - 70) - 18, z - 70);
    this.camera.up.set(0, 1, 0); this.camera.lookAt(this.look);
    this.sky.position.copy(this.camera.position); this.recycle();
    this.smoke.update(this.travel, this.audio.w);
  }
}
