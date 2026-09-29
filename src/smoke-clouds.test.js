import { describe, expect, it, vi } from "vitest";
import { DataTexture } from "three";
import { SmokeClouds } from "./smoke-clouds.js";

function setup() {
  let target = null;
  const renderer = {
    getRenderTarget: () => target,
    setRenderTarget: (value) => { target = value; },
    render: vi.fn(),
  };
  return { renderer, clouds: new SmokeClouds(renderer, new DataTexture()) };
}

describe("Haze particle clouds", () => {
  it("shares resources and bounds quality cost", () => {
    const { clouds } = setup();
    clouds.resize(3840, 2160, "auto");
    expect(clouds.target.width).toBe(800);
    expect(clouds.particles.filter((p) => p.visible)).toHaveLength(28);
    expect(new Set(clouds.particles.map((p) => p.geometry)).size).toBe(1);
    expect(new Set(clouds.particles.map((p) => p.material)).size).toBe(4);
    clouds.resize(3840, 2160, "ultra");
    expect(clouds.target.width).toBe(1440);
    expect(clouds.particles.filter((p) => p.visible)).toHaveLength(56);
    clouds.dispose();
  });
  it("drifts and rotates while different bands change different cloud layers", () => {
    const { clouds } = setup();
    const before = clouds.particles[0].position.clone();
    const angle = clouds.particles[0].rotation.z;
    clouds.advance({ level: .8, bass: 1, mid: 0, high: 0 }, 1 / 30, 2);
    expect(clouds.particles[0].position.equals(before)).toBe(false);
    expect(clouds.particles[0].rotation.z).not.toBe(angle);
    expect(clouds.materials[0].opacity).toBeGreaterThan(clouds.materials[1].opacity);
    expect(clouds.palette).toBe(2);
    clouds.dispose();
  });
  it("freezes when paused and restores the caller's render target", () => {
    const { renderer, clouds } = setup();
    const previous = { name: "scene target" };
    renderer.setRenderTarget(previous);
    clouds.render({ level: .5 }, 1 / 30, 0, false);
    const before = clouds.particles[0].position.clone();
    clouds.render({ level: 1 }, 1, 0, true);
    expect(clouds.particles[0].position.equals(before)).toBe(true);
    expect(renderer.render).toHaveBeenCalledOnce();
    expect(renderer.getRenderTarget()).toBe(previous);
    clouds.dispose();
  });
});
