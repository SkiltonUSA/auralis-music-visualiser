import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { shortcutAction } from './shortcuts.js';
import menu from '../desktop/menu.cjs';

describe('discoverable visualiser controls', () => {
  it('maps the displayed keys to the same actions, including uppercase', () => {
    for (const [key, action] of Object.entries({ l: 'load', m: 'microphone', d: 'demo', s: 'options', f: 'fullscreen', o: 'visualOnly', h: 'interface', a: 'director' })) {
      expect(shortcutAction({ key })).toBe(action);
      expect(shortcutAction({ key: key.toUpperCase() })).toBe(action);
    }
    expect(shortcutAction({ key: ' ', code: 'Space' })).toBe('pause');
    expect(shortcutAction({ key: 'ArrowRight' })).toBe('next');
    expect(shortcutAction({ key: 'ArrowLeft' })).toBe('previous');
    expect(shortcutAction({ key: '9' })).toBe('scene:8');
    expect(shortcutAction({ key: 'Escape' })).toBe('escape');
    expect(shortcutAction({ key: 'v' })).toBeNull();
    expect(shortcutAction({ key: 'x' })).toBeNull();
  });
  it('does not expose commands that reopen the retired Geiss scene', () => {
    const activated = [];
    const root = menu.menuTemplate(action => activated.push(action));
    const patterns = root.find(item=>item.label==='Visualiser').submenu.find(item=>item.label==='Geiss Flow Patterns');
    expect(patterns).toBeUndefined();
    expect(JSON.stringify(root)).not.toContain('CmdOrCtrl+Shift+N');
    const main=readFileSync(new URL('./main.js',import.meta.url),'utf8');
    expect(main).not.toContain('focusGeiss');
    expect(main).not.toContain('geissVariation');
  });
  it('does not steal OS shortcuts, repeated keys, typing or native button activation', () => {
    for (const flag of ['metaKey', 'ctrlKey', 'altKey', 'repeat', 'isComposing', 'defaultPrevented']) {
      expect(shortcutAction({ key: 'o', [flag]: true })).toBeNull();
    }
    const editor = { closest: selector => selector.startsWith('input') ? {} : null };
    expect(shortcutAction({ key: 'm', target: editor })).toBeNull();
    const button = { closest: selector => selector.startsWith('button') ? {} : null };
    expect(shortcutAction({ key: ' ', code: 'Space', target: button })).toBeNull();
    expect(shortcutAction({ key: 'Enter', target: button })).toBeNull();
    expect(shortcutAction({ key: 'o', target: button })).toBe('visualOnly');
  });
  it('keeps commands in the native menu without an extra app toolbar', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    expect(html).not.toContain('class="menu-button');
    const topbar = html.match(/<header class="topbar[\s\S]*?<\/header>/)[0];
    expect(topbar).not.toContain('id="load-music-button"');
    const activated = [];
    const template = menu.menuTemplate(id => activated.push(id));
    expect(template.map(item => item.label).filter(Boolean)).toEqual(['Auralis', 'File', 'Visualiser', 'View']);
    const actions = template.flatMap(item => item.submenu || []).filter(item => item.click);
    for (const action of actions) action.click();
    expect(new Set(activated).size).toBe(12);
    expect(activated).toEqual(['about', 'load', 'microphone', 'demo', 'pause', 'director', 'previous', 'next', 'fullscreen', 'visualOnly', 'options', 'timers']);
    expect(template[0].submenu[0].label).toBe('About Auralis');
    expect(actions.find(action => action.label === 'Scene Timers…').accelerator).toBe('CmdOrCtrl+Shift+T');
    expect(actions.find(action => action.label === 'Load Music…').accelerator).toBe('CmdOrCtrl+O');
  });
});
