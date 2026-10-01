import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { scenes } from './scenes.js';
import { SceneRotation } from './scene-rotation.js';
import { SceneBlend } from './scene-blend.js';
const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
describe('startup photosensitivity warning', () => {
  it('presents microphone, music file and demo as matching full-sized source options', () => {
    const html = read('../index.html');
    for (const id of ['mic-button', 'load-music-button', 'demo-button']) {
      const button = html.match(new RegExp(`<button class="primary-button" id="${id}" type="button">([\\s\\S]*?)</button>`));
      expect(button).not.toBeNull();
      expect(button[1]).toContain('<svg');
      expect(button[1]).toContain('<strong');
      expect(button[1]).toContain('<small');
    }
    expect(read('./main.js')).toContain('$("#demo-button").addEventListener("click", useDemo)');
    expect(read('./main.js')).toContain('$("#load-music-button").addEventListener("click", loadMusic)');
  });
  it('initialises all renderer state to the first enabled scene without a Bloom blend',()=>{
    const main=read('./main.js'),engine=read('./visual-engine.js');
    expect(scenes[0].renderMode).toBe(25);
    expect(main).toContain('const initialSceneIndex = rotation.next(-1) ?? 0');
    expect(main).toContain('new VisualEngine($("#visual-stage"), scenes[initialSceneIndex].renderMode)');
    expect(main).toContain('visual.setMode(scene.renderMode, !experienceStarted)');
    expect(engine).toContain('this.mode = initialMode; this.blend = new SceneBlend(initialMode)');
    expect(engine).toContain('uMode: { value: initialMode }');
    for(const disabled of [[],[25],[25,0],scenes.map(s=>s.renderMode)]){
      const rotation=new SceneRotation(scenes.map(s=>s.renderMode),disabled);
      const mode=scenes[rotation.next(-1)??0].renderMode,blend=new SceneBlend(mode);
      expect(blend.mode).toBe(mode);expect(blend.previous).toBe(mode);expect(blend.active).toBe(false);
    }
  });
  it('shows readable seizure guidance before the microphone and demo choices', () => {
    const html = read('../index.html'),welcome = html.slice(html.indexOf('<section class="welcome"'));
    expect(welcome).toContain('aria-describedby="photosensitivity-warning"');
    expect(welcome).toContain('Photosensitivity &amp; epilepsy warning');
    expect(welcome).toContain('may trigger seizures');
    expect(welcome.indexOf('id="photosensitivity-warning"')).toBeLessThan(welcome.indexOf('id="mic-button"'));
    expect(welcome.indexOf('id="photosensitivity-warning"')).toBeLessThan(welcome.indexOf('id="demo-button"'));
    expect(welcome.indexOf('id="photosensitivity-warning"')).toBeLessThan(welcome.indexOf('id="load-music-button"'));
  });
  it('does not render animated scenes until a source has been deliberately started', () => {
    const animate = read('./main.js').split('function animate(now) {')[1];
    expect(animate.indexOf('if (!experienceStarted)')).toBeLessThan(animate.indexOf('audio.update(now)'));
    expect(animate.indexOf('if (!experienceStarted)')).toBeLessThan(animate.indexOf('visual.render(state, delta)'));
    const css = read('./style.css');
    expect(css).toContain('background: radial-gradient(circle at 50% 43%, #1c122c, #05040a 80%)');
    expect(css).toContain('.welcome > .welcome-card { margin: auto; flex-shrink: 0; }');
  });
});
