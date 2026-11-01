# Physics

From the concept. Tiered on purpose. The character is a body, not a ragdoll, and not a merge-on-contact mass.

## In the build

The beach body is a capsule with weight, a stop window, jump, and crouch. Gravity is the radial vector from the shell note. Two bodies cannot occupy the same ground. They stop. They do not merge and they do not ragdoll.

Wind comes from where you are standing, not from one constant. Night still multiplies it. The wind sample for the cell you stand in is stored. A body that is already moving leans into that push. The lean is on the third-person mesh only. The camera is not leaned. A still body stays upright, so a settled camera can stay settled. The line still shows `wind push`.

## This pass

A moving body leans. The picture camera does not.

## Proves

`test/slice.test.js` covers the lean. The status line still shows the push.

## Next

Wind that fills a sail. Not in this build.

## Later

A lean the first-person view can show.
