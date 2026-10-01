import * as THREE from 'three';
import { oscilloscopeSamples } from './deck-oscilloscope.js';

export class DarkMatterScope {
  constructor() {
    this.samples=new Float32Array(384);
    this.data=new Uint8Array(384).fill(128);
    this.texture=new THREE.DataTexture(this.data,384,1,THREE.RedFormat);
    this.texture.minFilter=this.texture.magFilter=THREE.LinearFilter;
    this.texture.generateMipmaps=false;this.texture.needsUpdate=true;
  }
  update(waveform,delta) {
    if(!Number.isFinite(delta)||delta<=0)return;
    // Same trigger and fixed display calibration as the deck. Global Response
    // has already scaled these time-domain samples in the audio engine.
    oscilloscopeSamples(waveform,1.2,this.samples);
    for(let i=0;i<this.data.length;i++)this.data[i]=Math.round(128+this.samples[i]*127);
    this.texture.needsUpdate=true;
  }
  dispose(){this.texture.dispose();}
}

export const darkMatterScopeGLSL=/* glsl */ `
  #ifndef DISTANT_BACKGROUND
  uniform sampler2D uScopeWaveform;
  #endif
  vec3 darkMatterScope(vec2 screen){
    #ifdef DISTANT_BACKGROUND
    return vec3(0.);
    #else
    // Screen-space trace below the vortex, with matching purple glow.
    float x=(screen.x-.055)/.89;
    if(x<0.||x>1.)return vec3(0.);
    float sampleX=(clamp(x,0.,1.)*383.+.5)/384.;
    float wave=(texture2D(uScopeWaveform,vec2(sampleX,.5)).r*255.-128.)/127.;
    float y=.19+wave*.055;
    float d=abs(screen.y-y);
    float pixel=1./max(uResolution.y,1.);
    float aa=max(fwidth(screen.y-y),pixel);
    float line=1.-smoothstep(pixel, pixel+aa,d);
    float glow=exp(-d/max(.0035,pixel*2.))* .32;
    float fade=smoothstep(0.,.02,x)*(1.-smoothstep(.98,1.,x));
    return (vec3(.78,.52,1.)*line*.85+vec3(.4,.13,.7)*glow)*fade;
    #endif
  }
`;
