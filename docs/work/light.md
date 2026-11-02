# Light

## In the build

The sun is a direction on a 72-minute day. The picture brightens when the sun is above the horizon. A placed fin reports flux from the dot of its up-axis and the sun. Noon is higher than a sun on the horizon.

Using a fin breaks it. A broken fin gives no flux. Four metal repairs a broken fin. Breaking it is still the act when it is whole. Once a minute a whole fin adds metal from its flux, and that metal is its own credit on the line, `fin N`.

## This pass

A cloud cuts the fin. `src/sim/cloud.js` samples the same cloud deck the sky draws (same noise, heights and drift, on tick time) along the sun ray from the fin. The fin loses that share of its flux, and the line says `flux N cloud` while one is over it.

## Proves

`test/slice.test.js` covers the aim by day and the clear aim at night. `test/batch12.test.js` covers the cut.

## Next

A cloud's shadow on the sand. The picture does not darken the ground under a cloud yet. Not in this build.

## Later

Night already pays nothing.
