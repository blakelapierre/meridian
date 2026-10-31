# Body

## In the build

Third person sits behind the body and seeks its pose. It does not snap. An active target pulls the seek point out so the body and the target both stay in view. First person is the last part of the wheel, then optics.

Walk, strafe, sprint, auto-run, jump, and crouch are live. Sprint speed grows with the run skill. Jump height grows while Space is held, up to the jump skill.

Integrity starts at 100. Standing on the live dummy clubs it down. Eight seconds later the body recalls to the bound hearth, or to the beach spawn if it never bound. The bruise is integrity 40, blood 50, pain 40, legs 70.

B uses a stick on a hurt leg and does not spend fiber. The stick lowers pain by 15.

## This pass

A hard landing reads a counter seeded from the jump skill. Each one soaks a little of the fall, then the counter grows by one.

## Proves

`test/slice.test.js` covers the seeded counter.

## Next

The body line shows `land N` once the landing counter is seeded or counted. Not shown: the soak each count buys.

## Later

Left and right legs. Blood loss. A fall that reads the counter you can see.
