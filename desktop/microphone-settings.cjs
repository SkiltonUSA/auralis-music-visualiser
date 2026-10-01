const { isAppUrl } = require('./security.cjs');

const MICROPHONE_SETTINGS_URL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone';

// Only one fixed OS destination, from our own main frame, after macOS confirms
// denial. Never expose a general-purpose URL launcher to renderer code.
function createMicrophoneSettingsHandler({ platform, getWindow, systemPreferences, shell }) {
  let attempted = false;
  return async (event) => {
    try {
      const contents = getWindow()?.webContents;
      if (platform !== 'darwin' || attempted || !contents || contents.isDestroyed() ||
          event.sender !== contents || !event.senderFrame || event.senderFrame !== contents.mainFrame ||
          !isAppUrl(contents.getURL()) || !isAppUrl(event.senderFrame.url)) return false;
      const status = systemPreferences.getMediaAccessStatus('microphone');
      if (status !== 'denied' && status !== 'restricted') return false;
      attempted = true; // Also deduplicates concurrent invocations and failed OS launches.
      await shell.openExternal(MICROPHONE_SETTINGS_URL);
      return true;
    } catch { return false; }
  };
}

module.exports = { createMicrophoneSettingsHandler, MICROPHONE_SETTINGS_URL };
