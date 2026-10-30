# Picture

## In the build

The focused view aims at vsync. A hidden tab paints about once a second. Extra frames run ahead of the primary until the primary misses, then they yield. Resolution steps down to hold 30 fps and steps back up when the frame is cheap.

## This pass

The center keeps the second reflection bounce. Past the edge the mirror is dropped, so that second trace does not run. The buffer is still one resolution.

## Proves

`test/pace.test.js`.

## Next

Standing still does not sharpen the edge. Not in this build.

## Later

A sharper center than the periphery. The soldier view must still refuse to miss vsync for a screenshot.
