import { describe, expect, it, vi } from "vitest";
import { PostProcessor } from "./post-processing.js";

describe("final scene fade", () => {
  it("fades the screen copy only, without compounding feedback brightness", () => {
    const renderer = { setRenderTarget: vi.fn(), render: vi.fn() };
    const post = new PostProcessor(renderer);
    const passes = [];
    post.pass = (material, target) => passes.push({ material, target });
    const audio = { beat: 0, level: 0, bass: 0, mid: 0, high: 0 };
    post.render({}, {}, audio, 0, .25);
    expect(post.copyUniforms.uOpacity.value).toBe(.25);
    expect(passes.at(-1)).toEqual({ material: post.copyMaterial, target: null });
    expect(post.finalUniforms).not.toHaveProperty("uOpacity");
    expect(post.copyMaterial.fragmentShader).toContain(".rgb * uOpacity");
    post.resetHistory();
    post.render({}, {}, audio, 1, 0, 0);
    expect(post.finalUniforms.uSceneFx.value).toBe(0);
    expect(post.copyUniforms.uOpacity.value).toBe(0);
    expect(post.finalUniforms.uHistoryReady.value).toBe(0);
    post.render({}, {}, audio, 2, 1);
    expect(post.finalUniforms.uSceneFx.value).toBe(1);
    expect(post.finalUniforms.uHistoryReady.value).toBe(1);
    expect(post.copyUniforms.uOpacity.value).toBe(1);
    for (const target of [...post.sceneTargets, ...post.bloomTargets, ...post.feedbackTargets]) target.dispose();
    for (const material of [post.prefilterMaterial, post.blurMaterial, post.finalMaterial, post.copyMaterial]) material.dispose();
    post.quad.geometry.dispose();
  });
});
