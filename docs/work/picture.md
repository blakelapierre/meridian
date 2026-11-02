# Picture

## In the build

The focused view aims at vsync. It starts coarse and steps one octave toward the window while the frame holds. A miss steps back down. A still view can fill the rest of that octave with scattered rays. Extra frames stay near one picture a second until the primary is at the top octave and the frame is cheap. Then they speed up. If the primary drops an octave or misses, they slow down again, and they do not go below one picture a second. A hidden tab paints about once a second. The mirror follows the material. Desert sand keeps only a faint sheen. The sea is still the reflective surface. A wander client (`?bot=`) draws stand-in spheres instead of the full figures, and the bit reads the crust without rebuilding the picture. A person still sees the models.

## This pass

The edge drops the second bounce. Past the middle of the fovea fade, a mirror hit takes the sky tint instead of tracing on, so the periphery pays for at most one reflection. A full trace (still refinement) keeps every bounce. While the view moves, resolution holds at the still level and only drops when the frame rate would fall under `?minfps=` (default 12).

## Proves

`test/pace.test.js`, `test/batch11.test.js` (motion resolution), `test/batch12.test.js` (edge bounce).

## This pass (circle)

The sharp area is now a circle on the screen: the gaze-to-pixel offset on the image plane, aspect corrected, read as an angle. It matches the old angle at the gaze and no longer stretches toward the screen edges.

## Next

A circle that follows a tap: the gaze follows the body's look (`gazeFor`), but a tap on the phone does not move the focus. Not in this build.

## Later

A sharper center than the periphery. The soldier view must still refuse to miss vsync for a screenshot.
