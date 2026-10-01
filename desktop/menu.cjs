// Only fixed action names are sent to the renderer; no renderer-to-main bridge.
function menuTemplate(activate) {
  const action = (label, id, accelerator) => ({ label, accelerator, click: () => activate(id) });
  return [
    { label: 'Auralis', submenu: [action('About Auralis', 'about'), { type: 'separator' }, { role: 'hide' },
      { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
    { label: 'File', submenu: [
      action('Load Music…', 'load', 'CmdOrCtrl+O'),
      action('Use Microphone', 'microphone', 'CmdOrCtrl+Shift+M'),
      action('Demo Music', 'demo', 'CmdOrCtrl+Shift+D'),
      { type: 'separator' }, { role: 'close' },
    ] },
    { label: 'Visualiser', submenu: [
      action('Pause / Resume', 'pause'),
      action('Auto Director On / Off', 'director'),
      { type: 'separator' },
      action('Previous Scene', 'previous', 'CmdOrCtrl+Left'),
      action('Next Scene', 'next', 'CmdOrCtrl+Right'),
    ] },
    { label: 'View', submenu: [
      action('Full Screen', 'fullscreen', 'Control+Command+F'),
      action('Hide / Show Options', 'visualOnly', 'CmdOrCtrl+Shift+H'),
      action('Options…', 'options', 'CmdOrCtrl+,'),
      action('Scene Timers…', 'timers', 'CmdOrCtrl+Shift+T'),
      { type: 'separator' }, { role: 'reload' },
    ] },
  ];
}
module.exports = { menuTemplate };
