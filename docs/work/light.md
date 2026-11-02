# Light

## In the build

The sun is a direction on a 72-minute day. The picture brightens when the sun is above the horizon. A placed fin reports flux from the dot of its up-axis and the sun. Noon is higher than a sun on the horizon.

Using a fin breaks it. A broken fin gives no flux. Four metal repairs a broken fin. Breaking it is still the act when it is whole. Once a minute a whole fin adds metal from its flux, and that metal is its own credit on the line, `fin N`.

## This pass

A cloud cuts the fin. `src/sim/cloud.js` samples the same cloud deck the sky draws (same noise, heights and drift, on tick time) along the sun ray from the fin. The fin loses that share of its flux, and the line says `flux N cloud` while one is over it. The same cloud darkens the ground under it: direct sun on any lit surface is cut by up to three quarters. Under a thick deck you see rain: the view greys and thin streaks fall, harder as the deck overhead thickens. `?rain=0..1` forces it.

## Proves

`test/slice.test.js` covers the aim by day and the clear aim at night. `test/batch12.test.js` covers the cut.

## This pass (wet ground)

Where the deck overhead rains, upward faces darken by up to 30%, by the same rule as `rainAt`, so wet patches line up with the visible rain and the pools that fill.

## This pass (sheen)

Flat wet ground mixes in the reflected sky, strongest at grazing angles, so wet patches shine toward the horizon.

## This pass (drying)

Ground stays wet after the cloud passes: rain from 30 s ago counts at 65% and from 90 s ago at 30%. The shader reads the past as the rain upwind now, since the deck drifts at a fixed rate (`DECK_DRIFT`); a test checks that shortcut against the deck's own clock.

## This pass (rain sound)

Under a raining deck you hear it: a soft high hiss around you every 1–2.5 s, louder as the rain gets harder, and silent once it stops (`src/audio/ambient.js` kind `rain`).

## This pass (roof)

Under anything solid straight overhead, the near rain streaks and grey stop; the shader asks the same occluder query the sun shadow uses.

## This pass (dry floor)

Ground with anything solid straight above it stays dry: no darkening, no sheen. The roof check runs only where the ground would otherwise be wet.

## This pass (status)

The status line names the weather: "day drizzle" or "day rain" where you stand.

## Next

A roof you hear: rain sound still ignores a roof; it should drum and muffle under one. Not in this build.

## Later

Night already pays nothing.
