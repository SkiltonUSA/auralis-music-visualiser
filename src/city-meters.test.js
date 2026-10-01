import { describe, expect, it } from 'vitest';
import { CityMeters, cityMetersGLSL } from './city-meters.js';
describe('Neon City façade sound meters',()=>{
  it('raises only the frequency-driven columns and releases smoothly into silence',()=>{
    const meters=new CityMeters(),fft=new Uint8Array(256);fft.fill(255,80,88);
    for(let i=0;i<30;i++)meters.update(fft,1/60);
    expect(meters.levels[10]).toBeGreaterThan(.99);
    expect([...meters.levels].filter(v=>v>0)).toHaveLength(1);
    const peak=meters.peaks[10];meters.update(new Uint8Array(256),1/60);
    expect(meters.levels[10]).toBeLessThan(peak);expect(meters.levels[10]).toBeGreaterThan(.85);
    expect(meters.peaks[10]).toBe(peak);
    for(let i=0;i<240;i++)meters.update([],1/60);
    expect(meters.data[40]).toBe(0);expect(meters.data[41]).toBe(0);
  });
  it('shows clear loud/quiet height changes within a beat, without a visual spring tail',()=>{
    const m=new CityMeters(),fft=new Uint8Array(1024).fill(210);
    for(let i=0;i<6;i++)m.update(fft,1/60,true);
    const loud=m.levels[12];expect(loud).toBeGreaterThan(.8);
    fft.fill(65);
    for(let i=0;i<12;i++)m.update(fft,1/60,true);
    expect(m.levels[12]).toBeLessThan(.26);
    expect(loud-m.levels[12]).toBeGreaterThan(.55);
    fft.fill(210);for(let i=0;i<4;i++)m.update(fft,1/60,true);
    expect(m.levels[12]).toBeGreaterThan(.8);
  });
  it('ignores DC and lights only the raw frequency bands containing sound',()=>{
    const m=new CityMeters(),fft=new Uint8Array(1024);fft[0]=255;
    m.update(fft,1/60,true);expect([...m.levels].every(v=>v===0)).toBe(true);
    fft.fill(255,175,197);for(let i=0;i<12;i++)m.update(fft,1/60,true);
    expect(m.levels[16]).toBeGreaterThan(.99);
    expect(m.levels[4]).toBe(0);expect(m.levels[28]).toBe(0);
  });
  it('has frame-rate-independent attack and release, no idle animation and no pause drift',()=>{
    const states=[30,60,120].map(fps=>{
      const m=new CityMeters();for(let i=0;i<fps;i++)m.update(new Uint8Array(256).fill(180),1/fps);
      for(let i=0;i<fps;i++)m.update([],1/fps);return m;
    });
    states.forEach(m=>expect(m.levels[0]).toBeCloseTo(states[0].levels[0],6));
    const m=states[0],before=m.data.slice();
    for(const dt of [0,-1,NaN,Infinity])expect(m.update(new Uint8Array(256).fill(255),dt)).toBe(false);
    expect(m.data).toEqual(before);
    const silent=new CityMeters();for(let i=0;i<100;i++)silent.update([],1/60);
    expect([...silent.levels,...silent.peaks].every(v=>v===0)).toBe(true);
  });
  it('sanitises inputs and keeps existing strips anchored to building height, not camera motion',()=>{
    const m=new CityMeters();m.update([NaN,Infinity,-12,800],20);
    expect([...m.levels,...m.peaks].every(v=>Number.isFinite(v)&&v>=0&&v<=1)).toBe(true);
    expect(cityMetersGLSL).toContain('vLocal.y-uMeterBottom');
    expect(cityMetersGLSL).toContain('uCityMeters');
    expect(cityMetersGLSL).not.toMatch(/uTime|uTravel/);
  });
});
