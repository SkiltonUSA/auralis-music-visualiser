import * as THREE from 'three';
import { NeonMarchMotion, NEON_MARCH_PALETTES } from './neon-march.js';

// Invert the original Neon March shader's rotate/translate joint operations
// into one real 3D figure. Same 16 spheres and gait, without the tiled crowd.
export class NeonMarchRig {
  constructor() {
    this.joints=Array.from({length:16},()=>new THREE.Vector3());
    this.root=new THREE.Matrix4();this.frame=new THREE.Matrix4();
    this.torso=new THREE.Matrix4();this.operation=new THREE.Matrix4();
  }
  rotate(axis,angle) { this.operation[`makeRotation${axis}`](angle);this.frame.multiply(this.operation); }
  translate(x,y,z) { this.frame.multiply(this.operation.makeTranslation(x,y,z)); }
  emit() { this.joints[this.count++].setFromMatrixPosition(this.frame); }
  pose(phase) {
    const k=Number.isFinite(phase)?phase:0;
    this.count=0;this.root.makeTranslation(0,-Math.exp(Math.cos(k*2)-.8),0);
    this.frame.copy(this.root);this.emit();
    for(const side of [1,-1]) {
      const step=k+(side<0?Math.PI:0);
      this.frame.copy(this.root);this.rotate('Z',Math.cos(step)*.1*side);this.translate(-.3*side,0,0);this.emit();
      this.rotate('X',-Math.sin(step)-.2);this.translate(0,-1,0);this.emit();
      this.rotate('X',-Math.sin(step-.9)+.9);this.translate(0,-1,0);this.emit();
    }
    this.frame.copy(this.root);this.rotate('Y',-Math.sin(k)*.5);this.emit();
    this.rotate('X',.4);this.translate(0,1.2,0);this.emit();this.torso.copy(this.frame);
    for(const side of [1,-1]) {
      const step=k+Math.PI+1+(side<0?Math.PI:0);
      this.frame.copy(this.torso);this.rotate('Z',.4*side);this.translate(-.5*side,0,0);this.emit();
      this.rotate('X',-Math.sin(step));this.translate(0,-.7,0);this.emit();
      this.rotate('X',-Math.sin(step)*.5-1);this.translate(0,-.7,0);this.emit();
    }
    this.frame.copy(this.torso);this.rotate('X',.1);this.translate(0,.7,0);this.emit();
    return this.joints;
  }
}

export const CYBER_MARCH_CHARACTER = Object.freeze({ lead:48, scale:2.2, floor:-12 });
const vertexShader=/* glsl */ `
attribute float aTone;
varying vec3 vNormal,vViewPosition;
varying vec3 vWorldNormal,vWorldPosition;
varying float vTone;
void main(){
  vec4 view=modelViewMatrix*instanceMatrix*vec4(position,1.);
  vNormal=normalize(normalMatrix*mat3(instanceMatrix)*normal);
  vViewPosition=view.xyz;vTone=aTone;
  vec4 world=modelMatrix*instanceMatrix*vec4(position,1.);
  vWorldPosition=world.xyz;vWorldNormal=normalize(mat3(modelMatrix)*mat3(instanceMatrix)*normal);
  gl_Position=projectionMatrix*view;
}`;
const fragmentShader=/* glsl */ `
uniform vec3 uPrimary,uSecondary;
uniform float uPulse,uHigh;
uniform samplerCube uEnvironment;
varying vec3 vNormal,vViewPosition;
varying vec3 vWorldNormal,vWorldPosition;
varying float vTone;
void main(){
  vec3 n=normalize(vNormal),view=normalize(-vViewPosition);
  float diffuse=max(0.,dot(n,normalize(vec3(-.4,.9,.5))));
  float rim=pow(1.-max(0.,dot(n,view)),2.);
  vec3 tint=mix(uPrimary,uSecondary,vTone);
  vec3 direction=reflect(normalize(vWorldPosition-cameraPosition),normalize(vWorldNormal));
  vec3 reflected=textureCube(uEnvironment,direction).rgb;
  vec3 color=tint*(.10+diffuse*.12+rim*.28);
  color+=reflected*mix(vec3(1.),tint,.18)*(2.4+rim*1.2);
  color*=1.+uPulse*.65+uHigh*.18;
  gl_FragColor=vec4(color,1.);
}`;

export class NeonMarchCharacter {
  constructor(scene,path,environment=null) {
    this.path=path;this.pathLength=path.getLength();this.motion=new NeonMarchMotion();this.rig=new NeonMarchRig();
    this.root=new THREE.Group();this.root.name='Cyber Tunnel · single Neon March character';
    this.root.scale.setScalar(CYBER_MARCH_CHARACTER.scale);
    this.uniforms={uPrimary:{value:new THREE.Color()},uSecondary:{value:new THREE.Color()},uPulse:{value:0},uHigh:{value:0},uEnvironment:{value:environment}};
    const geometry=new THREE.SphereGeometry(.3,20,14);
    geometry.setAttribute('aTone',new THREE.InstancedBufferAttribute(Float32Array.from({length:16},(_,i)=>.2+.6*(i%3)/2),1));
    this.material=new THREE.ShaderMaterial({vertexShader,fragmentShader,uniforms:this.uniforms});
    this.mesh=new THREE.InstancedMesh(geometry,this.material,16);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.mesh.frustumCulled=false;
    this.root.add(this.mesh);scene.add(this.root);
    this.matrix=new THREE.Matrix4();this.tangent=new THREE.Vector3();this.right=new THREE.Vector3();
    this.normal=new THREE.Vector3();this.back=new THREE.Vector3();this.up=new THREE.Vector3(0,1,0);
    this.update({},0,0,0);
  }
  update(audio,delta,palette,progress) {
    this.motion.update(audio,delta);
    const joints=this.rig.pose(this.motion.phase);
    let lowest=Infinity;
    joints.forEach((joint,i)=>{
      lowest=Math.min(lowest,joint.y-.3);
      this.matrix.makeTranslation(joint.x,joint.y,joint.z);this.mesh.setMatrixAt(i,this.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate=true;
    // Follow the tunnel's world-space centreline, not the mouse/camera pose.
    // Keep the character ahead through bends and across the closed-path seam.
    const u=THREE.MathUtils.euclideanModulo(progress+CYBER_MARCH_CHARACTER.lead/this.pathLength,1);
    this.path.getTangentAt(u,this.tangent).normalize();
    this.right.crossVectors(this.tangent,this.up).normalize();this.normal.crossVectors(this.right,this.tangent).normalize();
    this.path.getPointAt(u,this.root.position).addScaledVector(this.normal,CYBER_MARCH_CHARACTER.floor-lowest*CYBER_MARCH_CHARACTER.scale);
    this.back.copy(this.tangent).negate();this.matrix.makeBasis(this.right,this.normal,this.back);
    this.root.quaternion.setFromRotationMatrix(this.matrix);
    // Face the gait's forward (+Z) axis along the tunnel, not back at the camera.
    // Reset from the path basis above before turning, so yaw never accumulates.
    this.root.rotateY(Math.PI);
    const colors=NEON_MARCH_PALETTES[palette]||NEON_MARCH_PALETTES[0];
    this.uniforms.uPrimary.value.setHex(colors[0]);this.uniforms.uSecondary.value.setHex(colors[1]);
    this.uniforms.uPulse.value=this.motion.pulse;this.uniforms.uHigh.value=this.motion.audio.z;
  }
  // The procedural scene traversal owns the geometry, material and instance buffer.
}
