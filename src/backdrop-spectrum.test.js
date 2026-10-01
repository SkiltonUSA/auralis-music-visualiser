import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { BACKDROP_BAND_MIN,BACKDROP_BAND_MAX,backdropSpectrumGLSL } from './backdrop-spectrum.js';
describe('shared background meter frequency mapping',()=>{
  it('gives every bar a distinct source bin at all supported column counts',()=>{
    for(let count=42;count<=68;count++){
      const bins=Array.from({length:count},(_,i)=>{
        const coordinate=BACKDROP_BAND_MIN+(BACKDROP_BAND_MAX-BACKDROP_BAND_MIN)*i/(count-1);
        // Match the 256-entry texture's existing quadratic FFT remapping.
        const texel=Math.floor(coordinate*255);
        return Math.floor((texel/255)**2*700);
      });
      expect(bins[0]).toBeGreaterThan(0);
      expect(new Set(bins).size).toBe(count);
      expect(bins.every((bin,i)=>i===0||bin>bins[i-1])).toBe(true);
    }
  });
  it('uses the same unsquared coordinate for bars and held peaks',()=>{
    const source=readFileSync(new URL('./visual-engine.js',import.meta.url),'utf8');
    const bars=source.split('vec3 colorBarBackdrop')[1].split('float barSceneVisibility')[0];
    expect(bars).toContain('backdropBand(id, columns)');
    expect(bars).toContain('spectrumAt(frequencyPosition)');
    expect(bars).toContain('peakAt(frequencyPosition)');
    expect(bars).not.toContain('frequencyPosition * frequencyPosition');
    expect(backdropSpectrumGLSL).toContain('id/max(1.,columns-1.)');
    expect(bars).toContain('gl_FragCoord.x / uResolution.x');
    expect(bars).toContain('floor(mix(42., 68.');
  });
});
