import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scenes } from "./scenes.js";

describe("scene catalogue", () => {
  it("removes Orbit while preserving the remaining renderer IDs", () => {
    expect(scenes.map(({ title }) => title)).toEqual([
      "Bloom", "Prism", "Signal", "Torus", "Warp", "Valley", "Reactor",
      "Horizon", "Radial", "Arc", "Crystals", "Neon Road", "Tunnel", "Flyover", "Geiss Flow",
    ]);
    expect(scenes.map(({ renderMode }) => renderMode)).toEqual([0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
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
});
