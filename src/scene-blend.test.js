import { describe, expect, it } from "vitest";
import { SceneBlend, SCENE_BLEND_SECONDS } from "./scene-blend.js";

const advance = (blend, seconds, fps = 60) => {
  for (let i = 0; i < Math.round(seconds * fps); i++) blend.update(1 / fps);
};

describe("live scene blends", () => {
  it("starts fully visible and keeps complementary weights throughout", () => {
    const blend = new SceneBlend();
    expect(blend.weight).toBe(1); expect(blend.active).toBe(false);
    blend.request(11);
    expect(blend.previous).toBe(0); expect(blend.mode).toBe(11); expect(blend.weight).toBe(0);
    let previous = 0;
    for (let i = 0; i < 96; i++) {
      blend.update(1 / 60);
      expect(blend.weight).toBeGreaterThanOrEqual(previous);
      expect(blend.weight + (1 - blend.weight)).toBe(1);
      previous = blend.weight;
    }
    expect(blend.active).toBe(false); expect(blend.weight).toBe(1);
  });
  it("reaches a balanced mix halfway, independently of frame rate", () => {
    for (const fps of [30, 60, 120]) {
      const blend = new SceneBlend(); blend.request(14);
      advance(blend, SCENE_BLEND_SECONDS / 2, fps);
      expect(blend.weight).toBeCloseTo(.5, 10);
      advance(blend, SCENE_BLEND_SECONDS / 2, fps);
      expect(blend.active).toBe(false);
    }
  });
  it("finishes the current blend before taking only the latest queued selection", () => {
    const blend = new SceneBlend(); blend.request(11); advance(blend, .4);
    const weight = blend.weight;
    blend.request(12); blend.request(13); blend.request(14);
    expect(blend.weight).toBe(weight); expect(blend.mode).toBe(11);
    advance(blend, 1.2);
    expect(blend.previous).toBe(11); expect(blend.mode).toBe(14); expect(blend.weight).toBe(0);
    advance(blend, SCENE_BLEND_SECONDS);
    expect(blend.active).toBe(false);
  });
  it("can return to the outgoing scene continuously or cancel a queued request", () => {
    const blend = new SceneBlend(); blend.request(11); advance(blend, .4);
    blend.request(0); advance(blend, 1.2);
    expect(blend.previous).toBe(11); expect(blend.mode).toBe(0);
    blend.request(14); blend.request(0);
    expect(blend.queued).toBeNull();
    advance(blend, SCENE_BLEND_SECONDS);
    expect(blend.mode).toBe(0); expect(blend.active).toBe(false);
  });
  it("ignores duplicates and supports immediate initialisation", () => {
    const blend = new SceneBlend(); blend.request(0); expect(blend.active).toBe(false);
    blend.request(11); advance(blend, .4); const weight = blend.weight;
    blend.request(11); expect(blend.weight).toBe(weight);
    blend.request(14); blend.request(13, true);
    expect(blend.mode).toBe(13); expect(blend.previous).toBe(13);
    expect(blend.active).toBe(false); expect(blend.queued).toBeNull();
  });
  it("freezes on pause, ignores invalid deltas and bounds long frame gaps", () => {
    const blend = new SceneBlend(); blend.request(11);
    for (const delta of [NaN, Infinity, -1, 0]) blend.update(delta);
    blend.update(10, true); expect(blend.weight).toBe(0);
    blend.update(10); expect(blend.progress).toBe(.1 / SCENE_BLEND_SECONDS);
  });
});
