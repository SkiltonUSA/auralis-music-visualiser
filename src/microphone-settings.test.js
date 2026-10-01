import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createMicrophoneSettingsHandler, MICROPHONE_SETTINGS_URL } from '../desktop/microphone-settings.cjs';

function setup(status='denied',platform='darwin') {
  const contents={getURL:()=> 'auralis://app/',isDestroyed:()=>false,mainFrame:{url:'auralis://app/'}};
  const event={sender:contents,senderFrame:contents.mainFrame};
  const shell={openExternal:vi.fn().mockResolvedValue()};
  const systemPreferences={getMediaAccessStatus:vi.fn(()=>status)};
  return {contents,event,shell,systemPreferences,handler:createMicrophoneSettingsHandler({platform,getWindow:()=>({webContents:contents}),shell,systemPreferences})};
}
describe('native microphone settings recovery',()=>{
  it.each(['denied','restricted'])('opens only the microphone pane for %s, once per launch',async status=>{
    const {handler,event,shell}=setup(status);
    expect(await handler(event)).toBe(true);expect(await handler(event)).toBe(false);
    expect(shell.openExternal).toHaveBeenCalledExactlyOnceWith(MICROPHONE_SETTINGS_URL);
  });
  it.each(['granted','not-determined','unknown'])('does not launch settings for %s',async status=>{
    const {handler,event,shell}=setup(status);expect(await handler(event)).toBe(false);
    expect(shell.openExternal).not.toHaveBeenCalled();
  });
  it('rejects other windows, subframes, untrusted origins and other platforms',async()=>{
    for(const mutate of [x=>x.event.sender={},x=>x.event.senderFrame={url:'auralis://app/'},
      x=>x.event.senderFrame=null,x=>x.contents.mainFrame.url='https://example.com',
      x=>x.contents.getURL=()=> 'https://example.com',x=>x.contents.isDestroyed=()=>true]){
      const x=setup();mutate(x);expect(await x.handler(x.event)).toBe(false);expect(x.shell.openExternal).not.toHaveBeenCalled();
    }
    const x=setup('denied','win32');expect(await x.handler(x.event)).toBe(false);expect(x.shell.openExternal).not.toHaveBeenCalled();
  });
  it('handles failed OS launches without throwing or repeated popups',async()=>{
    const x=setup();x.shell.openExternal.mockRejectedValue(new Error('Unavailable'));
    expect(await x.handler(x.event)).toBe(false);expect(await x.handler(x.event)).toBe(false);
    expect(x.shell.openExternal).toHaveBeenCalledTimes(1);
  });
  it('exposes only a no-argument request, never caller-provided URLs or IPC methods',()=>{
    const invoke=vi.fn(),exposeInMainWorld=vi.fn();
    runInNewContext(readFileSync(new URL('../desktop/preload.cjs',import.meta.url),'utf8'),{
      require:()=>({contextBridge:{exposeInMainWorld},ipcRenderer:{invoke}}),
    });
    const [name,bridge]=exposeInMainWorld.mock.calls[0];expect(name).toBe('auralisDesktop');
    expect(Object.keys(bridge)).toEqual(['openMicrophoneSettings']);
    bridge.openMicrophoneSettings('https://untrusted.example');
    expect(invoke).toHaveBeenCalledExactlyOnceWith('auralis:microphone-settings');
  });
});
