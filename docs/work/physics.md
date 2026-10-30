# Physics

From the concept. Tiered on purpose. The character is a body, not a ragdoll, and not a merge-on-contact mass.

## In the build

The beach body is a capsule with weight, a stop window, jump, and crouch. Gravity is the radial vector from the shell note. Two bodies cannot occupy the same ground. They stop. They do not merge and they do not ragdoll.

## This pass

Wind comes from where you are standing, not from one constant. Night still multiplies it.

## Proves

`test/concept.test.js`.

## Next

Wind is a function of where you stand. It is not stored on the cells.

## Later

Debris, blast impulse, buoyancy, a climate grid that is not the picture's sun.
