import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { GeissFlow, GeissFlowState, GEISS_PATTERNS, fillGeissWaveform, geissTargetSize } from "./geiss-flow.js";

describe("Geiss Flow audio and clock", () => {
  it("smooths audio independently of frame rate and freezes completely on pause", () => {
    const a = new GeissFlowState(), b = new GeissFlowState();
    const audio = { level: .8, bass: .7, mid: .6, high: .2 };
    for (let i = 0; i < 60; i++) a.update(audio, 1 / 60);
    for (let i = 0; i < 30; i++) b.update(audio, 1 / 30);
    expect(a.time).toBeCloseTo(b.time, 10);
    a.audio.toArray().forEach((v, i) => expect(v).toBeCloseTo(b.audio.getComponent(i), 10));
    const before = JSON.stringify(a);
    a.update({ transient: true, beatCount: 1 }, 1, true);
    for (const delta of [0, -1, NaN, Infinity]) a.update(audio, delta);
    expect(JSON.stringify(a)).toBe(before);
    expect(a.update(audio, 10)).toBe(.05);
  });
  it("morphs the field only on distinct beats, with a minimum hold and no jump in weights", () => {
    const state = new GeissFlowState({ enhanced: false });
    for (let i = 0; i < 90; i++) state.update({ transient: true, beatCount: 1 }, .05);
    expect(state.beats).toBe(1); expect(state.pattern).toBe(0);
    for (let beat = 2; beat <= 8; beat++) state.update({ transient: true, beatCount: beat }, .05);
    expect(state.pattern).toBe(1); expect(state.beats).toBe(0);
    expect(state.weights.x).toBeGreaterThan(.9); expect(state.weights.y).toBeLessThan(.1);
    for (let i = 0; i < 80; i++) state.update({}, .05);
    expect(state.weights.y).toBeGreaterThan(.99);
    expect(state.weights.x + state.weights.y + state.weights.z).toBeCloseTo(1, 10);
    for (let beat = 9; beat <= 16; beat++) state.update({ transient: true, beatCount: beat }, .05);
    expect(state.pattern).toBe(2);
  });
  it("handles uncounted transients and invalid audio without NaNs or repeated held hits", () => {
    const state = new GeissFlowState();
    for (let i = 0; i < 20; i++) state.update({ transient: true, level: NaN, bass: Infinity }, .05);
    expect(state.beats).toBe(1); expect(state.audio.toArray()).toEqual([0, 0, 0, 0]);
    state.update({}, .05); state.update({ transient: true }, .05);
    expect(state.beats).toBe(2);
  });
  it("averages the real time-domain signal into a reusable texture without losing zero samples", () => {
    const target = new Uint8Array(4);
    fillGeissWaveform(target, [0, 0, 128, 128, 255, 255, 20, 40]);
    expect([...target]).toEqual([0, 128, 255, 30]);
    fillGeissWaveform(target, []); expect([...target]).toEqual([128, 128, 128, 128]);
    fillGeissWaveform(target, [0, 255]); expect([...target]).toEqual([0, 0, 255, 255]);
  });
});

describe('Geiss pattern phrases and variations', () => {
  const audio = { level: .7, bass: .8, mid: .4, high: .2 };
  function beats(state, count, offset = 0) {
    for (let beat = 1; beat <= count; beat++) {
      state.update({ ...audio, transient: true, beatCount: offset + beat }, .05);
      for (let frame = 1; frame < 10; frame++) state.update(audio, .05);
    }
  }
  it('starts with kaleidoscope and visits all six fields on 16/24/32-beat phrases', () => {
    const state = new GeissFlowState(), visited = new Set([state.pattern]), lengths = new Set();
    let offset = 0;
    for (let phrase = 0; phrase < 6; phrase++) {
      const previous = state.pattern, length = state.phraseBeats;
      lengths.add(length); beats(state, length - 1, offset);
      expect(state.pattern).toBe(previous);
      beats(state, 1, offset + length - 1); offset += length;
      expect(state.pattern).toBe((previous + 1) % 6); visited.add(state.pattern);
      expect([...state.weights.toArray(), ...state.extraWeights.toArray()].reduce((a,b)=>a+b,0)).toBeCloseTo(1, 10);
    }
    expect(visited.size).toBe(6); expect([...lengths].sort()).toEqual([16, 24, 32]);
  });
  it('ignores held transients and does not switch on silence or a rapid burst', () => {
    const state = new GeissFlowState();
    for (let i=0;i<200;i++) state.update({...audio, transient:true, beatCount:1},.05);
    expect(state.beats).toBe(1); expect(state.pattern).toBe(3);
    for(let i=0;i<200;i++) state.update({},.05);
    expect(state.pattern).toBe(3);
    const burst = new GeissFlowState();
    for(let i=0;i<20;i++) burst.update({...audio,transient:true,beatCount:i},.05);
    expect(burst.pattern).toBe(3);
  });
  it('holds a manual choice until automatic mode is explicitly restored', () => {
    const state = new GeissFlowState();
    expect(state.setPattern('ribbons')).toBe(true);
    expect(state.extraWeights.z).toBe(0); // No discontinuous jump to a new field.
    beats(state, 64); expect(state.pattern).toBe(5); expect(state.extraWeights.z).toBeGreaterThan(.999);
    const before=JSON.stringify(state); expect(state.setPattern('invalid')).toBe(false); expect(JSON.stringify(state)).toBe(before);
    state.setPattern('auto'); beats(state, 16, 64); expect(state.pattern).toBe(0);
  });
  it('generates reproducible parameter targets and eases them without clearing trails', () => {
    const a = new GeissFlowState(), b = new GeissFlowState();
    const before = a.variation.toArray(); a.newVariation(); b.newVariation();
    expect(a.variation.toArray()).toEqual(before);
    expect(a.variationTarget.toArray()).toEqual(b.variationTarget.toArray());
    expect(a.variationTarget.toArray()).not.toEqual(before);
    for(let i=0;i<60;i++) a.update(audio,1/60);
    for(let i=0;i<30;i++) b.update(audio,1/30);
    a.variation.toArray().forEach((value,i)=>expect(value).toBeCloseTo(b.variation.getComponent(i),10));
    expect(a.rotation).toBeCloseTo(b.rotation,10);
    const frozen=JSON.stringify(a); a.update({...audio,transient:true,beatCount:999},.05,true);
    expect(JSON.stringify(a)).toBe(frozen);
  });
  it('keeps Bloom on the original three fields and ignores expressive controls', () => {
    const background = new GeissFlowState({ enhanced:false }), solo = new GeissFlowState();
    const before=JSON.stringify(background); solo.newVariation(); solo.setPattern('tunnel');
    expect(background.newVariation()).toBe(false); expect(background.setPattern('kaleidoscope')).toBe(false);
    expect(JSON.stringify(background)).toBe(before);
    beats(background,32); expect(background.pattern).toBeLessThan(3);
    expect(background.extraWeights.toArray()).toEqual([0,0,0]);
    expect(background.variation.toArray()).toEqual([1,.6,.25,1]);
    expect(GEISS_PATTERNS.map(pattern=>pattern.id)).toEqual(['spiral','twins','river','kaleidoscope','tunnel','ribbons']);
  });
});

describe('Vortex Tunnel forward flight', () => {
  const sound = { level:.7, bass:.8, mid:.4, high:.2 };
  const active = state => state.tunnelRings.filter(ring => ring.y > 0);
  it('launches one ring per beat, never on held hits or silent input', () => {
    const state = new GeissFlowState(); state.setPattern('tunnel');
    state.update({...sound, transient:true, beatCount:1},1/60);
    expect(active(state)).toHaveLength(1); expect(active(state)[0].x).toBe(.17);
    for(let i=0;i<30;i++) state.update({...sound,transient:true,beatCount:1},1/60);
    expect(active(state)).toHaveLength(1);
    state.update({...sound,transient:true,beatCount:2},1/60);
    expect(active(state)).toHaveLength(2);
    expect(active(state)[0].x).toBeGreaterThan(active(state)[1].x);
    state.update({level:0,transient:true,beatCount:3},1/60);
    expect(active(state)).toHaveLength(2);
  });
  it('keeps rings travelling outward through the first negative variation and zero crossing', () => {
    const state = new GeissFlowState(); state.setPattern('tunnel'); state.newVariation();
    expect(state.variationTarget.x).toBe(-1);
    state.update({...sound,transient:true,beatCount:1},1/60);
    const ring=state.tunnelRings[0];
    for(let i=0;i<150;i++) {
      const radius=ring.x; state.update(sound,1/60);
      expect(state.tunnelSpeed).toBeGreaterThanOrEqual(.95);
      expect(ring.x).toBeGreaterThan(radius);
    }
    expect(state.variation.x).toBeLessThan(0);
    expect(ring.x).toBeGreaterThan(1); expect(ring.y).toBeGreaterThan(.5);
  });
  it('freezes on pause and retires rings without wrapping or allocating new slots', () => {
    const state=new GeissFlowState(); state.setPattern('tunnel');
    const slots=[...state.tunnelRings]; state.update({...sound,transient:true,beatCount:1},.02);
    const frozen=JSON.stringify(state); state.update(sound,1,true); expect(JSON.stringify(state)).toBe(frozen);
    for(let i=0;i<300;i++) state.update({},.02);
    expect(active(state)).toHaveLength(0); expect(state.tunnelRings).toEqual(slots);
    for(let i=0;i<80;i++) state.update({...sound,transient:true,beatCount:i+2},.05);
    expect(state.tunnelRings).toHaveLength(16);
    state.tunnelRings.forEach((ring,i)=>expect(ring).toBe(slots[i]));
  });
  it('does not emit in other patterns or Bloom; flight is consistent across frame rates', () => {
    for(const state of [new GeissFlowState(),new GeissFlowState({enhanced:false})]) {
      state.update({...sound,transient:true,beatCount:1},.02); expect(active(state)).toHaveLength(0);
    }
    const states=[30,60,120].map(fps=>{
      const state=new GeissFlowState(); state.setPattern('tunnel'); state.audio.set(.8,.4,.2,.7);
      state.update({...sound,transient:true,beatCount:1},1/fps);
      for(let i=0;i<fps*2;i++) state.update(sound,1/fps);
      return state;
    });
    states.forEach(state=>expect(state.tunnelRings[0].x).toBeCloseTo(states[0].tunnelRings[0].x,10));
  });
});

describe("Geiss Flow feedback resources", () => {
  function setup() {
    let bound = { name: "external" };
    const renders = [];
    const renderer = { getRenderTarget: () => bound, setRenderTarget: vi.fn(target => { bound = target; }),
      render: vi.fn(scene => renders.push({ target: bound, source: scene.children[0].material.uniforms.uPrevious?.value || scene.children[0].material.uniforms.uSource.value })) };
    const flow = new GeissFlow(renderer);
    return { flow, renderer, renders, original: bound };
  }
  it("allocates lazily and ping-pongs without ever sampling the output buffer", () => {
    const { flow, renderer, renders, original } = setup();
    flow.resize(1920, 1080, "auto"); expect(flow.targets).toHaveLength(0);
    flow.render({ level: .8, waveform: [0, 128, 255] }, 1 / 60);
    expect(flow.targets).toHaveLength(2); expect(flow.targets[0].width).toBe(1000);
    expect(flow.targets[0].texture.type).toBe(THREE.HalfFloatType);
    const targets = [...flow.targets], previous = flow.texture;
    flow.render({ level: .8 }, 1 / 60);
    expect(flow.targets).toEqual(targets); expect(flow.texture).not.toBe(previous);
    expect(renders.at(-1).source).toBe(previous);
    for (const frame of renders) expect(frame.source).not.toBe(frame.target.texture);
    expect(renderer.getRenderTarget()).toBe(original);
    flow.dispose();
  });
  it("preserves trails when resizing while paused, without advancing time or reallocating each frame", () => {
    const { flow, renders, renderer } = setup();
    flow.resize(800, 600); flow.render({ level: 1 }, .016);
    const source = flow.texture, time = flow.state.time;
    const disposals = flow.targets.map(target => vi.spyOn(target, "dispose"));
    renderer.render.mockClear(); renders.length = 0;
    flow.resize(1200, 800, "high"); flow.render({}, 1, 0, true);
    expect(renders).toHaveLength(2);
    expect(renders.every(frame => frame.source === source)).toBe(true);
    expect(flow.state.time).toBe(time);
    disposals.forEach(spy => expect(spy).toHaveBeenCalledOnce());
    renderer.render.mockClear(); flow.render({}, 1, 0, true);
    expect(renderer.render).not.toHaveBeenCalled();
    flow.dispose();
  });
  it("caps all quality levels and preserves aspect ratio", () => {
    expect(geissTargetSize(3840, 2160)).toEqual([1000, 563]);
    expect(geissTargetSize(3840, 2160, "high")).toEqual([1400, 788]);
    expect(geissTargetSize(3840, 2160, "ultra")).toEqual([1800, 1013]);
    expect(geissTargetSize(390, 844)).toEqual([390, 844]);
  });
  it("restores the caller's render target on failure and releases owned GPU resources", () => {
    const { flow, renderer, original } = setup();
    flow.render({}, .016);
    renderer.render.mockImplementationOnce(() => { throw Error("draw failed"); });
    expect(() => flow.render({}, .016)).toThrow("draw failed");
    expect(renderer.getRenderTarget()).toBe(original);
    const resources = [...flow.targets, flow.quad.geometry, flow.material, flow.copy, flow.waveform, flow.empty];
    const spies = resources.map(resource => vi.spyOn(resource, "dispose"));
    flow.dispose(); spies.forEach(spy => expect(spy).toHaveBeenCalledOnce());
  });
});
