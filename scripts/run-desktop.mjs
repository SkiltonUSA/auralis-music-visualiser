import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  throw new Error('The branded desktop launcher requires an Apple Silicon Mac. Use desktop:unpackaged for other development environments.');
}
const root = fileURLToPath(new URL('../', import.meta.url));
const run = (command, args) => execFileSync(command, args, { cwd: root, stdio: 'inherit' });
mkdirSync(path.join(root, '.context'), { recursive: true });
const staging = mkdtempSync(path.join(root, '.context/desktop-build-'));
const destination = path.join(root, '.context/desktop/Auralis.app');

run('npm', ['run', 'build']);
run(process.execPath, ['scripts/build-app-icon.mjs']);
// Use the release bundle ID, icon and Developer ID identity for local runs too.
// Signing remains mandatory; a local preview does not produce/notarise a DMG.
run(path.join(root, 'node_modules/.bin/electron-builder'), ['--mac', '--dir', '--arm64', '--publish', 'never',
  `--config.directories.output=${staging}`, '--config.mac.notarize=false']);
const built = path.join(staging, 'mac-arm64/Auralis.app');
run('codesign', ['--verify', '--deep', '--strict', built]);

// Close only this workspace's preview, after the replacement built successfully.
// Do not terminate an independently installed app in /Applications.
const executables = [path.join(destination, 'Contents/MacOS/Auralis'),
  path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')];
const processes = execFileSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' });
const stopped = [];
for (const line of processes.split('\n')) {
  const match = line.trim().match(/^(\d+)\s+(.+)$/);
  if (!match || !executables.some(executable => match[2] === executable || match[2].startsWith(executable + ' '))) continue;
  const pid = Number(match[1]);
  try { process.kill(pid, 'SIGTERM'); stopped.push(pid); } catch (error) { if (error.code !== 'ESRCH') throw error; }
}
const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; throw error; } };
for (let i = 0; i < 50 && stopped.some(alive); i++) await new Promise(resolve => setTimeout(resolve, 100));
if (stopped.some(alive)) throw new Error('The previous preview is still closing. Quit it and run npm run desktop again. The new build is preserved in ' + staging);
mkdirSync(path.dirname(destination), { recursive: true });
if (existsSync(destination)) renameSync(destination, path.join(staging, 'previous-Auralis.app'));
renameSync(built, destination);
run('open', [destination]);
console.log(`Launched signed Auralis preview: ${destination}\nRelease DMG unchanged. Previous preview, if any, retained in ${staging}.`);
