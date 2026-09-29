import { describe, expect, it, vi } from "vitest";
import { SceneMixer } from "./scene-mixer.js";

describe("HDR scene mixer", () => {
  const setup = () => {
    let target = { name: "original" };
    const renderer = { getRenderTarget: () => target, setRenderTarget: vi.fn(value => { target = value; }), render: vi.fn() };
    return { renderer, original: target, mixer: new SceneMixer(renderer) };
  };
  it("renders two independent live sources into reusable, lazily sized buffers", () => {
    const { renderer, original, mixer } = setup();
    const targets = [...mixer.targets], prepare = vi.fn();
    mixer.resize(800, 600); expect(targets[0].width).toBe(2);
    mixer.render("scene", "camera", .5, prepare);
    expect(prepare.mock.calls).toEqual([[0], [1]]);
    expect(renderer.render).toHaveBeenCalledTimes(2);
    expect(renderer.setRenderTarget.mock.calls).toEqual([[targets[0]], [targets[1]], [original]]);
    expect(mixer.uniforms.uBlend.value).toBe(.5);
    expect(targets[0].width).toBe(800); expect(targets[1].height).toBe(600);
    mixer.resize(640, 480); mixer.render("scene", "camera", 1, prepare);
    expect(mixer.targets).toEqual(targets); expect(targets[0].width).toBe(640);
    expect(mixer.uniforms.uPrevious.value).toBe(targets[0].texture);
    expect(mixer.uniforms.uCurrent.value).toBe(targets[1].texture);
    mixer.dispose();
  });
  it("restores the render target even when scene preparation fails", () => {
    const { renderer, original, mixer } = setup();
    expect(() => mixer.render({}, {}, .5, () => { throw Error("prepare failed"); })).toThrow("prepare failed");
    expect(renderer.getRenderTarget()).toBe(original);
    mixer.dispose();
  });
  it("disposes both targets, the fullscreen geometry and material", () => {
    const { mixer } = setup();
    const resources = [...mixer.targets, mixer.quad.geometry, mixer.material];
    const disposed = resources.map(resource => vi.spyOn(resource, "dispose"));
    mixer.dispose(); disposed.forEach(spy => expect(spy).toHaveBeenCalledOnce());
  });
});
