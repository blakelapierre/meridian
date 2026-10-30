# Meridian

A peer-to-peer, browser-native, real-time raytraced open sim on a living globe. First person, field command, and planetary industry are one body at three clocks.

Design-first, now early implementation. The specs below are the contract; the first slice (**Atoll**) is being built against them.

## Status

Pre-alpha. Not a playable game yet.

| Area | State |
|---|---|
| Specs (`docs/`) | Written and locked for the Atoll slice |
| `src/` | About 2,800 lines of browser JS: engine port (raycaster, N-body tick), sim (crust brush and chunk hash, strike, damage, shots and certs, op log, support/collapse, hearth/corpse), net (identity, room, positions, shots, terrain), render (software and WebGL2 ray pass) |
| `tools/` | Dev static server, signaling "lighthouse", and browser harnesses (`view`, `link`, `dig`, `shot`) |
| Tests | 57 Node tests; 52 unit tests pass, 5 two-browser tests need headless Chromium and skip without it |
| Network phases | P0 Link and parts of P2 (signed, witnessed shots) and P3 (dig op hash) are exercised by browser tests; nothing beyond one island yet |

## Run it

```sh
npm install
npm test                      # unit tests; browser tests skip without Chromium
MERIDIAN_CHROME=/path/to/chrome-headless-shell npm test   # include the browser tests
npm start                     # dev server on :8080, signaling on :8787
```

## Docs

- [Concept](docs/concept.md) — fantasy, pillars, and what is inherited from Asheron's Call, Wurm Online, Savage, Natural Selection, Counter-Strike, and Total Annihilation.
- [Game spec](docs/game.md) — player-facing rules, numbers, and the Atoll slice.
- [WebRTC spec](docs/implementation-webrtc.md) — how peers agree. Packets, quorum, and the op log.
- [Engine basis](docs/engine.md) — the nbody-raycaster commit that is the renderer and the physics.
- [Engineering locks](docs/engineering.md) — where code goes, and how tests run.
- [Integer crust](docs/crust.md) — the dig brush and the chunk hash.
- [Keepers](docs/keepers.md) — the headless archive, and what its operator earns.
- [Atoll](content/atoll.json) — the island, in centimeters.

On conflict: the concept wins on fantasy, the game spec wins on rules, the crust doc wins on voxels, the engine doc wins on the renderer and the integrator, the engineering doc wins on layout and tests, the WebRTC spec wins on bytes.

## Support the project

Funding options (GitHub Sponsors and others) are being set up. This section will link to them once they are live. Until then, stars, issues, and review of the [WebRTC spec](docs/implementation-webrtc.md) help the most.

License: [MIT](LICENSE).

`npm start` is the only process. It serves files on port 8080 and the lighthouse on `ws://127.0.0.1:8787`. Open [http://127.0.0.1:8080/](http://127.0.0.1:8080/) for what this build should show, and how to tell a pass from a fail. Neither socket decides a hit, a dig, or a death.

Public repository: https://github.com/blakelapierre/meridian
