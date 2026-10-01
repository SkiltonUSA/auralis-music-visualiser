import * as THREE from "three";
import { CityAssets, createCityModels, CITY_VARIANTS } from './city-assets.js';
import { CityAura } from './city-aura.js';
import { CityMeters, CITY_METER_COUNT, cityMetersGLSL } from './city-meters.js';

// Inspired by Jeff Beene's Synthcity grid streaming, district variation,
// emissive adverts and elevated traffic (MIT), commit 5a4ee0dd231ce06653a2a9776ed2e36137918d21.
// Original streaming/audio shaders with bundled upstream city meshes/textures.
export const NEON_CITY_MODE = 25;
export const CITY_BLOCK = 96;
export const CITY_STREET_SMOKE_LEVEL = 50;
export const CITY_STREET_SMOKE_OPACITY = .095;
export const CITY_HAZE_OPACITY = .07;
export const CITY_STREET_SMOKE_HEIGHTS = [-7.5, -5, -2.5, 0, 2.5, 5, 7.5].map(offset => CITY_STREET_SMOKE_LEVEL + offset);
export const NEON_CITY_QUALITY = { auto: { rows: 14, traffic: 24 }, high: { rows: 18, traffic: 36 }, ultra: { rows: 22, traffic: 48 } };
export const NEON_CITY_PALETTES = [
  [0x749dff,0xed46ff,0xe1daff,0x26218e], [0xff803a,0xff306c,0xffd58d,0x351332],
  [0x2fffd1,0x388bff,0xc1ffe9,0x041921], [0xff5734,0xffe0b2,0xffaa32,0x1b0b14],
];
export const CITY_BUILDINGS_PER_ROW=48;
export const CITY_FLIGHT={startHeight:280,streetHeight:100,cruiseCeiling:220,descentStart:48,descentEnd:360,approachLength:384};
const MAX_ROWS=22, BUILDINGS_PER_ROW=CITY_BUILDINGS_PER_ROW, PER_VARIANT=BUILDINGS_PER_ROW/CITY_VARIANTS;
const unit=v=>Number.isFinite(v)?THREE.MathUtils.clamp(v,0,1):0;
export const cityCenter=s=>Math.sin(s*.0015)*34+Math.sin(s*.003)*9;
// Rounded street grid circuit, repeated forward into newly streamed districts.
// Cross streets are at block boundaries; side avenues sit between tower columns.
const routePoints=[[0,0],[0,192],[54,192],[54,576],[0,576],[0,960],[-54,960],[-54,1344],[0,1344],[0,1536]];
const routeSegments=[];
const turnRadius=20;
let routeLength=0;
function addRouteSegment(segment){segment.start=routeLength;routeLength+=segment.length;routeSegments.push(segment);}
let routeStart=routePoints[0];
for(let i=1;i<routePoints.length-1;i++){
  const previous=routePoints[i-1],corner=routePoints[i],next=routePoints[i+1];
  const incoming=[Math.sign(corner[0]-previous[0]),Math.sign(corner[1]-previous[1])];
  const outgoing=[Math.sign(next[0]-corner[0]),Math.sign(next[1]-corner[1])];
  const entry=corner.map((v,j)=>v-incoming[j]*turnRadius),exit=corner.map((v,j)=>v+outgoing[j]*turnRadius);
  addRouteSegment({from:routeStart,to:entry,length:Math.hypot(entry[0]-routeStart[0],entry[1]-routeStart[1])});
  const center=entry.map((v,j)=>v+outgoing[j]*turnRadius);
  addRouteSegment({center,angle:Math.atan2(entry[1]-center[1],entry[0]-center[0]),
    turn:incoming[0]*outgoing[1]-incoming[1]*outgoing[0],length:Math.PI*turnRadius/2});
  routeStart=exit;
}
const routeEnd=routePoints.at(-1);
addRouteSegment({from:routeStart,to:routeEnd,length:Math.hypot(routeEnd[0]-routeStart[0],routeEnd[1]-routeStart[1])});
export const CITY_ROUTE_LENGTH=routeLength;
export function sampleCityFlight(distance,target=new THREE.Vector3()){
  const descent=THREE.MathUtils.smootherstep(distance,CITY_FLIGHT.descentStart,CITY_FLIGHT.descentEnd);
  let height=THREE.MathUtils.lerp(CITY_FLIGHT.startHeight,CITY_FLIGHT.streetHeight,descent);
  // Establish the skyline closer to the rooftops, then descend along the
  // central boulevard before joining the gently rounded street circuit.
  if(distance<CITY_FLIGHT.approachLength)return target.set(cityCenter(distance),height,distance);
  const routeDistance=distance-CITY_FLIGHT.approachLength;
  // Broad, overlapping climbs rather than beat bobbing. Use unwrapped route
  // distance so altitude never resets when the horizontal street circuit loops.
  const lift=(.5-.5*Math.cos(routeDistance*.009))*(72+28*Math.sin(routeDistance*.0031)**2)
    +20*Math.sin(routeDistance*.0049)**2;
  height+=lift*THREE.MathUtils.smootherstep(routeDistance,0,160);
  const lap=Math.floor(routeDistance/routeLength),along=routeDistance-lap*routeLength;
  const segment=routeSegments.find(s=>along<s.start+s.length)||routeSegments.at(-1);
  const t=THREE.MathUtils.clamp((along-segment.start)/segment.length,0,1);
  let x,s;
  if(segment.center){
    const angle=segment.angle+segment.turn*t*Math.PI/2;
    x=segment.center[0]+Math.cos(angle)*turnRadius;s=segment.center[1]+Math.sin(angle)*turnRadius;
  }else{x=THREE.MathUtils.lerp(segment.from[0],segment.to[0],t);s=THREE.MathUtils.lerp(segment.from[1],segment.to[1],t);}
  s+=lap*1536+CITY_FLIGHT.approachLength;
  // The horizontal corridor stays clear at every altitude, including podiums.
  return target.set(cityCenter(s)+x,height,s);
}
function randomSource(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}

export function createCityRow(row,seed=313){
  const random=randomSource((Math.imul(row,374761393)^seed)>>>0),buildings=[];
  for(const side of [-1,1])for(let column=0;column<12;column++)for(let lot=0;lot<2;lot++){
    const s=row*CITY_BLOCK+lot*CITY_BLOCK/2+CITY_BLOCK/4;
    const district=.5+.5*Math.sin(row*.37+column*.9);
    const variant=(buildings.length+((row%CITY_VARIANTS)+CITY_VARIANTS)%CITY_VARIANTS)%CITY_VARIANTS;
    const height=variant<2?28+random()*35:variant<4?48+random()*55:variant<6?85+random()*70:
      district>.72?230+random()*125:90+random()*65;
    const width=column<2?21+random()*10:32+random()*11,depth=column<2?21+random()*7:28+random()*10;
    buildings.push({x:cityCenter(s)+side*(30+column*48)+(random()-.5)*3,s,width,depth,height,
      seed:random()*1000,band:random(),variant,turn:Math.floor(random()*4)});
  }
  return buildings;
}

export class NeonCityMotion {
  constructor(){this.travel=0;this.time=0;this.audio=new THREE.Vector4(0,0,0,0);this.drive=0;this.pulse=0;this.lastBeat=-1;this.wasTransient=false;this.emissions=0;}
  update(audio,delta){
    const dt=Number.isFinite(delta)?THREE.MathUtils.clamp(delta,0,.05):0;if(!dt)return 0;
    const ease=1-Math.exp(-3*dt),integral=(old,target)=>target*dt+(old-target)*ease/3;
    this.travel+=24*dt+8*integral(this.audio.w,unit(audio.level));this.time+=dt;
    [audio.bass,audio.mid,audio.high,audio.level].forEach((v,i)=>this.audio.setComponent(i,THREE.MathUtils.lerp(this.audio.getComponent(i),unit(v),ease)));
    if(audio.transient&&(!this.wasTransient||(Number.isFinite(audio.beatCount)&&audio.beatCount!==this.lastBeat))){
      this.drive=Math.max(this.drive,.65+unit(audio.bass)*.35);this.lastBeat=audio.beatCount;this.emissions++;
    }
    this.wasTransient=Boolean(audio.transient);
    const attack=Math.exp(-20*dt),release=Math.exp(-4.5*dt);
    this.pulse=this.pulse*attack+this.drive*20/15.5*(release-attack);this.drive*=release;
    return dt;
  }
}

const shared=/* glsl */ `
uniform vec3 uCyan,uPink,uWarm,uFog;
uniform vec4 uAudio;
uniform float uPulse,uTime,uFar,uTravel;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float cityX(float s){return sin(s*.0015)*34.+sin(s*.003)*9.;}
vec3 fogged(vec3 c,float depth){return mix(c,uFog,smoothstep(uFar*.23,uFar,depth));}
float line(float v,float width){return 1.-smoothstep(width,width+max(fwidth(v),.003),abs(v));}
`;
const buildingVertex=/* glsl */ `
attribute vec2 aIdentity;
attribute float aMeterStrip;
varying float vMeterStrip;
varying vec3 vLocal,vNormal,vWorld;
varying float vBuildingHeight;
varying vec2 vUv;
varying vec2 vIdentity;
varying float vDepth;
void main(){
  vLocal=position;vUv=uv;vIdentity=aIdentity;vMeterStrip=aMeterStrip;
  vec3 scaleSq=vec3(dot(instanceMatrix[0].xyz,instanceMatrix[0].xyz),dot(instanceMatrix[1].xyz,instanceMatrix[1].xyz),dot(instanceMatrix[2].xyz,instanceMatrix[2].xyz));
  vBuildingHeight=sqrt(scaleSq.y);
  vNormal=normalize(mat3(instanceMatrix)*(normal/max(scaleSq,vec3(.0001))));
  vec4 world=modelMatrix*instanceMatrix*vec4(position,1.);vWorld=world.xyz;
  vec4 view=viewMatrix*world;vDepth=max(-view.z,length(view.xyz)*.82);
  gl_Position=projectionMatrix*view;
}`;
const buildingFragment=/* glsl */ `
${shared}
uniform sampler2D uCitySpectrum,uFacade,uWindows;
uniform sampler2D uCityMeters;
uniform float uMeterBottom,uMeterTop;
varying float vBuildingHeight;
varying vec3 vLocal,vNormal,vWorld;
varying vec2 vUv;
varying vec2 vIdentity;
varying float vDepth;
void main(){
  float id=vIdentity.x;
  vec3 facade=texture2D(uFacade,vUv).rgb,windows=texture2D(uWindows,vUv).rgb;
  float fft=texture2D(uCitySpectrum,vec2(vIdentity.y,.5)).r;
  float illumination=.025+max(0.,dot(normalize(vNormal),normalize(vec3(-.6,.7,.4))))*.09;
  vec3 color=facade*mix(uCyan,uPink,.4)*illumination+vec3(.0005,.0007,.0015);
  vec3 tint=mix(uCyan,uWarm,.6+.35*sin(id));
  ${cityMetersGLSL}
  float section=.35+.65*hash(vec2(floor(vUv.y*8.),id));
  color+=windows*meterTint*section*(2.8+fft*.7+uPulse*.18)*meterLight;
  // District light spill on dark glass, never a uniform luminous outline.
  float spill=pow(.5+.5*sin(vWorld.x*.025+(uTravel-vWorld.z)*.014),5.);
  color+=facade*uPink*spill*.16;
  gl_FragColor=vec4(fogged(color,vDepth),1.);
}`;
const advertFragment=/* glsl */ `
${shared}
uniform sampler2D uAdvert,uCitySpectrum;
uniform sampler2D uCityMeters;
uniform float uMeterBottom,uMeterTop;
varying vec3 vLocal;
varying float vBuildingHeight,vMeterStrip;
varying vec2 vUv,vIdentity;varying float vDepth;
void main(){
  vec3 art=texture2D(uAdvert,vUv).rgb;
  float fft=texture2D(uCitySpectrum,vec2(vIdentity.y,.5)).r;
  float scan=.96+.04*sin(vUv.y*650.-uTime*.7);
  float brightness=max(art.r,max(art.g,art.b));
  float white=min(art.r,min(art.g,art.b))/max(brightness,.001);
  vec3 tint=mix(mix(uCyan,uPink,step(.4,fract(vIdentity.x))),vec3(.88,.86,1.),white*white);
  vec3 color=brightness*tint*(2.5+fft*.7+uPulse*.25)*scan;
  ${cityMetersGLSL}
  // The original tall rails live alongside adverts. Only the tagged rails
  // fill upward; signs retain their artwork and normal illumination.
  vec3 railColor=mix(uCyan,uPink,meterY*.65)*(.008+fill*gap*1.6+peak*.65);
  color=mix(color,railColor,step(.5,vMeterStrip));
  gl_FragColor=vec4(fogged(color,vDepth),1.);
}`;
const groundVertex=/* glsl */ `varying vec3 vWorld;varying float vDepth;
void main(){vec4 world=modelMatrix*vec4(position,1.);vWorld=world.xyz;vec4 view=viewMatrix*world;vDepth=-view.z;gl_Position=projectionMatrix*view;}`;
const groundFragment=/* glsl */ `
${shared}
varying vec3 vWorld;varying float vDepth;
void main(){
  float s=uTravel-vWorld.z,x=vWorld.x-cityX(s),ax=abs(x);
  float avenue=ax<30.?1000.:abs(mod(ax-30.,48.)-24.);
  float laneDistance=min(ax*.7,avenue);
  float road=1.-smoothstep(6.7,7.,laneDistance);
  float crossDistance=abs(mod(s+${CITY_BLOCK/2}.,${CITY_BLOCK}.)-${CITY_BLOCK/2}.);
  float crossStreet=1.-smoothstep(7.7,8.,crossDistance);
  float edge=line(laneDistance-7.,.1)*(1.-crossStreet),curb=line(laneDistance-8.5,.18)*(1.-crossStreet);
  float dash=step(.55,fract(s/12.));
  float lane=line(laneDistance,.065)*dash*road*(1.-crossStreet);
  edge+=line(crossDistance-8.,.1)*(1.-road);
  vec3 color=mix(vec3(.009,.008,.018),vec3(.004,.004,.012),max(road,crossStreet));
  color+=uCyan*(edge*.08+lane*.035)*(1.+uAudio.z*.2)+uPink*curb*.035;
  float pools=pow(.5+.5*cos(s*.065),8.)*exp(-laneDistance*.13);
  color+=mix(uCyan,uPink,.5+.5*sin(s*.009))*(pools*.25)*road;
  // Cheap wet-asphalt streaks suggest reflected signs without a mirror pass.
  float ripple=.5+.5*sin(s*1.9+sin(x*2.4));
  float streak=pow(.5+.5*sin(s*.18),6.)*exp(-abs(ax-13.)*.25)*road;
  color+=mix(uCyan,uPink,.5+.5*sin(s*.036))*streak*(.03+ripple*.035)*(1.+uPulse*.3);
  gl_FragColor=vec4(fogged(color,max(0.,vDepth)),1.);
}`;
const skyVertex=/* glsl */ `
uniform mat4 uSkyInverseProjection, uSkyCameraWorld;
varying vec3 vSkyDirection;
void main(){
  vec3 viewRay=(uSkyInverseProjection*vec4(position.xy,1.,1.)).xyz;
  // Direction only: camera translation and streamed city offsets never move
  // the distant sky. Camera yaw, pitch and roll reveal its fixed world bearing.
  vSkyDirection=(uSkyCameraWorld*vec4(viewRay,0.)).xyz;
  gl_Position=vec4(position.xy,1.,1.);
}`;
const skyFragment=/* glsl */ `
${shared}
uniform sampler2D uSky, uCityAura;
varying vec3 vSkyDirection;
void main(){
  vec3 ray=normalize(vSkyDirection);
  float azimuth=atan(ray.x,-ray.z),elevation=asin(clamp(ray.y,-1.,1.));
  vec2 skyUv=vec2(.5+azimuth/6.2831853,.5+elevation/3.14159265);
  float horizon=exp(-pow(ray.y*6.,2.));
  vec3 color=uFog*(.55+horizon*.3)+uCyan*.006;
  color+=texture2D(uSky,skyUv).rgb*1.3;
  // Fixed celestial coordinates, with the flowing core ten degrees above the
  // world horizon. The sinusoidal azimuth wrap avoids a rear panorama seam.
  vec2 auraUv=vec2(.5+.5*sin(azimuth),clamp(.5+(elevation-.18),0.,1.));
  vec3 aura=texture2D(uCityAura,auraUv).rgb;
  color+=aura*.85*smoothstep(.005,.10,elevation)*(1.-smoothstep(.62,.82,elevation));
  float cloud=sin(skyUv.x*11.+uTime*.012)*sin(skyUv.y*16.+sin(skyUv.x*8.));
  color+=uPink*max(0.,cloud)*.025*smoothstep(.1,.6,elevation);
  vec2 cell=skyUv*vec2(580.,330.);float star=step(.998,hash(floor(cell)))*(1.-smoothstep(.01,.16,length(fract(cell)-.5)));
  color+=vec3(.25,.35,.5)*star*smoothstep(.1,.5,elevation);
  gl_FragColor=vec4(color,1.);
}`;
const trafficVertex=/* glsl */ `varying vec3 vLocal;varying float vDepth;
void main(){vLocal=position;vec4 view=modelViewMatrix*instanceMatrix*vec4(position,1.);vDepth=-view.z;gl_Position=projectionMatrix*view;}`;
const trafficFragment=/* glsl */ `
${shared}
varying vec3 vLocal;varying float vDepth;
void main(){
  float lights=step(.38,abs(vLocal.z))*step(.2,abs(vLocal.x));
  vec3 color=vec3(.008,.012,.02)+mix(uCyan,uPink,step(0.,vLocal.z))*lights*1.4;
  color+=uCyan*line(vLocal.y-.45,.04)*.25;
  gl_FragColor=vec4(fogged(color,vDepth),1.);
}`;

const atmosphereVertex=/* glsl */ `
uniform float uTime,uTravel;
varying vec2 vUv;varying vec3 vWorld;varying float vDepth;
void main(){vUv=uv;vec3 p=position;
#ifdef CITY_BEAM
  p.x+=(p.y+145.)*.25*sin(uTime*.1+instanceMatrix[3].x);
  p.z+=(p.y+145.)*.16*cos(uTime*.13+instanceMatrix[3].x);
#endif
vec4 world=modelMatrix*instanceMatrix*vec4(p,1.);
#ifdef CITY_ELEVATED_SMOKE
  // Gently undulating wisps, not flat sheets slicing through the towers.
  // Unwrapped coordinates keep the shape continuous when districts recycle.
  vec2 drift=vec2(world.x,uTravel-world.z)*.018+vec2(-uTime*.023,uTime*.009);
  float layer=instanceMatrix[3].y*.037;
  world.y+=sin(drift.x+sin(drift.y*.71)+layer)*12.
    +sin(drift.y*1.31-drift.x*.48+layer)*7.;
#endif
vWorld=world.xyz;
vec4 view=viewMatrix*world;vDepth=-view.z;gl_Position=projectionMatrix*view;}`;
const beamFragment=/* glsl */ `
${shared}
varying vec2 vUv;varying vec3 vWorld;varying float vDepth;
void main(){
  float ribbons=pow(.5+.5*sin(vUv.x*50.),12.);
  float alpha=(.018+ribbons*.035)*pow(1.-vUv.y,1.6)*smoothstep(0.,.06,vUv.y);
  alpha*=1.-smoothstep(uFar*.45,uFar,vDepth);
  vec3 tint=mix(uFog*3.,uPink,.2+.2*sin(vWorld.x*.015));
  gl_FragColor=vec4(tint*2.2,alpha*(1.+uPulse*.15));
}`;
const mistFragment=/* glsl */ `
${shared}
varying vec2 vUv;varying vec3 vWorld;varying float vDepth;
float softNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
void main(){
  #ifdef CITY_STREET_SMOKE
  // Sample unwrapped city coordinates so smoke stays over the same streets
  // through camera travel and district rebasing, with a separate crosswind.
  float s=uTravel-vWorld.z;
  vec2 p=vec2(vWorld.x,s)*.035+vec2(-uTime*.065,uTime*.021);
  p+=vec2(softNoise(p*.48+vWorld.y*.031),softNoise(p*.61-vWorld.y*.025))*.9;
  float n=softNoise(p+vWorld.y*.055)*.58+softNoise(p*2.13)*.29+softNoise(p*4.1)*.13;
  float x=abs(vWorld.x-cityX(s));
  float avenue=x<30.?1000.:abs(mod(x-30.,48.)-24.);
  float crossStreet=abs(mod(s+48.,96.)-48.);
  float street=1.-smoothstep(7.,17.,min(min(x*.7,avenue),crossStreet));
  float edge=smoothstep(0.,.12,vUv.x)*(1.-smoothstep(.88,1.,vUv.x))*smoothstep(0.,.12,vUv.y)*(1.-smoothstep(.88,1.,vUv.y));
  float heightFade=1.-smoothstep(${CITY_STREET_SMOKE_LEVEL - 6.5},${CITY_STREET_SMOKE_LEVEL + 11.5},vWorld.y);
  float alpha=smoothstep(.27,.73,n)*street*edge*heightFade*${CITY_STREET_SMOKE_OPACITY};
  alpha*=smoothstep(0.,22.,vDepth)*(1.-smoothstep(uFar*.55,uFar,vDepth));
  alpha*=.92+uAudio.w*.12;
  vec3 grey=vec3(.16,.175,.20)+uCyan*.035+uPink*.018;
  gl_FragColor=vec4(mix(grey,uFog,smoothstep(uFar*.25,uFar,vDepth)),alpha);
  #else
  vec2 p=vec2(vWorld.x,uTravel-vWorld.z)*.014+vec2(-uTime*.022,uTime*.008);
  p+=vec2(softNoise(p*.57+vWorld.y*.019),softNoise(p*.63-vWorld.y*.023))*1.8;
  float n=softNoise(p+vWorld.y*.027)*.57+softNoise(p*2.17)*.29+softNoise(p*4.3)*.14;
  float pockets=smoothstep(.32,.7,softNoise(p*.51-vWorld.y*.013));
  float edge=smoothstep(0.,.15,vUv.x)*(1.-smoothstep(.85,1.,vUv.x))*smoothstep(0.,.15,vUv.y)*(1.-smoothstep(.85,1.,vUv.y));
  // Fade before flying through a layer and suppress its edge-on silhouette.
  // This avoids a blue wall or a visible horizontal cut across nearby facades.
  vec3 toCamera=cameraPosition-vWorld;
  float grazing=smoothstep(.035,.24,abs(normalize(toCamera).y));
  float clearance=smoothstep(8.,38.,abs(toCamera.y));
  float alpha=smoothstep(.38,.8,n)*pockets*${CITY_HAZE_OPACITY}*edge*grazing*clearance;
  alpha*=smoothstep(18.,85.,vDepth)*(1.-smoothstep(uFar*.5,uFar,vDepth));
  vec3 grey=vec3(.08,.087,.10)+uCyan*.018+uPink*.008;
  gl_FragColor=vec4(grey,alpha);
  #endif
}`;

export class NeonCity {
  constructor(scene,camera,seed=313){
    this.camera=camera;this.seed=seed;this.motion=new NeonCityMotion();this.spectrum=new Uint8Array(256);
    this.meters=new CityMeters();
    this.meterTexture=new THREE.DataTexture(this.meters.data,CITY_METER_COUNT,1,THREE.RGBAFormat);
    this.meterTexture.minFilter=this.meterTexture.magFilter=THREE.NearestFilter;
    this.meterTexture.generateMipmaps=false;this.meterTexture.needsUpdate=true;
    this.aura=new CityAura();
    this.texture=new THREE.DataTexture(this.spectrum,256,1,THREE.RedFormat);
    this.texture.minFilter=this.texture.magFilter=THREE.LinearFilter;this.texture.generateMipmaps=false;this.texture.needsUpdate=true;
    this.uniforms={uTime:{value:0},uTravel:{value:0},uAudio:{value:this.motion.audio},uPulse:{value:0},uFar:{value:640},
      uCyan:{value:new THREE.Color()},uPink:{value:new THREE.Color()},uWarm:{value:new THREE.Color()},uFog:{value:new THREE.Color()},uCitySpectrum:{value:this.texture},uCityMeters:{value:this.meterTexture}};
    this.assets=new CityAssets();this.buildingBatches=[];this.advertBatches=[];
    const facades=['01','02','04','07','09','02','10','01'];
    const adverts=['ads_01','ads_02','ads_03','ads_04','ads_05','ads_03','ads_large_01','ads_large_03'];
    createCityModels().forEach(({building,advert},variant)=>{
      const count=MAX_ROWS*PER_VARIANT;
      const identities=new THREE.InstancedBufferAttribute(new Float32Array(count*2),2).setUsage(THREE.DynamicDrawUsage);
      building.setAttribute('aIdentity',identities);advert.setAttribute('aIdentity',identities);
      const material=new THREE.ShaderMaterial({uniforms:{...this.uniforms,
        uMeterBottom:{value:building.boundingBox.min.y},uMeterTop:{value:building.boundingBox.max.y},
        uFacade:this.assets.get(`building_${facades[variant]}`),uWindows:this.assets.get(`building_${facades[variant]}_em`)},
        vertexShader:buildingVertex,fragmentShader:buildingFragment});
      const signs=new THREE.ShaderMaterial({uniforms:{...this.uniforms,uAdvert:this.assets.get(adverts[variant]),
        uMeterBottom:{value:building.boundingBox.min.y},uMeterTop:{value:building.boundingBox.max.y}},
        vertexShader:buildingVertex,fragmentShader:advertFragment,side:THREE.DoubleSide});
      const mesh=new THREE.InstancedMesh(building,material,count),ad=new THREE.InstancedMesh(advert,signs,count);
      for(const batch of [mesh,ad]){batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);batch.frustumCulled=false;scene.add(batch);}
      this.buildingBatches.push(mesh);this.advertBatches.push(ad);
    });
    this.buildings=this.buildingBatches[0]; // First batch retained for diagnostics.
    this.beams=new THREE.InstancedMesh(new THREE.CylinderGeometry(7,.25,290,12,1,true),new THREE.ShaderMaterial({uniforms:this.uniforms,defines:{CITY_BEAM:1},
      vertexShader:atmosphereVertex,fragmentShader:beamFragment,transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending}),MAX_ROWS*2);
    this.beams.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.beams.frustumCulled=false;scene.add(this.beams);
    this.mist=new THREE.InstancedMesh(new THREE.PlaneGeometry(1400,1500,28,30),new THREE.ShaderMaterial({uniforms:this.uniforms,defines:{CITY_ELEVATED_SMOKE:1},
      vertexShader:atmosphereVertex,fragmentShader:mistFragment,transparent:true,depthTest:true,depthWrite:false,side:THREE.DoubleSide}),3);
    const fogMatrix=new THREE.Matrix4(),fogTurn=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2);
    for(let i=0;i<3;i++){fogMatrix.compose(new THREE.Vector3(0,65+i*75,-480),fogTurn,new THREE.Vector3(1,1,1));this.mist.setMatrixAt(i,fogMatrix);}
    this.mist.frustumCulled=false;scene.add(this.mist);
    // Low, depth-tested wisps separate from the existing elevated city haze.
    this.streetSmoke=new THREE.InstancedMesh(new THREE.PlaneGeometry(1400,1800),new THREE.ShaderMaterial({
      uniforms:this.uniforms,defines:{CITY_STREET_SMOKE:1},vertexShader:atmosphereVertex,fragmentShader:mistFragment,
      transparent:true,depthTest:true,depthWrite:false,side:THREE.DoubleSide}),CITY_STREET_SMOKE_HEIGHTS.length);
    // Lower layers first: the camera always flies above this shallow volume.
    CITY_STREET_SMOKE_HEIGHTS.forEach((height,i)=>{
      fogMatrix.compose(new THREE.Vector3(0,height,-600),fogTurn,new THREE.Vector3(1,1,1));
      this.streetSmoke.setMatrixAt(i,fogMatrix);
    });
    this.streetSmoke.frustumCulled=false;scene.add(this.streetSmoke);
    this.ground=new THREE.Mesh(new THREE.PlaneGeometry(1500,2600),new THREE.ShaderMaterial({uniforms:this.uniforms,vertexShader:groundVertex,fragmentShader:groundFragment}));
    this.ground.rotation.x=-Math.PI/2;this.ground.position.set(0,-.02,-900);scene.add(this.ground);
    const skyGeometry=new THREE.BufferGeometry();skyGeometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
    this.sky=new THREE.Mesh(skyGeometry,new THREE.ShaderMaterial({uniforms:{...this.uniforms,
      uSky:this.assets.get('sky_night'),uCityAura:{value:this.aura.target.texture},
      uSkyInverseProjection:{value:camera.projectionMatrixInverse},uSkyCameraWorld:{value:camera.matrixWorld}},
      vertexShader:skyVertex,fragmentShader:skyFragment,depthWrite:false,depthTest:false}));
    this.sky.frustumCulled=false;this.sky.renderOrder=-1000;scene.add(this.sky);
    this.traffic=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.ShaderMaterial({uniforms:this.uniforms,vertexShader:trafficVertex,fragmentShader:trafficFragment}),48);
    this.traffic.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.traffic.frustumCulled=false;scene.add(this.traffic);
    this.matrix=new THREE.Matrix4();this.rows=14;this.traffic.count=24;this.rowIds=Array(MAX_ROWS).fill(null);this.base=null;this.builds=0;
    this.position=new THREE.Vector3();this.scale=new THREE.Vector3();this.rotation=new THREE.Quaternion();this.buildingRotation=new THREE.Quaternion();this.up=new THREE.Vector3(0,1,0);this.look=new THREE.Vector3();
    this.flight=new THREE.Vector3();this.ahead=new THREE.Vector3();this.behind=new THREE.Vector3();this.forward=new THREE.Vector3();
    camera.near=.3;camera.far=2400;camera.fov=68;camera.updateProjectionMatrix();
    this.syncRows();this.update({},0,0,[]);
  }
  writeRow(slot,row){
    const buildings=createCityRow(row,this.seed),counts=Array(CITY_VARIANTS).fill(0);
    for(const b of buildings){
      const mesh=this.buildingBatches[b.variant],index=slot*PER_VARIANT+counts[b.variant]++;
      this.position.set(b.x,b.height/2,-(b.s-this.base*CITY_BLOCK));this.scale.set(b.turn%2?b.depth:b.width,b.height,b.turn%2?b.width:b.depth);
      this.buildingRotation.setFromAxisAngle(this.up,b.turn*Math.PI/2);
      this.matrix.compose(this.position,this.buildingRotation,this.scale);mesh.setMatrixAt(index,this.matrix);this.advertBatches[b.variant].setMatrixAt(index,this.matrix);
      mesh.geometry.attributes.aIdentity.setXY(index,b.seed,b.band);
    }
    for(let i=0;i<2;i++){
      const b=buildings[i?31:9];this.position.set(b.x,b.height+145,-(b.s-this.base*CITY_BLOCK));this.scale.set(1,1,1);
      this.matrix.compose(this.position,this.rotation,this.scale);this.beams.setMatrixAt(slot*2+i,this.matrix);
    }
    this.rowIds[slot]=row;this.builds++;
  }
  syncRows(){
    sampleCityFlight(this.motion.travel,this.flight);
    const base=Math.floor(this.flight.z/CITY_BLOCK);
    const rebased=this.base!==base;
    // Fixed modulo slots recycle behind the camera. Only one incoming row is
    // regenerated per crossing; existing rows are translated when rebasing.
    if(this.base!==base){
      const shift=this.base===null?0:(base-this.base)*CITY_BLOCK;
      if(shift)for(const mesh of [...this.buildingBatches,...this.advertBatches,this.beams])for(let i=0;i<mesh.instanceMatrix.count;i++)mesh.instanceMatrix.array[i*16+14]+=shift;
      this.base=base;
    }
    let changed=false;
    for(let offset=-2;offset<this.rows-2;offset++){
      const row=base+offset,slot=((row%this.rows)+this.rows)%this.rows;
      if(this.rowIds[slot]!==row){this.writeRow(slot,row);changed=true;}
    }
    // Matrices can change solely from origin rebasing as well as regeneration.
    for(const mesh of [...this.buildingBatches,...this.advertBatches]){
      if(changed||rebased)mesh.instanceMatrix.needsUpdate=true;
      if(changed)mesh.geometry.attributes.aIdentity.needsUpdate=true;
      mesh.count=this.rows*PER_VARIANT;mesh.position.z=this.flight.z-base*CITY_BLOCK;
    }
    if(changed||rebased)this.beams.instanceMatrix.needsUpdate=true;
    this.buildingCount=this.rows*BUILDINGS_PER_ROW;
    this.beams.count=this.rows*2;
    this.buildings.position.z=this.flight.z-base*CITY_BLOCK;
    this.beams.position.z=this.buildings.position.z;
  }
  resize(width,height,quality){
    this.aura.resize(width,height,quality);
    const settings=NEON_CITY_QUALITY[quality]||NEON_CITY_QUALITY.auto;
    if(this.rows!==settings.rows){this.rows=settings.rows;this.rowIds.fill(null);this.syncRows();}
    this.traffic.count=settings.traffic;this.uniforms.uFar.value=(this.rows-4)*CITY_BLOCK;
  }
  update(audio,delta,palette,spectrum=[]){
    const dt=this.motion.update(audio,delta),m=this.motion;
    this.aura.update(audio,dt,palette);
    if(dt){for(let i=0;i<256;i++)this.spectrum[i]=Number.isFinite(spectrum[i])?THREE.MathUtils.clamp(spectrum[i],0,255):0;this.texture.needsUpdate=true;}
    const rawFrequency=audio.frequency?.length>0;
    if(this.meters.update(rawFrequency?audio.frequency:this.spectrum,dt,rawFrequency))this.meterTexture.needsUpdate=true;
    this.uniforms.uTime.value=m.time;this.uniforms.uPulse.value=m.pulse;
    const colors=NEON_CITY_PALETTES[palette]||NEON_CITY_PALETTES[0];
    ['uCyan','uPink','uWarm','uFog'].forEach((key,i)=>this.uniforms[key].value.setHex(colors[i]));
    this.syncRows();
    this.uniforms.uTravel.value=this.flight.z;
    // Anticipate bends across a broad stretch of the route, rather than snapping
    // the view to the local tangent at each street corner. Distance-based
    // steering remains deterministic through pauses and frame-rate changes.
    sampleCityFlight(m.travel+48,this.ahead);sampleCityFlight(m.travel-48,this.behind);sampleCityFlight(m.travel+112,this.forward);
    this.camera.position.set(this.flight.x,this.flight.y,0);
    const aerial=THREE.MathUtils.smoothstep(this.flight.y,CITY_FLIGHT.streetHeight,CITY_FLIGHT.startHeight);
    const pitch=THREE.MathUtils.lerp(Math.atan(1/12),THREE.MathUtils.degToRad(55),aerial);
    const lookX=this.forward.x-this.behind.x,lookZ=this.forward.z-this.behind.z;
    const lookDistance=Math.hypot(lookX,lookZ);
    const cruise=THREE.MathUtils.smootherstep(m.travel,CITY_FLIGHT.approachLength,CITY_FLIGHT.approachLength+120);
    const slope=(this.ahead.y-this.flight.y)/48;
    const verticalLook=slope*lookDistance*.35*cruise;
    this.look.set(this.flight.x+lookX,this.flight.y-Math.tan(pitch)*lookDistance+verticalLook,-lookZ);
    this.camera.lookAt(this.look);
    const headingBefore=Math.atan2(this.flight.x-this.behind.x,this.flight.z-this.behind.z);
    const headingAfter=Math.atan2(this.forward.x-this.flight.x,this.forward.z-this.flight.z);
    this.camera.rotateZ(THREE.MathUtils.clamp((headingAfter-headingBefore)*-.035,-.035,.035));
    for(let i=0;i<48;i++){
      const z=70-((i*43.37+m.time*(i%2?17:31))%1400);
      const lane=(i%2?1:-1)*(5+(i%3)*2.5);
      this.position.set(cityCenter(this.flight.z-z)+lane,25+(i%4)*28+Math.sin(m.time*.3+i)*.3,z);this.scale.set(1.8,.65,5.8);
      this.matrix.compose(this.position,this.rotation,this.scale);this.traffic.setMatrixAt(i,this.matrix);
    }
    this.traffic.instanceMatrix.needsUpdate=true;
  }
  dispose(){this.texture.dispose();this.meterTexture.dispose();this.assets.dispose();this.aura.dispose();}
  // Shared owner releases instanced buffers, geometry, materials and target.
}
