import * as THREE from "three";

// Blend linear HDR scene images before the existing bloom/tone-map pipeline.
// Only the transition needs two scene renders; buffers are allocated lazily.
export class SceneMixer {
  constructor(renderer) {
    this.renderer = renderer; this.width = 2; this.height = 2;
    this.targets = [0, 1].map(() => new THREE.WebGLRenderTarget(2, 2, {
      type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false,
    }));
    this.uniforms = { uPrevious: { value: this.targets[0].texture }, uCurrent: { value: this.targets[1].texture }, uBlend: { value: 1 } };
    this.material = new THREE.ShaderMaterial({ uniforms: this.uniforms, depthTest: false, depthWrite: false,
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position, 1.); }`,
      fragmentShader: `varying vec2 vUv; uniform sampler2D uPrevious, uCurrent; uniform float uBlend;
        void main() { gl_FragColor = vec4(mix(texture2D(uPrevious, vUv).rgb, texture2D(uCurrent, vUv).rgb, uBlend), 1.); }`,
    });
    this.scene = new THREE.Scene(); this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material); this.scene.add(this.quad);
  }
  resize(width, height) { this.width = width; this.height = height; }
  render(scene, camera, weight, prepare) {
    const previousTarget = this.renderer.getRenderTarget();
    try {
      this.targets.forEach((target, index) => {
        if (target.width !== this.width || target.height !== this.height) target.setSize(this.width, this.height);
        prepare(index);
        this.renderer.setRenderTarget(target); this.renderer.render(scene, camera);
      });
      this.uniforms.uBlend.value = weight;
    } finally { this.renderer.setRenderTarget(previousTarget); }
  }
  dispose() {
    this.targets.forEach(target => target.dispose()); this.quad.geometry.dispose(); this.material.dispose();
  }
}
