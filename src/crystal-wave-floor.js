import * as THREE from "three";
import { HorizonWaves, HORIZON_WAVE_COUNT, HORIZON_WAVE_SAMPLES, horizonWavesGLSL } from "./horizon-waves.js";

// Reuse Horizon's captured audio shapes and approaching-line projection, but
// render inside the 3D scene so crystals and foreground smoke cover the floor.
export class CrystalWaveFloor {
  constructor(scene) {
    this.waves = new HorizonWaves();
    this.texture = new THREE.DataTexture(this.waves.data, HORIZON_WAVE_SAMPLES, HORIZON_WAVE_COUNT, THREE.RedFormat);
    this.texture.minFilter = this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false; this.texture.needsUpdate = true;
    this.horizon = new THREE.Vector3();
    this.uniforms = {
      uResolution: { value: new THREE.Vector2(2, 2) },
      uBaseline: { value: -.35 },
      uHorizonWaveforms: { value: this.texture },
      uHorizonLines: { value: this.waves.lines },
      uA: { value: new THREE.Color() }, uB: { value: new THREE.Color() },
    };
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthTest: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, .99999, 1.);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform vec2 uResolution;
        uniform float uBaseline;
        uniform vec3 uA, uB;
        uniform sampler2D uHorizonWaveforms;
        uniform vec4 uHorizonLines[${HORIZON_WAVE_COUNT}];
        const float uPalette = 1.;
        vec3 chroma(float phase, float brightness) {
          return mix(uA, uB, clamp((phase - .16) / .3, 0., 1.)) * brightness;
        }
        ${horizonWavesGLSL}
        void main() {
          vec2 p = (vUv * 2. - 1.) * uResolution / min(uResolution.x, uResolution.y);
          gl_FragColor = vec4(horizonWaves(p, uBaseline) * .7, 1.);
        }
      `,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
    scene.add(this.mesh);
  }
  resize(width, height) { this.uniforms.uResolution.value.set(width, height); }
  update(audio, delta, colors, camera) {
    if (delta > 0 && this.waves.update(audio, delta)) this.texture.needsUpdate = true;
    this.uniforms.uA.value.setHex(colors[0]); this.uniforms.uB.value.setHex(colors[1]);
    // Follow the lower aurora hem in screen space, including portrait aspect
    // ratios and the scene's gentle camera movement.
    camera.updateMatrixWorld();
    this.horizon.set(0, -3.7, -12.5).project(camera);
    const resolution = this.uniforms.uResolution.value;
    this.uniforms.uBaseline.value = this.horizon.y * resolution.y / Math.min(resolution.x, resolution.y);
  }
  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.texture.dispose();
  }
}
