import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('credits licences viewer', () => {
  it('moves credits out of Options into the About dialog reached by the native menu', () => {
    const html = read('../index.html');
    const options = html.match(/<aside class="settings-panel"[\s\S]*?<\/aside>/)[0];
    const about = html.match(/<dialog id="about-dialog"[\s\S]*?<\/dialog>/)[0];
    expect(options).not.toContain('author-credits');
    expect(options).not.toContain('licences-button');
    expect(about).toContain('aria-labelledby="about-title"');
    expect(about).toContain('author-credits');
    expect(about).toContain('licences-button');
    expect(read('../desktop/menu.cjs')).toContain("action('About Auralis', 'about')");
    expect(read('./main.js')).toContain('about: openAbout');
    expect(read('./main.js')).toContain("else if ($('#about-dialog').open) closeAbout()");
  });
  it('credits all nine contributors and their projects above Licences', () => {
    const credits = read('../index.html').match(/<section class="credits-section"[\s\S]*?<\/section>/)[0];
    const pairs = [
      ['Jeff Beene', 'Synthcity'], ['Edan Kwan', 'The Spirit'],
      ['mohamedachrefelouafi / achrefelouafi', 'GeometryPainterThreeJS'],
      ['Jack Purvis / EmperorJack', 'Smokey BBQ'], ['isoteriksoftware', 'React Smoke'],
      ['Rajavanya Subramaniyan / quakeboy', 'Endless Tunnel'], ['ZyFou', 'ProceduralTerrains'],
      ['Mike Cao', 'Astrofox'],
      ['Sabo Sugi', 'Three.js &amp; Shaders'],
    ];
    for (const [author, project] of pairs) expect(credits).toContain(`<dt>${author}</dt><dd>${project} —`);
    expect(credits.match(/<dt>/g)).toHaveLength(9);
    expect(credits.indexOf('</dl>')).toBeLessThan(credits.indexOf('id="licences-button"'));
  });
  it('declares and packages the original-code MIT licence without replacing third-party notices', () => {
    expect(read('../LICENSE')).toContain('MIT License\n\nCopyright (c) 2026 Studio313');
    expect(read('../LICENSE')).toContain('THE SOFTWARE IS PROVIDED "AS IS"');
    expect(JSON.parse(read('../package.json')).license).toBe('MIT');
    expect(JSON.parse(read('../package-lock.json')).packages[''].license).toBe('MIT');
    expect(JSON.parse(read('../electron-builder.json')).files).toEqual(expect.arrayContaining(['LICENSE', 'THIRD_PARTY_NOTICES.md']));
    expect(read('../THIRD_PARTY_NOTICES.md')).toContain('they are not relicensed');
    expect(read('./main.js')).toContain("import projectLicence from '../LICENSE?raw'");
    expect(read('./main.js')).toContain("$('#project-licence').textContent = projectLicence");
  });
  it('places the Licences button in Credits and labels its scrollable dialog', () => {
    const html = read('../index.html');
    const credits = html.match(/<section class="credits-section"[\s\S]*?<\/section>/)[0];
    expect(credits).toContain('id="licences-button"');
    expect(credits).toContain('aria-haspopup="dialog" aria-controls="licences-dialog"');
    expect(credits).toContain('>Licences</button>');
    expect(html).toContain('<dialog id="licences-dialog" aria-labelledby="licences-title">');
    expect(html).toContain('aria-label="Close licences"');
    expect(read('./style.css')).toContain('#third-party-notices { white-space: pre-wrap; overflow-wrap: anywhere;');
  });
  it('bundles the canonical notice document and displays it as safe text, without a network request', () => {
    const main = read('./main.js');
    expect(main).toContain("import thirdPartyNotices from '../THIRD_PARTY_NOTICES.md?raw'");
    expect(main).toContain("$('#third-party-notices').textContent = thirdPartyNotices");
    expect(main).not.toContain("$('#third-party-notices').innerHTML");
    expect(main).toContain("$('#licences-button').addEventListener('click', openLicences)");
    expect(main).toContain("$('#close-licences').addEventListener('click', closeLicences)");
    expect(main).toContain("$('#scene-timers-dialog').open || $('#licences-dialog').open");
    expect(main).toContain("$('#licences-dialog').addEventListener('close', restoreDialogFocus)");
  });
});
