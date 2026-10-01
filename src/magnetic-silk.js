import * as THREE from "three";

// Adapted from the user's magnetic-pole / holographic-lines shader (Sept 2026).
export const MAGNETIC_SILK_MODE = 21;
export const SILK_RIPPLE_COUNT = 8;
export const SILK_RIPPLE_SECONDS = 2.8;
export const SILK_FLOW_SPEED = .062;
export const MAGNETIC_SILK_QUALITY = {
  auto: { edge: 800, aa: 1 }, high: { edge: 1200, aa: 2 }, ultra: { edge: 1600, aa: 3 },
};
export const MAGNETIC_SILK_PALETTES = [
  [0x6619cc, 0xe63380, 0x1accff], [0x641bb5, 0xeb384b, 0xffc25c],
  [0x173caa, 0x19d4ce, 0x9affcf], [0x6e1827, 0xff521f, 0xffe1ad],
];
const level = v => Number.isFinite(v) ? THREE.MathUtils.clamp(v, 0, 1) : 0;

export class MagneticSilkMotion {
  constructor() {
    this.time = 0;
    this.wasTransient = false; this.lastBeat = -1; this.emissions = 0;
    this.ripples = Array.from({ length: SILK_RIPPLE_COUNT }, () => new THREE.Vector4(SILK_RIPPLE_SECONDS, 0, 0, 0));
  }
  update(audio, delta) {
    const dt = Number.isFinite(delta) ? THREE.MathUtils.clamp(delta, 0, .05) : 0;
    if (!dt) return;
    // Smooth continuous folding, with independent beat-triggered colour waves.
    this.time += dt;
    for (const ripple of this.ripples) {
      ripple.x = Math.min(SILK_RIPPLE_SECONDS, ripple.x + dt);
      if (ripple.x >= SILK_RIPPLE_SECONDS) ripple.y = 0;
    }
    if (audio.transient && (!this.wasTransient || (Number.isFinite(audio.beatCount) && audio.beatCount !== this.lastBeat))) {
      this.ripples[this.emissions % SILK_RIPPLE_COUNT].set(0, .35 + level(audio.bass) * .65, (this.emissions * .173) % 1, 0);
      this.lastBeat = audio.beatCount; this.emissions++;
    }
    this.wasTransient = Boolean(audio.transient);
  }
}

const vertexShader = /* glsl */ `void main(){gl_Position=vec4(position.xy,0.,1.);}`;
const fragmentShader = /* glsl */ `
  precision highp float;
  uniform vec2 uResolution;
  uniform float uPalette,uFlow;
  uniform vec4 uSilkRipples[${SILK_RIPPLE_COUNT}];
  uniform int uAA;
  uniform vec3 uColor1,uColor2,uColor3;
  vec3 gradient(float t){
    t=clamp(t,0.,1.);
    vec3 a=mix(uColor1,uColor2,smoothstep(0.,.5,t));
    vec3 b=mix(uColor2,uColor3,smoothstep(.5,1.,t));
    return mix(a,b,step(.5,t));
  }
  vec2 domain(vec2 p){
    float t=uFlow;
    // These intentionally use different angles, retaining the supplied shear.
    float c=cos(-2.57),s=sin(1.73);p*=mat2(c,-s,s,c);
    vec2 pole1=vec2(sin(t*-2.1),cos(t*.4))*-.97;
    float d1=sqrt(dot(p-pole1,p-pole1)+1.);
    p.y+=sin(d1*2.4-t*3.)*-.366;
    vec2 pole2=vec2(cos(t*.7),-sin(t*1.1))*2.71;
    float d2=sqrt(dot(p-pole2,p-pole2)+1.);
    p.x+=cos(d2*2.+t*1.2)*.156;
    p.y+=sin(p.x*1.5-t*2.)*1.24;
    return p;
  }
  float heightFromDomain(vec2 p){
    return pow(clamp(sin(p.y*19.05)*.4842+.5,0.,1.),.4921)*.25;
  }
  vec3 shade(vec2 fragCoord){
    vec2 resolution=max(uResolution,vec2(1.));
    // Preserve the reference's off-centre, diagonally framed composition.
    vec2 uv=(fragCoord*3.6-resolution)/resolution.y;
    vec2 warped=domain(uv);
    float height=heightFromDomain(warped);
    vec3 normal=normalize(vec3(heightFromDomain(domain(uv+vec2(.01,0.)))-height,
      heightFromDomain(domain(uv+vec2(0.,.01)))-height,.017));
    float lineID=floor(warped.y*(19.05*.934)/7.1931853);
    vec2 rotated=uv*mat2(1.,-sin(.4),sin(.7),cos(1.3));
    vec3 base=gradient(rotated.y*.35+.3);
    float rippleAmount=0.;
    vec3 rippleColor=vec3(0.);
    for(int i=0;i<${SILK_RIPPLE_COUNT};i++){
      vec4 wave=uSilkRipples[i];
      if(wave.y<.001)continue;
      float along=warped.x+3.+sin(warped.y*.3)*.25;
      float front=along-wave.x*3.2;
      float envelope=smoothstep(0.,.08,wave.x)*(1.-smoothstep(1.8,${SILK_RIPPLE_SECONDS},wave.x));
      float amount=exp(-pow(front/.55,2.))*wave.y*envelope;
      vec3 tint=gradient(.5+.5*sin(warped.y*.8+wave.z*6.2831853));
      rippleColor+=tint*amount;rippleAmount+=amount;
    }
    vec3 rippleTint=rippleColor/max(rippleAmount,.0001);
    float rippleMix=clamp(rippleAmount,0.,1.);
    base=mix(base,rippleTint,rippleMix*.85);
    float internalGradient=smoothstep(-.6,1.,normal.y+normal.x*.3);
    vec3 volume=mix(base*.2,base,internalGradient);
    vec3 light1=normalize(vec3(.4,.7,.6)),light2=normalize(vec3(-.6,-.4,.3));
    float diffuse1=max(dot(normal,light1),0.),diffuse2=max(dot(normal,light2),0.);
    float specular=pow(max(reflect(-light1,normal).z,0.),40.)*1.5;
    float fresnel=pow(1.-max(normal.z,0.),2.4);
    vec3 spectrum=.5+.5*cos(warped.x*3.+lineID*1.2+vec3(0.,2.,4.));
    // Keep the original rainbow edges in palette 0; tint alternate palettes.
    if(uPalette>.5)spectrum=mix(base,gradient(.5+.5*sin(lineID)),.55);
    spectrum=mix(spectrum,rippleTint,rippleMix*.9);
    vec3 color=volume*(diffuse1*.8+.1)+base*diffuse2*.3;
    color+=vec3(1.,.95,1.)*specular;
    color+=spectrum*fresnel*2.;
    return color;
  }
  void main(){
    vec3 total=vec3(0.);
    // Uniform sample count reuses one compiled shader through quality changes.
    for(int y=0;y<3;y++){
      if(y>=uAA)break;
      for(int x=0;x<3;x++){
        if(x>=uAA)break;
        vec2 offset=(vec2(float(x),float(y))+.5)/float(uAA)-.5;
        total+=shade(gl_FragCoord.xy+offset);
      }
    }
    total/=float(uAA*uAA);
    // Reference contrast .85, then decode display values (2.2) for shared HDR
    // finishing. This prevents a second gamma lift from washing out the folds.
    gl_FragColor=vec4(pow(clamp(total,0.,1.),vec3(.85*2.2))*.9,1.);
  }
`;

export class MagneticSilkScene {
  constructor(scene) {
    this.motion = new MagneticSilkMotion();
    this.uniforms = { uResolution: { value: new THREE.Vector2(2, 2) }, uPalette: { value: 0 }, uFlow: { value: 0 },
      uSilkRipples: { value: this.motion.ripples }, uAA: { value: MAGNETIC_SILK_QUALITY.auto.aa },
      uColor1: { value: new THREE.Color() }, uColor2: { value: new THREE.Color() }, uColor3: { value: new THREE.Color() } };
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0], 3));
    this.material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: this.uniforms,
      depthTest: false, depthWrite: false, blending: THREE.NoBlending });
    this.mesh = new THREE.Mesh(geometry, this.material); this.mesh.frustumCulled = false; scene.add(this.mesh);
    this.update({}, 0, 0);
  }
  resize(width, height, quality) {
    this.uniforms.uResolution.value.set(Math.max(2, width), Math.max(2, height));
    this.uniforms.uAA.value = (MAGNETIC_SILK_QUALITY[quality] || MAGNETIC_SILK_QUALITY.auto).aa;
  }
  update(audio, delta, palette) {
    this.motion.update(audio, delta);
    this.uniforms.uFlow.value = this.motion.time * SILK_FLOW_SPEED;
    const index = Number.isInteger(palette) && palette >= 0 && palette < 4 ? palette : 0;
    this.uniforms.uPalette.value = index;
    ["uColor1", "uColor2", "uColor3"].forEach((key, i) => this.uniforms[key].value.setHex(MAGNETIC_SILK_PALETTES[index][i]));
  }
  // The procedural-world owner disposes geometry, material and render target.
}
