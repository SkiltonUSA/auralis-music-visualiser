import { describe, expect, it } from "vitest";
import { SceneRotation, SceneDwell, SceneDurations, sceneCutReady, loadSceneDurations, DURATION_STORAGE_KEY } from "./scene-rotation.js";
import { scenes } from "./scenes.js";

const modes = scenes.map(scene => scene.renderMode);
describe('per-scene durations', () => {
  it('preserves defaults and restores valid settings by stable renderer ID', () => {
    const durations = new SceneDurations(scenes);
    expect(durations.get(25)).toBe(30);expect(durations.get(8)).toBe(20);expect(durations.get(0)).toBe(5);
    durations.set(25, 15);durations.set(8, 0);durations.set(0, 90);
    const restored = new SceneDurations([...scenes].reverse(), JSON.parse(JSON.stringify(durations.overrides)));
    expect(restored.get(25)).toBe(15);expect(restored.get(8)).toBe(0);expect(restored.get(0)).toBe(90);
    restored.reset();expect(restored.get(25)).toBe(30);expect(restored.get(8)).toBe(20);expect(restored.get(0)).toBe(5);
    expect(scenes.filter(scene=>![8,25].includes(scene.renderMode)).every(scene=>restored.get(scene.renderMode)===5)).toBe(true);
  });
  it('migrates old zero timers to five once while preserving custom times and future beat-mode choices', () => {
    const data=new Map([['auralis.scene-durations.v1',JSON.stringify({0:0,8:40,25:60,4:90})]]);
    const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
    expect(loadSceneDurations(storage)).toEqual({0:5,8:20,25:30,4:90});
    expect(JSON.parse(data.get(DURATION_STORAGE_KEY))).toEqual({0:5,8:20,25:30,4:90});
    storage.setItem(DURATION_STORAGE_KEY,JSON.stringify({0:0}));
    expect(new SceneDurations(scenes,loadSceneDurations(storage)).get(0)).toBe(0);
    expect(loadSceneDurations({getItem:()=>{throw Error('blocked');}})).toEqual({});
    expect(loadSceneDurations({getItem:()=>'{bad json'})).toEqual({});
    expect(loadSceneDurations({getItem:key=>key==='auralis.scene-durations.v1'?'{"0":0,"4":90}':null,setItem:()=>{throw Error('quota');}})).toEqual({0:5,4:90});
  });
  it('updates old city and horizon defaults without changing custom durations or explicit beat mode', () => {
    const data=new Map([['auralis.scene-durations.v2',JSON.stringify({0:0,8:40,25:60,4:90})]]);
    const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
    expect(loadSceneDurations(storage)).toEqual({0:0,8:20,25:30,4:90});
    data.delete(DURATION_STORAGE_KEY);
    data.set('auralis.scene-durations.v2',JSON.stringify({8:45,25:75}));
    expect(loadSceneDurations(storage)).toEqual({8:45,25:75});
  });
  it('rejects malformed, out-of-range, fractional and retired scene settings', () => {
    for (const saved of [null, [], 'bad', 42, {25: -1, 8: '20', 3: 25}]) {
      const durations = new SceneDurations(scenes, saved);
      expect(durations.get(25)).toBe(30);expect(durations.get(8)).toBe(20);expect(durations.overrides).toEqual({});
    }
    const durations = new SceneDurations(scenes);
    for (const value of [-1, 1, 4, 601, 4.5, NaN, Infinity, '', '30', null]) expect(durations.set(25,value)).toBe(false);
    expect(durations.set(3,30)).toBe(false);
    for (const value of [0,5,600]) expect(durations.set(25,value)).toBe(true);
    durations.set(25,30);expect(durations.overrides).toEqual({});
  });
  it('switches timed scenes without beats, but waits for 16 distinct beats in zero mode', () => {
    for (const fps of [30,60,120]) {
      const dwell = new SceneDwell();dwell.reset(5);
      for(let i=0;i<fps*5-1;i++) dwell.update(1/fps);
      expect(sceneCutReady(5,dwell,100,true)).toBe(false);
      dwell.update(1/fps);expect(sceneCutReady(5,dwell,0,false)).toBe(true);
      expect(sceneCutReady(0,dwell,15,true)).toBe(false);
      expect(sceneCutReady(0,dwell,16,false)).toBe(false);
      expect(sceneCutReady(0,dwell,16,true)).toBe(true);
    }
  });
});
describe("extended scene dwell", () => {
  it.each([[8,20],[25,30]])("holds renderer %i for %i active seconds without changing other scenes", (mode,seconds) => {
    const scene = scenes.find(scene => scene.renderMode === mode);
    expect(scene.minimumDuration).toBe(seconds);
    expect(scenes.filter(scene => ![8,25].includes(scene.renderMode)).every(scene => !scene.minimumDuration)).toBe(true);
    for (const fps of [30, 60, 120]) {
      const dwell = new SceneDwell();dwell.reset(scene.minimumDuration);
      for (let i = 0; i < (seconds-20) * fps; i++) dwell.update(1 / fps);
      expect(dwell.ready).toBe(false);expect(dwell.remaining).toBeCloseTo(20);
      for (let i = 0; i < 20 * fps - 1; i++) dwell.update(1 / fps);
      expect(dwell.ready).toBe(false);
      dwell.update(1 / fps);expect(dwell.ready).toBe(true);
    }
  });
  it("excludes pauses, incoming blends and hidden time, and resets on scene entry", () => {
    const dwell = new SceneDwell();dwell.reset(60);dwell.update(.05);
    for (const delta of [0, -1, NaN, Infinity]) dwell.update(delta);
    for (let i = 0; i < 2000; i++) dwell.update(.05, false);
    expect(dwell.elapsed).toBe(.05);
    dwell.update(300);expect(dwell.elapsed).toBe(.1);
    dwell.reset(60);expect(dwell.remaining).toBe(60);
    dwell.reset();expect(dwell.ready).toBe(true);
  });
});
describe("Auto Director rotation selection", () => {
  it("ignores retired saved IDs and never rotates into removed scenes",()=>{
    const retired=[3,14,15,16,23],rotation=new SceneRotation(modes,[...retired,8,25]);
    expect(rotation.disabledModes).toEqual([25,8]);
    let index=0;
    for(let i=0;i<modes.length*2;i++){
      index=rotation.next(index);expect(retired).not.toContain(modes[index]);
      expect([8,25]).not.toContain(modes[index]);
    }
  });
  it("starts with every scene enabled and wraps in catalogue order", () => {
    const rotation = new SceneRotation(modes);
    expect(rotation.count).toBe(modes.length);
    expect(rotation.next(0)).toBe(1);
    expect(rotation.next(modes.length - 1)).toBe(0);
    expect(rotation.disabledModes).toEqual([]);
  });
  it("skips exclusions without confusing renderer IDs with rail indices", () => {
    const rotation = new SceneRotation(modes);
    expect(rotation.toggle(2)).toBe(false); // Torus keeps renderer ID 4 after Signal removal.
    expect(rotation.toggle(3)).toBe(false); // Valley keeps renderer ID 6.
    expect(rotation.disabledModes).toEqual([4, 6]);
    expect(rotation.next(1)).toBe(4);
    expect(rotation.toggle(2)).toBe(true);
    expect(rotation.next(1)).toBe(2);
  });
  it("handles all-off, a single enabled scene and re-enabling without loops", () => {
    const rotation = new SceneRotation(modes, modes);
    expect(rotation.count).toBe(0);
    for (let i = 0; i < modes.length; i++) expect(rotation.next(i)).toBeNull();
    rotation.toggle(7);
    expect(rotation.count).toBe(1);
    expect(rotation.next(7)).toBe(7);
    expect(rotation.next(14)).toBe(7);
    rotation.toggle(0);
    expect(rotation.next(7)).toBe(0);
  });
  it("restores saved exclusions, tolerates malformed data and enables new scenes", () => {
    const rotation = new SceneRotation(modes, [1, 5, 10, 13, 3, 3, 8, 999, "15", null]);
    expect(rotation.disabledModes).toEqual([8]);
    const restored = new SceneRotation([...modes, Math.max(...modes) + 1], JSON.parse(JSON.stringify(rotation.disabledModes)));
    expect(restored.disabledModes).toEqual([8]);
    expect(restored.isEnabled(modes.length)).toBe(true);
    for (const malformed of [null, {}, "bad", 42]) expect(new SceneRotation(modes, malformed).count).toBe(modes.length);
  });
  it("ignores invalid toggles without changing the rotation", () => {
    const rotation = new SceneRotation(modes);
    for (const index of [-1, modes.length, NaN, 1.5, "1"]) {
      expect(rotation.toggle(index)).toBeUndefined();
      expect(rotation.isEnabled(index)).toBe(false);
    }
    expect(rotation.count).toBe(modes.length);
  });
});
