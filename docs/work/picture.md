# Picture

## In the build

The focused view aims at vsync. A hidden tab paints about once a second. Extra frames slow down while the primary misses vsync and speed up again while it holds. They do not paint slower than once a second, even if the primary is still missing. Resolution steps down to hold 30 fps and steps back up when the frame is cheap.

## This pass

The mirror follows the material. It is not a circle drawn on the screen. The sand still reflects a little of the sky.

## Proves

`test/pace.test.js`.

## Next

The edge does not drop the second bounce. A screen-space circle is not in this build.

## Later

A sharper center than the periphery. The soldier view must still refuse to miss vsync for a screenshot.
