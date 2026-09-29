import * as THREE from "three";

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }
`;
const fragmentShader = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime, uSeed, uOpacity, uDirection;
  uniform vec3 uLow, uRock;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
    return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + 1.), f.x), f.y);
  }
  float fbm(vec2 p) {
    float value = 0., weight = .5;
    for (int i = 0; i < 4; i++) { value += noise(p) * weight; p = mat2(.8, -.6, .6, .8) * p * 2.03 + 7.1; weight *= .5; }
    return value;
  }
  void main() {
    vec2 p = vUv * vec2(5., 2.2) + vec2(-uTime * .24 * uDirection + uSeed, uTime * .025);
    float curl = fbm(p * .65 + 11.);
    float body = fbm(p + vec2(curl * 1.8, curl * .7));
    float density = smoothstep(.26, .7, body);
    float edge = 1. - smoothstep(.18, 1., length((vUv - .5) * vec2(2., 2.15)));
    float strands = .6 + .4 * noise(p * vec2(1.1, 3.1) + curl);
    vec3 smoke = vec3(.13 + density * .14) + mix(uLow, uRock, vUv.x) * .055;
    gl_FragColor = vec4(smoke, density * strands * edge * uOpacity);
  }
`;

export const FLYOVER_SMOKE_SPAN = 420;

export class FlyoverSmoke {
  constructor(scene, sharedUniforms, random, centerAt) {
    this.uniforms = sharedUniforms; this.centerAt = centerAt;
    const geometry = new THREE.PlaneGeometry(1, 1);
    this.sheets = Array.from({ length: 6 }, (_, index) => {
      const direction = index % 2 ? -1 : 1;
      const uniforms = { uTime: sharedUniforms.uTime, uLow: sharedUniforms.uLow, uRock: sharedUniforms.uRock,
        uSeed: { value: random() * 100 }, uOpacity: { value: 0 }, uDirection: { value: direction } };
      const mesh = new THREE.Mesh(geometry, new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms,
        transparent: true, depthTest: true, depthWrite: false, blending: THREE.NormalBlending }));
      mesh.scale.set(120 + random() * 40, 24 + random() * 12, 1);
      mesh.rotation.z = (random() - .5) * .14;
      scene.add(mesh);
      return { mesh, direction, height: 15 + random() * 22, offset: (random() - .5) * 26,
        strength: .34 + random() * .12, phase: random() * Math.PI * 2 };
    });
  }
  update(travel, level) {
    const time = this.uniforms.uTime.value;
    for (let i = 0; i < this.sheets.length; i++) {
      const sheet = this.sheets[i];
      const distance = THREE.MathUtils.euclideanModulo(i * 70 - travel + 30, FLYOVER_SMOKE_SPAN) - 30;
      // Until recycling, travel + distance is a fixed world-space location.
      // Forward parallax comes from the camera; smoke drifts only sideways.
      const z = -(travel + distance);
      const wind = Math.sin(time * .17 + sheet.phase) * 13 * sheet.direction;
      sheet.mesh.position.set(this.centerAt(z) + sheet.offset + wind,
        sheet.height + Math.sin(time * .12 + sheet.phase) * 2, z);
      const nearFade = THREE.MathUtils.smoothstep(distance, 12, 48);
      const farFade = 1 - THREE.MathUtils.smoothstep(distance, 280, 370);
      const breath = .88 + Math.sin(time * .3 + sheet.phase) * .12;
      const opacity = nearFade * farFade * sheet.strength * breath * (.9 + Math.max(0, Math.min(1, level)) * .1);
      sheet.mesh.material.uniforms.uOpacity.value = opacity;
      sheet.mesh.visible = opacity > .001;
    }
  }
}
