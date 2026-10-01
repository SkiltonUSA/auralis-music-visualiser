// Adapted from the user-supplied shader (2026-09-30), whose source credits
// sabosugi: https://paypal.com/paypalme/sabosugi. No licence was supplied.
// Retains the structural volume and cinematic grade; the existing Valley
// camera supplies world-space rays instead of a second fullscreen camera.
export const VALLEY_SKY_STEPS = { auto: 24, high: 30, ultra: 36 };

export const valleySkyGLSL = /* glsl */ `
  uniform float uValleySkySteps;

  float valleySkyDensity(vec3 pos) {
    const mat3 basis=mat3(
      .388535087, .054921382, -.743402928,
      .441955127, 4.336973341, .258518454,
      .272087367, .174042493, -.021246185
    );
    return dot(cos(basis*pos),sin(.228033988*pos*basis));
  }

  vec3 valleySkyGrade(vec3 light) {
    const mat3 a=mat3(.59719,.07600,.02840,.35458,.90834,.13383,.04823,.01566,.83777);
    const mat3 b=mat3(1.60475,-.10208,-.00327,-.53108,1.10813,-.07276,-.07367,-.00605,1.07602);
    vec3 c=a*light;
    return max(vec3(0.),b*((c*(c+.0945786)-.000090537)/(c*(.783729*c+.4329510)+.238081)));
  }

  vec3 valleySky(vec3 worldRay,vec3 horizonColor) {
    // Fade into atmospheric distance, never draw over an intersected ridge.
    float coverage=smoothstep(-.025,.22,worldRay.y);
    if(coverage<.001)return horizonColor;
    // A distant overhead sheet, independent of the terrain's translation.
    // The bank and heading come from the same camera ray as the valley.
    vec3 direction=normalize(vec3(worldRay.x,worldRay.y+.18,worldRay.z));
    vec3 samplePos=vec3(2.8,-1.,uFlightTime*.38);
    vec3 light=vec3(0.);
    float stepScale=.5;
    float solidity=1.1+clamp(uBass,0.,1.)*.1;
    for(int i=0;i<36;i++) {
      if(float(i)>=uValleySkySteps)break;
      float fine=valleySkyDensity(samplePos*20.)/20.;
      float base=valleySkyDensity(samplePos);
      float height=sin(samplePos.z*2.+abs(samplePos.x)*.5)*.5;
      float distance=.005+abs(fine-base)*.7+abs(samplePos.y+height)*.4;
      samplePos+=direction*distance*stepScale;
      float phase=float(i)*stepScale-.4+length(samplePos.xz*.1)+2.;
      vec3 glow=1.+1.5*sin(phase+vec3(3.,1.5,.5));
      light+=glow*pow(1./max(distance,.005),solidity)*.15*stepScale;
    }
    // Keep quality changes from simply making the sky brighter. Reuse the
    // app's bloom/grain; no 4x supersampling or second post-processing stack.
    light*=2.2*(29./uValleySkySteps)*(.85+clamp(uLevel,0.,1.)*.3);
    vec3 clouds=clamp(.6*valleySkyGrade(light*light/1000.)-.025,0.,1.2);
    return mix(horizonColor,clouds*.55,coverage*.88);
  }
`;
