import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import lowA from './assets/synthcity/s_01_01.obj?raw';
import lowB from './assets/synthcity/s_01_03.obj?raw';
import midA from './assets/synthcity/s_02_01.obj?raw';
import midB from './assets/synthcity/s_02_03.obj?raw';
import high from './assets/synthcity/s_03_01.obj?raw';
import tower from './assets/synthcity/s_05_01.obj?raw';
import block from './assets/synthcity/s_04_02.obj?raw';
import roundTower from './assets/synthcity/s_05_02.obj?raw';
import adA from './assets/synthcity/ads_s_01_01.obj?raw';
import adB from './assets/synthcity/ads_s_01_02.obj?raw';
import adC from './assets/synthcity/ads_s_02_01.obj?raw';
import adD from './assets/synthcity/ads_s_02_02.obj?raw';
import adE from './assets/synthcity/ads_s_03_01.obj?raw';
import adF from './assets/synthcity/ads_s_05_01.obj?raw';
import adG from './assets/synthcity/ads_s_04_02.obj?raw';
import adH from './assets/synthcity/ads_s_05_02.obj?raw';

// Bundled original Synthcity city art, MIT (c) 2024 Jeff Beene. No cockpit,
// third-party car model, audio, runtime CDN or upstream application code.
const models=[lowA,lowB,midA,midB,high,block,tower,roundTower],adverts=[adA,adB,adC,adD,adE,adG,adF,adH];
const urls=import.meta.glob('./assets/synthcity/*.jpg',{eager:true,query:'?url',import:'default'});
export const CITY_VARIANTS=8;
function parseGeometry(text){
  const root=new OBJLoader().parse(text),parts=[];
  root.traverse(object=>{if(object.isMesh){parts.push(object.geometry);for(const material of [object.material].flat())material.dispose();}});
  if(parts.length===1)return parts[0];
  const geometry=mergeGeometries(parts);parts.forEach(part=>part.dispose());return geometry;
}
export function createCityModels(){
  return models.map((text,index)=>{
    const building=parseGeometry(text),advert=parseGeometry(adverts[index]);
    building.computeBoundingBox();advert.computeBoundingBox();
    // Include projecting signs in the footprint used by the collision-free route.
    const bounds=building.boundingBox.clone().union(advert.boundingBox),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
    const transform=new THREE.Matrix4().makeScale(1/size.x,1/size.y,1/size.z)
      .multiply(new THREE.Matrix4().makeTranslation(-center.x,-center.y,-center.z));
    for(const geometry of [building,advert]){geometry.applyMatrix4(transform);geometry.computeBoundingBox();geometry.clearGroups();}
    // Synthcity stores its full-height light rails in the advert meshes.
    // Tag narrow vertical triangles, leaving broad billboard artwork untouched.
    for(const geometry of [building,advert]){
      const p=geometry.attributes.position,flags=new Float32Array(p.count);
      if(geometry===advert)for(let i=0;i<p.count;i+=3){
        const xs=[p.getX(i),p.getX(i+1),p.getX(i+2)],ys=[p.getY(i),p.getY(i+1),p.getY(i+2)],zs=[p.getZ(i),p.getZ(i+1),p.getZ(i+2)];
        const height=Math.max(...ys)-Math.min(...ys),width=Math.hypot(Math.max(...xs)-Math.min(...xs),Math.max(...zs)-Math.min(...zs));
        if(height>.45&&width<.09)flags.fill(1,i,i+3);
      }
      geometry.setAttribute('aMeterStrip',new THREE.BufferAttribute(flags,1));
    }
    return {building,advert};
  });
}
export class CityAssets {
  constructor(loader=typeof document==='undefined'?null:new THREE.TextureLoader()){
    this.loader=loader;this.disposed=false;this.dirty=false;this.failures=[];this.textures=new Set();this.uniforms=new Map();
    this.fallback=new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1);this.fallback.needsUpdate=true;this.textures.add(this.fallback);
  }
  get(name){
    if(this.uniforms.has(name))return this.uniforms.get(name);
    const uniform={value:this.fallback};this.uniforms.set(name,uniform);
    if(this.loader){
      const texture=this.loader.load(urls[`./assets/synthcity/${name}.jpg`],loaded=>{
        if(this.disposed)return;
        uniform.value=loaded;this.dirty=true;
      },undefined,()=>{if(!this.disposed)this.failures.push(name);});
      texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=4;this.textures.add(texture);
    }
    return uniform;
  }
  dispose(){if(this.disposed)return;this.disposed=true;this.textures.forEach(texture=>texture.dispose());}
}
