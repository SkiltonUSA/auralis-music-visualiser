import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DemoPlaylist, DEMO_TRACKS, DEMO_HOLD_SECONDS, DEMO_FADE_SECONDS, demoFadeCurve } from './demo-playlist.js';
import { AudioEngine } from './audio-engine.js';

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const node = () => ({ connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1, setValueAtTime: vi.fn(), setValueCurveAtTime: vi.fn() }, start: vi.fn(), stop: vi.fn() });
function setup(random = () => 0) {
  const context = { currentTime: 0, state: 'running', destination: {},
    createGain: vi.fn(node), createBufferSource: vi.fn(node),
    decodeAudioData: vi.fn(async () => ({ duration: 220, length: 2200, numberOfChannels: 2, sampleRate: 10, getChannelData: () => new Float32Array(2200) })),
    createBuffer: vi.fn((channels,length,rate) => ({ duration: length/rate, copyToChannel: vi.fn() })),
  };
  const fetchAudio = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
  const setTimer = vi.fn(() => 42), clearTimer = vi.fn(), onTrack = vi.fn();
  const playlist = new DemoPlaylist(context, { random, fetchAudio, setTimer, clearTimer, onTrack });
  return { context, playlist, fetchAudio, setTimer, clearTimer, onTrack };
}
function engineSetup() {
  const x = setup(), engine = new AudioEngine({ pause: vi.fn(), play: vi.fn().mockResolvedValue() });
  engine.context = x.context; engine.analyser = node(); engine.demoMusic = x.playlist;
  return { ...x, engine };
}
describe('bundled rotating demo music', () => {
  it('bundles two distinct valid MP3 assets and never fetches before explicit preparation', async () => {
    const x = setup(); expect(x.fetchAudio).not.toHaveBeenCalled();
    const hashes = DEMO_TRACKS.map(track => {
      const data = readFileSync(new URL(`../public${track.url}`,import.meta.url));
      expect(data.length).toBeGreaterThan(1_000_000);expect(data.toString('ascii',0,3)).toBe('ID3');
      return createHash('sha256').update(data).digest('hex');
    });
    expect(new Set(hashes).size).toBe(2);
    await Promise.all([x.playlist.prepare(),x.playlist.prepare()]);await x.playlist.prepare();
    expect(x.fetchAudio).toHaveBeenCalledTimes(2);expect(x.context.createBuffer).toHaveBeenCalledWith(2,541,10);
  });
  it.each([[0,0],[.999,1]])('random=%s chooses track %s, then schedules alternating 50-second starts', async (random,index) => {
    const x = setup(() => random); await x.playlist.prepare();
    expect(x.playlist.start()).toBe(DEMO_TRACKS[index]);
    expect(x.playlist.voices.map(v=>v.index)).toEqual([index,1-index,index]);
    expect(x.playlist.voices.map(v=>v.at)).toEqual([.05,50.05,100.05]);
    for(const v of x.playlist.voices){
      expect(v.source.start).toHaveBeenCalledWith(v.at);
      expect(v.source.stop).toHaveBeenCalledWith(v.at+54);
      expect(v.gain.gain.setValueCurveAtTime).toHaveBeenLastCalledWith(x.playlist.fadeOut,v.at+50,4);
      expect(v.gain.connect).toHaveBeenCalledWith(x.playlist.output);
    }
    expect(x.setTimer).toHaveBeenCalledTimes(1);
    x.context.currentTime=50.06;x.playlist.pump();
    expect(x.onTrack).toHaveBeenLastCalledWith(DEMO_TRACKS[1-index]);
    expect(x.playlist.voices.at(-1).at).toBe(150.05);
    x.playlist.stop();
  });
  it('keeps equal-power crossfades complementary and leaves headroom on the mixed output', () => {
    const a=demoFadeCurve(true),b=demoFadeCurve(false);
    expect(DEMO_HOLD_SECONDS).toBe(50);expect(DEMO_FADE_SECONDS).toBe(4);
    expect(a[0]).toBe(0);expect(a.at(-1)).toBe(1);expect(b[0]).toBe(1);expect(b.at(-1)).toBeCloseTo(0);
    for(let i=0;i<a.length;i++)expect(a[i]**2+b[i]**2).toBeCloseTo(1,6);
    expect(setup().playlist.output.gain.value).toBe(.65);
  });
  it('cleans ended voices, clears timers and stops even future scheduled tracks', async () => {
    const x=setup();await x.playlist.prepare();x.playlist.start();
    const first=x.playlist.voices[0];first.source.onended();
    expect(first.source.disconnect).toHaveBeenCalledOnce();expect(first.gain.disconnect).toHaveBeenCalledOnce();
    const pending=x.playlist.voices.slice();x.playlist.stop();x.playlist.pump();
    expect(x.clearTimer).toHaveBeenCalledWith(42);expect(x.playlist.voices).toHaveLength(0);
    for(const v of pending){expect(v.source.stop).toHaveBeenLastCalledWith();expect(v.source.onended).toBeNull();expect(v.gain.disconnect).toHaveBeenCalledOnce();}
  });
  it('allows failed preparation to retry and rejects truncated assets', async () => {
    const x=setup();x.fetchAudio.mockResolvedValueOnce({ok:false});
    await expect(x.playlist.prepare()).rejects.toThrow('unavailable');expect(x.playlist.buffers).toBeNull();
    await x.playlist.prepare();expect(x.playlist.buffers).toHaveLength(2);
    const y=setup();y.context.decodeAudioData.mockResolvedValue({duration:10});
    await expect(y.playlist.prepare()).rejects.toThrow('too short');
  });
  it('routes audible demo music through real FFT analysis and stops it on a source switch', async () => {
    const x=engineSetup();await x.engine.useDemoMusic();
    expect(x.engine.mode).toBe('demo-music');expect(x.engine.source).toBe(x.playlist.output);
    expect(x.playlist.output.connect).toHaveBeenCalledWith(x.engine.analyser);
    expect(x.engine.analyser.connect).toHaveBeenCalledWith(x.context.destination);
    const live=vi.spyOn(x.engine,'analyseLive').mockReturnValue({bass:0,mid:0,high:0,level:0,transient:false,bands:{}});
    const synthetic=vi.spyOn(x.engine,'analyseDemo');x.engine.update(1);
    expect(live).toHaveBeenCalled();expect(synthetic).not.toHaveBeenCalled();
    x.engine.useDemo();expect(x.playlist.running).toBe(false);expect(x.engine.outputConnected).toBe(false);
    expect(x.engine.analyser.disconnect).toHaveBeenCalledWith(x.context.destination);
  });
  it('deduplicates starts and prevents late loading from overriding a newer source request', async () => {
    const x=engineSetup(),loading=deferred();vi.spyOn(x.playlist,'prepare').mockReturnValue(loading.promise);
    const pending=x.engine.useDemoMusic();expect(x.engine.useDemoMusic()).toBe(pending);
    await flush();x.engine.useDemo();loading.resolve();
    expect(await pending).toBeNull();expect(x.playlist.running).toBe(false);expect(x.engine.mode).toBe('demo');
    expect(x.engine.analyser.connect).not.toHaveBeenCalled();
  });
  it('stops every scheduled demo voice before starting a local music file', async () => {
    const x=engineSetup();x.context.createMediaElementSource=vi.fn(node);
    await x.engine.useDemoMusic();const voices=x.playlist.voices.slice();
    const track=new File(['test'],'chosen.mp3',{type:'audio/mpeg'});
    expect(await x.engine.useFile(track)).toBe('chosen');
    expect(x.engine.mode).toBe('file');expect(x.playlist.running).toBe(false);
    for(const voice of voices)expect(voice.source.stop).toHaveBeenLastCalledWith();
    expect(x.engine.source).toBe(x.engine.fileSource);expect(x.engine.outputConnected).toBe(true);
    x.engine.useDemo();
  });
  it('preserves the live source if demo loading fails and can retry', async () => {
    const x=engineSetup(),prior=node();x.engine.source=prior;x.engine.mode='file';
    x.fetchAudio.mockResolvedValueOnce({ok:false});
    await expect(x.engine.useDemoMusic()).rejects.toThrow('unavailable');
    expect(x.engine.source).toBe(prior);expect(prior.disconnect).not.toHaveBeenCalled();
    expect(x.engine.demoMusicRequest).toBeNull();
    await x.engine.useDemoMusic();expect(x.playlist.running).toBe(true);expect(prior.disconnect).toHaveBeenCalledOnce();
    x.engine.useDemo();
  });
  it('cannot leave music playing behind the welcome screen if startup fails', async () => {
    const x=engineSetup();x.setTimer.mockImplementation(()=>{throw Error('Timer unavailable');});
    await expect(x.engine.useDemoMusic()).rejects.toThrow('Timer unavailable');
    expect(x.playlist.running).toBe(false);expect(x.playlist.voices).toHaveLength(0);
    expect(x.engine.outputConnected).toBe(false);expect(x.engine.mode).toBe('demo');
  });
});
