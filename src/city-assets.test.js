import { describe,it,expect,vi } from 'vitest';
import * as THREE from 'three';
import { CityAssets,createCityModels,CITY_VARIANTS } from './city-assets.js';
import { createCityRow } from './neon-city.js';

describe('bundled Synthcity art',()=>{
  it('tags the tall light rails in advert geometry, not billboard faces or buildings',()=>{
    const models=createCityModels();
    expect([...models[6].advert.attributes.aMeterStrip.array].some(v=>v===1)).toBe(true);
    // The round tower has broad diamond signs, not vertical rails.
    expect([...models[7].advert.attributes.aMeterStrip.array].every(v=>v===0)).toBe(true);
    expect([...models[0].advert.attributes.aMeterStrip.array].every(v=>v===0)).toBe(true);
    for(const {building,advert} of models){
      expect([...building.attributes.aMeterStrip.array].every(v=>v===0)).toBe(true);
      const flags=advert.attributes.aMeterStrip;
      for(let i=0;i<flags.count;i+=3){expect(flags.getX(i)).toBe(flags.getX(i+1));expect(flags.getX(i)).toBe(flags.getX(i+2));}
      building.dispose();advert.dispose();
    }
  });
  it('normalizes all building/sign pairs into bounded footprints while preserving UVs',()=>{
    const models=createCityModels();expect(models).toHaveLength(CITY_VARIANTS);
    for(const pair of models)for(const geometry of Object.values(pair)){
      expect(geometry.attributes.position.count).toBeGreaterThan(0);
      expect(geometry.attributes.uv.count).toBe(geometry.attributes.position.count);
      expect(geometry.attributes.normal.count).toBe(geometry.attributes.position.count);
      for(const coordinate of [...geometry.boundingBox.min.toArray(),...geometry.boundingBox.max.toArray()]){
        expect(coordinate).toBeGreaterThanOrEqual(-.50001);expect(coordinate).toBeLessThanOrEqual(.50001);
      }
      geometry.dispose();
    }
    for(const row of [-50,-1,0,1,100]){
      const buildings=createCityRow(row);
      for(let variant=0;variant<CITY_VARIANTS;variant++)expect(buildings.filter(b=>b.variant===variant)).toHaveLength(48/CITY_VARIANTS);
      expect(buildings.filter(b=>b.height<110).length).toBeGreaterThanOrEqual(24);
    }
  });
  it('loads textures once, invalidates the paused image and disposes pending assets safely',()=>{
    const pending=[];
    const loader={load:vi.fn((url,onLoad,progress,onError)=>{const texture=new THREE.Texture();pending.push({url,onLoad,onError,texture});return texture;})};
    const assets=new CityAssets(loader),facade=assets.get('building_01');
    expect(assets.get('building_01')).toBe(facade);expect(loader.load).toHaveBeenCalledOnce();
    expect(pending[0].url).toMatch(/building_01/);expect(facade.value).toBe(assets.fallback);
    pending[0].onLoad(pending[0].texture);expect(facade.value).toBe(pending[0].texture);expect(assets.dirty).toBe(true);
    assets.get('ads_01');pending[1].onError();expect(assets.failures).toEqual(['ads_01']);
    const late=assets.get('sky_night'),spies=[...assets.textures].map(t=>vi.spyOn(t,'dispose'));
    assets.dispose();assets.dispose();pending[2].onLoad(pending[2].texture);
    expect(late.value).toBe(assets.fallback);spies.forEach(spy=>expect(spy).toHaveBeenCalledOnce());
  });
});
