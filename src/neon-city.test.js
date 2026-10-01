import { describe,it,expect,vi } from "vitest";
import * as THREE from "three";
import { NeonCityMotion,createCityRow,cityCenter,sampleCityFlight,CITY_FLIGHT,CITY_ROUTE_LENGTH,CITY_BLOCK,NEON_CITY_MODE,NEON_CITY_QUALITY,NEON_CITY_PALETTES,CITY_BUILDINGS_PER_ROW } from "./neon-city.js";
import { CITY_VARIANTS } from './city-assets.js';
import { CITY_STREET_SMOKE_HEIGHTS, CITY_STREET_SMOKE_LEVEL, CITY_STREET_SMOKE_OPACITY, CITY_HAZE_OPACITY } from './neon-city.js';
import { ProceduralScenes,isProceduralMode } from "./procedural-scenes.js";
import { hasSmoke } from "./smoke-simulation.js";
const beat={bass:.8,mid:.5,high:.4,level:.7,transient:true,beatCount:1};
const setup=()=>{
  const renderer={target:{},getRenderTarget(){return this.target;},setRenderTarget(t){this.target=t;},render:vi.fn()};
  const worlds=new ProceduralScenes(renderer,null,42);return {renderer,worlds};
};
describe("Neon City",()=>{
  it('softens elevated haze into faint undulating wisps without camera-crossing barriers',()=>{
    const {worlds}=setup();worlds.render(25,beat,.05,0,[],false);
    const city=worlds.entries.get(25).neonCity,mist=city.mist;
    expect(mist.count).toBe(3);expect(CITY_HAZE_OPACITY).toBe(.07);
    expect(mist.material.defines.CITY_ELEVATED_SMOKE).toBe(1);
    expect(mist.geometry.parameters.widthSegments).toBe(28);
    expect(mist.geometry.parameters.heightSegments).toBe(30);
    expect(mist.material.depthTest).toBe(true);expect(mist.material.depthWrite).toBe(false);
    expect(mist.material.vertexShader).toContain('uTravel-world.z');
    expect(mist.material.vertexShader).toContain('world.y+=sin');
    expect(mist.material.fragmentShader).toContain('pockets*0.07*edge*grazing*clearance');
    expect(mist.material.fragmentShader).toContain('smoothstep(8.,38.,abs(toCamera.y))');
    expect(mist.material.fragmentShader).not.toContain('uFog*1.5');
    expect(city.streetSmoke.material.defines.CITY_ELEVATED_SMOKE).toBeUndefined();
    const matrices=mist.instanceMatrix.array.slice(),clock=city.uniforms.uTime.value;
    for(const travel of [95.99,96.01,384,1600]){city.motion.travel=travel;city.update(beat,0,0,[]);}
    expect(mist.instanceMatrix.array).toEqual(matrices);expect(city.uniforms.uTime.value).toBe(clock);
    expect(mist.material.uniforms.uTime).toBe(city.uniforms.uTime);
    city.update(beat,.05,0,[]);expect(city.uniforms.uTime.value).toBeGreaterThan(clock);
    worlds.dispose();
  });
  it('keeps drifting smoke just above the streets, depth-tested and stable through rebasing and pause',()=>{
    const {worlds}=setup();worlds.render(25,beat,.05,0,[],false);
    const city=worlds.entries.get(25).neonCity,smoke=city.streetSmoke;
    expect(smoke.count).toBe(7);expect(smoke.material.depthTest).toBe(true);expect(smoke.material.depthWrite).toBe(false);
    expect(smoke.material.defines.CITY_STREET_SMOKE).toBe(1);
    expect(smoke.material.uniforms.uTime).toBe(city.uniforms.uTime);
    const matrix=new THREE.Matrix4();
    expect(CITY_STREET_SMOKE_LEVEL).toBe(50);
    expect(CITY_STREET_SMOKE_OPACITY).toBe(.095);
    expect(smoke.material.fragmentShader).toContain('heightFade*0.095');
    expect(CITY_STREET_SMOKE_HEIGHTS[3]).toBe(50);
    expect(smoke.material.fragmentShader).toContain('smoothstep(43.5,61.5,vWorld.y)');
    CITY_STREET_SMOKE_HEIGHTS.forEach((height,i)=>{
      smoke.getMatrixAt(i,matrix);expect(matrix.elements[13]).toBe(height);
      expect(height).toBeGreaterThanOrEqual(42.5);expect(height).toBeLessThanOrEqual(57.5);
    });
    const before=smoke.instanceMatrix.array.slice(),time=city.uniforms.uTime.value;
    for(const travel of [95.99,96.01,384,1600]){city.motion.travel=travel;city.update(beat,0,0,[]);}
    expect(smoke.instanceMatrix.array).toEqual(before);expect(city.uniforms.uTime.value).toBe(time);
    expect(smoke.material.fragmentShader).toContain('float s=uTravel-vWorld.z');
    expect(smoke.material.fragmentShader).toContain('float street=1.-smoothstep');
    city.update(beat,.05,0,[]);expect(city.uniforms.uTime.value).toBeGreaterThan(time);
    worlds.dispose();
  });
  it("drives the original sign-mesh rails from current audio rather than stale visual spectrum",()=>{
    const {worlds}=setup(),frequency=new Uint8Array(1024).fill(210),stale=new Uint8Array(256);
    for(let i=0;i<6;i++)worlds.render(25,{frequency},1/60,0,stale,false);
    const city=worlds.entries.get(25).neonCity;
    expect(city.meters.levels[12]).toBeGreaterThan(.8);
    const material=city.advertBatches[6].material;
    expect(material.uniforms.uCityMeters.value).toBe(city.meterTexture);
    expect(material.fragmentShader).toContain('step(.5,vMeterStrip)');
    expect(material.uniforms.uMeterTop.value).toBeGreaterThan(material.uniforms.uMeterBottom.value);
    frequency.fill(0);stale.fill(255);
    for(let i=0;i<30;i++)worlds.render(25,{frequency},1/60,0,stale,false);
    expect(city.meters.levels[12]).toBeLessThan(.02);
    worlds.dispose();
  });
  it("generates deterministic varied blocks without buildings intruding into the flight corridor",()=>{
    expect(createCityRow(8,313)).toEqual(createCityRow(8,313));
    expect(createCityRow(8,314)).not.toEqual(createCityRow(8,313));
    expect(createCityRow(9,313)).not.toEqual(createCityRow(8,313));
    for(const row of [-100,-1,0,1,100,100000]){
      const buildings=createCityRow(row);expect(buildings).toHaveLength(48);
      for(const b of buildings){
        expect(Object.values(b).every(v=>typeof v==='boolean'||Number.isFinite(v))).toBe(true);
        expect(Math.abs(b.x-cityCenter(b.s))-b.width*1.12/2).toBeGreaterThan(10);
        expect(b.height).toBeGreaterThanOrEqual(28);expect(b.height).toBeLessThan(365);
        expect(b.s-row*CITY_BLOCK).toBeGreaterThan(0);expect(b.s-row*CITY_BLOCK).toBeLessThan(CITY_BLOCK);
      }
    }
  });
  it("descends smoothly then follows both side streets without entering tower footprints",()=>{
    expect(sampleCityFlight(0).y).toBe(280);expect(sampleCityFlight(CITY_FLIGHT.descentStart).y).toBe(280);
    expect(sampleCityFlight(CITY_FLIGHT.descentEnd).y).toBe(100);
    let previous=sampleCityFlight(0),minOffset=0,maxOffset=0;
    const rows=new Map();
    for(let distance=1;distance<CITY_FLIGHT.approachLength+CITY_ROUTE_LENGTH*3;distance++){
      const point=sampleCityFlight(distance),offset=point.x-cityCenter(point.z);
      minOffset=Math.min(minOffset,offset);maxOffset=Math.max(maxOffset,offset);
      if(distance<=CITY_FLIGHT.approachLength)expect(point.y).toBeLessThanOrEqual(previous.y);
      else expect(point.y).toBeLessThanOrEqual(CITY_FLIGHT.cruiseCeiling);
      expect(point.y).toBeGreaterThanOrEqual(100);
      expect(point.z).toBeGreaterThanOrEqual(previous.z-1e-8);
      expect(Math.hypot(point.x-previous.x,point.z-previous.z)).toBeLessThan(1.1);
      const row=Math.floor(point.z/CITY_BLOCK);
      if(!rows.has(row))rows.set(row,[-1,0,1].flatMap(offset=>createCityRow(row+offset)));
      for(const b of rows.get(row)){
        // Conservatively test the largest podium footprint at every altitude.
        const dx=Math.max(0,Math.abs(point.x-b.x)-b.width*1.12/2);
        const dz=Math.max(0,Math.abs(point.z-b.s)-b.depth*1.12/2);
        expect(Math.hypot(dx,dz)).toBeGreaterThan(2);
      }
      previous=point;
    }
    expect(minOffset).toBeCloseTo(-54);expect(maxOffset).toBeCloseTo(54);
    for(const distance of [CITY_FLIGHT.descentStart,CITY_FLIGHT.descentEnd,CITY_FLIGHT.approachLength,CITY_FLIGHT.approachLength+CITY_ROUTE_LENGTH,CITY_FLIGHT.approachLength+CITY_ROUTE_LENGTH*2]){
      const before=sampleCityFlight(distance-.001),point=sampleCityFlight(distance),after=sampleCityFlight(distance+.001);
      expect(before.distanceTo(after)).toBeLessThan(.003);
      expect(point.clone().sub(before).normalize().dot(after.clone().sub(point).normalize())).toBeGreaterThan(.99999);
    }
  });
  it("steers gently through corners and circuit seams without sudden camera swings",()=>{
    const {worlds}=setup();worlds.render(25,{},0,0,[],false);
    const {camera,neonCity:effect}=worlds.entries.get(25);
    const previous=camera.quaternion.clone();let maxTurnRate=0,maxTurnAt=0;
    // Half-unit samples at the maximum 32 units/sec travel speed.
    for(let distance=.5;distance<CITY_FLIGHT.approachLength+CITY_ROUTE_LENGTH*2;distance+=.5){
      effect.motion.travel=distance;effect.update({},0,0,[]);
      const rate=THREE.MathUtils.radToDeg(previous.angleTo(camera.quaternion))*64;
      if(rate>maxTurnRate){maxTurnRate=rate;maxTurnAt=distance;}
      previous.copy(camera.quaternion);
    }
    expect(maxTurnRate,`Maximum turn at route distance ${maxTurnAt}`).toBeLessThan(25);
    const frozen=camera.quaternion.clone();effect.update({},0,0,[]);
    expect(camera.quaternion.angleTo(frozen)).toBeLessThan(1e-7);
    worlds.dispose();
  });
  it("varies cruising altitude in broad continuous climbs and dips without resetting at circuit seams",()=>{
    let low=Infinity,high=-Infinity,climbs=0,descents=0;
    let previous=sampleCityFlight(CITY_FLIGHT.approachLength);
    for(let distance=CITY_FLIGHT.approachLength+1;distance<10000;distance++){
      const point=sampleCityFlight(distance),step=point.y-previous.y;
      low=Math.min(low,point.y);high=Math.max(high,point.y);
      if(step>.01)climbs++;if(step<-.01)descents++;
      expect(Math.abs(step)).toBeLessThan(.8);
      expect(point.y).toBeGreaterThanOrEqual(100);expect(point.y).toBeLessThanOrEqual(CITY_FLIGHT.cruiseCeiling);
      previous=point;
    }
    expect(high-low).toBeGreaterThan(95);expect(climbs).toBeGreaterThan(2000);expect(descents).toBeGreaterThan(2000);
    const heights=[30,60,120].map(fps=>{const motion=new NeonCityMotion();for(let i=0;i<fps*45;i++)motion.update(beat,1/fps);return sampleCityFlight(motion.travel).y;});
    heights.forEach(height=>expect(height).toBeCloseTo(heights[0],6));
  });
  it("establishes a half-height downward aerial view before leveling out over the street",()=>{
    const {worlds}=setup();worlds.render(25,{},0,0,[],false);
    const {camera,neonCity:effect}=worlds.entries.get(25),direction=new THREE.Vector3();
    expect(camera.position.y).toBe(280);
    camera.getWorldDirection(direction);expect(direction.y).toBeCloseTo(-Math.sin(55*Math.PI/180),5);
    for(const distance of [48,120,240,360,384]){
      effect.motion.travel=distance;effect.update({},0,0,[]);
      expect(effect.flight.x).toBeCloseTo(cityCenter(distance));expect(effect.flight.z).toBe(distance);
    }
    expect(camera.position.y).toBe(100);camera.getWorldDirection(direction);
    expect(direction.y).toBeCloseTo(-Math.sin(Math.atan(1/12)),5);
    worlds.dispose();
  });
  it("integrates smooth travel across frame rates, deduplicates beats and sanitizes stalls",()=>{
    const states=[30,60,120].map(fps=>{const m=new NeonCityMotion();for(let i=0;i<fps;i++)m.update(beat,1/fps);return m;});
    states.forEach(m=>{expect(m.travel).toBeCloseTo(states[0].travel,10);expect(m.pulse).toBeCloseTo(states[0].pulse,10);expect(m.emissions).toBe(1);});
    const m=new NeonCityMotion();m.update(beat,.05);const frozen=JSON.stringify(m);
    for(const dt of [0,-1,NaN,Infinity])m.update({...beat,beatCount:2},dt);expect(JSON.stringify(m)).toBe(frozen);
    const distance=m.travel;m.update({bass:Infinity,mid:NaN,high:20,level:-1},100);
    expect(m.travel-distance).toBeLessThan(1.6);expect(m.audio.toArray().every(v=>Number.isFinite(v)&&v>=0&&v<=1)).toBe(true);
  });
  it("streams one row at a crossing without moving retained buildings or growing GPU allocations",()=>{
    const {worlds}=setup();worlds.render(25,{},.05,0,[],false);
    const effect=worlds.entries.get(25).neonCity,geometry=effect.buildings.geometry;
    effect.motion.travel=CITY_BLOCK-.01;effect.update({},0,0,[]);
    const matrix=new THREE.Matrix4();effect.buildings.getMatrixAt(0,matrix);
    const before=matrix.elements[14]+effect.buildings.position.z,builds=effect.builds;
    effect.motion.travel=CITY_BLOCK+.01;effect.update({},0,0,[]);effect.buildings.getMatrixAt(0,matrix);
    expect(matrix.elements[14]+effect.buildings.position.z-before).toBeCloseTo(.02,5);
    expect(effect.builds-builds).toBe(1);
    const version=effect.buildings.instanceMatrix.version;effect.motion.travel+=1;effect.update({},0,0,[]);
    expect(effect.buildings.instanceMatrix.version).toBe(version);
    for(let row=2;row<150;row++){effect.motion.travel=row*CITY_BLOCK+.1;effect.update({},0,0,[]);}
    expect(effect.buildings.geometry).toBe(geometry);
    expect(effect.buildingBatches.reduce((n,b)=>n+b.instanceMatrix.count,0)).toBe(22*CITY_BUILDINGS_PER_ROW);
    expect(effect.buildingBatches).toHaveLength(CITY_VARIANTS);expect(effect.advertBatches).toHaveLength(CITY_VARIANTS);
    expect(effect.beams.count).toBe(effect.rows*2);
    expect(effect.beams.position.z).toBe(effect.buildings.position.z);
    expect(effect.rowIds.filter(v=>v!==null)).toHaveLength(14);
    expect([...effect.buildings.instanceMatrix.array].every(Number.isFinite)).toBe(true);
    worlds.dispose();
  });
  it("keeps private FFT and motion frozen through quality changes, blends and hidden scenes",()=>{
    const {worlds,renderer}=setup(),caller=renderer.target,spectrum=new Uint8Array(256).fill(150);
    expect(isProceduralMode(NEON_CITY_MODE)).toBe(true);expect(hasSmoke(NEON_CITY_MODE)).toBe(false);
    expect(worlds.entries.size).toBe(0);worlds.resize(1920,1080,'auto');worlds.render(25,beat,.05,0,spectrum,false);
    const entry=worlds.entries.get(25),effect=entry.neonCity,geometry=effect.buildings.geometry,material=effect.buildings.material;
    effect.motion.travel=950;effect.update({},0,0,[]);
    const frozen=JSON.stringify(effect.motion),position=entry.camera.position.clone(),traffic=effect.traffic.instanceMatrix.array.slice();
    const frozenMeters=effect.meters.data.slice(),meterTexture=effect.meterTexture;
    for(const [quality,settings] of Object.entries(NEON_CITY_QUALITY)){
      worlds.resize(800,1200,quality);worlds.render(25,{...beat,beatCount:2},.05,2,spectrum.fill(255),true);
      expect(effect.buildings.geometry).toBe(geometry);expect(effect.buildings.material).toBe(material);
      expect(effect.buildingCount).toBe(settings.rows*CITY_BUILDINGS_PER_ROW);expect(effect.traffic.count).toBe(settings.traffic);
      expect(effect.buildingBatches.reduce((n,b)=>n+b.count,0)).toBe(effect.buildingCount);
      expect(JSON.stringify(effect.motion)).toBe(frozen);expect(effect.spectrum[0]).toBe(150);
      expect(effect.meters.data).toEqual(frozenMeters);expect(effect.meterTexture).toBe(meterTexture);
      expect(entry.camera.position.equals(position)).toBe(true);expect(effect.traffic.instanceMatrix.array).toEqual(traffic);
    }
    NEON_CITY_PALETTES.forEach((colors,i)=>{effect.update({},0,i,[]);expect(effect.uniforms.uCyan.value.getHex()).toBe(colors[0]);});
    // Flush the palette change before isolating an asset-only paused redraw.
    entry.rendered=false;worlds.render(25,beat,.05,0,spectrum,true);
    const beforeLoad=JSON.stringify(effect.motion),draws=renderer.render.mock.calls.length;
    effect.assets.dirty=true;worlds.render(25,beat,.05,0,spectrum,true);
    expect(renderer.render.mock.calls.length).toBe(draws+1);expect(JSON.stringify(effect.motion)).toBe(beforeLoad);
    expect(effect.assets.dirty).toBe(false);
    worlds.render(17,beat,.05,0,[],false);expect(JSON.stringify(effect.motion)).toBe(frozen);
    worlds.render(25,beat,.05,0,spectrum,false);expect(JSON.stringify(effect.motion)).not.toBe(frozen);
    expect(effect.spectrum[0]).toBe(255);expect(renderer.target).toBe(caller);
    renderer.render.mockImplementation(()=>{throw Error('draw failed');});
    expect(()=>worlds.render(25,{},.05,0,[],false)).toThrow('draw failed');expect(renderer.target).toBe(caller);
    expect(entry.camera.position.y).toBeGreaterThanOrEqual(100);expect(entry.camera.position.y).toBeLessThanOrEqual(CITY_FLIGHT.startHeight);
    expect(effect.mist.count).toBe(3);expect(effect.beams.material.depthWrite).toBe(false);
    const resources=[entry.target,effect.texture,effect.meterTexture,...effect.assets.textures,...[...effect.buildingBatches,...effect.advertBatches,effect.ground,effect.sky,effect.traffic,effect.beams,effect.mist,effect.streetSmoke].flatMap(o=>[o.geometry,o.material])];
    const spies=resources.map(o=>vi.spyOn(o,'dispose'));worlds.dispose();spies.forEach(spy=>expect(spy).toHaveBeenCalledOnce());
  });
});
