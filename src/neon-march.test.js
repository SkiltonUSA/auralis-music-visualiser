import { describe,it,expect,vi } from "vitest";
import { NeonMarchMotion,NEON_MARCH_MODE,NEON_MARCH_QUALITY,NEON_MARCH_PALETTES } from "./neon-march.js";
import { ProceduralScenes,isProceduralMode } from "./procedural-scenes.js";
import { hasSmoke } from "./smoke-simulation.js";

const beat={bass:.9,mid:.6,high:.4,level:.7,bpm:120,transient:true,beatCount:1};
describe("Neon March",()=>{
  it("integrates cadence smoothly at every frame rate without resetting phase on beats",()=>{
    const states=[30,60,120].map(fps=>{const m=new NeonMarchMotion();for(let i=0;i<fps;i++)m.update(beat,1/fps);return m;});
    states.forEach(m=>{expect(m.phase).toBeCloseTo(states[0].phase,10);expect(m.speed).toBeCloseTo(states[0].speed,10);expect(m.pulse).toBeCloseTo(states[0].pulse,10);expect(m.emissions).toBe(1);});
    const speeds=[60,120,180].map(bpm=>{const m=new NeonMarchMotion();for(let i=0;i<200;i++)m.update({...beat,bpm},.05);return m.speed;});
    expect(speeds[2]).toBeGreaterThan(speeds[1]);expect(speeds[1]).toBeGreaterThan(speeds[0]);
    const m=new NeonMarchMotion();m.update(beat,.05);const frozen=JSON.stringify(m);
    for(const dt of [0,-1,NaN,Infinity])m.update({...beat,beatCount:2},dt);expect(JSON.stringify(m)).toBe(frozen);
    m.phase=Math.PI*2-.001;m.update({...beat,beatCount:2},.05);expect(m.phase).toBeLessThan(.7);expect(m.emissions).toBe(2);
    for(let i=0;i<200;i++)m.update({bpm:180},.05);expect(m.speed).toBeCloseTo(1.2,8);
    m.update({bass:NaN,mid:Infinity,high:9,level:-1,bpm:Infinity},100);
    expect(m.audio.toArray().every(v=>Number.isFinite(v)&&v>=0&&v<=1)).toBe(true);
  });
  it("reuses one bounded shader across qualities, freezes hidden/paused state and disposes once",()=>{
    const renderer={target:{},getRenderTarget(){return this.target;},setRenderTarget(t){this.target=t;},render:vi.fn()};
    const caller=renderer.target,worlds=new ProceduralScenes(renderer,null,42);
    expect(isProceduralMode(NEON_MARCH_MODE)).toBe(true);expect(hasSmoke(NEON_MARCH_MODE)).toBe(false);
    expect(worlds.entries.size).toBe(0);worlds.resize(3840,2160,'auto');worlds.render(24,beat,.05,0,[],false);
    const entry=worlds.entries.get(24),effect=entry.neonMarch,material=effect.material,geometry=effect.mesh.geometry;
    expect(renderer.target).toBe(caller);expect(geometry.attributes.position.count).toBe(3);
    expect(material.fragmentShader).toContain('float traveled=0.,halo=0.');
    expect(material.fragmentShader).toContain('i<100');expect(material.fragmentShader).toContain('max(.002,d*.6)');
    expect(material.fragmentShader).not.toContain('exp(e*1e4)');
    // Rotate the local figure after tiling, without reversing crowd translation.
    expect(material.fragmentShader).toContain('q.z-=k/PI*20.;q.xz=4.-mod(q.xz,8.);');
    expect(material.fragmentShader.indexOf('q.xz=-q.xz;')).toBeGreaterThan(material.fragmentShader.indexOf('q.xz=4.-mod(q.xz,8.);'));
    const frozen=JSON.stringify(effect.motion);
    for(const [quality,settings] of Object.entries(NEON_MARCH_QUALITY)){
      worlds.resize(3840,2160,quality);worlds.render(24,{...beat,beatCount:2},.05,2,[],true);
      expect(entry.target.width).toBe(settings.edge);expect(effect.mesh.geometry).toBe(geometry);expect(effect.material).toBe(material);
      expect(JSON.stringify(effect.motion)).toBe(frozen);
    }
    NEON_MARCH_PALETTES.forEach((colors,i)=>{effect.update({},0,i);expect(effect.uniforms.uPrimary.value.getHex()).toBe(colors[0]);});
    worlds.render(17,beat,.05,0,[],false);expect(JSON.stringify(effect.motion)).toBe(frozen);
    worlds.render(24,{},.05,0,[],false);expect(JSON.stringify(effect.motion)).not.toBe(frozen);
    renderer.render.mockImplementation(()=>{throw Error('draw failure');});
    expect(()=>worlds.render(24,{},.05,0,[],false)).toThrow('draw failure');expect(renderer.target).toBe(caller);
    const spies=[entry.target,material,geometry].map(o=>vi.spyOn(o,'dispose'));worlds.dispose();spies.forEach(spy=>expect(spy).toHaveBeenCalledOnce());
  });
});
