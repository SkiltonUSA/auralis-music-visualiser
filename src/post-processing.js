import * as THREE from "three";

const passVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const prefilterFragment = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uSource;
  uniform vec2 uTexel;
  uniform float uThreshold;
  uniform float uKnee;

  void main() {
    vec3 color = texture2D(uSource, vUv + uTexel * vec2(-1., -1.)).rgb;
    color += texture2D(uSource, vUv + uTexel * vec2(1., -1.)).rgb;
    color += texture2D(uSource, vUv + uTexel * vec2(-1., 1.)).rgb;
    color += texture2D(uSource, vUv + uTexel * vec2(1., 1.)).rgb;
    color *= .25;
    color = min(color, vec3(24.));
    float brightness = max(color.r, max(color.g, color.b));
    float soft = clamp(brightness - uThreshold + uKnee, 0., 2. * uKnee);
    soft = soft * soft / (4. * uKnee + .0001);
    float contribution = max(soft, brightness - uThreshold) / max(brightness, .0001);
    gl_FragColor = vec4(color * contribution, 1.);
  }
`;

const blurFragment = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uSource;
  uniform vec2 uDirection;

  void main() {
    vec3 color = texture2D(uSource, vUv).rgb * .227027;
    color += texture2D(uSource, vUv + uDirection * 1.384615).rgb * .316216;
    color += texture2D(uSource, vUv - uDirection * 1.384615).rgb * .316216;
    color += texture2D(uSource, vUv + uDirection * 3.230769).rgb * .070270;
    color += texture2D(uSource, vUv - uDirection * 3.230769).rgb * .070270;
    gl_FragColor = vec4(color, 1.);
  }
`;

const finalFragment = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uSource;
  uniform sampler2D uPrevious;
  uniform sampler2D uBloom;
  uniform vec2 uResolution;
  uniform float uTime;
  uniform float uImpact;
  uniform float uLevel;
  uniform float uBass;
  uniform float uMid;
  uniform float uHigh;
  uniform float uHistoryReady;
  uniform float uBloomStrength;
  uniform float uSceneFx;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float luma(vec3 color) {
    return dot(color, vec3(.2126, .7152, .0722));
  }

  vec3 shoulder(vec3 color) {
    const float knee = .72;
    vec3 rolled = mix(color, knee + (1. - knee) * (1. - exp(-(color - knee) / (1. - knee))), step(knee, color));
    float over = max(color.r, max(color.g, color.b));
    return mix(rolled, vec3(1.), smoothstep(2., 11., over) * .82);
  }

  void main() {
    vec2 center = vUv - .5;
    float edge = dot(center * vec2(uResolution.x / uResolution.y, 1.), center * vec2(uResolution.x / uResolution.y, 1.));
    float lensAmount = (.012 + uBass * .026 + uImpact * .034) * uSceneFx;
    vec2 lensUv = clamp(vUv + center * edge * lensAmount, .001, .999);
    vec2 split = center * edge * (1.4 + uImpact * 4.6) / uResolution.x * 4. * uSceneFx;

    vec3 current;
    current.r = texture2D(uSource, lensUv + split).r;
    current.g = texture2D(uSource, lensUv).g;
    current.b = texture2D(uSource, lensUv - split).b;

    float feedbackZoom = 1. + (.004 + uLevel * .008 + uBass * .009 + uImpact * .015) * uSceneFx;
    float feedbackAngle = (uMid * .004 + uImpact * .006) * (1. + edge * 3.) * uSceneFx;
    mat2 feedbackTurn = mat2(cos(feedbackAngle), -sin(feedbackAngle), sin(feedbackAngle), cos(feedbackAngle));
    vec2 historyUv = feedbackTurn * ((vUv - .5) / feedbackZoom) + .5;
    historyUv.x += sin(vUv.y * 18. + uTime * 1.7) * uHigh * .00045 * uSceneFx;
    historyUv = clamp(historyUv, .001, .999);
    // Feedback contains the gamma-encoded final image. Decode before adding
    // it to the linear scene, otherwise dark smoke backgrounds turn grey.
    vec3 history = pow(max(texture2D(uPrevious, historyUv).rgb, 0.), vec3(2.2));
    float persistence = (.048 + uLevel * .07 + uHigh * .032 + uImpact * .025) * uHistoryReady;
    vec3 color = current + history * persistence;

    vec3 bloom = texture2D(uBloom, vUv).rgb;
    color += bloom * uBloomStrength;
    color += vec3(1., .16, .025) * luma(bloom) * (.14 + uImpact * .11);
    color *= 1.03 + uLevel * .12;
    color = shoulder(color);

    float vignette = smoothstep(.9, .18, length(center * vec2(1., .82)));
    color *= mix(1., vignette, .34);
    color += vec3(.96, .89, .78) * uImpact * .018 * uSceneFx;
    float bassGlow = smoothstep(.82, .0, length(center * vec2(1., uResolution.y / uResolution.x)));
    color += vec3(.35, .12, .62) * bassGlow * uBass * (.035 + uImpact * .04) * uSceneFx;

    vec2 ledCell = mod(gl_FragCoord.xy, vec2(6.)) - 3.;
    float ledDot = 1. - smoothstep(2., 7., dot(ledCell, ledCell));
    color *= mix(1., .78 + ledDot * .22, .022 + uHigh * .038);

    color = pow(max(color, 0.), vec3(1. / 2.2));
    float fine = hash21(gl_FragCoord.xy + fract(uTime * 13.37) * 991.) - .5;
    float coarse = hash21(floor(gl_FragCoord.xy / 2.) + fract(uTime * 7.13) * 619.) - .5;
    float midtone = .5 + 1.2 * luma(color) * (1. - luma(color));
    color += (fine * .62 + coarse * .38) * .027 * midtone;
    color += (hash21(gl_FragCoord.xy * 1.37 + uTime) - .5) / 255.;
    gl_FragColor = vec4(clamp(color, 0., 1.), 1.);
  }
`;

const copyFragment = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uSource;
  uniform float uOpacity;
  void main() { gl_FragColor = vec4(texture2D(uSource, vUv).rgb * uOpacity, 1.); }
`;

function makeTarget(width, height, type = THREE.HalfFloatType) {
  return new THREE.WebGLRenderTarget(Math.max(2, width), Math.max(2, height), {
    type,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
  });
}

export class PostProcessor {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);

    this.prefilterUniforms = {
      uSource: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uThreshold: { value: .7 },
      uKnee: { value: .45 },
    };
    this.prefilterMaterial = new THREE.ShaderMaterial({
      vertexShader: passVertex,
      fragmentShader: prefilterFragment,
      uniforms: this.prefilterUniforms,
      depthTest: false,
      depthWrite: false,
    });
    this.blurUniforms = { uSource: { value: null }, uDirection: { value: new THREE.Vector2() } };
    this.blurMaterial = new THREE.ShaderMaterial({
      vertexShader: passVertex,
      fragmentShader: blurFragment,
      uniforms: this.blurUniforms,
      depthTest: false,
      depthWrite: false,
    });
    this.finalUniforms = {
      uSource: { value: null },
      uPrevious: { value: null },
      uBloom: { value: null },
      uResolution: { value: new THREE.Vector2() },
      uTime: { value: 0 },
      uImpact: { value: 0 },
      uLevel: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uHigh: { value: 0 },
      uHistoryReady: { value: 0 },
      uBloomStrength: { value: .48 },
      uSceneFx: { value: 1 },
    };
    this.finalMaterial = new THREE.ShaderMaterial({
      vertexShader: passVertex,
      fragmentShader: finalFragment,
      uniforms: this.finalUniforms,
      depthTest: false,
      depthWrite: false,
    });
    this.copyUniforms = { uSource: { value: null }, uOpacity: { value: 1 } };
    this.copyMaterial = new THREE.ShaderMaterial({
      vertexShader: passVertex,
      fragmentShader: copyFragment,
      uniforms: this.copyUniforms,
      depthTest: false,
      depthWrite: false,
    });

    this.sceneTargets = [makeTarget(2, 2), makeTarget(2, 2)];
    this.bloomTargets = [makeTarget(2, 2), makeTarget(2, 2)];
    this.feedbackTargets = [makeTarget(2, 2), makeTarget(2, 2)];
    this.frameIndex = 0;
    this.historyReady = false;
    this.size = new THREE.Vector2(2, 2);
  }

  resize(width, height) {
    this.size.set(width, height);
    for (const target of this.sceneTargets) target.setSize(width, height);
    for (const target of this.feedbackTargets) target.setSize(width, height);
    const bloomWidth = Math.max(2, Math.round(width / 4));
    const bloomHeight = Math.max(2, Math.round(height / 4));
    for (const target of this.bloomTargets) target.setSize(bloomWidth, bloomHeight);
    this.historyReady = false;
    this.frameIndex = 0;
    const previousTarget = this.renderer.getRenderTarget();
    for (const target of [...this.sceneTargets, ...this.bloomTargets, ...this.feedbackTargets]) {
      this.renderer.setRenderTarget(target);
      this.renderer.clear();
    }
    this.renderer.setRenderTarget(previousTarget);
  }

  pass(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
  }

  resetHistory() { this.historyReady = false; }

  render(sourceScene, sourceCamera, audio, time, opacity = 1, sceneFx = 1) {
    const current = this.sceneTargets[this.frameIndex];
    const feedback = this.feedbackTargets[this.frameIndex];
    const previousFeedback = this.feedbackTargets[1 - this.frameIndex];

    this.renderer.setRenderTarget(current);
    this.renderer.render(sourceScene, sourceCamera);

    this.prefilterUniforms.uSource.value = current.texture;
    this.prefilterUniforms.uTexel.value.set(1 / this.size.x, 1 / this.size.y);
    this.pass(this.prefilterMaterial, this.bloomTargets[0]);

    const bloomSize = this.bloomTargets[0];
    this.blurUniforms.uSource.value = this.bloomTargets[0].texture;
    this.blurUniforms.uDirection.value.set(2.1 / bloomSize.width, 0);
    this.pass(this.blurMaterial, this.bloomTargets[1]);
    this.blurUniforms.uSource.value = this.bloomTargets[1].texture;
    this.blurUniforms.uDirection.value.set(0, 2.1 / bloomSize.height);
    this.pass(this.blurMaterial, this.bloomTargets[0]);
    this.blurUniforms.uSource.value = this.bloomTargets[0].texture;
    this.blurUniforms.uDirection.value.set(4.2 / bloomSize.width, 0);
    this.pass(this.blurMaterial, this.bloomTargets[1]);
    this.blurUniforms.uSource.value = this.bloomTargets[1].texture;
    this.blurUniforms.uDirection.value.set(0, 4.2 / bloomSize.height);
    this.pass(this.blurMaterial, this.bloomTargets[0]);

    const uniforms = this.finalUniforms;
    uniforms.uSource.value = current.texture;
    uniforms.uPrevious.value = previousFeedback.texture;
    uniforms.uBloom.value = this.bloomTargets[0].texture;
    uniforms.uResolution.value.copy(this.size);
    uniforms.uTime.value = time;
    uniforms.uImpact.value = audio.beat;
    uniforms.uLevel.value = audio.level;
    uniforms.uBass.value = audio.bass;
    uniforms.uMid.value = audio.mid;
    uniforms.uHigh.value = audio.high;
    uniforms.uHistoryReady.value = this.historyReady ? 1 : 0;
    uniforms.uBloomStrength.value = .42 + audio.bass * .2;
    uniforms.uSceneFx.value = sceneFx;
    this.pass(this.finalMaterial, feedback);
    this.copyUniforms.uSource.value = feedback.texture;
    // Fade after bloom, grain and tone mapping; keep feedback unfaded so the
    // envelope isn't compounded over successive frames.
    this.copyUniforms.uOpacity.value = opacity;
    this.pass(this.copyMaterial, null);

    this.frameIndex = 1 - this.frameIndex;
    this.historyReady = true;
  }
}
