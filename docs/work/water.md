# Water

From the concept. The crust is the only map. Water is part of the crust.

## In the build

The sea is still the edge of the beach. A dug pit whose floor is below −0.2 m holds a pool. The pool sits in that hole. It does not run downhill on its own.

Z on a road opens a gate. Water steps through an open gate and is dammed by a shut one. Opening a gate lowers the first pool, spills it into the next cell, and marks that cell filled.

## This pass

Rain comes from the cloud over the pool. A pool is marked when the cloud deck straight above it (`src/sim/cloud.js`, the deck the sky draws) is thick, at least 0.35 shade. The quarter-minute clock is only the fallback when no deck is asked for. Rain still does not make a new pool.

## Proves

`test/slice.test.js` covers the clock mark. `test/batch12.test.js` covers rain from the deck.

## Next

A river that is the crust, not a list of pools. Not in this build.

## Later

Rain does not fall on dry sand.
