# Combat

From the concept. Physics is the combat language. Grains of sand are not simulated.

## In the build

The line is a hitscan against the dummy when it connects. A miss becomes a bolt. The bolt drops under gravity and can still hit the dummy. There is no vehicle.

## This pass

A bounce happens once. The next time the bolt meets the ground, it stays there.

## Proves

`test/concept.test.js`.

## Later

Wind, penetration layers, component damage, fire missions.
