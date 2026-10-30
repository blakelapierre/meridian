# Cells

From the concept. The globe is tiled. Your machine simulates the bubble around your body.

## In the build

The beach is two cells split at y = −40 m. South of that line is `atoll-0`. North of it is `atoll-1`. A certified dig is stamped with the cell you were standing in. A dig from the other cell is not applied to the crust you are standing on. Poses still cross the line.

A hit waits for a quorum of your cell. Everyone in your cell counts as a yes. The other cell can store a no, and that no is not a yes.

## This pass

A stored no from the other cell is counted in the quorum. One local yes and one outside no is not a pass.

## Proves

`test/slice.test.js` covers the tally.

## Next

A stored yes from the other cell is not counted. Not in this build.

## Later

A vote you can see. An archive that is not this browser.
