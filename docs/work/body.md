# Body

## In the build

Third person sits behind the body and seeks its pose. It does not snap. An active target pulls the seek point out so the body and the target both stay in view. First person is the last part of the wheel, then optics.

Walk, strafe, sprint, auto-run, jump, and crouch are live. Sprint speed grows with the run skill. Jump height grows while Space is held, up to the jump skill.

Integrity starts at 100. Standing on the live dummy clubs it down. Eight seconds later the body recalls to the bound hearth, or to the beach spawn if it never bound. The bruise is integrity 40, blood 50, pain 40, legs 70.

## This pass

B uses a stick, if you have one and a leg is hurt, and does not spend fiber. You wake with one stick. Fiber still bandages when a stick is not used.

## Proves

`test/hearth.test.js` covers the bruise and the down timer. `test/body.test.js` covers the limp factor.

## Next

A splint does not lower pain. The next cycle can take 5 pain with the stick.

## Later

Left and right legs. A leg under 50 limps; both under 50 are slower and cannot sprint. Blood loss, bandage, and splint. Fall damage from the seeded counter.
