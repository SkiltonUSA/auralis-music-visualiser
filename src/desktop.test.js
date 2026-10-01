import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import security from '../desktop/security.cjs';
import { menuTemplate } from '../desktop/menu.cjs';

const { isAppUrl, assetPath, allowsAudioRequest, CSP } = security;
const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');

describe('Mac desktop wrapper', () => {
  it('keeps only Auralis, File, Visualiser and View menus', () => {
    const menu = menuTemplate(() => {});
    expect(menu.map(item => item.label)).toEqual(['Auralis', 'File', 'Visualiser', 'View']);
    expect(JSON.stringify(menu)).not.toMatch(/editMenu|windowMenu/);
  });
  it('offers local audio sources without Spotify code or account access', () => {
    expect(read('desktop/main.cjs')).not.toMatch(/spotify|safeStorage|clipboard|openExternal/i);
    expect(readdirSync(new URL('../desktop', import.meta.url)).some(file => /spotify/i.test(file))).toBe(false);
    const menu = menuTemplate(() => {});
    expect(JSON.stringify(menu)).not.toMatch(/spotify/i);
    expect(menu.find(item => item.label === 'File').submenu.filter(item => item.label).map(item => item.label))
      .toEqual(['Load Music…', 'Use Microphone', 'Demo Music']);
    expect(read('README.md')).not.toContain('Spotify account sign-in');
  });
  it('serves only the packaged app origin and contains decoded paths', () => {
    const root = path.resolve('dist');
    expect(assetPath('auralis://app/', root)).toBe(path.join(root, 'index.html'));
    expect(assetPath('auralis://app/assets/main.js', root)).toBe(path.join(root, 'assets/main.js'));
    for (const url of ['https://app/', 'file:///etc/passwd', 'auralis://other/', 'auralis://app:123/',
      'auralis://user:pass@app/', 'not a URL']) {
      expect(isAppUrl(url)).toBe(false); expect(assetPath(url, root)).toBeNull();
    }
    for (const url of ['auralis://app/%2e%2e%2fsecret', 'auralis://app/%00', 'auralis://app/%5csecret', 'auralis://app/%zz']) {
      expect(assetPath(url, root)).toBeNull();
    }
  });
  it('permits only microphone requests from the local main frame', () => {
    const request = { requestingUrl: 'auralis://app/', isMainFrame: true, mediaTypes: ['audio'] };
    expect(allowsAudioRequest('media', request)).toBe(true);
    for (const mediaTypes of [[], ['video'], ['audio', 'video'], undefined]) {
      expect(allowsAudioRequest('media', { ...request, mediaTypes })).toBe(false);
    }
    expect(allowsAudioRequest('media', { ...request, isMainFrame: false })).toBe(false);
    expect(allowsAudioRequest('media', { ...request, requestingUrl: 'https://example.com' })).toBe(false);
    expect(allowsAudioRequest('display-capture', request)).toBe(false);
    expect(allowsAudioRequest('geolocation', request)).toBe(false);
  });
  it('keeps renderer sandboxing and a restrictive offline content policy', () => {
    const source = read('desktop/main.cjs');
    expect(source).toContain('nodeIntegration: false');
    expect(source).toContain('contextIsolation: true, sandbox: true');
    expect(source).toContain("action: 'deny'");
    expect(CSP).toContain("script-src 'self'");
    expect(CSP).toContain("frame-src 'none'");
    expect(CSP).not.toContain('unsafe-eval');
    expect(source).not.toContain('disableHardwareAcceleration');
  });
  it('packages an Apple Silicon DMG with microphone disclosure and no publishing', () => {
    const config = JSON.parse(read('electron-builder.json'));
    expect(config.productName).toBe('Auralis');
    expect(config.appId).toBe('com.studio313.auralis');
    expect(config.mac.target).toEqual([{ target: 'dmg', arch: ['arm64'] }]);
    expect(config.mac.extendInfo.NSMicrophoneUsageDescription).toContain('Studio313');
    expect(config.mac.extendInfo.NSCameraUsageDescription).toBeUndefined();
    expect(config.mac.identity).toBe('Dominic Skilton (6673FTYMJM)');
    expect(config.forceCodeSigning).toBe(true);
    expect(config.mac.hardenedRuntime).toBe(true);
    expect(config.mac.notarize).toBe(true);
    for (const executable of ['Auralis.app', 'Electron Framework.framework', 'Electron Framework', 'libEGL.dylib', 'chrome_crashpad_handler']) {
      expect(config.mac.signIgnore.some(pattern => new RegExp(pattern).test(executable))).toBe(false);
    }
    expect(config.dmg.sign).toBe(true);
    expect(config.dmg.writeUpdateInfo).toBe(false);
    expect(config.publish).toBeNull();
    expect(config.files).not.toContain('**/*');
    expect(JSON.parse(read('package.json')).main).toBe('desktop/main.cjs');
  });
  it('requires notarisation credentials and validates both release tickets', () => {
    const source = read('scripts/dist-mac.mjs');
    expect(source).toContain("process.env.APPLE_KEYCHAIN_PROFILE || 'auralis-notary'");
    expect(source.indexOf("'history'")).toBeLessThan(source.indexOf("['run', 'build']"));
    expect(source).toContain("['notarytool', 'submit', dmg, '--keychain-profile', profile, '--wait']");
    expect(source).toContain("['stapler', 'validate', dmg]");
    expect(source).toContain("['stapler', 'validate', app]");
    expect(source).toContain("['--assess', '--type', 'execute', '--verbose=2', app]");
  });
});
