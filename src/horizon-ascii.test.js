import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { ASCII_GLYPHS, ASCII_TILE, createHorizonAsciiAtlas, horizonAsciiGrid } from "./horizon-ascii.js";

describe("Horizon ASCII backdrop", () => {
  it("builds a small, deterministic, single-channel atlas with an empty first glyph", () => {
    const atlas = createHorizonAsciiAtlas(), second = createHorizonAsciiAtlas();
    const { data, width, height } = atlas.image;
    expect(width).toBe(ASCII_GLYPHS.length * ASCII_TILE.width);
    expect(height).toBe(ASCII_TILE.height);
    expect(data).toEqual(second.image.data);
    expect(data.byteLength).toBe(768);
    expect(atlas.format).toBe(THREE.RedFormat);
    expect(atlas.minFilter).toBe(THREE.LinearFilter);
    expect(atlas.generateMipmaps).toBe(false);
    for (let glyph = 0; glyph < ASCII_GLYPHS.length; glyph++) {
      let lit = 0;
      for (let y = 0; y < height; y++) for (let x = 0; x < ASCII_TILE.width; x++) {
        const value = data[y * width + glyph * ASCII_TILE.width + x];
        expect([0, 255]).toContain(value);
        if (x === 0 || x === ASCII_TILE.width - 1 || y === 0 || y === height - 1) expect(value).toBe(0);
        lit += value > 0 ? 1 : 0;
      }
      if (glyph === 0) expect(lit).toBe(0);
      else expect(lit).toBeGreaterThan(0);
    }
    atlas.dispose(); second.dispose();
  });
  it("keeps the dot at the bottom of its upright cell", () => {
    const atlas = createHorizonAsciiAtlas(), { data, width } = atlas.image;
    expect(data[3 * width + 8 + 3]).toBe(255);
    expect(data[9 * width + 8 + 3]).toBe(0);
    atlas.dispose();
  });
  it("bounds density from mobile to ultrawide without tying glyphs to render quality", () => {
    for (const [w, h] of [[1, 1], [390, 844], [1200, 800], [1920, 1080], [3840, 2160], [7680, 2160]]) {
      const [columns, rows] = horizonAsciiGrid(w, h);
      expect(Number.isInteger(columns) && Number.isInteger(rows)).toBe(true);
      expect(columns).toBeGreaterThan(0); expect(rows).toBeGreaterThan(0);
      expect(columns * rows).toBeLessThanOrEqual(5200);
      if (w > 1) expect(w / columns).toBeGreaterThanOrEqual(12);
    }
    expect(horizonAsciiGrid(1200, 800)).toEqual([100, 44]);
  });
});
