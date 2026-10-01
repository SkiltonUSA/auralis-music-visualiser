import "./style.css";
import { AudioEngine } from "./audio-engine.js";
import { ParticleOverlay } from "./particle-overlay.js";
import { VisualEngine } from "./visual-engine.js";
import { scenes } from "./scenes.js";
import { SceneRotation, SceneDwell, SceneDurations, sceneCutReady, loadSceneDurations, ROTATION_STORAGE_KEY, DURATION_STORAGE_KEY } from "./scene-rotation.js";
import { createSceneOptions } from "./scene-options.js";
import { version } from '../package.json';
import { shortcutAction } from "./shortcuts.js";
import { DeckOscilloscope } from "./deck-oscilloscope.js";
import thirdPartyNotices from '../THIRD_PARTY_NOTICES.md?raw';
import projectLicence from '../LICENSE?raw';
import { updateRangeFill } from './range-fill.js';
import { MicrophoneControls } from './microphone-controls.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
let disabledScenes = [];
try { disabledScenes = JSON.parse(localStorage.getItem(ROTATION_STORAGE_KEY) || "[]"); } catch { /* Storage is optional. */ }
const rotation = new SceneRotation(scenes.map(scene => scene.renderMode), disabledScenes);
let savedDurations = {};
try { savedDurations = loadSceneDurations(localStorage); } catch { /* Storage is optional. */ }
const durations = new SceneDurations(scenes, savedDurations);
const sceneDwell = new SceneDwell();
let sceneOptions;

const initialSceneIndex = rotation.next(-1) ?? 0;
const visual = new VisualEngine($("#visual-stage"), scenes[initialSceneIndex].renderMode);
const particles = new ParticleOverlay($("#p5-stage"));
const audio = new AudioEngine($("#file-player"));
const deckOscilloscope = new DeckOscilloscope($("#deck-oscilloscope"));
let lastFrame = performance.now(), mode = initialSceneIndex, palette = 0, paused = false, uiHidden = false, visualOnly = false, toastTimeout;
let autoDirector = true, beatsSinceCut = 0, lastHandledBeat = 0, directedCuts = 0;
let experienceStarted = false;
let lastUiUpdate = 0, lastParticleFrame = 0, renderQuality = "auto";

function showToast(message, tone = "default") {
  const toast = $("#toast"); toast.textContent = message; toast.dataset.tone = tone; toast.classList.add("visible");
  clearTimeout(toastTimeout); toastTimeout = setTimeout(() => toast.classList.remove("visible"), 3200);
}
function setSource(name, sourceMode) {
  $("#source-name").textContent = name.toUpperCase().slice(0, 26);
  $("#signal-status").dataset.source = sourceMode;
  $("#signal-dot").classList.toggle("live", sourceMode !== "demo");
  beatsSinceCut = 0; lastHandledBeat = 0;
}
function dismissWelcome() {
  experienceStarted = true;
  $("#welcome").classList.add("dismissed");
  setTimeout(() => $("#welcome").setAttribute("aria-hidden", "true"), 700);
}
const microphoneControls = new MicrophoneControls(audio, {
  desktop: location.protocol === 'auralis:',
  openMicrophoneSettings: () => window.auralisDesktop?.openMicrophoneSettings() ?? false,
  render: ({ status, label, copy, detail }) => {
    $$('#mic-button, #mic-button-panel').forEach(button => {
      button.disabled = status === 'pending' || status === 'live';
      button.setAttribute('aria-busy', String(status === 'pending'));
      button.setAttribute('aria-pressed', String(status === 'live'));
    });
    $$('[data-mic-label]').forEach(element => { element.textContent = label; });
    $$('[data-mic-copy]').forEach(element => { element.textContent = copy; });
    $$('[data-mic-status]').forEach(element => { element.textContent = detail;element.hidden = !detail;element.dataset.state = status; });
    $$('[data-mic-cancel]').forEach(button => { button.hidden = status !== 'pending'; });
  },
  onLive: name => {
    setSource(name, 'microphone');dismissWelcome();closePanel();
    showToast('Microphone is on · change source in Options');
  },
});
const startMicrophone = () => microphoneControls.start();
audio.onMicrophoneEnded = () => {
  setSource('Demo signal', 'demo');microphoneControls.disconnected();
  showToast('Microphone disconnected · using Demo. Reconnect and try again in Options.', 'error');
};
audio.onDemoTrackChanged = track => setSource(`Demo · ${track.title}`, 'demo-music');
async function useDemo() {
  microphoneControls.cancel();microphoneControls.show('idle');
  showToast('Loading demo music…');
  try {
    const track = await audio.useDemoMusic();
    if (!track) return;
    setSource(`Demo · ${track.title}`, 'demo-music');dismissWelcome();closePanel();
    showToast(`Playing ${track.title} · Demo music changes every 50 seconds`);
  } catch {
    showToast('Demo music could not start. Try again, Load music, or Use microphone.', 'error');
  }
}
async function useAudioFile(file) {
  if (!file) return;
  microphoneControls.cancel();
  try {
    const name = await audio.useFile(file);
    if (!name) return;
    microphoneControls.show('idle');
    setSource(name, "file"); dismissWelcome(); closePanel(); showToast(`Playing ${name}`);
  } catch (error) {
    audio.useDemo();microphoneControls.show('idle');setSource('Demo signal', 'demo');
    showToast('That audio file could not be played. Demo is active.', 'error');
  }
}
function updateSceneButtons() {
  $$(".scene-button").forEach((button, index) => {
    const enabled = rotation.isEnabled(index), current = index === mode;
    button.classList.toggle("active", current);
    button.classList.toggle("is-enabled", enabled);
    button.classList.toggle("is-disabled", !enabled);
    button.setAttribute("aria-pressed", String(enabled));
    button.setAttribute("aria-label", `${scenes[index].title} in Auto Director rotation`);
    if (current) button.setAttribute("aria-current", "true");
    else button.removeAttribute("aria-current");
    button.title = `${scenes[index].title}: ${enabled ? "ON — click to exclude" : "OFF — click to include"}${current ? " · Currently displayed" : ""}`;
  });
  $("#rotation-summary").textContent = `${rotation.count} / ${scenes.length} scenes enabled · Per-scene timing`;
  sceneOptions?.update(mode);
}
function toggleSceneRotation(value) {
  const index = Number(value), enabled = rotation.toggle(index);
  if (enabled === undefined) return;
  try { localStorage.setItem(ROTATION_STORAGE_KEY, JSON.stringify(rotation.disabledModes)); } catch { /* Keep session choices if storage is unavailable. */ }
  beatsSinceCut = 0;
  if (autoDirector && !rotation.isEnabled(mode) && rotation.count > 0) setMode(rotation.next(mode));
  updateSceneButtons();
  showToast(`${scenes[index].title} ${enabled ? "included in" : "excluded from"} Auto Director${rotation.count === 0 ? " — holding current scene" : ""}`);
}
function saveSceneDurations() {
  try { localStorage.setItem(DURATION_STORAGE_KEY, JSON.stringify(durations.overrides)); } catch { /* Keep session choices if storage is unavailable. */ }
}
function resetSceneTiming() {
  durations.reset();saveSceneDurations();sceneDwell.reset(durations.get(scenes[mode].renderMode));beatsSinceCut = 0;
  $('#scene-timer-feedback').textContent = 'Default times restored.';
  sceneOptions.update(mode);showToast('Scene times reset · Horizon 20s · Neon City 30s · others 5s');
}
function openTimerWindow() {
  closeLicences();closeAbout();
  if (visualOnly || uiHidden) setInterfaceVisible();
  closePanel();sceneOptions.update(mode);
  const dialog = $('#scene-timers-dialog');
  if (!dialog.open) dialog.showModal();
}
function closeTimers() { $('#scene-timers-dialog').close(); }
function openAbout() {
  if (visualOnly || uiHidden) setInterfaceVisible();
  closeLicences();closeTimers();closePanel();
  const dialog = $('#about-dialog');
  if (!dialog.open) { dialog.showModal();dialog.scrollTop = 0; }
}
function closeAbout() { $('#about-dialog').close(); }
function openLicences() {
  if (visualOnly || uiHidden) setInterfaceVisible();
  closeTimers();closePanel();
  const dialog = $('#licences-dialog');
  if (!dialog.open) { dialog.showModal();dialog.scrollTop = 0; }
}
function closeLicences() { $('#licences-dialog').close(); }
function setSceneDuration(index, seconds) {
  if (!durations.set(scenes[index].renderMode, seconds)) {
    $('#scene-timer-feedback').textContent = 'Enter 5–600 seconds, or 0 for 16-beat timing.';
    showToast('Enter 5–600 seconds, or 0 for 16-beat timing.', 'error');return;
  }
  $('#scene-timer-feedback').textContent = `${scenes[index].title}: ${seconds ? `${seconds} seconds` : '16 beats'} saved.`;
  saveSceneDurations();
  if (index === mode) { sceneDwell.reset(seconds);beatsSinceCut = 0; }
  sceneOptions.update(mode);
  showToast(`${scenes[index].title}: ${seconds ? `${seconds} seconds` : '16 beats'}${index === mode ? ' · timer restarted' : ''}`);
}
function setMode(nextMode, { manual = false } = {}) {
  const index = Number(nextMode);
  if (!Number.isInteger(index) || !scenes[index]) return;
  mode = index;
  const scene = scenes[mode];
  sceneDwell.reset(durations.get(scene.renderMode));
  visual.setMode(scene.renderMode, !experienceStarted);
  if (manual) beatsSinceCut = 0;
  updateSceneButtons();
  const activeButton = $(`.scene-button[data-mode="${mode}"]`);
  if (activeButton) {
    // Scroll only the scene rail: scrollIntoView also scrolls the full-screen
    // app when selecting a low item, pushing the visual canvas off screen.
    const rail = activeButton.parentElement;
    const item = activeButton.getBoundingClientRect();
    const bounds = rail.getBoundingClientRect();
    rail.scrollTo({ top: rail.scrollTop + item.top - bounds.top - (bounds.height - item.height) / 2,
      left: rail.scrollLeft + item.left - bounds.left - (bounds.width - item.width) / 2, behavior: "smooth" });
  }
  $("#scene-title").textContent = scene.title; $("#scene-kicker").textContent = scene.kicker;
  $(".scene-title").classList.remove("change"); requestAnimationFrame(() => $(".scene-title").classList.add("change"));
}
function setPalette(nextPalette) {
  palette = Number(nextPalette); visual.setPalette(palette);
  $$(".swatch").forEach((button, index) => {
    const active = index === palette; button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active));
  });
}
function setPaused(nextPaused) {
  paused = nextPaused; visual.setPaused(paused); $("#pause-button").classList.toggle("paused", paused);
  $("#pause-button").setAttribute("aria-label", paused ? "Resume visual" : "Pause visual");
}
function setAutoDirector(enabled) {
  autoDirector = enabled;
  const toggle = $("#director-toggle");
  toggle.setAttribute("aria-checked", String(enabled)); toggle.classList.toggle("active", enabled);
  if (enabled) {
    beatsSinceCut = 0;
    sceneDwell.reset(durations.get(scenes[mode].renderMode));
    if (!rotation.isEnabled(mode) && rotation.count > 0) setMode(rotation.next(mode));
  }
}
function setRenderQuality(quality, announce = true) {
  renderQuality = quality;
  visual.setQuality(quality);
  particles.setQuality(quality);
  $$(".quality-button").forEach((button) => {
    const active = button.dataset.quality === quality;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  if (announce) showToast(`${quality.toUpperCase()} render quality active`);
}
function runDirector(state, delta) {
  const active = experienceStarted && autoDirector && !paused && !document.hidden && !visual.blend.active;
  sceneDwell.update(delta, active && rotation.count > 0);
  if (!active || rotation.count === 0) return;
  const newBeat = state.transient && state.beatCount !== lastHandledBeat;
  if (newBeat) lastHandledBeat = state.beatCount;
  const next = rotation.next(mode);
  if (next === mode) { beatsSinceCut = 0; return; }
  if (newBeat) beatsSinceCut = Math.min(16, beatsSinceCut + 1);
  if (!sceneCutReady(durations.get(scenes[mode].renderMode), sceneDwell, beatsSinceCut, newBeat)) return;
  directedCuts += 1;
  beatsSinceCut = 0;
  setMode(next);
  if (directedCuts % 2 === 0) setPalette((palette + 1) % 4);
}
function openPanel() {
  closeLicences();closeAbout();
  closeTimers();
  if (visualOnly || uiHidden) setInterfaceVisible();
  $("#settings-panel").classList.add("open"); $("#panel-scrim").classList.add("open");
  $("#settings-panel").setAttribute("aria-hidden", "false"); $("#settings-button").setAttribute("aria-expanded", "true");
}
function togglePanel() {
  if ($("#settings-panel").classList.contains("open")) closePanel(); else openPanel();
}
function setInterfaceVisible() {
  visualOnly = false; uiHidden = false;
  document.body.classList.remove("visual-only", "ui-hidden");
  $$(".interface").forEach(element => { element.inert = false; });
}
function toggleVisualOnly() {
  if (visualOnly || uiHidden) { setInterfaceVisible(); return; }
  visualOnly = true;
  closeLicences();closeAbout();
  closeTimers();
  closePanel();
  document.activeElement?.blur();
  document.body.classList.add("visual-only");
  $$(".interface").forEach(element => { element.inert = true; });
}
function toggleInterface() {
  if (visualOnly || uiHidden) { setInterfaceVisible(); return; }
  uiHidden = true; closeLicences();closeAbout();closeTimers();closePanel(); document.activeElement?.blur();
  document.body.classList.add("ui-hidden");
  $$(".interface").forEach(element => { element.inert = true; });
}
function loadMusic() {
  const input = $("#audio-file");
  input.value = ""; // Selecting the same track again must still fire change.
  input.click();
}
function closePanel() {
  $("#settings-panel").classList.remove("open"); $("#panel-scrim").classList.remove("open");
  $("#settings-panel").setAttribute("aria-hidden", "true"); $("#settings-button").setAttribute("aria-expanded", "false");
}
async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); else await document.exitFullscreen();
  } catch { showToast("Fullscreen is not available in this browser.", "error"); }
}
function updateTelemetry(state, performance) {
  [["bass", state.bass], ["mid", state.mid], ["high", state.high]].forEach(([name, value]) => {
    $(`#${name}-value`).textContent = String(Math.round(value * 99)).padStart(2, "0");
    $(`#${name}-bar`).style.transform = `scaleX(${Math.max(0.02, value)})`;
  });
  $("#beat-orb").style.setProperty("--beat", state.beat);
  $("#beat-label").textContent = state.barBeat ? `TEMPO / ${state.barBeat}` : "TEMPO / —";
  $("#tempo-value").textContent = state.bpm ? `${state.bpm} BPM` : "CALIBRATING";
  $("#fps-value").textContent = `${performance.fps} FPS`;
  $("#cinema-frame").style.setProperty("--impact", state.beat);
  $("#performance-readout").textContent = `${performance.quality.toUpperCase()} QUALITY`;
  const activeMeter = Math.round(state.level * 8);
  $$("#micro-meter i").forEach((segment, index) => segment.classList.toggle("active", index < activeMeter));
}
function animate(now) {
  const delta = (now - lastFrame) / 1000; lastFrame = now;
  // Show the startup warning before generating any animated visual effects.
  if (!experienceStarted) { requestAnimationFrame(animate);return; }
  const state = audio.update(now); runDirector(state, delta);
  // The waveform already carries global Response; retain only its fixed display calibration.
  deckOscilloscope.update(state.waveform, 1.2, now, paused, uiHidden || visualOnly);
  const performance = visual.render(state, delta);
  particles.setLayers(visual.blend.active ? [
    { mode: visual.blend.previous, palette: visual.previousPalette, weight: 1 - visual.blend.weight },
    { mode: visual.mode, palette: visual.palette, weight: visual.blend.weight },
  ] : [{ mode: visual.mode, palette: visual.palette, weight: 1 }]);
  const particleInterval = renderQuality === "ultra" ? 1000 / 60 : 1000 / 45;
  if (!paused && (visual.blend.active || now - lastParticleFrame >= particleInterval)) { particles.render(state, visual.radialMotion.angle, visual.elapsed); lastParticleFrame = now; }
  if (now - lastUiUpdate >= 66) { updateTelemetry(state, performance); lastUiUpdate = now; }
  requestAnimationFrame(animate);
}

$("#mic-button").addEventListener("click", startMicrophone);
$("#mic-button-panel").addEventListener("click", startMicrophone);
$$('[data-mic-cancel]').forEach(button => button.addEventListener('click', () => microphoneControls.cancel()));
$("#demo-button").addEventListener("click", useDemo);
$("#load-music-button").addEventListener("click", loadMusic);
$("#demo-button-panel").addEventListener("click", useDemo);
$("#audio-file").addEventListener("change", (event) => useAudioFile(event.target.files[0]));
$("#signal-status").addEventListener("click", openPanel);
$("#settings-button").addEventListener("click", togglePanel);
$("#settings-close").addEventListener("click", closePanel);
$("#panel-scrim").addEventListener("click", closePanel);
$("#fullscreen-button").addEventListener("click", toggleFullscreen);
$("#pause-button").addEventListener("click", () => setPaused(!paused));
updateRangeFill($("#sensitivity"));
$("#sensitivity").addEventListener("input", (event) => {
  audio.setSensitivity(event.target.value); $("#sensitivity-value").textContent = `${audio.sensitivity.toFixed(2)}×`;
  updateRangeFill(event.target);
});
$("#particles-toggle").addEventListener("click", (event) => {
  const nextVisible = event.currentTarget.getAttribute("aria-checked") !== "true";
  event.currentTarget.setAttribute("aria-checked", String(nextVisible)); event.currentTarget.classList.toggle("active", nextVisible); particles.setVisible(nextVisible);
});
$("#director-toggle").addEventListener("click", () => setAutoDirector(!autoDirector));
$$(".quality-button").forEach((button) => button.addEventListener("click", () => setRenderQuality(button.dataset.quality)));
$$(".scene-button").forEach((button) => button.addEventListener("click", () => toggleSceneRotation(button.dataset.mode)));
$("#open-timers-button").addEventListener('click', openTimerWindow);
sceneOptions = createSceneOptions($('#scene-options-list'), scenes, { rotation, durations, onToggle: toggleSceneRotation, onDuration: setSceneDuration });
$('#reset-scene-timing').addEventListener('click', resetSceneTiming);
$('#close-timers').addEventListener('click', closeTimers);
$('#scene-timers-dialog').addEventListener('click', event => { if (event.target === event.currentTarget) closeTimers(); });
function restoreDialogFocus() {
  if (!document.querySelector('dialog[open]')) $('#settings-button').focus({ preventScroll: true });
}
$('#scene-timers-dialog').addEventListener('close', restoreDialogFocus);
$('#about-button').addEventListener('click', openAbout);
$('#close-about').addEventListener('click', closeAbout);
$('#about-dialog').addEventListener('click', event => { if (event.target === event.currentTarget) closeAbout(); });
$('#about-dialog').addEventListener('close', restoreDialogFocus);
$('#about-version').textContent = `Version ${version} · © 2026 Studio313`;
$('#third-party-notices').textContent = thirdPartyNotices;
$('#project-licence').textContent = projectLicence;
$('#licences-button').addEventListener('click', openLicences);
$('#close-licences').addEventListener('click', closeLicences);
$('#licences-dialog').addEventListener('click', event => { if (event.target === event.currentTarget) closeLicences(); });
$('#licences-dialog').addEventListener('close', restoreDialogFocus);
$("#app-version").textContent = `Auralis v${version} · by Studio313`;
$$(".swatch").forEach((button) => button.addEventListener("click", () => setPalette(button.dataset.palette)));
const menuActions = { load: loadMusic, microphone: startMicrophone, demo: useDemo, options: togglePanel,
    timers: openTimerWindow, about: openAbout,
    director: () => setAutoDirector(!autoDirector), fullscreen: toggleFullscreen, interface: toggleInterface,
    visualOnly: toggleVisualOnly, pause: () => setPaused(!paused), escape: () => { closeLicences();closeAbout();closeTimers();closePanel(); },
    previous: () => setMode((mode - 1 + scenes.length) % scenes.length, { manual: true }),
    next: () => setMode((mode + 1) % scenes.length, { manual: true }) };
window.addEventListener('auralis:menu-action', event => {
  if (typeof event.detail === 'string' && Object.hasOwn(menuActions, event.detail)) menuActions[event.detail]();
});
window.addEventListener("keydown", (event) => {
  if ($('#scene-timers-dialog').open || $('#licences-dialog').open || $('#about-dialog').open) {
    if (event.key === 'Escape') {
      event.preventDefault();
      if ($('#licences-dialog').open) closeLicences();
      else if ($('#about-dialog').open) closeAbout();
      else closeTimers();
    }
    else if (shortcutAction(event) === 'visualOnly') { event.preventDefault();toggleVisualOnly(); }
    return;
  }
  const action = shortcutAction(event);
  if (!action) return;
  event.preventDefault();
  if (action.startsWith('scene:')) { setMode(Number(action.slice(6)), { manual: true }); return; }
  menuActions[action]?.();
});
document.addEventListener("fullscreenchange", () => {
  const active = Boolean(document.fullscreenElement), button = $("#fullscreen-button");
  button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active));
  button.setAttribute('aria-label', active ? "Exit fullscreen" : "Enter fullscreen");
});
setMode(initialSceneIndex); setPalette(0); setAutoDirector(true); setRenderQuality("auto", false); requestAnimationFrame(animate);
