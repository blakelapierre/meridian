# Picture

## In the build

The focused view aims at vsync. A hidden tab paints about once a second. Extra frames run ahead of the primary until the primary misses, then they yield. Resolution steps down to hold 30 fps and steps back up when the frame is cheap.

## This pass

The center of the picture keeps the second reflection bounce. The edge drops it. The buffer is still one resolution.

## Proves

`test/pace.test.js`.

## Next

The edge always drops the second bounce, even when the picture is still.

## Later

A sharper center than the periphery. The soldier view must still refuse to miss vsync for a screenshot.
