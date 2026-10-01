import { describe,it,expect,vi } from 'vitest';
import * as THREE from 'three';
import { NeonMarchRig, CYBER_MARCH_CHARACTER } from './neon-march-character.js';
import { NeonMarchMotion, NEON_MARCH_PALETTES } from './neon-march.js';
import { ProceduralScenes } from './procedural-scenes.js';

const beat={bass:.8,mid:.5,high:.4,level:.7,bpm:120,transient:true,beatCount:1};
const setup=()=>{
  const renderer={target:null,getRenderTarget(){return this.target;},setRenderTarget(t){this.target=t;},render:vi.fn()};
  const worlds=new ProceduralScenes(renderer,null,42);worlds.render(22,beat,.05,0,[],false);
  return {worlds,effect:worlds.entries.get(22).cyberTunnel};
};
describe('single Neon March character in Cyber Tunnel',()=>{
  it('preserves the source sphere-jointed gait with fixed limb lengths and a continuous loop',()=>{
    const rig=new NeonMarchRig();
    for(let i=0;i<200;i++){
      const joints=rig.pose(i/200*Math.PI*2);
      expect(rig.count).toBe(16);expect(joints).toHaveLength(16);
      joints.forEach(p=>expect(p.toArray().every(Number.isFinite)).toBe(true));
      for(const [a,b,length] of [[1,2,1],[2,3,1],[4,5,1],[5,6,1],[9,10,.7],[10,11,.7],[12,13,.7],[13,14,.7],[8,15,.7]])
        expect(joints[a].distanceTo(joints[b])).toBeCloseTo(length,10);
    }
    const start=rig.pose(0).map(v=>v.clone());rig.pose(Math.PI*2).forEach((v,i)=>expect(v.distanceTo(start[i])).toBeLessThan(1e-10));
  });
  it('places exactly one figure ahead in world space and keeps all joints inside the tube',()=>{
    const {worlds,effect}=setup(),character=effect.character;
    expect(character.mesh.count).toBe(16);expect(character.root.children).toEqual([character.mesh]);
    expect(character.material.depthTest).toBe(true);expect(character.material.depthWrite).toBe(true);
    const centre=new THREE.Vector3(),worldJoint=new THREE.Vector3();
    for(let i=0;i<=100;i++){
      const progress=i/100;character.update(beat,.05,0,progress);character.root.updateMatrixWorld(true);
      const facing=new THREE.Vector3(0,0,1).applyQuaternion(character.root.quaternion);
      expect(facing.dot(character.tangent)).toBeCloseTo(1,10);
      const u=(progress+CYBER_MARCH_CHARACTER.lead/character.pathLength)%1;
      character.path.getPointAt(u,centre);
      let lowest=Infinity;
      for(const joint of character.rig.joints){
        worldJoint.copy(joint).applyMatrix4(character.root.matrixWorld).sub(centre);
        const x=worldJoint.dot(character.right),y=worldJoint.dot(character.normal);
        expect(Math.hypot(x,y)+.3*CYBER_MARCH_CHARACTER.scale).toBeLessThan(15);
        lowest=Math.min(lowest,y-.3*CYBER_MARCH_CHARACTER.scale);
      }
      expect(lowest).toBeCloseTo(CYBER_MARCH_CHARACTER.floor,5);
    }
    character.update({},0,0,1-1e-8);const before=character.root.position.clone(),orientation=character.root.quaternion.clone();
    character.update({},0,0,1e-8);
    expect(before.distanceTo(character.root.position)).toBeLessThan(.001);
    expect(orientation.angleTo(character.root.quaternion)).toBeLessThan(.001);
    const worldPosition=character.root.position.clone();effect.pointerTarget.set(1,-1);effect.updateCamera(.05);
    expect(character.root.position.equals(worldPosition)).toBe(true);
    worlds.dispose();
  });
  it('shares Neon March cadence without sharing scene state, freezes on pause, and disposes its resources',()=>{
    const {worlds,effect}=setup(),character=effect.character,reference=new NeonMarchMotion();reference.update(beat,.05);
    expect(character.motion.phase).toBeCloseTo(reference.phase,12);expect(character.motion.emissions).toBe(1);
    const state=JSON.stringify(character.motion),matrices=character.mesh.instanceMatrix.array.slice(),position=character.root.position.clone();
    for(const quality of ['auto','high','ultra']){
      worlds.resize(900,1400,quality);worlds.render(22,{...beat,beatCount:2},.05,2,[],true);
      expect(JSON.stringify(character.motion)).toBe(state);
      expect(character.mesh.instanceMatrix.array).toEqual(matrices);expect(character.root.position.equals(position)).toBe(true);
      expect(character.uniforms.uPrimary.value.getHex()).toBe(NEON_MARCH_PALETTES[2][0]);
    }
    worlds.render(24,beat,.05,0,[],false);expect(JSON.stringify(character.motion)).toBe(state);
    expect(character.motion).not.toBe(worlds.entries.get(24).neonMarch.motion);
    worlds.render(22,{...beat,beatCount:2},.05,0,[],false);expect(character.motion.emissions).toBe(2);
    const disposals=[character.mesh,character.mesh.geometry,character.material].map(o=>vi.spyOn(o,'dispose'));
    worlds.dispose();disposals.forEach(spy=>expect(spy).toHaveBeenCalledOnce());
  });
});
