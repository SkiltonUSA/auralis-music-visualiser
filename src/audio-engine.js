const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export const FREQUENCY_RANGES = Object.freeze({
  sub: [25, 70],
  bass: [70, 180],
  lowMid: [180, 520],
  mid: [520, 2400],
  presence: [2400, 6200],
  air: [6200, 12000],
});

export function averageBand(data, sampleRate, fftSize, lowHz, highHz) {
  const hzPerBin = sampleRate / fftSize;
  const start = Math.max(0, Math.floor(lowHz / hzPerBin));
  const end = Math.min(data.length - 1, Math.ceil(highHz / hzPerBin));
  let total = 0;
  let weight = 0;
  for (let index = start; index <= end; index += 1) {
    const position = (index - start) / Math.max(1, end - start);
    const shapedWeight = 0.65 + Math.sin(position * Math.PI) * 0.35;
    total += (data[index] / 255) * shapedWeight;
    weight += shapedWeight;
  }
  return weight ? total / weight : 0;
}

export function measureFrequencyRanges(data, sampleRate, fftSize, ranges = FREQUENCY_RANGES) {
  return Object.fromEntries(
    Object.entries(ranges).map(([name, [lowHz, highHz]]) => [name, averageBand(data, sampleRate, fftSize, lowHz, highHz)]),
  );
}

export function estimateBpm(intervals) {
  const usable = intervals.filter((interval) => interval >= 250 && interval <= 2000).sort((a, b) => a - b);
  if (usable.length < 2) return 0;
  const middle = Math.floor(usable.length / 2);
  const median = usable.length % 2 ? usable[middle] : (usable[middle - 1] + usable[middle]) / 2;
  let bpm = 60000 / median;
  while (bpm < 70) bpm *= 2;
  while (bpm > 170) bpm /= 2;
  return Math.round(bpm);
}

export class AudioEngine {
  constructor(player) {
    this.player = player;
    this.context = null;
    this.analyser = null;
    this.source = null;
    this.fileSource = null;
    this.outputConnected = false;
    this.stream = null;
    this.fileUrl = null;
    this.frequency = new Uint8Array(1024);
    this.waveform = new Uint8Array(2048).fill(128);
    this.previousFrequency = new Uint8Array(1024);
    this.fluxHistory = [];
    this.mode = "demo";
    this.sensitivity = 1.2;
    this.demoStartedAt = performance.now();
    this.demoBeatIndex = -1;
    this.lastBeatAt = 0;
    this.beatTimes = [];
    this.beatCount = 0;
    this.estimatedBpm = 0;
    this.values = {
      level: 0, bass: 0, mid: 0, high: 0, beat: 0, peak: 0, transient: false, bpm: 0, beatCount: 0, barBeat: 0,
      bands: { sub: 0, bass: 0, lowMid: 0, mid: 0, presence: 0, air: 0 },
    };
  }

  async ensureContext() {
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: "interactive" });
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.62;
      this.analyser.minDecibels = -92;
      this.analyser.maxDecibels = -18;
      this.frequency = new Uint8Array(this.analyser.frequencyBinCount);
      this.waveform = new Uint8Array(this.analyser.fftSize);
      this.previousFrequency = new Uint8Array(this.analyser.frequencyBinCount);
    }
    if (this.context.state === "suspended") await this.context.resume();
  }

  disconnectSource() {
    this.source?.disconnect();
    this.source = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.player.pause();
    if (this.fileUrl) URL.revokeObjectURL(this.fileUrl);
    this.fileUrl = null;
  }

  resetTiming() {
    this.lastBeatAt = 0;
    this.beatTimes = [];
    this.beatCount = 0;
    this.estimatedBpm = 0;
  }

  async useMicrophone() {
    await this.ensureContext();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { autoGainControl: false, echoCancellation: false, noiseSuppression: false },
    });
    this.disconnectSource();
    this.stream = stream;
    this.source = this.context.createMediaStreamSource(stream);
    this.source.connect(this.analyser);
    this.mode = "microphone";
    this.resetTiming();
    return stream.getAudioTracks()[0]?.label || "Mac microphone";
  }

  async useFile(file) {
    await this.ensureContext();
    this.disconnectSource();
    this.fileUrl = URL.createObjectURL(file);
    this.player.src = this.fileUrl;
    this.fileSource ||= this.context.createMediaElementSource(this.player);
    this.source = this.fileSource;
    this.source.connect(this.analyser);
    if (!this.outputConnected) {
      this.analyser.connect(this.context.destination);
      this.outputConnected = true;
    }
    await this.player.play();
    this.mode = "file";
    this.resetTiming();
    return file.name.replace(/\.[^/.]+$/, "");
  }

  useDemo() {
    this.disconnectSource();
    this.mode = "demo";
    this.demoStartedAt = performance.now();
    this.demoBeatIndex = -1;
    this.resetTiming();
  }

  setSensitivity(value) {
    this.sensitivity = Number(value);
  }

  smooth(current, target, attack = 0.22, release = 0.07) {
    return current + (target - current) * (target > current ? attack : release);
  }

  recordBeat(now, knownBpm = 0) {
    if (this.lastBeatAt > 0) {
      const interval = now - this.lastBeatAt;
      if (interval >= 250 && interval <= 2000) {
        this.beatTimes.push(interval);
        if (this.beatTimes.length > 12) this.beatTimes.shift();
      }
    }
    this.lastBeatAt = now;
    this.beatCount += 1;
    this.estimatedBpm = knownBpm || estimateBpm(this.beatTimes);
  }

  analyseDemo(now) {
    const time = (now - this.demoStartedAt) / 1000;
    const beatPosition = time * (126 / 60);
    const beatIndex = Math.floor(beatPosition);
    const phase = beatPosition - beatIndex;
    const accent = beatIndex % 4 === 0 ? 1 : 0.62;
    const pulse = Math.exp(-phase * 15) * accent;
    const bass = 0.24 + Math.sin(time * 1.8) * 0.07 + pulse * 0.62;
    const mid = 0.19 + Math.sin(time * 2.7 + 1.4) * 0.09 + pulse * 0.3;
    const high = 0.13 + Math.sin(time * 5.9) * 0.06 + pulse * 0.2;
    for (let index = 0; index < this.frequency.length; index += 1) {
      const x = index / this.frequency.length;
      const envelope = Math.exp(-x * 4.8);
      const ripple = 0.56 + 0.44 * Math.sin(index * 0.17 + time * (2 + x * 6));
      this.frequency[index] = clamp((envelope * ripple * 0.72 + pulse * envelope * 0.35) * 255, 0, 255);
    }
    for (let index = 0; index < this.waveform.length; index += 1) {
      const x = index / this.waveform.length;
      const wave = Math.sin(x * 42 + time * 4.2) * bass + Math.sin(x * 91 - time * 2.3) * mid * 0.35;
      this.waveform[index] = 128 + wave * 76;
    }
    const transient = beatIndex !== this.demoBeatIndex;
    this.demoBeatIndex = beatIndex;
    return {
      bass,
      mid,
      high,
      level: (bass + mid + high) / 3,
      transient,
      bands: {
        sub: clamp(bass * 1.08),
        bass: clamp(bass * .94),
        lowMid: clamp(mid * .76 + bass * .22),
        mid,
        presence: clamp(high * .72 + mid * .26),
        air: clamp(high * .9),
      },
    };
  }

  analyseLive(now) {
    this.analyser.getByteFrequencyData(this.frequency);
    this.analyser.getByteTimeDomainData(this.waveform);
    const sampleRate = this.context.sampleRate;
    const fftSize = this.analyser.fftSize;
    const bands = measureFrequencyRanges(this.frequency, sampleRate, fftSize);
    const bass = bands.sub * .38 + bands.bass * .62;
    const mid = bands.lowMid * .42 + bands.mid * .58;
    const high = bands.presence * .64 + bands.air * .36;
    let flux = 0;
    for (let index = 2; index < Math.min(180, this.frequency.length); index += 1) {
      flux += Math.max(0, this.frequency[index] - this.previousFrequency[index]);
      this.previousFrequency[index] = this.frequency[index];
    }
    flux /= 178 * 255;
    this.fluxHistory.push(flux);
    if (this.fluxHistory.length > 45) this.fluxHistory.shift();
    const fluxAverage = this.fluxHistory.reduce((sum, value) => sum + value, 0) / this.fluxHistory.length;
    const transient = flux > Math.max(0.018, fluxAverage * 2.05) && now - this.lastBeatAt > 180;
    let squareSum = 0;
    for (const value of this.waveform) squareSum += ((value - 128) / 128) ** 2;
    return { bass, mid, high, level: Math.sqrt(squareSum / this.waveform.length), transient, bands };
  }

  update(now = performance.now()) {
    const raw = this.mode === "demo" || !this.analyser ? this.analyseDemo(now) : this.analyseLive(now);
    if (raw.transient) this.recordBeat(now, this.mode === "demo" ? 126 : 0);
    const gain = this.sensitivity;
    this.values.bass = this.smooth(this.values.bass, clamp(raw.bass * gain), 0.28, 0.075);
    this.values.mid = this.smooth(this.values.mid, clamp(raw.mid * gain), 0.23, 0.065);
    this.values.high = this.smooth(this.values.high, clamp(raw.high * gain), 0.2, 0.06);
    this.values.level = this.smooth(this.values.level, clamp(raw.level * gain * 1.3), 0.25, 0.06);
    this.values.beat = raw.transient ? 1 : this.values.beat * 0.9;
    this.values.peak = raw.transient ? 1 : this.values.peak * .94;
    for (const name of Object.keys(this.values.bands)) {
      const target = clamp((raw.bands?.[name] || 0) * gain);
      this.values.bands[name] = this.smooth(this.values.bands[name], target, .3, .055);
    }
    this.values.transient = raw.transient;
    this.values.bpm = this.estimatedBpm;
    this.values.beatCount = this.beatCount;
    this.values.barBeat = this.beatCount ? ((this.beatCount - 1) % 4) + 1 : 0;
    return { ...this.values, bands: { ...this.values.bands }, frequency: this.frequency, waveform: this.waveform };
  }
}
