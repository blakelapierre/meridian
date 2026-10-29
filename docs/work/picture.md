# Picture

## In the build

The focused view aims at vsync. A hidden tab paints about once a second. Extra frames run ahead of the primary until the primary misses, then they yield. Resolution steps down to hold 30 fps and steps back up when the frame is cheap.

## This pass

A still view that is missing vsync says `recover` and does not claim `native`. Holding the frame, and arriving at the window's pixels, still says `native`.

## Proves

`test/pace.test.js`.

## Later

A sharper center than the periphery. The soldier view must still refuse to miss vsync for a screenshot.
