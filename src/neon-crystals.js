import * as THREE from "three";

export const CRYSTAL_NEON_PALETTES = [
  [0x10e7ff, 0xff22b8, 0x8040ff], [0xffaf26, 0xff335e, 0xff6be8],
  [0x20ffd3, 0x327bff, 0xa5fff1], [0xffecd1, 0xff401b, 0xffb139],
];

// Pixel-width facet edges in the same instanced draw as the dark faces. On
// shard sides, suppress the internal diagonal of each triangulated quad.
export function addCrystalEdgeAttributes(geometry, shard = false) {
  const count = geometry.attributes.position.count;
  const barycentric = new Float32Array(count * 3), masks = new Float32Array(count * 3);
  for (let vertex = 0; vertex < count; vertex++) {
    barycentric[vertex * 3 + vertex % 3] = 1;
    const face = Math.floor(vertex / 3) % 4;
    masks.set(shard && face === 0 ? [1, 0, 1] : shard && face === 1 ? [1, 1, 0] : [1, 1, 1], vertex * 3);
  }
  geometry.setAttribute("aBarycentric", new THREE.BufferAttribute(barycentric, 3));
  geometry.setAttribute("aEdgeMask", new THREE.BufferAttribute(masks, 3));
  return geometry;
}

const vertexShader = /* glsl */ `
  attribute vec3 aBarycentric, aEdgeMask;
  varying vec3 vBarycentric, vEdgeMask, vNormal, vView, vTint;
  varying float vHeight;
  void main() {
    vec4 p = vec4(position, 1.);
    vec3 n = normal;
    vTint = vec3(1.);
    #ifdef USE_INSTANCING
      p = instanceMatrix * p;
      mat3 basis = mat3(instanceMatrix);
      n /= max(vec3(dot(basis[0], basis[0]), dot(basis[1], basis[1]), dot(basis[2], basis[2])), vec3(.00001));
      n = basis * n;
    #endif
    #ifdef USE_INSTANCING_COLOR
      vTint = instanceColor;
    #endif
    vec4 view = modelViewMatrix * p;
    vNormal = normalize(normalMatrix * n);
    vView = -view.xyz;
    vHeight = position.y;
    vBarycentric = aBarycentric; vEdgeMask = aEdgeMask;
    gl_Position = projectionMatrix * view;
  }
`;
const fragmentShader = /* glsl */ `
  uniform vec3 uEdgeA, uEdgeB;
  uniform vec4 uAudio;
  uniform float uTime, uBeat, uCore;
  varying vec3 vBarycentric, vEdgeMask, vNormal, vView, vTint;
  varying float vHeight;
  void main() {
    vec3 distances = vBarycentric / max(fwidth(vBarycentric), vec3(.00001));
    distances = mix(vec3(10000.), distances, vEdgeMask);
    float edgeDistance = min(distances.x, min(distances.y, distances.z));
    float line = 1. - smoothstep(.45, 1.35, edgeDistance);
    float halo = exp(-edgeDistance * .65) * .20;
    vec3 ink = mix(vTint, mix(uEdgeA, uEdgeB, .25), uCore);
    vec3 n = normalize(vNormal), view = normalize(vView);
    float diffuse = max(0., dot(n, normalize(vec3(-.4, .7, .6))));
    float rim = pow(1. - abs(dot(n, view)), 2.5);
    float sweep = pow(.5 + .5 * sin(vHeight * 8. - uTime * 1.4), 6.);
    vec3 face = vec3(.001, .002, .009) + ink * (.012 + diffuse * .038 + rim * .045);
    float energy = .85 + uAudio.z * .35 + uBeat * .5 + sweep * .18;
    // Keep the core subdued so the individual outward-growing shards read.
    vec3 edge = ink * (line + halo) * energy * mix(1., .23, uCore);
    vec3 tip = mix(ink, uEdgeA, .35) * smoothstep(.7, 1., vHeight) * sweep * .055 * (1. - uCore);
    gl_FragColor = vec4(face + edge + tip, 1.);
  }
`;

export function createNeonCrystalMaterial(audio, core = false) {
  return new THREE.ShaderMaterial({
    vertexShader, fragmentShader, depthTest: true, depthWrite: true,
    uniforms: {
      uEdgeA: { value: new THREE.Color(CRYSTAL_NEON_PALETTES[0][0]) },
      uEdgeB: { value: new THREE.Color(CRYSTAL_NEON_PALETTES[0][1]) },
      uAudio: { value: audio }, uTime: { value: 0 }, uBeat: { value: 0 }, uCore: { value: core ? 1 : 0 },
    },
  });
}

export function updateNeonCrystalMaterial(material, colors, time, beat) {
  material.uniforms.uEdgeA.value.setHex(colors[0]);
  material.uniforms.uEdgeB.value.setHex(colors[1]);
  material.uniforms.uTime.value = time;
  material.uniforms.uBeat.value = beat;
}
