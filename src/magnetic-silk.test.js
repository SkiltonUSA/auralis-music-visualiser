import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { MagneticSilkScene, MagneticSilkMotion, MAGNETIC_SILK_MODE, MAGNETIC_SILK_QUALITY, MAGNETIC_SILK_PALETTES } from "./magnetic-silk.js";
import { ProceduralScenes, isProceduralMode } from "./procedural-scenes.js";
import { hasSmoke } from "./smoke-simulation.js";

const beat = { bass: .9, mid: .6, high: .4, level: .7, transient: true, beatCount: 1 };
describe("Magnetic Silk", () => {
  it("advances the silk clock and colour waves consistently across frame rates", () => {
    const states = [30, 60, 120].map(fps => {
      const motion = new MagneticSilkMotion();
      for (let i = 0; i < fps; i++) motion.update(beat, 1 / fps);
      return motion;
    });
    for (const motion of states) {
      expect(motion.time).toBeCloseTo(states[0].time, 10);
      expect(motion.ripples[0].x).toBeCloseTo(1, 1);
      expect(motion.emissions).toBe(1);
    }
  });
  it('restores continuous folding while keeping beat impulses confined to colour',()=>{
    const effect=new MagneticSilkScene(new THREE.Scene()),shader=effect.material.fragmentShader;
    const domain=shader.split('vec2 domain')[1].split('vec3 shade')[0];
    expect(domain).toContain('float t=uFlow');
    expect(domain).not.toMatch(/uAudio|uTime|uPulse|uSilkRipples/);
    expect(shader).toContain('base=mix(base,rippleTint,rippleMix*.85)');
    expect(shader).not.toMatch(/uAudio|uTime|uPulse/);
    effect.update({},.05,0);expect(effect.uniforms.uFlow.value).toBeCloseTo(.0031);
    effect.update(beat,.05,0);expect(effect.uniforms.uFlow.value).toBeCloseTo(.0062);
    const flow=effect.uniforms.uFlow.value;
    effect.update({...beat,beatCount:2},0,0);expect(effect.uniforms.uFlow.value).toBe(flow);
    const silent=new MagneticSilkScene(new THREE.Scene());
    for(let i=0;i<2;i++)silent.update({},.05,0);
    expect(silent.uniforms.uFlow.value).toBe(flow);
    silent.mesh.geometry.dispose();silent.material.dispose();
    // Separate motion state checks beat deduplication and ripple decay.
    const m=new MagneticSilkMotion();
    for(let i=0;i<60;i++)m.update({},1/60);
    expect(m.ripples.every(w=>w.y===0)).toBe(true);
    m.update(beat,1/60);expect(m.ripples.filter(w=>w.y>0)).toHaveLength(1);
    m.update(beat,1/60);expect(m.emissions).toBe(1);
    expect(m.ripples[0].x).toBeCloseTo(1/60);
    for(let i=0;i<180;i++)m.update({},1/60);
    expect(m.ripples.every(w=>w.y===0)).toBe(true);
    expect(effect.uniforms.uSilkRipples.value).toBe(effect.motion.ripples);
    effect.mesh.geometry.dispose();effect.material.dispose();
  });
  it("deduplicates beats, fades in silence and freezes on invalid or paused deltas", () => {
    const motion = new MagneticSilkMotion(); motion.update(beat, .05);
    const frozen = JSON.stringify(motion);
    for (const dt of [0, -1, NaN, Infinity]) motion.update({ ...beat, beatCount: 2 }, dt);
    expect(JSON.stringify(motion)).toBe(frozen);
    motion.update(beat, .05); expect(motion.emissions).toBe(1);
    motion.update({ ...beat, beatCount: 2 }, .05); expect(motion.emissions).toBe(2);
    const time = motion.time;
    motion.update({ bass: Infinity, mid: NaN, high: 3, level: -1 }, 100);
    expect(motion.time - time).toBeLessThan(.056);
    expect(motion.ripples.flatMap(w=>w.toArray()).every(Number.isFinite)).toBe(true);
    for (let i = 0; i < 180; i++) motion.update({}, 1 / 60);
    expect(motion.ripples.every(w=>w.y===0)).toBe(true);
  });
  it("retains the supplied geometry and bounded SSAA, with four linear colour palettes", () => {
    const effect = new MagneticSilkScene(new THREE.Scene()), shader = effect.material.fragmentShader;
    expect(effect.mesh.geometry.attributes.position.count).toBe(3);
    expect(shader).toContain("sin(p.y*19.05)*.4842+.5");
    expect(shader).toContain("y<3"); expect(shader).toContain("x<3");
    expect(shader).toContain("float(uAA*uAA)");
    expect(shader).toContain("gl_FragCoord.xy+offset");
    expect(shader).toContain("vec3(.85*2.2)");
    for (const [index, colors] of MAGNETIC_SILK_PALETTES.entries()) {
      effect.update({}, 0, index);
      expect(effect.uniforms.uPalette.value).toBe(index);
      ["uColor1", "uColor2", "uColor3"].forEach((key, i) => expect(effect.uniforms[key].value.getHex()).toBe(colors[i]));
    }
    effect.update({}, 0, Infinity); expect(effect.uniforms.uPalette.value).toBe(0);
    effect.mesh.geometry.dispose(); effect.material.dispose();
  });
  it("reuses resources through quality changes and freezes during paused resizing or hidden scenes", () => {
    const renderer = { target: {}, getRenderTarget() { return this.target; }, setRenderTarget(t) { this.target = t; }, render: vi.fn() };
    const caller = renderer.target, worlds = new ProceduralScenes(renderer, null, 42);
    expect(worlds.entries.size).toBe(0); expect(isProceduralMode(MAGNETIC_SILK_MODE)).toBe(true); expect(hasSmoke(MAGNETIC_SILK_MODE)).toBe(false);
    worlds.resize(3840, 2160, "auto"); worlds.render(21, beat, .05, 0, [], false);
    const entry = worlds.entries.get(21), effect = entry.magneticSilk, geometry = effect.mesh.geometry, material = effect.material;
    const frozen = JSON.stringify(effect.motion), version = material.version;
    expect(renderer.target).toBe(caller);
    for (const [quality, settings] of Object.entries(MAGNETIC_SILK_QUALITY)) {
      worlds.resize(3840, 2160, quality); worlds.render(21, { ...beat, beatCount: 2 }, .05, 2, [], true);
      expect(entry.target.width).toBe(settings.edge); expect(effect.uniforms.uAA.value).toBe(settings.aa);
      expect(effect.uniforms.uResolution.value.toArray()).toEqual([entry.target.width, entry.target.height]);
      expect(effect.mesh.geometry).toBe(geometry); expect(effect.material).toBe(material); expect(material.version).toBe(version);
      expect(JSON.stringify(effect.motion)).toBe(frozen);
    }
    worlds.render(17, beat, .05, 0, [], false); expect(JSON.stringify(effect.motion)).toBe(frozen);
    worlds.render(21, {}, .05, 0, [], false); expect(JSON.stringify(effect.motion)).not.toBe(frozen);
    renderer.render.mockImplementation(() => { throw Error("draw failure"); });
    expect(() => worlds.render(21, {}, .05, 0, [], false)).toThrow("draw failure"); expect(renderer.target).toBe(caller);
    const disposals = [entry.target, geometry, material].map(o => vi.spyOn(o, "dispose"));
    worlds.dispose(); disposals.forEach(spy => expect(spy).toHaveBeenCalledOnce());
  });
});
