import * as THREE from "three";
import { SmokeSimulation } from "./smoke-simulation.js";
import { RadialMotion } from "./radial-motion.js";
import { BloomWaves, BLOOM_RING_COUNT, BLOOM_WAVE_SAMPLES } from "./bloom-waves.js";
import { PostProcessor } from "./post-processing.js";
import { ProceduralScenes, isProceduralMode } from "./procedural-scenes.js";
import { SceneBlend } from "./scene-blend.js";
import { SceneMixer } from "./scene-mixer.js";
import { HORIZON_COLUMNS, HORIZON_BANDS } from "./horizon-spectrum.js";
import { createHorizonAsciiAtlas, horizonAsciiGrid, horizonAsciiGLSL } from "./horizon-ascii.js";
import { HorizonWaves, HORIZON_WAVE_COUNT, HORIZON_WAVE_SAMPLES, horizonWavesGLSL } from "./horizon-waves.js";
import { GeissFlow, GEISS_MODE } from "./geiss-flow.js";

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform vec2 uResolution;
  uniform float uTime;
  uniform float uFlowTime;
  uniform float uFlightTime;
  uniform float uValleySteps;
  uniform float uHorizonBands[${HORIZON_COLUMNS / 2}];
  uniform sampler2D uHorizonAscii;
  uniform vec2 uHorizonAsciiGrid;
  uniform sampler2D uHorizonWaveforms;
  uniform vec4 uHorizonLines[${HORIZON_WAVE_COUNT}];
  uniform float uRadialAngle;
  uniform float uLevel;
  uniform float uBass;
  uniform float uMid;
  uniform float uHigh;
  uniform float uBeat;
  uniform float uMode;
  uniform float uImpact;
  uniform float uBassHit;
  uniform float uMidHit;
  uniform float uAirHit;
  uniform float uShockwave;
  uniform float uBarBeat;
  uniform float uPalette;
  uniform float uSub;
  uniform float uPresence;
  uniform float uAir;
  uniform sampler2D uSpectrum;
  uniform sampler2D uPeakSpectrum;
  uniform sampler2D uSmoke;
  uniform sampler2D uTorusScene;
  uniform sampler2D uCrystalScene;
  uniform sampler2D uRoadScene;
  uniform sampler2D uEndlessScene;
  uniform sampler2D uFlyoverScene;
  uniform sampler2D uGeissScene;
  uniform sampler2D uBloomWaveforms;
  uniform vec4 uBloomRings[${BLOOM_RING_COUNT}];
  uniform vec2 uSmokeTexel;
  #define PI 3.14159265359

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1., 0.)), f.x), mix(hash21(i + vec2(0., 1.)), hash21(i + vec2(1.)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float value = 0., amp = .5;
    mat2 turn = mat2(.82, -.57, .57, .82);
    for (int i = 0; i < 5; i++) { value += noise(p) * amp; p = turn * p * 2.03 + 13.7; amp *= .5; }
    return value;
  }
  float spectrumAt(float position) {
    return texture2D(uSpectrum, vec2(clamp(position, .002, .998), .5)).r;
  }
  float peakAt(float position) {
    return texture2D(uPeakSpectrum, vec2(clamp(position, .002, .998), .5)).r;
  }
  vec2 kaleido(vec2 p, float segments, float rotation, float twist) {
    float radius = length(p);
    float angle = atan(p.y, p.x) + rotation + radius * twist;
    float sector = 2. * PI / segments;
    angle = abs(mod(angle + sector * .5, sector) - sector * .5);
    return vec2(cos(angle), sin(angle)) * radius;
  }
  vec3 chroma(float t, float intensity) {
    vec3 violet = .55 + .5 * cos(6.28318 * (t + vec3(.02, .28, .55)));
    vec3 ember = .5 + .5 * cos(6.28318 * (t + vec3(.00, .10, .21)));
    vec3 aqua = .5 + .5 * cos(6.28318 * (t + vec3(.55, .34, .20)));
    float signalMix = smoothstep(.28, .72, .5 + .5 * cos(6.28318 * t));
    vec3 signal = mix(vec3(.94, .90, .82), vec3(1., .16, .025), signalMix);
    vec3 color = uPalette < .5 ? violet : (uPalette < 1.5 ? ember : (uPalette < 2.5 ? aqua : signal));
    return color * intensity;
  }
  vec3 colorBarBackdrop(vec2 p, float t, float sceneLuminance) {
    float aspect = uResolution.x / uResolution.y;
    float normalizedX = clamp(p.x / aspect * .5 + .5, 0., .9999);
    float columns = mix(42., 68., smoothstep(900., 1800., uResolution.x));
    float cell = normalizedX * columns;
    float id = floor(cell);
    float cellX = fract(cell);
    float gap = mix(.16, .28, smoothstep(42., 68., columns));
    float bodyX = smoothstep(gap, gap + .035, cellX) * (1. - smoothstep(1. - gap - .035, 1. - gap, cellX));
    float frequencyPosition = id / max(1., columns - 1.);
    float bin = spectrumAt(frequencyPosition * frequencyPosition);
    float held = peakAt(frequencyPosition * frequencyPosition);
    float baseline = -.72;
    float barHeight = .055 + bin * (.62 + uLevel * .32);
    float top = baseline + barHeight;
    float bodyY = smoothstep(baseline - .015, baseline + .015, p.y) * (1. - smoothstep(top - .018, top + .018, p.y));
    float bar = bodyX * bodyY;
    vec3 barColor = vec3(1. - bin, 1., bin);
    float adaptiveOpacity = mix(.7, .13, smoothstep(.045, .72, sceneLuminance));
    adaptiveOpacity *= .82 + bin * .18 + uBeat * .08;
    barColor *= adaptiveOpacity;

    float peakTop = baseline + .055 + held * (.62 + uLevel * .32);
    float peakCap = bodyX * smoothstep(.014, .003, abs(p.y - peakTop));
    vec3 color = barColor * bar;
    color += mix(vec3(1., .9, .22), vec3(.25, .9, 1.), held) * peakCap * adaptiveOpacity * (.28 + held * .34);

    float reflectionHeight = barHeight * (.13 + uBass * .08);
    float reflection = bodyX * smoothstep(top - .01, top + .012, p.y) * (1. - smoothstep(top + reflectionHeight - .012, top + reflectionHeight, p.y));
    color += barColor * reflection * .16;
    return color;
  }
  float barSceneVisibility(float mode) {
    float torus = step(3.5, mode) * (1. - step(4.5, mode));
    float reactor = step(6.5, mode) * (1. - step(7.5, mode));
    float horizon = step(7.5, mode) * (1. - step(8.5, mode));
    float radial = step(8.5, mode) * (1. - step(9.5, mode));
    return (1. - clamp(torus + reactor + horizon + radial, 0., 1.)) * (1. - step(10.5, mode));
  }
  vec3 smokeLayer(vec2 p, float t, float amount, float grounded) {
    // The field is persistent GPU fluid state, not procedural noise.
    vec2 uv = vUv;
    vec4 fluid = texture2D(uSmoke, uv);
    float density = max(fluid.z, 0.);
    float opacity = 1. - exp(-density * mix(1.8, 1.1, grounded));
    float neighbour = texture2D(uSmoke, clamp(uv + uSmokeTexel * vec2(-2., 3.), .001, .999)).z;
    float lighting = clamp(.65 + (density - neighbour) * 2.8, .22, 1.8);
    float heat = clamp(fluid.w / max(.05, density) * .22, 0., 1.);
    vec3 tint = chroma(uv.x * .32 + heat * .2 + t * .012, 1.);
    // Valley mist follows the vanishing point in thin lateral swipes, leaving
    // the foreground ridges readable instead of blanketing them in clouds.
    float lateral = abs(uv.x - .5);
    float sweepY = .49 + sin((uv.x - .5) * 7. + t * .22) * lateral * .06;
    float veil = exp(-pow((uv.y - sweepY) / (.035 + lateral * .17), 2.));
    veil *= 1. - smoothstep(.32, .49, lateral);
    tint = mix(tint, mix(vec3(.45, .58, .68), tint, .25), grounded);
    float mask = mix(1., veil, grounded);
    return tint * opacity * lighting * amount * mask * (1. + heat * .3 + uHigh * .25);
  }
  vec3 bloomScene(vec2 p, float t) {
    float segments = 6. + floor(uHigh * 4. + uAirHit * 2.);
    p = kaleido(p, segments, t * (.025 + uMid * .07), .18 + uMid * .75 + uMidHit * .9);
    float r = length(p), a = atan(p.y, p.x);
    float fold = abs(fract(a / PI * segments * .5 + .5) - .5);
    float breath = sin(t * .63) * (.035 + uMid * .05) + uBass * .2 + uBassHit * .12 + uBeat * .06;
    float field = 0.; vec3 color = vec3(0.);
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      float bin = spectrumAt(.018 + fi * .052);
      float radius = .11 + fi * .118 + breath * (1. - fi * .07) + bin * (.018 + fi * .004);
      float petal = radius + sin(a * (4. + mod(fi, 3.)) + t * (.35 + fi * .04)) * (.035 + uMid * .1 + bin * .035);
      petal += (fold - .25) * (.16 + fi * .008);
      float edge = abs(r - petal);
      float glow = .012 / (edge + .006) * smoothstep(1.15, .04, r);
      color += chroma(fi * .11 + r * .3 + t * .025 + bin * .16, glow * (.12 + uLevel * .2 + bin * .22));
      field += glow;
    }
    float cloud = fbm(p * (3.5 + uHigh * 2.) + vec2(t * .1, -t * .07));
    color += chroma(cloud + t * .02, pow(cloud, 3.) * (.17 + uBass * .45) * smoothstep(1.1, .05, r));
    color += chroma(r - t * .03, .02 / (r + .025) * (.4 + uBeat));
    float hotCore = exp(-r * r * (34. - uBass * 8.));
    color += mix(chroma(t * .025, 1.), vec3(1.6, 1.45, 1.2), .72) * hotCore * (.18 + uBass * .52 + uBeat * .22);
    return color * (.7 + field * .025);
  }

  vec3 bloomSoundWaves() {
    // Screen-space propagation stays steadily outward even when the flower
    // breathes or twists. Mirrored sampling closes the waveform without a seam.
    vec2 p = (vUv * 2. - 1.) * uResolution / min(uResolution.x, uResolution.y);
    float radius = length(p);
    float angle = atan(p.y, p.x);
    float phase = abs(fract(angle / (2. * PI) + .5) * 2. - 1.);
    float sampleX = mix(.5 / ${BLOOM_WAVE_SAMPLES}., 1. - .5 / ${BLOOM_WAVE_SAMPLES}., phase);
    float pixel = 2. / min(uResolution.x, uResolution.y);
    vec3 color = vec3(0.);
    for (int i = 0; i < ${BLOOM_RING_COUNT}; i++) {
      vec4 ring = uBloomRings[i];
      if (ring.y < .001) continue;
      float wave = (texture2D(uBloomWaveforms, vec2(sampleX, (float(i) + .5) / ${BLOOM_RING_COUNT}.)).r * 255. - 128.) / 128.;
      float displacement = wave * (.025 + ring.y * .095) * (1. - ring.z * .35);
      float edge = abs(radius - ring.x - displacement);
      float width = max(pixel, .0025 + ring.y * .0015);
      float line = 1. - smoothstep(width, width + pixel * 1.6, edge);
      float glow = exp(-edge * 65.) * .22;
      float echo = exp(-abs(radius - ring.x - displacement - .022) * 170.) * .15;
      float envelope = smoothstep(0., .07, ring.z) * (1. - smoothstep(.56, 1., ring.z));
      float strength = envelope * (.18 + ring.y * .68);
      color += chroma(ring.w + phase * .18, (line + glow + echo) * strength);
    }
    return color;
  }

  vec3 liquidChrome(vec2 p, float t) {
    vec2 q = vec2(abs(p.x), p.y);
    vec3 color = vec3(0.);
    for (int i = 0; i < 7; i++) {
      float fi = float(i);
      float phase = t * (.12 + fi * .006) + fi * 2.399;
      float lane = .12 + fi * .105;
      vec2 center = vec2(lane + sin(phase * .73) * .045, sin(phase) * (.17 + fi * .055));
      float size = .035 + mod(fi, 3.) * .011 + uBass * .018;
      float d = length(q - center);
      float body = smoothstep(size, size * .08, d);
      float shell = .0035 / (abs(d - size) + .0035);
      vec2 lightPoint = center - vec2(size * .26, size * .34);
      float specular = smoothstep(size * .34, 0., length(q - lightPoint));
      vec3 metal = mix(vec3(.025, .04, .075), chroma(fi * .13 + t * .018, 1.), .24);
      color += metal * body * (.4 + specular * 2.8);
      color += chroma(fi * .12 + t * .025, shell * (.07 + uHigh * .08));
      color += vec3(2.4, 2.1, 1.7) * specular * (.32 + uBeat * .38);
    }
    return color;
  }

  vec3 prismScene(vec2 p, float t) {
    float segments = 8. + floor(uHigh * 4. + uAirHit * 2.);
    p = kaleido(p, segments, -t * (.018 + uMid * .05), -.22 - uMid * .55 - uMidHit * .75);
    float angle = atan(p.y, p.x), radius = length(p), rays = 0.;
    vec3 color = vec3(0.);
    for (int i = 0; i < 9; i++) {
      float fi = float(i);
      float bin = spectrumAt(.025 + fi * .065);
      float blade = abs(p.y - p.x * (.11 + fi * .105) - sin(t * .27 + fi) * (.02 + bin * .075));
      float limit = smoothstep(.95 + uBass * .2, .06, radius);
      float streak = (.0045 + bin * .004) / (blade + .007) * limit * smoothstep(.0, .24 + fi * .06, radius);
      color += chroma(fi * .1 + angle * .35 + t * .035 + bin * .12, streak * (.16 + uMid * .42 + bin * .42));
      rays += streak;
    }
    vec2 cells = p * (7. + uHigh * 7. + uAirHit * 4.);
    float facets = abs(fract(cells.x + cells.y + sin(t * .2)) - .5) * abs(fract(cells.x - cells.y) - .5);
    color += chroma(facets + angle, pow(facets, 1.5) * .55 * smoothstep(1.1, .05, radius));
    for (int i = 0; i < 6; i++) {
      float fi = float(i);
      float depth = fract(fi / 6. + t * .045);
      float ringRadius = .12 + depth * 1.15;
      float ring = .0045 / (abs(radius - ringRadius) + .005);
      float gate = .36 + .64 * smoothstep(.12, .88, sin(angle * 8. + fi * 1.7 - t * .4) * .5 + .5);
      color += chroma(depth + t * .015, ring * gate * (.065 + uMid * .065) * (1. - depth * .42));
    }
    color += liquidChrome(p, t) * (.72 + uLevel * .45);
    color += vec3(.25, .12, .4) * uBeat * smoothstep(.7, 0., radius);
    color += vec3(1.7, 1.5, 1.25) * exp(-radius * radius * 50.) * (.12 + uBass * .4);
    return color * (.82 + rays * .018);
  }

  vec3 signalScene(vec2 p, float t) {
    vec3 color = vec3(0.); float columns = 34.;
    float id = floor((p.x + 1.1) * columns), center = (id + .5) / columns - 1.1;
    float normalizedId = clamp(id / (columns * 2.2), 0., 1.);
    float bin = spectrumAt(normalizedId * normalizedId);
    float held = peakAt(normalizedId * normalizedId);
    float energy = .07 + bin * .58 + .055 * (sin(id * 12.31 + t * 1.7) * .5 + .5);
    energy *= .58 + mix(uBass, uHigh, smoothstep(-.8, .9, center));
    float column = smoothstep(.018, .006, abs(p.x - center)) * smoothstep(energy, energy - .04, abs(p.y));
    float segments = smoothstep(.08, .24, fract((abs(p.y) + .012) * (28. + uPresence * 12.)));
    float bar = column * segments;
    color += chroma(center * .35 + t * .025, bar * (1.05 + bin * .7 + uBeat));
    float heldHeight = (.07 + held * .58) * (.58 + mix(uBass, uHigh, smoothstep(-.8, .9, center)));
    float cap = smoothstep(.022, .006, abs(p.x - center)) * smoothstep(.014, .003, abs(abs(p.y) - heldHeight));
    color += vec3(1.7, 1.35, .78) * cap * (.45 + held * 1.15);
    float liveX = clamp((p.x + 1.1) / 2.2, 0., 1.);
    float liveBin = spectrumAt(liveX * liveX);
    float crestHeight = (.07 + liveBin * .58) * (.58 + mix(uBass, uHigh, liveX));
    float crest = .0045 / (abs(abs(p.y) - crestHeight) + .0055);
    color += chroma(liveX * .62 - t * .022, crest * (.08 + uPresence * .12));
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      float wave = sin(p.x * (7. + fi * 3.) - t * (1.2 + fi * .2)) * (.05 + uMid * .12);
      wave += sin(p.x * 24. + t * .7) * uAir * .045;
      float line = .007 / (abs(p.y - wave - (fi - 1.5) * .17) + .007);
      color += chroma(fi * .18 + p.x * .1, line * .13);
    }
    return color;
  }

  vec3 warpScene(vec2 p, float t) {
    p *= .94 + sin(uFlowTime * .64) * .055 - uBassHit * .035;
    p += vec2(sin(uFlowTime * .27), cos(uFlowTime * .21)) * .028 * uMid;
    float radius = length(p);
    float angle = atan(p.y, p.x);
    angle += log(radius + .12) * (1.25 + uMid * 1.4) - uFlowTime * (.52 + uMid * .36);
    vec3 color = vec3(0.);
    for (int i = 0; i < 13; i++) {
      float fi = float(i);
      float bin = spectrumAt(.02 + fi * .048);
      float depth = fract(fi / 13. + uFlowTime * (.2 + uLevel * .1));
      float tunnelRadius = .035 + pow(depth, 2.15) * 1.52;
      float fold = sin(angle * (5. + mod(fi, 4.)) + uFlowTime * .9 + fi) * (.008 + depth * .026 + bin * .032);
      float ring = (.003 + bin * .004) / (abs(radius - tunnelRadius - fold) + .004);
      float fragments = .3 + .7 * smoothstep(.08, .82, sin(angle * 10. + fi * 2.1 - uFlowTime * 1.7) * .5 + .5);
      color += chroma(depth + angle * .08 + t * .012, ring * fragments * (.075 + bin * .22) * (1. - depth * .34));
    }
    float spokes = .0035 / (abs(sin(angle * (6. + floor(uHigh * 4.)))) * radius + .0045);
    color += chroma(angle * .18 - t * .03, spokes * smoothstep(1.3, .08, radius) * (.08 + uHigh * .11 + uAirHit * .18));
    float horizon = abs(radius - (.12 + uBass * .055 + uBassHit * .025));
    color += vec3(1.35, .75, 1.6) * .006 / (horizon + .006) * (.17 + uBass * .3);
    color += vec3(.02, .01, .05) * smoothstep(.22, .02, radius);
    return color;
  }

  float flightPath(float z) {
    return sin(z * .075) * 1.45 + sin(z * .031 + 1.7) * .85;
  }

  float valleyHeight(vec2 xz) {
    float center = flightPath(xz.y);
    float lateral = abs(xz.x - center);
    float variation = noise(xz * vec2(.29, .18));
    float band = spectrumAt(clamp(.018 + lateral * .055 + variation * .16, .01, .94));
    float sides = smoothstep(.55, 5.4, lateral);
    float ridge = sides * (1.05 + band * 3.9 + uBass * 1.1 + uSub * .58);
    ridge += sides * sin(xz.y * .42 + xz.x * .7) * uMid * .42;
    ridge += sides * (noise(xz * .72) - .5) * (uHigh * .5 + uAir * .42);
    float floorDetail = sin(xz.x * .7 + xz.y * .21) * .12 + sin(xz.x * 1.9 - xz.y * .13) * .07;
    float centerEnergy = spectrumAt(.025 + variation * .2) * .32 * (1. - sides);
    float height = -1.22 - uBass * .32 + ridge + floorDetail + centerEnergy;
    return height;
  }

  vec3 vectorScene(vec2 p, float t) {
    float cameraZ = uFlightTime * 3.;
    float cameraX = flightPath(cameraZ);
    float cameraY = .24 + sin(uFlightTime * .42) * .045 + sin(uFlightTime * .17 + 1.4) * .025;
    vec3 origin = vec3(cameraX, cameraY, cameraZ);

    float lookZ = cameraZ + 14.;
    float lookX = flightPath(lookZ);
    float lookY = -.28 + sin(uFlightTime * .31 + .8) * .055;
    vec3 forward = normalize(vec3(lookX, lookY, lookZ) - origin);
    vec3 right = normalize(cross(forward, vec3(0., 1., 0.)));
    vec3 up = normalize(cross(right, forward));
    float bank = clamp((flightPath(lookZ + 1.4) - flightPath(lookZ - 1.4)) * .075, -.16, .16);
    vec3 bankedRight = right * cos(bank) + up * sin(bank);
    vec3 bankedUp = up * cos(bank) - right * sin(bank);
    vec3 ray = normalize(forward * 1.48 + bankedRight * p.x + bankedUp * p.y);

    float travel = .05;
    float previousTravel = travel;
    const float farDistance = 92.;
    float hit = 0.;
    vec3 position = origin;
    // The old 44 steps capped at .52 could reach only ~23 world units,
    // cutting off ridges well before the nominal horizon. Keep small steps
    // near surfaces, but allow longer strides through open valley air.
    for (int i = 0; i < 104; i++) {
      if (float(i) >= uValleySteps) break;
      position = origin + ray * travel;
      float clearance = position.y - valleyHeight(position.xz);
      if (clearance < .018) { hit = 1.; break; }
      previousTravel = travel;
      travel += clamp(clearance * .38, .035, 1.8);
      if (travel > farDistance) break;
    }

    float horizon = pow(max(0., 1. - abs(ray.y + .02)), 18.);
    vec3 sky = chroma(ray.x * .08 + t * .012, .018 + horizon * .075);
    sky += vec3(.015, .008, .035) + vec3(.08, .025, .12) * max(0., ray.y) * uHigh;
    if (hit < .5) return sky;

    // Refine the first intersection so longer air steps don't turn nearby
    // ridgelines into visibly coarse terraces.
    for (int i = 0; i < 5; i++) {
      float midpoint = (previousTravel + travel) * .5;
      vec3 samplePoint = origin + ray * midpoint;
      if (samplePoint.y - valleyHeight(samplePoint.xz) < .018) travel = midpoint;
      else previousTravel = midpoint;
    }
    position = origin + ray * travel;

    float epsilon = .07;
    float height = valleyHeight(position.xz);
    vec3 normal = normalize(vec3(
      valleyHeight(position.xz - vec2(epsilon, 0.)) - valleyHeight(position.xz + vec2(epsilon, 0.)),
      epsilon * 2.,
      valleyHeight(position.xz - vec2(0., epsilon)) - valleyHeight(position.xz + vec2(0., epsilon))
    ));
    float diffuse = .22 + .78 * max(0., dot(normal, normalize(vec3(-.45, .82, -.34))));
    float localCenter = flightPath(position.z);
    float lateral = abs(position.x - localCenter);
    float bin = spectrumAt(clamp(.02 + lateral * .055 + hash21(floor(position.xz)) * .14, .01, .94));
    float altitude = smoothstep(-1.4, 3.2, height);
    vec3 material = chroma(position.x * .025 + position.z * .007 - uFlowTime * .018 + bin * .16, .17 + bin * .42);

    vec2 blockUv = fract(position.xz * vec2(1.15, .62));
    float blockEdge = min(min(blockUv.x, 1. - blockUv.x), min(blockUv.y, 1. - blockUv.y));
    float topGrid = 1. - smoothstep(.018, .075, blockEdge);
    float terrace = 1. - smoothstep(.018, .09, abs(fract(height * 7.) - .5));
    float edgeLight = max(topGrid, terrace * (1. - normal.y));
    // Distant detail resolves into continuous ridges rather than flickering
    // subpixel grids, strengthening the foreground / horizon separation.
    float detailVisibility = 1. - smoothstep(20., 72., travel);
    edgeLight *= detailVisibility;
    float musicRidge = .72 + bin * 2.75 + uSub * .34;
    float crestLine = smoothstep(.18, .025, abs(lateral - musicRidge)) * smoothstep(.12, .78, 1. - normal.y);
    float contour = 1. - smoothstep(.018, .075, abs(fract((height + bin * .28) * 4.2) - .5));
    vec3 color = material * diffuse * (.19 + altitude * .38);
    color += chroma(position.z * .012 + bin, edgeLight * (.38 + uHigh * .54));
    color += chroma(position.z * .014 - t * .035 + bin, crestLine * (1.05 + uBassHit * 1.5));
    color += chroma(height * .11 + bin, contour * detailVisibility * (.08 + uPresence * .22) * smoothstep(.5, 3.8, lateral));
    color += vec3(1.2, .72, 1.35) * pow(max(0., dot(reflect(ray, normal), vec3(0., 1., 0.))), 12.) * (.08 + uHigh * .2);
    color += material * bin * bin * (.72 + uBeat * .6) * smoothstep(.7, 3.8, lateral);
    float fog = 1. - exp(-travel * .022);
    float horizonBlend = smoothstep(64., farDistance, travel);
    return mix(color, sky, max(fog * .86, horizonBlend));
  }

  vec3 reactorScene(vec2 p, float t) {
    float radius = length(p);
    float angle = atan(p.y, p.x);
    float angular = fract((angle + PI) / (2. * PI));
    float cells = 72.;
    float id = floor(angular * cells);
    float centerAngle = (id + .5) / cells * 2. * PI - PI;
    float arcDistance = abs(atan(sin(angle - centerAngle), cos(angle - centerAngle))) * max(radius, .2);
    float bin = spectrumAt(fract(id / cells * .92));
    float barStart = .53;
    float barEnd = barStart + .055 + bin * .22 + uBassHit * .06;
    float radialBar = smoothstep(barStart - .008, barStart + .008, radius) * smoothstep(barEnd + .01, barEnd - .01, radius);
    float bar = radialBar * smoothstep(.012, .004, arcDistance);
    vec3 color = chroma(angular + t * .025, bar * (1.1 + bin * 1.4));
    float ringOne = .005 / (abs(radius - .49 - uBass * .035) + .005);
    float ringTwo = .003 / (abs(radius - .78) + .004);
    color += chroma(angle * .08 - t * .035, ringOne * (.16 + uBass * .24) + ringTwo * (.08 + uHigh * .12));
    float slash = abs(fract((p.x + p.y * .82) * 4.7 - uFlowTime * .8) - .5);
    float slats = smoothstep(.15, .07, slash) * smoothstep(.48, .04, radius);
    color += chroma(p.x * .12 + t * .02, slats * (.22 + uMid * .55));
    vec2 shardCell = floor((p + 1.4) * 13.);
    vec2 shardUv = fract((p + 1.4) * 13.) - .5;
    float shardSeed = hash21(shardCell);
    float shard = smoothstep(.09, .01, length(shardUv)) * step(.84 - uHigh * .1, shardSeed);
    color += chroma(shardSeed + t * .05, shard * (1. + uAirHit * 1.7));
    color += vec3(1.5, .68, 1.4) * exp(-radius * radius * 13.) * (.18 + uBeat * .65);
    return color;
  }

  ${horizonAsciiGLSL}
  ${horizonWavesGLSL}

  vec3 horizonScene(vec2 p, float t) {
    vec3 color = vec3(0.);
    float baseline = -.08;
    float columns = ${HORIZON_COLUMNS}.;
    float normalizedX = clamp((p.x + 1.18) / 2.36, 0., 1.);
    float id = min(columns - 1., floor(normalizedX * columns));
    float center = (id + .5) / columns * 2.36 - 1.18;
    float bandIndex = abs(id - (columns - 1.) * .5) - .5;
    float binPosition = bandIndex / (columns * .5 - 1.);
    float frequency = uHorizonBands[int(bandIndex)];
    float bin = spectrumAt(frequency);
    float held = peakAt(frequency);
    float bassLift = uBassHit * .035 * (1. - smoothstep(0., .45, binPosition));
    float towerHeight = .035 + bin * (.36 + uBass * .42) + bassLift;
    float tower = smoothstep(.014, .006, abs(p.x - center)) * smoothstep(baseline - .012, baseline + .012, p.y) * smoothstep(baseline + towerHeight + .012, baseline + towerHeight - .012, p.y);
    color += chroma(normalizedX * .78 + t * .018, tower * (1.15 + bin * 1.25));
    float crown = .004 / (abs(p.y - baseline - towerHeight) + .006) * smoothstep(.02, .008, abs(p.x - center));
    color += vec3(1.4, 1.1, .75) * crown * bin * .22;
    float peakHeight = .035 + max(held, bin) * (.36 + uBass * .42) + bassLift;
    float peakCap = smoothstep(.018, .006, abs(p.x - center)) * smoothstep(.014, .003, abs(p.y - baseline - peakHeight));
    color += vec3(1.8, .75, .34) * peakCap * (.55 + held * .9);
    float horizonGlow = .009 / (abs(p.y - baseline) + .012);
    color += chroma(.12 + t * .02, horizonGlow * (.09 + uBass * .19));

    color += horizonWaves(p, baseline);
    color += horizonAscii(p, t, max(tower, peakCap));
    return color;
  }

  vec3 radialScene(vec2 p, float t) {
    p *= .97 - uBass * .018 - uBeat * .01;
    vec3 color = vec3(0.);
    float radius = length(p);
    float angle = atan(p.y, p.x) - uRadialAngle;
    float angular = fract((angle + PI) / (2. * PI));
    float columns = 36.;
    float id = floor(angular * columns);
    float centerAngle = (id + .5) / columns * 2. * PI - PI;
    float cellWidth = abs(atan(sin(angle - centerAngle), cos(angle - centerAngle))) * max(radius, .18);
    float bin = spectrumAt(fract(id / columns * .9));
    float inner = .19 + uBass * .012 + uBeat * .008;
    float outer = inner + .16 + bin * .66;
    float body = smoothstep(.022, .009, cellWidth) * smoothstep(inner, inner + .012, radius) * smoothstep(outer + .015, outer, radius);
    float radialEdge = max(.004 / (abs(radius - inner) + .005), .004 / (abs(radius - outer) + .005));
    float sideEdge = .003 / (cellWidth + .004) * smoothstep(inner, inner + .02, radius) * smoothstep(outer, outer - .02, radius);
    color += chroma(angular + bin * .22 + uRadialAngle * .15, body * (.12 + bin * .22) + (radialEdge + sideEdge) * (.12 + bin * .26 + uBeat * .045));
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      float depth = fract(fi / 5. + uRadialAngle * .35);
      float ringRadius = .13 + depth * 1.18;
      float ring = .003 / (abs(radius - ringRadius) + .004);
      float gate = smoothstep(.16, .3, fract(angular * (18. + fi * 3.) + depth));
      color += chroma(depth + fi * .11, ring * gate * (.055 + uHigh * .08));
    }
    return color;
  }

  vec3 arcScene(vec2 p, float t) {
    float radius = length(p);
    float angle = atan(p.y, p.x);
    float angular = fract((angle + PI) / (2. * PI));
    float bin = spectrumAt(angular * .92);
    float ringRadius = .42 + bin * .14 + sin(angle * 5. - uFlowTime * 1.3) * (.018 + uHigh * .025);
    float ring = .006 / (abs(radius - ringRadius) + .006);
    vec3 color = chroma(angular + t * .045, ring * (.34 + bin * .72 + uBeat * .24));
    float innerRing = .003 / (abs(radius - ringRadius * .84) + .004);
    color += vec3(.3, .9, 1.4) * innerRing * (.09 + uHigh * .12);
    for (int i = 0; i < 8; i++) {
      float fi = float(i);
      float theta = fi / 8. * 2. * PI + uFlowTime * (.08 + fi * .012);
      float crooked = theta + sin(radius * (15. + fi) - uFlowTime * (2. + fi * .08) + fi) * (.035 + uHigh * .11);
      float angleDistance = abs(atan(sin(angle - crooked), cos(angle - crooked))) * max(radius, .14);
      float bolt = .0025 / (angleDistance + .003) * smoothstep(1.25, .18, radius) * smoothstep(.06, .22, radius);
      float flicker = .45 + .55 * step(.42, hash21(vec2(fi, floor(uFlowTime * 12.))));
      color += chroma(fi * .13 + t * .07, bolt * flicker * (.08 + uHigh * .22 + uAirHit * .25));
    }
    vec2 flareCell = floor((p + 1.5) * 8.);
    vec2 flareUv = fract((p + 1.5) * 8.) - .5;
    float flareSeed = hash21(flareCell);
    float flareCore = smoothstep(.11, .015, length(flareUv)) * step(.9 - uHigh * .08, flareSeed);
    float flareRay = .002 / (min(abs(flareUv.x), abs(flareUv.y)) + .003) * step(.93, flareSeed);
    color += chroma(flareSeed + t * .03, flareCore * 1.7 + flareRay * .045);
    return color;
  }

  vec3 sceneColor(vec2 p, float t, float mode) {
    if (mode < .5) {
      vec3 foreground = bloomScene(p, t) + bloomSoundWaves() + smokeLayer(p, t, .82, 0.);
      vec3 flow = texture2D(uGeissScene, vUv).rgb;
      // Geiss is an underlay here: compress its highlights and make room for
      // the flower, sound-wave rings and smoke instead of bleaching their glow.
      flow /= 1. + flow * .65;
      float light = dot(foreground, vec3(.2126, .7152, .0722));
      vec2 screen = (vUv * 2. - 1.) * uResolution / min(uResolution.x, uResolution.y);
      float reveal = mix(.12, 1., smoothstep(.18, .82, length(screen)));
      return foreground + flow * .42 * reveal / (1. + light * 2.4);
    }
    if (mode < 1.5) return prismScene(p, t);
    if (mode < 2.5) return vec3(0.); // Retired Orbit renderer ID; not in the scene catalogue.
    if (mode < 3.5) return signalScene(p, t);
    if (mode < 4.5) return texture2D(uTorusScene, vUv).rgb;
    if (mode < 5.5) return warpScene(p, t) + smokeLayer(p, t, .68, 0.);
    if (mode < 6.5) return vectorScene(p, t) + smokeLayer(p, t, .48, 1.);
    if (mode < 7.5) return reactorScene(p, t);
    if (mode < 8.5) return horizonScene(p, t);
    if (mode < 9.5) return radialScene(p, t);
    if (mode < 10.5) return arcScene(p, t) + smokeLayer(p, t, .6, 0.);
    if (mode < 11.5) return texture2D(uCrystalScene, vUv).rgb;
    if (mode < 12.5) return texture2D(uRoadScene, vUv).rgb;
    if (mode < 13.5) return texture2D(uEndlessScene, vUv).rgb;
    if (mode < 14.5) return texture2D(uFlyoverScene, vUv).rgb;
    return texture2D(uGeissScene, vUv).rgb;
  }
  void main() {
    vec2 p = (gl_FragCoord.xy * 2. - uResolution.xy) / min(uResolution.x, uResolution.y);
    vec2 screenP = p;
    float t = uTime;
    float valleyMode = step(5.5, uMode) * (1. - step(6.5, uMode));
    float motionScale = mix(1., .14, valleyMode);
    float radialMode = step(8.5, uMode) * (1. - step(9.5, uMode));
    float horizonMode = step(7.5, uMode) * (1. - step(8.5, uMode));
    motionScale = mix(motionScale, .08, radialMode);
    motionScale *= 1. - horizonMode;
    p *= (.92 - uBass * .08 * motionScale - uBassHit * .055 * motionScale) * (1. - uImpact * .045 * motionScale);
    p.x += sin(p.y * (2. + uMid * 3.) + t * .2) * (uLevel * .022 + uMidHit * .035) * motionScale;
    float shock = exp(-pow((length(p) - uShockwave) * 34., 2.)) * (1. - smoothstep(1.15, 1.45, uShockwave));
    p *= 1. - shock * (.035 + uBassHit * .08 + uImpact * .035) * motionScale;
    float kickAngle = sin(floor(t * 13.) * 18.731) * uImpact * .012 * motionScale;
    p = mat2(cos(kickAngle), -sin(kickAngle), sin(kickAngle), cos(kickAngle)) * p;
    p += vec2(sin(t * 37.), cos(t * 29.)) * uImpact * .005 * motionScale;
    vec3 currentScene = sceneColor(p, t, uMode);
    float currentLuminance = dot(currentScene, vec3(.2126, .7152, .0722));
    vec3 backdrop = colorBarBackdrop(screenP, t, currentLuminance) * barSceneVisibility(uMode);
    vec3 current = backdrop + currentScene;
    vec3 color = current;
    float torusMode = step(3.5, uMode) * (1. - step(4.5, uMode));
    float sceneFx = (1. - step(10.5, uMode)) * (1. - torusMode) * (1. - horizonMode);
    float halo = exp(-length(p) * 2.2) * (.035 + uBass * .06) * sceneFx;
    color += chroma(length(p) + t * .02, halo);
    float shockVisibility = (uMode > 5.5 ? .14 : 1.) * (1. - valleyMode) * sceneFx;
    color += chroma(uShockwave * .22 - t * .015, shock * (.18 + uBass * .32 + uBassHit * .5) * shockVisibility);
    color += vec3(1., .34, .08) * uImpact * (.025 + uHigh * .055) * sceneFx;
    color *= 1. - smoothstep(.62, 1.45, length(p)) * mix(.2, .72, sceneFx);
    color *= mix(1., 1.08 + uLevel * .62, sceneFx);
    gl_FragColor = vec4(min(max(color, 0.), vec3(16.)), 1.);
  }
`;

export class VisualEngine {
  constructor(container) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    this.renderer.setClearColor(0x040309, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    container.append(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.spectrumData = new Uint8Array(256);
    this.peakData = new Uint8Array(256);
    this.springSpectrum = new Float32Array(256);
    this.springVelocity = new Float32Array(256);
    this.spectrumTexture = new THREE.DataTexture(this.spectrumData, 256, 1, THREE.RedFormat, THREE.UnsignedByteType);
    this.peakTexture = new THREE.DataTexture(this.peakData, 256, 1, THREE.RedFormat, THREE.UnsignedByteType);
    this.spectrumTexture.minFilter = THREE.LinearFilter;
    this.spectrumTexture.magFilter = THREE.LinearFilter;
    this.spectrumTexture.generateMipmaps = false;
    this.spectrumTexture.needsUpdate = true;
    this.peakTexture.minFilter = THREE.LinearFilter;
    this.peakTexture.magFilter = THREE.LinearFilter;
    this.peakTexture.generateMipmaps = false;
    this.peakTexture.needsUpdate = true;
    this.smoke = new SmokeSimulation(this.renderer);
    this.previousSmoke = new SmokeSimulation(this.renderer);
    this.procedural = new ProceduralScenes(this.renderer, this.spectrumTexture);
    this.geiss = new GeissFlow(this.renderer);
    this.horizonWaves = new HorizonWaves();
    this.horizonWaveTexture = new THREE.DataTexture(this.horizonWaves.data, HORIZON_WAVE_SAMPLES, HORIZON_WAVE_COUNT, THREE.RedFormat, THREE.UnsignedByteType);
    this.horizonWaveTexture.minFilter = this.horizonWaveTexture.magFilter = THREE.LinearFilter;
    this.horizonWaveTexture.generateMipmaps = false;
    this.horizonWaveTexture.needsUpdate = true;
    this.bloomWaves = new BloomWaves();
    this.bloomWaveTexture = new THREE.DataTexture(this.bloomWaves.data, BLOOM_WAVE_SAMPLES, BLOOM_RING_COUNT, THREE.RedFormat, THREE.UnsignedByteType);
    this.bloomWaveTexture.minFilter = THREE.LinearFilter;
    this.bloomWaveTexture.magFilter = THREE.LinearFilter;
    this.bloomWaveTexture.generateMipmaps = false;
    this.bloomWaveTexture.needsUpdate = true;
    this.uniforms = {
      uResolution: { value: new THREE.Vector2(2, 2) },
      uValleySteps: { value: 72 },
      uHorizonBands: { value: HORIZON_BANDS },
      uHorizonAscii: { value: createHorizonAsciiAtlas() },
      uHorizonAsciiGrid: { value: new THREE.Vector2(1, 1) },
      uHorizonWaveforms: { value: this.horizonWaveTexture },
      uHorizonLines: { value: this.horizonWaves.lines },
      uTime: { value: 0 }, uFlowTime: { value: 0 }, uFlightTime: { value: 0 }, uLevel: { value: 0 }, uBass: { value: 0 }, uMid: { value: 0 },
      uRadialAngle: { value: 0 },
      uHigh: { value: 0 }, uBeat: { value: 0 }, uMode: { value: 0 },
      uImpact: { value: 0 }, uBassHit: { value: 0 }, uMidHit: { value: 0 },
      uAirHit: { value: 0 }, uShockwave: { value: 2 }, uBarBeat: { value: 0 }, uPalette: { value: 0 },
      uSub: { value: 0 }, uPresence: { value: 0 }, uAir: { value: 0 },
      uSpectrum: { value: this.spectrumTexture },
      uPeakSpectrum: { value: this.peakTexture },
      uSmoke: { value: this.smoke.texture },
      uTorusScene: { value: this.procedural.texture(4) },
      uCrystalScene: { value: this.procedural.texture(11) },
      uRoadScene: { value: this.procedural.texture(12) },
      uEndlessScene: { value: this.procedural.texture(13) },
      uFlyoverScene: { value: this.procedural.texture(14) },
      uGeissScene: { value: this.geiss.texture },
      uBloomWaveforms: { value: this.bloomWaveTexture }, uBloomRings: { value: this.bloomWaves.rings },
      uSmokeTexel: { value: new THREE.Vector2(1 / 192, 1 / 108) },
    };
    const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: this.uniforms });
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
    this.post = new PostProcessor(this.renderer);
    this.mixer = new SceneMixer(this.renderer);
    this.elapsed = 0; this.flowElapsed = 0; this.flowVelocity = 1; this.flightElapsed = 0; this.flightVelocity = .58;
    this.radialMotion = new RadialMotion();
    this.paused = false; this.mode = 0; this.blend = new SceneBlend(0); this.impact = 0; this.shockwave = 2;
    this.palette = 0; this.previousPalette = 0; this.requestedPalette = 0;
    this.previousBands = new THREE.Vector3();
    this.bandHits = new THREE.Vector3();
    this.quality = "auto";
    this.pixelRatio = Math.min(window.devicePixelRatio, 1.5);
    this.smoothedFrameMs = 16.7;
    this.performanceFrames = 0;
    this.performanceSeconds = 0;
    this.fps = 60;
    this.adaptiveCooldown = 0;
    this.resize = this.resize.bind(this);
    this.applySize();
    window.addEventListener("resize", this.resize);
  }
  setMode(mode, immediate = false) {
    this.blend.request(mode, immediate);
  }
  setPalette(palette) {
    this.requestedPalette = palette;
  }
  setPaused(paused) { this.paused = paused; }
  setQuality(quality) {
    this.quality = quality;
    this.uniforms.uValleySteps.value = { auto: 72, high: 88, ultra: 104 }[quality] || 72;
    const caps = { auto: 1.5, high: 1.65, ultra: 2 };
    this.pixelRatio = Math.min(window.devicePixelRatio, caps[quality] || 1.5);
    this.adaptiveCooldown = 240;
    this.applySize();
  }
  applySize() {
    const width = window.innerWidth, height = window.innerHeight;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(width, height);
    const drawingSize = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.uniforms.uResolution.value.copy(drawingSize);
    this.uniforms.uHorizonAsciiGrid.value.set(...horizonAsciiGrid(width, height));
    this.post.resize(Math.round(drawingSize.x), Math.round(drawingSize.y));
    this.mixer.resize(Math.round(drawingSize.x), Math.round(drawingSize.y));
    this.smoke.resize(width, height, this.quality);
    this.previousSmoke.resize(width, height, this.quality);
    this.procedural.resize(drawingSize.x, drawingSize.y, this.quality);
    this.geiss.resize(drawingSize.x, drawingSize.y, this.quality);
  }
  resize() {
    const cap = this.quality === "ultra" ? 2 : this.quality === "high" ? 1.65 : 1.75;
    this.pixelRatio = Math.min(this.pixelRatio, window.devicePixelRatio, cap);
    this.applySize();
  }
  updatePerformance(delta) {
    if (delta <= 0 || delta > .1) return;
    this.smoothedFrameMs += (delta * 1000 - this.smoothedFrameMs) * .06;
    this.performanceFrames += 1;
    this.performanceSeconds += delta;
    this.adaptiveCooldown = Math.max(0, this.adaptiveCooldown - 1);
    if (this.performanceFrames < 150) return;
    this.fps = Math.round(this.performanceFrames / this.performanceSeconds);
    if (this.quality === "auto" && this.adaptiveCooldown === 0) {
      const maxRatio = Math.min(window.devicePixelRatio, 1.75);
      let nextRatio = this.pixelRatio;
      if (this.fps < 48) nextRatio = Math.max(.8, this.pixelRatio - .15);
      else if (this.fps > 58) nextRatio = Math.min(maxRatio, this.pixelRatio + .1);
      if (Math.abs(nextRatio - this.pixelRatio) > .04) {
        this.pixelRatio = nextRatio;
        this.adaptiveCooldown = 240;
        this.applySize();
      }
    }
    this.performanceFrames = 0;
    this.performanceSeconds = 0;
  }
  getPerformanceInfo() {
    return { quality: this.quality, fps: this.fps, pixelRatio: this.pixelRatio };
  }
  updateSpectrum(frequency, delta) {
    const available = Math.max(1, Math.min(frequency.length - 1, 700));
    const step = Math.min(delta, .05);
    for (let index = 0; index < this.spectrumData.length; index += 1) {
      const normalized = index / (this.spectrumData.length - 1);
      const sourceIndex = Math.min(available, Math.floor(normalized * normalized * available));
      const target = (frequency[sourceIndex] || 0) / 255;
      this.springVelocity[index] += (target - this.springSpectrum[index]) * step * 72;
      this.springVelocity[index] *= Math.exp(-step * 10.5);
      this.springSpectrum[index] = Math.min(1, Math.max(0, this.springSpectrum[index] + this.springVelocity[index] * step * 5.2));
      const value = Math.round(this.springSpectrum[index] * 255);
      this.spectrumData[index] = value;
      this.peakData[index] = value >= this.peakData[index]
        ? value
        : Math.max(0, this.peakData[index] - Math.max(1, Math.round(step * (18 + normalized * 24))));
    }
    this.spectrumTexture.needsUpdate = true;
    this.peakTexture.needsUpdate = true;
  }
  updateGeiss(audio, delta) {
    const usesFlow = mode => mode === 0 || mode === GEISS_MODE;
    const current = usesFlow(this.mode);
    const outgoing = this.blend.active && usesFlow(this.blend.previous);
    // Bloom and Geiss Flow share one live history. Advance once per frame,
    // not once per scene, including when both are visible in a crossfade.
    if (current || outgoing) this.geiss.render(audio, delta,
      current ? this.palette : this.previousPalette, this.paused);
    this.uniforms.uGeissScene.value = this.geiss.texture;
  }
  render(audio, delta) {
    this.updatePerformance(delta);
    this.blend.update(delta, this.paused);
    if (this.mode !== this.blend.mode) {
      this.previousPalette = this.palette;
      this.mode = this.blend.mode;
      this.uniforms.uMode.value = this.mode;
      [this.smoke, this.previousSmoke] = [this.previousSmoke, this.smoke];
      this.smoke.reset();
      this.post.resetHistory();
    }
    this.palette = this.requestedPalette;
    this.radialMotion.update(audio, delta, this.paused);
    const bloomVisible = this.mode === 0 || (this.blend.active && this.blend.previous === 0);
    if (this.bloomWaves.update(audio, delta, this.paused, bloomVisible)) this.bloomWaveTexture.needsUpdate = true;
    const horizonVisible = this.mode === 8 || (this.blend.active && this.blend.previous === 8);
    if (this.horizonWaves.update(audio, delta, this.paused, horizonVisible)) this.horizonWaveTexture.needsUpdate = true;
    if (!this.paused) this.elapsed += Math.min(delta, 0.05) * (0.75 + audio.level * 0.45);
    if (!this.paused) {
      const targetVelocity = 1.15 + audio.level * 1.55 + audio.bass * .8 + audio.high * .35;
      this.flowVelocity += (targetVelocity - this.flowVelocity) * Math.min(1, delta * 2.8);
      if (audio.transient) this.flowVelocity += .7 + audio.bass * .8;
      this.flowElapsed += Math.min(delta, .05) * this.flowVelocity;
      const targetFlightVelocity = .46 + audio.level * .18 + audio.bass * .09;
      this.flightVelocity += (targetFlightVelocity - this.flightVelocity) * Math.min(1, delta * .85);
      if (audio.transient) this.flightVelocity += .012;
      this.flightElapsed += Math.min(delta, .05) * this.flightVelocity;
    }
    if (audio.transient) { this.impact = 1; this.shockwave = .02; }
    else this.impact *= Math.exp(-delta * 8.5);
    this.shockwave = Math.min(2, this.shockwave + delta * (1.05 + audio.bass * .5));
    const currentBands = [audio.bass, audio.mid, audio.high];
    for (let index = 0; index < 3; index += 1) {
      const rise = Math.max(0, currentBands[index] - this.previousBands.getComponent(index));
      const decay = Math.exp(-delta * (index === 0 ? 5.5 : index === 1 ? 7.5 : 10.));
      this.bandHits.setComponent(index, Math.max(this.bandHits.getComponent(index) * decay, Math.min(1, rise * (index === 0 ? 5.5 : 7.5))));
      this.previousBands.setComponent(index, currentBands[index]);
    }
    this.updateSpectrum(audio.frequency, delta);
    this.uniforms.uTime.value = this.elapsed;
    this.uniforms.uFlowTime.value = this.flowElapsed;
    this.uniforms.uFlightTime.value = this.flightElapsed;
    this.uniforms.uRadialAngle.value = this.radialMotion.angle;
    this.uniforms.uLevel.value = audio.level; this.uniforms.uBass.value = audio.bass;
    this.uniforms.uMid.value = audio.mid; this.uniforms.uHigh.value = audio.high; this.uniforms.uBeat.value = audio.beat;
    this.uniforms.uImpact.value = this.impact;
    this.uniforms.uBassHit.value = this.bandHits.x; this.uniforms.uMidHit.value = this.bandHits.y;
    this.uniforms.uAirHit.value = this.bandHits.z; this.uniforms.uShockwave.value = this.shockwave;
    this.uniforms.uBarBeat.value = audio.barBeat || 0;
    this.uniforms.uSub.value = audio.bands?.sub || 0;
    this.uniforms.uPresence.value = audio.bands?.presence || 0;
    this.uniforms.uAir.value = audio.bands?.air || 0;
    this.updateGeiss(audio, delta);
    const prepare = (mode, palette, smoke) => {
      smoke.update(audio, this.spectrumData, delta, mode, mode, 1, this.paused);
      this.uniforms.uMode.value = mode; this.uniforms.uPalette.value = palette;
      this.uniforms.uSmoke.value = smoke.texture;
      this.uniforms.uSmokeTexel.value.copy(smoke.uniforms.uTexel.value);
      this.procedural.render(mode, audio, delta, palette, this.spectrumData, this.paused);
      this.uniforms.uTorusScene.value = this.procedural.texture(4);
      this.uniforms.uCrystalScene.value = this.procedural.texture(11);
      this.uniforms.uRoadScene.value = this.procedural.texture(12);
      this.uniforms.uEndlessScene.value = this.procedural.texture(13);
      this.uniforms.uFlyoverScene.value = this.procedural.texture(14);
    };
    if (this.blend.active) {
      this.mixer.render(this.scene, this.camera, this.blend.weight, index => index === 0
        ? prepare(this.blend.previous, this.previousPalette, this.previousSmoke)
        : prepare(this.mode, this.palette, this.smoke));
    } else prepare(this.mode, this.palette, this.smoke);
    const mix = (a, b) => this.blend.active ? a + (b - a) * this.blend.weight : b;
    const impactScale = mode => mode === 9 || mode === GEISS_MODE || isProceduralMode(mode) ? .15 : 1;
    const sceneFx = mode => mode === 8 || mode === 14 || mode === GEISS_MODE ? 0 : 1;
    const postAudio = { ...audio, beat: audio.beat * mix(impactScale(this.blend.previous), impactScale(this.mode)) };
    this.post.render(this.blend.active ? this.mixer.scene : this.scene,
      this.blend.active ? this.mixer.camera : this.camera, postAudio, this.elapsed, 1,
      mix(sceneFx(this.blend.previous), sceneFx(this.mode)));
    return this.getPerformanceInfo();
  }
}
