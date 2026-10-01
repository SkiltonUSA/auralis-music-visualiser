const path = require('node:path');

const APP_URL = 'auralis://app/';
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' blob:; connect-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";

function isAppUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'auralis:' && url.hostname === 'app' && !url.port && !url.username && !url.password;
  } catch { return false; }
}

function assetPath(value, root) {
  if (!isAppUrl(value)) return null;
  try {
    const pathname = decodeURIComponent(new URL(value).pathname);
    if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').includes('..')) return null;
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    return file.startsWith(path.resolve(root) + path.sep) ? file : null;
  } catch { return null; }
}

function allowsAudioRequest(permission, details = {}) {
  return permission === 'media' && isAppUrl(details.requestingUrl) && details.isMainFrame !== false &&
    Array.isArray(details.mediaTypes) && details.mediaTypes.length === 1 && details.mediaTypes[0] === 'audio';
}

module.exports = { APP_URL, CSP, isAppUrl, assetPath, allowsAudioRequest };
