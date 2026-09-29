# Auralis — implementation and creative references

For setup, the tech stack and the screenshot gallery, see the [main README](../README.md).

Auralis is a real-time, microphone-reactive music visualiser for the browser. It combines a custom Three.js/WebGL shader engine with a p5.js particle and waveform layer to create mirrored light sculptures, crystalline shapes, harmonic rings, and spectrum bars.

## Features

- Live Mac microphone input through the Web Audio API
- Local audio-file playback (MP3, WAV, M4A, FLAC, and other browser-supported formats)
- Fifteen distinct scenes, including kaleidoscopic fields, tunnels, spectral terrain, radial arrays, electric orbits, procedural 3D crystals with an aurora backdrop, a synthwave Neon Road, a closed-loop plasma Tunnel, procedural terrain flyovers, and Geiss Flow's liquid waveform feedback; smoke is a supporting layer, never a standalone scene
- Automatic seeded crystal formations and flowing aurora curtains: FFT bins shape individual crystals and curtain heights, bass drives expansion, mids billow the curtains, and highs illuminate facets and rays. No mouse painting, prerecorded video, or image assets are needed
- Bloom's outer circles are travelling sound waves: up to 16 rings capture the actual waveform, expand smoothly from the flower, and fade at the edge. Beats add rings; silence stops new emissions
- Six musical frequency ranges (sub, bass, low-mid, mid, presence, and air) with spectral-flux transient and live tempo detection
- Spring-smoothed 256-bin GPU spectrum and peak-hold textures that reshape folds, contours, rays, rings, mirrored particles, and luminous peak caps
- An elastic two-layer waveform mesh with damped overshoot, connecting filaments, beat flashes, and eight-frame motion trails
- Segmented mirrored spectrum bars and a continuous live crest line for a clearer relationship between sound and motion
- A raised yellow-to-blue FFT bar field sits behind compatible scenes, dynamically fading from solid to translucent according to the artwork beneath it and clearing entirely for Reactor, Horizon, Radial, Crystals, Neon Road, and Tunnel
- A compact live-frame inspector samples twelve logarithmically spaced FFT bins so the current channel values remain visible without covering the artwork
- Smokey BBQ's GPU fluid pipeline adapted to WebGL: persistent velocity, density, temperature, and RGB dye; advection, buoyancy, vorticity confinement, and iterative pressure projection. Bass and transients drive emissions, mids strengthen curls, and highs illuminate smoke
- Subtle fluid layers enrich Bloom, Warp, Valley, and Arc. Valley uses thin centre-outward wisps with lateral drift and fast dissipation, not circular or rising cloud plumes
- Radial uses slow, smoothly integrated, music-driven rotation. Frequency bars and beat brightness remain responsive without whole-scene rotation jumps; rotation eases to a stop in silence
- An inertial motion clock that accelerates camera travel with musical energy and kicks forward on detected beats
- A spectral Valley flight where bass deepens the canyon, mids raise broad ridges, highs add terrain detail, and luminous frequency contours trace the music-carved crests beneath a slow, independently smoothed bird-like camera path
- Additional reference-driven systems include a radial HUD reactor, horizon equalizer, extruded circular spectrum, and electric orbital field
- Torus is an enclosed 3D checker tunnel: the camera follows its closed centerline while bass breathes the walls, mids shape four-lobed pinches, and spectrum bins illuminate wall seams. The default lime checker palette recalls the original illusion; no flat bars or particle overlay obstruct the passage. The separate Tunnel scene retains its plasma walls.
- Every fifth Torus checker square flashes on detected beats in a staggered pattern, with a fast onset and smooth decay. Tile edges and distant flashes are softened; the pattern closes seamlessly around the tube and pauses with the scene.
- Beat-synchronised Auto Director with cinematic scene transitions and hit dynamics
- Horizon uses 29 distinct mirrored frequency bands, sampled once per tower to avoid a flat central plateau. Peak markers follow the same beat lift as their towers. Generic waveforms, particle overlays, circular shockwaves, central glow, and lens warping are disabled for this scene; skyline bloom remains. Its floor carries horizontal lime/yellow waveform filaments towards the viewer, replacing the old dashed lanes. Each line retains a real audio snapshot and spreads apart in perspective as it approaches; beats accent new lines without jolting the camera. A fixed 24-line pool and 6 KB texture bound memory use, pause freezes the history, and outgoing trails remain live during scene blends. Other colour palettes tint the lines to match.
- Horizon's sky now carries a subdued ASCII flow inspired by [Roomtone](https://github.com/0xStoneyStark/roomtone): upright characters dissolve between densities as a slow field drifts beneath them, with local frequency energy, bass breathing and sparse treble highlights. The layer stays behind the towers and fades near the baseline; it shares scene crossfades and remains visible with the UI hidden. An original 768-byte glyph atlas is built once, with a bounded, CSS-sized grid independent of render quality. No external service, API key, font download or per-frame text canvas is required.
- Scene changes blend smoothly over 1.6 seconds, with both scenes animated and reacting to music throughout—no fade through black. Smoke and bars share the scene blend before the bloom pass; particles use matching blend weights. Rapid selections finish the current blend then move to the latest destination; pause freezes the transition. Only transitions render two scenes; normal playback renders one.
- Valley has a deeper, 92-unit horizon, a longer camera look-ahead, and lighter distance haze. Nearby ridges retain their detail while distant grids soften into silhouettes. Auto/High/Ultra cap terrain tracing at 72/88/104 steps; the slow flight speed is unchanged.
- Half-float HDR rendering with soft-knee bloom, warm halation, chromatic separation, persistent zoom-and-twist feedback, audio-driven lens warp, LED micro-texture, film grain, and a highlight-preserving tone shoulder
- Adaptive render scaling with Auto, High, and Ultra quality modes
- Four colour palettes, adjustable response, fullscreen mode, and a hideable performance UI
- Built-in animated demo signal for exploring without microphone permission
- Audio processing stays on-device; no audio is recorded or uploaded

## Run locally

Microphone access requires a secure browser context, so use the local Vite server rather than opening `index.html` directly.

```sh
npm install
npm run dev
```

Open the URL shown by Vite (normally `http://localhost:5173`), then choose **Use Mac microphone**. Your browser and macOS may each ask for microphone permission.

## Controls

| Control | Action |
| --- | --- |
| `1`–`9` | Switch directly to scenes 1–9 |
| `←` / `→` | Move through all scenes |
| `A` | Toggle the beat-synchronised Auto Director |
| `Space` | Pause or resume the visual |
| `F` | Enter or leave fullscreen |
| `H` | Hide or show the interface |
| `O` | Toggle visual-only mode, hiding all text, controls, panels, and framing |

The source selector in the top bar can switch between the Mac microphone, a local audio file, and the demo signal.

## Development

```sh
npm test
npm run build
```

The main components are:

- `src/audio-engine.js` — microphone/file capture, FFT band analysis, and transient detection
- `src/visual-engine.js` — Three.js renderer and custom GLSL scenes
- `src/procedural-scenes.js` — seeded instanced crystal growth and audio-shaped 3D aurora curtains
- `src/flowing-terrain.js` — retained terrain experiment from the removed standalone Aurora scene; not imported or bundled by the app
- `src/neon-road.js` — continuous procedural highway, route-following camera, grid mountains, sunset, and recycled spectrum-lit roadside markers
- `src/endless-tunnel.js` — MIT Quakeboy torus adaptation, inside-surface plasma shaders, and continuous camera travel
- `src/smoke-simulation.js` — Smokey BBQ fluid-solver adaptation and audio-driven emitters
- `src/radial-motion.js` — smooth energy/tempo-driven angular motion
- `src/bloom-waves.js` — bounded waveform snapshots and outward-moving Bloom rings
- `src/post-processing.js` — HDR capture, bloom, temporal and cinematic finishing passes
- `src/particle-overlay.js` — p5.js waveform, particles, and spectrum layer
- `src/main.js` — UI state and animation orchestration
- `src/style.css` — responsive stage and control-system styling

### Procedural worlds

Crystals and its aurora backdrop adapt geometry and lighting techniques from [GeometryPainterThreeJS](https://github.com/achrefelouafi/GeometryPainterThreeJS) to automatic music-driven generation. Procedural scenes use depth-enabled HDR targets and the shared bloom pipeline. A fresh session generates a new seed; formations remain stable while music animates them. Hidden worlds stop updating, pause freezes their geometry, and cameras drift slowly without beat jolts. Auto/High/Ultra cap render targets at 1000/1400/1800 pixels on the longest edge, with 160/240/320 instanced crystals. Scenes are allocated only when first selected. This is a WebGL adaptation, not the upstream WebGPU painting interface; no Atlas code or Pillow dependency is included.

Crystals includes a softer aurora backdrop in the same 3D scene, behind the crystal formations rather than overlaid on top. Both layers share the scene's music response, palette, clock, and pause state. Auto/High/Ultra use 2/4/6 background sheets to limit the additional rendering cost; no second scene render target or terrain is needed for this backdrop. The standalone Aurora scene has been removed from the selector, keyboard cycle, Auto Director, and rendering pipeline. Crystals is scene 11; Neon Road is scene 12. Orbit has been removed from the selector, keyboard cycle, Auto Director, and shader. Display numbers are sequential; internal renderer IDs remain stable to preserve each scene's effects.

In Crystals, the globe stays vertically fixed and turns slowly at 0.04 radians/second (one revolution in about 157 seconds), independent of music volume. Detected beats grow individual shards outward from their surface anchors, with a fast, smooth attack and gradual release. Growth primarily extends crystal length, with a little extra width; the globe itself never scales or bounces. Camera height is fixed, with wider framing to accommodate the growing tips. Dense neutral-grey smoke veils drift across the foreground with seeded random timing, direction, and height. Two reusable sheets last 7–10 seconds, with new emission opportunities every 2.2–4.2 seconds, broader coverage, and peak opacity capped at 0.88 per sheet before the noise and edge fades. These veils are separate from the fluid solver used in other scenes and freeze with the scene when paused.

### Neon Road

Scene 12 is an endless '80s neon drive: magenta road edges, cyan dashed lanes, wire-grid mountains, starry purple sky, and a striped sunset. The camera follows the same smooth bends and hills used by the GPU road, looking ahead with damped steering. Ground markings and a fixed pool of 64 roadside lights move toward the viewer; bass lifts edge brightness, mids light the terrain, and highs/FFT bins energize lane lights and markers. Musical energy gently changes speed without beat-triggered camera jolts. Geometry is reused, terrain is displaced on the GPU, and the shared Auto/High/Ultra render caps apply. Pause freezes travel; hidden scenes stop updating. No frequency-bar or p5 overlay covers the road.

Neon Road has its own lightweight atmosphere: six reusable, depth-tested smoke sheets blow sideways across the highway as the camera approaches, fading before they pass the camera or recycle. Distant procedural cloud banks drift slowly over the purple sky, with a subtle pink rim while the striped sunset stays visible. Both layers share the road's paused clock; hidden scenes do not advance. These are procedural shader effects, not extra fluid simulations or image assets.

### Endless Tunnel

Scene 13, Tunnel, adapts [Quakeboy's Endless-Tunnel-Rendering-OpenGLES](https://github.com/quakeboy/Endless-Tunnel-Rendering-OpenGLES). The reviewed renderer uses an indexed torus, a camera inside it, a repeating plasma bitmap, and frame-based torus rotation/camera roll. This browser adaptation moves the camera along the closed torus centerline with a stable up vector, uses elapsed-time movement, and duplicates both mesh/UV seams for continuous interpolation. Procedural plasma, illuminated ribs, and spectral filaments replace the bitmap. Bass expands the walls, mids sculpt folds, and highs/FFT bins brighten fine detail; energy eases travel speed without camera kicks. One reusable 11,809-vertex mesh is rendered into the existing depth-enabled HDR pipeline. No extra native dependencies or assets are needed. Pause freezes the scene, hidden scenes stop updating, and Auto/High/Ultra target caps still apply. Torus now reuses this enclosed geometry and camera path with its own checker-wall material; Warp remains unchanged. Attribution and the complete MIT notice are in `THIRD_PARTY_NOTICES.md`.

### Smoke performance

Smoke is only an accent in existing scenes. Valley emits narrow wisps near its central vanishing point, sweeps them outward, and dissipates them quickly so the terrain stays visible. Bloom, Warp and Arc retain their circular emission style. The standalone Haze and Smoke scenes and their composition selector have been removed; Ribbon remains removed. Press **O** for visuals only.

The solver runs at a fixed 30 Hz with at most two catch-up steps per frame. Auto/High/Ultra use a maximum grid edge of 192/256/320 pixels and 12/18/24 pressure iterations; this is independent of display pixel ratio. Hidden smoke scenes stop simulating; pause freezes the fluid state. Resizing the simulation grid clears its history. Devices without float render-target support omit the fluid layer. This ports the GPU solver/compositions, not the upstream C++ UI, CPU solver, or PortAudio backend; browser audio remains local through Web Audio.

The experimental React Smoke particle source/texture is retained for reference but is no longer imported, rendered, or bundled into the application.

## Conductor

The checked-in `.conductor/settings.toml` installs dependencies for new workspaces and starts Vite on Conductor's allocated `CONDUCTOR_PORT`. Concurrent mode is safe because each workspace receives its own port range.

## Creative references

### Terrain flyovers

Scene 14, **Flyover**, adapts chunk/skirt geometry and streaming ideas from
[ZyFou's ProceduralTerrains](https://github.com/ZyFou/ProceduralTerrains), reviewed
at `96c094ef49dd4b2d1ff8c51c47ab1faa7c201ea7`. A continuous seeded GPU height field
forms ridges around a winding waterway in an '80s neon palette: magenta terrain
grids, cyan contours, glowing river reflections, stars, and a large striped sunset.
A stable camera flies along the river with gentle climbs at 37.5–48.75 world units per
second (25% faster than 30–39); musical energy smoothly increases speed. Bass expands
ridges and treble brightens contours and water ripples. Dim violet cloud banks
drift overhead. Six reusable, depth-tested smoke wisps blow across the waterway
and lower ridges, picking up the neon palette. They fade before reaching the
camera and before recycling; pause and hidden-scene clocks freeze them.
World-locked grids are antialiased and fade in the distance. These are procedural
materials, not imported imagery or the full terrain editor.

Three reusable instanced LOD batches use 48/24/12-segment chunks with skirts to
hide detail-level cracks. Auto/High/Ultra keep 81/121/169 tiles around the camera;
only tile transforms change at boundaries. The existing render-resolution caps,
scene blends, palette controls, and pause behaviour apply. Hidden scenes stop
updating. There are no flat spectrum or particle overlays, lens kicks, or extra
runtime dependencies. Existing Valley is unchanged. The complete MIT notice is in
`THIRD_PARTY_NOTICES.md`.

### Scene rotation controls

The side icons toggle each scene's inclusion in Auto Director, rather than
selecting it directly. A lit dot means enabled; a dim icon with a dash means
excluded. The bright outline independently identifies the currently selected
scene. Hover an icon for its name and state; focused icons work with Enter/Space.
Choices are remembered locally in the browser using stable renderer IDs.

Auto Director advances through enabled scenes every 16 detected beats. Turning
off its current selection blends to the next enabled scene. One enabled scene
holds; all-off holds the current picture and stops automatic scene changes.
Re-enabling a scene restores the rotation. With Auto Director off, these choices
edit the future rotation without interrupting the manually selected scene.
Arrow keys preview all scenes (including excluded ones), and 1–9 still preview
the first nine; previewing does not change inclusion. The settings panel shows
the enabled count and the A key switches Auto Director on or off.

### Geiss Flow

Scene 15 is an original GPU interpretation of Ryan Geiss's
[waveform-and-warp feedback technique](https://www.geisswerks.com/geiss/secrets.html).
The actual time-domain audio seeds two coloured traces into a persistent image;
each frame carries those traces through expanding spirals, paired vortices or a
winding current. Every eight detected beats can initiate a smooth field morph,
with a four-second minimum hold. Bass swells the traces and treble adds sparse
sparks; silence stops emission and lets existing trails dissipate.

Bloom also uses this flow as a soft background. Compressed trail highlights,
reduced intensity near the core and foreground-aware dimming keep the flower,
expanding sound waves and smoke prominent. Bloom and Geiss Flow share one history
that advances once per frame, including during their crossfade, so switching
between them does not restart the trails or double their speed. Other scenes
remain unchanged.

Two lazy, reusable half-float targets preserve linear-light colour, with
time-based decay and bounded brightness. Auto/High/Ultra cap their longest edge
at 1000/1400/1800 pixels. Resize resamples the existing trail rather than clearing
it; pause freezes it and hidden scenes stop updating. Scene blends keep both
outgoing and incoming animation live. All four palettes, the scene rail, arrow
navigation, Auto Director and visual-only mode work as usual. No generic bars,
p5 overlays, camera kicks, native plug-ins or new dependencies are added.

The project draws inspiration from [Fosfora](https://github.com/kevinraymond/fosfora), [ShaderAmp](https://github.com/ArthurTent/ShaderAmp), [Jeff Minter's Xbox 360 visualiser](https://www.youtube.com/watch?v=PFJhswIyVtc), [pdoom-video](https://github.com/mexicat/pdoom-video), [NEON](https://github.com/GIGAMOLE/NEON), and [AudioVisualize](https://github.com/joepdooper/audiovisualize). Post-processing techniques are adapted from [Astrofox](https://github.com/astrofox-io/astrofox); the smoke solver and audio compositions are adapted from Jack Purvis's [Smokey BBQ](https://github.com/EmperorJack/smokey-bbq). See [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) for provenance and license notes.
