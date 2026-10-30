# MERIDIAN
## Engine basis

The primary renderer and the primary physics are the ones in [blakelapierre/nbody-raycaster](https://github.com/blakelapierre/nbody-raycaster), commit `37226b0afc58efc0ff93b5c18edd4679835408d4`. That commit is the pin. A newer commit of that repo does not change Meridian until this pin moves.

This file wins over [engineering.md](engineering.md) on what draws the frame and what integrates motion. It does not win on damage numbers, the keymap, the chunk hash, or packet layout.

Nothing in the pinned pen is imported at runtime. The port in `src/engine` is the copy this file describes.

---

## 1. What is taken

### Renderer

A software raycaster into a 2D canvas. No WebGL and no WebGPU on this path.

| Piece | Role |
|---|---|
| `project` | Pixel to a view ray. FOV, aspect, plane distance, then `vRotateTo` / `qFromUnitVectors` so the ray follows `camera.dir` |
| `cast` | Walk the scene, keep the nearest hit, return its color. Misses use the explicit background color, not `Math.random` |
| `paintFrame` | One ray per pixel into an `ImageData`, then `putImageData` |
| `sphereRayIntersection` | Analytic sphere hit. The gameplay trace uses this same function |
| `syncSceneObjects` | After the physics tick, rebuild the drawable list from the sim. The canvas does not own positions |

Default internal resolution is the demo's **160×90**, scaled up to the element. Raise it only after a frame of the Atoll holds. `imageSmoothingEnabled` stays false.

The demo only intersects spheres. Meridian's `cast` keeps that loop and adds two tests in the same style, nearest `t` wins:

1. The integer crust. A raymarch over the samples in [crust.md](crust.md), not a sphere per voxel.
2. Half-open boxes from `content/atoll.json` and placed pieces. Slab test.

Bodies, the dummy, and projectiles stay spheres. A standing character is drawn as a sphere of radius **0.35 m** until a capsule intersection exists. That sphere is the picture. It is not the merge collider.

The trace is drawn into one of three offscreen buffers. Every refresh copies the latest buffers to the canvas and crossfades from the previous picture, so a resolution change does not pop. A sudden move traces at the display refresh. A steady velocity traces near 12 fps. A still camera traces more slowly and grows the picture. The corner shows the canvas rate and `buf` for the trace size. Orbit trails from that pen are not drawn.

### Physics

The integrator in `tick`, the `Mass` record, and `createUniverse`.

Each body has `position`, `velocity`, `acceleration`, `gravity`, `mass`, `size`, `collisionSize`, and `color`. One physics step is:

1. `positionHalfTick` — move by half of `velocity / ticksPerStep`, then zero `gravity`.
2. Pairwise gravity. Acceleration magnitude is `G * m / r^2`, applied along the separation using `r^3 = d * sqrt(d)` where `d` is distance squared. Keep that correction. The old `d` in the denominator was wrong.
3. `velocityTick` — `velocity += (acceleration + gravity) / ticksPerStep`, then the other half position step.
4. Resolve overlaps.

`acceleration` is control. `gravity` is only what the pairwise pass writes. The controller sets `acceleration` every tick. It does not accumulate.

Units in the game scene are **meters, kilograms, seconds**. The demo's `gravityConstant` of `6.67408e-7` and its sun of mass `1000000` stay inside a scene named `demo`, used as a regression of this port. They are not Cairn.

Cairn's gravity is one fixed `Mass` at the planet center:

```text
G = 6.67430e-11
R = 320000
centralMass = 9.81 * R * R / G
```

Surface gravity is then 9.81 m/s² from the pairwise pass. There is no second gravity function. A tangent-frame unit test may inject `gravity = (0, 0, -9.81)` so the stop-window test does not need a 10^22 kg body. Shipping scenes use the central mass.

The demo calls `centerOn` and subtracts a target position from every body. The game scene **MUST NOT**. That recenter exists so a toy sun stays on screen.

The demo `Clock` advances from `Date`. Meridian does not. One sim tick at 30 Hz calls `tick` once with `ticksPerStep = 30`, so the step is 1/30 s. `ticksPerStep = 1` would advance a full second and is not the game frame. If any body is faster than **50 m/s**, that sim tick calls `tick` four times instead. The rule is fixed. It is still ephemeral motion, not a hashed op.

`createRunner`, `inputEvents`, and `eevents` are the pattern for "something happened": an absorbed body, a spawned mass, a changed `G`. Game commits stay on the op log. They may enqueue an `eevent` so the float scene notices. The event must not be the authority for a dig, a claim, or a kill.

## 2. What is not taken

| Demo behavior | Meridian |
|---|---|
| WASD moves the camera in world axes. Q and E yaw. The wheel dollies | Soldier control is [keymap.md](keymap.md). Mouse looks, A and D strafe. The demo flycam is allowed only while the debug overlay is on |
| Overlap merges the smaller body into the larger, mixes color, keeps momentum | Policy on the body. `merge` is the demo and is legal for debris that should coalesce. Characters, projectiles, and structures are `separate` or `event`. A character is pushed out along the contact normal and loses the inward velocity. A projectile emits a hit event and is removed. Nobody is absorbed into the planet |
| `size` derived from uniform-density mass, and that radius is `collisionSize` | Drawn radius and collision radius are separate fields. The planet's drawn surface is the crust, not a sphere of radius `cbrt(M)` |
| `Math.random` sky on a miss | A fixed sky color from the sun elevation |
| Orbit trails drawn over the preview | Not taken. Bodies do not leave a screen-space trail |
| Sliders, pause button, `state-view` text | Not part of the game HUD |

Rapier is still not the physics engine. This one is.

## 3. How it meets the player rules

The stop-from-sprint window in [game.md](game.md) §4.2 is a test of `acceleration` in the tangent plane, with gravity on the up axis handled by the contact constraint. From 6.6 m/s, the opposing control acceleration brings tangential speed under 0.8 m/s in 140–180 ms. Missing the window is still a failed port. Do not "fix" it by skipping the integrator.

Contact with the crust: after the physics step, if the feet are inside solid samples, move the body out along the integer field's up and clear the inward radial part of `velocity`. Jumping is an upward `acceleration` impulse on that tick, the 1.15 m apex measured on flat ground.

Witnessed shots do not trust the picture. They call the same sphere, box, and crust tests `cast` uses, then quantize distance to integer centimeters for the vote. Two peers can disagree about a float pose. They must not disagree about a cert that used the same quantized hit.

The chunk hash does not include `Mass` positions. Float physics stays ephemeral, as the WebRTC spec already requires for debris.

## 4. Where the port lives

```text
src/engine/math.js        the vec3 and quaternion helpers the caster uses
src/engine/physics.js     Mass, tick, createUniverse, collision policies
src/engine/cast.js        project, cast, sphere, box, crust march
src/engine/frame.js       paintFrame
src/engine/demo.js        the sun, three planets, and a moon, unchanged in spirit
src/render/               calls paintFrame. Does not integrate
src/sim/                  calls tick once per sim tick and applies the crust constraint
```

`src/engine` is pure and runs under Node. `paintFrame` is the only piece that needs a canvas, and it accepts an `ImageData`-shaped buffer so the hit tests run without a browser.

First commits, replacing the raster-view step in the engineering order:

1. Port `tick` and the demo scene. A Node test checks that the moon is still bound after the demo's inner-orbit time, and that two calls with the same inputs match.
2. Port `sphereRayIntersection` and `cast` against that scene. A ray through the sun's center hits the sun.
3. Add the box test and the crust march. A ray at the Atoll dummy, 10 m from the pad, hits the dummy sphere.
4. Put the player on a `separate` body and pass the stop-window test through `acceleration`, not through a second controller.

Do not start from a WebGL triangle.
