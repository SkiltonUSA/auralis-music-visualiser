import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { AuraMotion, AURA_MODE, horizonAuraGLSL } from "./aura-scene.js";
import { ProceduralScenes } from "./procedural-scenes.js";

const setup = () => {
  const renderer = { target:null, getRenderTarget(){return this.target;}, setRenderTarget(t){this.target=t;}, render:vi.fn() };
  return new ProceduralScenes(renderer, null, 42);
};
const audio = { bass:.7, mid:.5, high:.4, level:.6, transient:true, beatCount:1 };

describe("Horizon Aura background", () => {
  it("replaces the ASCII texture and protects towers and the wave floor", () => {
    const engine = readFileSync(new URL('./visual-engine.js', import.meta.url),'utf8');
    expect(engine).not.toMatch(/horizonAscii|uHorizonAscii|horizon-ascii/);
    expect(engine).toContain('uHorizonAura: { value: this.procedural.texture(8) }');
    expect(engine).toContain('this.uniforms.uHorizonAura.value = this.procedural.texture(8)');
    expect(engine).toContain('horizonAura(p, baseline, max(tower, peakCap))');
    expect(engine).toContain('color += horizonWaves(p, baseline)');
    expect(horizonAuraGLSL).toContain('smoothstep(baseline + .015, baseline + .18, p.y)');
    expect(horizonAuraGLSL).toContain('(1. - clamp(foreground, 0., 1.))');
    expect(horizonAuraGLSL).toContain('* .42 * coverage');
  });
  it("advances each independent clock once during Horizon/Aura blends", () => {
    const worlds=setup();
    worlds.render(8,audio,.05,0,[],false);
    const horizon=worlds.entries.get(8);
    expect(worlds.entries.has(AURA_MODE)).toBe(false);
    const reference=new AuraMotion();reference.update(audio,.05);
    worlds.render(8,{},.05,1,[],false);reference.update({},.05);
    worlds.render(AURA_MODE,audio,.05,2,[],false);
    const standalone=worlds.entries.get(AURA_MODE);
    expect(horizon.aura.motion.time).toBeCloseTo(reference.time,12);
    expect(horizon.aura.motion.emissions).toBe(1);
    expect(horizon.aura.uniforms.uPalette.value).toBe(1);
    expect(standalone.aura.uniforms.uPalette.value).toBe(2);
    expect(horizon.aura.motion).not.toBe(standalone.aura.motion);
    expect(worlds.texture(8)).not.toBe(worlds.texture(AURA_MODE));
    const frozen=JSON.stringify(horizon.aura.motion);
    worlds.render(AURA_MODE,{},.05,2,[],false);
    expect(JSON.stringify(horizon.aura.motion)).toBe(frozen);
    worlds.dispose();
  });
  it("freezes on paused quality/resize redraws and disposes both backgrounds", () => {
    const worlds=setup();
    worlds.render(8,audio,.05,0,[],false);
    worlds.render(AURA_MODE,audio,.05,0,[],false);
    const horizon=worlds.entries.get(8), standalone=worlds.entries.get(AURA_MODE);
    const snapshot=JSON.stringify(horizon.aura.motion);
    worlds.resize(2000,1000,'high');
    worlds.render(8,{...audio,beatCount:2},.05,0,[],true);
    expect(horizon.target.width).toBe(1200);
    expect(horizon.aura.uniforms.uResolution.value.toArray()).toEqual([1200,600]);
    expect(JSON.stringify(horizon.aura.motion)).toBe(snapshot);
    const disposals=[horizon,standalone].flatMap(entry=>[entry.target,entry.aura.material,entry.aura.mesh.geometry].map(o=>vi.spyOn(o,'dispose')));
    worlds.dispose();
    disposals.forEach(spy=>expect(spy).toHaveBeenCalledOnce());
  });
});
