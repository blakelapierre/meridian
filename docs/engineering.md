# MERIDIAN
## Engineering locks (pre-implementation)

Decisions that have to be true before the first client commit. Player rules stay in [game.md](game.md). Packets stay in [implementation-webrtc.md](implementation-webrtc.md). The island numbers are [content/atoll.json](../content/atoll.json). The dig brush is [crust.md](crust.md). Keys are [keymap.md](keymap.md).

Nothing in this repository is implemented.

On conflict about **how the slice is built**, this document wins. It does not override a damage number or a packet field.

---

## 1. What the first client is allowed to be

Raster. A capsule, the Atoll boxes, a hole, one sun direction, Lambert if you want a color. The sea is the edge of the disc in `content/atoll.json`.

**Forbidden until every Atoll acceptance test in game.md §18.3 is passing:**

- Ray queries, path tracing, software ray-marched shadows, reflections, ReSTIR
- A cube-sphere or icosphere planet, virtual texturing, impostor crowds
- Rapier or any other rigid-body engine
- Debris that is not "the piece is gone"
- WebGPU as a requirement. WebGL2 is enough. WebGPU is allowed only as a raster backend.

Hybrid ray tracing remains the concept's renderer. It is not this milestone. The GPU paragraph in the WebRTC spec describes that later renderer.

Camera-relative float32 for the GPU. The sim does not store render precision. Feet and voxels are integers, per [crust.md](crust.md).

SharedArrayBuffer is optional. If a worker needs it, the dev server sends `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` from that commit onward. Do not block the first pawn on isolation headers.

## 2. Physics

The body is a **kinematic capsule** with the speeds, accel, and stop-window in game.md §4.2. Gravity is radial in the function, even though Atoll's up is almost constant: accelerate toward the planet center, then express the move in the tangent frame.

No dynamic rigid bodies in the slice. A falling player is the capsule. A collapsed wall is an op that removes the piece.

## 3. Where code will go

Do not invent a second layout when implementation starts.

```text
src/sim/        pure TypeScript. No DOM, no WebRTC, no WebGL. Importable from Node.
src/content/    JSON catalogs. Atoll already lives in /content until it moves here unchanged.
src/net/        browser only. RTCPeerConnection and the codec.
src/render/     raster view of sim state. Forbidden list in §1.
src/app/        wires the three. The only place that touches the canvas and the socket.
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

Feature flag **`localEdits`**: until the op log (P3) exists, a hole may exist in one process only, and only when this flag is on. The default is off. A build that shows a hole with the flag off and no cert is wrong.

## 5. Frame used by content

`content/atoll.json` is **tangent centimeters**, x east, y north, z up. The origin is the cell anchor on the surface. This is not the ECEF triple on the wire.

The net layer converts at the boundary. Sim tests of Atoll run in the tangent frame and never construct a planet matrix. P8 replaces the cell id `atoll-0` with the hex index. The JSON field `frame` is `tangent-cm-z-up` until that happens.

Entity position is the **capsule feet**. Boxes in content are **half-open**: a point is inside when `min <= p < max` on every axis, so shared faces are not double walls.

## 6. Sun

`tick →` sun direction is a pure function, 72 real minutes per cairn-day, dawn and dusk 6 minutes. A debug multiplier may speed it and **MUST** default to 1. The slice does not cast ray-traced shadows. A directional color is enough to see that the solar fin's number tracks elevation.

## 7. License

[MIT](../LICENSE). Copyright Blake La Pierre. Docs and future code ship under it. A different license is a repo change, not a file header someone adds beside it.

## 8. Order of the first commits

1. `src/sim` movement test, no window.
2. Damage-number test.
3. Crust brush and chunk hash.
4. Load `content/atoll.json` and check the three distances.
5. A raster view of the disc, the compound boxes, and the capsule.
6. `tools/signal` and one unreliable position between two browsers.

Not before step 6: weapons beyond the damage test, the buy menu, the hearth, the fin, ray tracing, a second island.

## 9. Keys

[keymap.md](keymap.md). Hands are FPS: A and D strafe. They do not turn the body. Look is the mouse. A later chase-cam vehicle, if one exists, turns left on A. The war table is not a vehicle: A pans left.
