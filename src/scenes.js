// Renderer IDs stay stable so removing a scene doesn't change smoke, particle,
// or procedural-world routing. UI numbering follows this catalogue's order.
export const scenes = [
  { renderMode: 25, title: "Neon City", minimumDuration: 30, theme: "ENDLESS METROPOLIS", description: "Descend from above the skyline, then climb, dip and bank through neon streets beneath holographic signs and violet rooftop haze." },
  { renderMode: 0, title: "Bloom", theme: "ORGANIC FIELD", description: "Light and spectral smoke unfolding from the low end." },

  { renderMode: 4, title: "Torus", theme: "CHECKER TUNNEL", description: "Fly inside a curving checker-lined torus, its luminous walls breathing with the music." },
  { renderMode: 6, title: "Valley", theme: "SPECTRAL FLIGHT", description: "A slow, bird-like glide through ridges carved by the music." },
  { renderMode: 7, title: "Reactor", theme: "RADIAL BURST", description: "A circular instrument panel detonating with every transient." },
  { renderMode: 8, title: "Horizon", minimumDuration: 20, theme: "SPECTRUM CITY", description: "Frequency towers and approaching sound waves stand against Aura's flowing light folds." },
  { renderMode: 9, title: "Radial", theme: "EXTRUDED ARRAY", description: "Spectrum blocks rotate through a deep circular chamber." },
  { renderMode: 11, title: "Crystals", theme: "NEON FORMATIONS", description: "Cyan and magenta crystal edges pulse through Spirit particles and flowing aurora." },
  { renderMode: 12, title: "Neon Road", theme: "MIDNIGHT DRIVE", description: "Follow a winding neon highway into a striped synthwave sunset." },
  { renderMode: 17, title: "Dark Matter", theme: "VOLUMETRIC VORTEX", description: "A swirling cloud disc surrounds a dark core, with musical density, drifting filaments and outward beat pulses." },
  { renderMode: 18, title: "Light Tunnel", theme: "NEON FLIGHT", description: "Fly through flowing light strips past a stationary Dark Matter cloud on the right, with musical highlights travelling towards you." },
  { renderMode: 19, title: "Fractal Lotus", theme: "HOLOGRAPHIC CRYSTAL", description: "An intricate holographic web unfolds through mirrored space, breathing with bass and shimmering on the beat." },
  { renderMode: 20, title: "Voxel Tunnel", theme: "FRACTAL CORRIDOR", description: "Fly through a luminous square tunnel, its folded voxel walls shimmering with the music around a glowing vanishing point." },
  { renderMode: 21, title: "Magnetic Silk", theme: "HOLOGRAPHIC FOLDS", description: "Smoothly flowing metallic folds with beat-triggered colour ripples across the silk." },
  { renderMode: 22, title: "Cyber Tunnel", theme: "NEON DATAWAY", description: "Glide through segmented neon lanes, holographic data streams and wet-floor reflections that brighten with the music." },
  { renderMode: 24, title: "Neon March", theme: "KINETIC FIGURES", description: "Glowing sphere-jointed figures stride through a neon grid, their cadence following the music." },
].map((scene, index) => ({ ...scene, kicker: `SCENE ${String(index + 1).padStart(2, "0")} / ${scene.theme}` }));
