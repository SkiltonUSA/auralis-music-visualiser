import * as THREE from "three";
import { createCrystalEnvironment } from "./crystal-studio.js";

// Adapted from the supplied ferrofluid example. Local audio, procedural mask
// and studio reflections; no remote HDRIs, SVG uploads or second audio context.
export const FERROFLUID_MODE = 23;
export const FERROFLUID_QUALITY = { auto: { segments: 192 }, high: { segments: 320 }, ultra: { segments: 480 } };
export const FERROFLUID_PALETTES = [
  [0x162130, 0x70dfff, 0xff57b1], [0x281309, 0xffb657, 0xfa4279],
  [0x082522, 0x5bffe0, 0x397eff], [0x24120a, 0xffead4, 0xff5128],
];
const unit = v => Number.isFinite(v) ? THREE.MathUtils.clamp(v, 0, 1) : 0;

export class FerrofluidMotion {
  constructor() {
    this.time = 0; this.level = 0;
    this.values = new Float32Array(256); this.bytes = new Uint8Array(256);
  }
  update(audio, delta, spectrum = []) {
    const dt = Number.isFinite(delta) ? THREE.MathUtils.clamp(delta, 0, .05) : 0;
    if (!dt) return false;
    const target = unit(audio.level), ease = 1 - Math.exp(-3 * dt);
    this.time += .2 * dt + .8 * (target * dt + (this.level - target) * ease / 3);
    this.level += (target - this.level) * ease;
    for (let i = 0; i < 256; i++) {
      const value = spectrum[i], next = Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0, 255) : 0;
      this.values[i] += (next - this.values[i]) * (1 - Math.exp(-(next > this.values[i] ? 24 : 5) * dt));
      this.bytes[i] = Math.round(this.values[i]);
    }
    return true;
  }
}

const displacement = /* glsl */ `
uniform sampler2D uFluidSpectrum;
uniform float uFluidTime;
varying vec2 vFluidXZ;
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
    const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
    const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy) );
    vec3 x0 = v - i + dot(i, C.xxx) ;
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min( g.xyz, l.zxy );
    vec3 i2 = max( g.xyz, l.zxy );
    vec3 x1 = x0 - i1 + 1.0 * C.xxx;
    vec3 x2 = x0 - i2 + 2.0 * C.xxx;
    vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
    i = mod289(i);
    vec4 p = permute( permute( permute( 
                i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
            + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
    float n_ = 1.0/7.0;
    vec3  ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z *ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_ );
    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4( x.xy, y.xy );
    vec4 b1 = vec4( x.zw, y.zw );
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
    vec3 p0 = vec3(a0.xy,h.x);
    vec3 p1 = vec3(a0.zw,h.y);
    vec3 p2 = vec3(a1.xy,h.z);
    vec3 p3 = vec3(a1.zw,h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), 
                                dot(p2,x2), dot(p3,x3) ) );
}
float fluidHeight(vec3 p) {
  float radius = length(p.xz);
  float mask = 1. - smoothstep(6.65, 7.05, radius);
  float power = texture2D(uFluidSpectrum, vec2(clamp(radius / 7.05, 0., 1.), .5)).r;
  float n = snoise(vec3(p.x * 2., p.z * 2., uFluidTime));
  return pow(abs(n), 4.15) * 15. * mask * power;
}
`;

export function createFerrofluidMaterial(uniforms) {
  const material = new THREE.MeshStandardMaterial({
    color: FERROFLUID_PALETTES[0][0], roughness: .162, metalness: .5,
    envMapIntensity: 1.5, side: THREE.DoubleSide,
  });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = displacement + shader.vertexShader;
    // Work in object space BEFORE Three's normal-matrix transformation. The
    // source assigned object-space normals directly to a view-space varying.
    shader.vertexShader = shader.vertexShader.replace("#include <beginnormal_vertex>", `
      float fluidH = fluidHeight(position);
      float eps = .025;
      float hx = fluidHeight(position + vec3(eps, 0., 0.));
      float hz = fluidHeight(position + vec3(0., 0., eps));
      vec3 objectNormal = normalize(vec3(fluidH - hx, eps, fluidH - hz));
      #ifdef USE_TANGENT
        vec3 objectTangent = vec3(tangent.xyz);
      #endif
    `).replace("#include <begin_vertex>", `
      vec3 transformed = vec3(position.x, position.y + fluidH, position.z);
      vFluidXZ = position.xz;
    `);
    shader.fragmentShader = "varying vec2 vFluidXZ;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("#include <clipping_planes_fragment>",
      "#include <clipping_planes_fragment>\nif (length(vFluidXZ) > 7.15) discard;");
  };
  material.customProgramCacheKey = () => "auralis-ferrofluid-v1";
  return material;
}

export class Ferrofluid {
  constructor(scene, camera) {
    this.camera = camera; this.motion = new FerrofluidMotion();
    this.texture = new THREE.DataTexture(this.motion.bytes, 256, 1, THREE.RedFormat);
    this.texture.minFilter = this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false; this.texture.needsUpdate = true;
    this.uniforms = { uFluidTime: { value: 0 }, uFluidSpectrum: { value: this.texture } };
    this.environment = createCrystalEnvironment(); scene.environment = this.environment;
    scene.background = new THREE.Color(0x010104); scene.fog = new THREE.FogExp2(0x010104, .022);
    this.material = createFerrofluidMaterial(this.uniforms);
    this.mesh = new THREE.Mesh(this.createGeometry(192), this.material);
    this.mesh.frustumCulled = false; scene.add(this.mesh); this.segments = 192;
    // The floor must not share the fluid's displacement shader.
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(160, 160),
      new THREE.MeshStandardMaterial({ color: 0x030409, roughness: .32, metalness: .45, envMapIntensity: .06 }));
    this.floor.rotation.x = -Math.PI / 2; this.floor.position.y = -.045; scene.add(this.floor);
    this.key = new THREE.DirectionalLight(0xffffff, 3); this.key.position.set(-4, 14, 8);
    this.rim = new THREE.DirectionalLight(0xff57b1, 3); this.rim.position.set(8, 5, -6);
    scene.add(this.key, this.rim);
    camera.near = .1; camera.far = 250; camera.fov = 25;
    camera.position.set(20, 15, 30); camera.lookAt(0, 1, 0); camera.updateProjectionMatrix();
    this.update({}, 0, 0, []);
  }
  createGeometry(segments) {
    const geometry = new THREE.PlaneGeometry(24, 24, segments, segments);
    geometry.rotateX(-Math.PI / 2); return geometry;
  }
  resize(width, height, quality) {
    const segments = (FERROFLUID_QUALITY[quality] || FERROFLUID_QUALITY.auto).segments;
    if (segments !== this.segments) {
      const old = this.mesh.geometry; this.mesh.geometry = this.createGeometry(segments);
      this.segments = segments; old.dispose();
    }
    this.camera.zoom = Math.min(1, (width / Math.max(1, height)) / 1.25);
    this.camera.updateProjectionMatrix();
  }
  update(audio, delta, palette, spectrum) {
    if (this.motion.update(audio, delta, spectrum)) this.texture.needsUpdate = true;
    this.uniforms.uFluidTime.value = this.motion.time;
    const colors = FERROFLUID_PALETTES[palette] || FERROFLUID_PALETTES[0];
    this.material.color.setHex(colors[0]); this.key.color.setHex(colors[1]); this.rim.color.setHex(colors[2]);
  }
  dispose() { this.texture.dispose(); this.environment.dispose(); }
  // Shared owner disposes current geometry/materials/target; resize releases
  // replaced geometry immediately. The FFT snapshot freezes with this world.
}
