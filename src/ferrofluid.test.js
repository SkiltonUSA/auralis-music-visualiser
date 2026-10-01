import { describe, it, expect, vi } from "vitest";
import * as THREE from "three";
import { FerrofluidMotion, createFerrofluidMaterial, FERROFLUID_MODE, FERROFLUID_QUALITY, FERROFLUID_PALETTES } from "./ferrofluid.js";
import { ProceduralScenes, isProceduralMode } from "./procedural-scenes.js";
import { hasSmoke } from "./smoke-simulation.js";

describe("Ferrofluid", () => {
  it("smooths FFT attack/release independently of frame rate, freezes and sanitizes input", () => {
    const spectrum = new Uint8Array(256).fill(200);
    const motions = [30,60,120].map(fps => {
      const m = new FerrofluidMotion();
      for(let i=0;i<fps;i++)m.update({level:.7},1/fps,spectrum);
      for(let i=0;i<fps;i++)m.update({},1/fps,[]);
      return m;
    });
    const expectedTime=motions[0].time,expectedValue=motions[0].values[0];
    for(const m of motions){
      expect(m.time).toBeCloseTo(expectedTime,10);
      expect(m.values[0]).toBeCloseTo(expectedValue,4);
      expect(m.bytes[0]).toBeLessThan(3);
      const frozen=JSON.stringify(m);
      for(const dt of [0,-1,NaN,Infinity])expect(m.update({level:1},dt,spectrum)).toBe(false);
      expect(JSON.stringify(m)).toBe(frozen);
      m.update({level:Infinity},100,[NaN,Infinity,-1,999]);
      expect([...m.values].every(v=>Number.isFinite(v)&&v>=0&&v<=255)).toBe(true);
    }
  });
  it("displaces the fluid with a radial spectrum and transforms corrected object-space normals", () => {
    const material=createFerrofluidMaterial({uFluidTime:{value:0}});
    const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
    material.onBeforeCompile(shader);
    expect(shader.vertexShader).toContain('clamp(radius / 7.05');
    expect(shader.vertexShader).toContain('vec3 objectNormal = normalize');
    expect(shader.vertexShader).toContain('position.y + fluidH');
    expect(shader.vertexShader.indexOf('vec3 objectNormal')).toBeLessThan(shader.vertexShader.indexOf('#include <defaultnormal_vertex>'));
    expect(shader.fragmentShader).toContain('if (length(vFluidXZ) > 7.15) discard;');
    expect(shader.vertexShader).not.toContain('vNormal = normalize(cross');
    expect(material.roughness).toBe(.162);expect(material.metalness).toBe(.5);material.dispose();
  });
  it("allocates lazily, bounds geometry, freezes private FFT data and releases resources", () => {
    const renderer={target:{},getRenderTarget(){return this.target;},setRenderTarget(t){this.target=t;},render:vi.fn()};
    const outer=renderer.target, worlds=new ProceduralScenes(renderer,null,42), spectrum=new Uint8Array(256).fill(180);
    expect(isProceduralMode(FERROFLUID_MODE)).toBe(true);expect(hasSmoke(FERROFLUID_MODE)).toBe(false);
    expect(worlds.entries.size).toBe(0);worlds.resize(1920,1080,'auto');worlds.render(23,{level:.7},.05,0,spectrum,false);
    const entry=worlds.entries.get(23),effect=entry.ferrofluid;
    expect(renderer.target).toBe(outer);expect(effect.floor.material).not.toBe(effect.material);
    expect(effect.motion.bytes[0]).toBeGreaterThan(0);const frozen=JSON.stringify(effect.motion);
    for(const [quality,settings] of Object.entries(FERROFLUID_QUALITY)){
      const old=effect.mesh.geometry,dispose=vi.spyOn(old,'dispose'),segments=effect.segments;
      worlds.resize(800,1200,quality);worlds.render(23,{level:1},.05,1,spectrum.fill(255),true);
      expect(effect.mesh.geometry.attributes.position.count).toBe((settings.segments+1)**2);
      expect(dispose).toHaveBeenCalledTimes(segments===settings.segments?0:1);
      expect(JSON.stringify(effect.motion)).toBe(frozen);
      expect(entry.camera.zoom).toBeLessThan(1);
      const geometry=effect.mesh.geometry;worlds.resize(900,1200,quality);expect(effect.mesh.geometry).toBe(geometry);
    }
    FERROFLUID_PALETTES.forEach((colors,index)=>{effect.update({},0,index,[]);expect(effect.material.color.getHex()).toBe(colors[0]);});
    worlds.render(17,{},.05,0,[],false);expect(JSON.stringify(effect.motion)).toBe(frozen);
    worlds.render(23,{},.05,0,[],false);expect(JSON.stringify(effect.motion)).not.toBe(frozen);
    renderer.render.mockImplementation(()=>{throw Error('draw failed');});
    expect(()=>worlds.render(23,{},.05,0,[],false)).toThrow('draw failed');expect(renderer.target).toBe(outer);
    const resources=[entry.target,effect.texture,effect.environment,effect.mesh.geometry,effect.material,effect.floor.geometry,effect.floor.material];
    const spies=resources.map(r=>vi.spyOn(r,'dispose'));worlds.dispose();spies.forEach(spy=>expect(spy).toHaveBeenCalledOnce());
  });
});
