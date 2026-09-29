import * as THREE from "three";

// Keep the camera and GPU ribbon on exactly the same continuous route.
export const ROAD = { bendA: .012, bendB: .027, widthA: 16, widthB: 5, hillA: .008, hillB: .022 };
export const roadCenter = (s, phase) => Math.sin(s * ROAD.bendA + phase) * ROAD.widthA + Math.sin(s * ROAD.bendB + phase * 1.7) * ROAD.widthB;
export const roadElevation = (s, phase) => Math.sin(s * ROAD.hillA + phase) * 1.4 + Math.sin(s * ROAD.hillB) * .4;
const routeGLSL = /* glsl */ `
  float roadX(float s) { return sin(s * ${ROAD.bendA} + uPhase) * ${ROAD.widthA.toFixed(1)} + sin(s * ${ROAD.bendB} + uPhase * 1.7) * ${ROAD.widthB.toFixed(1)}; }
  float roadY(float s) { return sin(s * ${ROAD.hillA} + uPhase) * 1.4 + sin(s * ${ROAD.hillB}) * .4; }
`;
const noiseGLSL = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
    return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + 1.), f.x), f.y);
  }
  float fbm(vec2 p) {
    float value = 0., weight = .5;
    for (int i = 0; i < 4; i++) {
      value += noise(p) * weight;
      p = mat2(.8, -.6, .6, .8) * p * 2.03 + 7.1; weight *= .5;
    }
    return value;
  }
`;
const roadVertex = /* glsl */ `
  uniform float uTravel, uPhase;
  uniform vec4 uAudio;
  varying vec2 vRoad;
  varying float vDistance, vHeight;
  ${routeGLSL}
  ${noiseGLSL}
  void main() {
    float s = uTravel - position.z;
    float shoulder = smoothstep(7., 30., abs(position.x));
    float hills = pow(noise(vec2(position.x * .065 + uPhase, s * .022)), 1.6) * 14.;
    hills += noise(vec2(position.x * .14, s * .06)) * 2.;
    vec3 p = vec3(position.x + roadX(s), roadY(s) + hills * shoulder, position.z);
    vRoad = vec2(position.x, s); vDistance = -position.z; vHeight = hills * shoulder;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
  }
`;
const roadFragment = /* glsl */ `
  uniform vec4 uAudio;
  uniform vec3 uPink, uCyan;
  varying vec2 vRoad;
  varying float vDistance, vHeight;
  float stroke(float value, float width) {
    float aa = max(fwidth(value), .008);
    return 1. - smoothstep(width, width + aa, abs(value));
  }
  void main() {
    float x = abs(vRoad.x), s = vRoad.y;
    float road = 1. - smoothstep(4.8, 4.9, x);
    vec2 cell = abs(fract(vRoad / vec2(4., 8.) + .5) - .5) * vec2(4., 8.);
    float grid = max(stroke(cell.x, .026), stroke(cell.y, .04));
    grid *= 1. - smoothstep(110., 290., vDistance);
    vec3 terrain = vec3(.012, .0015, .027) + uPink * grid * (.42 + uAudio.y * .35);
    terrain += uCyan * grid * clamp(vHeight * .028, 0., .32);
    float edge = stroke(x - 4.72, .035);
    float edgeGlow = exp(-abs(x - 4.72) * 5.) * .12;
    float curb = stroke(x - 5.12, .065) * step(.45, fract(s / 3.));
    float dash = smoothstep(.06, .1, fract(s / 9.)) * (1. - smoothstep(.48, .52, fract(s / 9.)));
    float lane = stroke(x - 1.58, .033) * dash;
    float reflection = exp(-x * .6) * (.025 + .035 * sin(s * .45) * sin(s * .45));
    vec3 asphalt = vec3(.004, .003, .012) + uPink * reflection;
    vec3 color = mix(terrain, asphalt, road);
    color += uPink * (edge * 1.9 + edgeGlow + curb * .5) * (1. + uAudio.x * .4);
    color += uCyan * lane * (1.15 + uAudio.z * .55);
    color = mix(color, vec3(.045, .003, .065), smoothstep(170., 315., vDistance));
    gl_FragColor = vec4(color, 1.);
  }
`;
const skyVertex = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }
`;
const skyFragment = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime, uPhase;
  uniform vec4 uAudio;
  ${noiseGLSL}
  void main() {
    vec2 skyUv = (vUv - .5) * vec2(2.4, 2.) + .5;
    float horizon = exp(-pow((skyUv.y - .5) * 10., 2.));
    vec3 color = mix(vec3(.004, .001, .017), vec3(.095, .005, .11), horizon);
    vec2 p = skyUv * vec2(650., 360.);
    float star = step(.996, hash(floor(p))) * (1. - smoothstep(.02, .14, length(fract(p) - .5)));
    color += vec3(.48, .65, 1.) * star * smoothstep(.5, .65, skyUv.y);
    // Broad, slowly shearing cloud banks, restricted to the sky. The sunset
    // remains a separate depth-tested object in front of this distant layer.
    vec2 cloudUv = skyUv * vec2(9., 19.) + vec2(-uTime * .012 + uPhase, uTime * .003);
    float curl = fbm(cloudUv * .65 + 4.7);
    float body = fbm(cloudUv + vec2(curl * 1.6, curl * .6));
    float thin = fbm(cloudUv * 1.7 + vec2(-uTime * .009, 13.));
    float cloud = smoothstep(.36, .7, body * .8 + thin * .2);
    float altitude = smoothstep(.512, .565, skyUv.y) * (1. - smoothstep(.83, .97, skyUv.y));
    cloud *= altitude;
    vec3 cloudColor = mix(vec3(.045, .042, .075), vec3(.19, .12, .19), smoothstep(.4, .68, body));
    cloudColor += vec3(.07, .015, .035) * (1. - smoothstep(.54, .75, skyUv.y)) * (.75 + uAudio.z * .25);
    color = mix(color, cloudColor, cloud * .8);
    gl_FragColor = vec4(color, 1.);
  }
`;
const sunFragment = /* glsl */ `
  varying vec2 vUv;
  uniform vec4 uAudio;
  void main() {
    vec2 p = (vUv - .5) * 2.;
    float r = length(p);
    float disk = 1. - smoothstep(.7, .71, r);
    float stripe = smoothstep(.15, .21, fract((p.y + .8) * 8.));
    stripe = mix(stripe, 1., smoothstep(-.05, .22, p.y));
    vec3 color = mix(vec3(1.4, .015, .34), vec3(1.3, .48, .025), smoothstep(-.7, .7, p.y));
    float halo = exp(-r * r * 4.) * .14;
    gl_FragColor = vec4(color * (1. + uAudio.x * .14), disk * stripe * .92 + halo * (1. - disk));
  }
`;
const postVertex = /* glsl */ `
  varying float vDistance;
  varying float vBand;
  void main() {
    vec4 p = instanceMatrix * vec4(position, 1.);
    vDistance = -p.z; vBand = fract(abs(p.z) * .037);
    gl_Position = projectionMatrix * modelViewMatrix * p;
  }
`;
const postFragment = /* glsl */ `
  varying float vDistance, vBand;
  uniform sampler2D uSpectrum;
  uniform vec3 uCyan;
  void main() {
    float band = texture2D(uSpectrum, vec2(vBand, .5)).r;
    vec3 color = uCyan * (.85 + band * 1.4);
    color = mix(color, vec3(.045, .003, .065), smoothstep(130., 290., vDistance));
    gl_FragColor = vec4(color, 1.);
  }
`;

const smokeFragment = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime, uSeed, uOpacity;
  uniform vec3 uPink, uCyan;
  ${noiseGLSL}
  void main() {
    // Constant lateral advection makes the wisps blow across the lanes,
    // independently of the camera's forward travel.
    vec2 p = vUv * vec2(5.5, 2.4) + vec2(-uTime * .32 + uSeed, uTime * .025);
    float curl = fbm(p * .7 + 9.);
    float body = fbm(p + vec2(curl * 1.4, curl * .7));
    float density = smoothstep(.25, .76, body);
    float edge = 1. - smoothstep(.25, 1., length((vUv - .5) * vec2(2., 2.1)));
    float wisps = .65 + .35 * noise(p * vec2(1.3, 2.7));
    vec3 grey = vec3(.15 + density * .16);
    grey += mix(uPink, uCyan, vUv.x) * .028;
    gl_FragColor = vec4(grey, density * edge * wisps * uOpacity);
  }
`;

export class RoadAtmosphere {
  constructor(scene, sharedUniforms, random) {
    this.uniforms = sharedUniforms;
    const geometry = new THREE.PlaneGeometry(26, 3.2);
    this.sheets = Array.from({ length: 6 }, () => {
      const uniforms = { uTime: sharedUniforms.uTime, uPink: sharedUniforms.uPink, uCyan: sharedUniforms.uCyan,
        uSeed: { value: random() * 100 }, uOpacity: { value: 0 } };
      const mesh = new THREE.Mesh(geometry, new THREE.ShaderMaterial({ vertexShader: skyVertex, fragmentShader: smokeFragment,
        uniforms, transparent: true, depthWrite: false, blending: THREE.NormalBlending }));
      scene.add(mesh);
      return { mesh, height: .9 + random() * .5, strength: .28 + random() * .12, phase: random() * Math.PI * 2 };
    });
  }
  update(travel, phase, level) {
    for (let i = 0; i < this.sheets.length; i++) {
      const sheet = this.sheets[i];
      // Recycle only behind the viewer; both ends fade before wrapping.
      const distance = THREE.MathUtils.euclideanModulo(i * 40 - travel + 16, 240) - 16;
      const s = travel + distance;
      const nearFade = THREE.MathUtils.smoothstep(distance, 5, 18);
      const farFade = 1 - THREE.MathUtils.smoothstep(distance, 170, 224);
      const breath = .8 + Math.sin(this.uniforms.uTime.value * .35 + sheet.phase) * .2;
      const opacity = nearFade * farFade * sheet.strength * breath * (.9 + level * .1);
      sheet.mesh.position.set(roadCenter(s, phase), roadElevation(s, phase) + sheet.height, -distance);
      sheet.mesh.material.uniforms.uOpacity.value = opacity;
      sheet.mesh.visible = opacity > .001;
    }
  }
}

export class NeonRoad {
  constructor(scene, camera, spectrum, random) {
    this.camera = camera; this.phase = random() * Math.PI * 2;
    this.travel = 0; this.time = 0; this.speed = 13; this.audio = new THREE.Vector4(0, 0, 0, 0);
    this.target = new THREE.Vector3(); this.look = new THREE.Vector3(); this.initialized = false;
    this.matrix = new THREE.Matrix4(); this.position = new THREE.Vector3();
    this.rotation = new THREE.Quaternion(); this.scale = new THREE.Vector3(1, 1, 1);
    this.uniforms = { uTravel: { value: 0 }, uTime: { value: 0 }, uPhase: { value: this.phase }, uAudio: { value: this.audio },
      uPink: { value: new THREE.Color(0xff168e) }, uCyan: { value: new THREE.Color(0x18deff) }, uSpectrum: { value: spectrum } };
    camera.fov = 62; camera.far = 1400; camera.updateProjectionMatrix();
    const ground = new THREE.PlaneGeometry(220, 328, 100, 180); ground.rotateX(-Math.PI / 2); ground.translate(0, 0, -152);
    const road = new THREE.Mesh(ground, new THREE.ShaderMaterial({ vertexShader: roadVertex, fragmentShader: roadFragment, uniforms: this.uniforms }));
    road.frustumCulled = false; scene.add(road);
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(2400, 1200), new THREE.ShaderMaterial({ vertexShader: skyVertex, fragmentShader: skyFragment, uniforms: this.uniforms }));
    sky.position.set(0, 0, -450); scene.add(sky);
    this.sun = new THREE.Mesh(new THREE.PlaneGeometry(115, 115), new THREE.ShaderMaterial({ vertexShader: skyVertex, fragmentShader: sunFragment,
      uniforms: this.uniforms, transparent: true, depthWrite: false }));
    this.sun.position.set(0, 32, -310); scene.add(this.sun);
    this.posts = new THREE.InstancedMesh(new THREE.BoxGeometry(.08, 1.3, .08), new THREE.ShaderMaterial({
      vertexShader: postVertex, fragmentShader: postFragment, uniforms: this.uniforms }), 64);
    this.posts.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.posts.frustumCulled = false;
    scene.add(this.posts);
    this.atmosphere = new RoadAtmosphere(scene, this.uniforms, random);
    this.update({}, 0, 0);
  }
  update(audio, delta, palette) {
    const dt = Math.max(0, Math.min(.05, delta)), ease = 1 - Math.exp(-dt * 3);
    [audio.bass || 0, audio.mid || 0, audio.high || 0, audio.level || 0].forEach((value, i) => {
      this.audio.setComponent(i, THREE.MathUtils.lerp(this.audio.getComponent(i), THREE.MathUtils.clamp(value, 0, 1), ease));
    });
    const targetSpeed = 13 + this.audio.w * 6;
    this.speed += (targetSpeed - this.speed) * (1 - Math.exp(-dt * .8));
    this.travel += this.speed * dt;
    this.time += dt;
    this.uniforms.uTravel.value = this.travel;
    this.uniforms.uTime.value = this.time;
    const colors = [[0xff168e, 0x18deff], [0xff703a, 0xbe62ff], [0x19e9c7, 0x7384ff], [0xff5042, 0xffbc4a]][palette] || [0xff168e, 0x18deff];
    this.uniforms.uPink.value.setHex(colors[0]); this.uniforms.uCyan.value.setHex(colors[1]);
    const s = this.travel;
    this.camera.position.set(roadCenter(s, this.phase), roadElevation(s, this.phase) + 2.2, 0);
    this.target.set(roadCenter(s + 26, this.phase), roadElevation(s + 26, this.phase) + 1.45, -26);
    if (!this.initialized) { this.look.copy(this.target); this.initialized = true; }
    else this.look.lerp(this.target, 1 - Math.exp(-dt * 2.4));
    this.camera.lookAt(this.look);
    this.sun.position.x = roadCenter(s + 250, this.phase);
    for (let i = 0; i < 32; i++) {
      const distance = THREE.MathUtils.euclideanModulo(i * 10 - s, 320) - 6;
      const world = s + distance;
      for (let side = 0; side < 2; side++) {
        this.position.set(roadCenter(world, this.phase) + (side ? 5.35 : -5.35), roadElevation(world, this.phase) + .65, -distance);
        this.matrix.compose(this.position, this.rotation, this.scale);
        this.posts.setMatrixAt(i * 2 + side, this.matrix);
      }
    }
    this.posts.instanceMatrix.needsUpdate = true;
    this.atmosphere.update(this.travel, this.phase, this.audio.w);
  }
}
