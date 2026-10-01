import { describe,it,expect,vi } from 'vitest';
import * as THREE from 'three';
import { ProceduralScenes } from './procedural-scenes.js';
import { CYBER_MARCH_CHARACTER } from './neon-march-character.js';

const beat={bass:.8,mid:.5,high:.4,level:.7,bpm:120};
const setup=()=>{
  const renderer={target:{},face:3,mip:2,xr:{enabled:true},getRenderTarget(){return this.target;},getActiveCubeFace(){return this.face;},getActiveMipmapLevel(){return this.mip;},setRenderTarget(t,face=0,mip=0){this.target=t;this.face=face;this.mip=mip;},render:vi.fn()};
  const worlds=new ProceduralScenes(renderer,null,42);worlds.render(22,beat,.05,0,[],false);
  return {worlds,renderer,effect:worlds.entries.get(22).cyberTunnel};
};
describe('Cyber Tunnel reflective marcher',()=>{
  it('moves the single character toward the bend and reflects the actual tunnel without self-feedback',()=>{
    const {worlds,renderer,effect}=setup(),r=effect.reflections;
    expect(CYBER_MARCH_CHARACTER.lead).toBe(48);
    expect(effect.character.mesh.count).toBe(16);
    expect(effect.character.uniforms.uEnvironment.value).toBe(r.target.texture);
    expect(effect.character.material.fragmentShader).toContain('textureCube(uEnvironment,direction)');
    expect(r.scene.children).toEqual([r.proxy]);
    expect(r.proxy.geometry).toBe(effect.mesh.geometry);expect(r.proxy.material).toBe(effect.material);
    expect(r.captures).toBe(1);expect(renderer.render).toHaveBeenCalledTimes(7);
    expect(r.camera.position.equals(effect.character.root.position)).toBe(true);
    expect(r.camera.children).toHaveLength(6);expect(renderer.xr.enabled).toBe(true);
    worlds.dispose();
  });
  it('budgets reflection captures and freezes them while paused or hidden',()=>{
    const {worlds,effect}=setup(),r=effect.reflections;
    worlds.render(22,beat,.05,0,[],false);expect(r.captures).toBe(1);
    for(let i=0;i<6;i++)worlds.render(22,beat,.05,0,[],false);
    expect(r.captures).toBeGreaterThan(1);expect(r.captures).toBeLessThan(8);
    const count=r.captures,state=JSON.stringify(effect.motion);
    worlds.render(22,beat,.05,0,[],true);expect(r.captures).toBe(count);
    worlds.render(24,beat,.05,0,[],false);expect(r.captures).toBe(count);
    for(const [quality,size] of [['high',128],['ultra',128],['auto',64]]){
      worlds.resize(1200,800,quality);worlds.render(22,beat,.05,1,[],true);
      expect(r.target.width).toBe(size);expect(r.target.height).toBe(size);
      expect(JSON.stringify(effect.motion)).toBe(state);
    }
    const disposals=[r.target,effect.mesh.geometry,effect.material].map(o=>vi.spyOn(o,'dispose'));
    worlds.dispose();disposals.forEach(spy=>expect(spy).toHaveBeenCalledOnce());
  });
  it('restores render target face, mip level and XR on a failed capture, then retries',()=>{
    const {worlds,renderer,effect}=setup(),r=effect.reflections;
    const previous={};renderer.setRenderTarget(previous,4,2);r.dirty=true;
    renderer.render.mockImplementationOnce(()=>{throw Error('reflection failed');});
    expect(()=>effect.renderReflections(renderer)).toThrow('reflection failed');
    expect(renderer.target).toBe(previous);expect(renderer.face).toBe(4);expect(renderer.mip).toBe(2);expect(renderer.xr.enabled).toBe(true);
    expect(r.dirty).toBe(true);effect.renderReflections(renderer);expect(r.dirty).toBe(false);
    worlds.dispose();
  });
});
