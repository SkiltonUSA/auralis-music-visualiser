import * as THREE from "three";

// Adapted from the user's Fractal Lotus / Crystal KIFS shader (September 2026).
// Retain all 16 space folds at every quality level; scale pixels, not topology.
export const FRACTAL_LOTUS_MODE = 19;
export const FRACTAL_LOTUS_QUALITY = {
  auto: { edge: 640, particles: 32 },
  high: { edge: 960, particles: 64 },
  ultra: { edge: 1280, particles: 100 },
};
const level = v => Number.isFinite(v) ? THREE.MathUtils.clamp(v, 0, 1) : 0;

export class FractalLotusMotion {
  constructor() {
    this.time = 0; this.orbit = 0; this.morph = 0; this.audio = new THREE.Vector4();
    this.drive = 0; this.pulse = 0; this.wasTransient = false; this.lastBeat = -1; this.emissions = 0;
  }
  update(audio, delta) {
    const dt = Number.isFinite(delta) ? THREE.MathUtils.clamp(delta, 0, .05) : 0;
    if (!dt) return;
    const ease = 1 - Math.exp(-3 * dt);
    const integral = (old, target) => target * dt + (old - target) * ease / 3;
    this.orbit += .2 * dt + .04 * integral(this.audio.x, level(audio.bass));
    this.morph += dt + .12 * integral(this.audio.y, level(audio.mid));
    this.time += dt;
    [audio.bass, audio.mid, audio.high, audio.level].forEach((v, i) => {
      this.audio.setComponent(i, THREE.MathUtils.lerp(this.audio.getComponent(i), level(v), ease));
    });
    if (audio.transient && (!this.wasTransient ||
      (Number.isFinite(audio.beatCount) && audio.beatCount !== this.lastBeat))) {
      this.drive = Math.max(this.drive, .65 + level(audio.bass) * .35);
      this.lastBeat = audio.beatCount; this.emissions++;
    }
    this.wasTransient = Boolean(audio.transient);
    const attack = Math.exp(-20 * dt), release = Math.exp(-4.5 * dt);
    this.pulse = this.pulse * attack + this.drive * 20 / 15.5 * (release - attack);
    this.drive *= release;
  }
}

const vertexShader = /* glsl */ `
  void main() { gl_Position = vec4(position.xy, 0., 1.); }
`;
const fragmentShader = /* glsl */ `
  precision highp float;
  uniform vec2 uResolution;
  uniform float uTime, uOrbit, uMorph, uPulse, uPalette;
  uniform vec4 uAudio;
  uniform int uParticles;
  mat2 rot(float a) { float s=sin(a), c=cos(a); return mat2(c,-s,s,c); }
  float field(vec3 p) {
    vec3 q=p;
    float inverseScale=1./2.3;
    q += vec3(sin(uMorph*.4)*.15, cos(uMorph*.3)*.15, 0.);
    // Fixed angles are constant-foldable; never evaluate live sin/cos per fold.
    for(int i=0;i<16;i++) {
      q=abs(q); q.xy*=rot(.57); q.xz*=rot(2.31); q.yz*=rot(.47);
      // The reference allows a negative lower clamp, leaving a zero divisor.
      float k=8.55/clamp(dot(q,q), .0001, 79.46);
      q*=k;
      inverseScale=clamp(inverseScale/k, 1.e-20, 1.e20);
      q-=vec3(.23,1.75,.65);
    }
    float rays=(length(q.xy)+2.06-uAudio.x*.08)*inverseScale;
    return max(rays, length(p)-5.9);
  }
  vec3 hologram(float phase) {
    vec3 original=vec3(.55,.5,.65)+vec3(.45,.5,.4)*cos(6.28318*(phase+vec3(0.,.33,.67)));
    float blend=.5+.5*cos(6.28318*phase);
    vec3 ember=mix(vec3(.85,.035,.12),vec3(1.,.65,.12),blend);
    vec3 aqua=mix(vec3(.02,.18,.95),vec3(.1,1.,.65),blend);
    vec3 signal=mix(vec3(1.,.065,.012),vec3(.95,.85,.7),blend);
    return uPalette<.5?original:uPalette<1.5?ember:uPalette<2.5?aqua:signal;
  }
  void main() {
    vec2 resolution=max(uResolution,vec2(1.));
    vec2 uv=(gl_FragCoord.xy*2.-resolution)/resolution.y;
    vec3 ro=vec3(sin(uOrbit)*3.2,sin(uOrbit*.75),cos(uOrbit)*3.2);
    vec3 fwd=normalize(-ro), right=normalize(cross(vec3(0,1,0),fwd)), up=cross(fwd,right);
    vec2 rolled=uv*rot(sin(uTime*.1)*.15);
    vec3 rd=normalize(fwd+right*rolled.x+up*rolled.y);
    float t=0.; vec3 glow=vec3(0.);
    // Keep the same full 75-sample field on all tiers; changing iterations
    // changes this fractal's shape, not merely its detail.
    for(int i=0;i<75;i++) {
      vec3 p=ro+rd*t;
      float radius=length(p), d=field(p);
      float driver=radius*.5-dot(p/max(radius,.0001),rd)*.6+uTime*.2;
      vec3 color=hologram(driver);
      color+=vec3(.5,.25,0.)*exp(-radius*2.2);
      float wave=sin(p.x*12.-uTime*1.5)*sin(p.y*10.+uTime*2.)*sin(radius*12.-uTime*.5);
      float sharp=pow(max(.6,wave),15.);
      // Beat accents trace the existing filaments, rather than washing the
      // entire screen white. The quiet reference sparkle remains between beats.
      color+=vec3(3.5)*sharp*exp(-abs(d)*40.)*(.65+uPulse*.7+uAudio.z*.2);
      float halo=.005/(.002+abs(d)), highlight=.001/(.0001+d*d);
      glow+=color*(halo+highlight*.15);
      t+=max(d*.6,.0002);
      if(t>7.5)break;
    }
    // Leave HDR headroom for the shared bloom instead of the reference's local
    // ACES pass. Its original .056 gain overexposes the fine filaments here.
    vec3 color=glow*.014*(1.+uAudio.x*.06+uPulse*.08);
    color*=clamp(1.-.3*length(uv),0.,1.);
    // Bounded analytic 3D sparks retain the reference's ray-depth masking.
    for(int i=0;i<100;i++) {
      if(i>=uParticles)break;
      float seed=float(i);
      vec3 h=fract(sin(vec3(seed,seed*13.3,seed*31.7))*43758.5453);
      vec3 direction=h*2.-1.;
      vec3 pos=direction/max(length(direction),.0001)*(1.3+h.x*1.8);
      pos.xy*=rot(uTime*.12+h.y*3.); pos.xz*=rot(uTime*.18+h.z*3.);
      vec3 w=pos-ro; float projection=dot(rd,w);
      if(projection>0. && projection<t) {
        float distanceToRay=length(w-rd*projection), size=.0025+h.z*.029;
        float core=1.-smoothstep(size*.4,size,distanceToRay);
        float halo=exp(-distanceToRay*180.)*.4;
        color+=(core+halo)*vec3(1.,.98,.95)*(.7+uAudio.z*.3);
      }
    }
    // Linear HDR only: Auralis applies bloom, tone mapping and output gamma once.
    gl_FragColor=vec4(clamp(color,vec3(0.),vec3(6.)),1.);
  }
`;

export class FractalLotusScene {
  constructor(scene) {
    this.motion = new FractalLotusMotion();
    this.uniforms = { uResolution: { value: new THREE.Vector2(2, 2) },
      uTime: { value: 0 }, uOrbit: { value: 0 }, uMorph: { value: 0 },
      uPulse: { value: 0 }, uPalette: { value: 0 }, uAudio: { value: this.motion.audio },
      uParticles: { value: FRACTAL_LOTUS_QUALITY.auto.particles } };
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0], 3));
    this.material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: this.uniforms,
      depthTest: false, depthWrite: false, blending: THREE.NoBlending });
    this.mesh = new THREE.Mesh(geometry, this.material); this.mesh.frustumCulled = false; scene.add(this.mesh);
  }
  resize(width, height, quality) {
    this.uniforms.uResolution.value.set(Math.max(2, width), Math.max(2, height));
    this.uniforms.uParticles.value = (FRACTAL_LOTUS_QUALITY[quality] || FRACTAL_LOTUS_QUALITY.auto).particles;
  }
  update(audio, delta, palette) {
    this.motion.update(audio, delta);
    for (const [key, value] of [["uTime",this.motion.time],["uOrbit",this.motion.orbit],["uMorph",this.motion.morph],["uPulse",this.motion.pulse]]) this.uniforms[key].value = value;
    this.uniforms.uPalette.value = Number.isInteger(palette) && palette >= 0 && palette < 4 ? palette : 0;
  }
  // Geometry and material are disposed by the shared procedural-world owner.
}
