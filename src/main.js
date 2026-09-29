import "./style.css";
import { AudioEngine } from "./audio-engine.js";
import { ParticleOverlay } from "./particle-overlay.js";
import { VisualEngine } from "./visual-engine.js";
import { scenes } from "./scenes.js";
import { SceneRotation, ROTATION_STORAGE_KEY } from "./scene-rotation.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
let disabledScenes = [];
try { disabledScenes = JSON.parse(localStorage.getItem(ROTATION_STORAGE_KEY) || "[]"); } catch { /* Storage is optional. */ }
const rotation = new SceneRotation(scenes.map(scene => scene.renderMode), disabledScenes);

const visual = new VisualEngine($("#visual-stage"));
const particles = new ParticleOverlay($("#p5-stage"));
const audio = new AudioEngine($("#file-player"));
const spectrumBars = Array.from({ length: 58 }, () => {
  const bar = document.createElement("i"); $("#spectrum").append(bar); return bar;
});
const frameChannels = Array.from({ length: 12 }, (_, index) => {
  const channel = document.createElement("b");
  channel.textContent = "000";
  channel.style.setProperty("--channel", index);
  $("#frame-data").append(channel);
  return channel;
});
let lastFrame = performance.now(), mode = 0, palette = 0, paused = false, uiHidden = false, visualOnly = false, toastTimeout;
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
async function startMicrophone() {
  $("#mic-action-copy").textContent = "Waiting for macOS…";
  try {
    const name = await audio.useMicrophone();
    setSource(name || "Mac microphone", "microphone"); dismissWelcome(); closePanel();
    showToast("Microphone is live — make some noise");
  } catch (error) {
    console.error(error); $("#mic-action-copy").textContent = "Permission was not granted";
    showToast("Allow microphone access in your browser settings, then try again.", "error");
  }
}
function useDemo() {
  audio.useDemo(); setSource("Demo signal", "demo"); dismissWelcome(); closePanel(); showToast("Demo signal active");
}
async function useAudioFile(file) {
  if (!file) return;
  try {
    const name = await audio.useFile(file);
    setSource(name, "file"); dismissWelcome(); closePanel(); showToast(`Playing ${name}`);
  } catch (error) { console.error(error); showToast("That audio file could not be played.", "error"); }
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
  $("#rotation-summary").textContent = `${rotation.count} / ${scenes.length} scenes enabled · 16 beats per scene`;
}
function updateDirectorStatus() {
  $("#director-status").classList.toggle("inactive", !autoDirector || rotation.count === 0);
  $("#director-text").textContent = !autoDirector ? "MANUAL DIRECTION"
    : rotation.count === 0 ? "AUTO · NO SCENES ENABLED · HOLDING"
    : rotation.count === 1 && rotation.isEnabled(mode) ? "AUTO · ONE SCENE · HOLDING"
    : beatsSinceCut > 0 ? `AUTO CUT · ${16 - beatsSinceCut} BEATS`
    : `AUTO DIRECTOR · ${rotation.count} SCENES`;
}
function toggleSceneRotation(value) {
  const index = Number(value), enabled = rotation.toggle(index);
  if (enabled === undefined) return;
  try { localStorage.setItem(ROTATION_STORAGE_KEY, JSON.stringify(rotation.disabledModes)); } catch { /* Keep session choices if storage is unavailable. */ }
  beatsSinceCut = 0;
  if (autoDirector && !rotation.isEnabled(mode) && rotation.count > 0) setMode(rotation.next(mode));
  updateSceneButtons(); updateDirectorStatus();
  showToast(`${scenes[index].title} ${enabled ? "included in" : "excluded from"} Auto Director${rotation.count === 0 ? " — holding current scene" : ""}`);
}
function setMode(nextMode, { manual = false } = {}) {
  const index = Number(nextMode);
  if (!Number.isInteger(index) || !scenes[index]) return;
  mode = index;
  const scene = scenes[mode];
  visual.setMode(scene.renderMode);
  if (manual) beatsSinceCut = 0;
  updateSceneButtons(); updateDirectorStatus();
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
  $("#scene-title").textContent = scene.title; $("#scene-kicker").textContent = scene.kicker; $("#scene-description").textContent = scene.description;
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
    if (!rotation.isEnabled(mode) && rotation.count > 0) setMode(rotation.next(mode));
  }
  updateDirectorStatus();
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
function runDirector(state) {
  if (!experienceStarted || !autoDirector || paused || rotation.count === 0 || !state.transient || state.beatCount === lastHandledBeat) return;
  lastHandledBeat = state.beatCount;
  const next = rotation.next(mode);
  if (next === mode) { beatsSinceCut = 0; updateDirectorStatus(); return; }
  beatsSinceCut += 1;
  updateDirectorStatus();
  if (beatsSinceCut < 16) return;
  directedCuts += 1;
  beatsSinceCut = 0;
  setMode(next);
  if (directedCuts % 2 === 0) setPalette((palette + 1) % 4);
}
function openPanel() {
  $("#settings-panel").classList.add("open"); $("#panel-scrim").classList.add("open");
  $("#settings-panel").setAttribute("aria-hidden", "false"); $("#settings-button").setAttribute("aria-expanded", "true");
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
  $("#cinema-frame").style.setProperty("--impact", state.beat);
  $("#performance-readout").textContent = `${performance.quality.toUpperCase()} · ${performance.fps} FPS · ${performance.pixelRatio.toFixed(2)}×`;
  const activeMeter = Math.round(state.level * 8);
  $$("#micro-meter i").forEach((segment, index) => segment.classList.toggle("active", index < activeMeter));
  spectrumBars.forEach((bar, index) => {
    const frequencyIndex = Math.floor((index / spectrumBars.length) ** 1.6 * Math.min(350, state.frequency.length - 1));
    const value = state.frequency[frequencyIndex] / 255;
    bar.style.transform = `scaleY(${0.08 + value * 0.92})`; bar.style.opacity = String(0.24 + value * 0.76);
  });
  frameChannels.forEach((channel, index) => {
    const position = index / (frameChannels.length - 1);
    const frequencyIndex = Math.floor(position ** 1.65 * Math.min(700, state.frequency.length - 1));
    channel.textContent = String(state.frequency[frequencyIndex] || 0).padStart(3, "0");
  });
}
function animate(now) {
  const delta = (now - lastFrame) / 1000; lastFrame = now;
  const state = audio.update(now); runDirector(state);
  const performance = visual.render(state, delta);
  particles.setLayers(visual.blend.active ? [
    { mode: visual.blend.previous, palette: visual.previousPalette, weight: 1 - visual.blend.weight },
    { mode: visual.mode, palette: visual.palette, weight: visual.blend.weight },
  ] : [{ mode: visual.mode, palette: visual.palette, weight: 1 }]);
  const particleInterval = renderQuality === "ultra" ? 1000 / 60 : 1000 / 45;
  if (!paused && (visual.blend.active || now - lastParticleFrame >= particleInterval)) { particles.render(state, visual.radialMotion.angle); lastParticleFrame = now; }
  if (now - lastUiUpdate >= 66) { updateTelemetry(state, performance); lastUiUpdate = now; }
  requestAnimationFrame(animate);
}

$("#mic-button").addEventListener("click", startMicrophone);
$("#mic-button-panel").addEventListener("click", startMicrophone);
$("#demo-button").addEventListener("click", useDemo);
$("#demo-button-panel").addEventListener("click", useDemo);
$("#audio-file").addEventListener("change", (event) => useAudioFile(event.target.files[0]));
$("#signal-status").addEventListener("click", openPanel);
$("#settings-button").addEventListener("click", openPanel);
$("#settings-close").addEventListener("click", closePanel);
$("#panel-scrim").addEventListener("click", closePanel);
$("#fullscreen-button").addEventListener("click", toggleFullscreen);
$("#pause-button").addEventListener("click", () => setPaused(!paused));
$("#sensitivity").addEventListener("input", (event) => {
  audio.setSensitivity(event.target.value); $("#sensitivity-value").textContent = `${Number(event.target.value).toFixed(2)}×`;
});
$("#particles-toggle").addEventListener("click", (event) => {
  const nextVisible = event.currentTarget.getAttribute("aria-checked") !== "true";
  event.currentTarget.setAttribute("aria-checked", String(nextVisible)); event.currentTarget.classList.toggle("active", nextVisible); particles.setVisible(nextVisible);
});
$("#director-toggle").addEventListener("click", () => setAutoDirector(!autoDirector));
$$(".quality-button").forEach((button) => button.addEventListener("click", () => setRenderQuality(button.dataset.quality)));
$$(".scene-button").forEach((button) => button.addEventListener("click", () => toggleSceneRotation(button.dataset.mode)));
$$(".swatch").forEach((button) => button.addEventListener("click", () => setPalette(button.dataset.palette)));
window.addEventListener("keydown", (event) => {
  // Let native button activation toggle rotation instead of pausing playback.
  if (event.target instanceof Element && event.target.closest("button") && (event.code === "Space" || event.key === "Enter")) return;
  if (event.target instanceof Element && event.target.matches("input, textarea, [contenteditable]")) return;
  if (event.target instanceof Element && event.target.matches("select") && event.key.toLowerCase() !== "o") return;
  if (/^[1-9]$/.test(event.key)) setMode(Number(event.key) - 1, { manual: true });
  else if (event.key === "ArrowRight") { event.preventDefault(); setMode((mode + 1) % scenes.length, { manual: true }); }
  else if (event.key === "ArrowLeft") { event.preventDefault(); setMode((mode - 1 + scenes.length) % scenes.length, { manual: true }); }
  else if (event.key.toLowerCase() === "a") setAutoDirector(!autoDirector);
  else if (event.key.toLowerCase() === "f") toggleFullscreen();
  else if (event.key.toLowerCase() === "h") { uiHidden = !uiHidden; document.body.classList.toggle("ui-hidden", uiHidden); }
  else if (event.key.toLowerCase() === "o") {
    visualOnly = !visualOnly;
    document.body.classList.toggle("visual-only", visualOnly);
    if (visualOnly) closePanel();
  }
  else if (event.code === "Space") { event.preventDefault(); setPaused(!paused); }
  else if (event.key === "Escape") closePanel();
});
document.addEventListener("fullscreenchange", () => $("#fullscreen-button").classList.toggle("active", Boolean(document.fullscreenElement)));
setMode(0); setPalette(0); setAutoDirector(true); setRenderQuality("auto", false); requestAnimationFrame(animate);
