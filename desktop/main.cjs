const { app, BrowserWindow, Menu, dialog, protocol, session, systemPreferences, ipcMain, shell } = require('electron');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { APP_URL, CSP, isAppUrl, assetPath, allowsAudioRequest } = require('./security.cjs');
const { menuTemplate } = require('./menu.cjs');
const { createMicrophoneSettingsHandler } = require('./microphone-settings.cjs');

app.setName('Auralis');
protocol.registerSchemesAsPrivileged([{ scheme: 'auralis', privileges: {
  standard: true, secure: true, supportFetchAPI: true, stream: true,
} }]);

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.json': 'application/json', '.mp3': 'audio/mpeg' };
let window;

function activateControl(action) {
  if (!window) {
    createWindow();
    window.webContents.once('did-finish-load', () => activateControl(action));
    return;
  }
  if (!isAppUrl(window.webContents.getURL())) return;
  if (window.isMinimized()) window.restore();
  window.show(); window.focus();
  // Fixed menu actions only. The separate preload exposes only microphone recovery.
  window.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent('auralis:menu-action', { detail: ${JSON.stringify(action)} }))`, true)
    .catch(() => {});
}

function createWindow() {
  window = new BrowserWindow({
    width: 1440, height: 900, minWidth: 800, minHeight: 600,
    title: 'Auralis by Studio313', backgroundColor: '#05040a', show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true,
      webSecurity: true, spellcheck: false, preload: path.join(__dirname, 'preload.cjs') },
  });
  window.once('ready-to-show', () => window?.show());
  window.on('closed', () => { window = null; });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (!isAppUrl(url)) event.preventDefault(); });
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.loadURL(APP_URL).catch(error => {
    dialog.showErrorBox('Auralis could not start', error.message);
    app.quit();
  });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
  app.whenReady().then(() => {
    ipcMain.handle('auralis:microphone-settings', createMicrophoneSettingsHandler({
      platform: process.platform, getWindow: () => window, systemPreferences, shell,
    }));
    const root = path.join(app.getAppPath(), 'dist');
    protocol.handle('auralis', async request => {
      if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405 });
      const file = assetPath(request.url, root);
      if (!file) return new Response(null, { status: 403 });
      try {
        const content = await readFile(file);
        return new Response(request.method === 'HEAD' ? null : content, { headers: {
          'Content-Type': types[path.extname(file)] || 'application/octet-stream',
          'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff',
        } });
      } catch { return new Response(null, { status: 404 }); }
    });
    const owned = contents => contents && contents === window?.webContents && isAppUrl(contents.getURL());
    session.defaultSession.setPermissionCheckHandler((contents, permission, origin, details) => {
      if (!owned(contents) || !isAppUrl(origin) || details.isMainFrame === false) return false;
      return permission === 'fullscreen' || (permission === 'media' && details.mediaType === 'audio');
    });
    session.defaultSession.setPermissionRequestHandler(async (contents, permission, callback, details) => {
      if (!owned(contents)) return callback(false);
      if (permission === 'fullscreen' && isAppUrl(details.requestingUrl)) return callback(true);
      if (!allowsAudioRequest(permission, details)) return callback(false);
      try {
        const allowed = process.platform !== 'darwin' || await systemPreferences.askForMediaAccess('microphone');
        callback(Boolean(allowed) && !contents.isDestroyed() && owned(contents));
      } catch { callback(false); }
    });
    session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => callback({}));
    const menus = menuTemplate(activateControl);
    Menu.setApplicationMenu(Menu.buildFromTemplate(menus));
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  }).catch(error => { dialog.showErrorBox('Auralis could not start', error.message); app.quit(); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
