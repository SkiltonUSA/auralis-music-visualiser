import * as THREE from 'three';
import { AuraScene } from './aura-scene.js';

// A private, lower-resolution Aura pass: no shared clocks with Horizon or the
// standalone scene, and no extra sampler in the main scene compositor.
export class CityAura {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.Camera();
    this.effect = new AuraScene(this.scene);
    this.target = new THREE.WebGLRenderTarget(2, 2, {
      type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false,
    });
    this.dirty = true;
  }
  resize(width, height, quality) {
    const cap = { auto: 640, high: 800, ultra: 1000 }[quality] || 640;
    // Fixed celestial canvas: resizing the window must not stretch or move the
    // Aura's features around the horizon. Only its texture resolution changes.
    const w = Math.max(2, Math.round(Math.min(cap, Math.max(width, height))));
    const h = Math.max(2, Math.round(w / 2));
    if (w !== this.target.width || h !== this.target.height || quality !== this.quality) this.dirty = true;
    this.quality = quality;
    this.target.setSize(w, h);
    this.effect.resize(w, h, quality);
  }
  update(audio, delta, palette) {
    const previousPalette = this.effect.uniforms.uPalette.value;
    const previousTime = this.effect.motion.time;
    this.effect.update(audio, delta, palette);
    this.dirty ||= previousTime !== this.effect.motion.time || previousPalette !== this.effect.uniforms.uPalette.value;
  }
  render(renderer) {
    if (!this.dirty) return;
    const previous = renderer.getRenderTarget();
    try {
      renderer.setRenderTarget(this.target);
      renderer.render(this.scene, this.camera);
      this.dirty = false;
    } finally { renderer.setRenderTarget(previous); }
  }
  dispose() {
    this.target.dispose();
    this.effect.mesh.geometry.dispose();
    this.effect.material.dispose();
  }
}
