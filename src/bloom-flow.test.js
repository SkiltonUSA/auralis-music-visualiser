import { describe, expect, it, vi } from "vitest";
import { VisualEngine } from "./visual-engine.js";

describe("Bloom's independent Geiss background", () => {
  const setup = (mode, previous = mode, active = false) => Object.assign(Object.create(VisualEngine.prototype), {
    mode, blend: { previous, active }, palette: 2, previousPalette: 1, paused: false,
    geiss: { render: vi.fn(), texture: {}, state: { extraWeights: {y:.8}, rotation:.2 } }, bloomFlow: { render: vi.fn(), texture: {} },
    uniforms: { uGeissScene: { value: null }, uBloomFlow: { value: null }, uGeissTunnelWeight: {value:0}, uGeissRotation:{value:0} },
  });
  it("updates the background in Bloom and preserves the standalone scene", () => {
    for (const mode of [0, 15]) {
      const engine = setup(mode), audio = { level: .7 };
      engine.updateGeiss(audio, .016);
      const active = mode === 0 ? engine.bloomFlow : engine.geiss;
      const hidden = mode === 0 ? engine.geiss : engine.bloomFlow;
      expect(active.render).toHaveBeenCalledExactlyOnceWith(audio, .016, 2, false);
      expect(hidden.render).not.toHaveBeenCalled();
      expect(engine.uniforms.uGeissScene.value).toBe(engine.geiss.texture);
      expect(engine.uniforms.uGeissTunnelWeight.value).toBe(.8);
      expect(engine.uniforms.uGeissRotation.value).toBe(.2);
      expect(engine.uniforms.uBloomFlow.value).toBe(engine.bloomFlow.texture);
    }
  });
  it("advances each independent buffer only once during a Bloom/Geiss crossfade", () => {
    for (const [mode, previous] of [[0, 15], [15, 0]]) {
      const engine = setup(mode, previous, true);
      engine.updateGeiss({}, .016);
      expect(engine.geiss.render).toHaveBeenCalledOnce();
      expect(engine.bloomFlow.render).toHaveBeenCalledOnce();
      expect(engine.bloomFlow.render.mock.calls[0][2]).toBe(mode === 0 ? 2 : 1);
      expect(engine.geiss.render.mock.calls[0][2]).toBe(mode === 15 ? 2 : 1);
    }
  });
  it("keeps the outgoing background alive with its palette, then stops when hidden", () => {
    const engine = setup(8, 0, true), audio = {};
    engine.updateGeiss(audio, .016);
    expect(engine.bloomFlow.render).toHaveBeenCalledExactlyOnceWith(audio, .016, 1, false);
    engine.bloomFlow.render.mockClear(); engine.blend.active = false;
    engine.updateGeiss(audio, .016);
    expect(engine.geiss.render).not.toHaveBeenCalled();
    expect(engine.bloomFlow.render).not.toHaveBeenCalled();
    for (const mode of [1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]) {
      const other = setup(mode); other.updateGeiss(audio, .016);
      expect(other.geiss.render).not.toHaveBeenCalled();
      expect(other.bloomFlow.render).not.toHaveBeenCalled();
    }
  });
  it("passes pause through so neither feedback nor its music clock advances", () => {
    const engine = setup(0, 15, true), audio = {};
    engine.paused = true; engine.updateGeiss(audio, .016);
    expect(engine.geiss.render).toHaveBeenCalledExactlyOnceWith(audio, .016, 1, true);
    expect(engine.bloomFlow.render).toHaveBeenCalledExactlyOnceWith(audio, .016, 2, true);
  });
});
