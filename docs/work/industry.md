# Industry

From the concept. Two stocks. They do not teleport.

## In the build

Metal pays for walls, the hearth, and the fin. Spoil is a crate you can see. When the dummy is down, its wreck can be salvaged for 12 metal. It is not a vein and it is not a fabber.

## This pass

V places a cart on a road and loads one metal. The cart rolls along the road and puts the metal down at the end.

## Proves

The salvage path in `src/sim/build.js`. A pure test is not required for the metal number beyond the crate rules already in `test/build.test.js`.

## Next

A cart that reaches a gap puts the metal back at once. It does not wait.

## Later

Veins, the logistics graph, convoys, fabbers.
