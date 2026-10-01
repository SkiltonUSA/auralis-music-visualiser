import * as THREE from "three";
import { CrystalBeatGrowth, CrystalSmokeVeils } from "./crystal-atmosphere.js";
import { NeonRoad } from "./neon-road.js";
import { EndlessTunnel } from "./endless-tunnel.js";
import { TerrainFlyover } from "./terrain-flyover.js";
import { CrystalSpirit } from "./crystal-spirit.js";
import { CrystalFacetRipples } from "./crystal-facet-ripples.js";
import { CrystalWaveFloor } from "./crystal-wave-floor.js";
import { CrystalTempoSpin } from "./crystal-tempo-spin.js";
import { createCrystalEnvironment } from "./crystal-studio.js";
import { AuraScene, AURA_MODE, AURA_QUALITY } from "./aura-scene.js";
import { DarkMatterScene, DARK_MATTER_MODE, DARK_MATTER_QUALITY } from "./dark-matter.js";
import { LightTunnel, LIGHT_TUNNEL_MODE } from "./light-tunnel.js";
import { FractalLotusScene, FRACTAL_LOTUS_MODE, FRACTAL_LOTUS_QUALITY } from "./fractal-lotus.js";
import { VoxelTunnelScene, VOXEL_TUNNEL_MODE, VOXEL_TUNNEL_QUALITY } from "./voxel-tunnel.js";
import { MagneticSilkScene, MAGNETIC_SILK_MODE, MAGNETIC_SILK_QUALITY } from "./magnetic-silk.js";
import { CyberTunnel, CYBER_TUNNEL_MODE, CYBER_TUNNEL_QUALITY } from "./cyber-tunnel.js";
import { Ferrofluid, FERROFLUID_MODE } from "./ferrofluid.js";
import { NeonMarchScene, NEON_MARCH_MODE, NEON_MARCH_QUALITY } from "./neon-march.js";
import { NeonCity, NEON_CITY_MODE } from "./neon-city.js";
import { addCrystalEdgeAttributes, createNeonCrystalMaterial, updateNeonCrystalMaterial, CRYSTAL_NEON_PALETTES } from "./neon-crystals.js";

// Crystal facets/materials and aurora fold-light equations adapted from
// GeometryPainterThreeJS (MIT), 79c7556ab8c5d7bcf92fa92d7fc8063db298b5e1.
// Automatic seeded formations and audio-driven animation replace painted strokes.
// Horizon's entry renders its Aura backdrop only; its skyline/floor remain in
// VisualEngine. Separate entries keep Horizon and standalone Aura independent.
export const PROCEDURAL_MODES = [4, 8, 11, 12, 14, AURA_MODE, DARK_MATTER_MODE, LIGHT_TUNNEL_MODE, FRACTAL_LOTUS_MODE, VOXEL_TUNNEL_MODE, MAGNETIC_SILK_MODE, CYBER_TUNNEL_MODE, FERROFLUID_MODE, NEON_MARCH_MODE, NEON_CITY_MODE];
export const isProceduralMode = (mode) => PROCEDURAL_MODES.includes(mode);
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createCrystalGeometry(seed = 42) {
  const random = seededRandom(seed), lower = [], upper = [], positions = [];
  const radius = .19 + random() * .08, shaft = .6 + random() * .15, taper = .8 + random() * .12;
  const apex = new THREE.Vector3((random() - .5) * .14, 1, (random() - .5) * .14);
  for (let i = 0; i < 6; i++) {
    const angle = (i + (random() - .5) * .25) / 6 * Math.PI * 2;
    const r = radius * (.85 + random() * .3);
    lower.push(new THREE.Vector3(Math.cos(angle) * r, 0, Math.sin(angle) * r));
    upper.push(new THREE.Vector3(Math.cos(angle) * r * taper, shaft, Math.sin(angle) * r * taper));
  }
  const push = (...vertices) => vertices.forEach((v) => positions.push(v.x, v.y, v.z));
  const bottom = new THREE.Vector3(0, -.02, 0);
  for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6;
    push(lower[i], upper[i], upper[j]); push(lower[i], upper[j], lower[j]);
    push(upper[i], apex, upper[j]); push(lower[j], bottom, lower[i]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export const CRYSTAL_VARIANTS = 5;
export function createCrystalCoreGeometry() {
  // Smooth radial normals with evenly sized triangles for the ripple fronts.
  return new THREE.IcosahedronGeometry(1.67, 8);
}

export function createCrystalLayout(seed, clusters = 64, coreGeometry = null) {
  const random = seededRandom(seed), layout = [];
  const up = new THREE.Vector3(0, 1, 0);
  const geometry = coreGeometry || createCrystalCoreGeometry();
  const surface = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  const ray = new THREE.Raycaster(), radial = new THREE.Vector3();
  const rippleOrigin = new THREE.Vector3(.3, .8, .55).normalize();
  for (let i = 0; i < clusters; i++) {
    const y = random() * 2 - 1, angle = random() * Math.PI * 2;
    const n = new THREE.Vector3(Math.sqrt(1 - y * y) * Math.cos(angle), y, Math.sqrt(1 - y * y) * Math.sin(angle));
    const tangent = new THREE.Vector3().crossVectors(Math.abs(y) > .9 ? new THREE.Vector3(1, 0, 0) : up, n).normalize();
    const bitangent = new THREE.Vector3().crossVectors(n, tangent);
    for (let shard = 0; shard < 5; shard++) {
      const theta = random() * Math.PI * 2, spread = shard ? .12 + random() * .16 : 0;
      const position = n.clone().multiplyScalar(1.67).addScaledVector(tangent, Math.cos(theta) * spread).addScaledVector(bitangent, Math.sin(theta) * spread);
      radial.copy(position).normalize();
      ray.set(radial.clone().multiplyScalar(4), radial.clone().negate());
      const hit = ray.intersectObject(surface, false)[0];
      // Project onto the actual mesh once, then embed the foot. Tangential
      // offsets must not leave satellite shards floating above the surface.
      position.copy(hit.point).addScaledVector(radial, -.035);
      const direction = radial.clone().addScaledVector(tangent, Math.cos(theta) * (shard ? .28 : .08)).addScaledVector(bitangent, Math.sin(theta) * (shard ? .28 : .08)).normalize();
      layout.push({ position, rotation: new THREE.Quaternion().setFromUnitVectors(up, direction),
        height: shard ? .26 + random() * .5 : .8 + random() * .65,
        width: .7 + random() * .5, band: Math.floor(random() * 220),
        birth: random() * 2.2, phase: random() * Math.PI * 2, hue: random(),
        variant: (i + shard) % CRYSTAL_VARIANTS, arc: Math.acos(THREE.MathUtils.clamp(radial.dot(rippleOrigin), -1, 1)), growth: 0 });
    }
  }
  surface.material.dispose();
  if (!coreGeometry) geometry.dispose();
  return layout;
}

export function createAuroraGeometry(seed, layer) {
  const random = seededRandom(seed), phase = random() * Math.PI * 2;
  const geometry = new THREE.PlaneGeometry(20, 1, 150, 18);
  const position = geometry.attributes.position, uv = geometry.attributes.uv;
  for (let i = 0; i < position.count; i++) {
    const x = (uv.getX(i) - .5) * 20;
    position.setXYZ(i, x, -.8 + Math.sin(x * .35 + phase) * .55 + Math.cos(x * .62 + phase) * .2,
      -layer * 3.8 - 2.5 + Math.sin(x * .4 + phase) * 3.1 + Math.cos(x * .63 + phase) * .65);
  }
  position.needsUpdate = true;
  return geometry;
}

const auroraVertex = /* glsl */ `
  uniform float uTime, uPhase, uHeight;
  uniform vec4 uAudio;
  uniform sampler2D uSpectrum;
  varying vec2 vUv;
  varying float vFold;
  void main() {
    vUv = uv;
    float d = uv.x * 12.;
    float band = texture2D(uSpectrum, vec2(.02 + uv.x * .85, .5)).r;
    float foldPhase = d * 6.3 + uTime * 1.1 + uPhase;
    float breath = .8 + .2 * sin(uTime * .23 + uPhase);
    float amp = (.35 + uAudio.y * .9) * .45 * pow(uv.y, 1.35) * breath;
    float sway = sin(foldPhase) + .5 * sin(d * 11.7 - uTime * .7 + uv.y * 1.8 + uPhase);
    float ripple = sin(d * 23. + uTime * 1.9 + uv.y * 4. + uPhase) * .025 * uv.y;
    vec3 p = position;
    p.y += uv.y * uHeight * (.7 + uAudio.x * .3 + band * .6) + ripple * .4;
    p.y += sin(d * .7 + uTime * .3 + uPhase) * (.14 + uAudio.y * .18);
    p.z += amp * sway + ripple + sin(d * .8 + uTime * .24) * .35;
    vFold = foldPhase;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
  }
`;
const auroraFragment = /* glsl */ `
  uniform float uTime, uDim;
  uniform vec4 uAudio;
  uniform vec3 uHem, uMid, uTop;
  varying vec2 vUv;
  varying float vFold;
  void main() {
    float folds = pow(abs(cos(vFold)), 1.6) * .85 + .4;
    float ray = .5 + .5 * sin(vUv.x * 432. + sin(uTime * .45) * 1.6 + vUv.y * 2.2);
    float rays = mix(1., pow(ray, 2.4) * 1.7 + .25, .65 + uAudio.z * .2);
    float hem = 1. + (1. - smoothstep(0., .22, vUv.y)) * 1.3;
    vec3 color = mix(uHem, uMid, smoothstep(.03, .45, vUv.y));
    color = mix(color, uTop, smoothstep(.45, .95, vUv.y));
    float ends = smoothstep(0., .07, min(vUv.x, 1. - vUv.x));
    float feather = .88 + .12 * sin(vUv.x * 204. + vUv.y * 9. + uTime * .8);
    float alpha = pow(1. - vUv.y, 1.15) * smoothstep(0., .025, vUv.y) * ends * feather * .7;
    gl_FragColor = vec4(color * folds * rays * hem * uDim * (.35 + uAudio.w * .7 + uAudio.z * .15), alpha);
  }
`;

const palettes = [
  [0x83ffd1, 0x408cfa, 0xbb62ff], [0xffcf78, 0xff6666, 0x862cc4],
  [0x7affc5, 0x22bfcf, 0x355eec], [0xffc987, 0xf55a20, 0xa885b8],
];

export function addAuroraCurtains(scene, audio, spectrum, seed, backdrop = false) {
  const curtains = [], materials = [];
  for (let path = 0; path < 3; path++) {
    const geometry = createAuroraGeometry(seed + path, path);
    for (let sheet = 0; sheet < 2; sheet++) {
      const uniforms = { uTime: { value: 0 }, uPhase: { value: path * 1.1 + sheet * 1.7 },
        uHeight: { value: (sheet ? 3.4 : 4.6) + path * .7 },
        uDim: { value: (sheet ? .45 : .8) * (backdrop ? .75 : 1) },
        uAudio: { value: audio }, uSpectrum: { value: spectrum },
        uHem: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uTop: { value: new THREE.Color() } };
      const material = new THREE.ShaderMaterial({ vertexShader: auroraVertex, fragmentShader: auroraFragment,
        uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      const mesh = new THREE.Mesh(geometry, material); mesh.frustumCulled = false;
      if (backdrop) {
        // Same depth buffer as the crystals: light stays behind their silhouette.
        // Leave room for the full shader displacement, not only base vertices.
        mesh.position.set(0, -2.4, -10);
        mesh.scale.set(1.8, 1.4, 1);
      }
      scene.add(mesh); curtains.push(mesh); materials.push(material);
    }
  }
  return { curtains, materials };
}

function stars(seed) {
  const random = seededRandom(seed), positions = [], colors = [];
  for (let i = 0; i < 900; i++) {
    positions.push((random() - .5) * 80, (random() - .4) * 45, -10 - random() * 35);
    const light = .25 + random() * .6;
    colors.push(light * .7, light * .8, light);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return new THREE.Points(geometry, new THREE.PointsMaterial({ size: .045, vertexColors: true, transparent: true, opacity: .7, depthWrite: false }));
}

export class ProceduralScenes {
  constructor(renderer, spectrum, seed = Math.floor(Math.random() * 0xffffffff)) {
    this.renderer = renderer; this.spectrum = spectrum; this.seed = seed;
    this.entries = new Map(); this.width = 2; this.height = 2; this.quality = "auto";
    this.empty = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this.empty.needsUpdate = true;
    this.matrix = new THREE.Matrix4(); this.scale = new THREE.Vector3(); this.color = new THREE.Color();
  }
  texture(mode) { return this.entries.get(mode)?.target.texture || this.empty; }
  create(mode) {
    // Keep Neon Road's existing seeded look after removing standalone Aurora.
    const seed = this.seed ^ ((mode === 12 ? 13 : mode) * 311);
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x01020a);
    const camera = new THREE.PerspectiveCamera(48, 1, .1, 100);
    const target = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthBuffer: true, stencilBuffer: false });
    const entry = { scene, camera, target, time: 0, age: 0, audio: new THREE.Vector4(), palette: -1, rendered: false };
    if (mode === NEON_CITY_MODE) {
      entry.neonCity = new NeonCity(scene, camera, seed);
      this.entries.set(mode, entry); this.sizeEntry(entry);
      return entry;
    }
    if (mode === NEON_MARCH_MODE) {
      entry.neonMarch = new NeonMarchScene(scene);
      this.entries.set(mode, entry); this.sizeEntry(entry);
      return entry;
    }
    if (mode === FERROFLUID_MODE) {
      entry.ferrofluid = new Ferrofluid(scene, camera);
      this.entries.set(mode, entry); this.sizeEntry(entry);
      return entry;
    }
    if (mode === CYBER_TUNNEL_MODE) {
      entry.cyberTunnel = new CyberTunnel(scene, camera, this.renderer.domElement);
      this.entries.set(mode, entry); this.sizeEntry(entry);
      return entry;
    }
    if (mode === MAGNETIC_SILK_MODE) {
      entry.magneticSilk = new MagneticSilkScene(scene);
      this.entries.set(mode, entry); this.sizeEntry(entry);
      return entry;
    }
    if (mode === VOXEL_TUNNEL_MODE) {
      entry.voxelTunnel = new VoxelTunnelScene(scene);
      this.entries.set(mode, entry); this.sizeEntry(entry);
      return entry;
    }
    if (mode === FRACTAL_LOTUS_MODE) {
      entry.fractalLotus = new FractalLotusScene(scene);
      this.entries.set(mode, entry); this.sizeEntry(entry);
      return entry;
    }
    if (mode === LIGHT_TUNNEL_MODE) {
      entry.lightTunnel = new LightTunnel(scene, camera);
      this.entries.set(mode, entry); this.sizeEntry(entry);
      return entry;
    }
    if (mode === DARK_MATTER_MODE) {
      entry.darkMatter = new DarkMatterScene(scene);
      this.entries.set(mode, entry); this.sizeEntry(entry);
      return entry;
    }
    if (mode === 8 || mode === AURA_MODE) {
      entry.aura = new AuraScene(scene);
      this.entries.set(mode, entry); this.sizeEntry(entry);
      return entry;
    }
    if (mode === 14) {
      entry.flyover = new TerrainFlyover(scene, camera, seededRandom(seed));
      this.entries.set(mode, entry); this.sizeEntry(entry);
      return entry;
    }
    if (mode === 12) {
      entry.road = new NeonRoad(scene, camera, this.spectrum, seededRandom(seed));
      this.entries.set(mode, entry); this.sizeEntry(entry);
      return entry;
    }
    if (mode === 4) {
      entry.tunnel = new EndlessTunnel(scene, camera, this.spectrum, seededRandom(seed), "checker");
      this.entries.set(mode, entry); this.sizeEntry(entry);
      return entry;
    }
    scene.add(stars(seed));
    if (mode === 11) {
      entry.crystalSpectrum = new Uint8Array(256);
      entry.waveFloor = new CrystalWaveFloor(scene);
      entry.anchor = new THREE.Group(); scene.add(entry.anchor);
      entry.facetRipples = new CrystalFacetRipples();
      entry.environment = createCrystalEnvironment();
      scene.environment = entry.environment;
      entry.coreMaterial = createNeonCrystalMaterial(entry.audio, true, entry.facetRipples);
      const core = new THREE.Mesh(addCrystalEdgeAttributes(createCrystalCoreGeometry()), entry.coreMaterial);
      entry.anchor.add(core);
      entry.layout = createCrystalLayout(seed, 64, core.geometry);
      entry.material = createNeonCrystalMaterial(entry.audio, false, entry.facetRipples);
      entry.crystalBatches = Array.from({ length: CRYSTAL_VARIANTS }, (_, variant) => {
        const indices = entry.layout.flatMap((crystal, i) => crystal.variant === variant ? [i] : []);
        const mesh = new THREE.InstancedMesh(addCrystalEdgeAttributes(createCrystalGeometry(seed + variant * 971), true), entry.material, indices.length);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false;
        entry.anchor.add(mesh);
        return { mesh, indices };
      });
      entry.crystals = entry.crystalBatches[0].mesh;
      entry.beatGrowth = new CrystalBeatGrowth();
      entry.tempoSpin = new CrystalTempoSpin();
      entry.smokeVeils = new CrystalSmokeVeils(scene, seededRandom(seed ^ 0x5a17));
      entry.spirit = new CrystalSpirit(this.renderer, scene, seededRandom(seed ^ 0x771a));
    }
    Object.assign(entry, addAuroraCurtains(scene, entry.audio, this.spectrum, seed, true));
    this.entries.set(mode, entry); this.sizeEntry(entry);
    return entry;
  }
  sizeEntry(entry) {
    entry.flyover?.setQuality(this.quality);
    entry.cyberTunnel?.setQuality(this.quality);
    const cap = entry.neonMarch ? (NEON_MARCH_QUALITY[this.quality] || NEON_MARCH_QUALITY.auto).edge
      : entry.aura ? (AURA_QUALITY[this.quality] || AURA_QUALITY.auto).edge
      : entry.darkMatter ? (DARK_MATTER_QUALITY[this.quality] || DARK_MATTER_QUALITY.auto).edge
      : entry.fractalLotus ? (FRACTAL_LOTUS_QUALITY[this.quality] || FRACTAL_LOTUS_QUALITY.auto).edge
      : entry.voxelTunnel ? (VOXEL_TUNNEL_QUALITY[this.quality] || VOXEL_TUNNEL_QUALITY.auto).edge
      : entry.magneticSilk ? (MAGNETIC_SILK_QUALITY[this.quality] || MAGNETIC_SILK_QUALITY.auto).edge
      : entry.cyberTunnel ? (CYBER_TUNNEL_QUALITY[this.quality] || CYBER_TUNNEL_QUALITY.auto).edge
      : { auto: 1000, high: 1400, ultra: 1800 }[this.quality] || 1000;
    const ratio = Math.min(1, cap / Math.max(this.width, this.height));
    entry.target.setSize(Math.max(2, Math.round(this.width * ratio)), Math.max(2, Math.round(this.height * ratio)));
    entry.aura?.resize(entry.target.width, entry.target.height, this.quality);
    entry.darkMatter?.resize(entry.target.width, entry.target.height, this.quality);
    entry.lightTunnel?.resize(entry.target.width, entry.target.height, this.quality);
    entry.ferrofluid?.resize(entry.target.width, entry.target.height, this.quality);
    entry.neonMarch?.resize(entry.target.width, entry.target.height);
    entry.neonCity?.resize(entry.target.width, entry.target.height, this.quality);
    entry.fractalLotus?.resize(entry.target.width, entry.target.height, this.quality);
    entry.voxelTunnel?.resize(entry.target.width, entry.target.height, this.quality);
    entry.magneticSilk?.resize(entry.target.width, entry.target.height, this.quality);
    entry.spirit?.setQuality(this.quality, entry.target.height);
    entry.waveFloor?.resize(entry.target.width, entry.target.height);
    entry.camera.aspect = this.width / Math.max(1, this.height); entry.camera.updateProjectionMatrix();
    if (entry.crystals) {
      const count = { auto: 160, high: 240, ultra: 320 }[this.quality] || 160;
      for (const batch of entry.crystalBatches || [{ mesh: entry.crystals, indices: entry.layout.map((_, i) => i) }]) {
        batch.mesh.count = batch.indices.filter(i => i < count).length;
      }
    }
    const curtainCount = { auto: 2, high: 4, ultra: 6 }[this.quality] || 2;
    if (entry.curtains) entry.curtains.forEach((mesh, i) => { mesh.visible = i < curtainCount; });
    entry.rendered = false;
  }
  resize(width, height, quality) {
    this.width = width; this.height = height; this.quality = quality;
    for (const entry of this.entries.values()) this.sizeEntry(entry);
  }
  update(entry, audio, delta, palette, spectrum) {
    const dt = Math.max(0, Math.min(.05, delta));
    if (entry.aura) { entry.aura.update(audio, dt, palette); return; }
    if (entry.darkMatter) { entry.darkMatter.update(audio, dt, palette); return; }
    if (entry.lightTunnel) { entry.lightTunnel.update(audio, dt, palette); return; }
    if (entry.ferrofluid) { entry.ferrofluid.update(audio, dt, palette, spectrum); return; }
    if (entry.neonMarch) { entry.neonMarch.update(audio, dt, palette); return; }
    if (entry.neonCity) { entry.neonCity.update(audio, dt, palette, spectrum); return; }
    if (entry.fractalLotus) { entry.fractalLotus.update(audio, dt, palette); return; }
    if (entry.voxelTunnel) { entry.voxelTunnel.update(audio, dt, palette); return; }
    if (entry.magneticSilk) { entry.magneticSilk.update(audio, dt, palette); return; }
    if (entry.cyberTunnel) { entry.cyberTunnel.update(audio, dt, palette); return; }
    if (entry.flyover) { entry.flyover.update(audio, dt, palette); return; }
    if (entry.road) { entry.road.update(audio, dt, palette); return; }
    if (entry.tunnel) { entry.tunnel.update(audio, dt, palette); return; }
    const ease = 1 - Math.exp(-dt * 3);
    [audio.bass || 0, audio.mid || 0, audio.high || 0, audio.level || 0].forEach((value, i) => {
      entry.audio.setComponent(i, THREE.MathUtils.lerp(entry.audio.getComponent(i), value, ease));
    });
    entry.age += dt; entry.time += dt * (.24 + entry.audio.w * .85);
    const scheme = entry.crystals ? CRYSTAL_NEON_PALETTES : palettes;
    const colors = scheme[palette] || scheme[0];
    // The crystal backdrop shares the formation's smoothed audio and clock.
    for (const material of entry.materials || []) {
      material.uniforms.uTime.value = entry.time;
      material.uniforms.uHem.value.setHex(colors[0]); material.uniforms.uMid.value.setHex(colors[1]); material.uniforms.uTop.value.setHex(colors[2]);
    }
    if (entry.crystals) {
      entry.anchor.position.y = 0;
      const beatGrowth = entry.beatGrowth?.update(audio, dt) || 0;
      entry.facetRipples?.update(audio, dt);
      entry.smokeVeils?.update(dt, entry.audio.w);
      entry.spirit?.update(audio, dt, colors);
      // Faster musical tempo drives faster spin; eased velocity avoids beat
      // jolts. The globe stays anchored and shard growth remains independent.
      entry.tempoSpin ||= new CrystalTempoSpin();
      entry.anchor.rotation.y = (entry.anchor.rotation.y + entry.tempoSpin.update(audio, dt)) % (Math.PI * 2);
      entry.anchor.rotation.z = .04;
      updateNeonCrystalMaterial(entry.material, colors, entry.time, beatGrowth);
      if (entry.coreMaterial) updateNeonCrystalMaterial(entry.coreMaterial, colors, entry.time, beatGrowth * .35);
      for (const batch of entry.crystalBatches || [{ mesh: entry.crystals, indices: entry.layout.map((_, i) => i) }]) {
        for (let i = 0; i < batch.mesh.count; i++) {
          const crystal = entry.layout[batch.indices[i]];
          const bin = (spectrum[crystal.band] || 0) / 255;
          const birth = THREE.MathUtils.smoothstep(entry.age - crystal.birth, 0, 1.1);
          const baseSize = crystal.height * birth * (.65 + bin * .6);
          // The light front reaches shards in surface order. Grow outward
          // smoothly from fixed bases; never scale or bounce the globe.
          if (entry.facetRipples) crystal.growth = THREE.MathUtils.lerp(crystal.growth, entry.facetRipples.growthAt(crystal.arc), 1 - Math.exp(-dt * 18));
          const growth = entry.facetRipples ? crystal.growth : beatGrowth;
          const height = Math.min(2.25, baseSize * (1 + growth * (.9 + crystal.hue * .3)));
          const width = baseSize * crystal.width * (1 + growth * .14);
          this.scale.set(width, height, width);
          this.matrix.compose(crystal.position, crystal.rotation, this.scale);
          batch.mesh.setMatrixAt(i, this.matrix);
          this.color.copy(entry.material.uniforms.uEdgeA.value).lerp(entry.material.uniforms.uEdgeB.value, crystal.hue);
          batch.mesh.setColorAt(i, this.color);
        }
        batch.mesh.instanceMatrix.needsUpdate = true;
        batch.mesh.instanceColor.needsUpdate = true;
      }
      entry.camera.position.set(Math.sin(entry.time * .07) * .5, .5, 9.6);
      entry.camera.lookAt(0, 0, 0);
      entry.waveFloor?.update(audio, dt, colors, entry.camera);
    }
    entry.palette = palette;
  }
  render(mode, audio, delta, palette, spectrum, paused) {
    if (!isProceduralMode(mode)) return;
    const previous = this.renderer.getRenderTarget();
    try {
      const entry = this.entries.get(mode) || this.create(mode);
      if(entry.neonCity?.assets.dirty){entry.rendered=false;entry.neonCity.assets.dirty=false;}
      if (entry.crystalSpectrum) {
        // Resizing invalidates the render target, not the paused pose. Keep a
        // private copy: the shared FFT buffer continues changing during pause.
        if (!paused) {
          for (let i = 0; i < entry.crystalSpectrum.length; i++) entry.crystalSpectrum[i] = spectrum[i] || 0;
        }
        spectrum = entry.crystalSpectrum;
      }
      if (!paused || !entry.rendered) this.update(entry, audio, paused ? 0 : delta, palette, spectrum);
      if (paused && entry.rendered) return;
      entry.neonCity?.aura.render(this.renderer);
      entry.cyberTunnel?.renderReflections(this.renderer);
      this.renderer.setRenderTarget(entry.target); this.renderer.render(entry.scene, entry.camera);
      entry.rendered = true;
    } finally { this.renderer.setRenderTarget(previous); }
  }
  dispose() {
    const geometries = new Set(), materials = new Set();
    for (const entry of this.entries.values()) {
      // Spirit owns its simulation targets and removes its Points before the
      // shared traversal, so no GPU resource is disposed twice.
      entry.spirit?.dispose();
      entry.cyberTunnel?.dispose();
      entry.ferrofluid?.dispose();
      entry.neonCity?.dispose();
      entry.darkMatter?.dispose();
      entry.neonMarch?.dispose();
      entry.waveFloor?.dispose();
      entry.scene.traverse((object) => {
        if (object.geometry) geometries.add(object.geometry);
        if (object.material) materials.add(object.material);
        if (object.isInstancedMesh) object.dispose();
      });
      entry.target.dispose(); entry.environment?.dispose();
    }
    geometries.forEach((g) => g.dispose()); materials.forEach((m) => m.dispose());
    this.empty.dispose(); this.entries.clear();
  }
}
