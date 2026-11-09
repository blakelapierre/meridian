# Water

From the concept. The crust is the only map. Water is part of the crust.

## In the build

The sea is still the edge of the beach. A dug pit whose floor is below −0.2 m holds a pool. The pool sits in that hole. It does not run downhill on its own.

Z on a road opens a gate. Water steps through an open gate and is dammed by a shut one. Opening a gate lowers the first pool, spills it into the next cell, and marks that cell filled.

## This pass

Rain comes from the cloud over the pool. A pool is marked when the cloud deck straight above it (`src/sim/cloud.js`, the deck the sky draws) is thick, at least 0.35 shade. The quarter-minute clock is only the fallback when no deck is asked for. Rain still does not make a new pool.

## Proves

`test/slice.test.js` covers the clock mark. `test/batch12.test.js` covers rain from the deck.

## The north land (Batch 24)

A mountain stands in the north half of the island (peak near x −40, y 160, about 44–47 m). Its slopes carry fractal ridges and gullies from a diamond-square heightfield (`src/sim/diamond.js`: midpoint displacement on a 513² grid, every offset an integer hash of cell and seed, so it is the same on every peer whatever order it is built in). The same field rolls the north half's ground gently (under ±0.7 m), fading to nothing well before spawn. A spring sits high on the mountain. From it a stream about 1 m wide spirals around the mountain's flank, roughly 260° around the peak, with meander bends along the way. It is carved into the slope, falls a little every step, and widens to about 5 m before it meets a small lake (center x 70, y 96, about 14 m across the radius, 1.6 m deep in the middle, surface 2.2 m). A river 5–8 m wide leaves the lake to the east and meanders (about 1.27 times longer than a straight line) down to the sea past the coast. Pines grow on the slopes, thinning toward the tree line. Reeds with cattail heads and bushes line the banks.

All of it is `src/sim/land.js`, a pure function of the world seed (integer hashing, no `Math.sin` in the mountain), baked once to a 0.5 m grid: ground offset over the dunes, water surface, pine density, bank wetness. The walk reads that grid through `duneHeight` and `standHeight`, and the picture reads it as a texture, so what you see is what you stand on. The voxel crust is not touched, so chunk hashes still cover only dug and filled voxels and match between peers as before. The south half, spawn and the yard are the old dunes.

Water does not drown you: in deep water the feet stay at most 1.25 m under the surface. The surface ripples along its downhill direction, faster and with a little foam on the steep stream, slowly on the lake.

To see it: `?look=mountain` stands across the lake from the mountain, `?look=spring` in the stream looking up the channel toward the spring. `?at=x,y[,yawDeg[,pitchDeg]]` stands anywhere (yaw 0 faces north, +y). `?sky=<m>` lifts the eye to that height above the feet (a drone view; for example `?at=40,140,0,-89&sky=330` looks straight down on the whole north half).

## Proves

`test/land.test.js`: the same bake every time and a different one for another seed, the crust hash unchanged, diamond-square reproducible from the seed, tiling, and rougher with higher roughness, the mountain ridged all the way round, the stream continuous and strictly falling from the spring into the lake, sweeping at least 180° around the peak with at least six meander bends, the river strictly falling and sinuous, the lake's size and depth, the river falling from the lake to sea level past the coast, pines by altitude and none in water or at spawn, reeds and bushes on the banks, the fog switch, and the shader's pine rule and hash matching the walk's.

## Next

A river that is the crust, not a list of pools: the stream is a baked surface, not water that flows into a dug channel. Pines are drawn, not solid: you walk through them, and up close they are stepped cones (a heightfield). Not in this build.

## Later

Rain does not fall on dry sand.
