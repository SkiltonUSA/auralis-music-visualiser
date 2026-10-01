const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('auralisDesktop', Object.freeze({
  openMicrophoneSettings: () => ipcRenderer.invoke('auralis:microphone-settings'),
}));
