# Physics

From the concept. Tiered on purpose. The character is a body, not a ragdoll, and not a merge-on-contact mass.

## In the build

The beach body is a capsule with weight, a stop window, jump, and crouch. The integrator is the N-body step from the raycaster, with gravity as a flat acceleration. Debris, vehicles, buoyancy, wind, and blast are not running. Two people do not push each other.

## Not in this build

| Always on, near you | Coarse, everywhere | Not simulated |
|---|---|---|
| Rigid debris, vehicles, buoyancy probes | Wind, temperature, humidity | Soil grains, astrophysics, per-vertex structural analysis |
| Analytical ballistics and penetration | Water on the crust grid | Every bullet as a rigid body |
| Collapse from loads and blast | Dayline flux | Soft-body flesh |
| Capsule with weight, slopes, and push | Distant armies as aggregates | |

Slopes and explosions should move you. Peeking and stopping stay fair. Merge-on-contact, which the toy solar system uses when two masses overlap, is not how people collide.

## Next when this opens

Two bodies that cannot occupy the same ground. They stop. They do not merge and they do not ragdoll.

## Later

Debris, blast impulse, buoyancy, a climate grid that is not the picture's sun.
