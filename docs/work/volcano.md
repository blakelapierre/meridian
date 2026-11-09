# Volcano (Batch 25)

A volcano stands in the southwest of the island: a cone about 38 m high centred near x −155, y −55, 72 m across the radius. It is well away from spawn (about 180 m), the mountain and the lake. The flanks are rugged, with ridges and gullies from a seeded diamond-square field (`src/sim/diamond.js`, the same as the mountain's but with its own seed). A lipped crater holds a glowing lava lake. Three lava channels breach the rim and run down the flanks.

All of it is `src/sim/volcano.js`, a pure function of the world seed, baked once to its own 0.5 m grid (320² over 160 m). The channels are ground offset over the dunes, lava cover, meters along the lava (for the flow animation) and the heat of the ground. The walk reads the grid through `duneHeight`, and the picture reads it as a second half-float texture, so the cone you see is the cone you climb. The voxel crust is untouched, so chunk hashes are unchanged. Spawn, the yard and the north land are bit-for-bit what they were (tested).

## Lava

Each flow starts at the crater's lava lake and walks out through the rim. Below the rim it follows the steepest way down the uncut cone, with a little wander, so it finds the gullies. The surface falls a little at every step. Where the rim is higher than the lava, the flow cuts a notch: a breach with sloping walls. Low levees line the channels. The flows are at least 60 m from any water (the stream, river and lake are in the north; tested).

In the picture, lava is emissive: bright where it is molten, crusting over into dark plates with glowing cracks as it runs and cools. The plates drift down the flow (along the gradient of the meters-along channel), and the crater lake churns slowly. Rock near lava glows orange from the heat channel, so the lava lights its surroundings, most visibly at night.

## Lava bombs

Every 6 seconds of the shared clock is a burst slot. Burst `e` is a pure function of `e` and the world seed: whether it fires (80%), how many rocks (2–7), and each rock's launch time, direction, angle and speed. A rock flies a plain parabola from the crater (g = 9.8) until it meets the ground (fixed 1/32 s steps, so every peer gets the same landing), then lies glowing and cools over 4 s. The picture draws up to 12 at once: dark crusted spheres with glowing seams and a glowing trail behind each one in flight.

The clock is wall time (`Date.now()`), so every peer sees the same eruption to within their clocks' skew, and nothing goes over the network. `?vtime=<seconds>` sets the clock's start (for screenshots) and `?vstill=1` holds it there.

**Bombs do not hurt anyone in this build.** Damage would need peers to agree on where each player stood when each rock landed. Player positions are not authoritative: each peer has its own view of the others, a little behind. The existing hit path is a shot that the peers vote on, and a rock is not anyone's shot to vote on. Keeping bombs as scenery means no peer can see a hit that another peer did not. Lava does not burn you either: you can walk on it.

## Cinders and ash

Cinders and ash hang in a band that leans downwind from the crater (`WIND`, toward the west-southwest, out to sea) and thins with distance and height. The trace draws them from twelve depth layers along the primary ray. Each layer picks one hashed particle per cell of a lattice that drifts downwind and falls. About a quarter are glowing, flickering embers and the rest are grey ash.

## Heat shimmer and the plume

`heatAt` in `src/sim/volcano.js` (`heatField` in the shader) is the air's heat, 0..1:
- over hot ground (the heat channel), fading over 7 m of height;
- plus the crater's plume, a column that widens as it rises and leans downwind.

It is exactly zero away from lava, the crater and the plume (tested at spawn, the mountain and the lake, and on the cool flanks).

The primary ray bends slightly where it crosses hot air: 8 samples along the ray inside the volcano's air box. At each sample, the gradient of a noise that moves upward with time (`z − t`) is weighted by the heat there. The summed bend tilts the ray in screen space, capped at 0.012 rad. Lava, the crater and the plume make what is behind them wobble upward, the way hot convecting air does.

The plume is also smoke: 10 samples through the same column, with rising noise, grey by day and dark at night, lit orange from the lava below.

## Switches

- `?volcano=0` turns the live effects off: bombs, trails, cinders, the plume, shimmer, and the moving lava (which is left as a still, dull crust). The cone stays, because it is ground everyone stands on.
- `?heat=0` turns only the shimmer off.
- Bot clients (`?bot=`) default to both off, so the scale bench and sim-only clients pay nothing.
- `?look=volcano` stands past the end of a lava flow, facing the crater.

## Proves

`test/volcano.test.js` checks:
- the same bake every time, and a different one for another seed;
- placement: inside the island, and away from spawn, the mountain and the lake;
- a crater with a lava lake, and ridged flanks;
- spawn heights and the crust hash unchanged;
- every flow starts at the lava lake, is continuous, falls strictly, is carved to its surface, and stays far from water;
- the eruption schedule identical in a second, independent module instance asked in the opposite order;
- bombs on their parabola, and gone once they have cooled;
- the heat field hot over lava and in the plume, and zero elsewhere;
- ash only downwind;
- the switches parse, bots default off, and the shader's plume and heat rules match the JS.

## Next

Bombs that knock you back or hurt, through the voted hit path, once there is a peer-agreed notion of where a player was at an instant. Lava that you cannot stand in. Flows that change over time.
