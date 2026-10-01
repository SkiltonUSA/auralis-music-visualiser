import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createCrystalEnvironment } from "./crystal-studio.js";

describe("procedural crystal studio", () => {
  it("builds a bounded linear HDR environment without image assets", () => {
    const texture = createCrystalEnvironment();
    expect(texture.image.width).toBe(512);
    expect(texture.image.height).toBe(256);
    expect(texture.type).toBe(THREE.HalfFloatType);
    expect(texture.colorSpace).toBe(THREE.LinearSRGBColorSpace);
    expect(texture.mapping).toBe(THREE.EquirectangularReflectionMapping);
    let maximum = 0, dark = 0, bright = 0;
    for (let i = 0; i < texture.image.data.length; i += 4) {
      const rgb = [0, 1, 2].map(channel => THREE.DataUtils.fromHalfFloat(texture.image.data[i + channel]));
      expect(rgb.every(value => Number.isFinite(value) && value >= 0 && value < 20)).toBe(true);
      const peak = Math.max(...rgb);
      maximum = Math.max(maximum, peak);
      if (peak < .1) dark++;
      if (peak > 2) bright++;
      expect(THREE.DataUtils.fromHalfFloat(texture.image.data[i + 3])).toBe(1);
    }
    expect(maximum).toBeGreaterThan(10);
    expect(dark).toBeGreaterThan(bright);
    expect(bright).toBeGreaterThan(1000);
    texture.dispose();
  });
});
