import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { DarkMatterMotion, DarkMatterScene, DARK_MATTER_MODE, DARK_MATTER_QUALITY, DARK_MATTER_PALETTES } from "./dark-matter.js";
import { ProceduralScenes, isProceduralMode } from "./procedural-scenes.js";
import { hasSmoke } from "./smoke-simulation.js";

const beat = { bass:.9, mid:.6, high:.4, level:.7, transient:true, beatCount:1 };
describe("Dark Matter audio", () => {
  it("integrates swirl and noise speeds consistently across frame rates", () => {
    const states=[30,60,120].map(fps=>{
      const motion=new DarkMatterMotion();
      for(let i=0;i<fps;i++)motion.update({...beat,transient:i===0},1/fps);
      return motion;
    });
    states.forEach(motion=>{
      expect(motion.time).toBeCloseTo(states[0].time,10);
      expect(motion.rotation).toBeCloseTo(states[0].rotation,10);
      expect(motion.pulse).toBeCloseTo(states[0].pulse,10);
      expect(motion.sinceBeat).toBeCloseTo(1,10);
      expect(motion.time).toBeGreaterThan(1.1);
      expect(motion.rotation).toBeGreaterThan(.25);
    });
  });
  it("deduplicates beats, sends pulses outward and eases back during silence", () => {
    const motion=new DarkMatterMotion();
    for(let i=0;i<12;i++)motion.update(beat,1/60);
    expect(motion.emissions).toBe(1);
    expect(motion.sinceBeat).toBeCloseTo(.2);
    expect(motion.pulse).toBeGreaterThan(.3);
    motion.update({...beat,beatCount:2},1/60);
    expect(motion.emissions).toBe(2);
    expect(motion.sinceBeat).toBeCloseTo(1/60);
    for(let i=0;i<180;i++)motion.update({},1/60);
    expect(motion.pulse).toBeLessThan(.001);
    expect(motion.audio.length()).toBeLessThan(.001);
  });
  it("freezes on invalid/paused deltas, clamps stalls and sanitizes incoming levels", () => {
    const motion=new DarkMatterMotion();motion.update(beat,.05);
    const frozen=JSON.stringify(motion);
    for(const delta of [0,-1,NaN,Infinity])motion.update({...beat,beatCount:2},delta);
    expect(JSON.stringify(motion)).toBe(frozen);
    const time=motion.time;
    motion.update({bass:Infinity,mid:5,high:NaN,level:-2},10);
    expect(motion.time-time).toBeLessThan(.07);
    expect(motion.audio.toArray().every(v=>Number.isFinite(v)&&v>=0&&v<=1)).toBe(true);
  });
});

describe("Dark Matter rendering", () => {
  const setup=()=>{
    const renderer={target:{name:'caller'},getRenderTarget(){return this.target;},setRenderTarget(t){this.target=t;},render:vi.fn()};
    return {renderer,worlds:new ProceduralScenes(renderer,null,42)};
  };
  it("uses bounded volume integration with a nonnegative core and no double opacity", () => {
    const scene=new THREE.Scene(), effect=new DarkMatterScene(scene), shader=effect.material.fragmentShader;
    expect(effect.mesh.geometry.attributes.position.count).toBe(3);
    expect(shader).toContain('i < 64');
    expect(shader).toContain('(interval.y - interval.x) / float(uSteps)');
    expect(shader).toContain('color += transmittance * alpha * tint');
    expect(shader).toContain('color *= exp(-absorption)');
    expect(shader).toContain('clamp(color, vec3(0.), vec3(4.))');
    expect(shader).not.toContain('mix(col, volCol');
    expect(shader).not.toContain('smoothstep(2.5, 0.5');
    DARK_MATTER_PALETTES.forEach((colors,index)=>{
      effect.update({},0,index);
      ['uOuter','uMid','uDeep','uCore'].forEach((key,i)=>expect(effect.uniforms[key].value.getHex()).toBe(colors[i]));
    });
    effect.dispose();effect.mesh.geometry.dispose();effect.material.dispose();
  });
  it("allocates lazily, bounds all quality tiers and disposes every resource once", () => {
    const {renderer,worlds}=setup(), outer=renderer.target;
    expect(isProceduralMode(DARK_MATTER_MODE)).toBe(true);
    expect(hasSmoke(DARK_MATTER_MODE)).toBe(false);
    expect(worlds.entries.size).toBe(0);
    worlds.resize(3840,2160,'auto');
    worlds.render(DARK_MATTER_MODE,beat,.05,0,[],false);
    const entry=worlds.entries.get(DARK_MATTER_MODE),material=entry.darkMatter.material,geometry=entry.darkMatter.mesh.geometry;
    expect(entry.scene.children).toHaveLength(1);
    expect(renderer.target).toBe(outer);
    for(const [quality,settings] of Object.entries(DARK_MATTER_QUALITY)){
      worlds.resize(3840,2160,quality);
      expect(entry.target.width).toBe(settings.edge);
      expect(entry.darkMatter.uniforms.uSteps.value).toBe(settings.steps);
      expect(entry.darkMatter.uniforms.uResolution.value.toArray()).toEqual([entry.target.width,entry.target.height]);
      expect(entry.darkMatter.material).toBe(material);
      expect(entry.darkMatter.mesh.geometry).toBe(geometry);
    }
    const disposals=[entry.target,material,geometry,entry.darkMatter.scope.texture].map(o=>vi.spyOn(o,'dispose'));
    worlds.dispose();disposals.forEach(spy=>expect(spy).toHaveBeenCalledOnce());
  });
  it("keeps motion frozen during paused resizes and hidden scenes, then resumes", () => {
    const {renderer,worlds}=setup();
    worlds.render(DARK_MATTER_MODE,beat,.05,0,[],false);
    const entry=worlds.entries.get(DARK_MATTER_MODE), frozen=JSON.stringify(entry.darkMatter.motion);
    worlds.render(DARK_MATTER_MODE,{...beat,beatCount:2},.05,0,[],true);
    expect(renderer.render).toHaveBeenCalledTimes(1);
    worlds.resize(500,1000,'high');
    worlds.render(DARK_MATTER_MODE,{...beat,beatCount:2},.05,2,[],true);
    expect(JSON.stringify(entry.darkMatter.motion)).toBe(frozen);
    expect(renderer.render).toHaveBeenCalledTimes(2);
    expect(entry.darkMatter.uniforms.uOuter.value.getHex()).toBe(DARK_MATTER_PALETTES[2][0]);
    worlds.render(16,beat,.05,0,[],false);
    expect(JSON.stringify(entry.darkMatter.motion)).toBe(frozen);
    worlds.render(DARK_MATTER_MODE,{},.05,0,[],false);
    expect(JSON.stringify(entry.darkMatter.motion)).not.toBe(frozen);
    worlds.dispose();
  });
  it("restores the render target even when drawing fails", () => {
    const {renderer,worlds}=setup(), outer=renderer.target;
    renderer.render.mockImplementation(()=>{throw Error('test failure');});
    expect(()=>worlds.render(DARK_MATTER_MODE,{},.05,0,[],false)).toThrow('test failure');
    expect(renderer.target).toBe(outer);worlds.dispose();
  });
});
