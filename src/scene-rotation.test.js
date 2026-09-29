import { describe, expect, it } from "vitest";
import { SceneRotation } from "./scene-rotation.js";
import { scenes } from "./scenes.js";

const modes = scenes.map(scene => scene.renderMode);
describe("Auto Director rotation selection", () => {
  it("starts with every scene enabled and wraps in catalogue order", () => {
    const rotation = new SceneRotation(modes);
    expect(rotation.count).toBe(15);
    expect(rotation.next(0)).toBe(1);
    expect(rotation.next(14)).toBe(0);
    expect(rotation.disabledModes).toEqual([]);
  });
  it("skips exclusions without confusing renderer IDs with rail indices", () => {
    const rotation = new SceneRotation(modes);
    expect(rotation.toggle(2)).toBe(false); // Signal uses renderer ID 3.
    expect(rotation.toggle(3)).toBe(false); // Torus uses renderer ID 4.
    expect(rotation.disabledModes).toEqual([3, 4]);
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
    const rotation = new SceneRotation(modes, [3, 3, 8, 999, "15", null]);
    expect(rotation.disabledModes).toEqual([3, 8]);
    const restored = new SceneRotation([...modes, 16], JSON.parse(JSON.stringify(rotation.disabledModes)));
    expect(restored.disabledModes).toEqual([3, 8]);
    expect(restored.isEnabled(15)).toBe(true);
    for (const malformed of [null, {}, "bad", 42]) expect(new SceneRotation(modes, malformed).count).toBe(15);
  });
  it("ignores invalid toggles without changing the rotation", () => {
    const rotation = new SceneRotation(modes);
    for (const index of [-1, 15, NaN, 1.5, "1"]) {
      expect(rotation.toggle(index)).toBeUndefined();
      expect(rotation.isEnabled(index)).toBe(false);
    }
    expect(rotation.count).toBe(15);
  });
});
