# Third-party notices

Original Auralis code is licensed under the MIT License in `LICENSE`, copyright
(c) 2026 Studio313. Third-party code and assets retain their respective licences
and attribution requirements as documented below; they are not relicensed by the
project's MIT licence.

## Geiss — design reference

Ryan Geiss's [Geiss](https://github.com/geissomatik/geiss) and his technical
article [How Geiss Worked](https://www.geisswerks.com/geiss/secrets.html)
inspired the waveform injection and persistent image-warp feedback in
`src/geiss-flow.js`. The GPU velocity fields, shaders, audio smoothing and
resource management here are original implementations; no upstream source,
artwork, Windows binaries or assembly are distributed. Upstream is published
under the [BSD-3-Clause license](https://github.com/geissomatik/geiss/blob/main/LICENSE),
copyright (c) 1998–2022 Ryan Geiss. This attribution does not imply endorsement.

## ProceduralTerrains — ZyFou

Source: https://github.com/ZyFou/ProceduralTerrains

Reviewed revision: `96c094ef49dd4b2d1ff8c51c47ab1faa7c201ea7`.
`src/terrain-flyover.js` adapts the grid and perimeter-skirt construction from
`src/engine/terrain/ChunkGeometry.js`. Its bounded, instanced LOD pool is inspired
by `InfiniteWorld.js`; deterministic GPU terrain, biome shading, water, clouds,
audio response, and automatic camera flight are tailored to this visualiser.
The terrain editor, account service, exporters, and plugins are not bundled.

MIT License

Copyright (c) 2026 ZyFou

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense,
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## React Smoke — isoteriksoftware

Source: https://github.com/isoteriksoftware/react-smoke

Pinned reference: `8922733768cbee76c2aadedd7e57da8cc4af89c2`.

`src/smoke-clouds.js` adapts the particle planes, shared Lambert materials, rotation, wind, turbulence and boundary steering from `src/components/Smoke/index.tsx` and `src/core/utils/index.ts`. `src/assets/react-smoke.png` is the upstream `src/core/assets/smoke-default.png`, unmodified. Changes include direct Three.js orchestration, delta-scaled forces, deterministic placement, audio-reactive lighting/opacity/wind, quality limits, and offscreen rendering. The upstream MIT notice follows verbatim (including the copyright spelling).

MIT License

Copyright (c) 2024 isoteriksofware

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Smokey BBQ — Jack Purvis (EmperorJack)

Source: https://github.com/EmperorJack/smokey-bbq

Pinned reference: `1ededca35822aac614da71294c122c87e02143cd`.

`src/smoke-simulation.js` adapts the GPU simulation sequence in `src/smoke_simulation/smoke_simulation_gpu.cpp`, the advection, buoyancy, impulse, curl, vorticity, divergence, Jacobi, and pressure shaders under `resources/shaders/programs/`, and the horizontal/circular/RGB audio compositions in `src/compositions/`. Upstream composition sources credit Jack Purvis.

Port changes: JavaScript/Three.js orchestration, WebGL shader syntax, packed velocity/density/temperature fields, batched emitters, fixed timestep, browser FFT input, standard nearest-neighbour Jacobi stencil, reflecting velocity boundaries, and bounded half-float state. This is an adaptation, not a bundled native executable.

License provenance: the project user identified Smokey BBQ as MIT-licensed. The inspected upstream commit does not contain a top-level license file, so that assertion has not been independently verified. No upstream copyright year or license text has been invented here. Preserve this attribution and obtain the upstream license notice before redistribution.

## Endless-Tunnel-Rendering-OpenGLES — Quakeboy

Source: https://github.com/quakeboy/Endless-Tunnel-Rendering-OpenGLES

Pinned reference: `3c54aab1cc674c5cf4ce5c6877de8092fbfcc3b7`.

`src/endless-tunnel.js` adapts the torus parameterization and indexed closed-surface approach from `Tunnel/Tunnel/Tunnel/RTunnel.cpp` and `RTunnel.h`. The source attribution notice is retained in that module. The inside-torus endless-flight concept is retained, with a moving camera instead of rotating the entire torus. Changes include Three.js indexed triangles, duplicated UV seams, inside-facing WebGL shaders, frame-time-based travel, stable camera up direction, procedural plasma instead of the upstream bitmap, and smoothed music-driven deformation and lighting. No SDL binaries, DLLs, archive, native executable, or upstream image assets are bundled.

The MIT License (MIT)

Copyright (c) 2013 Rajavanya Subramaniyan

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## GeometryPainterThreeJS

Source: https://github.com/achrefelouafi/GeometryPainterThreeJS

Pinned reference: `79c7556ab8c5d7bcf92fa92d7fc8063db298b5e1`.

`src/procedural-scenes.js` adapts the hexagonal quartz geometry and physical-material approach from `src/modes/crystals.ts`, aurora curtain/fold-light equations from `src/modes/aurora.ts`, and seeded random generator from `src/modes/mode.ts`. Changes include automatic seeded spherical formations, frequency-shaped growth, slow camera drift, WebGL GLSL in place of WebGPU/TSL, audio-modulated curtains, and bounded quality settings. The interactive painting system is not included.

MIT License

Copyright (c) 2026 mohamedachrefelouafi

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Roomtone (design reference only)

[Roomtone](https://github.com/0xStoneyStark/roomtone), reviewed at commit
`398dbc6e6206cc9d2154831aba06f61039bc1380`, inspired Horizon's former dim ASCII background,
stationary character lattice, cached glyphs and restrained layered composition.
The repository did not declare a license at review time. No Roomtone code or
assets are copied or distributed here. The original local glyph/shader implementation
has since been removed and replaced by an Aura background. Roomtone's Jev/TypeSafe
integration is not used; analysis and rendering remain local.

## The Spirit

Crystals' surrounding particle cloud adapts GPU position/lifetime ping-pong,
curl advection and the 4D simplex-noise derivative helper from
[The Spirit](https://github.com/edankwan/The-Spirit) by Edan Kwan, commit
`c2ed239be0d7ed4ba28acf42dae42de994d37b8a`:
`src/3d/simulator.js`, `src/glsl/position.frag`,
`src/glsl/helpers/curl4.glsl` and `simplexNoiseDerivatives4.glsl`.
The port lives in `src/crystal-spirit.js` and `src/spirit-curl.js`.
Crystal-safe emitters, audio modulation, soft point rendering and quality/lifecycle
handling are new. The original application's UI, triangle-particle renderer,
shadow system, bundled Three.js and build dependencies are not included.

The MIT License (MIT)

Copyright (c) 2015 Edan Kwan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Astrofox

The temporal feedback, radial lens warp, LED sampling, and bass-glow treatments in Auralis were adapted from techniques in [Astrofox](https://github.com/astrofox-io/astrofox).

MIT License

Copyright (c) 2020 Mike Cao <mike@mikecao.com>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## User-supplied Valley sky shader

`src/valley-sky.js` adapts the structural-density volume and cinematic grading
from the shader supplied on 2026-09-30. Its source contains the author/support
credit **Sabo Sugi (sabosugi)** — Three.js & Shaders:
https://paypal.com/paypalme/sabosugi.
The adaptation uses Valley's camera rays, music input, existing renderer and
quality budgets instead of the standalone canvas and lil-gui controls.
No licence accompanied this snippet; it is not covered by this project's MIT
licence. Confirm redistribution permission before a public release containing it.

## Synthcity

Neon City's streaming grid, varied districts, emissive adverts and elevated
traffic were inspired by [Synthcity](https://github.com/jeffbeene/synthcity),
reviewed at commit `5a4ee0dd231ce06653a2a9776ed2e36137918d21`.
Reviewed files: `Generator.js`, `GeneratorItem_CityBlock.js`,
`GeneratorItem_CityLight.js`, `GeneratorItem_Traffic.js`, `GeneratorUtils.js`,
`Shaders.js`, `AssetManager.js`, and renderer/generator setup in `src/index.js`.

`src/neon-city.js` and `src/city-assets.js` adapt those ideas to an original
instanced, audio-reactive renderer. `src/assets/synthcity/` now bundles the
following unmodified city art from that pinned revision:

- Building models: `s_01_01`, `s_01_03`, `s_02_01`, `s_02_03`, `s_03_01`,
  `s_04_02`, `s_05_01`, `s_05_02` (OBJ).
- Advert models: `ads_s_01_01`, `ads_s_01_02`, `ads_s_02_01`, `ads_s_02_02`,
  `ads_s_03_01`, `ads_s_04_02`, `ads_s_05_01`, `ads_s_05_02` (OBJ).
- Façade/emissive JPG pairs: `building_01`, `building_02`, `building_04`,
  `building_07`, `building_09`, `building_10`, with their `_em` maps.
- Advert JPGs: `ads_01` through `ads_05`, `ads_large_01`, `ads_large_03`;
  and `sky_night.jpg`.

Geometry is normalized and instanced at runtime; shaders recolor the sign art
and add music-driven lighting. No upstream music, sound effects, third-party
vehicle/cockpit assets, player/collision system or bundled dependencies are
distributed. Attribution and the root MIT license are preserved below and in
`public/third-party/synthcity-LICENSE.txt` (upstream package metadata separately
says ISC; this notice follows its explicit LICENSE file).

MIT License

Copyright (c) 2024 Jeff Beene

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
