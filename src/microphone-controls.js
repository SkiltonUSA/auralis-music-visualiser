export function microphoneErrorMessage(error, desktop = false) {
  switch (error?.name) {
    case 'NotAllowedError': case 'SecurityError':
      return desktop
        ? 'Microphone access is blocked. Open System Settings → Privacy & Security → Microphone, enable Auralis, then quit and reopen it.'
        : 'Microphone access is blocked. Allow it in this browser’s site permissions and, on Mac, System Settings → Privacy & Security → Microphone. Then try again.';
    case 'NotFoundError': case 'OverconstrainedError':
      return 'No microphone was found. Connect one and choose it in your system sound input settings, then try again.';
    case 'NotReadableError':
      return 'The microphone could not start. Check your sound input settings or close another app using the device, then try again.';
    case 'NotSupportedError':
      return 'Microphone access is unavailable here. Use the Auralis Mac app, HTTPS or localhost.';
    default:
      return 'The microphone could not start. Check your input device and try again, or use Demo or a music file.';
  }
}

// Welcome, Options, M and the native menu use one request and shared status.
export class MicrophoneControls {
  constructor(audio, { render, onLive, desktop = false, openMicrophoneSettings = async () => false }) {
    this.audio = audio;this.render = render;this.onLive = onLive;this.desktop = desktop;
    this.openMicrophoneSettings = openMicrophoneSettings;
    this.attempt = 0;this.pending = false;this.timer = null;
    this.show('idle');
  }
  show(status, detail = '') {
    this.render({ status, detail,
      label: status === 'pending' ? 'Connecting microphone…' : status === 'live' ? 'Microphone on' : status === 'error' ? 'Try microphone again' : 'Use microphone',
      copy: status === 'live' ? 'Listening to your system input' : 'Uses your current system input',
    });
  }
  async start() {
    if (this.pending || this.audio.mode === 'microphone') return;
    const attempt = ++this.attempt;this.pending = true;
    this.show('pending', 'Allow microphone access if prompted. You can cancel or choose Demo at any time.');
    this.timer = setTimeout(() => this.show('pending', 'Still waiting. Check the microphone permission prompt. Cancel to keep using your current source.'), 8000);
    try {
      const name = await this.audio.useMicrophone();
      if (attempt !== this.attempt) return;
      this.show('live');this.onLive(name);
    } catch (error) {
      if (attempt !== this.attempt) return;
      clearTimeout(this.timer);
      this.show('error', microphoneErrorMessage(error, this.desktop));
      if (this.desktop && ['NotAllowedError', 'SecurityError'].includes(error?.name)) {
        try {
          const opened = await this.openMicrophoneSettings();
          if (opened && attempt === this.attempt) this.show('error',
            'Opened System Settings → Privacy & Security → Microphone. Enable Auralis, then quit and reopen it.');
        } catch { /* Keep the manual settings instructions if the OS cannot open it. */ }
      }
    } finally {
      if (attempt === this.attempt) { clearTimeout(this.timer);this.pending = false; }
    }
  }
  cancel() {
    this.attempt++;clearTimeout(this.timer);this.pending = false;
    this.audio.cancelMicrophoneRequest();
    this.show(this.audio.mode === 'microphone' ? 'live' : 'idle');
  }
  disconnected() {
    this.cancel();this.show('error', 'The microphone disconnected. Demo is active. Reconnect your microphone and try again.');
  }
}
