// One spectrum layer, in screen space. uSpectrum already uses quadratic
// frequency spacing: sampling it linearly avoids applying that spacing twice.
export const SIGNAL_COLUMNS = 54;
export const SIGNAL_MARGIN = .08;
export const signalSceneGLSL = /* glsl */ `
  vec3 signalScene(vec2 p, float t) {
    float x = (vUv.x - ${SIGNAL_MARGIN}) / ${1 - SIGNAL_MARGIN * 2};
    float cell = clamp(x, 0., .999999) * ${SIGNAL_COLUMNS}.;
    float id = floor(cell);
    float sampleX = mix(.5 / 256., 1. - .5 / 256., id / ${SIGNAL_COLUMNS - 1}.);
    float bin = spectrumAt(sampleX), held = peakAt(sampleX);
    float y = abs(vUv.y * 2. - 1.);
    float pixel = 2. / uResolution.y;
    float edge = max(fwidth(cell), .001);
    float column = smoothstep(.16, .16 + edge, fract(cell))
      * (1. - smoothstep(.84 - edge, .84, fract(cell)));
    float bounds = step(0., x) * (1. - step(1., x));
    float height = .018 + bin * .60;
    float heldHeight = .018 + held * .60;
    float row = fract(y * 32.);
    float rowAA = max(fwidth(y) * 32., .001);
    float segments = smoothstep(.16, .16 + rowAA, row)
      * (1. - smoothstep(.84 - rowAA, .84, row));
    float body = column * segments * (1. - smoothstep(height - pixel, height + pixel, y));
    vec3 tint = chroma(sampleX * .62 + t * .025, 1.);
    vec3 color = tint * body * (.25 + bin * .28 + uBeat * .08);
    float cap = column * (1. - smoothstep(pixel, pixel * 2.5, abs(y - heldHeight)));
    color += mix(tint, vec3(1., .87, .63), .35) * cap * (.28 + held * .20);
    float liveBin = spectrumAt(mix(.5 / 256., 1. - .5 / 256., clamp(x, 0., 1.)));
    float crest = .003 / (abs(y - (.018 + liveBin * .60)) + .006);
    color += tint * crest * .10;
    return color * bounds;
  }
`;
