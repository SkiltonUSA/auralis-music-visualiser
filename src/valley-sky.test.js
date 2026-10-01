import { readFileSync } from 'node:fs';
import { describe,expect,it } from 'vitest';
import { valleySkyGLSL,VALLEY_SKY_STEPS } from './valley-sky.js';

const engine=readFileSync(new URL('./visual-engine.js',import.meta.url),'utf8');
describe('Valley volumetric sky',()=>{
  it('uses the supplied structural volume and grade with bounded quality budgets',()=>{
    expect(VALLEY_SKY_STEPS).toEqual({auto:24,high:30,ultra:36});
    expect(valleySkyGLSL).toContain('dot(cos(basis*pos),sin(.228033988*pos*basis))');
    expect(valleySkyGLSL).toContain('valleySkyDensity(samplePos*20.)/20.');
    expect(valleySkyGLSL).toContain('i<36');
    expect(valleySkyGLSL).toContain('float(i)>=uValleySkySteps');
    expect(valleySkyGLSL).toContain('max(distance,.005)');
    expect(engine).toContain('VALLEY_SKY_STEPS[quality] || VALLEY_SKY_STEPS.auto');
    expect(valleySkyGLSL).not.toMatch(/passX|passY|sampler2D/);
  });
  it('renders behind terrain using the valley camera ray and frozen flight clock',()=>{
    expect(engine).toContain('if (hit < .5) return valleySky(ray, sky);');
    expect(engine).toContain('return mix(color, sky, max(fog * .86, horizonBlend))');
    expect(valleySkyGLSL).toContain('worldRay.y');
    expect(valleySkyGLSL).toContain('uFlightTime*.38');
    expect(engine).toContain('this.uniforms.uFlightTime.value = this.flightElapsed');
    expect(valleySkyGLSL).not.toMatch(/gl_FragCoord|uTime|uImpact|uBassHit/);
  });
  it('reacts to global audio levels without flashes or changing camera motion',()=>{
    expect(valleySkyGLSL).toContain('clamp(uBass,0.,1.)');
    expect(valleySkyGLSL).toContain('clamp(uLevel,0.,1.)');
    expect(valleySkyGLSL).toContain('smoothstep(-.025,.22,worldRay.y)');
    expect(valleySkyGLSL).toContain('clouds*.55');
  });
});
