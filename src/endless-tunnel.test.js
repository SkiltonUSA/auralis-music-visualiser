import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { createTunnelGeometry, tunnelCenter, TUNNEL_RADIUS, TUNNEL_WIDTH, EndlessTunnel, CheckerBeatFlash } from "./endless-tunnel.js";
import { ProceduralScenes, seededRandom } from "./procedural-scenes.js";

describe("Torus beat squares", () => {
  it("flashes on detected beats, not sustained loudness, and decays smoothly", () => {
    const flash = new CheckerBeatFlash();
    expect(flash.update({ bass: 1, level: 1, beat: 1 }, .016)).toBe(0);
    expect(flash.update({ transient: true, beatCount: 1, bass: 1 }, .016)).toBe(1);
    expect(flash.update({ transient: true, beatCount: 1, bass: 1 }, .05)).toBeLessThan(1);
    for (let i = 0; i < 20; i++) flash.update({}, .05);
    expect(flash.value).toBeLessThan(.001);
    expect(flash.update({ transient: true, beatCount: 2 }, .016)).toBe(.75);
  });
  it("freezes on pause and releases consistently at different frame rates", () => {
    const a = new CheckerBeatFlash(), b = new CheckerBeatFlash();
    for (const flash of [a, b]) flash.update({ transient: true, beatCount: 1, bass: 1 }, .016);
    expect(a.update({}, 0)).toBe(1);
    for (let i = 0; i < 30; i++) a.update({}, 1 / 60);
    for (let i = 0; i < 15; i++) b.update({}, 1 / 30);
    expect(a.value).toBeCloseTo(b.value, 10);
  });
  it("lights the checker variant only and freezes its pulse when paused", () => {
    const renderer = { getRenderTarget: () => null, setRenderTarget() {}, render() {} };
    const spectrum = new THREE.Texture(), scenes = new ProceduralScenes(renderer, spectrum, 42);
    const beat = { transient: true, beatCount: 1, bass: 1 };
    scenes.render(4, beat, .016, 0, [], false);
    scenes.render(13, beat, .016, 0, [], false);
    expect(scenes.entries.get(4).tunnel.uniforms.uTileFlash.value).toBe(1);
    expect(scenes.entries.get(13).tunnel.uniforms.uTileFlash.value).toBe(0);
    scenes.render(4, {}, .5, 0, [], true);
    expect(scenes.entries.get(4).tunnel.uniforms.uTileFlash.value).toBe(1);
    scenes.dispose(); spectrum.dispose();
  });
});

describe("endless torus geometry", () => {
  it("closes both seams with matching normals and separate UV endpoints", () => {
    const rings = 40, sides = 20, geometry = createTunnelGeometry(rings, sides);
    const p = geometry.attributes.position, n = geometry.attributes.normal, uv = geometry.attributes.uv;
    const vertex = (attribute, i) => new THREE.Vector3().fromBufferAttribute(attribute, i);
    expect(p.count).toBe((rings + 1) * (sides + 1));
    expect(geometry.index.count).toBe(rings * sides * 6);
    expect([...p.array, ...n.array, ...uv.array].every(Number.isFinite)).toBe(true);
    expect(Math.max(...geometry.index.array)).toBeLessThan(p.count);
    for (let i = 0; i <= sides; i++) {
      const end = rings * (sides + 1) + i;
      expect(vertex(p, i).distanceTo(vertex(p, end))).toBeLessThan(.00001);
      expect(vertex(n, i).distanceTo(vertex(n, end))).toBeLessThan(.00001);
      expect(uv.getX(i)).toBe(0); expect(uv.getX(end)).toBe(1);
    }
    for (let i = 0; i <= rings; i++) {
      const start = i * (sides + 1), end = start + sides;
      expect(vertex(p, start).distanceTo(vertex(p, end))).toBeLessThan(.00001);
      expect(vertex(n, start).distanceTo(vertex(n, end))).toBeLessThan(.00001);
      expect(uv.getY(start)).toBe(0); expect(uv.getY(end)).toBe(1);
    }
    const a = vertex(p, geometry.index.getX(0)), b = vertex(p, geometry.index.getX(1)), c = vertex(p, geometry.index.getX(2));
    expect(b.sub(a).cross(c.sub(a)).dot(vertex(n, 0))).toBeGreaterThan(0);
    geometry.dispose();
  });
  it("keeps the view inside a closed centerline", () => {
    for (let angle = 0; angle < Math.PI * 2; angle += .07) {
      const p = tunnelCenter(angle);
      expect(p.length()).toBeCloseTo(TUNNEL_RADIUS);
      expect(p.y).toBe(0);
      expect(p.distanceTo(tunnelCenter(angle + .12))).toBeLessThan(TUNNEL_WIDTH);
    }
    expect(tunnelCenter(0).distanceTo(tunnelCenter(Math.PI * 2))).toBeLessThan(1e-10);
    expect(() => createTunnelGeometry(0, 20)).toThrow(RangeError);
  });
});

describe("endless tunnel motion", () => {
  it("retains Torus tube rotation and its upright camera independently of plasma motion", () => {
    const renderer = { getRenderTarget: () => null, setRenderTarget() {}, render() {} };
    const spectrum = new THREE.Texture(), scenes = new ProceduralScenes(renderer, spectrum, 42);
    scenes.render(4, {}, .05, 0, [], false);
    scenes.render(13, {}, .05, 0, [], false);
    const torus = scenes.entries.get(4).tunnel, plasma = scenes.entries.get(13).tunnel;
    expect(torus.uniforms.uTubeRotation.value).toBeCloseTo(.008);
    expect(plasma.uniforms.uTubeRotation.value).toBeCloseTo(.02475);
    expect(torus.roll).toBe(0);
    expect(plasma.roll).toBeGreaterThan(0);
    expect(torus.camera.position.length()).toBeCloseTo(TUNNEL_RADIUS);
    expect(torus.camera.up.toArray()).toEqual([0, 1, 0]);
    expect(torus.mesh.material.vertexShader).toContain('float rolled = v + uTubeRotation;');
    expect(torus.mesh.material.vertexShader).toContain('vUv = uv;');
    expect(torus.mesh.material.vertexShader).toContain('vNormal = normalMatrix * tubeNormal;');
    scenes.render(4, { transient: true, beatCount: 1, bass: 1 }, .05, 0, [], false);
    expect(torus.uniforms.uTileFlash.value).toBe(1);
    expect(torus.uniforms.uTubeRotation.value).toBeGreaterThan(.008);
    const angle = torus.tubeRotation;
    scenes.render(4, { level: 1 }, 10, 0, [], true);
    expect(torus.tubeRotation).toBe(angle);
    scenes.render(13, {}, .05, 0, [], false);
    expect(torus.tubeRotation).toBe(angle);
    scenes.dispose(); spectrum.dispose();
  });
  it("integrates tube rotation consistently across frame rates and wraps a full turn", () => {
    const spectrum = new THREE.Texture();
    const make = () => new EndlessTunnel(new THREE.Scene(), new THREE.PerspectiveCamera(), spectrum, seededRandom(42), 'checker');
    const a = make(), b = make();
    for (let i = 0; i < 300; i++) a.update({}, 1 / 30, 0);
    for (let i = 0; i < 1200; i++) b.update({}, 1 / 120, 0);
    expect(a.tubeRotation).toBeCloseTo(1.6, 8);
    expect(a.tubeRotation).toBeCloseTo(b.tubeRotation, 8);
    a.tubeRotation = Math.PI * 2 - .001;
    a.update({}, 1 / 60, 0);
    expect(a.tubeRotation).toBeCloseTo(.16 / 60 - .001, 8);
    const before = a.tubeRotation;
    a.update({ level: 1, beat: 1 }, 100, 0);
    expect(a.tubeRotation - before).toBeLessThanOrEqual(.011);
    for (const tunnel of [a, b]) { tunnel.mesh.geometry.dispose(); tunnel.mesh.material.dispose(); }
    spectrum.dispose();
  });
  it("gives Torus enclosed checker walls while retaining a separate plasma tunnel", () => {
    const renderer = { getRenderTarget: () => null, setRenderTarget() {}, render() {} };
    const spectrum = new THREE.Texture();
    const scenes = new ProceduralScenes(renderer, spectrum, 42);
    scenes.render(4, {}, .016, 0, [], false);
    const torus = scenes.entries.get(4);
    expect(torus.tunnel.style).toBe("checker");
    expect(torus.tunnel.uniforms.uChecker.value).toBe(1);
    expect(torus.tunnel.uniforms.uB.value.getHex()).toBe(0x73ff23);
    expect(torus.tunnel.mesh.material.side).toBe(THREE.BackSide);
    expect(torus.camera.position.length()).toBeCloseTo(TUNNEL_RADIUS);
    const position = torus.camera.position.clone();
    scenes.render(4, { bass: 1, mid: 1, high: 1, level: 1 }, .05, 0, [], false);
    expect(torus.camera.position.distanceTo(position)).toBeGreaterThan(0);
    expect(torus.tunnel.audio.x).toBeGreaterThan(0);
    const distance = torus.tunnel.distance;
    scenes.render(13, {}, .016, 0, [], false);
    expect(torus.tunnel.distance).toBe(distance);
    expect(scenes.entries.get(13).tunnel.uniforms.uChecker.value).toBe(0);
    expect(scenes.entries.get(13).tunnel.uniforms.uB.value.getHex()).toBe(0x09d6e8);
    scenes.resize(1600, 900, "high");
    scenes.render(4, {}, 1, 0, [], true);
    expect(torus.tunnel.distance).toBe(distance);
    scenes.dispose(); spectrum.dispose();
  });
  function setup() {
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(), spectrum = new THREE.Texture();
    const tunnel = new EndlessTunnel(scene, camera, spectrum, seededRandom(42));
    return { tunnel, camera, dispose() { tunnel.mesh.geometry.dispose(); tunnel.mesh.material.dispose(); spectrum.dispose(); } };
  }
  it("spins the plasma tube, lifts its view and sweeps smoothly to both sides", () => {
    const { tunnel, camera, dispose } = setup();
    let left = 0, right = 0, maxOffset = 0;
    for (let i = 0; i < 1800; i++) {
      const orientation = camera.quaternion.clone();
      tunnel.update({ level: .6, mid: .5, bass: .5, beat: i % 30 === 0 ? 1 : 0 }, 1 / 30, 0);
      left = Math.min(left, tunnel.sway); right = Math.max(right, tunnel.sway);
      const radialOffset = Math.hypot(camera.position.x, camera.position.z) - TUNNEL_RADIUS;
      maxOffset = Math.max(maxOffset, Math.hypot(radialOffset, camera.position.y));
      expect(tunnel.lift).toBeGreaterThanOrEqual(.1 - 1e-10);
      expect(tunnel.lift).toBeLessThanOrEqual(.8);
      expect(camera.quaternion.toArray().every(Number.isFinite)).toBe(true);
      expect(orientation.angleTo(camera.quaternion)).toBeLessThan(.03);
    }
    expect(left).toBeLessThan(-.8); expect(right).toBeGreaterThan(.8);
    expect(tunnel.roll).toBeGreaterThan(0);
    expect(tunnel.motionTime).toBeGreaterThan(60);
    expect(tunnel.tubeRotation).toBeGreaterThan(0);
    expect(maxOffset).toBeLessThan(.42);
    expect(tunnel.distance).toBeGreaterThan(280);
    dispose();
  });
  it("keeps plasma spin and steering frame-rate independent and frozen at zero delta", () => {
    const a = setup(), b = setup();
    for (let i = 0; i < 300; i++) a.tunnel.update({}, 1 / 30, 0);
    for (let i = 0; i < 1200; i++) b.tunnel.update({}, 1 / 120, 0);
    expect(a.tunnel.tubeRotation).toBeCloseTo(4.95, 8);
    expect(a.tunnel.roll).toBeCloseTo(1.575, 8);
    expect(a.tunnel.motionTime).toBeCloseTo(16.875, 8);
    expect(a.tunnel.distance).toBeCloseTo(48, 8);
    expect(a.tunnel.motionTime).toBeCloseTo(b.tunnel.motionTime, 8);
    expect(a.camera.quaternion.angleTo(b.camera.quaternion)).toBeLessThan(1e-7);
    const before = [a.tunnel.motionTime, a.tunnel.tubeRotation, a.tunnel.roll, ...a.camera.position.toArray(), ...a.camera.quaternion.toArray()];
    a.tunnel.update({ level: 1, bass: 1, mid: 1, beat: 1 }, 0, 0);
    expect([a.tunnel.motionTime, a.tunnel.tubeRotation, a.tunnel.roll, ...a.camera.position.toArray(), ...a.camera.quaternion.toArray()]).toEqual(before);
    a.tunnel.update({ level: 1, mid: 1 }, 100, 0);
    expect(a.tunnel.tubeRotation - before[1]).toBeLessThan(.0361);
    a.tunnel.roll = Math.PI * 2 - .001;
    a.tunnel.update({}, 0, 0);
    const seamOrientation = a.camera.quaternion.clone();
    a.tunnel.update({}, 1 / 60, 0);
    expect(a.tunnel.roll).toBeLessThan(.002);
    expect(seamOrientation.angleTo(a.camera.quaternion)).toBeLessThan(.01);
    a.dispose(); b.dispose();
  });
  it("compounds two 50% increases into 2.25 times the original spin and steering rates", () => {
    const { tunnel, dispose } = setup();
    tunnel.update({ level: .8, mid: .6, bass: .7 }, .05, 0);
    expect(tunnel.tubeRotation).toBeCloseTo(.05 * (.22 + tunnel.audio.w * .10) * 2.25, 12);
    expect(tunnel.roll).toBeCloseTo(.05 * (.07 + tunnel.audio.y * .025) * 2.25, 12);
    expect(tunnel.motionTime).toBeCloseTo(.05 * (.75 + tunnel.audio.w * .25) * 2.25, 12);
    expect(tunnel.distance).toBeCloseTo(.05 * tunnel.speed, 12);
    dispose();
  });
  it("travels forward at a frame-rate independent speed, including across the loop seam", () => {
    const a = setup(), b = setup();
    const geometry = a.tunnel.mesh.geometry;
    for (let i = 0; i < 300; i++) a.tunnel.update({}, 1 / 30, 0);
    for (let i = 0; i < 1200; i++) b.tunnel.update({}, 1 / 120, 0);
    expect(a.tunnel.distance).toBeCloseTo(48, 8);
    expect(a.tunnel.distance).toBeCloseTo(b.tunnel.distance, 8);
    expect(a.camera.position.distanceTo(b.camera.position)).toBeLessThan(1e-8);
    expect(a.tunnel.mesh.geometry).toBe(geometry);
    expect(a.tunnel.mesh.material.side).toBe(THREE.BackSide);
    a.tunnel.distance = TUNNEL_RADIUS * Math.PI * 2 - .02;
    a.tunnel.update({}, 0, 0);
    const before = a.camera.position.clone(), rotation = a.camera.quaternion.clone();
    a.tunnel.update({}, 1 / 60, 0);
    expect(before.distanceTo(a.camera.position)).toBeLessThan(.1);
    expect(rotation.angleTo(a.camera.quaternion)).toBeLessThan(.005);
    a.dispose(); b.dispose();
  });
  it("smooths sound response and bounds speed after a long stall", () => {
    const test = setup(), { tunnel } = test;
    tunnel.update({ bass: 1, mid: 1, high: 1, level: 1, beat: 1 }, 10, 1);
    expect(tunnel.distance).toBeLessThan(.3);
    expect(tunnel.audio.x).toBeGreaterThan(0); expect(tunnel.audio.x).toBeLessThan(1);
    expect(tunnel.pulse).toBeGreaterThan(0); expect(tunnel.pulse).toBeLessThan(1);
    expect(tunnel.uniforms.uA.value.getHex()).toBe(0xff473a);
    for (let i = 0; i < 300; i++) tunnel.update({ level: 1, bass: 1 }, .05, 0);
    expect(tunnel.speed).toBeLessThanOrEqual(8.4);
    expect(tunnel.speed).toBeGreaterThan(4.8);
    test.dispose();
  });
  it("allocates only on selection, pauses across resizing, and disposes its target", () => {
    const renderer = { getRenderTarget: () => null, setRenderTarget() {}, render() {} };
    const scenes = new ProceduralScenes(renderer, new THREE.Texture(), 42);
    scenes.resize(2400, 1600, "auto");
    expect(scenes.entries.size).toBe(0);
    scenes.render(13, {}, .016, 0, [], false);
    const entry = scenes.entries.get(13), distance = entry.tunnel.distance, rotation = entry.camera.quaternion.toArray();
    expect(entry.target.width).toBe(1000);
    scenes.resize(1600, 1000, "ultra");
    scenes.render(13, { level: 1 }, 1, 0, [], true);
    expect(entry.tunnel.distance).toBe(distance);
    expect(entry.camera.quaternion.toArray()).toEqual(rotation);
    scenes.render(0, {}, 1, 0, [], false);
    expect(entry.tunnel.distance).toBe(distance);
    scenes.dispose(); expect(scenes.entries.size).toBe(0);
  });
});
