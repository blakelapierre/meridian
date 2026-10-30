# Picture

## In the build

The focused view aims at vsync. A hidden tab paints about once a second. Extra frames run ahead of the primary until the primary misses, then they yield. Resolution steps down to hold 30 fps and steps back up when the frame is cheap.

## This pass

Moving still targets the play resolution. The dim ring on the chart is not a sharper center in the world picture.

## Proves

`test/pace.test.js`.

## Next

The center does not keep a second reflection bounce. The renderer was left alone. Not in this build.

## Later

A sharper center than the periphery. The soldier view must still refuse to miss vsync for a screenshot.
