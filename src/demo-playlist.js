export const DEMO_HOLD_SECONDS = 50;
export const DEMO_FADE_SECONDS = 4;
export const DEMO_TRACKS = Object.freeze([
  Object.freeze({ title: 'Neon Current', url: '/demo-music/neon-current.mp3', bpm: 138 }),
  Object.freeze({ title: 'Chrome Pressure', url: '/demo-music/chrome-pressure.mp3', bpm: 154 }),
]);

export function demoFadeCurve(incoming, size = 128) {
  return Float32Array.from({ length: size }, (_, i) => {
    const phase = i / (size - 1) * Math.PI / 2;
    return incoming ? Math.sin(phase) : Math.cos(phase);
  });
}

// Audio-clock scheduling keeps the 50-second rotation independent of scene
// changes, render FPS and visual pause. Only the first 54.1s of each decoded
// track is retained (~40MB total at 48kHz stereo, rather than full-song PCM).
export class DemoPlaylist {
  constructor(context, { random = Math.random, fetchAudio = (...args) => fetch(...args),
    setTimer = (callback, delay) => setInterval(callback, delay), clearTimer = id => clearInterval(id), onTrack = () => {} } = {}) {
    this.context = context; this.random = random; this.fetchAudio = fetchAudio;
    this.setTimer = setTimer; this.clearTimer = clearTimer; this.onTrack = onTrack;
    this.output = context.createGain(); this.output.gain.value = .65;
    this.buffers = null; this.loading = null; this.timer = null;
    this.voices = []; this.running = false; this.currentIndex = -1;
    this.fadeIn = demoFadeCurve(true); this.fadeOut = demoFadeCurve(false);
  }

  async prepare() {
    if (this.buffers) return;
    if (!this.loading) {
      this.loading = Promise.all(DEMO_TRACKS.map(async track => {
        const response = await this.fetchAudio(track.url);
        if (!response.ok) throw new Error('Demo music unavailable');
        const decoded = await this.context.decodeAudioData(await response.arrayBuffer());
        if (decoded.duration < DEMO_HOLD_SECONDS + DEMO_FADE_SECONDS) throw new Error('Demo track too short');
        const length = Math.min(decoded.length, Math.ceil(54.1 * decoded.sampleRate));
        const buffer = this.context.createBuffer(decoded.numberOfChannels, length, decoded.sampleRate);
        for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
          buffer.copyToChannel(decoded.getChannelData(channel).subarray(0, length), channel);
        }
        return buffer;
      })).then(buffers => { this.buffers = buffers; }).finally(() => { this.loading = null; });
    }
    return this.loading;
  }

  start() {
    if (!this.buffers) throw new Error('Demo not loaded');
    this.stop(); this.running = true;
    this.nextIndex = Math.min(DEMO_TRACKS.length - 1, Math.max(0, Math.floor(this.random() * DEMO_TRACKS.length)));
    this.currentIndex = this.nextIndex;
    this.nextStart = this.context.currentTime + .05;
    try {
      this.schedule(true); this.pump();
      this.timer = this.setTimer(() => this.pump(), 250);
      this.onTrack(DEMO_TRACKS[this.currentIndex]);
      return DEMO_TRACKS[this.currentIndex];
    } catch (error) { this.stop(); throw error; }
  }

  schedule(first = false) {
    const index = this.nextIndex, at = this.nextStart;
    const source = this.context.createBufferSource(), gain = this.context.createGain();
    source.buffer = this.buffers[index]; source.connect(gain); gain.connect(this.output);
    gain.gain.setValueAtTime(0, at);
    gain.gain.setValueCurveAtTime(this.fadeIn, at, first ? .65 : DEMO_FADE_SECONDS);
    gain.gain.setValueAtTime(1, at + DEMO_HOLD_SECONDS);
    gain.gain.setValueCurveAtTime(this.fadeOut, at + DEMO_HOLD_SECONDS, DEMO_FADE_SECONDS);
    const voice = { source, gain, index, at };
    source.onended = () => {
      source.disconnect(); gain.disconnect();
      this.voices = this.voices.filter(item => item !== voice);
    };
    this.voices.push(voice);
    source.start(at); source.stop(at + DEMO_HOLD_SECONDS + DEMO_FADE_SECONDS);
    this.nextStart += DEMO_HOLD_SECONDS;
    this.nextIndex = (index + 1) % DEMO_TRACKS.length;
  }

  pump() {
    if (!this.running) return;
    const now = this.context.currentTime;
    // Resume cleanly after a severely stalled/backgrounded renderer: never
    // burst-start missed tracks at once. Normally two minutes are pre-scheduled.
    if (this.nextStart < now) this.nextStart = now + .05;
    while (this.nextStart < now + DEMO_HOLD_SECONDS * 2 + 1) this.schedule();
    const active = this.voices.filter(voice => voice.at <= now).at(-1);
    if (active && active.index !== this.currentIndex) {
      this.currentIndex = active.index; this.onTrack(DEMO_TRACKS[active.index]);
    }
  }

  stop() {
    this.running = false;
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
    for (const { source, gain } of this.voices) {
      source.onended = null;
      try { source.stop(); } catch { /* Already stopped. */ }
      source.disconnect(); gain.disconnect();
    }
    this.voices = []; this.currentIndex = -1;
  }
}
