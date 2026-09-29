import { describe, expect, it } from "vitest";
import { HORIZON_COLUMNS, HORIZON_BANDS } from "./horizon-spectrum.js";

describe("Horizon tower frequencies", () => {
  it("gives all 29 mirrored tower pairs distinct frequency bands, including the centre", () => {
    expect(HORIZON_BANDS).toHaveLength(HORIZON_COLUMNS / 2);
    // Lower neighbour used by linear texture sampling, then the renderer’s
    // existing frequency remap. No second squaring in the scene shader.
    const sourceBins = Array.from(HORIZON_BANDS, coordinate => {
      const texel = Math.floor(coordinate * 256 - .5);
      return Math.floor((texel / 255) ** 2 * 700);
    });
    expect(new Set(sourceBins).size).toBe(29);
    expect(sourceBins[0]).toBeGreaterThan(0);
    sourceBins.slice(1).forEach((bin, index) => expect(bin).toBeGreaterThan(sourceBins[index]));
    expect(HORIZON_BANDS.at(-1)).toBeLessThan(1);
  });

  it("uses one stable sample across each tower and mirrors pairs exactly", () => {
    const sample = normalizedX => {
      const id = Math.min(HORIZON_COLUMNS - 1, Math.floor(normalizedX * HORIZON_COLUMNS));
      const bandIndex = Math.abs(id - (HORIZON_COLUMNS - 1) * .5) - .5;
      return HORIZON_BANDS[bandIndex];
    };
    for (let id = 0; id < HORIZON_COLUMNS; id++) {
      const left = sample((id + .1) / HORIZON_COLUMNS);
      expect(left).toBe(sample((id + .9) / HORIZON_COLUMNS));
      expect(left).toBe(sample(1 - (id + .5) / HORIZON_COLUMNS));
    }
    expect(sample(1)).toBe(sample(0));
  });
});
