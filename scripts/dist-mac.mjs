import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  throw new Error('Build this release on an Apple Silicon Mac.');
}
const root = fileURLToPath(new URL('../', import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const profile = process.env.APPLE_KEYCHAIN_PROFILE || 'auralis-notary';
const env = { ...process.env, APPLE_KEYCHAIN_PROFILE: profile };
const run = (command, args) => execFileSync(command, args, { cwd: root, env, stdio: 'inherit' });
// Fail before building if the profile is missing or Apple rejects its credentials.
run('xcrun', ['notarytool', 'history', '--keychain-profile', profile]);
run('npm', ['run', 'build']);
run(process.execPath, ['scripts/build-app-icon.mjs']);
run(path.join(root, 'node_modules/.bin/electron-builder'), ['--mac', 'dmg', '--arm64', '--publish', 'never']);
// electron-builder notarises/staples the app. Also notarise/staple the final,
// signed container so Gatekeeper can validate the DMG without a network lookup.
const dmg = path.join(root, 'release', `Auralis-${pkg.version}-mac-arm64.dmg`);
run('xcrun', ['notarytool', 'submit', dmg, '--keychain-profile', profile, '--wait']);
run('xcrun', ['stapler', 'staple', dmg]);
run('xcrun', ['stapler', 'validate', dmg]);
const app = path.join(root, 'release/mac-arm64/Auralis.app');
run('xcrun', ['stapler', 'validate', app]);
run('codesign', ['--verify', '--deep', '--strict', app]);
run('spctl', ['--assess', '--type', 'execute', '--verbose=2', app]);
console.log(`Signed and notarised DMG: ${dmg}`);
