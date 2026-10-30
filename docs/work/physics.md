# Physics

From the concept. Tiered on purpose. The character is a body, not a ragdoll, and not a merge-on-contact mass.

## In the build

The beach body is a capsule with weight, a stop window, jump, and crouch. Gravity is the radial vector from the shell note. Two bodies cannot occupy the same ground. They stop. They do not merge and they do not ragdoll.

Wind comes from where you are standing, not from one constant. Night still multiplies it. The wind sample for the cell you stand in is stored.

## This pass

Stored wind pushes a body that is already moving. A still body is left alone, so a settled camera can stay settled.

## Proves

`test/slice.test.js` covers the push vector.

## Next

The push is not written on the status line. Not in this build.

## Later

Wind that fills a sail. A body that leans.
