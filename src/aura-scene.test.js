import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { AuraMotion, AuraScene, AURA_MODE, AURA_QUALITY } from "./aura-scene.js";
import { ProceduralScenes, isProceduralMode } from "./procedural-scenes.js";
import { hasSmoke } from "./smoke-simulation.js";

describe("Aura musical motion", () => {
  const audio = { level:.8, bass:.7, mid:.5, high:.4 };
  it("eases audio and integrates travel consistently at 30, 60 and 120 fps", () => {
    const results = [30,60,120].map(fps => {
      const state = new AuraMotion();
      for (let i=0; i<fps; i++) state.update({ ...audio, transient:i===0, beatCount:1 }, 1/fps);
      return state;
    });
    for (const state of results) {
      expect(state.time).toBeGreaterThan(.65);
      expect(state.time).toBeCloseTo(results[0].time, 10);
      expect(state.pulse).toBeCloseTo(results[0].pulse, 10);
      state.audio.toArray().forEach((value,i) => expect(value).toBeCloseTo(results[0].audio.getComponent(i), 10));
    }
  });
  it("emits one smooth pulse per distinct onset and settles without beats", () => {
    const motion = new AuraMotion();
    for (let i=0; i<10; i++) motion.update({ transient:true, beatCount:1, bass:1 }, 1/60);
    expect(motion.emissions).toBe(1);
    expect(motion.pulse).toBeGreaterThan(.4);
    expect(motion.pulse).toBeLessThan(1);
    motion.update({ transient:true, beatCount:2, bass:1 }, 1/60);
    expect(motion.emissions).toBe(2);
    for (let i=0; i<180; i++) motion.update({}, 1/60);
    expect(motion.pulse).toBeLessThan(.001);
  });
  it("freezes on zero delta, rejects invalid values and clamps stalls", () => {
    const state = new AuraMotion(); state.update(audio,.05);
    const before = JSON.stringify(state);
    for (const delta of [0,-1,NaN,Infinity]) state.update({transient:true,beatCount:1},delta);
    expect(JSON.stringify(state)).toBe(before);
    const time=state.time;
    state.update({bass:Infinity,mid:NaN,high:-1,level:3},100);
    expect(state.time-time).toBeLessThan(.05);
    expect(state.audio.toArray().every(value => Number.isFinite(value) && value>=0 && value<=1)).toBe(true);
  });
});

describe("Aura integration", () => {
  const setup = () => {
    const renderer = { target:{name:'outer'}, getRenderTarget(){return this.target;}, setRenderTarget(t){this.target=t;}, render:vi.fn() };
    return { renderer, worlds:new ProceduralScenes(renderer, null, 42) };
  };
  it("uses one bounded full-screen shader without changing global colour management", () => {
    const managed = THREE.ColorManagement.enabled, scene = new THREE.Scene(), aura = new AuraScene(scene);
    expect(aura.mesh.geometry.attributes.position.count).toBe(3);
    expect(aura.material.depthTest).toBe(false);
    expect(aura.material.fragmentShader).toContain('stepIndex < 60');
    expect(aura.material.fragmentShader).toContain('warpIndex <= 7');
    expect(THREE.ColorManagement.enabled).toBe(managed);
    aura.mesh.geometry.dispose(); aura.material.dispose();
  });
  it("allocates lazily, reuses resources at all quality levels and releases them once", () => {
    const {renderer, worlds}=setup(), outer=renderer.target;
    expect(isProceduralMode(AURA_MODE)).toBe(true);
    expect(hasSmoke(AURA_MODE)).toBe(false);
    expect(worlds.entries.size).toBe(0);
    worlds.resize(3840,2160,'auto');
    worlds.render(AURA_MODE,{},.016,0,[],false);
    const entry=worlds.entries.get(AURA_MODE), material=entry.aura.material;
    const geometry=entry.aura.mesh.geometry;
    expect(entry.scene.children).toHaveLength(1);
    for (const [quality,settings] of Object.entries(AURA_QUALITY)) {
      worlds.resize(3840,2160,quality);
      expect(entry.target.width).toBe(settings.edge);
      expect(entry.target.height).toBe(Math.round(settings.edge*2160/3840));
      expect(entry.aura.uniforms.uResolution.value.toArray()).toEqual([entry.target.width,entry.target.height]);
      expect(entry.aura.uniforms.uRaySteps.value).toBe(settings.steps);
      expect(entry.aura.material).toBe(material);
      expect(entry.aura.mesh.geometry).toBe(geometry);
    }
    expect(renderer.target).toBe(outer);
    const disposals=[entry.target,material,geometry].map(object=>vi.spyOn(object,'dispose'));
    worlds.dispose();
    disposals.forEach(spy=>expect(spy).toHaveBeenCalledOnce());
  });
  it("keeps audio, pulse and travel frozen on paused redraws and while hidden", () => {
    const {renderer,worlds}=setup();
    worlds.render(AURA_MODE,{bass:1,mid:1,level:1,transient:true,beatCount:1},.05,0,[],false);
    const entry=worlds.entries.get(AURA_MODE), frozen=JSON.stringify(entry.aura.motion);
    worlds.render(AURA_MODE,{bass:0,transient:true,beatCount:2},.05,0,[],true);
    expect(renderer.render).toHaveBeenCalledTimes(1);
    worlds.resize(600,1200,'high');
    worlds.render(AURA_MODE,{bass:0,transient:true,beatCount:2},.05,2,[],true);
    expect(renderer.render).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(entry.aura.motion)).toBe(frozen);
    expect(entry.aura.uniforms.uPalette.value).toBe(2);
    expect(entry.aura.uniforms.uResolution.value.toArray()).toEqual([600,1200]);
    worlds.render(12,{},.05,0,[],false);
    expect(JSON.stringify(entry.aura.motion)).toBe(frozen);
    worlds.render(AURA_MODE,{},.05,0,[],false);
    expect(JSON.stringify(entry.aura.motion)).not.toBe(frozen);
    worlds.dispose();
  });
  it("restores the caller's target even if rendering fails", () => {
    const {renderer,worlds}=setup(), outer=renderer.target;
    renderer.render.mockImplementation(()=>{throw Error('test render failure');});
    expect(()=>worlds.render(AURA_MODE,{},.05,0,[],false)).toThrow('test render failure');
    expect(renderer.target).toBe(outer);
    worlds.dispose();
  });
});
