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
