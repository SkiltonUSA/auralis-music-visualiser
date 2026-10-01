import { afterEach, describe, expect, it, vi } from 'vitest';
import { MicrophoneControls, microphoneErrorMessage } from './microphone-controls.js';
import { AudioEngine } from './audio-engine.js';

const deferred = () => { let resolve, reject;const promise = new Promise((a,b) => { resolve=a;reject=b; });return {promise,resolve,reject}; };
const flush = async () => { for(let i=0;i<8;i++) await Promise.resolve(); };
function setup() {
  const track = new EventTarget();Object.assign(track,{readyState:'live',label:'Test microphone',stop:vi.fn()});
  const stream = { getTracks:()=>[track],getAudioTracks:()=>[track] };
  const capture = deferred();
  const getUserMedia = vi.fn(()=>capture.promise);
  vi.stubGlobal('navigator',{mediaDevices:{getUserMedia}});
  const audio = new AudioEngine({pause:vi.fn(),play:vi.fn().mockResolvedValue()});
  audio.analyser = {connect:vi.fn(),disconnect:vi.fn()};
  const source = {connect:vi.fn(),disconnect:vi.fn()};
  audio.context = {state:'running',destination:{},createMediaStreamSource:vi.fn(()=>source)};
  return {audio,track,stream,capture,getUserMedia,source};
}
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});

describe('microphone lifecycle',()=>{
  it('does not open a permission request if cancelled immediately',async()=>{
    const {audio,getUserMedia}=setup();
    const request=audio.useMicrophone();audio.cancelMicrophoneRequest();
    await expect(request).rejects.toMatchObject({name:'AbortError'});
    expect(getUserMedia).not.toHaveBeenCalled();
  });
  it('shares one request across repeated starts and reuses a live microphone',async()=>{
    const {audio,capture,stream,getUserMedia}=setup();
    const first=audio.useMicrophone();expect(audio.useMicrophone()).toBe(first);
    await flush();expect(getUserMedia).toHaveBeenCalledTimes(1);
    capture.resolve(stream);expect(await first).toBe('Test microphone');
    expect(await audio.useMicrophone()).toBe('Test microphone');
    expect(getUserMedia).toHaveBeenCalledTimes(1);expect(audio.mode).toBe('microphone');
  });
  it.each(['cancel','demo'])('stops a late permission grant after %s without changing the chosen source',async action=>{
    const {audio,capture,stream,track}=setup();
    const request=audio.useMicrophone(),rejected=expect(request).rejects.toMatchObject({name:'AbortError'});
    await flush();action==='demo'?audio.useDemo():audio.cancelMicrophoneRequest();await rejected;
    capture.resolve(stream);await flush();
    expect(track.stop).toHaveBeenCalled();expect(audio.stream).toBeNull();expect(audio.mode).toBe('demo');
  });
  it('releases an already granted stream when audio activation is cancelled',async()=>{
    const {audio,capture,stream,track}=setup(),activation=deferred();
    audio.context.state='suspended';audio.context.resume=()=>activation.promise;
    const request=audio.useMicrophone(),rejected=expect(request).rejects.toMatchObject({name:'AbortError'});
    capture.resolve(stream);await flush();audio.cancelMicrophoneRequest();await rejected;
    expect(track.stop).toHaveBeenCalled();activation.resolve();await flush();expect(audio.stream).toBeNull();
  });
  it('retains the existing source on denial and allows retry',async()=>{
    const {audio,capture,getUserMedia,stream}=setup();audio.mode='file';const prior={disconnect:vi.fn()};audio.source=prior;
    const request=audio.useMicrophone();capture.reject(new DOMException('Denied','NotAllowedError'));
    await expect(request).rejects.toMatchObject({name:'NotAllowedError'});
    expect(prior.disconnect).not.toHaveBeenCalled();expect(audio.mode).toBe('file');
    getUserMedia.mockResolvedValue(stream);await audio.useMicrophone();expect(audio.mode).toBe('microphone');
  });
  it('disconnects speaker monitoring inherited from file playback',async()=>{
    const {audio,capture,stream,source}=setup();audio.mode='file';audio.outputConnected=true;
    const request=audio.useMicrophone();capture.resolve(stream);await request;
    expect(audio.analyser.disconnect).toHaveBeenCalledWith(audio.context.destination);
    expect(audio.outputConnected).toBe(false);expect(source.connect).toHaveBeenCalledWith(audio.analyser);
    expect(audio.analyser.connect).not.toHaveBeenCalled();
  });
  it('falls back to Demo on disconnection and ignores ended events from an old source',async()=>{
    const {audio,capture,stream,track}=setup();audio.onMicrophoneEnded=vi.fn();
    const request=audio.useMicrophone();capture.resolve(stream);await request;
    track.dispatchEvent(new Event('ended'));expect(audio.mode).toBe('demo');expect(audio.onMicrophoneEnded).toHaveBeenCalledTimes(1);
    track.dispatchEvent(new Event('ended'));expect(audio.onMicrophoneEnded).toHaveBeenCalledTimes(1);
  });
  it('does not let a cancelled file start override Demo',async()=>{
    const {audio}=setup(),activation=deferred();audio.context.state='suspended';audio.context.resume=()=>activation.promise;
    const file=audio.useFile({name:'song.mp3'});audio.useDemo();activation.resolve();
    expect(await file).toBeNull();expect(audio.mode).toBe('demo');expect(audio.player.play).not.toHaveBeenCalled();
  });
});

describe('shared microphone controls',()=>{
  it.each(['NotAllowedError','SecurityError'])('opens native settings on %s and explains what to do next',async name=>{
    const render=vi.fn(),openMicrophoneSettings=vi.fn().mockResolvedValue(true);
    const controls=new MicrophoneControls({mode:'demo',useMicrophone:async()=>{throw {name};}},
      {render,onLive:vi.fn(),desktop:true,openMicrophoneSettings});
    await controls.start();expect(openMicrophoneSettings).toHaveBeenCalledTimes(1);
    expect(render.mock.lastCall[0].detail).toContain('Opened System Settings');
    expect(controls.pending).toBe(false);
  });
  it.each([[false,'NotAllowedError'],[true,'NotFoundError'],[true,'NotReadableError'],[true,'AbortError']])('does not open settings for desktop=%s error=%s',async(desktop,name)=>{
    const openMicrophoneSettings=vi.fn();
    const controls=new MicrophoneControls({mode:'demo',useMicrophone:async()=>{throw {name};}},
      {render:vi.fn(),onLive:vi.fn(),desktop,openMicrophoneSettings});
    await controls.start();expect(openMicrophoneSettings).not.toHaveBeenCalled();
  });
  it('keeps manual directions on launch failure and ignores a late reply after cancellation',async()=>{
    const render=vi.fn(),opening=deferred(),openMicrophoneSettings=vi.fn().mockRejectedValueOnce(new Error('Failed')).mockImplementation(()=>opening.promise);
    const controls=new MicrophoneControls({mode:'demo',useMicrophone:async()=>{throw {name:'NotAllowedError'};},cancelMicrophoneRequest:vi.fn()},
      {render,onLive:vi.fn(),desktop:true,openMicrophoneSettings});
    await controls.start();expect(render.mock.lastCall[0].detail).toContain('Open System Settings');
    const request=controls.start();await flush();controls.cancel();opening.resolve(true);await request;
    expect(render.mock.lastCall[0].status).toBe('idle');
  });
  it('shows cancellable waiting and ignores duplicate clicks and late completions',async()=>{
    vi.useFakeTimers();const capture=deferred(),render=vi.fn(),onLive=vi.fn();
    const audio={mode:'demo',useMicrophone:vi.fn(()=>capture.promise),cancelMicrophoneRequest:vi.fn()};
    const controls=new MicrophoneControls(audio,{render,onLive});
    const request=controls.start();await controls.start();expect(audio.useMicrophone).toHaveBeenCalledTimes(1);
    expect(render.mock.lastCall[0].status).toBe('pending');
    vi.advanceTimersByTime(8000);expect(render.mock.lastCall[0].detail).toContain('Still waiting');
    controls.cancel();capture.resolve('Late input');await request;
    expect(onLive).not.toHaveBeenCalled();expect(render.mock.lastCall[0].status).toBe('idle');expect(vi.getTimerCount()).toBe(0);
  });
  it('keeps actionable errors visible and transitions cleanly after retry',async()=>{
    vi.useFakeTimers();const render=vi.fn(),onLive=vi.fn();
    const audio={mode:'demo',useMicrophone:vi.fn().mockRejectedValueOnce({name:'NotFoundError'}).mockResolvedValue('Mic'),cancelMicrophoneRequest:vi.fn()};
    const controls=new MicrophoneControls(audio,{render,onLive,desktop:true});
    await controls.start();expect(render.mock.lastCall[0].detail).toContain('No microphone');expect(render.mock.lastCall[0].label).toBe('Try microphone again');
    await controls.start();expect(render.mock.lastCall[0].status).toBe('live');expect(onLive).toHaveBeenCalledWith('Mic');expect(vi.getTimerCount()).toBe(0);
  });
  it('distinguishes desktop permissions, browser permissions and device failures',()=>{
    expect(microphoneErrorMessage({name:'NotAllowedError'},true)).toContain('enable Auralis');
    expect(microphoneErrorMessage({name:'NotAllowedError'},false)).toContain('browser’s site permissions');
    expect(microphoneErrorMessage({name:'NotReadableError'})).toContain('close another app');
    expect(microphoneErrorMessage({name:'NotSupportedError'})).toContain('HTTPS or localhost');
  });
});
