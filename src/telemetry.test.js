import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('FPS telemetry', () => {
  it('removes the small description and timing-status overlays while retaining the scene title', () => {
    expect(read('../index.html')).not.toContain('id="scene-description"');
    expect(read('./main.js')).not.toContain('#scene-description');
    expect(read('./style.css')).not.toContain('#scene-description');
    expect(read('../index.html')).toContain('id="scene-title"');
    expect(read('../index.html')).not.toContain('id="director-text"');
    expect(read('../index.html')).not.toContain('id="director-status"');
    expect(read('./main.js')).not.toContain('updateDirectorStatus');
    expect(read('./style.css')).not.toContain('.director-status');
  });
  it('omits the bottom shortcut legend and all four decorative screen corners', () => {
    const html = read('../index.html');
    const frame = html.match(/<div class="cinema-frame"[\s\S]*?<\/div>/)[0];
    expect(frame).not.toContain('<i>');
    expect(frame).toContain('<span></span>');
    expect(html).not.toContain('shortcut-hint');
    expect(read('./style.css')).not.toContain('.shortcut-hint');
    expect(read('./style.css')).not.toContain('.cinema-frame i');
  });

  it('leaves the top bar without a horizontal divider', () => {
    const topbar = read('./style.css').match(/^\.topbar \{[^}]*\}/m)[0];
    expect(topbar).not.toMatch(/border|box-shadow/);
  });

  it('places FPS beneath BPM inside the hideable right-hand telemetry', () => {
    const html = read('../index.html');
    const telemetry = html.match(/<aside class="telemetry interface"[\s\S]*?<\/aside>/)[0];
    expect(telemetry).toContain('id="fps-value" aria-label="Frames per second"');
    expect(telemetry.indexOf('id="fps-value"')).toBeGreaterThan(telemetry.indexOf('id="tempo-value"'));
    expect(html).not.toContain('id="frame-data"');
    expect(html).not.toContain('FRAME / 12 BINS');
    expect(read('./main.js')).not.toContain('frameChannels');
  });

  it('retains measured FPS separately from the stable version and quality labels', () => {
    expect(read('./main.js')).toContain('$("#fps-value").textContent = `${performance.fps} FPS`;');
    expect(read('./main.js')).toContain('$("#performance-readout").textContent = `${performance.quality.toUpperCase()} QUALITY`;');
    expect(read('./main.js')).toContain('$("#app-version").textContent = `Auralis v${version} · by Studio313`;');
    expect(read('./main.js')).not.toContain('Math.ceil(sceneDwell.remaining)');
    expect(read('./main.js')).not.toContain('${16 - beatsSinceCut}');
  });
});
