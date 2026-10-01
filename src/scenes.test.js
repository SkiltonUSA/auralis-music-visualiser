import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scenes } from "./scenes.js";

describe("scene catalogue", () => {
  it("removes retired scenes while preserving the remaining renderer IDs", () => {
    expect(scenes.map(({ title }) => title)).toEqual([
      "Neon City", "Bloom", "Torus", "Valley", "Reactor",
      "Horizon", "Radial", "Crystals", "Neon Road", "Dark Matter", "Light Tunnel", "Fractal Lotus", "Voxel Tunnel", "Magnetic Silk", "Cyber Tunnel", "Neon March",
    ]);
    expect(scenes.map(({ renderMode }) => renderMode)).toEqual([25, 0, 4, 6, 7, 8, 9, 11, 12, 17, 18, 19, 20, 21, 22, 24]);
  });

  it("keeps rail buttons and scene headings consecutively numbered", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    const buttons = [...html.matchAll(/data-mode="(\d+)"[\s\S]*?class="scene-number">(\d+)<[\s\S]*?class="scene-name">([^<]+)</g)];
    expect(buttons).toHaveLength(scenes.length);
    scenes.forEach((scene, index) => {
      const number = String(index + 1).padStart(2, "0");
      expect(buttons[index].slice(1)).toEqual([String(index), number, scene.title.toUpperCase()]);
      expect(scene.kicker.startsWith(`SCENE ${number} / `)).toBe(true);
    });
  });
  it("keeps the screenshot gallery aligned with the active catalogue",()=>{
    const manifest=JSON.parse(readFileSync(new URL('../docs/screenshots/manifest.json',import.meta.url),'utf8'));
    expect(manifest.captures.map(({scene,title,renderMode})=>({scene,title,renderMode})))
      .toEqual(scenes.map(({title,renderMode},i)=>({scene:i+1,title,renderMode})));
  });
});
