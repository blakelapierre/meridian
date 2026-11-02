# Body

## In the build

Third person sits behind the body and seeks its pose. It does not snap. The body is a figure: legs, arms, chest, and a head, and the same figure is what other players and the townsfolk wear. An active target pulls the seek point out so the body and the target both stay in view. First person is the last part of the wheel, then optics.

Walk, strafe, sprint, auto-run, jump, and crouch are live. Sprint speed grows with the run skill. Jump height grows while Space is held, up to the jump skill.

Integrity starts at 100. Standing on the live dummy clubs it down. Eight seconds later the body recalls to the bound hearth, or to the beach spawn if it never bound. The bruise is integrity 40, blood 50, pain 40, legs 70.

B uses a stick on a hurt leg and does not spend fiber. The stick lowers pain by 15. The body line shows `land N soak M` once you have landed. The soak is the fall count, capped at 6. Blood can fall. It does not drop the body.

## This pass

A fall reads a soak you can change. Holding crouch as you land tucks: the soak is the fall count plus 2, capped at 8, which is a whole fall. The body line shows `soak M tuck` while crouch is held.

## Proves

`test/batch12.test.js` covers the tuck.

## Next

A roll that keeps the run. A tucked landing still stops you. Not in this build.

## Later

The soak is still only a number on the line.
