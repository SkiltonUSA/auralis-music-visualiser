import { describe, expect, it, vi } from "vitest";
vi.mock("p5", () => ({ default: class {} }));
import { ParticleOverlay } from "./particle-overlay.js";

describe("scene-specific overlay visibility", () => {
  const setup = mode => {
    const overlay = Object.assign(Object.create(ParticleOverlay.prototype), {
      mode, visible: true, audio: {}, frame: 0,
      updateSprings: vi.fn(), drawSegmentedSpectrum: vi.fn(),
      drawSpringMesh: vi.fn(), drawParticles: vi.fn(),
    });
    const p = { clear: vi.fn(), blendMode: vi.fn(), noFill: vi.fn(), push: vi.fn(), pop: vi.fn(), drawingContext: { globalAlpha: 1 }, width: 1200, height: 800 };
    return { overlay, p };
  };
  it("clears Horizon without drawing waves or particles over its centre", () => {
    const { overlay, p } = setup(8);
    overlay.draw(p);
    expect(p.clear).toHaveBeenCalledOnce();
    expect(overlay.drawSpringMesh).not.toHaveBeenCalled();
    expect(overlay.drawParticles).not.toHaveBeenCalled();
  });
  it("preserves Signal’s waveform and spectrum overlay", () => {
    const { overlay, p } = setup(3);
    overlay.draw(p);
    expect(overlay.drawSpringMesh).toHaveBeenCalledOnce();
    expect(overlay.drawSegmentedSpectrum).toHaveBeenCalledOnce();
  });
  it("routes Valley stars to upward perspective motion instead of the shared orbit", () => {
    const overlay = Object.assign(Object.create(ParticleOverlay.prototype), {
      mode: 6, drawValleyParticles: vi.fn(),
    });
    const p = {}, audio = { high: .2, beat: 0 };
    overlay.drawParticles(p, audio, 640, 400, 800, 999999);
    expect(overlay.drawValleyParticles).toHaveBeenCalledExactlyOnceWith(p, audio);
  });
  it("passes the pause-aware scene clock to Valley on each redraw", () => {
    const overlay = Object.assign(Object.create(ParticleOverlay.prototype), { sketch: { redraw: vi.fn() } });
    const audio = {};
    overlay.render(audio, .4, 12);
    expect(overlay.sceneTime).toBe(12);
    expect(overlay.radialAngle).toBe(.4);
    expect(overlay.audio).toBe(audio);
    expect(overlay.sketch.redraw).toHaveBeenCalledOnce();
  });
  it("blends both overlays but advances shared audio motion only once", () => {
    const { overlay, p } = setup(0);
    const drawn = [];
    overlay.drawSpringMesh.mockImplementation(() => drawn.push([overlay.mode, overlay.palette, p.drawingContext.globalAlpha]));
    overlay.setLayers([{ mode: 0, palette: 1, weight: .6 }, { mode: 3, palette: 2, weight: .4 }]);
    overlay.draw(p);
    expect(drawn).toEqual([[0, 1, .6], [3, 2, .4]]);
    expect(overlay.updateSprings).toHaveBeenCalledOnce();
    expect(overlay.frame).toBe(1);
    expect(p.clear).toHaveBeenCalledOnce();
  });
  it("blends the outgoing particles away without adding them to procedural scenes", () => {
    const { overlay, p } = setup(0);
    overlay.setLayers([{ mode: 0, palette: 0, weight: .2 }, { mode: 14, palette: 0, weight: .8 }]);
    overlay.draw(p);
    expect(overlay.drawSpringMesh).toHaveBeenCalledOnce();
    expect(p.drawingContext.globalAlpha).toBe(.2);
    overlay.drawSpringMesh.mockClear();
    overlay.setLayers([{ mode: 14, palette: 0, weight: 1 }]);
    overlay.draw(p);
    expect(overlay.drawSpringMesh).not.toHaveBeenCalled();
  });
});
