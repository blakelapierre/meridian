# Body

## In the build

Third person sits behind the body and seeks its pose. It does not snap. An active target pulls the seek point out so the body and the target both stay in view. First person is the last part of the wheel, then optics.

Walk, strafe, sprint, auto-run, jump, and crouch are live. Sprint speed grows with the run skill. Jump height grows while Space is held, up to the jump skill.

Integrity starts at 100. Standing on the live dummy clubs it down. Eight seconds later the body recalls to the bound hearth, or to the beach spawn if it never bound. The bruise is integrity 40, blood 50, pain 40, legs 70.

## This pass

B, while you are not in a strike, spends one fiber. It gives back 15 blood and 8 integrity. You wake with two fiber.

## Proves

`test/hearth.test.js` covers the bruise and the down timer. `test/body.test.js` covers the limp factor.

## Later

Left and right legs. A leg under 50 limps; both under 50 are slower and cannot sprint. Blood loss, bandage, and splint. Fall damage from the seeded counter.
