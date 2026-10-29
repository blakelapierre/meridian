# Combat

From the concept. Physics is the combat language. Grains of sand are not simulated.

## In the build

The line is a hitscan against the dummy when it connects. A miss becomes a bolt. The bolt drops under gravity and can still hit the dummy. There is no vehicle.

## This pass

Bolts take a small wind from the west. A miss still flies and drops.

## Proves

`test/concept.test.js`.

## Later

Wind, penetration layers, component damage, fire missions.
