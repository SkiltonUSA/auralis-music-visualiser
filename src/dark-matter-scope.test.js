import { describe,it,expect,vi } from 'vitest';
import * as THREE from 'three';
import { DarkMatterScope,darkMatterScopeGLSL } from './dark-matter-scope.js';
import { oscilloscopeSamples } from './deck-oscilloscope.js';
import { DarkMatterScene } from './dark-matter.js';
describe('Dark Matter live oscilloscope',()=>{
  it('matches the deck waveform trigger and gain, including quiet and invalid input',()=>{
    const scope=new DarkMatterScope();
    const wave=Uint8Array.from({length:2048},(_,i)=>128+70*Math.sin(i*.08));
    scope.update(wave,1/60);
    expect(scope.samples).toEqual(oscilloscopeSamples(wave,1.2));
    expect(Math.max(...scope.data)).toBeGreaterThan(180);expect(Math.min(...scope.data)).toBeLessThan(80);
    scope.update([NaN,Infinity],1/60);expect([...scope.data].every(v=>v===128)).toBe(true);
    scope.update([],1/60);expect([...scope.data].every(v=>v===128)).toBe(true);
    scope.dispose();
  });
  it('freezes the texture on pause and reuses its storage',()=>{
    const scope=new DarkMatterScope(),data=scope.data;
    scope.update(new Uint8Array(2048).fill(180),.05);
    const before=scope.data.slice(),version=scope.texture.version;
    for(const dt of [0,-1,NaN,Infinity])scope.update([],dt);
    expect(scope.data).toBe(data);expect(scope.data).toEqual(before);expect(scope.texture.version).toBe(version);
    const dispose=vi.spyOn(scope.texture,'dispose');scope.dispose();expect(dispose).toHaveBeenCalledOnce();
  });
  it('belongs to Dark Matter, not its stationary Light Tunnel background',()=>{
    const foreground=new DarkMatterScene(new THREE.Scene()),background=new DarkMatterScene(new THREE.Scene(),{distantBackground:true});
    expect(foreground.uniforms.uScopeWaveform.value).toBe(foreground.scope.texture);
    expect(background.scope).toBeNull();
    expect(darkMatterScopeGLSL).toContain('#ifdef DISTANT_BACKGROUND\n    return vec3(0.)');
    expect(foreground.material.fragmentShader).toContain('vec4(scope,1.)');
    for(const effect of [foreground,background]){effect.dispose();effect.mesh.geometry.dispose();effect.material.dispose();}
  });
});
