// Run a local Vite server and a dedicated Chrome instance with CDP enabled.
// APP_URL=http://127.0.0.1:5173 CDP_PORT=9231 npm run screenshots
import { mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { scenes } from "../src/scenes.js";

const appUrl = process.env.APP_URL || "http://127.0.0.1:5173/";
const cdp = `http://127.0.0.1:${process.env.CDP_PORT || 9231}`;
const pages = await (await fetch(`${cdp}/json`)).json();
const page = pages.find(page => page.type === "page" && page.url.startsWith(new URL(appUrl).origin));
if (!page) throw Error(`Open ${appUrl} in the dedicated CDP Chrome instance first.`);
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.addEventListener("open", resolve, { once: true }); ws.addEventListener("error", reject, { once: true }); });
let id = 0;
const pending = new Map(), errors = [], captures = [];
ws.onmessage = ({ data }) => {
  const message = JSON.parse(data);
  if (message.id) { pending.get(message.id)?.(message); pending.delete(message.id); }
  else if (message.method === "Runtime.exceptionThrown" || (message.method === "Runtime.consoleAPICalled" && message.params.type === "error")) errors.push(message);
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => { pending.delete(requestId); reject(Error(`CDP timeout: ${method}`)); }, 120000);
  const requestId = ++id;
  pending.set(requestId, message => { clearTimeout(timer); message.error ? reject(Error(JSON.stringify(message.error))) : resolve(message.result); });
  ws.send(JSON.stringify({ id: requestId, method, params }));
});
const evaluate = async expression => {
  const response = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw Error(JSON.stringify(response.exceptionDetails));
  return response.result.value;
};
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
mkdirSync(".context/gallery", { recursive: true });
mkdirSync("docs/screenshots", { recursive: true });
try {
  await send("Runtime.enable"); await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: appUrl }); await delay(2500);
  await evaluate(`(async () => {
    // Vite may version the entry URL after edits. Import that exact module to
    // avoid constructing a second renderer and duplicate animation loop.
    const mainUrl = [...document.scripts].find(script => script.type === 'module' && script.src.includes('/src/main.js')).src;
    await import(mainUrl);
    const main = await (await fetch(mainUrl)).text();
    const { VisualEngine } = await import(main.match(/from "([^\"]*visual-engine[^\"]*)"/)[1]);
    const original = VisualEngine.prototype.render;
    window.gallery = { frames: 0 };
    VisualEngine.prototype.render = function(...args) {
      window.gallery.engine = this;
      const result = original.apply(this, args); window.gallery.frames++; return result;
    };
    window.gallery.restore = () => { VisualEngine.prototype.render = original; };
    document.querySelector('#demo-button').click();
    if (document.querySelector('#director-toggle').getAttribute('aria-checked') === 'true') document.querySelector('#director-toggle').click();
    document.querySelector('[data-quality="high"]').click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key:'o', bubbles:true }));
    const deadline = performance.now() + 20000;
    while (!window.gallery.engine) { if(performance.now()>deadline) throw Error('Renderer not ready'); await new Promise(r=>setTimeout(r,30)); }
  })()`);
  for (const [index, scene] of scenes.entries()) {
    const filename = `${String(index + 1).padStart(2, "0")}-${scene.title.toLowerCase().replaceAll(" ", "-")}.jpg`;
    const seconds = scene.renderMode === 11 ? 5 : [0, 15].includes(scene.renderMode) ? 4 : 2.8;
    const result = await evaluate(`(async () => {
      const e = window.gallery.engine;
      if(document.querySelector('#pause-button').classList.contains('paused')) document.querySelector('#pause-button').click();
      // Use the actual keyboard preview controls; the rail toggles rotation.
      let selected = Number(document.querySelector('.scene-button.active').dataset.mode);
      while(selected !== ${index}) {
        document.dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowRight',bubbles:true}));
        selected = Number(document.querySelector('.scene-button.active').dataset.mode);
      }
      // Documentation captures show a settled scene, never a crossfade.
      e.setMode(${scene.renderMode}, true);
      const start = e.elapsed, deadline = performance.now() + 100000;
      while(e.elapsed - start < ${seconds}) {
        if(performance.now()>deadline) throw Error('Scene warmup timed out');
        await new Promise(r=>setTimeout(r,50));
      }
      if(e.mode !== ${scene.renderMode} || e.blend.active) throw Error('Wrong scene captured');
      document.querySelector('#pause-button').click();
      return {mode:e.mode, title:document.querySelector('#scene-title').textContent, renderedSeconds:e.elapsed-start};
    })()`);
    // Let the already-requested frame/p5 paint complete before reading pixels.
    await delay(100);
    const screenshot = await send("Page.captureScreenshot", { format: "jpeg", quality: 90, fromSurface: true });
    writeFileSync(`.context/gallery/${filename}`, Buffer.from(screenshot.data, "base64"));
    copyFileSync(`.context/gallery/${filename}`, `docs/screenshots/${filename}`);
    captures.push({ scene: index + 1, title: scene.title, renderMode: scene.renderMode, file: filename, ...result });
    console.log(`Captured ${index + 1}/${scenes.length}: ${scene.title} → ${filename}`);
    if (errors.length) throw Error(`Browser errors: ${JSON.stringify(errors)}`);
  }
  writeFileSync("docs/screenshots/manifest.json", `${JSON.stringify({ capturedAt: new Date().toISOString(), source: "Bundled original demo music; live browser rendering, visual-only mode", width: 1280, height: 800, quality: "high", captures }, null, 2)}\n`);
  console.log(`Saved ${captures.length} screenshots. Browser errors: ${errors.length}.`);
} finally {
  await evaluate("window.gallery?.restore?.()").catch(() => {});
  ws.close();
}
