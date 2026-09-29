// Renderer IDs stay stable so removing a scene doesn't change smoke, particle,
// or procedural-world routing. UI numbering follows this catalogue's order.
export const scenes = [
  { renderMode: 0, title: "Bloom", theme: "ORGANIC FIELD", description: "Light and spectral smoke unfolding from the low end." },
  { renderMode: 1, title: "Prism", theme: "FRACTURED LIGHT", description: "Crystalline symmetry cut by every transient." },
  { renderMode: 3, title: "Signal", theme: "SPECTRAL ARRAY", description: "The full mix, drawn as a living waveform." },
  { renderMode: 4, title: "Torus", theme: "CHECKER TUNNEL", description: "Fly inside a curving checker-lined torus, its luminous walls breathing with the music." },
  { renderMode: 5, title: "Warp", theme: "SPACE-TIME FOLD", description: "A smoky spectral wormhole bending around every beat." },
  { renderMode: 6, title: "Valley", theme: "SPECTRAL FLIGHT", description: "A slow, bird-like glide through ridges carved by the music." },
  { renderMode: 7, title: "Reactor", theme: "RADIAL BURST", description: "A circular instrument panel detonating with every transient." },
  { renderMode: 8, title: "Horizon", theme: "SPECTRUM CITY", description: "Frequency towers rise above glowing sound waves flowing towards you." },
  { renderMode: 9, title: "Radial", theme: "EXTRUDED ARRAY", description: "Spectrum blocks rotate through a deep circular chamber." },
  { renderMode: 10, title: "Arc", theme: "ELECTRIC ORBIT", description: "Charged rings ignite spectral smoke around the high end." },
  { renderMode: 11, title: "Crystals", theme: "NEON FORMATIONS", description: "Cyan and magenta crystal edges pulse through Spirit particles and flowing aurora." },
  { renderMode: 12, title: "Neon Road", theme: "MIDNIGHT DRIVE", description: "Follow a winding neon highway into a striped synthwave sunset." },
  { renderMode: 13, title: "Tunnel", theme: "ENDLESS PLASMA", description: "Corkscrew through rotating plasma walls, banking upward and sweeping left and right." },
  { renderMode: 14, title: "Flyover", theme: "NEON FRONTIER", description: "Race above neon mountain grids and luminous waterways beneath a striped synthwave sunset." },
  { renderMode: 15, title: "Geiss Flow", theme: "LIQUID FEEDBACK", description: "The waveform becomes flowing neon trails, spiralling through beat-shaped vortices." },
].map((scene, index) => ({ ...scene, kicker: `SCENE ${String(index + 1).padStart(2, "0")} / ${scene.theme}` }));
