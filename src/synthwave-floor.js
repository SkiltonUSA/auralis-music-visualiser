import * as THREE from 'three';
import { HorizonWaves, HORIZON_WAVE_COUNT, HORIZON_WAVE_SAMPLES, HORIZON_WAVE_LIFETIME } from './horizon-waves.js';

// Horizon's captured waveform history, projected onto real scene surfaces.
// Each scene owns its history so transitions cannot advance it twice.
export class SynthwaveFloor {
  constructor() {
    this.waves=new HorizonWaves();
    this.texture=new THREE.DataTexture(this.waves.data,HORIZON_WAVE_SAMPLES,HORIZON_WAVE_COUNT,THREE.RedFormat);
    this.texture.minFilter=this.texture.magFilter=THREE.LinearFilter;
    this.texture.generateMipmaps=false;this.texture.needsUpdate=true;
    this.uniforms={uFloorWaveforms:{value:this.texture},uFloorLines:{value:this.waves.lines},uFloorPalette:{value:0}};
  }
  update(audio,delta,palette,travelDistance) {
    const dt=Number.isFinite(delta)?THREE.MathUtils.clamp(delta,0,.05):0;
    // The floor spans 128 world units. Match exact integrated runner travel,
    // while keeping audio capture timing independent of the stride tempo.
    const scale=travelDistance===undefined?1:dt>0&&Number.isFinite(travelDistance)?Math.max(0,travelDistance)*HORIZON_WAVE_LIFETIME/(128*dt):0;
    if(dt>0&&this.waves.update(audio,dt,false,true,scale))this.texture.needsUpdate=true;
    this.uniforms.uFloorPalette.value=Number.isInteger(palette)&&palette>=0&&palette<4?palette:0;
  }
  dispose() { this.texture.dispose(); }
}

export const synthwaveFloorGLSL=/* glsl */ `
uniform sampler2D uFloorWaveforms;
uniform vec4 uFloorLines[${HORIZON_WAVE_COUNT}];
uniform float uFloorPalette;
vec3 synthwaveFloor(vec2 ground,vec3 primary,vec3 secondary){
  if(ground.y< -10.||ground.y>124.)return vec3(0.);
  vec3 color=vec3(0.);
  float width=clamp(fwidth(ground.y)*.7,.035,.5);
  float uvX=1.-abs(mod(.5+ground.x*.025,2.)-1.);
  for(int i=0;i<${HORIZON_WAVE_COUNT};i++){
    vec4 line=uFloorLines[i];if(line.y<=0.)continue;
    float wave=texture2D(uFloorWaveforms,vec2(clamp(uvX,.002,.998),(float(i)+.5)/${HORIZON_WAVE_COUNT}.)).r*2.-1.;
    float z=mix(120.,-8.,line.x)+wave*(.4+line.y*1.2);
    float distance=abs(ground.y-z);
    float core=1.-smoothstep(width*.35,width*1.8,distance);
    float glow=exp(-distance/(width*4.5))*.25;
    float echo=abs(ground.y-z-(.20+wave*.15));
    float thread=(1.-smoothstep(width*.25,width*1.25,echo))*.36;
    float amber=exp(-abs(ground.y-z+.5)/(width*2.))*.16;
    float fade=smoothstep(0.,.09,line.x)*(1.-smoothstep(.94,1.,line.x));
    float light=(.28+line.y*.9+line.w*.18)*fade*exp(-max(ground.y,0.)*.008);
    vec3 ink=uFloorPalette<.5?mix(vec3(.38,1.,.025),vec3(.9,1.,.25),line.z):mix(primary,secondary,line.z);
    color+=(ink*(core+glow+thread)+vec3(.8,.30,.035)*amber)*light;
  }
  return color;
}
`;
