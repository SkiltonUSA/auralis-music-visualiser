import * as THREE from "three";
import { SynthwaveFloor, synthwaveFloorGLSL } from './synthwave-floor.js';

// Expanded from the user's X/L/A sphere-joint shader. The snippet's undefined
// translation `s` is treated as zero; all march state is explicitly initialized.
export const NEON_MARCH_MODE = 24;
export const NEON_MARCH_TRAVEL_PER_RADIAN = 20 / Math.PI;
export const NEON_MARCH_QUALITY = { auto: { edge: 640 }, high: { edge: 900 }, ultra: { edge: 1200 } };
export const NEON_MARCH_PALETTES = [
  [0x47deff, 0xff4cbc], [0xff7839, 0xffd891],
  [0x27ffd2, 0x427bff], [0xffe4ba, 0xff4e28],
];
const TAU = Math.PI * 2;
const unit = v => Number.isFinite(v) ? THREE.MathUtils.clamp(v, 0, 1) : 0;

export class NeonMarchMotion {
  constructor() {
    this.phase = 0; this.speed = 1.2; this.audio = new THREE.Vector4(0,0,0,0);
    this.drive = 0; this.pulse = 0; this.lastBeat = -1; this.wasTransient = false; this.emissions = 0;
  }
  update(audio, delta) {
    const dt = Number.isFinite(delta) ? THREE.MathUtils.clamp(delta, 0, .05) : 0;
    if (!dt) return 0;
    const bpm = Number.isFinite(audio.bpm) && audio.bpm > 0 ? THREE.MathUtils.clamp(audio.bpm, 40, 220) : 0;
    const cadence = bpm ? bpm / 60 * Math.PI : 5;
    const target = 1.2 + (cadence - 1.2) * Math.min(1, unit(audio.level) * 8);
    const ease = 1 - Math.exp(-3 * dt);
    const advance = target * dt + (this.speed - target) * ease / 3;
    this.phase = (this.phase + advance) % TAU;
    this.speed += (target - this.speed) * ease;
    [audio.bass,audio.mid,audio.high,audio.level].forEach((v,i) => this.audio.setComponent(i,
      THREE.MathUtils.lerp(this.audio.getComponent(i),unit(v),ease)));
    if (audio.transient && (!this.wasTransient || (Number.isFinite(audio.beatCount) && audio.beatCount !== this.lastBeat))) {
      this.drive = Math.max(this.drive, .65 + unit(audio.bass) * .35);
      this.lastBeat = audio.beatCount; this.emissions++;
    }
    this.wasTransient = Boolean(audio.transient);
    const attack = Math.exp(-20 * dt), release = Math.exp(-4.5 * dt);
    this.pulse = this.pulse * attack + this.drive * 20 / 15.5 * (release - attack); this.drive *= release;
    return advance;
  }
}

const vertexShader = /* glsl */ `void main(){gl_Position=vec4(position.xy,0.,1.);}`;
const fragmentShader = /* glsl */ `
precision highp float;
uniform vec2 uResolution;
uniform float uPhase,uPulse;
uniform vec4 uAudio;
uniform vec3 uPrimary,uSecondary;
${synthwaveFloorGLSL}
const float PI=3.141592653589793;
mat2 rotate2D(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
void sphereJoint(vec3 p,inout float distanceToJoint){distanceToJoint=min(distanceToJoint,length(p)-.3);}
void leg(vec3 q,float k,float side,inout float d){
  vec3 p=q;
  p.xy*=rotate2D(cos(k)*-.1*side);p.x+=.3*side;sphereJoint(p,d);
  p.yz*=rotate2D(sin(k)+.2);p.y+=1.;sphereJoint(p,d);
  p.yz*=rotate2D(sin(k-.9)-.9);p.y+=1.;sphereJoint(p,d);
}
void arm(vec3 q,float k,float side,inout float d){
  vec3 p=q;
  p.xy*=rotate2D(-.4*side);p.x+=.5*side;sphereJoint(p,d);
  p.yz*=rotate2D(sin(k));p.y+=.7;sphereJoint(p,d);
  p.yz*=rotate2D(sin(k)*.5+1.);p.y+=.7;sphereJoint(p,d);
}
float figures(vec3 world){
  float k=uPhase,d=8.;vec3 q=world;
  q.z-=k/PI*20.;q.xz=4.-mod(q.xz,8.);
  // Turn each figure around its own centre, leaving crowd travel unchanged.
  q.xz=-q.xz;
  q.y+=exp(cos(k+k)-.8);
  vec3 p=q;p.xz*=rotate2D(sin(k)*.2);sphereJoint(p,d);
  leg(q,k,1.,d);k+=PI;leg(q,k,-1.,d);
  p=q;p.xz*=rotate2D(sin(PI-k)*.5);sphereJoint(p,d);
  p.yz*=rotate2D(-.4);p.y-=1.2;sphereJoint(p,d);q=p;
  k+=1.;arm(q,k,1.,d);k+=PI;arm(q,k,-1.,d);
  p=q;p.yz*=rotate2D(-.1);p.y-=.7;sphereJoint(p,d);
  return d;
}
vec3 normalAt(vec3 p){
  const float e=.002;
  vec2 k=vec2(1.,-1.);
  return normalize(k.xyy*figures(p+k.xyy*e)+k.yyx*figures(p+k.yyx*e)
    +k.yxy*figures(p+k.yxy*e)+k.xxx*figures(p+k.xxx*e));
}
void main(){
  vec2 res=max(uResolution,vec2(1.));vec2 uv=(gl_FragCoord.xy-.5*res)/res.y;
  vec3 origin=vec3(5.,5.,5.),forward=normalize(vec3(-.35,-.38,-1.));
  vec3 right=normalize(cross(forward,vec3(0.,1.,0.))),up=cross(right,forward);
  vec3 ray=normalize(forward*1.15+right*uv.x+up*uv.y);
  float traveled=0.,halo=0.;vec3 color=vec3(0.);bool hit=false;
  vec3 p=origin;
  // Fixed, initialized bounds; never step backwards or overflow the exponential.
  for(int i=0;i<100;i++){
    p=origin+ray*traveled;
    float d=figures(p);
    halo+=exp(-max(d,0.)*18.)*.012*exp(-traveled*.035);
    if(d<.003){hit=true;break;}
    traveled+=max(.002,d*.6);
    if(traveled>75.||p.y< -4.)break;
  }
  vec3 tint=mix(uPrimary,uSecondary,.5+.5*sin(p.x*.16+p.z*.08));
  if(hit){
    vec3 n=normalAt(p);float diffuse=max(0.,dot(n,normalize(vec3(-.4,.9,.5))));
    float rim=pow(1.-max(0.,dot(n,-ray)),2.);
    color=tint*(.32+diffuse*.8+rim*.5)*(1.+uPulse*.65+uAudio.z*.18)*exp(-traveled*.035);
  }
  color+=tint*min(halo,.45)*(1.+uPulse*.3);
  // Horizon's approaching waveform lines live on the ground, behind figures.
  if(ray.y<-.001){
    float floorDistance=(-3.8-origin.y)/ray.y;
    if(floorDistance>0.&&(!hit||floorDistance<traveled)){
      vec3 floorPoint=origin+ray*floorDistance;
      color+=synthwaveFloor(vec2(floorPoint.x,origin.z-floorPoint.z),uPrimary,uSecondary)*.25;
    }
  }
  gl_FragColor=vec4(clamp(color,0.,3.),1.);
}
`;

export class NeonMarchScene {
  constructor(scene) {
    this.motion = new NeonMarchMotion();
    this.floor = new SynthwaveFloor();
    this.uniforms = { ...this.floor.uniforms,uResolution:{value:new THREE.Vector2(2,2)},uPhase:{value:0},uPulse:{value:0},
      uAudio:{value:this.motion.audio},uPrimary:{value:new THREE.Color()},uSecondary:{value:new THREE.Color()} };
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position",new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
    this.material = new THREE.ShaderMaterial({vertexShader,fragmentShader,uniforms:this.uniforms,
      depthTest:false,depthWrite:false,blending:THREE.NoBlending});
    this.mesh = new THREE.Mesh(geometry,this.material);this.mesh.frustumCulled=false;scene.add(this.mesh);
    this.update({},0,0);
  }
  resize(width,height){this.uniforms.uResolution.value.set(Math.max(2,width),Math.max(2,height));}
  update(audio,delta,palette){
    const advance=this.motion.update(audio,delta);
    this.floor.update(audio,delta,palette,advance*NEON_MARCH_TRAVEL_PER_RADIAN);
    this.uniforms.uPhase.value=this.motion.phase;this.uniforms.uPulse.value=this.motion.pulse;
    const colors=NEON_MARCH_PALETTES[palette]||NEON_MARCH_PALETTES[0];
    this.uniforms.uPrimary.value.setHex(colors[0]);this.uniforms.uSecondary.value.setHex(colors[1]);
  }
  // Shared procedural-world traversal owns geometry/material/target disposal.
  dispose(){this.floor.dispose();}
}
