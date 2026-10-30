# Combat

From the concept. Physics is the combat language. Grains of sand are not simulated.

## In the build

The line is a hitscan against the dummy when it connects. A miss becomes a bolt. The bolt drops under gravity and can still hit the dummy. There is no vehicle.

## This pass

T plants a mission marker. A bolt in the air is pulled toward it. Nobody else fires.

## Proves

`test/concept.test.js`.

## Next

Another person in the cell cannot add fire to the marker. Not in this build.

## Later

Wind, penetration layers, component damage, fire missions.
