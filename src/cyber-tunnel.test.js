import { describe, it, expect, vi } from "vitest";
import * as THREE from "three";
import { CyberTunnel, CyberTunnelMotion, createCyberPath, createCyberGlyphTexture, CYBER_TUNNEL_MODE, CYBER_TUNNEL_SETTINGS, CYBER_TUNNEL_QUALITY, CYBER_TUNNEL_PALETTES } from "./cyber-tunnel.js";
import { ProceduralScenes, isProceduralMode } from "./procedural-scenes.js";
import { hasSmoke } from "./smoke-simulation.js";

const beat = { bass: .9, mid: .6, high: .4, level: .7, transient: true, beatCount: 1 };
describe("Cyber Tunnel", () => {
  it("matches the screenshot preset and applies bounded, paused mouse sway without accumulating roll", () => {
    const handlers=new Map();
    const canvas={
      addEventListener:vi.fn((name,handler)=>handlers.set(name,handler)),
      removeEventListener:vi.fn(),
      getBoundingClientRect:()=>({left:10,top:20,width:1000,height:500}),
    };
    const camera=new THREE.PerspectiveCamera(),effect=new CyberTunnel(new THREE.Scene(),camera,canvas);
    expect(CYBER_TUNNEL_SETTINGS).toEqual({speed:.2,mouseParallax:5,rgbShiftAmount:.001,cameraOffsetY:3,
      reflectionStrength:.35,ghostIntensity:.864,matrixIntensity:.25,depthFade:.001,
      showRings:true,ringCount:10,topColor:0x0a198c,bottomColor:0x11133b,bloomStrength:1});
    expect(effect.uniforms.uDepthFade.value).toBe(.001);
    expect(effect.uniforms.uGhostIntensity.value).toBe(.864);
    expect(effect.uniforms.uMatrixIntensity.value).toBe(.25);
    expect(effect.uniforms.uShowRings.value).toBe(1);
    expect(effect.uniforms.uRingCount.value).toBe(10);
    expect(effect.uniforms.uReflectionStrength.value).toBe(.35);
    const position=camera.position.clone(),orientation=camera.quaternion.clone();
    handlers.get("pointermove")({clientX:1010,clientY:20,pointerType:"mouse"});
    expect(effect.pointerTarget.toArray()).toEqual([1,1]);
    effect.update({},0,0);
    expect(camera.position.equals(position)).toBe(true);expect(camera.quaternion.equals(orientation)).toBe(true);
    for(let i=0;i<100;i++)effect.updateCamera(.05);
    expect(effect.pointer.x).toBeCloseTo(1,6);
    expect(camera.position.distanceTo(position)).toBeCloseTo(Math.hypot(5,2.5),5);
    const settled=camera.quaternion.clone();effect.updateCamera(.05);
    expect(camera.quaternion.angleTo(settled)).toBeLessThan(.00001);
    handlers.get("pointermove")({clientX:10,clientY:520,pointerType:"touch"});
    expect(effect.pointerTarget.toArray()).toEqual([1,1]);
    handlers.get("pointerleave")();
    for(let i=0;i<100;i++)effect.updateCamera(.05);
    expect(camera.position.distanceTo(position)).toBeLessThan(.00001);
    effect.dispose();
    expect(canvas.removeEventListener).toHaveBeenCalledWith("pointermove",handlers.get("pointermove"));
    expect(canvas.removeEventListener).toHaveBeenCalledWith("pointerleave",handlers.get("pointerleave"));
    effect.mesh.geometry.dispose();effect.material.dispose();
  });
  it("integrates smooth forward travel consistently and deduplicates beats", () => {
    const states = [30, 60, 120].map(fps => {
      const motion = new CyberTunnelMotion();
      for (let i = 0; i < fps; i++) motion.update(beat, 1 / fps);
      return motion;
    });
    for (const motion of states) {
      for (const key of ["progress", "time", "pulse"]) expect(motion[key]).toBeCloseTo(states[0][key], 10);
      expect(motion.progress).toBeGreaterThan(.02); expect(motion.progress).toBeLessThan(.03);
      expect(motion.emissions).toBe(1);
    }
    const motion = new CyberTunnelMotion(); motion.update(beat, .05); const frozen = JSON.stringify(motion);
    for (const dt of [0, -1, NaN, Infinity]) motion.update({ ...beat, beatCount: 2 }, dt);
    expect(JSON.stringify(motion)).toBe(frozen);
    motion.progress = .9999; motion.update({ ...beat, beatCount: 2 }, .05);
    expect(motion.progress).toBeLessThan(.002); expect(motion.emissions).toBe(2);
    motion.update({ bass: Infinity, mid: NaN, high: 5, level: -2 }, 100);
    expect(motion.audio.toArray().every(v => Number.isFinite(v) && v >= 0 && v <= 1)).toBe(true);
  });
  it("closes the upright route without duplicate control points or frame seams", () => {
    const path = createCyberPath(), frames = path.computeFrenetFrames(800);
    expect(path.points).toHaveLength(400); expect(path.points[0].distanceTo(path.points.at(-1))).toBeGreaterThan(1);
    expect(path.getPointAt(0).distanceTo(path.getPointAt(1))).toBeLessThan(.00001);
    for (const key of ["tangents", "normals", "binormals"]) {
      expect(frames[key][0].equals(frames[key][800])).toBe(true);
      expect(frames[key].every(v => Math.abs(v.length() - 1) < .00001)).toBe(true);
    }
    expect(frames.normals.every(v => v.y > .8)).toBe(true);
  });
  it("generates a deterministic, font-independent glyph atlas", () => {
    const a = createCyberGlyphTexture(), b = createCyberGlyphTexture();
    expect(a.image.width).toBe(256); expect(a.image.data).toEqual(b.image.data);
    expect(a.image.data.some(v => v > 0)).toBe(true); expect(a.image.data.some(v => v === 0)).toBe(true);
    expect(a.wrapS).toBe(THREE.RepeatWrapping); expect(a.generateMipmaps).toBe(true); a.dispose(); b.dispose();
  });
  it("reuses the tube at every quality and freezes camera and material during paused resizes", () => {
    const renderer = { target: {}, getRenderTarget() { return this.target; }, setRenderTarget(t) { this.target = t; }, render: vi.fn() };
    const caller = renderer.target, worlds = new ProceduralScenes(renderer, null, 42);
    expect(worlds.entries.size).toBe(0); expect(isProceduralMode(CYBER_TUNNEL_MODE)).toBe(true); expect(hasSmoke(CYBER_TUNNEL_MODE)).toBe(false);
    worlds.resize(3840, 2160, "auto"); worlds.render(22, beat, .05, 0, [], false);
    const entry = worlds.entries.get(22), effect = entry.cyberTunnel, geometry = effect.mesh.geometry, material = effect.material;
    const frozen = JSON.stringify(effect.motion), position = entry.camera.position.clone(), orientation = entry.camera.quaternion.clone();
    expect(renderer.target).toBe(caller); expect(geometry.attributes.position.count).toBe(801 * 65);
    const first = new THREE.Vector3(), last = new THREE.Vector3();
    for (let i = 0; i < 65; i++) {
      first.fromBufferAttribute(geometry.attributes.position, i); last.fromBufferAttribute(geometry.attributes.position, 800 * 65 + i);
      expect(first.distanceTo(last)).toBeLessThan(.00001);
    }
    for (const [quality, settings] of Object.entries(CYBER_TUNNEL_QUALITY)) {
      worlds.resize(3840, 2160, quality); worlds.render(22, { ...beat, beatCount: 2 }, .05, 2, [], true);
      expect(entry.target.width).toBe(settings.edge); expect(effect.mesh.geometry).toBe(geometry); expect(effect.material).toBe(material);
      expect(JSON.stringify(effect.motion)).toBe(frozen); expect(entry.camera.position.equals(position)).toBe(true); expect(entry.camera.quaternion.equals(orientation)).toBe(true);
    }
    CYBER_TUNNEL_PALETTES.forEach((colors, i) => { effect.update({}, 0, i); expect(effect.uniforms.uTopColor.value.getHex()).toBe(colors[0]); });
    expect(material.fragmentShader).not.toContain("smoothstep(0.7, 0.1");
    expect(material.fragmentShader).toContain("float refCy = (cy + 0.8) * 0.75");
    worlds.render(17, beat, .05, 0, [], false); expect(JSON.stringify(effect.motion)).toBe(frozen);
    worlds.render(22, {}, .05, 0, [], false); expect(entry.camera.position.equals(position)).toBe(false);
    renderer.render.mockImplementation(() => { throw Error("draw failure"); });
    expect(() => worlds.render(22, {}, .05, 0, [], false)).toThrow("draw failure"); expect(renderer.target).toBe(caller);
    const disposals = [entry.target, geometry, material, effect.glyphs].map(o => vi.spyOn(o, "dispose"));
    worlds.dispose(); disposals.forEach(spy => expect(spy).toHaveBeenCalledOnce());
  });
});
