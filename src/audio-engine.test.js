import { describe, expect, it } from "vitest";
import { averageBand, estimateBpm, measureFrequencyRanges } from "./audio-engine.js";

describe("averageBand", () => {
  it("measures only the requested frequency range", () => {
    const data = new Uint8Array(512);
    data[10] = 255;
    data[100] = 255;
    expect(averageBand(data, 48000, 1024, 400, 600)).toBeGreaterThan(0);
    expect(averageBand(data, 48000, 1024, 1000, 2000)).toBe(0);
  });

  it("returns zero for an empty band", () => {
    expect(averageBand(new Uint8Array(16), 48000, 32, 20, 200)).toBe(0);
  });
});

describe("estimateBpm", () => {
  it("uses the median interval and rejects timing outliers", () => {
    expect(estimateBpm([500, 498, 502, 1500, 501])).toBe(120);
  });

  it("folds half-time estimates into a useful performance range", () => {
    expect(estimateBpm([1000, 1000, 1000])).toBe(120);
  });
});

describe("measureFrequencyRanges", () => {
  it("returns independently measured musical ranges", () => {
    const data = new Uint8Array(1024);
    data[2] = 255;
    data[100] = 255;
    const bands = measureFrequencyRanges(data, 48000, 2048, { low: [40, 60], presence: [2300, 2400] });
    expect(bands.low).toBeGreaterThan(0);
    expect(bands.presence).toBeGreaterThan(0);
  });
});
