import * as THREE from "three";
import { NeonMarchCharacter } from './neon-march-character.js';
import { CyberReflections } from './cyber-reflections.js';

// Adapted from the user's neon/data-stream tunnel example (September 2026).
// One world/mesh through Auralis; no CDN, GUI, extra renderer or composer.
export const CYBER_TUNNEL_MODE = 22;
// Baseline preset transcribed from the supplied Cyber Tunnel settings screenshots.
export const CYBER_TUNNEL_SETTINGS = Object.freeze({
  speed: .2, mouseParallax: 5, rgbShiftAmount: .001,
  cameraOffsetY: 3, reflectionStrength: .35, ghostIntensity: .864,
  matrixIntensity: .25, depthFade: .001, showRings: true, ringCount: 10,
  topColor: 0x0a198c, bottomColor: 0x11133b, bloomStrength: 1,
});
export const CYBER_TUNNEL_QUALITY = { auto: { edge: 800 }, high: { edge: 1100 }, ultra: { edge: 1500 } };
export const CYBER_TUNNEL_PALETTES = [
  [CYBER_TUNNEL_SETTINGS.topColor,CYBER_TUNNEL_SETTINGS.bottomColor,0x35cfff,0xff408c],
  [0x391249,0x160b1c,0xff6633,0xffcc77],
  [0x063b59,0x061521,0x20edd0,0x369bff],
  [0x361414,0x120b0b,0xff5324,0xffdbab],
];
const TAU=Math.PI*2;
const level=v=>Number.isFinite(v)?THREE.MathUtils.clamp(v,0,1):0;

export class CyberTunnelMotion {
  constructor(){
    this.progress=0;this.time=0;this.audio=new THREE.Vector4();
    this.drive=0;this.pulse=0;this.wasTransient=false;this.lastBeat=-1;this.emissions=0;
  }
  update(audio,delta){
    const dt=Number.isFinite(delta)?THREE.MathUtils.clamp(delta,0,.05):0;if(!dt)return 0;
    const ease=1-Math.exp(-3*dt);
    const integral=(old,target)=>target*dt+(old-target)*ease/3;
    this.progress=(this.progress+CYBER_TUNNEL_SETTINGS.speed*.1*dt+.006*integral(this.audio.x,level(audio.bass))+.004*integral(this.audio.w,level(audio.level)))%1;
    this.time+=dt+.25*integral(this.audio.y,level(audio.mid));
    [audio.bass,audio.mid,audio.high,audio.level].forEach((v,i)=>this.audio.setComponent(i,THREE.MathUtils.lerp(this.audio.getComponent(i),level(v),ease)));
    if(audio.transient&&(!this.wasTransient||(Number.isFinite(audio.beatCount)&&audio.beatCount!==this.lastBeat))){
      this.drive=Math.max(this.drive,.65+level(audio.bass)*.35);this.lastBeat=audio.beatCount;this.emissions++;
    }
    this.wasTransient=Boolean(audio.transient);
    const attack=Math.exp(-20*dt),release=Math.exp(-4.5*dt);
    this.pulse=this.pulse*attack+this.drive*20/15.5*(release-attack);this.drive*=release;
    return dt;
  }
}

export function createCyberPath(){
  // Do not duplicate the endpoint of a closed spline.
  const points=Array.from({length:400},(_,i)=>{
    const a=i/400*TAU;return new THREE.Vector3(Math.cos(a)*350,Math.sin(a*3)*35,Math.sin(a*2)*250);
  });
  const curve=new THREE.CatmullRomCurve3(points,true);curve.arcLengthDivisions=4096;
  curve.computeFrenetFrames=function(segments){
    const tangents=[],normals=[],binormals=[],up=new THREE.Vector3(0,1,0);
    for(let i=0;i<=segments;i++){
      const tangent=this.getTangentAt(i/segments).normalize();
      const axis=Math.abs(tangent.y)>.98?new THREE.Vector3(0,0,1):up;
      const binormal=new THREE.Vector3().crossVectors(tangent,axis).normalize();
      tangents.push(tangent);binormals.push(binormal);normals.push(new THREE.Vector3().crossVectors(binormal,tangent).normalize());
    }
    for(const array of [tangents,normals,binormals])array[segments].copy(array[0]);
    return {tangents,normals,binormals};
  };
  return curve;
}

export function createCyberGlyphTexture(){
  // Seeded geometric data glyphs, not font-dependent characters or remote assets.
  const size=256,data=new Uint8Array(size*size);let seed=44117;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let gy=0;gy<16;gy++)for(let gx=0;gx<16;gx++){
    const brightness=130+Math.floor(random()*125);
    for(let stroke=0;stroke<5;stroke++){
      const x1=3+Math.floor(random()*5)*2,y1=3+Math.floor(random()*5)*2;
      const x2=3+Math.floor(random()*5)*2,y2=3+Math.floor(random()*5)*2;
      const steps=Math.max(Math.abs(x2-x1),Math.abs(y2-y1),1);
      for(let k=0;k<=steps;k++){
        const x=Math.round(x1+(x2-x1)*k/steps),y=Math.round(y1+(y2-y1)*k/steps);
        data[(gy*16+y)*size+gx*16+x]=brightness;
      }
    }
  }
  const texture=new THREE.DataTexture(data,size,size,THREE.RedFormat);
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;
  return texture;
}

const vertexShader = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

void main() {
    vUv = uv;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
}
        `;
const fragmentShader = /* glsl */ `
uniform float uTime;
uniform float uPalette;
uniform vec3 uAccent1,uAccent2;
vec3 paletteColor(vec3 color){
  if(uPalette<.5)return color;
  float blend=color.r/max(.001,color.r+color.b);
  return mix(uAccent1,uAccent2,blend)*max(color.r,max(color.g,color.b));
}
uniform vec3 uTopColor;
uniform vec3 uBottomColor;
uniform float uAngleOffset;
uniform float uIntensity;
uniform float uDepthFade;
uniform float uReflectionStrength;

uniform float uShowRings;
uniform float uRingCount;
uniform float uGhostIntensity; 

// Matrix Layer
uniform sampler2D uMatrixTex;
uniform float uMatrixIntensity;

varying vec2 vUv;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

float rand(float n) { return fract(sin(n) * 43758.5453123); }

vec3 addSegmentedLine(vec3 color, float uvPrimary, float targetPrimary, float width, float uvSecondary, float id, float time, float speedMult, bool isRing) {
    // --- NEW: Offset lines from each other ---
    // Add a random vertical shift so they don't look like strict parallel lanes
    float shiftedTarget = targetPrimary;
    if (!isRing) {
        shiftedTarget += (rand(id * 8.2) - 0.5) * 0.12; 
    }

    // MASSIVE VARIATION IN THICKNESS
    // Lower width = fatter line, Higher width = thinner line
    float actualWidth = width * (0.1 + rand(id * 4.5) * 12.0);
    float weight = exp(-pow((uvPrimary - shiftedTarget) * actualWidth, 2.0));
    
    // Randomize speed
    float speed = (0.5 + rand(id) * 4.0) * speedMult;
    float dir = rand(id * 2.1) > 0.5 ? 1.0 : -1.0;
    
    // HUGE VARIATION IN LENGTH: Tiny dashes to massive streaks
    float scale = isRing ? floor(2.0 + rand(id * 1.3) * 6.0) : (1.0 + floor(rand(id * 1.3) * 3000.0)) / 100.0;
    float phase = rand(id * 1.7) * 20.0;
    
    // Fast moving bright dash (the "head" of the laser)
    float movingCoord = uvSecondary * scale + time * speed * dir + phase;
    float dashPos = fract(movingCoord);
    
    // Randomize dash length (from 1% to 94% of its segment)
    float dashLen = 0.01 + rand(id * 3.4) * 0.93; 
    
    // Variable fade for softer (comet-like) or harder edges
    float dashFade = 0.01 + rand(id * 7.1) * 0.08; 
    float mask = smoothstep(0.0, dashFade, dashPos) * (1.0 - smoothstep(dashLen, dashLen + dashFade, dashPos));
    
    // Slow moving, broken baseline
    float baseScale = max(1.0, floor(scale * 100.0 * (0.02 + rand(id * 5.2) * 0.3))) / 100.0; 
    float baseSpeed = speed * 0.1; 
    float baseCoord = uvSecondary * baseScale + time * baseSpeed * dir + phase * 2.0;
    float basePos = fract(baseCoord);
    
    // Length of the background dashes
    float baseLen = 0.1 + rand(id * 2.2) * 0.8; 
    float baseFade = 0.1;
    float baseMask = smoothstep(0.0, baseFade, basePos) * (1.0 - smoothstep(baseLen, baseLen + baseFade, basePos));
    
    // Combine the broken shifting baseline with the fast bright dash
    return paletteColor(color) * weight * (0.25 * baseMask + 0.85 * mask);
}

vec3 addParticleDot(vec3 color, float uvPrimary, float targetPrimary, float width, float uvSecondary, float id, float time, float speedMult) {
    // Randomize particle thickness too
    float actualWidth = width * (0.5 + rand(id * 6.1) * 3.0);
    float weight = exp(-pow((uvPrimary - targetPrimary) * actualWidth, 2.0));
    
    float speed = (2.0 + rand(id) * 4.0) * speedMult; 
    float dir = rand(id * 2.1) > 0.5 ? 1.0 : -1.0;
    
    // Huge scale variation for particles
    float scale = (1000.0 + floor(rand(id * 1.3) * 8000.0)) / 100.0;
    float phase = rand(id * 1.7) * 10.0;
    
    float movingCoord = uvSecondary * scale + time * speed * dir + phase;
    float dashPos = fract(movingCoord);
    
    float dashLen = 0.001 + rand(id * 3.4) * 0.015; 
    float dashFade = 0.005;
    float mask = smoothstep(0.0, dashFade, dashPos) * (1.0 - smoothstep(dashLen, dashLen + dashFade, dashPos));
    
    return paletteColor(color) * weight * mask * 4.0;
}

// --- NEW: Holographic Ghost Layer ---
vec3 getGhostLayer(float h, float uvX, float time, float seed) {
    // 1. Tech Data Panels (faint, slow-moving barcode-like clusters)
    float scroll = uvX * 12.0 + time * 0.3 * (rand(seed) > 0.5 ? 1.0 : -1.0); 
    float idX = floor(scroll);
    float localX = fract(scroll);
    
    // INCREASED: More frequent panel clusters (was 0.85, now 0.70)
    float hasPanel = step(0.70, rand(idX + seed));
    
    // Vertical slices to create a barcode or data-block look
    float idY = floor(h * 80.0);
    float hasBar = step(0.30, rand(idY * 15.0 + idX));
    
    // INCREASED: Higher average brightness during pulse (pow 2.0 instead of 3.0)
    float pulse = pow(sin(time * 1.2 + rand(idX) * 10.0) * 0.5 + 0.5, 2.0);
    float maskX = smoothstep(0.0, 0.2, localX) * (1.0 - smoothstep(0.8, 1.0, localX));
    
    vec3 techColor = mix(vec3(0.2, 0.7, 1.0), vec3(1.0, 0.3, 0.7), rand(idX * 1.1)); 
    // INCREASED: Much brighter base multiplier (was 0.07, now 0.35)
    vec3 panel = techColor * hasPanel * hasBar * maskX * pulse * 0.35;

    // 2. Faint Nebula / Plasma Washes (broad, organic glowing patches)
    float wave = sin(uvX * 6.2831853 + time * 0.5 + seed) * sin(h * 10.0 - time * 0.4 + seed) * 0.5 + 0.5;
    wave = pow(wave, 5.0); 
    vec3 washColor = mix(vec3(0.1, 0.5, 1.0), vec3(0.8, 0.1, 0.5), rand(seed * 2.0));
    vec3 wash = washColor * wave * 0.03;

    return paletteColor(panel + wash) * uGhostIntensity;
}

vec3 getRightSideColor(float h, float uvX, float time) {
    vec3 c = vec3(0.0);
    float hw = h + sin(uvX * 6.2831853 * 16.0) * 0.003;

    // Mixed base widths: lower number = FAT line, higher number = RAZOR THIN line
    c += addSegmentedLine(vec3(0.2, 0.4, 1.0), hw, 0.35, 60.0,  uvX * 100.0, 10.0, time, 2.0, false); // Fat
    c += addSegmentedLine(vec3(1.0, 0.2, 0.7), hw, 0.28, 300.0, uvX * 100.0, 11.0, time, 2.0, false); // Thin
    c += addSegmentedLine(vec3(1.0, 0.6, 0.1), hw, 0.20, 120.0, uvX * 100.0, 12.0, time, 2.0, false); // Medium
    c += addSegmentedLine(vec3(0.0, 0.8, 1.0), hw, 0.10, 40.0,  uvX * 100.0, 13.0, time, 2.0, false); // Very Fat
    c += addSegmentedLine(vec3(1.0, 0.9, 0.2), hw, 0.02, 500.0, uvX * 100.0, 14.0, time, 2.0, false); // Razor Thin
    c += addSegmentedLine(vec3(0.1, 0.9, 0.3), hw, -0.08, 150.0, uvX * 100.0, 15.0, time, 2.0, false); // Medium
    c += addSegmentedLine(vec3(1.0, 0.4, 0.0), hw, -0.18, 80.0,  uvX * 100.0, 16.0, time, 2.0, false); // Fat
    c += addSegmentedLine(vec3(1.0, 0.1, 0.1), hw, -0.28, 400.0, uvX * 100.0, 17.0, time, 2.0, false); // Thin

    // Cores
    c += addSegmentedLine(vec3(1.0), hw, 0.28, 450.0, uvX * 100.0, 18.0, time, 2.5, false) * 0.5;
    c += addSegmentedLine(vec3(1.0), hw, 0.10, 800.0, uvX * 100.0, 19.0, time, 2.5, false) * 0.5;

    c += addParticleDot(vec3(1.0, 0.5, 1.0), hw, 0.30, 400.0, uvX * 100.0, 80.0, time, 1.5);
    c += addParticleDot(vec3(0.5, 1.0, 1.0), hw, 0.15, 350.0, uvX * 100.0, 81.0, time, 2.5);
    c += addParticleDot(vec3(1.0, 1.0, 0.5), hw, -0.05, 450.0, uvX * 100.0, 82.0, time, 2.0);
    c += addParticleDot(vec3(1.0, 0.2, 0.2), hw, -0.20, 300.0, uvX * 100.0, 83.0, time, 3.0);

    // Add the subtle ghost layer behind the main neon lines
    c += getGhostLayer(hw, uvX, time, 112.3);

    return c;
}

vec3 getLeftSideColor(float h, float uvX, float time) {
    vec3 c = vec3(0.0);
    float hw = h + sin(uvX * 6.2831853 * 19.0 + 1.0) * 0.003;

    c += addSegmentedLine(vec3(1.0, 0.4, 0.0), hw, 0.32,  70.0,  uvX * 100.0, 20.0, time, 2.0, false); // Fat
    c += addSegmentedLine(vec3(1.0, 0.1, 0.5), hw, 0.25,  350.0, uvX * 100.0, 21.0, time, 2.0, false); // Thin
    c += addSegmentedLine(vec3(0.1, 0.6, 1.0), hw, 0.15,  120.0, uvX * 100.0, 22.0, time, 2.0, false); // Medium
    c += addSegmentedLine(vec3(0.2, 0.9, 0.4), hw, 0.05,  50.0,  uvX * 100.0, 23.0, time, 2.0, false); // Very Fat
    c += addSegmentedLine(vec3(1.0, 0.8, 0.0), hw, -0.05, 450.0, uvX * 100.0, 24.0, time, 2.0, false); // Thin
    c += addSegmentedLine(vec3(1.0, 0.2, 0.1), hw, -0.15, 150.0, uvX * 100.0, 25.0, time, 2.0, false); // Medium
    c += addSegmentedLine(vec3(0.6, 0.1, 1.0), hw, -0.25, 60.0,  uvX * 100.0, 26.0, time, 2.0, false); // Fat

    // Cores
    c += addSegmentedLine(vec3(1.0), hw, 0.15, 600.0, uvX * 100.0, 27.0, time, 2.5, false) * 0.5;
    c += addSegmentedLine(vec3(1.0), hw, -0.05, 900.0, uvX * 100.0, 28.0, time, 2.5, false) * 0.5;

    c += addParticleDot(vec3(1.0, 0.8, 0.2), hw, 0.28, 350.0, uvX * 100.0, 90.0, time, 1.8);
    c += addParticleDot(vec3(0.2, 0.8, 1.0), hw, 0.10, 400.0, uvX * 100.0, 91.0, time, 2.2);
    c += addParticleDot(vec3(0.5, 1.0, 0.5), hw, -0.10, 300.0, uvX * 100.0, 92.0, time, 1.5);
    c += addParticleDot(vec3(1.0, 0.4, 0.8), hw, -0.20, 450.0, uvX * 100.0, 93.0, time, 2.7);

    // Add the subtle ghost layer behind the main neon lines
    c += getGhostLayer(hw, uvX, time, 442.1);

    return c;
}

vec3 getColorfulRings(float uvX, float uvY, float time) {
    vec3 c = vec3(0.0);
    float localX = fract(uvX * uRingCount);
    float cellId = floor(uvX * uRingCount);
    
    float ringType = fract(rand(cellId) * 10.0); 
    vec3 rColor = vec3(0.0);
    if (ringType < 0.2) rColor = vec3(1.0, 0.2, 0.7);
    else if (ringType < 0.4) rColor = vec3(0.0, 0.8, 1.0);
    else if (ringType < 0.6) rColor = vec3(1.0, 0.6, 0.1);
    else if (ringType < 0.8) rColor = vec3(0.1, 0.9, 0.3);
    else rColor = vec3(1.0, 0.9, 0.2);

    c += addSegmentedLine(rColor, localX, 0.5, 60.0 + rand(cellId)*40.0, uvY, cellId, time, 1.0, true);
    float activeMask = rand(cellId + 10.0) > 0.3 ? 1.0 : 0.0;
    
    return c * activeMask;
}

void main() {
    float y = fract(vUv.y + uAngleOffset);
    float cy = sin(y * 6.2831853); 
    float cx = cos(y * 6.2831853);

    vec3 bgColor = mix(uBottomColor, uTopColor, smoothstep(-0.2, 0.5, cy)) * 0.35;
    vec3 streakColor = vec3(0.0);

    if (cx > 0.0) {
        streakColor = getRightSideColor(cy, vUv.x, uTime);
    } else {
        streakColor = getLeftSideColor(cy, vUv.x, uTime);
    }

    // Ceiling Lines
    vec3 ceilingColor = vec3(0.0);
    if (cy > 0.4) { 
        float hwCeiling = cy + sin(vUv.x * 6.2831853 * 13.0) * 0.005; 
        
        // Converted to addSegmentedLine so they are also broken and shifting!
        ceilingColor += addSegmentedLine(vec3(0.6, 0.8, 1.0), hwCeiling, 0.70, 500.0, vUv.x * 100.0, 30.0, uTime, 0.5, false) * 0.5;
        ceilingColor += addSegmentedLine(vec3(0.8, 0.9, 1.0), hwCeiling, 0.82, 800.0, vUv.x * 100.0, 31.0, uTime, 0.4, false) * 0.7;
        ceilingColor += addSegmentedLine(vec3(0.9, 0.95, 1.0), hwCeiling, 0.92, 1000.0, vUv.x * 100.0, 32.0, uTime, 0.6, false) * 0.9;
        
        ceilingColor += addSegmentedLine(vec3(1.0, 1.0, 1.0), hwCeiling, 0.76, 600.0, vUv.x * 100.0, 40.0, uTime, 3.0, false) * 0.7;
        ceilingColor += addSegmentedLine(vec3(0.5, 0.8, 1.0), hwCeiling, 0.88, 700.0, vUv.x * 100.0, 41.0, uTime, 2.5, false) * 0.6;
    }

    float sideMask = (1.0 - smoothstep(0.1, 0.7, abs(cy)));
    vec3 finalColor = bgColor + (streakColor * uIntensity * sideMask) + (ceilingColor * uIntensity);

    if (uShowRings > 0.5) {
        vec3 ringsColor = getColorfulRings(vUv.x, y, uTime);
        float ringMask = smoothstep(-0.8, -0.4, cy); 
        finalColor += ringsColor * uIntensity * ringMask;
    }

    // --- NEW: Matrix Data Stream (Japanese Characters) ---
    if (uMatrixIntensity > 0.0) {
        // DECREASED UV MULTIPLIERS so the characters scale up massively on the walls
        vec2 texUv = vec2(vUv.x * 250.0, y * 14.0);
        
        // Sample the generated canvas texture
        float textVal = texture2D(uMatrixTex, texUv).r;
        
        // Isolate streams horizontally across the wall
        float streamId = floor(texUv.y);
        
        // Random speed, phase, and direction per stream
        float speed = 0.5 + rand(streamId * 1.5) * 1.5;
        float phase = rand(streamId * 7.1) * 10.0;
        float dir = rand(streamId * 3.3) > 0.5 ? 1.0 : -1.0; 
        
        // Adjusted trail scale to match the new larger characters
        float trailCoord = vUv.x * 8.0 + uTime * speed * dir + phase;
        float trailPos = fract(trailCoord);
        
        // Trail fades out, head of the stream is bright
        float trailMask = smoothstep(0.0, 0.8, trailPos) * (1.0 - smoothstep(0.95, 1.0, trailPos));
        float headMask = smoothstep(0.95, 1.0, trailPos);
        
        // Individual character flickering
        float cellId = floor(texUv.x) + streamId * 100.0;
        float flicker = sin(uTime * 15.0 + rand(cellId) * 20.0) * 0.5 + 0.5;
        
        // Combine masks
        float matrixVisibility = (trailMask * 0.6 + headMask * 2.0) * (0.3 + 0.7 * flicker);
        
        // Classic Matrix green colors
        vec3 matrixBaseColor = vec3(0.0, 0.9, 0.3);
        vec3 matrixHeadColor = vec3(0.6, 1.0, 0.8);
        vec3 mColor = mix(matrixBaseColor, matrixHeadColor, headMask);
        
        // Only show strictly on the sides, fading smoothly towards top and bottom
        float matrixSideMask = (1.0 - smoothstep(0.2, 0.8, abs(cy)));
        
        finalColor += paletteColor(mColor) * textVal * matrixVisibility * uMatrixIntensity * matrixSideMask * uIntensity;
    }

    // --- NEW: Glossy Wet Floor Reflection ---
    if (cy < -0.2 && uReflectionStrength > 0.0) {
        // Mirror the Y coordinate to look at the walls/ceiling
        // Map the lower bowl onto the actual side-lane heights, not empty ceiling.
        float refCy = (cy + 0.8) * 0.75; 
        
        // Add "wet asphalt" ripples to the reflection
        float ripple = sin(vUv.x * 6.2831853 * 48.0 - uTime * 5.0) * 0.03 + sin(vUv.x * 6.2831853 * 159.0) * 0.01;
        float refCx = cx + ripple;
        
        vec3 reflection = vec3(0.0);
        if (refCx > 0.0) {
            reflection = getRightSideColor(refCy, vUv.x, uTime);
        } else {
            reflection = getLeftSideColor(refCy, vUv.x, uTime);
        }
        
        // Darken and blur the reflection based on depth
        float refMask = (1.0 - smoothstep(-0.8, -0.2, cy)) * smoothstep(-1.0, -0.9, cy); // Fade at the very bottom edge
        finalColor += reflection * uReflectionStrength * refMask * (0.85 + ripple * 3.0);
    }

    // 3D Depth & Cavity Shading
    float dist = length(cameraPosition - vWorldPosition);
    float fogFactor = exp(-dist * uDepthFade);
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float fresnel = max(0.0, dot(-vWorldNormal, viewDir));
    float cavityShadow = mix(0.5, 1.0, smoothstep(0.0, 0.8, fresnel)); 

    finalColor *= cavityShadow; 
    finalColor = mix(uBottomColor * 0.35, finalColor, fogFactor);

    gl_FragColor = vec4(finalColor, 1.0);
}
        `;

export class CyberTunnel {
  constructor(scene,camera,canvas){
    const settings=CYBER_TUNNEL_SETTINGS;
    this.camera=camera;this.motion=new CyberTunnelMotion();this.path=createCyberPath();
    this.canvas=canvas;this.pointer=new THREE.Vector2();this.pointerTarget=new THREE.Vector2();
    this.onPointerMove=event=>{
      if(event.pointerType&&event.pointerType!=="mouse")return;
      const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;
      this.pointerTarget.set(
        THREE.MathUtils.clamp((event.clientX-rect.left)/rect.width*2-1,-1,1),
        THREE.MathUtils.clamp(1-(event.clientY-rect.top)/rect.height*2,-1,1));
    };
    this.onPointerLeave=()=>this.pointerTarget.set(0,0);
    canvas?.addEventListener("pointermove",this.onPointerMove);
    canvas?.addEventListener("pointerleave",this.onPointerLeave);
    this.glyphs=createCyberGlyphTexture();
    this.uniforms={
      uTime:{value:0},uTopColor:{value:new THREE.Color()},uBottomColor:{value:new THREE.Color()},
      uAngleOffset:{value:-.25},uIntensity:{value:1.2},uDepthFade:{value:settings.depthFade},
      uShowRings:{value:Number(settings.showRings)},uRingCount:{value:settings.ringCount},uReflectionStrength:{value:settings.reflectionStrength},
      uGhostIntensity:{value:settings.ghostIntensity},uMatrixTex:{value:this.glyphs},uMatrixIntensity:{value:settings.matrixIntensity},
      uPalette:{value:0},uAccent1:{value:new THREE.Color()},uAccent2:{value:new THREE.Color()},
    };
    this.material=new THREE.ShaderMaterial({vertexShader,fragmentShader,uniforms:this.uniforms,side:THREE.BackSide});
    this.mesh=new THREE.Mesh(new THREE.TubeGeometry(this.path,800,15,64,true),this.material);
    this.mesh.frustumCulled=false;scene.add(this.mesh);
    this.reflections=new CyberReflections(this.mesh);
    this.character=new NeonMarchCharacter(scene,this.path,this.reflections.target.texture);
    camera.near=.1;camera.far=700;camera.fov=85;camera.updateProjectionMatrix();
    this.tangent=new THREE.Vector3();this.right=new THREE.Vector3();this.normal=new THREE.Vector3();
    this.target=new THREE.Vector3();this.matrix=new THREE.Matrix4();this.orientation=new THREE.Quaternion();
    this.baseOrientation=new THREE.Quaternion();
    this.up=new THREE.Vector3(0,1,0);this.ready=false;this.update({},0,0);
  }
  updateCamera(dt){
    if(!dt&&this.ready)return;
    const u=this.motion.progress;
    this.path.getTangentAt(u,this.tangent).normalize();
    this.right.crossVectors(this.tangent,this.up).normalize();
    this.normal.crossVectors(this.right,this.tangent).normalize();
    this.path.getPointAt(u,this.camera.position).addScaledVector(this.normal,CYBER_TUNNEL_SETTINGS.cameraOffsetY);
    this.path.getPointAt((u+.012)%1,this.target);
    this.matrix.lookAt(this.camera.position,this.target,this.normal);this.orientation.setFromRotationMatrix(this.matrix);
    if(!this.ready)this.baseOrientation.copy(this.orientation);
    else this.baseOrientation.slerp(this.orientation,1-Math.exp(-5*dt));
    this.camera.quaternion.copy(this.baseOrientation);
    this.pointer.lerp(this.pointerTarget,1-Math.exp(-4*dt));
    const sway=CYBER_TUNNEL_SETTINGS.mouseParallax;
    this.camera.translateX(this.pointer.x*sway);
    this.camera.translateY(this.pointer.y*sway*.5);
    this.camera.rotateZ(-this.pointer.x*.1*sway);
    this.camera.rotateX(this.pointer.y*.05*sway);
    this.camera.fov=85+this.motion.audio.w*4;this.camera.updateProjectionMatrix();this.ready=true;
  }
  setQuality(quality){this.reflections.setQuality(quality);}
  renderReflections(renderer){
    this.reflections.render(renderer,this.character.root.position,this.motion.time,this.uniforms.uPalette.value);
  }
  update(audio,delta,palette){
    const dt=this.motion.update(audio,delta),m=this.motion;
    this.uniforms.uTime.value=m.time;
    this.uniforms.uIntensity.value=1.2*(.75+m.audio.w*.35+m.pulse*.2);
    this.uniforms.uGhostIntensity.value=CYBER_TUNNEL_SETTINGS.ghostIntensity+m.audio.y*.3;
    this.uniforms.uMatrixIntensity.value=CYBER_TUNNEL_SETTINGS.matrixIntensity+m.audio.z*.12;
    const index=Number.isInteger(palette)&&palette>=0&&palette<4?palette:0,colors=CYBER_TUNNEL_PALETTES[index];
    this.uniforms.uPalette.value=index;
    ["uTopColor","uBottomColor","uAccent1","uAccent2"].forEach((key,i)=>this.uniforms[key].value.setHex(colors[i]));
    this.updateCamera(dt);
    this.character.update(audio,dt,index,m.progress);
  }
  dispose(){
    this.canvas?.removeEventListener("pointermove",this.onPointerMove);
    this.canvas?.removeEventListener("pointerleave",this.onPointerLeave);
    this.glyphs.dispose();
    this.reflections.dispose();
  }
  // Shared procedural-world traversal releases the tube geometry/material/target.
}
