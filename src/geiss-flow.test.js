import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { GeissFlow, GeissFlowState, fillGeissWaveform, geissTargetSize } from "./geiss-flow.js";

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
    const state = new GeissFlowState();
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
