// The shared spectrum already has quadratic frequency spacing. Start beyond
// its DC plateau and sample it linearly; a second square repeats bass bins.
export const BACKDROP_BAND_MIN = .065;
export const BACKDROP_BAND_MAX = .94;
export const backdropSpectrumGLSL = /* glsl */ `
  float backdropBand(float id,float columns) {
    return mix(${BACKDROP_BAND_MIN},${BACKDROP_BAND_MAX},id/max(1.,columns-1.));
  }
`;
