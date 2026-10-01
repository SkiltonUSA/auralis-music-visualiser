# Auralis — implementation and creative references

Auralis is made by Studio313.

## Crystals: neon facets and Spirit particle cloud

The formation combines physical clearcoat reflections with anti-aliased neon
edges and beat-lit triangular faces. A smooth-normal, 1,620-triangle dark core
replaces the coarse 80-triangle globe. Five cached quartz geometries are drawn
in five instanced batches, retaining the 160/240/320 shard quality limits.
Faces, edges and ripple emission share each material's physical shading pass;
barycentric masks still omit internal quad diagonals.

A procedural 512 × 256 half-float HDR map supplies six studio softboxes,
including cyan/magenta strips. Three.js generates and caches its filtered
environment on first use; no external images, per-frame cube cameras or glass
transmission pass are required. Scene disposal releases the source texture
and Three's associated environment cache. The reflective rig is inspired by
GeometryPainterThreeJS, adapted to the existing WebGL/HDR pipeline.

Every shard base is ray-projected onto the actual core and embedded by 0.035
world units, including the smaller satellite shards. A bounded growth envelope
follows each beat's angular light front, smoothly growing crystals in surface
order rather than inflating the entire formation at once. The globe remains
fixed-height and tempo-driven; all four neon palettes, shared bloom, aurora,
wave floor, particle cloud and localized smoke are retained.

Crystals now includes a depth-tested curl-noise particle cloud adapted from
[Edan Kwan's The Spirit](https://github.com/edankwan/The-Spirit). Three moving
emitters form smoky streams around the globe. Bass widens the cloud, mids stir
the curl field, treble adds fine sparkle, and detected beats impart a gentle
outward pulse. The particle cloud keeps the centre clear; a separate localized
grey smoke wisp passes in front of part of the fixed-height globe. Rotation
smoothly follows musical tempo, while shards grow and triangular faces flash
in travelling ripples on detected beats.

Two reusable 128 × 128 floating-point textures store positions and lifetimes.
Auto / High / Ultra draw 8,192 / 12,288 / 16,384 particles respectively; quality
and viewport changes reuse the same history. Only visible Crystals scenes
advance the simulation, including outgoing blends. Pause freezes it, and all
owned GPU resources are released on scene disposal. Without float-render-target
support, only this added layer is omitted. The adapted shader sources and MIT
notice are recorded in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

For setup, the tech stack and the screenshot gallery, see the [main README](../README.md).

Auralis is a real-time, microphone-reactive music visualiser for the browser. It combines a custom Three.js/WebGL shader engine with a p5.js particle and waveform layer to create mirrored light sculptures, crystalline shapes, harmonic rings, and spectrum bars.

## Features

- Live Mac microphone input through the Web Audio API
- Local audio-file playback (MP3, WAV, M4A, FLAC, and other browser-supported formats)
- Seventeen distinct scenes, including kaleidoscopic fields, tunnels, spectral terrain, radial arrays, procedural 3D crystals with an aurora backdrop, a synthwave Neon Road, Dark Matter's volumetric vortex, Light Tunnel's open-sided neon flight, Fractal Lotus's holographic space folds, Voxel Tunnel's folded square corridor, Magnetic Silk's metallic waves, Cyber Tunnel's neon data corridor, Neon March's sphere-jointed figures, and Neon City's endless metropolis. Fluid smoke remains a supporting layer; Dark Matter renders its own volumetric cloud.
- Automatic seeded crystal formations and flowing aurora curtains: FFT bins shape individual crystals and curtain heights, bass drives expansion, mids billow the curtains, and highs illuminate facets and rays. No mouse painting, prerecorded video, or image assets are needed
- Bloom's outer circles are travelling sound waves: up to 16 rings capture the actual waveform, expand smoothly from the flower, and fade at the edge. Beats add rings; silence stops new emissions
- Six musical frequency ranges (sub, bass, low-mid, mid, presence, and air) with spectral-flux transient and live tempo detection
- Spring-smoothed 256-bin GPU spectrum and peak-hold textures that reshape folds, contours, rays, rings, mirrored particles, and luminous peak caps
- An elastic two-layer waveform mesh with damped overshoot, connecting filaments, beat flashes, and eight-frame motion trails
- Segmented mirrored spectrum bars and a continuous live crest line for a clearer relationship between sound and motion
- A raised yellow-to-blue FFT bar field sits behind compatible scenes, dynamically fading from solid to translucent according to the artwork beneath it and clearing entirely for Reactor, Horizon, Radial, Crystals and Neon Road
- A compact live-frame inspector samples twelve logarithmically spaced FFT bins so the current channel values remain visible without covering the artwork
- Smokey BBQ's GPU fluid pipeline adapted to WebGL: persistent velocity, density, temperature, and RGB dye; advection, buoyancy, vorticity confinement, and iterative pressure projection. Bass and transients drive emissions, mids strengthen curls, and highs illuminate smoke
- Subtle fluid layers enrich Bloom and Valley. Valley uses thin centre-outward wisps with lateral drift and fast dissipation, not circular or rising cloud plumes
- Radial uses slow, smoothly integrated, music-driven rotation. Frequency bars and beat brightness remain responsive without whole-scene rotation jumps; rotation eases to a stop in silence
- An inertial motion clock that accelerates camera travel with musical energy and kicks forward on detected beats
- A spectral Valley flight where bass deepens the canyon, mids raise broad ridges, highs add terrain detail, and luminous frequency contours trace the music-carved crests beneath a slow, independently smoothed bird-like camera path
- Additional reference-driven systems include a radial HUD reactor, horizon equalizer, extruded circular spectrum, and electric orbital field
- Torus is an enclosed 3D checker tunnel: the camera follows its closed centerline while bass breathes the walls, mids shape four-lobed pinches, and spectrum bins illuminate wall seams. The default lime checker palette recalls the original illusion; no flat bars or particle overlay obstruct the passage.
- Every fifth Torus checker square flashes on detected beats in a staggered pattern, with a fast onset and smooth decay. Tile edges and distant flashes are softened; the pattern closes seamlessly around the tube and pauses with the scene.
- Beat-synchronised Auto Director with cinematic scene transitions and hit dynamics
- Horizon uses 29 distinct mirrored frequency bands, sampled once per tower to avoid a flat central plateau. Peak markers follow the same beat lift as their towers. Generic waveforms, particle overlays, circular shockwaves, central glow, and lens warping are disabled for this scene; skyline bloom remains. Its floor carries horizontal lime/yellow waveform filaments towards the viewer, replacing the old dashed lanes. Each line retains a real audio snapshot and spreads apart in perspective as it approaches; beats accent new lines without jolting the camera. A fixed 24-line pool and 6 KB texture bound memory use, pause freezes the history, and outgoing trails remain live during scene blends. Other colour palettes tint the lines to match.
- Horizon's sky uses a subdued Aura ray-marched light background in place of the old ASCII plasma. It is masked behind the towers and peak markers, fades out above the baseline, and leaves the approaching waveform floor unchanged. Its own lazy render target and music-reactive clock remain independent of standalone Aura, including during blends between them. Pause and hidden-scene freezes apply; Auto/High/Ultra use Aura's bounded rendering budgets. The unused ASCII shader and glyph atlas have been removed.
- Scene changes blend smoothly over 1.6 seconds, with both scenes animated and reacting to music throughout—no fade through black. Smoke and bars share the scene blend before the bloom pass; particles use matching blend weights. Rapid selections finish the current blend then move to the latest destination; pause freezes the transition. Only transitions render two scenes; normal playback renders one.
- Valley has a deeper, 92-unit horizon, a longer camera look-ahead, and lighter distance haze. Nearby ridges retain their detail while distant grids soften into silhouettes. Auto/High/Ultra cap terrain tracing at 72/88/104 steps; the slow flight speed is unchanged.
- Half-float HDR rendering with soft-knee bloom, warm halation, chromatic separation, persistent zoom-and-twist feedback, audio-driven lens warp, LED micro-texture, film grain, and a highlight-preserving tone shoulder
- Adaptive render scaling with Auto, High, and Ultra quality modes
- Four colour palettes, adjustable response, fullscreen mode, and a hideable performance UI
- Bundled original demo music with random initial track, 50-second rotation and four-second crossfades; no microphone permission required
- Audio processing stays on-device; no audio is recorded or uploaded

## Run locally

Microphone access requires a secure browser context, so use the local Vite server rather than opening `index.html` directly.

The desktop preload exposes only `openMicrophoneSettings()`, a no-argument IPC
request used after `NotAllowedError`/`SecurityError` from an explicit microphone
attempt. The main process verifies the owning window, main frame, local app
origin, macOS platform and native denied/restricted microphone status. It opens
only the fixed Privacy → Microphone System Settings URL, once per app launch;
no caller-supplied URL or general IPC/shell API is exposed. Failed launches keep
manual instructions, and late replies cannot replace cancelled UI state.

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

The source selector switches between the Mac microphone, a local audio file,
and demo music. `DemoPlaylist` loads the two bundled original MP3s only after
an explicit Demo action. It caches 54.1 seconds of each decoded track, selects
the first randomly, and schedules alternating buffer sources on the AudioContext
clock at 50-second intervals, with four-second equal-power crossfades. Two
future rotations are queued ahead independently of render FPS/visibility.
The mixed gain bus feeds the same analyser and speaker output as local files;
visuals use the actual mixed waveform rather than the synthetic demo signal.
Source changes stop/disconnect all scheduled voices, and request IDs prevent
late decoding from overriding a newer microphone/file choice. Visual pause
does not pause playback. The original silent signal remains an internal
fallback for microphone disconnection/file errors, not the Demo button source.

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

Crystals includes a softer aurora backdrop in the same 3D scene, behind the crystal formations rather than overlaid on top. Both layers share the scene's music response, palette, clock, and pause state. Auto/High/Ultra use 2/4/6 background sheets to limit the additional rendering cost; no second scene render target or terrain is needed for this backdrop. The standalone Aurora scene has been removed from the selector, keyboard cycle, Auto Director, and rendering pipeline. Crystals is scene 8; Neon Road is scene 9. Prism, Warp, Arc and Orbit have been removed from the selector, keyboard cycle, Auto Director, and shader. Display numbers are sequential; internal renderer IDs remain stable to preserve each scene's effects.

In Crystals, the globe stays vertically fixed and its angular velocity smoothly follows tempo, not volume: 60/120/180 BPM target 0.27/0.54/0.81 radians/second. Beat-interval estimation provides a fallback while audio analysis calibrates. After beats stop, rotation eases back to 0.04 radians/second. Exact integration of the speed ramp preserves motion across frame rates, and pause/hidden scenes freeze it. Detected beats still grow individual shards outward from their fixed anchors; the globe itself never scales or bounces.

Each beat also launches a surface-light ripple shared by core and shards. Repeated triangle-centroid attributes give each face one constant angular distance from the ripple origin, so whole triangular faces flash in sequence rather than drawing a smooth stripe through them. Eight reusable wave slots travel across the rotating globe; overlapping flashes use maximum brightness rather than additive white saturation.

A single neutral-grey smoke wisp crosses a limited part of the formation, preserving most of the silhouette and neon edges. Its small foreground sheet lasts 8–10 seconds, with seeded variation in position and direction and opacity capped at 0.8 before noise and edge fades. It cannot accumulate into a full-globe fog blanket. The wisp is separate from the fluid solver used in other scenes and freezes when paused.

Beneath the aurora, Crystals reuses Horizon's 24-line/6 KB audio-waveform history and perspective-floor shader in cyan/magenta. A depth-tested background pass keeps the moving lines behind the globe, shards and smoke; its horizon follows the projected lower aurora hem. Each line retains its captured waveform while travelling towards the viewer. The history freezes while hidden or paused and survives viewport/quality changes. Scene disposal releases the floor texture, material and geometry.

### Neon Road

Scene 9 is an endless '80s neon drive: magenta road edges, cyan dashed lanes, wire-grid mountains, starry purple sky, and a striped sunset. The camera follows the same smooth bends and hills used by the GPU road, looking ahead with damped steering. Ground markings and a fixed pool of 64 roadside lights move toward the viewer; bass lifts edge brightness, mids light the terrain, and highs/FFT bins energize lane lights and markers. Musical energy gently changes speed without beat-triggered camera jolts. Geometry is reused, terrain is displaced on the GPU, and the shared Auto/High/Ultra render caps apply. Pause freezes travel; hidden scenes stop updating. No frequency-bar or p5 overlay covers the road.

Neon Road has its own lightweight atmosphere: six reusable, depth-tested smoke sheets blow sideways across the highway as the camera approaches, fading before they pass the camera or recycle. Distant procedural cloud banks drift slowly over the purple sky, with a subtle pink rim while the striped sunset stays visible. Both layers share the road's paused clock; hidden scenes do not advance. These are procedural shader effects, not extra fluid simulations or image assets.

### Retired plasma Tunnel

The standalone plasma Tunnel scene (renderer ID 13) has been removed from
selection and Auto Director. Its ID stays reserved. Shared tube geometry in
`src/endless-tunnel.js` remains in use by Torus; existing attribution is retained.

### Smoke performance

Smoke is only an accent in existing scenes. Valley emits narrow wisps near its central vanishing point, sweeps them outward, and dissipates them quickly so the terrain stays visible. Bloom retains its circular emission style. The standalone Haze and Smoke scenes and their composition selector have been removed; Ribbon remains removed. Press **O** for visuals only.

The solver runs at a fixed 30 Hz with at most two catch-up steps per frame. Auto/High/Ultra use a maximum grid edge of 192/256/320 pixels and 12/18/24 pressure iterations; this is independent of display pixel ratio. Hidden smoke scenes stop simulating; pause freezes the fluid state. Resizing the simulation grid clears its history. Devices without float render-target support omit the fluid layer. This ports the GPU solver/compositions, not the upstream C++ UI, CPU solver, or PortAudio backend; browser audio remains local through Web Audio.

The experimental React Smoke particle source/texture is retained for reference but is no longer imported, rendered, or bundled into the application.

## Conductor

The checked-in `.conductor/settings.toml` installs dependencies for new workspaces and starts Vite on Conductor's allocated `CONDUCTOR_PORT`. Concurrent mode is safe because each workspace receives its own port range.

## Creative references

### Flyover (retired standalone scene)

This scene is no longer selectable or included in Auto Director. The following
notes describe its retained implementation. Shared Aura and Geiss background
effects remain active in Horizon, Neon City and Bloom.

Former scene 10, **Flyover**, adapts chunk/skirt geometry and streaming ideas from
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

The Scene Timers dialog contains an accessible on/off switch and numeric duration
for every scene, separate from Options. Open it through Options or View → Scene
Timers (⌘⇧T). Native HTML dialog behaviour contains focus, Escape closes it,
and numeric spinner arrows are suppressed without changing number validation.
The live frame/bin dump is removed. Scene status shows the configured duration
rather than a countdown; the static version label comes from package.json.
The switches share `SceneRotation` with the rail. `SceneDurations` stores validated
integer overrides by renderer ID under `auralis.scene-durations.v3`; malformed
values and retired IDs are ignored. Zero selects 16 detected beats; 5–600 selects
active seconds and advances without needing a beat. Defaults are Horizon 20s,
Neon City 30s and five seconds for other scenes. Legacy v1 zero timers migrate to
five seconds once; the former Horizon 40s and Neon City 60s defaults migrate to
20s and 30s. Other custom values and explicit v2 beat-mode choices are preserved. A new explicit zero in v3
still selects beat timing. Reset times leaves inclusion untouched.
Editing the current duration restarts the dwell clock; pause, hidden-window time,
manual direction and incoming blends do not consume it. Turning
off its current selection blends to the next enabled scene. One enabled scene
holds; all-off holds the current picture and stops automatic scene changes.
Re-enabling a scene restores the rotation. With Auto Director off, these choices
edit the future rotation without interrupting the manually selected scene.
Arrow keys preview all scenes (including excluded ones), and 1–9 still preview
the first nine; previewing does not change inclusion. The settings panel shows
the enabled count and the A key switches Auto Director on or off.


### Aura (retired standalone scene)

This scene is no longer selectable or included in Auto Director. The following
notes describe its retained implementation. Shared Aura and Geiss background
effects remain active in Horizon, Neon City and Bloom.

Former scene 12 adapts the user-supplied standalone **Aura** HTML/GLSL example into
the existing renderer. Its distance field retains seven sine-warp octaves,
centre attenuation, tall folds, black-cutoff glow and deterministic dithering.
No CDN scripts, extra renderer/canvas, lil-gui dependency or global colour-space
override are added. Display-space shader colours are decoded for the shared
linear HDR pipeline before bloom and final output mapping.

Smoothed bass controls line width and height; mids bend the field; highs lift
fine highlights. Each distinct detected beat drives an eased attack/release
pulse without jolting the camera. Travel integrates eased loudness around the
reference speed of 0.65. Four palettes are supported, with the original sine
spectrum retained in the first palette.

Auto/High/Ultra cap the longest target edge at 900/1200/1600 pixels and use
24/30/40 ray samples respectively (the reference loop starts at index 20).
One full-screen triangle is created lazily and reused. Pause—including resize
redraws—freezes its motion, hidden scenes stop advancing, and scene disposal
releases its geometry, material and render target. Existing keyboard/native
next/previous controls, side-icon exclusions, Auto Director, 1.6-second blends
and visual-only mode all apply. No bars, p5 particles or fluid smoke cover Aura.

Horizon also uses an independent instance of this effect as its sky background,
at 42% intensity with foreground and baseline masks. Its spectrum skyline and
waveform history remain separate. Each visible instance advances once per
frame, so a Horizon-to-Aura blend does not double the animation speed or mix
their palette states.

### Shared background meter

The shared background bar meter (used by scenes such as Bloom and Valley)
samples the already-quadratic spectrum texture linearly from .065 to .94. This
skips the DC plateau and avoids squaring the frequency coordinate twice, which
made the left-hand bars and peak markers repeat the same bass bins. Column counts
are whole numbers and horizontal placement uses screen UVs in either orientation.
Scene-specific meters and scenes that suppress the backdrop remain unchanged.

### Dark Matter

Scene 10 adapts the user-supplied **Dark Matter** HTML/GLSL example into a
single lazy fullscreen pass. Its flattened volumetric disc retains the original
value-noise filaments, radial swirl, warm inner cloud, blue outer cloud and dark
central core. Four palettes work with the existing shared linear HDR/bloom
pipeline, without another renderer, CDN dependency or GUI.

Bass smoothly changes density and angular speed, mids advance the noise field,
and treble lifts highlights. Each distinct detected beat launches a restrained
outward highlight within the cloud. Integrated, eased motion avoids speed-change
jumps and repeated triggers from held transients. Pause freezes the entire
effect, including resize redraws; hidden scenes stop advancing.

Standalone Dark Matter also draws a glowing purple oscilloscope below the
vortex, including with the interface hidden. Its 384-sample texture shares the
deck's rising-zero-crossing trigger and 1.2 display calibration, reading the
response-scaled time-domain waveform rather than FFT bins. Silence produces a
flat line, pause freezes the samples, and disposal releases the texture. The
trace is composited in the existing shader, including rays that miss the cloud,
so it blends with scene transitions without an extra canvas or draw call. Light
Tunnel's stationary Dark Matter backdrop does not allocate or display the trace.

The adaptation corrects reversed `smoothstep` ranges, replaces negative core
glow with non-negative absorption, and removes a second opacity multiplication
after front-to-back integration. Rays intersect the cloud bounds and sample the
whole interval at every quality level instead of truncating the far side.
Auto/High/Ultra cap the longest target edge at 640/900/1200 pixels and use
32/48/64 samples, with stable per-pixel jitter and early opacity termination.
Geometry, material and target are reused and disposed with the other scenes.

Side-icon rotation controls, arrow navigation, Auto Director, live scene blends
and visual-only mode all apply. Bars, p5 particles, additional fluid smoke and
camera kicks are excluded so the cloud remains readable.

### Light Tunnel

Scene 11 adapts the user-supplied Three.js light-tunnel example. The 18-point
closed Catmull–Rom route, 620 longitudinal segments, 14.4-unit tunnel radius,
57-degree opening and seeded strip variation preserve its open-sided flight
through amber, cream, pink and blue light. Four app palettes are supported.
The separate Torus scene is unchanged.

Dark Matter supplies a single stationary cloud on the right of Light Tunnel.
A fixed virtual viewpoint at (0, 3.8, -9.8) makes the volume appear distant;
its framing is shifted to 77% of the screen width and slightly above centre.
It deliberately does not follow the tunnel camera: there is no cloud drift,
rotation, noise animation or music modulation. Background stars also stay fixed,
while foreground light strips and sparks continue their musical flight.
The cloud draws first, never writes depth, and uses restrained brightness.
Its volume is marched at 16/24/32 steps (Auto/High/Ultra); empty rays are rejected
by volume bounds. No extra render target or compositor sampler is required.
Palettes, resize and scene blends remain supported. The standalone Dark Matter
scene retains its original animation and full audio response.

Arc-length camera travel starts at 30 units/second. Smoothed bass and mids add
up to 12 units/second without position jumps, and an eased path-frame orientation
follows the bends without mouse controls or beat-driven camera kicks. Frequency
bands brighten different strip colours. Distinct detected beats launch narrow
highlights 100 units ahead, travelling back at 70 units/second; eight reusable
pulse slots fade before wrapping. Fine shimmer uses integer spatial harmonics
to avoid a brightness seam where the geometry closes.

One indexed ribbon mesh and two point fields are allocated on first selection.
Auto/High/Ultra draw 90/120/150 strips, 3200/5200/7400 stars and 700/1100/1500
interior sparks. Draw ranges change without rebuilding geometry; a coprime lane
permutation distributes every quality tier around the entire tunnel opening.
Target caps follow the standard 1000/1400/1800-pixel procedural budgets.

The implementation uses the installed Three.js version, existing HDR targets,
bloom, blending and controls—no CDN, second renderer, GUI, new dependencies or
extra animation loop. The reference's reversed star `smoothstep` is corrected.
Camera, shimmer and beat highlights all freeze on pause/resize and while hidden.
All geometry, materials and targets use shared scene disposal. Dark Matter and
Light Tunnel bind a shared texture slot separately for each mixer draw, avoiding
an additional fragment sampler while retaining independent live crossfades.

### Fractal Lotus

Scene 12 adapts the user-supplied **Fractal Lotus / Crystal KIFS** shader. Sixteen
kaleidoscopic folds, fixed crystalline rotations, spherical inversion, the
reference expansion vector and 5.9-unit bounding sphere retain its intricate
filaments. A 3.2-unit camera orbit and subtle roll explore the interior. Four
palettes include the original holographic spectrum and warm central glow.

Smoothed bass gently adjusts filament thickness and orbit speed; mids increase
morph speed. Camera and morph velocities are integrated instead of multiplying
elapsed time by live levels, avoiding abrupt jumps. Deduplicated detected beats
drive an eased highlight envelope, while treble lifts sparkle. Quiet input
preserves the original slow motion without emitting extra beat accents.

Numerical safeguards use a positive inversion denominator, bounded inverse
scale, safe vector normalization, a positive minimum march step and non-negative
vignette. Particle edges use ascending `smoothstep` bounds. The original local
ACES/gamma passes are removed; reduced scene gain preserves filament contrast
through Auralis's shared linear HDR bloom and final output mapping.

All tiers retain 75 march samples and 16 folds so quality changes do not change
the fractal itself. Auto/High/Ultra cap the target's longest edge at 640/960/1280
pixels with 32/64/100 analytic 3D sparks, masked against the ray's travelled
distance as in the reference. One fullscreen triangle is allocated lazily and
reused. The additional-scene sampler is shared per mixer draw; no extra renderer,
texture unit, CDN library, GUI or animation loop is added. Pause, paused resizes,
hidden-scene freezes, resource disposal, side-icon exclusions, live scene blends
and visual-only mode use the existing scene lifecycle.

### Voxel Tunnel

Scene 13 adapts the user-supplied voxel/fractal tunnel shader. Its square
3.3-unit half-width corridor retains the seven-unit repeating depth fold,
36.4-times axis stretch, logarithmic warp, 55-unit voxel quantisation and
distance-dependent sinusoidal turbulence. The unusual supplied cosine matrix
deforms noise only; it does not rotate the camera. Its folding axis is calculated
and normalized once on the CPU rather than evaluating tangent per pixel.

Forward travel integrates a base speed of 1.5 plus smoothed bass/loudness;
only the seven-unit repeating coordinate wraps, keeping precision without
resetting animation. Bass subtly changes tunnel width, mids increase the noise
clock, and treble/deduplicated beat envelopes accent wall light. The central
emission receives only a restrained bass lift, with no beat-driven camera kicks.
Four phase/tint palettes include the supplied original spectrum.

The shader keeps its 110-step maximum, 45-unit distance cutoff, brightness
cutoff and at most 12 turbulence iterations. Integer loop bounds replace
floating-point loop counters. A negative-exponential tanh avoids overflow, and
the compressed display colours are decoded into Auralis's shared linear HDR
pipeline. Auto/High/Ultra cap the longest target edge at 640/960/1280 pixels
without changing the corridor shape or voxel grid.

A single lazy fullscreen triangle and render target are reused. Existing
additional-scene sampler routing supports independent live blends without a new
texture unit. Pause, resize while paused, hidden-scene freezes, disposal, scene
rotation controls and visual-only mode all apply. No CDN dependencies, extra
renderer, GUI, bars, smoke layer or animation loop are added.

### Magnetic Silk

Scene 14 (stable renderer ID 21) adapts the user-supplied magnetic-pole,
holographic-line shader. It preserves the asymmetric two-pole domain warp,
off-centre diagonal composition, frequency 19.05, thickness 0.4842, power 0.4921,
finite-difference height normals, dual lighting and line-synchronised rainbow
edges. The original purple/pink/cyan gradient is the default palette; the other
three palettes tint both the surface and its holographic highlights.

The magnetic poles and domain warp flow continuously at the reference speed
of 0.062, without beat-driven displacement or sudden speed changes. Deduplicated beat
onsets emit up to eight colour waves, travelling along the warped silk surface
and fading over 2.8 seconds. Bass controls ripple colour-mix strength, not shape.
Silence emits no new colour ripples, while gentle folding continues.
Pause and hidden scenes freeze both the flow clock and ripple ages. Shared post-processing suppresses
audio-driven brightness pumping for this scene as well as lens/camera motion.
The reference contrast is decoded for the shared linear HDR pipeline
to avoid washing out the folds with a second gamma lift.

Auto/High/Ultra cap the longest render-target edge at 800/1200/1600 pixels and
use 1/4/9 subpixel samples. Resolution uniforms always match the actual target,
including after DPR or quality changes. A bounded uniform-driven sampling loop
reuses the same shader and resources without recompilation. The centre domain
evaluation is reused for both height and holographic line identity.

One lazy fullscreen triangle shares the existing additional-scene texture slot.
Four palettes, side-icon rotation, live crossfades, pause, paused resize and
hidden-scene freezing work through the common lifecycle. No extra CDN imports,
GUI, renderer, animation loop, bars or smoke overlay are introduced.

### Cyber Tunnel

Scene 15 (stable renderer ID 22) adapts the supplied neon/data-stream tunnel.
Its closed, vertically separated figure-eight route retains the 350/250/35-unit
shape and 15-unit tube radius. The duplicate closing control point is removed;
4096 arc-length divisions and upright path frames keep travel smooth. The
800-by-64 tube (52,065 vertices) is built once and reused at every quality.
Camera height is 3 units, looking ahead along the route with eased orientation.

A single Neon March figure travels 48 route units ahead, near the upcoming bend. Its 16 sphere joints
are the inverse transforms of the original marcher shader's leg/arm chains,
rendered in one instanced draw with normal depth testing, rather than a screen
overlay or a second ray-marched crowd. It follows the upright tunnel frame,
keeps its feet at local height -12 inside the 15-unit tube, and does not follow
mouse sway. The same independent Neon March cadence responds to detected BPM;
beat pulses brighten its cyan/pink (or selected-palette) joints. Pause and hidden
scenes freeze its pose, and the shared scene traversal disposes all resources.

The character's polished surface reflects the actual neon tunnel using a private
HDR cubemap captured at its position. A tunnel-only proxy shares the existing
geometry/material, excluding the character to avoid recursive reflections.
Auto/High/Ultra use 64/128/128-pixel faces and at most 6/8/12 captures per active
second. Pause/hidden scenes freeze captures; palette or resolution changes
refresh them without advancing motion. Capture failures restore the previous
render target, cube face, mip level and XR state. Disposal releases the cubemap
without disposing the borrowed tunnel resources twice.

The shader retains varied-width segmented lanes, moving laser heads, particle
dots, ten broken ring stations, barcode-like ghost panels, plasma washes and
wet-floor reflection shading. Reversed `smoothstep` edges are corrected, and
the reflection lookup maps the floor onto occupied side lanes rather than the
empty upper wall. Longitudinal lane harmonics close on whole periods. A seeded
256-pixel procedural glyph atlas replaces font-dependent Katakana drawing;
geometric symbols require no external images, fonts or canvas texture setup.

Base travel advances 0.02 laps/second, integrating smoothly eased bass and
loudness up to 0.03 laps/second. Mids drive streak motion and ghost panels,
treble lights data streams, and deduplicated beats brighten lanes through an
attack/release envelope. FOV varies gently from 85 to 89 degrees with loudness.
The supplied settings screenshots define the baseline preset: speed 0.2
(0.02 laps/second), camera height 3, floor reflection 0.35, holograms 0.864,
matrix glyphs 0.25, depth shadows 0.001, ten enabled rings, top `#0a198c`
and floor `#11133b`. Music adds gently smoothed modulation to this baseline.
Warp drive remains off. Mouse sway has strength 5, eased at 4/second with
half-strength vertical movement and bounded lean. Leaving the canvas returns
to centre; touch is ignored, pause freezes sway, and disposal removes listeners.
Bloom strength 1 and horizontal RGB shift 0.001 use the shared postprocessor
and blend back to other scenes' settings during transitions. These are Auralis
bloom/colour mapping, not a pixel-identical UnrealBloomPass reproduction;
no extra GUI, renderer or postprocessing pipeline is added.

All four app palettes apply. Auto/High/Ultra cap targets at 800/1100/1500 pixels
on the longest edge, retaining the same geometry. Auralis supplies linear HDR
bloom, scene blends and final colour mapping; background intensity is restrained
to keep neon readable. Allocation is lazy, hidden worlds stop updating, pause
also freezes resized views, and disposal releases the glyph texture along with
the shared tube/material/target resources. No new dependencies, renderer, GUI,
animation loop or main-compositor texture slot are needed.

### Ferrofluid (retired standalone scene)

This scene is no longer selectable or included in Auto Director. The following
notes describe its retained implementation. Shared Aura and Geiss background
effects remain active in Horizon, Neon City and Bloom.

Former scene 19 (stable renderer ID 23) adapts the supplied ferrofluid example.
A circular liquid surface rises from a radial FFT map: the centre samples bass,
and the rim samples the top of the existing 256-bin spectrum. A private FFT
texture uses time-based attack/release (24/5 per second), preserving a paused
surface even when live audio changes or the render target is resized. Noise
motion integrates smoothly eased loudness; silence lets the spikes settle flat.
This is procedural displacement, not a physical fluid simulation.

The supplied 3D simplex noise, height gain 15, sharpness 4.15, roughness 0.162
and metalness 0.5 are retained. Density is reduced from 3 to 2 for clearer spikes
at interactive resolutions, and dark metallic palettes brighten reflections.
An analytic soft circular mask replaces the canvas image; a separate floor
material prevents accidental floor displacement. Finite-difference normals are
calculated in object space before Three's normal matrix, correcting the
reference's direct assignment to its view-space normal varying.

Local procedural HDR softboxes are reused from the crystal studio generator;
there are no remote HDR downloads, SVG uploads, extra permission prompts,
GUI, OrbitControls or second AudioContext. A fixed perspective camera retains
the supplied 20/15/30 viewpoint, with portrait-aware zoom. The existing app
palette, quality, demo/microphone/file sources and crossfades apply.
Auto/High/Ultra use 192/320/480 grid segments and the shared render-size caps.
Geometry changes only when the quality tier changes, releasing the old mesh
buffer immediately. The owner disposes the private FFT/environment and shared
mesh/material/target resources. No extra compositor sampler is added.

### Neon March

Scene 16 (stable renderer ID 24) expands the supplied compact X/L/A shader
macros into readable sphere-joint functions. The two alternating legs, paired
arms, torso, head, 0.3-unit joint radius, eight-unit X/Z repetition and periodic
vertical bob are retained. The snippet's undefined translation `s` is treated
as zero; loop counters, ray distance and colour accumulation are initialized.
A bounded 100-step ray march uses a positive minimum step, 75-unit far limit
and early exits. Stable positive glow replaces the original reciprocal
exponential; shaded joints and a perspective waveform floor improve readability.

The floor reuses Horizon's 24-line captured audio history and 6 KB texture.
Lime/yellow filaments, fine echo lines and amber accents travel towards the
viewer, spreading naturally in perspective; the other palettes tint them to
match the figures. Brightness is restrained beneath the joints, and row travel
uses the runners' exact integrated gait distance (20/π world units per radian),
including tempo changes and phase wraps. Each row keeps its recorded waveform, with beats accenting
new rows. Ground-plane ray intersections keep the lines beneath/behind the
marchers, not overlaid on their bodies. Pause and hidden scenes freeze this
private history, and disposal releases its texture. This floor is exclusive to
Neon March; Cyber Tunnel retains its original reflective floor.

A smoothed gait phase replaces direct elapsed-time multiplication. Detected
BPM sets the target to one half-stride per beat (a complete left/right cycle
every two beats); while BPM is unavailable, the reference five-radian/second
cadence is used. In silence, cadence settles to 1.2 radians/second. This is
tempo-following motion, not hard phase-locking or footstep-triggered animation.
The phase wraps at a full cycle; the associated 40-unit travel is exactly five
repeated cells, so wrapping does not jump the formation. Deduplicated beats
drive a bounded attack/release glow; treble adds a small highlight lift.
The camera is fixed and never receives transient kicks.

All four palettes, pause, hidden-state freezing, resize and blending work through
the shared renderer. Auto/High/Ultra cap the scene target at 640/900/1200 pixels
without changing the figure geometry or ray budget. One fullscreen triangle,
one material and the existing additional-scene sampler are used. No assets,
extra audio contexts, remote dependencies or separately loaded models are needed.

### Valley sky

`src/valley-sky.js` adapts the user-supplied structural-density volume shader
into an overhead sky. It uses the terrain camera's world-space ray, renders
only when the terrain march misses, and fades into the existing horizon fog.
The terrain, flight path and foreground smoke remain unchanged. Bass gently
changes volume density and global level changes luminance. The existing
pause-aware flight clock controls drift. Auto/High/Ultra cap the single sky
march at 24/30/36 samples; there is no extra canvas, render target, GUI,
supersampling loop or network dependency. Existing post-processing handles
bloom and grain. Source attribution and the missing redistribution licence
are recorded in `THIRD_PARTY_NOTICES.md`.

### Neon City

Tall façade lights also act as bottom-up audio meters: 32 quadratically spaced
bands read the response-scaled analyser directly (bypassing the visual spring),
with a 22ms attack, 120ms release and 75ms peak hold. A noise floor and power
curve expand the logarithmic FFT's loud/quiet contrast. The original full-height
rails are narrow vertical faces in the advert meshes, tagged once at load time
and filled independently of the unchanged billboard artwork. Dark unlit portions
and a brief peak marker make the height legible; window lighting also follows
the meters. Local
building height keeps the fill anchored while the camera moves and districts
stream. A single 32×1 RGBA texture adds no geometry or draw calls; it freezes with
the scene and is disposed with it. The global Response control scales its input.

Scene 1 (stable renderer ID 25) is inspired by Jeff Beene's
[Synthcity](https://github.com/jeffbeene/synthcity), reviewed at commit
`5a4ee0dd231ce06653a2a9776ed2e36137918d21`. Its grid streaming, district
variation, emissive adverts and elevated traffic inform this local implementation.
The original box-only skyline has been replaced with eight building meshes and
eight matching advert meshes from that revision, six façade/emissive texture
pairs, seven sign textures and its night sky texture. Assets are bundled locally
under the upstream MIT license; there are no runtime external downloads. The
source's separate car/cockpit art, audio and interactive driving system are not
included. See THIRD_PARTY_NOTICES.md for the exact asset inventory.

The supplied aerial reference informs the dense architecture and palette.
Deterministic 96-unit rows each contain 48 buildings across eight fixed instanced
batches, with matching batches for signs and up to 1,056 distinct buildings.
Most lots are low/mid-rise; sparse district-dependent landmark towers punctuate
the skyline. Seeded quarter-turns, broader outer blocks and authored rooftop
geometry break up repetition. Building and sign bounds are normalized together
so projecting ads remain inside the tested flight clearance envelope.
Modulo row slots recycle behind the camera; one new row is generated on each
forward block crossing. Rebased local Z positions preserve continuity and
keep mesh coordinates small. Quality changes rebuild slot metadata, not GPU
geometry. Auto/High/Ultra show 14/18/22 rows and 24/36/48 traffic vehicles.

The camera starts at 280 units (half its original altitude), above most rooftops
but among the tallest towers, looking down at 55 degrees. It holds that altitude for the
first 48 route units, then descends smoothly to 100 units by distance 360 while
gradually leveling its view. This opening follows the central boulevard; the
repeating forward street circuit starts at distance 384, after the descent.
Cruising altitude then varies smoothly above the streets and through the mid-rise
skyline (bounded to 100–220 units). Overlapping long-wave height functions produce
uneven climbs and dips; a smooth onset preserves the end of the opening descent.
Unwrapped route distance keeps height continuous across circuit repeats, and the
camera gently pitches toward the upcoming altitude without beat-driven bouncing.
Auto Director defaults to Neon City for 30 active seconds and Horizon for 20
after each incoming blend. These durations are editable in Scene Timers;
zero switches to 16-beat timing. Pauses, hidden-window time, manual direction
and incoming blends do not consume the timer; manual scene changes and exclusions
still work immediately. Other scenes default to five seconds.
It turns from the central boulevard into intersections and both side avenues,
using 20-unit-radius corners and steering averaged across 160 route units
(48 behind / 112 ahead). This anticipates turns without abrupt local-tangent
swings; banking is limited to two degrees. Distance-based steering remains
identical across frame rates and frozen while paused.
The 48-unit tower pitch and widened cross streets leave clearance around the
entire path; tests sample three circuits against conservative building footprints.
Route distance and forward world distance are separate: streaming, road markings
and atmosphere use the latter so lateral turns do not drag buildings along.
Dark textured façades, clustered white/ice emissive windows, projecting neon
signs and a blue-violet distance palette follow the reference's visual direction.
Mipmapped, anisotropic texture filtering reduces distant shimmer. The city alone uses
bloom strength 2.1, smoothly blended back to other scenes' normal settings.
Route speed integrates from 24 to 32 units/second with smoothed loudness;
buildings keep their shape and height on beats. A private 256-byte FFT snapshot
lights different façades, and a deduplicated beat envelope accents windows,
signs and road light. The sign artwork is recolored into cyan/magenta and the
selected palette while preserving white highlights. Subdued road markings and
pools of reflected-looking blue light replace the prominent neon road outlines.
Wet-road streaks are an artistic reflection approximation, not a mirror pass.

Neon City also owns an independent Aura backdrop, reusing the standalone Aura
shader and audio envelopes. It renders at a capped 640/800/1000-pixel long edge
(Auto/High/Ultra) on a fixed 2:1 canvas, then blends into the upper sky with a
soft fade above the true world horizon. Inverse-projection rays and the camera's
rotation anchor the ribbons to celestial bearings about ten degrees above it.
Camera translation and city streaming do not move the Aura; pitch, yaw and
banking reveal the fixed sky naturally. Aspect changes do not stretch its pattern.
The sky is drawn before all city geometry, so buildings and the road occlude
the effect. Its clock is independent of Horizon and standalone Aura during
scene blends; hidden/paused time does not advance it. Paused frames reuse the
sky texture unless the quality, size or palette changes, and disposal releases
its private render target, material and geometry.

Ground, sky, buildings/signs, traffic, rooftop beams, three elevated mist layers
and low street smoke use 22
draws, plus one Aura backdrop pass, before shared postprocessing. Slowly leaning, depth-tested open cones approximate light
shafts and procedural noise sheets add layered haze, rather than a costly
volumetric pass. Both remain behind nearer geometry and follow pause/streaming.
The three elevated layers use subdivided, gently undulating sheets with warped
three-octave noise and sparse density pockets. Neutral-grey tint and a .07
maximum per-layer opacity replace the former saturated blue .32 sheets. Near
distance, camera-height clearance and grazing-angle fades suppress visible
barriers when flying through a layer. This retains a single instanced haze draw
and the same world-space, pause-aware drift without changing the flight path.
Seven thin instanced smoke layers centre on 50 world units above the road
(42.5–57.5), with a reduced per-layer opacity of .095, still below
the camera's minimum height of 100. A street-grid mask confines grey wisps to
avenues and cross streets; three noise octaves and a slow lateral wind produce
broken drifting patches. The noise samples unwrapped city coordinates so it
does not jump at district boundaries. Height/distance fades preserve building
visibility, and depth testing keeps nearer architecture in front. The layers
share one draw call and the existing pause-aware city clock; no texture assets
or screen-wide smoke overlay are added.
Distance haze conceals incoming rows and distant traffic
recycling. Pause freezes the camera, lights and traffic, including viewport and
quality changes; hidden scenes stop advancing. Palette changes, scene blends
and existing microphone/file/demo sources are supported. Disposal releases
the private FFT, bundled textures, instance buffers, geometry/materials and render target.
Late texture loads invalidate the image during pause without advancing the flight;
callbacks after disposal cannot publish textures back into the scene.
The original driving controls, collision engine, radio and remote assets are
not included; this scene is an automatic music-reactive flight.

### Geiss Flow (retired standalone scene)

This scene is no longer selectable or included in Auto Director. The following
notes describe its retained implementation. Shared Aura and Geiss background
effects remain active in Horizon, Neon City and Bloom.

Former scene 11 is an original GPU interpretation of Ryan Geiss's
[waveform-and-warp feedback technique](https://www.geisswerks.com/geiss/secrets.html).
The actual time-domain audio seeds coloured traces into a persistent image.
Six smoothly blended fields provide expanding spirals, paired vortices, winding
currents, mirrored kaleidoscopes, vortex tunnels and liquid ribbons. Standalone
Geiss starts in Kaleidoscope; Automatic changes fields on 16-, 24- and 32-beat
phrases with a six-second minimum hold. Held transients cannot count repeatedly.
Bass swells traces, mids shape petals and treble adds sparse sparks; silence
stops emission and lets existing trails dissipate.

The standalone Geiss menu, V shortcut and variation commands have been removed.
Bloom retains its independent, restrained feedback background.

Vortex Tunnel keeps positive radial travel independent of swirl direction, so a
variation reversal cannot stall or reverse flight. Its travel rate is
`0.95 + bass × 0.25 + level × 0.15`, using smoothed audio; tunnel-only feedback
decay is reduced to preserve trails across the screen. Each distinct audible
beat launches one expanding ring from radius 0.17. Sixteen reusable ring slots
grow exponentially in perspective and retire past radius 6 without wrapping.
The sharp fronts are composited after feedback with maximum-overlap brightness,
so they cannot build up into a white smear. Pause freezes both layers, and other
patterns and Bloom do not emit tunnel rings.

Bloom also uses this flow as a soft background. Compressed trail highlights,
reduced intensity near the core and foreground-aware dimming keep the flower,
expanding sound waves and smoke prominent. Bloom retains its original three
fields, eight-beat changes and four-second minimum hold in a separate history.
Standalone pattern/variation controls cannot change Bloom. Each visible history
advances once per frame, including during their crossfade. Other scenes remain
unchanged.

Two lazy, reusable half-float targets per flow preserve linear-light colour, with
time-based decay and bounded brightness. Auto/High/Ultra cap their longest edge
at 1000/1400/1800 pixels. Resize resamples the existing trail rather than clearing
it; pause freezes it and hidden scenes stop updating. Scene blends keep both
outgoing and incoming animation live. All four palettes, the scene rail, arrow
navigation, Auto Director and visual-only mode work as usual. No generic bars,
p5 overlays, camera kicks, native plug-ins or new dependencies are added.

The project draws inspiration from [Fosfora](https://github.com/kevinraymond/fosfora), [ShaderAmp](https://github.com/ArthurTent/ShaderAmp), [Jeff Minter's Xbox 360 visualiser](https://www.youtube.com/watch?v=PFJhswIyVtc), [pdoom-video](https://github.com/mexicat/pdoom-video), [NEON](https://github.com/GIGAMOLE/NEON), and [AudioVisualize](https://github.com/joepdooper/audiovisualize). Post-processing techniques are adapted from [Astrofox](https://github.com/astrofox-io/astrofox); the smoke solver and audio compositions are adapted from Jack Purvis's [Smokey BBQ](https://github.com/EmperorJack/smokey-bbq). See [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) for provenance and license notes.
