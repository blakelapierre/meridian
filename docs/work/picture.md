# Picture

## In the build

The focused view aims at vsync. A hidden tab paints about once a second. Extra frames run ahead of the primary until the primary misses, then they yield. Resolution steps down to hold 30 fps and steps back up when the frame is cheap.

## This pass

While you are moving, the target is the play resolution, never the native one. The amber counter on `recover` is unchanged. There is still no sharper center.

## Proves

`test/pace.test.js`.

## Later

A sharper center than the periphery. The soldier view must still refuse to miss vsync for a screenshot.
