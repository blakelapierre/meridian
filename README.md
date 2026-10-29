# Meridian

A peer-to-peer, browser-native, real-time raytraced open sim on a living globe. First person, field command, and planetary industry are one body at three clocks.

These are design documents, not a client. Nothing in this repository is implemented yet.

- [Concept](docs/concept.md) — fantasy, pillars, and what is inherited from Asheron's Call, Wurm Online, Savage, Natural Selection, Counter-Strike, and Total Annihilation.
- [Game spec](docs/game.md) — player-facing rules, numbers, and the Atoll slice.
- [WebRTC spec](docs/implementation-webrtc.md) — how peers agree. Packets, quorum, and the op log.
- [Engineering locks](docs/engineering.md) — raster slice, kinematic capsule, where code goes, how tests run.
- [Integer crust](docs/crust.md) — the dig brush and the chunk hash.
- [Keymap](docs/keymap.md)
- [Atoll](content/atoll.json) — the island, in centimeters.

On conflict: the concept wins on fantasy, the game spec wins on rules, the crust doc wins on voxels, the engineering doc wins on how the slice is built, the WebRTC spec wins on bytes.

License: [MIT](LICENSE).

Public repository: https://github.com/blakelapierre/meridian
