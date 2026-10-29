# MERIDIAN
## Engineering locks (pre-implementation)

Decisions that have to be true before the first client commit. Player rules stay in [game.md](game.md). Packets stay in [implementation-webrtc.md](implementation-webrtc.md). The island numbers are [content/atoll.json](../content/atoll.json). The dig brush is [crust.md](crust.md). Keys are [keymap.md](keymap.md). The renderer and the motion integrator are [engine.md](engine.md).

Nothing in this repository is implemented.

On conflict about **how the slice is built**, this document wins, except that [engine.md](engine.md) wins on what draws the frame and what integrates motion. Neither overrides a damage number or a packet field.

---

## 1. What the first client is allowed to be

The picture is the software raycaster pinned in [engine.md](engine.md). The motion is that repo's N-body `tick`. Not a WebGL rasterizer, and not a second physics engine beside it.

Still forbidden:

- WebGL or WebGPU as the primary path
- Rapier or any other rigid-body library
- A cube-sphere mesh, virtual texturing, impostor crowds
- Path tracing, reflections, ReSTIR

Primary rays are the point of this caster. One sun-shadow ray is allowed. Both go through `cast`.

Feet and voxels stay integers, per [crust.md](crust.md). Body positions inside the integrator are meters, floating point, and ephemeral.

SharedArrayBuffer is optional. If a worker needs it, the dev server sends `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` from that commit onward. Do not block the first pawn on isolation headers.

## 2. Physics

See [engine.md](engine.md). Short form: a `Mass` integrates with the leapfrog in `tick`. Control writes `acceleration`. The planet writes `gravity` through the pairwise pass. The 140–180 ms stop window is still the test. Merge-on-overlap is the demo policy, not the character policy.

A collapsed wall is an op that removes the piece. Debris, if it exists, is a `Mass` with `merge` or `separate`. It is not Rapier.

## 3. Where code will go

Do not invent a second layout when implementation starts.

```text
src/engine/       port of the pinned raycaster and N-body tick. Pure. No DOM except frame.js's buffer.
src/sim/        game tick. Calls engine tick. No DOM, no WebRTC. Importable from Node.
src/content/    JSON catalogs. Atoll already lives in /content until it moves here unchanged.
src/net/        browser only. RTCPeerConnection and the codec.
src/render/     calls paintFrame. Does not integrate and does not decide hits.
src/app/        wires them. The only place that touches the canvas element and the socket.
tools/signal/   local signaling lighthouse. Not imported by src/sim.
```

`src/sim` **MUST** be testable with `node --test` and no browser. If a sim file imports `rtc` or `document`, the layout is wrong.

## 4. Dev harness

Two kinds of test, and they do not share a process.

**Pure sim.** No sockets. Required before any canvas:

| Test | Pass |
|---|---|
| Sprint, opposite strafe | Horizontal speed under 0.8 m/s in 140–180 ms |
| Line damage | Unarmored head 112, helm head 67, three chest hits leave 16 |
| Brush | Same eye, aim, mode, budget → same voxel list. Defined in crust.md |
| Hash | Applying one `TerrainEdit` twice, in two processes, yields the same BLAKE3 |
| Support | A wall on the ruin footing is grounded. A wall with no footing is not |
| Atoll load | Spawn is outside the strike volume. Dummy is 1000 cm from the pad. South door path is 9000 cm |
| Catalog identity | A change to `content/atoll.json` changes the catalog hash |

**Two browsers.** Only after a local pawn exists.

- A local process listens for WebSocket connections and speaks [implementation-webrtc.md](implementation-webrtc.md) §5.5 only: `announce`, `list`, `signal`.
- It stores presence for 15 seconds. It forwards `blob` opaquely, refuses anything over 64 KB, and does not parse SDP.
- It **MUST NOT** be linked into match results, inventories, or votes.
- Killing it after the peer connection is up is the P7 test. Do not "temporarily" send a position through it.

Dev mode may also use a pasted offer, as the WebRTC spec allows. The default local loop is the process above, so two browsers can be started without a paste.

Feature flag **`localEdits`**: a hole may exist in one process only, and only when this flag is on. The default is off. A build that shows a hole with the flag off and no cert is wrong. A certified op in [src/sim/oplog.js](../src/sim/oplog.js) may apply with the flag off. The walk view does not append that log. [tools/dig](../tools/dig/index.html) does, between two browsers.

## 5. Frame used by content

`content/atoll.json` is **tangent centimeters**, x east, y north, z up. The origin is the cell anchor on the surface. This is not the ECEF triple on the wire.

The net layer converts at the boundary. Sim tests of Atoll run in the tangent frame and never construct a planet matrix. P8 replaces the cell id `atoll-0` with the hex index. The JSON field `frame` is `tangent-cm-z-up` until that happens.

Entity position is the **capsule feet**. Boxes in content are **half-open**: a point is inside when `min <= p < max` on every axis, so shared faces are not double walls.

## 6. Sun

`tick →` sun direction is a pure function, 72 real minutes per cairn-day, dawn and dusk 6 minutes. A debug multiplier may speed it and **MUST** default to 1. The raycaster may spend one extra ray at that direction to darken a hit. The fin's flux number still comes from the dot product, not from the picture.

## 7. License

[MIT](../LICENSE). Copyright Blake La Pierre. Docs and future code ship under it. A different license is a repo change, not a file header someone adds beside it.

## 8. Order of the first commits

1. Port `tick` and the demo scene from the pinned repo. No window.
2. Port `cast`. A ray through the demo sun hits the sun.
3. Damage-number test.
4. Crust brush, chunk hash, and a crust raymarch that sees a dug voxel.
5. Load `content/atoll.json` and check the three distances. A ray from the pad hits the dummy.
6. Player `Mass` with `separate`, and the stop-window test.
7. `tools/signal` and one unreliable position between two browsers.

Not before step 7: the buy menu, the hearth, a GPU backend, a second island.

## 9. Keys

[keymap.md](keymap.md). Hands are FPS: A and D strafe. They do not turn the body. Look is the mouse. A later chase-cam vehicle, if one exists, turns left on A. The war table is not a vehicle: A pans left.
