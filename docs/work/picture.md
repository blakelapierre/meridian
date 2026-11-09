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
