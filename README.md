# Meridian

A peer-to-peer, browser-native, real-time raytraced open sim on a living globe. First person, field command, and planetary industry are one body at three clocks.

These are design documents, not a client. Nothing in this repository is implemented yet.

- [Concept](docs/concept.md) — fantasy, pillars, and what is inherited from Asheron's Call, Wurm Online, Savage, Natural Selection, Counter-Strike, and Total Annihilation.
- [Game spec](docs/game.md) — player-facing rules, numbers, and the Atoll slice.
- [WebRTC spec](docs/implementation-webrtc.md) — how peers agree. Packets, quorum, and the op log.
- [Engine basis](docs/engine.md) — the nbody-raycaster commit that is the renderer and the physics.
- [Engineering locks](docs/engineering.md) — where code goes, and how tests run.
- [Integer crust](docs/crust.md) — the dig brush and the chunk hash.
- [Keymap](docs/keymap.md)
- [Atoll](content/atoll.json) — the island, in centimeters.

On conflict: the concept wins on fantasy, the game spec wins on rules, the crust doc wins on voxels, the engine doc wins on the renderer and the integrator, the engineering doc wins on layout and tests, the WebRTC spec wins on bytes.

License: [MIT](LICENSE).

`npm start` is the only process. It serves files on port 8080 and the lighthouse on `ws://127.0.0.1:8787`. Open [http://127.0.0.1:8080/](http://127.0.0.1:8080/) for what this build should show, and how to tell a pass from a fail. Neither socket decides a hit, a dig, or a death.

Public repository: https://github.com/blakelapierre/meridian
