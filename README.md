# Meridian

A peer-to-peer, browser-native, real-time raytraced open sim on a living globe. First person, field command, and planetary industry are one body at three clocks.

Design-first, now early implementation. The specs below are the contract; the first slice (**Atoll**) is being built against them.

**[Play the solo demo](https://blakelapierre.github.io/meridian/tools/view/index.html)** in your browser. It runs on desktop and touch devices. No public lighthouse is configured right now (`content/lighthouse.json` has `url: null`), so the demo plays solo and says "multiplayer server offline". Add `?lighthouse=wss://...` to meet players through a lighthouse you run, or `?lighthouse=off` to force solo. For a local multiplayer setup, use `npm start`. See [docs/lighthouse.md](docs/lighthouse.md).

On the page: **Reset** (top right) forgets everything saved on this device (identity, world, tour, settings) and starts a new session; the fullscreen button sits next to it where the browser supports it. On a phone, drag the right side to look, pinch to pull the camera in or out, two-finger drag to orbit, and **V View** toggles first/third person, the same as the wheel, right-drag and V on desktop. If WebGL fails, a red banner says why and the slower CPU picture is used.

## Status

Pre-alpha. The Atoll slice is playable solo in the browser; multiplayer, progression, and most systems are still in progress.

| Area | State |
|---|---|
| Specs (`docs/`) | Written and locked for the Atoll slice |
| `src/` | About 10,100 lines of browser JS across 86 modules: engine port (raycaster, N-body tick), sim (crust brush and chunk hash, strike, damage, shots and certs, op log, support/collapse, hearth/corpse), net (identity, room, positions, shots, terrain, archive), render (software and WebGL2 ray pass) |
| `tools/` | Dev static server, signaling "lighthouse", launcher page, and browser harnesses (`view`, `link`, `dig`, `shot`, `archive`, `bench`, `scale`) |
| Tests | 250 Node tests; 246 pass. The 4 two-browser WebRTC tests report **KNOWN-BLOCKED** where the machine's WebRTC policy stops peer data channels (a probe checks first), and run where it does not (as of 31 Oct 2026) |
| Network phases | P0 Link and parts of P2 (signed, witnessed shots) and P3 (dig op hash) are exercised by browser tests; nothing beyond one island yet |

## Run it

```sh
npm install
npm test                      # unit + browser tests; finds /usr/bin/google-chrome or chromium
CHROME=/path/to/chrome npm test   # use a specific Chrome (MERIDIAN_CHROME also works)
MERIDIAN_P2P=1 npm test       # force the two-browser WebRTC tests even if the probe says blocked
npm run scale:smoke           # 4 solo clients, own static server, no lighthouse (~1 min)
npm start                     # dev server on :8080, signaling on :8787
```

`npm start` is the only process. It serves files on port 8080 and the lighthouse on `ws://127.0.0.1:8787`. Open [http://127.0.0.1:8080/](http://127.0.0.1:8080/) for what this build should show, and how to tell a pass from a fail. Neither socket decides a hit, a dig, or a death.

## Solo, offline, and multiplayer

- **Solo / offline:** with no lighthouse the page plays solo: island, digging, building and the AI all work. The corner note "multiplayer server offline" links to [what `?lighthouse=` does](docs/lighthouse.md#the-lighthouse-parameter).
- **Networking (v3):** a lighthouse only introduces peers; play then runs peer to peer over WebRTC. See [docs/net-v3.md](docs/net-v3.md) for the current protocol.
- **Phone controls:** left stick moves (push fully to sprint), drag the right side to look, tap to fire or dig, plus Jump, Crouch, Use, Tool, Map and Info buttons. All are listed in [docs/keymap.md](docs/keymap.md#touch).
- **First run:** a short how-to-play card opens once (desktop or touch tips); the **?** button in the corner reopens it. `?onboard=0` hides it.

## Test pages and hooks

- `tools/scale/index.html`: scaling bench. Grows from 2 to 50 clients (one per passed level) as same-origin iframes, each with its own `?ns=` and a seeded wander bot; stops on the first failure. Thumbnails paint at 1 fps, click one to promote it to the large pane; the header toggles the main pane between bot and manual, and exports JSON. Headless: `node tools/scale/run.mjs --max 50 --out scale.json [--lighthouse wss://...]`, or `npm run scale:smoke` (`--solo --max 4`: starts its own server, forces solo, checks movement). Without a lighthouse (and working WebRTC) it checks movement only; with one it also checks every client sees min(n-1, 8) peers within the pose budget (`--budget`, metres).
- View URL params: `?ns=<name>` gives the page its own storage namespace and player identity; `?bot=<seed>` runs the wander bot; `?paintfps=1` caps drawing (sim and net stay full speed).
- `window.meridianProbe` (read-only, for benches): `id() pose() remotes() links() net() fps() errors() terrain() fov() bot()`, plus `setBot(on)`, `setPaintFps(n)`, `dig(strokes, pitch)` and `reset()`.

## Docs

- [Concept](docs/concept.md) — fantasy, pillars, and what is inherited from Asheron's Call, Wurm Online, Savage, Natural Selection, Counter-Strike, Team Fortress 2, Total Annihilation, and Beyond All Reason.
- [Game spec](docs/game.md) — player-facing rules, numbers, and the Atoll slice.
- [WebRTC spec](docs/implementation-webrtc.md) — how peers agree. Packets, quorum, and the op log.
- [Engine basis](docs/engine.md) — the nbody-raycaster commit that is the renderer and the physics.
- [Engineering locks](docs/engineering.md) — where code goes, and how tests run.
- [Integer crust](docs/crust.md) — the dig brush and the chunk hash.
- [Keymap](docs/keymap.md) — every key and touch control.
- [Networking v3](docs/net-v3.md) and [lighthouse](docs/lighthouse.md).
- [Keepers](docs/keepers.md) — the headless archive, and what its operator earns.
- [Atoll](content/atoll.json) — the island, in centimeters.

On conflict: the concept wins on fantasy, the game spec wins on rules, the crust doc wins on voxels, the engine doc wins on the renderer and the integrator, the engineering doc wins on layout and tests, the WebRTC spec wins on bytes.

## Support the project

Funding options (GitHub Sponsors and others) are being set up. This section will link to them once they are live. Until then, stars, issues, and review of the [WebRTC spec](docs/implementation-webrtc.md) help the most.

License: [MIT](LICENSE).

Public repository: https://github.com/blakelapierre/meridian
