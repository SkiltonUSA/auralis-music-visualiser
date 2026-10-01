import { describe, it, expect, vi } from 'vitest';
import { ProceduralScenes } from './procedural-scenes.js';
import { AuraMotion, AURA_QUALITY } from './aura-scene.js';
import * as THREE from 'three';

const audio={bass:.8,mid:.5,high:.4,level:.7,transient:true,beatCount:1};
const setup=()=>{
  const renderer={target:{},getRenderTarget(){return this.target;},setRenderTarget(t){this.target=t;},render:vi.fn()};
  return {renderer,worlds:new ProceduralScenes(renderer,null,42)};
};

describe('Neon City Aura sky',()=>{
  it('renders an independent music-reactive Aura behind the city without advancing other scenes',()=>{
    const {worlds,renderer}=setup(),caller=renderer.target;
    worlds.render(25,audio,.05,1,[],false);
    const city=worlds.entries.get(25),sky=city.neonCity.aura;
    const expected=new AuraMotion();expected.update(audio,.05);
    expect(sky.effect.motion.time).toBeCloseTo(expected.time,12);
    expect(sky.effect.motion.emissions).toBe(1);
    expect(sky.effect.uniforms.uPalette.value).toBe(1);
    expect(renderer.render.mock.calls[0]).toEqual([sky.scene,sky.camera]);
    expect(renderer.render.mock.calls[1]).toEqual([city.scene,city.camera]);
    expect(renderer.target).toBe(caller);
    expect(city.neonCity.sky.material.uniforms.uCityAura.value).toBe(sky.target.texture);
    expect(city.neonCity.sky.renderOrder).toBeLessThan(city.neonCity.buildings.renderOrder);
    expect(city.neonCity.sky.material.depthWrite).toBe(false);
    expect(city.neonCity.sky.material.fragmentShader).toContain('smoothstep(.005,.10,elevation)');
    worlds.render(16,audio,.05,2,[],false);worlds.render(8,audio,.05,3,[],false);
    expect(sky.effect.motion.time).toBeCloseTo(expected.time,12);
    expect(sky.effect.motion).not.toBe(worlds.entries.get(16).aura.motion);
    expect(sky.effect.motion).not.toBe(worlds.entries.get(8).aura.motion);
    expect(sky.effect.uniforms.uPalette.value).toBe(1);
    worlds.dispose();
  });
  it('caches paused frames, scales quality without advancing music, and releases private GPU resources',()=>{
    const {worlds,renderer}=setup();worlds.resize(2000,1000,'auto');
    worlds.render(25,audio,.05,0,[],false);
    const sky=worlds.entries.get(25).neonCity.aura,snapshot=JSON.stringify(sky.effect.motion);
    renderer.render.mockClear();worlds.render(25,{...audio,beatCount:2},.05,0,[],true);
    expect(renderer.render).not.toHaveBeenCalled();
    for(const [quality,edge] of [['auto',640],['high',800],['ultra',1000]]){
      worlds.resize(2000,1000,quality);worlds.render(25,{...audio,beatCount:3},.05,0,[],true);
      expect(sky.target.width).toBe(edge);expect(sky.target.height).toBe(edge/2);
      expect(sky.effect.uniforms.uRaySteps.value).toBe(AURA_QUALITY[quality].steps);
      expect(JSON.stringify(sky.effect.motion)).toBe(snapshot);
    }
    worlds.resize(600,1000,'high');worlds.render(25,audio,.05,0,[],true);
    expect(sky.effect.uniforms.uResolution.value.toArray()).toEqual([800,400]);
    const disposals=[sky.target,sky.effect.mesh.geometry,sky.effect.material].map(o=>vi.spyOn(o,'dispose'));
    worlds.dispose();disposals.forEach(spy=>expect(spy).toHaveBeenCalledOnce());
  });
  it('restores the caller render target and retries an interrupted sky pass',()=>{
    const {worlds,renderer}=setup();worlds.render(25,audio,.05,0,[],false);
    const sky=worlds.entries.get(25).neonCity.aura,caller=renderer.target;
    renderer.render.mockImplementationOnce(()=>{throw Error('sky draw failed');});
    expect(()=>worlds.render(25,audio,.05,0,[],false)).toThrow('sky draw failed');
    expect(renderer.target).toBe(caller);expect(sky.dirty).toBe(true);
    worlds.render(25,audio,.05,0,[],false);expect(sky.dirty).toBe(false);
    worlds.dispose();
  });
  it('anchors the sky to world directions, unaffected by translation, banking or window aspect',()=>{
    const {worlds}=setup();worlds.resize(1600,900,'high');worlds.render(25,audio,.05,0,[],false);
    const {camera,neonCity}=worlds.entries.get(25),material=neonCity.sky.material;
    expect(material.uniforms.uSkyCameraWorld.value).toBe(camera.matrixWorld);
    expect(material.uniforms.uSkyInverseProjection.value).toBe(camera.projectionMatrixInverse);
    expect(material.vertexShader).toContain('vec4(viewRay,0.)');
    expect(material.fragmentShader).not.toContain('vUv');
    const bearing=new THREE.Vector3(.1,.18,-1).normalize();
    const reconstruct=()=>{
      camera.updateMatrixWorld(true);
      // Project the same celestial bearing, then reconstruct it as the shader
      // does. Camera position deliberately cancels out for this infinite sky.
      const ndc=bearing.clone().multiplyScalar(10000).add(camera.position).project(camera);
      const ray=new THREE.Vector4(ndc.x,ndc.y,1,1).applyMatrix4(camera.projectionMatrixInverse);
      ray.w=0;ray.applyMatrix4(camera.matrixWorld);
      return new THREE.Vector3(ray.x,ray.y,ray.z).normalize();
    };
    for(const aspect of [16/9,.6,2.4]){
      camera.aspect=aspect;camera.updateProjectionMatrix();
      for(const distance of [0,600,1120,1500,5000]){
        neonCity.motion.travel=distance;neonCity.update({},0,0,[]);
        expect(reconstruct().distanceTo(bearing)).toBeLessThan(1e-10);
        camera.position.add(new THREE.Vector3(800,100,-900));
        expect(reconstruct().distanceTo(bearing)).toBeLessThan(1e-10);
      }
    }
    worlds.dispose();
  });
});
