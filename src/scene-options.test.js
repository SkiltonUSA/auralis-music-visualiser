import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createSceneOptions } from './scene-options.js';
import { SceneDurations, SceneRotation } from './scene-rotation.js';
import { scenes } from './scenes.js';

class Element {
  constructor() {
    this.children=[];this.dataset={};this.attributes={};this.events={};
    this.classes=new Set();this.classList={toggle:(name,on)=>on?this.classes.add(name):this.classes.delete(name)};
  }
  append(...children){this.children.push(...children);}
  setAttribute(name,value){this.attributes[name]=value;}
  addEventListener(name,callback){this.events[name]=callback;}
}
afterEach(()=>vi.unstubAllGlobals());
describe('scene options controls',()=>{
  it('places timing controls in their own accessible pop-up, not in Options', () => {
    const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
    const options=html.match(/<aside class="settings-panel"[\s\S]*?<\/aside>/)[0];
    expect(options).not.toContain('scene-options-list');expect(options).toContain('open-timers-button');
    const dialog=html.match(/<dialog id="scene-timers-dialog"[\s\S]*?<\/dialog>/)[0];
    expect(dialog).toContain('aria-labelledby="scene-timers-title"');expect(dialog).toContain('id="scene-options-list"');
    expect(dialog).toContain('aria-label="Close scene timers"');
    const css=readFileSync(new URL('./style.css',import.meta.url),'utf8');
    expect(css).toContain('.scene-duration::-webkit-inner-spin-button');
    expect(css).toContain('-webkit-appearance: none');
  });
  it('builds accessible per-scene inputs and keeps settings and rotation controls in sync',()=>{
    vi.stubGlobal('document',{createElement:()=>new Element(),activeElement:null});
    const root=new Element(),rotation=new SceneRotation(scenes.map(s=>s.renderMode)),durations=new SceneDurations(scenes);
    const onToggle=vi.fn(index=>rotation.toggle(index));
    const onDuration=vi.fn((index,seconds)=>durations.set(scenes[index].renderMode,seconds));
    const panel=createSceneOptions(root,scenes,{rotation,durations,onToggle,onDuration});panel.update(0);
    expect(root.children).toHaveLength(16);
    const [name,input,toggle]=root.children[0].children;
    expect(name.textContent).toBe('01 · Neon City');expect(input.value).toBe(30);
    expect(input.attributes['aria-label']).toBe('Neon City duration in seconds');
    expect(toggle.attributes['aria-checked']).toBe('true');expect(root.children[0].classes.has('is-current')).toBe(true);
    toggle.events.click();panel.update(1);
    expect(onToggle).toHaveBeenCalledWith(0);expect(toggle.attributes['aria-checked']).toBe('false');
    rotation.toggle(0);panel.update(1);expect(toggle.attributes['aria-checked']).toBe('true');
    input.value='15';input.events.change();expect(durations.get(25)).toBe(15);
    input.value='-10';input.events.change();expect(input.value).toBe(15);
    input.value='';input.events.change();expect(input.value).toBe(15);
    document.activeElement=input;input.value='25';panel.update(1);expect(input.value).toBe('25');
    document.activeElement=null;panel.update(1);expect(input.value).toBe(15);
  });
});
