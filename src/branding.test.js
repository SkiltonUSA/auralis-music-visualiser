import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ROTATION_STORAGE_KEY } from "./scene-rotation.js";

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

describe("Auralis by Studio313", () => {
  it('launches a signed branded bundle by default instead of the Electron host',()=>{
    const pkg=JSON.parse(read('../package.json')),launcher=read('../scripts/run-desktop.mjs');
    expect(pkg.scripts.desktop).toBe('node scripts/run-desktop.mjs');
    expect(pkg.scripts['desktop:unpackaged']).toContain('electron .');
    expect(launcher).toContain('.context/desktop/Auralis.app');
    expect(launcher).toContain("'--config.mac.notarize=false'");
    expect(launcher).not.toMatch(/identity=null|forceCodeSigning=false/);
    expect(launcher).toContain("run('codesign', ['--verify', '--deep', '--strict', built])");
    expect(launcher.indexOf("run('codesign'")).toBeLessThan(launcher.indexOf("process.kill(pid, 'SIGTERM')"));
  });
  it("credits Studio313 as maker without replacing the product name", () => {
    const html = read('../index.html');
    expect(html).toContain('<meta name="application-name" content="Auralis"');
    expect(html).toContain('<meta name="author" content="Studio313"');
    expect(html).toContain('<title>Auralis by Studio313 — make sound visible</title>');
    expect(html).toContain('class="brand-word">AURALIS</span>');
    expect(html).toContain('class="brand-maker">by Studio313</span>');
    expect(html).not.toContain('LIVE / 01');
    expect(html).not.toContain('brand-edition');
    expect(read('./style.css')).not.toContain('.brand-edition');
    expect(read('../public/auralis.svg')).toContain('<title>Auralis by Studio313</title>');
  });
  it("preserves project identity and existing saved scene selections", () => {
    expect(JSON.parse(read('../package.json')).name).toBe('auralis-music-visualiser');
    expect(JSON.parse(read('../package-lock.json')).name).toBe('auralis-music-visualiser');
    expect(ROTATION_STORAGE_KEY).toBe('auralis.disabled-scenes.v1');
    expect(read('../README.md')).toContain('Made by **Studio313**.');
  });
});
