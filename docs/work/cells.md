# Cells

From the concept. The globe is tiled. Your machine simulates the bubble around your body.

## In the build

The beach is two cells split at y = −40 m. South of that line is `atoll-0`. North of it is `atoll-1`. A certified dig is stamped with the cell you were standing in. A dig from the other cell is not applied to the crust you are standing on. Poses still cross the line.

## This pass

A hit waits for a quorum of your cell. Everyone in the cell counts as a yes, so the shot still lands. The other cell does not vote.

## Proves

`test/concept.test.js`.

## Next

The other cell cannot vote no. A quorum of your own cell still passes.

## Later

Quorum hits, rotating authority, sensor interest, dormant logs on a lighthouse that still cannot decide a fight.
