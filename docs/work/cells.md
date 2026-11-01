# Cells

From the concept. The globe is tiled. Your machine simulates the bubble around your body.

## In the build

The beach is two cells split at y = −40 m. South of that line is `atoll-0`. North of it is `atoll-1`. A certified dig is stamped with the cell you were standing in. A dig from the other cell is not applied to the crust you are standing on. Poses still cross the line.

A hit waits for a quorum of your cell. Everyone in your cell counts as a yes. A stored yes from the other cell is not a vote here. A stored no still counts.

## This pass

A stored yes from the other cell is ignored. One local yes and one stored no is not a pass.

## Proves

`test/slice.test.js` covers the stored tally.

## Next

A vote you can see. Not in this build.

## Later

An archive that is not this browser.
