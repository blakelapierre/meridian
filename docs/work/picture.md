# Picture

## In the build

The focused view aims at vsync. It starts coarse and steps one octave toward the window while the frame holds. A miss steps back down. A still view can fill the rest of that octave with scattered rays. Extra frames stay near one picture a second until the primary is at the top octave and the frame is cheap. Then they speed up. If the primary drops an octave or misses, they slow down again, and they do not go below one picture a second. A hidden tab paints about once a second.

## This pass

The mirror follows the material. Desert sand keeps only a faint sheen, about a fiftieth of a mirror. The sea is still the reflective surface.

## Proves

`test/pace.test.js`.

## Next

The edge does not drop the second bounce. A screen-space circle is not in this build.

## Later

A sharper center than the periphery. The soldier view must still refuse to miss vsync for a screenshot.
