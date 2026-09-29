import * as THREE from "three";

// Adapted from isoteriksoftware/react-smoke (MIT), commit 8922733768cbee76c2aadedd7e57da8cc4af89c2.
// Its textured planes, shared Lambert materials, wind, rotation and bounded
// turbulence are implemented directly in Three.js, without a React runtime.
const PALETTES = [
  [0xae70ef, 0x58bed8, 0xdf80b9, 0x92a7ef],
  [0xb94b38, 0xbd833c, 0x8f4669, 0xdd9869],
  [0x379c96, 0x32648f, 0x6acbb8, 0x5673a6],
  [0xbdafa0, 0xc55227, 0x8e7e70, 0xe39757],
];
const seed = (i) => THREE.MathUtils.euclideanModulo(Math.sin(i * 127.1 + 311.7) * 43758.5453, 1);

export class SmokeClouds {
  constructor(renderer, texture) {
    this.renderer = renderer;
    this.texture = texture;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020309);
    this.scene.fog = new THREE.FogExp2(0x020309, .06);
    this.camera = new THREE.PerspectiveCamera(58, 1, .1, 40);
    this.camera.position.z = 7;
    this.scene.add(new THREE.AmbientLight(0x98a5cf, 1.1));
    this.light = new THREE.DirectionalLight(0xcbdfff, 2.4);
    this.light.position.set(-3, 4, 6);
    this.scene.add(this.light);
    this.geometry = new THREE.PlaneGeometry(3.8, 3.8);
    this.materials = PALETTES[0].map((color) => new THREE.MeshLambertMaterial({
      map: texture, emissiveMap: texture, color, transparent: true, opacity: .3, depthWrite: false,
    }));
    this.particles = Array.from({ length: 56 }, (_, index) => {
      const mesh = new THREE.Mesh(this.geometry, this.materials[index % 4]);
      mesh.position.set((seed(index) - .5) * 14, (seed(index + 80) - .5) * 9, seed(index + 160) * 9 - 6);
      mesh.rotation.z = seed(index + 240) * Math.PI * 2;
      const size = .8 + seed(index + 320) * .7;
      mesh.scale.setScalar(size);
      mesh.userData = { phase: seed(index + 400) * Math.PI * 2, size,
        velocity: new THREE.Vector3((seed(index + 480) - .5) * .25, (seed(index + 560) - .5) * .15, 0) };
      this.scene.add(mesh);
      return mesh;
    });
    this.target = new THREE.WebGLRenderTarget(2, 2, {
      type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false,
    });
    this.time = 0;
    this.level = 0;
    this.count = 28;
    this.palette = -1;
    this.ready = false;
  }
  resize(width, height, quality) {
    const maxWidth = { auto: 800, high: 1100, ultra: 1440 }[quality] || 800;
    const scale = Math.min(.65, maxWidth / Math.max(1, width));
    const w = Math.max(2, Math.round(width * scale)), h = Math.max(2, Math.round(height * scale));
    if (w !== this.target.width || h !== this.target.height) {
      this.target.setSize(w, h);
      this.ready = false;
    }
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.count = { auto: 28, high: 40, ultra: 56 }[quality] || 28;
    this.particles.forEach((particle, index) => { particle.visible = index < this.count; });
  }
  advance(audio, delta, palette) {
    const dt = Math.max(0, Math.min(delta, .05));
    this.time += dt;
    this.level += ((audio.level || 0) - this.level) * (1 - Math.exp(-dt * 2.5));
    const bass = audio.bass || 0, mid = audio.mid || 0, high = audio.high || 0;
    if (this.palette !== palette) {
      this.palette = palette;
      this.materials.forEach((material, index) => material.color.setHex((PALETTES[palette] || PALETTES[0])[index]));
    }
    this.materials.forEach((material, index) => {
      const energy = [bass, mid, high, this.level][index];
      material.opacity = (.28 + energy * .2) * 28 / this.count;
      material.emissive.copy(material.color).multiplyScalar(.35 + energy * .6);
    });
    this.light.intensity = 2.8 + this.level * 1.2;
    this.camera.position.x = Math.sin(this.time * .09) * .55;
    this.camera.position.y = Math.cos(this.time * .07) * .25;
    this.camera.lookAt(0, 0, -2);
    for (let i = 0; i < this.count; i++) {
      const particle = this.particles[i];
      const { velocity, phase, size } = particle.userData;
      // Continuous sinusoidal turbulence and musical wind, scaled by delta
      // rather than adding a fixed force per rendered frame.
      velocity.x += (Math.sin(this.time * .35 + phase) * (.07 + mid * .1) + .028) * dt;
      velocity.y += (Math.cos(this.time * .27 + phase * 2) * (.06 + high * .08) + this.level * .03) * dt;
      if (Math.abs(particle.position.x) > 7) velocity.x -= Math.sign(particle.position.x) * .6 * dt;
      if (Math.abs(particle.position.y) > 4.5) velocity.y -= Math.sign(particle.position.y) * .5 * dt;
      velocity.multiplyScalar(Math.exp(-dt * .2));
      velocity.clampScalar(-.48, .48);
      particle.position.addScaledVector(velocity, dt * (1 + this.level * .5));
      particle.rotation.z += dt * (.025 + mid * .035) * (i % 2 ? 1 : -1);
      particle.scale.setScalar(size * (1 + this.level * .08 + Math.sin(this.time * .3 + phase) * .035));
    }
  }
  render(audio, delta, palette, paused) {
    if (!paused) this.advance(audio, delta, palette);
    if (paused && this.ready) return;
    const previous = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(previous);
    this.ready = true;
  }
  dispose() {
    this.target.dispose();
    this.geometry.dispose();
    this.materials.forEach((material) => material.dispose());
    this.texture.dispose();
  }
}
