export const CITY_METER_COUNT = 32;

// A small shared texture drives the existing emissive building strips. Attack,
// release and peak-hold depend on seconds, not the display's frame rate.
export class CityMeters {
  constructor() {
    this.levels = new Float32Array(CITY_METER_COUNT);
    this.peaks = new Float32Array(CITY_METER_COUNT);
    this.holds = new Float32Array(CITY_METER_COUNT);
    this.data = new Uint8Array(CITY_METER_COUNT * 4);
  }
  update(spectrum, delta, rawFrequency = false) {
    const dt = Number.isFinite(delta) ? Math.max(0, Math.min(.05, delta)) : 0;
    if (!dt) return false;
    for (let band = 0; band < CITY_METER_COUNT; band++) {
      // Read the response-scaled analyser directly, bypassing the visual spring.
      // Quadratic spacing gives the musical low/mid range enough columns.
      const available = Math.max(0, Math.min(spectrum.length - 1, 700));
      const start = rawFrequency ? Math.max(1, Math.floor((band / CITY_METER_COUNT) ** 2 * available))
        : Math.floor(band * spectrum.length / CITY_METER_COUNT);
      const end = Math.min(spectrum.length, Math.max(start + 1, rawFrequency
        ? Math.floor(((band + 1) / CITY_METER_COUNT) ** 2 * available)
        : Math.floor((band + 1) * spectrum.length / CITY_METER_COUNT)));
      let sum = 0;
      for (let i = start; i < end; i++) {
        const value = Number.isFinite(spectrum[i]) ? Math.max(0, Math.min(255, spectrum[i])) / 255 : 0;
        sum += value * value;
      }
      const energy = Math.sqrt(sum / Math.max(1, end - start));
      // Byte FFT is already logarithmic: expand its compressed loudness range
      // so quiet passages visibly recede instead of leaving nearly-full bars.
      const target = Math.min(1, Math.max(0, (energy - .08) / .82)) ** 1.65;
      const tau = target > this.levels[band] ? .022 : .12;
      this.levels[band] += (target - this.levels[band]) * (1 - Math.exp(-dt / tau));
      if (this.levels[band] >= this.peaks[band]) {
        this.peaks[band] = this.levels[band];this.holds[band] = .075;
      } else {
        const falling = Math.max(0, dt - this.holds[band]);
        this.holds[band] = Math.max(0, this.holds[band] - dt);
        this.peaks[band] = Math.max(this.levels[band], this.peaks[band] - falling * 2.2);
      }
      const offset = band * 4;
      this.data[offset] = Math.round(this.levels[band] * 255);
      this.data[offset + 1] = Math.round(this.peaks[band] * 255);
      this.data[offset + 3] = 255;
    }
    return true;
  }
}

export const cityMetersGLSL = /* glsl */ `
  // Object-space height keeps the fill anchored to the base of every building,
  // even while the world is streamed/rebased around the flying camera.
  float meterY=clamp((vLocal.y-uMeterBottom)/max(.001,uMeterTop-uMeterBottom),0.,1.);
  float around=(atan(vLocal.z,vLocal.x)/6.2831853+.5)*32.;
  float column=floor(around);
  float band=mod(column+floor(vIdentity.y*32.),32.);
  vec2 meter=texture2D(uCityMeters,vec2((band+.5)/32.,.5)).rg;
  float aa=max(fwidth(meterY),.0015);
  float fill=(1.-smoothstep(meter.r-aa,meter.r+aa,meterY))*step(.004,meter.r);
  float peak=(1.-smoothstep(.004,.004+aa,abs(meterY-meter.g)))*step(.008,meter.g);
  float cell=fract(meterY*40.);
  float gap=smoothstep(0.,max(.07,fwidth(meterY)*40.),cell);
  float tall=smoothstep(60.,95.,vBuildingHeight);
  float meterLight=mix(1.,.025+fill*gap,tall);
  vec3 meterTint=mix(tint,mix(uCyan,uPink,meterY*.8),tall*.75);
`;
