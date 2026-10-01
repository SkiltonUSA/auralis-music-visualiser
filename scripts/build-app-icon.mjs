import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

if (process.platform !== 'darwin') throw Error('The Mac icon build needs macOS and its Command Line Tools.');
const root = fileURLToPath(new URL('../', import.meta.url));
const iconset = path.join(root, '.context/Auralis.iconset');
mkdirSync(iconset, { recursive: true });
mkdirSync(path.join(root, 'desktop/assets'), { recursive: true });
const cache = path.join(root, '.context/swift-module-cache');
mkdirSync(cache, { recursive: true });
execFileSync('/usr/bin/swift', ['-module-cache-path', cache, path.join(root, 'scripts/draw-app-icon.swift'), iconset], { stdio: 'inherit' });
execFileSync('/usr/bin/iconutil', ['-c', 'icns', iconset, '-o', path.join(root, 'desktop/assets/auralis.icns')], { stdio: 'inherit' });
console.log('Built desktop/assets/auralis.icns');
