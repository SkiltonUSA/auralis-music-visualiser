import { describe, expect, it, vi } from "vitest";
import { Color, Vector4 } from "three";
import { SmokeSimulation, fillSmokeEmitters, hasSmoke, smokeComposition, smokeGrid, SMOKE_EMITTERS, SMOKE_STEP } from "./smoke-simulation.js";

function renderer(supported = true) {
  let current = null;
  let color = new Color(0x040309);
  let alpha = 1;
  return {
    extensions: { has: () => supported },
    getRenderTarget: () => current,
    setRenderTarget: (value) => { current = value; },
    getClearColor: (destination) => destination.copy(color),
    getClearAlpha: () => alpha,
    setClearColor: (value, a) => { color = new Color(value); alpha = a; },
    clear: vi.fn(), render: vi.fn(),
  };
}
const audio = { bass: .6, mid: .4, high: .2, beat: 0 };
const spectrum = new Uint8Array(256).fill(180);

describe("smoke compositions", () => {
  it("limits simulation cost independently of screen resolution", () => {
    expect(smokeGrid(3840, 2160)).toEqual([192, 108]);
    expect(smokeGrid(3840, 2160, "ultra")).toEqual([320, 180]);
    expect(smokeGrid(600, 1000, "high")).toEqual([154, 256]);
  });
  it("only enables the intended smoke scenes", () => {
    expect([0, 6].every(hasSmoke)).toBe(true);
    expect([1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12].some(hasSmoke)).toBe(false);
    expect(smokeComposition(6)).toBe("wisps");
    expect(smokeComposition(0)).toBe("circular");
  });
  it("emits nothing during silence and responds independently to FFT bands", () => {
    const emitters = Array.from({ length: SMOKE_EMITTERS }, () => new Vector4());
    const forces = emitters.map(() => new Vector4());
    const fft = new Uint8Array(256);
    fillSmokeEmitters(emitters, forces, fft, {}, 0, 1.5, "horizontal");
    expect(emitters.every((v) => v.w === 0)).toBe(true);
    expect(forces.every((v) => v.x === 0 && v.y === 0 && v.z === 0)).toBe(true);
    fft[255] = 255;
    fillSmokeEmitters(emitters, forces, fft, audio, 0, 1.5, "horizontal");
    expect(emitters[0].w).toBeGreaterThan(0);
    expect(emitters[7].w).toBe(0);
    expect(forces[0].y).toBeGreaterThan(0);
    fillSmokeEmitters(emitters, forces, spectrum, audio, 0, 2, "circular");
    expect(emitters[0].x).toBeGreaterThan(.5);
    expect(emitters[8].x).toBeLessThan(.5);
    expect(forces[0].x).toBeGreaterThan(0);
    expect(forces[8].x).toBeLessThan(0);
  });
});

describe("GPU smoke lifecycle", () => {
  it("emits thin wisps near the centre with opposing outward forces", () => {
    const emitters = Array.from({ length: SMOKE_EMITTERS }, () => new Vector4());
    const forces = emitters.map(() => new Vector4());
    fillSmokeEmitters(emitters, forces, spectrum, audio, 1, 1.5, "wisps");
    expect(emitters.every((v) => Math.abs(v.x - .5) < .04 && Math.abs(v.y - .49) < .04)).toBe(true);
    expect(forces.slice(0, 8).every((v) => v.x < 0 && Math.abs(v.y) < Math.abs(v.x) * .2)).toBe(true);
    expect(forces.slice(8).every((v) => v.x > 0)).toBe(true);
    fillSmokeEmitters(emitters, forces, new Uint8Array(256), {}, 1, 1.5, "wisps");
    expect(emitters.every((v) => v.w === 0)).toBe(true);
  });
  it("clears circular smoke when entering Valley", () => {
    const sim = new SmokeSimulation(renderer());
    sim.resize(1200, 800, "auto");
    const reset = vi.spyOn(sim, "reset");
    vi.spyOn(sim, "step").mockImplementation(() => {});
    sim.update(audio, spectrum, SMOKE_STEP, 0, 0, 1, false);
    sim.update(audio, spectrum, SMOKE_STEP, 6, 0, .5, false);
    expect(reset).toHaveBeenCalledTimes(2);
    expect(sim.composition).toBe("wisps");
    sim.dispose();
  });
  it("uses fixed steps, skips inactive/paused scenes and bounds catch-up", () => {
    const sim = new SmokeSimulation(renderer());
    sim.resize(1200, 800, "auto");
    const step = vi.spyOn(sim, "step").mockImplementation(() => {});
    const update = (dt, mode = 6, paused = false) => sim.update(audio, spectrum, dt, mode, 1, 1, paused);
    update(SMOKE_STEP / 2);
    expect(step).not.toHaveBeenCalled();
    update(SMOKE_STEP / 2);
    expect(step).toHaveBeenCalledTimes(1);
    update(100);
    expect(step).toHaveBeenCalledTimes(3);
    update(.1, 7); update(.1, 6, true);
    expect(step).toHaveBeenCalledTimes(3);
    sim.dispose();
  });
  it("executes the pressure solver and restores renderer state", () => {
    const gpu = renderer();
    const sim = new SmokeSimulation(gpu);
    const original = { name: "external render target" };
    gpu.setRenderTarget(original);
    sim.resize(1200, 800, "auto");
    const pass = vi.spyOn(sim, "pass");
    sim.update(audio, spectrum, SMOKE_STEP, 6, 1, 1, false);
    expect(pass.mock.calls.map(([name]) => name)).toEqual([
      "advect", "curl", "forces", "divergence", ...Array(12).fill("jacobi"), "project", "advect", "dye",
    ]);
    expect(gpu.getRenderTarget()).toBe(original);
    expect(gpu.getClearColor(new Color()).getHex()).toBe(0x040309);
    expect(gpu.getClearAlpha()).toBe(1);
    const dispose = vi.spyOn(sim.targets[0], "dispose");
    sim.resize(1200, 800, "ultra");
    expect(dispose).toHaveBeenCalledOnce();
    expect(sim.iterations).toBe(24);
    sim.dispose();
  });
  it("returns an empty texture without allocating float targets when unsupported", () => {
    const gpu = renderer(false);
    const sim = new SmokeSimulation(gpu);
    sim.resize(1200, 800, "auto");
    sim.update(audio, spectrum, .1, 6, 1, 1, false);
    expect(sim.targets).toHaveLength(0);
    expect(sim.texture).toBe(sim.empty);
    expect(gpu.render).not.toHaveBeenCalled();
    sim.dispose();
  });
});
