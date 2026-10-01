import { describe,it,expect,vi } from 'vitest';
import { SynthwaveFloor,synthwaveFloorGLSL } from './synthwave-floor.js';
import { HorizonWaves,HORIZON_WAVE_COUNT } from './horizon-waves.js';
import { ProceduralScenes } from './procedural-scenes.js';
import { NeonMarchMotion, NEON_MARCH_TRAVEL_PER_RADIAN } from './neon-march.js';

const audio={waveform:Uint8Array.from({length:1024},(_,i)=>128+Math.round(Math.sin(i*.09)*70)),bass:.6,level:.7,transient:true,beatCount:1};
describe('Horizon-style synthwave floors',()=>{
  it('moves floor rows exactly as far as runners, including tempo changes and gait wraps',()=>{
    for(const fps of [30,60,120]){
      const floor=new SynthwaveFloor(),motion=new NeonMarchMotion();
      floor.update(audio,1/fps,0,0);motion.phase=Math.PI*2-.001;
      let distance=0;
      for(let i=0;i<fps*2;i++){
        const step=motion.update({level:.7,bpm:i<fps?90:180},1/fps)*NEON_MARCH_TRAVEL_PER_RADIAN;
        distance+=step;floor.update({},1/fps,0,step);
        expect(floor.waves.lines[0].x*128).toBeCloseTo(distance,9);
      }
      floor.dispose();
    }
  });
  it('reuses Horizon audio captures and approaching line timing without reallocating',()=>{
    const floor=new SynthwaveFloor(),reference=new HorizonWaves(),data=floor.waves.data;
    for(let i=0;i<180;i++){floor.update(audio,1/60,0);reference.update(audio,1/60);}
    expect(floor.waves.data).toEqual(reference.data);expect(floor.waves.data).toBe(data);
    expect(floor.waves.lines).toEqual(reference.lines);expect(floor.waves.lines).toHaveLength(HORIZON_WAVE_COUNT);
    const snapshot=JSON.stringify(floor.waves);
    for(const dt of [0,-1,NaN,Infinity])floor.update(audio,dt,2);
    expect(JSON.stringify(floor.waves)).toBe(snapshot);
    expect(floor.uniforms.uFloorPalette.value).toBe(2);
    expect(synthwaveFloorGLSL).toContain('mix(120.,-8.,line.x)');
    const silent=new SynthwaveFloor();silent.update({waveform:new Uint8Array(1024).fill(128)},.05,0);
    expect(silent.waves.emissions).toBe(0);floor.dispose();silent.dispose();
  });
  it('keeps waves behind the marchers without adding a floor to Cyber Tunnel',()=>{
    const renderer={target:null,getRenderTarget(){return this.target;},setRenderTarget(t){this.target=t;},render:vi.fn()};
    const worlds=new ProceduralScenes(renderer,null,42);
    worlds.render(24,audio,.05,0,[],false);worlds.render(22,audio,.05,0,[],false);
    const march=worlds.entries.get(24).neonMarch,cyber=worlds.entries.get(22).cyberTunnel;
    for(const effect of [march]){
      expect(effect.material.fragmentShader).toContain(synthwaveFloorGLSL);
      expect(effect.uniforms.uFloorWaveforms.value).toBe(effect.floor.texture);
      expect(effect.floor.waves.emissions).toBe(1);
    }
    expect(march.material.fragmentShader).toContain('(!hit||floorDistance<traveled)');
    expect(cyber.floor).toBeUndefined();
    expect(cyber.material.fragmentShader).not.toContain('synthwaveFloor');
    expect(cyber.character.material.depthTest).toBe(true);expect(cyber.character.material.depthWrite).toBe(true);
    const frozen=JSON.stringify(march.floor.waves);
    worlds.render(22,audio,.05,0,[],false);expect(JSON.stringify(march.floor.waves)).toBe(frozen);
    worlds.dispose();
  });
  it('freezes the history when paused or hidden, preserves quality changes, and disposes its texture',()=>{
    const renderer={target:null,getRenderTarget(){return this.target;},setRenderTarget(t){this.target=t;},render:vi.fn()};
    const worlds=new ProceduralScenes(renderer,null,42),floors=[];
    for(const [mode,key] of [[24,'neonMarch']]){
      worlds.render(mode,audio,.05,0,[],false);const floor=worlds.entries.get(mode)[key].floor;
      floors.push(floor);const snapshot=JSON.stringify(floor.waves),texture=floor.texture;
      for(const quality of ['auto','high','ultra']){
        worlds.resize(700,1000,quality);worlds.render(mode,audio,.05,3,[],true);
        expect(JSON.stringify(floor.waves)).toBe(snapshot);expect(floor.texture).toBe(texture);
        expect(floor.uniforms.uFloorPalette.value).toBe(3);
      }
      worlds.render(16,audio,.05,0,[],false);expect(JSON.stringify(floor.waves)).toBe(snapshot);
    }
    const spies=floors.map(f=>vi.spyOn(f.texture,'dispose'));worlds.dispose();spies.forEach(spy=>expect(spy).toHaveBeenCalledOnce());
  });
});
