import * as THREE from "three";
import { CRYSTAL_RIPPLE_COUNT } from "./crystal-facet-ripples.js";

export const CRYSTAL_NEON_PALETTES = [
  [0x10e7ff, 0xff22b8, 0x8040ff], [0xffaf26, 0xff335e, 0xff6be8],
  [0x20ffd3, 0x327bff, 0xa5fff1], [0xffecd1, 0xff401b, 0xffb139],
];

// Pixel-width facet edges in the same instanced draw as the dark faces. On
// shard sides, suppress the internal diagonal of each triangulated quad.
export function addCrystalEdgeAttributes(geometry, shard = false) {
  const count = geometry.attributes.position.count;
  const barycentric = new Float32Array(count * 3), masks = new Float32Array(count * 3);
  const centers = new Float32Array(count * 3), position = geometry.attributes.position;
  // Repeat each triangle's centroid at all three corners. Its ripple value
  // stays flat across the face, instead of drawing a smooth stripe through it.
  for (let first = 0; first < count; first += 3) {
    const center = [0, 0, 0];
    for (let corner = 0; corner < 3; corner++) {
      center[0] += position.getX(first + corner) / 3;
      center[1] += position.getY(first + corner) / 3;
      center[2] += position.getZ(first + corner) / 3;
    }
    for (let corner = 0; corner < 3; corner++) centers.set(center, (first + corner) * 3);
  }
  for (let vertex = 0; vertex < count; vertex++) {
    barycentric[vertex * 3 + vertex % 3] = 1;
    const face = Math.floor(vertex / 3) % 4;
    masks.set(shard && face === 0 ? [1, 0, 1] : shard && face === 1 ? [1, 1, 0] : [1, 1, 1], vertex * 3);
  }
  geometry.setAttribute("aBarycentric", new THREE.BufferAttribute(barycentric, 3));
  geometry.setAttribute("aEdgeMask", new THREE.BufferAttribute(masks, 3));
  geometry.setAttribute("aFaceCenter", new THREE.BufferAttribute(centers, 3));
  return geometry;
}

const vertexDeclarations = /* glsl */ `
  attribute vec3 aBarycentric, aEdgeMask, aFaceCenter;
  varying vec3 vBarycentric, vEdgeMask, vTint;
  varying float vHeight, vFacetArc;
`;
const vertexEffects = /* glsl */ `
    vec4 facet = vec4(aFaceCenter, 1.);
    vTint = vec3(1.);
    #ifdef USE_INSTANCING
      facet = instanceMatrix * facet;
    #endif
    #ifdef USE_INSTANCING_COLOR
      vTint = instanceColor;
    #endif
    vHeight = position.y;
    // Common angular distance for core and shards, in the rotating globe's
    // local coordinates. Adjacent faces flash in spatial order, never randomly.
    vec3 direction = facet.xyz / max(length(facet.xyz), .00001);
    vFacetArc = acos(clamp(dot(direction, normalize(vec3(.3, .8, .55))), -1., 1.));
    vBarycentric = aBarycentric; vEdgeMask = aEdgeMask;
`;
const fragmentDeclarations = /* glsl */ `
  uniform vec3 uEdgeA, uEdgeB;
  uniform vec4 uAudio;
  uniform float uTime, uBeat, uCore;
  uniform vec2 uFacetRipples[${CRYSTAL_RIPPLE_COUNT}];
  varying vec3 vBarycentric, vEdgeMask, vTint;
  varying float vHeight, vFacetArc;
`;
const fragmentEffects = /* glsl */ `
    vec3 distances = vBarycentric / max(fwidth(vBarycentric), vec3(.00001));
    distances = mix(vec3(10000.), distances, vEdgeMask);
    float edgeDistance = min(distances.x, min(distances.y, distances.z));
    float line = 1. - smoothstep(.45, 1.35, edgeDistance);
    float halo = exp(-edgeDistance * .65) * .20;
    vec3 ink = mix(vTint, mix(uEdgeA, uEdgeB, .25), uCore);
    float rim = pow(1. - abs(dot(normal, normalize(vViewPosition))), 3.);
    float sweep = pow(.5 + .5 * sin(vHeight * 8. - uTime * 1.4), 6.);
    float flash = 0.;
    for (int i = 0; i < ${CRYSTAL_RIPPLE_COUNT}; i++) {
      float arrival = abs(vFacetArc - uFacetRipples[i].x);
      float pulse = 1. - smoothstep(.06, .22, arrival);
      flash = max(flash, pulse * uFacetRipples[i].y);
    }
    // Illuminate the triangle interiors, preserving neon colour and dark gaps
    // between successive beat ripples. Max, not sum, prevents white pile-up.
    vec3 face = mix(ink, uEdgeA, .25) * flash * mix(.55, .32, uCore);
    float energy = .85 + uAudio.z * .35 + uBeat * .5 + sweep * .18;
    // Globe edges inherit the same physical surface shading as their faces;
    // only the outward-growing shards receive a separate neon outline.
    vec3 edge = ink * (line + halo) * energy * .72 * (1. - uCore);
    vec3 tip = mix(ink, uEdgeA, .35) * smoothstep(.7, 1., vHeight) * sweep * .055 * (1. - uCore);
    totalEmissiveRadiance += face + edge + tip + ink * rim * .08;
`;

export function createNeonCrystalMaterial(audio, core = false, ripples = null) {
  // Physical reflections and clearcoat establish volume; neon is an emissive
  // layer in the SAME draw, retaining depth, instancing and triangle ripples.
  // Opaque polished quartz avoids an extra full-scene transmission pass.
  const material = new THREE.MeshPhysicalMaterial({
    color: core ? 0x101827 : 0x536077,
    metalness: core ? .32 : .18, roughness: core ? .36 : .18,
    clearcoat: core ? .45 : .8, clearcoatRoughness: core ? .22 : .09,
    ior: 1.55, envMapIntensity: core ? .75 : 1.1,
    depthTest: true, depthWrite: true,
  });
  material.uniforms = {
      uEdgeA: { value: new THREE.Color(CRYSTAL_NEON_PALETTES[0][0]) },
      uEdgeB: { value: new THREE.Color(CRYSTAL_NEON_PALETTES[0][1]) },
      uAudio: { value: audio }, uTime: { value: 0 }, uBeat: { value: 0 }, uCore: { value: core ? 1 : 0 },
      uFacetRipples: { value: ripples?.uniforms || new Float32Array(CRYSTAL_RIPPLE_COUNT * 2) },
  };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, material.uniforms);
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>\n${vertexDeclarations}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${vertexEffects}`);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>\n${fragmentDeclarations}`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\n${fragmentEffects}`);
  };
  material.customProgramCacheKey = () => "auralis-physical-neon-v2";
  return material;
}

export function updateNeonCrystalMaterial(material, colors, time, beat) {
  material.uniforms.uEdgeA.value.setHex(colors[0]);
  material.uniforms.uEdgeB.value.setHex(colors[1]);
  material.uniforms.uTime.value = time;
  material.uniforms.uBeat.value = beat;
}
