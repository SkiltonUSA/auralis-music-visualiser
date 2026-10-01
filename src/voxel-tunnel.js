import * as THREE from "three";

// Adapted from the user's voxel/fractal tunnel shader (September 2026).
export const VOXEL_TUNNEL_MODE = 20;
export const VOXEL_TUNNEL_QUALITY = { auto: { edge: 640 }, high: { edge: 960 }, ultra: { edge: 1280 } };
export const VOXEL_TUNNEL_PALETTES = [
  { primary: [.1, 2, 4], secondary: [0, 1, 2], tint: [1, 1, 1] },
  { primary: [.1, 1.1, 3], secondary: [0, .6, 2.8], tint: [1, .55, .3] },
  { primary: [3.5, .1, 1.1], secondary: [3, 0, .8], tint: [.3, 1, 1] },
  { primary: [0, 1, 2], secondary: [0, .4, .8], tint: [1, .55, .4] },
];
const level = v => Number.isFinite(v) ? THREE.MathUtils.clamp(v, 0, 1) : 0;

export class VoxelTunnelMotion {
  constructor() {
    this.travel = 0; this.time = 0; this.audio = new THREE.Vector4();
    this.drive = 0; this.pulse = 0; this.wasTransient = false; this.lastBeat = -1; this.emissions = 0;
  }
  update(audio, delta) {
    const dt = Number.isFinite(delta) ? THREE.MathUtils.clamp(delta, 0, .05) : 0;
    if (!dt) return;
    const ease = 1 - Math.exp(-3 * dt);
    const integral = (old, target) => target * dt + (old - target) * ease / 3;
    this.travel = (this.travel + 1.5 * dt + .45 * integral(this.audio.x, level(audio.bass)) + .2 * integral(this.audio.w, level(audio.level))) % 7;
    this.time += dt + .12 * integral(this.audio.y, level(audio.mid));
    [audio.bass, audio.mid, audio.high, audio.level].forEach((v, i) => {
      this.audio.setComponent(i, THREE.MathUtils.lerp(this.audio.getComponent(i), level(v), ease));
    });
    if (audio.transient && (!this.wasTransient || (Number.isFinite(audio.beatCount) && audio.beatCount !== this.lastBeat))) {
      this.drive = Math.max(this.drive, .65 + level(audio.bass) * .35);
      this.lastBeat = audio.beatCount; this.emissions++;
    }
    this.wasTransient = Boolean(audio.transient);
    const attack = Math.exp(-20 * dt), release = Math.exp(-4.5 * dt);
    this.pulse = this.pulse * attack + this.drive * 20 / 15.5 * (release - attack);
    this.drive *= release;
  }
}

const vertexShader = /* glsl */ `void main(){gl_Position=vec4(position.xy,0.,1.);}`;
const fragmentShader = /* glsl */ `
  precision highp float;
  uniform vec2 uResolution;
  uniform float uTime,uTravel,uPulse;
  uniform vec4 uAudio;
  uniform vec3 uAxis,uPrimary,uSecondary,uTint;
  vec3 displace(vec3 p,float scale){return (1.1/scale)*sin(p.zxy*scale+3.*scale);}
  void main(){
    vec2 resolution=max(uResolution,vec2(1.));
    vec2 uv=(gl_FragCoord.xy*2.-resolution)/resolution.y;
    vec3 origin=vec3(0.,0.,uTravel), ray=normalize(vec3(uv,1.));
    float traveled=.5;
    vec3 accumulated=vec3(0.), phase=uPrimary;
    float angle=uTime*.3;
    // Preserve the reference's non-orthogonal noise deformation (not a camera rotation).
    mat2 rotation=mat2(cos(angle),cos(angle+8.),cos(angle+30.),cos(angle));
    vec3 coreAnimation=15.8*exp(sin(uTime*2.+uSecondary));
    for(int stepIndex=0;stepIndex<110;stepIndex++){
      vec3 p=origin+ray*traveled;
      float tunnelDistance=max(abs(p.x),abs(p.y))-(3.3+uAudio.x*.08);
      vec3 q=p;
      q.z=abs(mod(q.z,7.)-3.5);
      // This is the supplied stretched space fold, not a unit reflection.
      q=36.4*dot(uAxis,q)*uAxis-q;
      q=log(abs(q)+1.03);
      q=ceil(q*55.)/55.;
      float maxIteration=21.-clamp(traveled*.7,0.,16.);
      // Integer loop bounds avoid floating-point loop termination differences.
      for(int i=0;i<12;i++){
        float frequency=2.+float(i)*1.6;
        if(frequency>maxIteration)break;
        q+=displace(q,frequency);
      }
      q.yz*=rotation; q+=displace(q,1.);
      float density=abs(tunnelDistance)+abs(q.x)*.15+.04;
      vec3 walls=exp(sin(phase))/density;
      phase+=.2;
      vec3 core=coreAnimation/(dot(p.xy,p.xy)+1.5);
      // Keep the vanishing point readable: stronger beat response on walls,
      // only a restrained lift in the core, with no camera jolts.
      accumulated+=walls*.5*(1.+uPulse*.22+uAudio.z*.08)+core*.05*(1.+uAudio.x*.06);
      traveled+=density*.23;
      if(traveled>45. || max(accumulated.x,max(accumulated.y,accumulated.z))>1000.)break;
    }
    // The original writes tanh-compressed display colours directly. Retain
    // that look, decode for Auralis's shared linear HDR finishing, and use the
    // negative exponential form so the tanh cannot overflow.
    vec3 x=max(accumulated*uTint/256.5,vec3(0.));
    vec3 e=exp(-2.*x), displayColor=(1.-e)/(1.+e);
    gl_FragColor=vec4(pow(clamp(displayColor,0.,1.),vec3(2.2))*.9,1.);
  }
`;

export class VoxelTunnelScene {
  constructor(scene) {
    this.motion = new VoxelTunnelMotion();
    this.uniforms = { uResolution: { value: new THREE.Vector2(2, 2) }, uTime: { value: 0 }, uTravel: { value: 0 }, uPulse: { value: 0 },
      uAudio: { value: this.motion.audio }, uAxis: { value: new THREE.Vector3(...[3.145, 1.79, 7.81].map(Math.tan)).normalize() },
      uPrimary: { value: new THREE.Vector3() }, uSecondary: { value: new THREE.Vector3() }, uTint: { value: new THREE.Vector3() } };
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0], 3));
    this.material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: this.uniforms,
      depthTest: false, depthWrite: false, blending: THREE.NoBlending });
    this.mesh = new THREE.Mesh(geometry, this.material); this.mesh.frustumCulled = false; scene.add(this.mesh);
    this.update({}, 0, 0);
  }
  resize(width, height) { this.uniforms.uResolution.value.set(Math.max(2, width), Math.max(2, height)); }
  update(audio, delta, palette) {
    this.motion.update(audio, delta);
    this.uniforms.uTime.value = this.motion.time; this.uniforms.uTravel.value = this.motion.travel; this.uniforms.uPulse.value = this.motion.pulse;
    const colors = VOXEL_TUNNEL_PALETTES[palette] || VOXEL_TUNNEL_PALETTES[0];
    this.uniforms.uPrimary.value.fromArray(colors.primary); this.uniforms.uSecondary.value.fromArray(colors.secondary); this.uniforms.uTint.value.fromArray(colors.tint);
  }
  // Geometry, material and target are released by ProceduralScenes.
}
