# Physics

From the concept. Tiered on purpose. The character is a body, not a ragdoll, and not a merge-on-contact mass.

## In the build

The beach body is a capsule with weight, a stop window, jump, and crouch. Weight is the pairwise pull of a pinned planet mass, not a second formula written into the controls. Thrown stones are masses in that same step. They fall, bump, and rest. Two bodies cannot occupy the same ground. They stop. They do not merge and they do not ragdoll.

Wind comes from where you are standing, not from one constant. Night still multiplies it. The wind sample for the cell you stand in is stored. A body that is already moving leans into that push. The lean is on the third-person mesh only. The camera is not leaned. A still body stays upright, so a settled camera can stay settled. The line still shows `wind push`.

## This pass

An open sail multiplies the wind on a body that is already moving. A still body is left alone. 2 on open ground, with fiber, raises the sail.

## Proves

`test/slice.test.js` covers the extra push.

## Next

A lean the first-person view can show. Not in this build.

## Later

The lean is still only on the third-person mesh.
