import * as THREE from "three";

// Original pixel glyphs and GPU field, inspired by Roomtone's dim ASCII ground
// layers. No upstream source, fonts, AI service or runtime dependency is used.
export const ASCII_GLYPHS = " .:-=+*#";
export const ASCII_TILE = { width: 8, height: 12 };
const glyphRows = [
  [0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 4, 4],
  [0, 4, 4, 0, 4, 4, 0],
  [0, 0, 0, 31, 0, 0, 0],
  [0, 0, 31, 0, 31, 0, 0],
  [0, 4, 4, 31, 4, 4, 0],
  [0, 21, 14, 31, 14, 21, 0],
  [10, 10, 31, 10, 31, 10, 10],
];

export function createHorizonAsciiAtlas() {
  const width = ASCII_TILE.width * ASCII_GLYPHS.length, height = ASCII_TILE.height;
  const data = new Uint8Array(width * height);
  glyphRows.forEach((rows, glyph) => rows.forEach((bits, y) => {
    for (let x = 0; x < 5; x++) {
      // Rows are authored top-down; texture coordinates are bottom-up.
      const index = (height - 3 - y) * width + glyph * ASCII_TILE.width + x + 1;
      data[index] = bits & (1 << (4 - x)) ? 255 : 0;
    }
  }));
  const texture = new THREE.DataTexture(data, width, height, THREE.RedFormat, THREE.UnsignedByteType);
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

// CSS-sized cells: changing render quality/DPR must not reshuffle the lattice.
// Bound the visual density on large displays, keeping small screens readable.
export function horizonAsciiGrid(width, height) {
  const w = Math.max(1, width), h = Math.max(1, height);
  const cell = Math.max(12, Math.sqrt(w * h / (5200 * 1.5)));
  return [Math.max(1, Math.floor(w / cell)), Math.max(1, Math.floor(h / (cell * 1.5)))];
}

export const horizonAsciiGLSL = /* glsl */ `
  float horizonGlyph(vec2 local, float index) {
    // Insets and blank tile margins keep neighbouring atlas glyphs isolated.
    vec2 texel = vec2(.5) + local * vec2(7., 11.);
    vec2 uv = (texel + vec2(index * 8., 0.)) / vec2(64., 12.);
    return texture2D(uHorizonAscii, uv).r;
  }
  vec3 horizonAscii(vec2 p, float t, float foreground) {
    vec2 lattice = vUv * uHorizonAsciiGrid;
    vec2 cell = floor(lattice);
    vec2 q = (cell + .5) / uHorizonAsciiGrid;
    vec2 fieldPoint = vec2((q.x - .5) * uResolution.x / uResolution.y, q.y);
    // The field flows under a stationary character grid, so marks stay upright.
    float drift = sin(fieldPoint.x * 5.4 + t * .19 + sin(q.y * 7. - t * .11));
    float fold = sin(fieldPoint.x * 3.2 - q.y * 8.3 - t * .14);
    float mist = noise(fieldPoint * 3.4 + vec2(t * .035, -t * .025));
    float band = spectrumAt(.08 + q.x * .82);
    float field = smoothstep(.32, .84, .43 + drift * .20 + fold * .13 + mist * .14 + band * .09);
    float density = clamp(field * (.78 + uLevel * .18 + band * .12), 0., 1.) * 7.;
    float glyph = mix(horizonGlyph(fract(lattice), floor(density)),
      horizonGlyph(fract(lattice), min(7., floor(density) + 1.)), smoothstep(.15, .85, fract(density)));
    // Reserve dark space around the baseline, foreground towers and frame edge.
    float sky = smoothstep(-.035, .19, p.y);
    float edge = smoothstep(0., .10, min(q.x, 1. - q.x)) * smoothstep(0., .10, 1. - q.y);
    float coverage = smoothstep(.06, .30, field) * sky * edge * (1. - clamp(foreground, 0., 1.));
    float light = (.095 + uLevel * .17 + band * .065) * (.9 + uBass * .18 + uBeat * .08);
    vec3 ink = chroma(.53 + q.x * .20 + field * .10, light);
    // Treble picks out occasional bright marks, never a full-screen flash.
    ink += vec3(.10, .22, .27) * uHigh * step(.965, hash21(cell)) * field;
    return ink * glyph * coverage;
  }
`;
