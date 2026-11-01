# Combat

From the concept. Physics is the combat language. Grains of sand are not simulated.

## In the build

The line is a hitscan against the dummy when it connects. A miss becomes a bolt. The bolt drops under gravity and can still hit the dummy. There is no vehicle.

T plants a mission marker. A bolt in the air is pulled toward it. A pull also shifts a miss off the aim line. Nobody else fires. Another person standing in a fire marker's cell adds their name to it.

## This pass

A pull changes which way a miss leaves the line. No pull leaves the line as aimed.

## Proves

`test/slice.test.js` covers the side component.

## Next

Melee. Not in this build.

## Later

Wrecks that are not the dummy. Artillery.
