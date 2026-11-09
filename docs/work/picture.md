# Picture

## In the build

The focused view aims at vsync. It starts coarse and steps one octave toward the window while the frame holds. A miss steps back down. A still view can fill the rest of that octave with scattered rays. Extra frames stay near one picture a second until the primary is at the top octave and the frame is cheap. Then they speed up. If the primary drops an octave or misses, they slow down again, and they do not go below one picture a second. A hidden tab paints about once a second. The mirror follows the material. Desert sand keeps only a faint sheen. The sea is still the reflective surface. A wander client (`?bot=`) draws stand-in spheres instead of the full figures, and the bit reads the crust without rebuilding the picture. A person still sees the models.

## This pass

The edge drops the second bounce. Past the middle of the fovea fade, a mirror hit takes the sky tint instead of tracing on, so the periphery pays for at most one reflection. A full trace (still refinement) keeps every bounce. While the view moves, resolution holds at the still level and only drops when the frame rate would fall under `?minfps=` (default 12).

## Proves

`test/pace.test.js`, `test/batch11.test.js` (motion resolution), `test/batch12.test.js` (edge bounce).

## This pass (circle)

The sharp area is now a circle on the screen: the gaze-to-pixel offset on the image plane, aspect corrected, read as an angle. It matches the old angle at the gaze and no longer stretches toward the screen edges.

## This pass (land, Batch 24)

The terrain march starts under the land's top (64 m, room for the fractal ridges) instead of the 5.6 m dune cap, and an upward ray stops at that top. Near the north land the first 26 m march finer so a pine or the stream is not stepped over. Past that step size a pine reads as canopy: the same crowns on the same cell grid, flat-shaded. The mountain shades the ground behind it with a short march toward the sun.

Fog banks sit low in the valley, over the lake and along the river (`fogBanks` in `src/sim/land.js`) and roll with the wind on the cloud clock. The primary ray takes 7 samples inside the banks' box, or none when it misses the box. `?fog=0` turns it off, `?fog=2` takes 14 samples and thickens it. Bot clients (`?bot=`) default to off so the scale bench stays lean.

`?sky=<m>` puts the camera at that height above the feet, looking along the `?at` yaw and pitch. It is for overhead shots of the land; the body still walks below.

## Next

A circle that follows a tap: the gaze follows the body's look (`gazeFor`), but a tap on the phone does not move the focus. Not in this build.

## Later

A sharper center than the periphery. The soldier view must still refuse to miss vsync for a screenshot.

## Starting on phones (Batch 27)

**What went wrong.** The picture thread had 12 s to say it was ready. If it took longer, the boot
curtain stopped at "The picture did not start. Reload the page." for good, and a late "ready" was
ignored. In that time the thread does all of this:

- bakes the land, volcano and cave grids;
- compiles the trace shader, which is about 110 kB and much bigger since the volcano and the
  castle/caves;
- compiles the same shader a second time as the crowd ("tree") variant.

On a phone GPU compiler that is easily over 12 s. A missing cap or a failed compile ended in the
same dead stop.

**What it does now:**

- **Stages.** The thread reports its stage, and the curtain shows it ("compiling the picture
  (lite)"). The deadline is 90 s (`PICTURE_DEADLINE_MS`).
- **No dead stop.** On a timeout or an error the page stops the thread and swaps in a fresh canvas.
  The old canvas belongs to the thread and can't be drawn on again. Input is bound again on the new
  canvas, and the CPU picture draws on it. The real reason shows in `#glerr`.
- **Caps check.** `gpuCapsProblem` checks 16 texture units, 1024-wide textures, 224 fragment
  vectors and highp, and names whichever is missing.
- **Lite shader.** `const bool LITE` compiles out the heat shimmer, plume/ash, cave lights, gem
  sparkle and ice refraction. The castle and cave rock still draw. Phones use lite by default (by
  user agent or `userAgentData.mobile`), and a full shader that fails to compile retries as lite.
- **Later tree compile.** The tree variant compiles 1.5 s after the first picture (`painter.warm()`),
  not before it.

**Parameters:**

| Parameter | Effect |
|---|---|
| `?gl=full` | Force the full shader |
| `?gl=lite` | Force the lite shader |
| `?gl=main` | Trace on the page thread |
| `?gl=cpu` | CPU picture only |
| `?debug=1` | Show mode, GPU, caps, compile and build time, and the full shader's compile log on the page (selectable text) |

**Reproducing.** `node tools/gpu-limits.mjs <root> "<query>" <scenario> <waitMs> [out.png]` runs
headless Chrome with a phone user agent and patches WebGL in the page and in the worker. The
scenarios:

- `slow`: each compile takes 15 s.
- `units8`: 8 texture units.
- `bigfail`: the full shader fails to compile.

## Full effects in the background (Batch 27, second pass)

Every device now boots on the **lite** trace shader (quick to compile) and then builds the
**full-effects** shader (heat shimmer, smoke/ash and cinders, cave lights, gem sparkle, ice
refraction) in the background, swapping it in the moment it links — no reload, no curtain.

- `startProgram()` in `src/render/gpu.js` builds a program without waiting on it. With
  `KHR_parallel_shader_compile` the driver compiles on its own threads and `poll()` only reads
  `COMPLETION_STATUS_KHR`, so frames keep drawing on the lite program. Without the extension the
  compile happens on the first poll, after the first picture (in the picture thread, so the page
  and input stay live; the picture itself pauses for the compile time once).
- `painter.upgrade()` starts the full build; `painter.tick()` (every paint, plus a timer in the
  picture thread) polls it, swaps the program and rebinds its samplers. The points program reuses the
  compiled full fragment shader, and the crowd (tree) variant is rebuilt from the full shader the
  same way after the swap.
- If the full build fails, the picture stays lite and a small corner note says so; `?debug=1`
  shows the compile log.
- A small corner note says `full effects loading…`, then `full effects on (N s in the background)`;
  `?debug=1` shows the same in the panel.
- `?gl=full`: full shader from the start (old behaviour). `?gl=lite`: stay lite.
- `tools/gpu-limits.mjs` scenarios: `parallel` (fake parallel compile that finishes 20 s after
  link), `slowfull` (a 20 s blocking full compile), `bigfail` (full compile fails).

## Boot guard and stale pages (Batch 28)

- `tools/view/index.html` runs a classic inline guard before the game module. It catches window
  errors (capture phase, so a script that fails to load counts too) and unhandled rejections, and
  writes the real text on the curtain (and `#glerr`, with the build and user agent). If the game
  code has not started after 30 s it says so. `<script nomodule>` names a browser too old for modules.
- **Stale HTML.** GitHub Pages serves the HTML with `max-age=600`, so for up to 10 minutes after a
  deploy a browser can keep the old page and therefore the old `?v=` modules. The guard fetches
  `tools/view/build.txt` with `no-store`. If that number differs from the page's `BUILD`, it moves
  once to the same URL plus `&build=<n>`, a new URL the cache does not hold. `build.txt`, `BUILD` and
  `main.js?v=` must agree (test/boot-guard.test.js). Bump all three together.
- No module workers (older browsers) or no OffscreenCanvas: the trace runs on the page thread
  (`mode main (why)` in `?debug=1`). A thread that fails to load falls back to the CPU picture.
- Content fetches retry a CDN 5xx (GitHub Pages answered 503 for `atoll.json` once in testing) rather
  than parsing its error page.
- `tools/gpu-limits.mjs` takes a live URL as root. New scenarios: `nowebgl2`, `nooffscreen`,
  `noworkermodule`, `badworker`, `badmodule`.

## Mali-G715: the trace shader does not compile (Batch 29)

Blake's phone (ANGLE on ARM Mali-G715, OpenGL ES 3.2; caps units 32, tex 8192, fvec 1024, highp 23,
no KHR_parallel_shader_compile) fails the **lite** fragment compile with an **empty info log**.
It fails the same way in the picture thread and on the page thread (`?gl=main`), so neither the
worker nor OffscreenCanvas is the cause. glslang (16.6, strict ES 3.00) accepts lite, core and bare,
so the GLSL is valid. An empty log from ANGLE means the GPU driver's own compile failed
(a size, register or time limit) or the context was lost. The new panel lines tell those apart.

- **Diagnostics.** Each failed compile reports its stage (vertex or fragment), tier, source length,
  time, whether the context was lost, `gl.getError()`, a null status, and the log. When every tier
  fails, a three-line probe shader says whether the compiler works at all. All of this goes in
  `?debug=1` under `tries:`.
- **Tier ladder.** full, then lite, then **core**, then **bare**, built from the lite source
  (`coreShader()` in gpu.js).
  - core: stubs the volcano air, heat, fog banks, caves, castle ice and land shadows, keeps 1
    reflection (not 4), marches 120 steps (not 280), and drops functions nothing calls. About 56k
    characters (lite is about 73k).
  - bare: as core, plus no pines, shapes, land detail, prints, textures or clouds, no reflection and
    a 64-step march. About 38k characters.
  - A lost context stops the ladder. The picture thread prevents the default on the loss, waits up
    to 10 s for `webglcontextrestored`, then retries on core.
  - The full-effects upgrade only runs from lite.
- `?gl=core` and `?gl=bare` pick a tier directly (no upgrade).
- **CPU picture.** It was 0 fps: whenever the core workers were busy, the page thread *also* traced
  the frame itself. It now skips that frame, and the canvas is capped at 160×96 traced pixels
  (`?cpupx=` changes it). It ran at about 10–50 fps headless.
- **Black CPU picture with `?gl=main`.** A canvas that has given out a WebGL context never gives a
  2D one. The CPU picture now always gets a fresh canvas (`swapCanvas`).
- When the picture thread fails for a reason that is not the shader, the page tries tracing on the
  page thread before using the CPU picture.
- `tools/gpu-limits.mjs` scenarios: `malicore`, `malibare`, `maliall` (fragment shaders over a size
  fail with an empty log), and `lostcompile` (a big compile loses the context, which comes back 1 s later).

## Batch 30: the effects as passes (Mali)

On Blake's Mali-G715, core built (about 3 s) and lite failed after 12.5 s with an empty log. The
limit is how complex one program is, not its length: in SwiftShader, `volcSurface` inside the trace
added about 5.8 s of compile time, `withFog` 2.8 s and `caveShade` 1.6 s, and the bounce count barely
mattered. So the heavy shading leaves the trace and runs as small post passes.

- **Minified sources.** Every tier goes through `minifyGlsl` (no comments, indentation or blank
  lines). The line structure is kept, so error line numbers still point at real lines. Lite and full
  go from about 73k to 59.5k characters.
- **Geo trace (boot tier below lite).** Core, but it keeps the cave and castle geometry
  (`GEO_STUBS`). With `uRaw` set, it writes linear color + depth to an RGBA16F target and a G-buffer
  to an RGBA32F target: first hit t, surface kind (+0.5 when n.z < 0), n.x, n.y.
- **Passes** (`SPLIT_PASSES`, `passShader()`). Each pass is the full trace source with main()
  replaced, the functions it doesn't reach dropped, and the result minified. Each one reads the
  previous color and the G-buffer at its own pixel and keeps the trace's foveated discard. The last
  pass writes the accumulation target, so history blending and present are unchanged.

| program | chars (minified) | SwiftShader draw-time compile |
|---|---|---|
| geo trace (boot) | 46.3k | ~6.2 s |
| core trace | 45.1k | ~7.9 s |
| lite trace | 59.5k | ~9.7 s |
| lava: magma flows | 10.7k | 0.12 s |
| under: cave lights, gems, ice | 30.7k | 1.0 s |
| air: fog, smoke and ash | 15.3k | 0.15 s |
| shimmer: heat shimmer | 9.9k | 0.1 s |

- **Background build.** On a tier below lite, `upgrade()` builds the passes one at a time with a
  400 ms rest between them. Each pass switches on as it links, and the corner note reads
  "effects k/5 on · building …" until it reaches "full effects on (5/5 passes)". A failed pass is
  skipped ("some passes failed"), and the picture keeps the rest. The geo trace counts as the first
  effect (caves and castle). The split needs EXT_color_buffer_float and 18 or more texture units;
  `?debug=1` shows `split passes:` and the reason when it can't run.
- **Remembered tier.** The page keeps `{gpu, tier}` in localStorage (`meridian.gpuTier`), so the
  next boot on the same GPU skips the tiers that failed (on the Mali: no 12 s lite attempt). Any
  `?gl=` ignores it, and booting on lite or full clears it.
- **The crowd variant** (the sphere tree) is built only when a scene has more than `GPU_TREE_AT`
  spheres on tiers below lite.
- `?gl=split` forces this path on any GPU. `tools/gpu-limits.mjs malisplit` rejects fragment
  shaders over 50k characters and busy-waits 1 ms per 15 characters in each compile.
- The ladder is now full → lite → geo → core → bare.
- Known gap: if lite builds but the whole full trace then fails, the picture stays lite. The split
  only starts from the geo tier and below.
