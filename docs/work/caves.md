# Ice castle and caves (Batch 26)

Three places the heightfield alone can't hold. All of them are baked from the world seed and the
ground (`src/sim/under.js`), so every peer gets the same rock, ice and air without sending any of it.
The terrain heightfield is unchanged, so spawn heights and crust chunk hashes are unchanged too.

- **Ice castle** on the mountain's summit: a curtain wall with battlements, four corner towers and a
  keep, all with conical spires; a gate in the north wall; an ice ramp below the gate; a packed-snow
  courtyard; and snow banked around it.
- **Lava tubes** in the volcano: the mouth is on the south flank, in the widest gap between the three
  lava flows, so no lava crosses the way in. A winding tube runs into a magma chamber under the cone,
  with a side gallery off it. Three magma pools light it, the basalt glows along hot cracks, and the
  air above the pools shimmers.
- **Gem caverns** in the east, at (150, −100): away from spawn, the volcano and the mountain. A
  sinkhole ramp leads down into a hall, then out to an east room, a south room and a dead-end branch.
  The rooms have stalactites, stalagmites and columns where the two meet. Amethyst, emerald, ruby and
  sapphire clusters sparkle and give off soft colored light.

## The volume: 2.5D caves and an analytic castle

The caves are stored per 2D cell (0.5 m in the lava tubes, 0.25 m in the gem caverns):

- a floor height F and a ceiling height C (absolute);
- a material (0 rock, 1–4 gems, 5 magma);
- heat (in the lava tubes) or wetness (in the gem caverns).

Air is where F < z < C. Everything else under the ground is rock. This keeps each cave to one baked
grid that the picture samples like the land, with no 3D texture. Stalactites are dips in C,
stalagmites are bumps in F, and a column is both, joined into solid rock in the middle. A cave is open
to the sky (an entrance) only where C rises above the ground. Away from each mouth, `finish` caps the
ceiling 1 m under the ground so the rooms keep a roof.

Rock cells next to air store F = C at the mean height of the air beside them (`seal`). Bilinear reads
then pinch a wall shut at mid-height, instead of blending with a far-off default and leaving ledges.

The castle is a handful of signed-distance shapes (boxes, cylinders, cones). `castleSDF` in JS and in
the shader (`src/render/caves.js`) are the same rule. `castleAir` clears the ground out of the
courtyard and the gate passage. The ramp only adds ice: where the hill rises over it, you walk on
snow.

**One solidity rule**, `solidAt(world, ground, x, y, z)`:

- castle ice is solid wherever it is;
- castle air is never solid;
- otherwise the ground is solid under the heightfield, except in cave air.

Walk, collision and the picture all follow it.

## Walking

`standAt(x, y, z)` (in `life.js`) returns the floor under feet at z: the first solid below a probe
just over the feet, with step-ups up to 2 m. This puts you on a cave floor or the courtyard instead of
the hill over your head. Outside the castle and cave boxes it is `standHeight`, so the open island
walks exactly as before.

After each step, `blockedAt` samples the body at 0.55, 1.15 and 1.7 m. A step into rock or ice slides
along one axis, or stops. Under a cave roof (`inCave`) the camera is forced to first person, so the
chase camera never sits in the rock. Camera lifts use the feet height too.

The tests walk each entrance route, plus the castle route from below the ramp into the courtyard, in
20 cm steps:

| Route | Largest step up | Steps that hit rock |
|---|---|---|
| Lava tubes | 0.12 m | 0 |
| Gem caverns | 0.01 m | 0 |
| Castle | 0.15 m | 0 |

## The picture

**One atlas, no new sampler.** The trace already uses 16 samplers, the WebGL2 minimum. The volcano
texture on unit 11 became an atlas, 736×320 RGBA16F: the volcano tile (320²), the lava tile (128²)
and the gem tile (288²). Each tile is sampled with a clamped texel coordinate. Materials use
`texelFetch`, so ids never blend. The magma edge uses the filtered id so pools have round edges.

**March.** `sandPlane` finds where the ray crosses the castle and cave boxes. Inside them it steps
with `marchDist` (ground, unless in castle or cave air, unioned with the castle SDF), sphere-traced
and capped at 0.42 m, with 150 more steps of budget. Between the boxes it keeps its usual stride, but
lands exactly on each box's entry. Bisection uses the same distance. A hit is then classed as
ground, cave rock, castle ice, spire ice or snow. Only ground hits snap to `duneHeight`. Special hits
take a gradient normal.

**Cave light.** `caveShade` builds the light from:

- an ambient floor;
- a soft lamp at the eye;
- the gem and magma lights (baked into the shader as constants, with 1/(1+d²/r²) falloff);
- daylight that fades over the first meters of rock overhead near a mouth.

The materials:

- **Magma:** moving emissive plates, like the lava.
- **Lava-tube walls:** hot cracks where the baked heat is high.
- **Gems:** colored and emissive, with hashed facets that glint toward the eye and twinkle.
- **Gem-cavern limestone:** banded, and darker and glossier where it is wet.

The lava tubes' heat feeds the existing heat-shimmer field. Ash and cinders stay outside when you are
in a cave.

**Ice.** `iceShade` does three things:

- reflects the sky with Fresnel weight;
- refracts at n = 1.31 and marches the castle SDF to the far face for the thickness, then absorbs
  blue-white (red goes first);
- adds a soft subsurface glow, frost on upward faces, and rime streaks down the walls.

The castle casts shadows on the mountain (`landShadow`).

## Toggles and looks

- `?caves=0` turns off the heavy effects: the light loop, sparkle and ice refraction. Bots default
  to off. The geometry stays, since everyone walks in it.
- `?look=castle` stands below the ramp facing the gate.
- `?look=lavacave` stands in the magma chamber facing a pool.
- `?look=gemcave` stands in the gem hall facing a cluster.

The cave looks spawn at the cave floor height.

## Limits

- The caves are 2.5D: no cave passes over another, and walls are vertical-ish between floor and
  ceiling. A natural arch or a spiral is not possible in this form.
- Bounce rays (reflections) still march the plain dunes, so a mirror won't show the castle or the
  cave.
- In the gem caverns, the walls look smeared vertically where F and C change fast across one cell.
