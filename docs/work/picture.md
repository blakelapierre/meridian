# Picture

## In the build

The focused view aims at vsync. A hidden tab paints about once a second. Extra frames run ahead of the primary until the primary misses, then they yield. Resolution steps down to hold 30 fps and steps back up when the frame is cheap.

## This pass

Holding still, without walking or turning, lets the buffer ease up to the window's own pixels, including device pixels up to twice the CSS size. Moving eases it back to the play cap, 960×540. When the still buffer has arrived, the pace word is `native`. Otherwise a still view says `still`.

## Proves

`test/pace.test.js`.

## Later

A sharper center than the periphery. The soldier view must still refuse to miss vsync for a screenshot.
