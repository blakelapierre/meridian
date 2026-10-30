# Combat

From the concept. Physics is the combat language. Grains of sand are not simulated.

## In the build

The line is a hitscan against the dummy when it connects. A miss becomes a bolt. The bolt drops under gravity and can still hit the dummy. There is no vehicle.

T plants a mission marker. A bolt in the air is pulled toward it. Nobody else fires. Another person standing in a fire marker's cell adds their name to it.

## This pass

A second name on a fire marker pulls a bolt harder. A third name does not pull harder than the second.

## Proves

`test/slice.test.js` covers the pull.

## Next

The pull does not change which way a miss leaves the line. Not in this build.

## Later

Melee. Wrecks that are not the dummy. Artillery.
